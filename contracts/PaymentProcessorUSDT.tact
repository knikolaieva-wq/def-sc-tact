import "@stdlib/ownable";
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
    forward_payload: Cell?;
}

message(0x7362d09c) JettonTransferNotification {
    queryId: Int as uint64 = 0;
    amount: Int as coins;
    sender: Address;
    forwardPayload: Cell;
}

message(0xd53276db) Excess {
    queryId: Int as uint64;
}

message(0x42c20f7a) Transfer {
    req: PaymentRequest;
    deadline: Int;
}

// ===== Internal messages =====

message(0xeeab28d0) SetPlatformCommissionBps {
    newBps: Int;
}
message(0xe225cbda) WithdrawAll {
    to: Address;
}
message(0xc2b41d43) SetOwner {
    newOwner: Address;
}
message(0xccd3ca15) SetJettonWallet {
    newWallet: Address;
}

// ===== Structs =====

struct PaymentRequest {
    buyer: Address;
    seller: Address;
    amount: Int;
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
    // === Core logic, same as TON version ===
    owner: Address;
    platformCommissionBps: Int;            // 0..10000
    mainCommissionWallet: Address;

    partnerCollection: Address;            // IDefNFT collection
    partnerShareBps: map<Address, Int>;

    nonces: map<Address, Int>;             // per-buyer nonce

    // === Jetton config ===
    jettonMaster: Address;                 // Jetton Master contract address
    jettonWallet: Address;                 // jetton wallet owned by this contract

    init(
        owner: Address,
        mainCommissionWallet: Address,
        partnerCollection: Address,
        jettonMaster: Address
    ) {
        self.owner = owner;
        self.mainCommissionWallet = mainCommissionWallet;
        self.partnerCollection = partnerCollection;
        self.platformCommissionBps = 25;   // 0.25%
        self.jettonMaster = jettonMaster;
        self.jettonWallet = myAddress();
    }

    // ==== Internal helpers ====
    inline fun onlyCollection() {
        throwIf(ExitCodeNotCollection, sender() != self.partnerCollection);
    }

    inline fun onlyJettonWallet() {
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
    
    receive(m: SetJettonWallet) {
        self.requireOwner();
        self.jettonWallet = m.newWallet;
    }

    // withdraw all TON (not jetton) from the contract
    receive(w: WithdrawAll) {
        self.requireOwner();
        let to = w.to;
        let bal = myBalance();
        let MIN_KEEP: Int = 10_000_000; // ~0.01 TON
        throwIf(BelowReserve, !(bal > MIN_KEEP));
        nativeReserve(MIN_KEEP, 0);
        send(SendParameters{ to: to, value: 0, mode: SendRemainingBalance });
    }

    // ============ Jetton payment handling ============
    receive(msg: JettonTransferNotification) {
        // 1. Verify the notification came from our jetton wallet
        self.onlyJettonWallet();

        // 2. Parse business payload from forwardPayload
        let slice = msg.forwardPayload.beginParse();
        let t: Transfer = Transfer.fromSlice(slice);
        let req = t.req;

        // 3. Basic validation
        throwIf(InvalidAmountValidation, req.amount <= 0);
        throwIf(InvalidSellerValidation, req.seller == req.buyer);
        throwIf(SignatureExpired, now() > t.deadline);

        // Jetton sender must be the real buyer
        throwIf(InvalidSignature, msg.sender != req.buyer);

        // 4. Nonce check & consume
        let currentNonce = self.nonces.get(req.buyer);
        let nextNonce: Int = (currentNonce != null) ? (currentNonce!! + 1) : 1;
        self.nonces.set(req.buyer, nextNonce);

        // 5. How many jettons actually arrived
        let incoming: Int = msg.amount;

        // 6. Commission and jetton sums
        let commission = (req.amount * self.platformCommissionBps) / 10000;
        let sellerValue = req.buyerPaysCommission ? req.amount : (req.amount - commission);
        let totalRequired = req.buyerPaysCommission ? (req.amount + commission) : req.amount;

        throwIf(InvalidTotalAmountValidation, incoming < totalRequired);

        let commissionValue: Int = commission > 0 ? commission : 0;
        let optionalPart: Int = 0;

        // 7. Optional partner commission
        if (req.optionalCommissionWallet != null) {
            let optionalWallet = req.optionalCommissionWallet!!;
            let shareOpt = self.partnerShareBps.get(optionalWallet);
            let shareBps = shareOpt != null ? shareOpt!! : 0;

            if (shareBps > 0 && shareBps <= 10000) {
                optionalPart = (commission * shareBps) / 10000;
                commissionValue -= optionalPart;
            }
        }
        // 8. Jetton payouts
        let jw = self.jettonWallet;
        let gasPerTransfer: Int = ton("0.05");
        let gasPerIncrementation: Int = ton("0.005");

        // 8.1. Pay seller
        send(SendParameters{
            to: jw,
            value: gasPerTransfer,

            bounce: true,
            mode: SendPayGasSeparately,
            body: TokenTransfer{
                queryId: 0,
                amount: sellerValue,
                destination: req.seller,
                response_destination: myAddress(),
                custom_payload: null,
                forward_ton_amount: 0,
                forward_payload: null
            }.toCell()
        });

        // 8.2. Platform
        if (commissionValue > 0) {
            send(SendParameters{
                to: jw,
                value: gasPerTransfer,
                bounce: true,
                mode: SendPayGasSeparately,
                body: TokenTransfer{
                    queryId: 1,
                    amount: commissionValue,
                    destination: self.mainCommissionWallet,
                    response_destination: myAddress(),
                    custom_payload: null,
                    forward_ton_amount: 0,
                    forward_payload: null
                }.toCell()
            });
        }

        // 8.3. Partner part + notification to the collection
        if (optionalPart > 0 && req.optionalCommissionWallet != null) {
            // Jetton to partner
            let optionalWallet = req.optionalCommissionWallet!!;
            send(SendParameters{
                to: jw,
                value: gasPerTransfer,
                bounce: true,
                mode: SendPayGasSeparately,
                body: TokenTransfer{
                    queryId: 2,
                    amount: optionalPart,
                    destination: optionalWallet,
                    response_destination: myAddress(),
                    custom_payload: null,
                    forward_ton_amount: 0,
                    forward_payload: null
                }.toCell()
            });

            // Notify partnerCollection (TON)
            send(SendParameters{
                to: self.partnerCollection,
                value: gasPerIncrementation,
                mode: SendPayGasSeparately,
                bounce: true,
                body: IncrementSuccessfulTx{
                    wallet: optionalWallet
                }.toCell()
            });
        }
    }

    // Inside JettonPaymentProcessor contract
    receive(_: Excess) {
        // silently accept extra gas
        // nothing else to do
    }

    // ============ Partners ============

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
        return 2;
    }
}