import "@stdlib/ownable";
import "@stdlib/deploy";
import "./Messages.tact";
import "./Errors.tact";

// ===== Jetton messages (TEP-74) =====

message(0xf8a7ea5) TokenTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    response_destination: Address;
    custom_payload: Cell?;
    forward_ton_amount: Int as coins;
    forward_payload: Slice as remaining;
}

message(0x7362d09c) JettonTransferNotification {
    queryId: Int as uint64 = 0;
    amount: Int as coins;
    sender: Address;
    forwardPayload: Slice as remaining;
}

// ===== Helper for wallet calculation (из доки Tact) =====

struct JettonWalletData {
    status: Int as uint4;          // ВАЖНО: этого поля не было раньше
    balance: Int as coins;
    ownerAddress: Address;
    jettonMasterAddress: Address;
}

fun calculateJettonWalletAddress(
    ownerAddress: Address,
    jettonMasterAddress: Address,
    jettonWalletCode: Cell,
): Address {
    let initData = JettonWalletData{
        status: 0,
        balance: 0,
        ownerAddress: ownerAddress,
        jettonMasterAddress: jettonMasterAddress
    };

    return contractAddress(StateInit{
        code: jettonWalletCode,
        data: initData.toCell()
    });
}
// ===== Messages =====

message(0x42c20f7a) Transfer {
    req: PaymentRequest;
    deadline: Int;
}

message(0xeeab28d0) SetPlatformCommissionBps {
    newBps: Int;
}
message(0xe225cbda) WithdrawAll {
    to: Address;
}
message(0xc2b41d43) SetOwner {
    newOwner: Address;
}

// ===== Structs =====

struct PaymentRequest {
    buyer: Address;
    seller: Address;
    amount: Int as coins;          // в минимальных единицах Jetton
    buyerPaysCommission: Bool;
    optionalCommissionWallet: Address?;
}

struct Preview {
    commission: Int;
    totalPay: Int;
}

struct ConfigResponse {
    owner: Address;
    mainCommissionWallet: Address;
    nftCollection: Address;
    platformCommissionBps: Int;
    jettonMaster: Address;
    jettonWallet: Address;
}

// ===== Contract =====

contract JettonPaymentProcessor with Ownable {

    // === базовая логика, как в Ton-версии ===
    owner: Address;
    platformCommissionBps: Int;            // 0..10000
    mainCommissionWallet: Address;

    partnerCollection: Address;            // IDefNFT коллекция
    partnerShareBps: map<Address, Int>;

    nonces: map<Address, Int>;             // per-buyer nonce

    // === Jetton config ===
    jettonMaster: Address;
    jettonWalletCode: Cell;
    jettonWallet: Address;                 // jetton wallet этого контракта

    init(
        owner: Address,
        mainCommissionWallet: Address,
        partnerCollection: Address,
        jettonMaster: Address,
        jettonWalletCode: Cell
    ) {
        self.owner = owner;
        self.mainCommissionWallet = mainCommissionWallet;
        self.partnerCollection = partnerCollection;
        self.platformCommissionBps = 25;   // 0.25%

        self.jettonMaster = jettonMaster;
        self.jettonWalletCode = jettonWalletCode;

        // считаем адрес Jetton-кошелька этого контракта
        self.jettonWallet = calculateJettonWalletAddress(
            myAddress(),
            jettonMaster,
            jettonWalletCode
        );
    }

    // ==== Internal helpers ====
    inline fun onlyCollection() {
        throwIf(ExitCodeNotCollection, sender() != self.partnerCollection);
    }

    inline fun onlyJettonWallet() {
        // обязательно заведи в Errors.tact код, например ExitCodeNotJettonWallet
        throwIf(ExitCodeNotJettonWallet, sender() != self.jettonWallet);
    }

    // ============ Admin ============
    receive(m: SetOwner) {
        self.requireOwner();
        self.owner = m.newOwner;
    }

    receive(m: SetPlatformCommissionBps) {
        self.requireOwner();
        throwIf(InvalidCommissionBps, !(m.newBps >= 0 && m.newBps <= 10000));
        self.platformCommissionBps = m.newBps;
    }

    // выводим весь TON (не Jetton!) с контракта
    receive(w: WithdrawAll) {
        self.requireOwner();
        let to = w.to;
        let bal = myBalance();
        let MIN_KEEP: Int = 10_000_000; // ~0.01 TON
        throwIf(BelowReserve, !(bal > MIN_KEEP));
        nativeReserve(MIN_KEEP, 0);
        send(SendParameters{ to: to, value: 0, mode: SendRemainingBalance });
    }

    // ============ Приём платежа в Jetton ============

    /// Входной поток:
    /// buyer -> свой jetton wallet: TokenTransfer{ amount, destination = наш jettonWallet,
    ///                                            forward_payload = Transfer{ req, deadline }.toCell() }
    /// наш jettonWallet -> этот контракт: JettonTransferNotification{ amount, sender = buyer, forwardPayload }
    receive(msg: JettonTransferNotification) {
        // 1. Проверяем, что нотификация пришла от нашего кошелька нужного Jetton
        self.onlyJettonWallet();

        // 2. Парсим наш "бизнес-пейлоад" из forwardPayload
        let t: Transfer = Transfer.fromSlice(msg.forwardPayload);
        let req = t.req;

        // 3. Базовые проверки
        throwIf(InvalidAmountValidation, req.amount <= 0);
        throwIf(InvalidSellerValidation, req.seller == req.buyer);
        throwIf(SignatureExpired, now() > t.deadline);

        // sender Jetton'ов — это настоящий покупатель
        throwIf(InvalidSignature, msg.sender != req.buyer);

        // 4. Nonce check & consume
        let currentNonce = self.nonces.get(req.buyer);
        let nextNonce: Int = (currentNonce != null) ? (currentNonce!! + 1) : 1;
        self.nonces.set(req.buyer, nextNonce);

        // 5. Сколько Jetton реально пришло на наш кошелёк
        let incoming: Int = msg.amount;

        // 6. Комиссия, суммы в Jetton
        let commission = (req.amount * self.platformCommissionBps) / 10000;
        let sellerValue = req.buyerPaysCommission ? req.amount : (req.amount - commission);
        let totalRequired = req.buyerPaysCommission ? (req.amount + commission) : req.amount;

        throwIf(InvalidTotalAmountValidation, incoming < totalRequired);

        let commissionValue: Int = commission > 0 ? commission : 0;
        let optionalPart: Int = 0;

        // 7. Опциональная партнёрская комиссия
        if (req.optionalCommissionWallet != null) {
            let optionalWallet = req.optionalCommissionWallet!!;
            let shareOpt = self.partnerShareBps.get(optionalWallet);
            let shareBps = shareOpt != null ? shareOpt!! : 0;

            if (shareBps > 0 && shareBps <= 10000) {
                optionalPart = (commission * shareBps) / 10000;
                commissionValue = commissionValue - optionalPart;
            }
        }

        // 8. Рассылаем Jetton'ы дальше через наш jettonWallet
        let jw = self.jettonWallet;

        // Газ на каждую отправку Jetton (подбери под себя; главное — чтобы
        // forward_ton_amount при исходном Transfer хватило и на нотификацию, и на эти вызовы)
        let GAS_PER_TRANSFER: Int = ton("0.05");

        // 8.1. Выплата продавцу
        send(SendParameters{
            to: jw,
            value: GAS_PER_TRANSFER,
            bounce: true,
            mode: SendPayGasSeparately,
            body: TokenTransfer{
                queryId: 0,
                amount: sellerValue,
                destination: req.seller,
                response_destination: myAddress(),
                custom_payload: null,
                forward_ton_amount: 0,
                forward_payload: emptySlice()
            }.toCell()
        });

        // 8.2. Платформа
        if (commissionValue > 0) {
            send(SendParameters{
                to: jw,
                value: GAS_PER_TRANSFER,
                bounce: true,
                mode: SendPayGasSeparately,
                body: TokenTransfer{
                    queryId: 1,
                    amount: commissionValue,
                    destination: self.mainCommissionWallet,
                    response_destination: myAddress(),
                    custom_payload: null,
                    forward_ton_amount: 0,
                    forward_payload: emptySlice()
                }.toCell()
            });
        }

        // 8.3. Партнёрская часть + нотификация в коллекцию
        if (optionalPart > 0) {
            // Jetton партнёру
            send(SendParameters{
                to: jw,
                value: GAS_PER_TRANSFER,
                bounce: true,
                mode: SendPayGasSeparately,
                body: TokenTransfer{
                    queryId: 2,
                    amount: optionalPart,
                    destination: req.optionalCommissionWallet!!,
                    response_destination: myAddress(),
                    custom_payload: null,
                    forward_ton_amount: ton("0.005"),
                    forward_payload: emptySlice()
                }.toCell()
            });

            // уведомление в partnerCollection (TON)
            send(SendParameters{
                to: self.partnerCollection,
                value: ton("0.005"),
                mode: SendPayGasSeparately,
                bounce: true,
                body: IncrementSuccessfulTx{
                    wallet: req.optionalCommissionWallet!!
                }.toCell()
            });
        }
    }

    // ============ Партнёры ============

    receive(msg: RegisterPartnerShare) {
        self.onlyCollection();

        if (msg.shareBps == null || msg.shareBps!! <= 0) {
            self.partnerShareBps.set(msg.wallet, null);
            return;
        }

        self.partnerShareBps.set(msg.wallet, msg.shareBps);
    }

    receive(msg: UnregisterPartnerShare) {
        self.onlyCollection();
        self.partnerShareBps.set(msg.wallet, null);
    }

    // ============ Views ============

    get fun getConfig(): ConfigResponse {
        return ConfigResponse{
            owner: self.owner,
            mainCommissionWallet: self.mainCommissionWallet,
            nftCollection: self.partnerCollection,
            platformCommissionBps: self.platformCommissionBps,
            jettonMaster: self.jettonMaster,
            jettonWallet: self.jettonWallet
        };
    }

    get fun previewPayment(amount: Int, buyerPaysCommission: Bool): Preview {
        let commission = (amount * self.platformCommissionBps) / 10000;
        let totalPay = buyerPaysCommission ? (amount + commission) : amount;
        return Preview{ commission: commission, totalPay: totalPay };
    }

    get fun nonceOf(account: Address): Int {
        let n = self.nonces.get(account);
        return (n != null) ? n!! : 0;
    }

    get fun get_version(): Int {
        return 1;
    }
}