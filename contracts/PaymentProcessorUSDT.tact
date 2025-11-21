import "@stdlib/ownable";
import "./Messages.tact";
import "./Errors.tact";
import "./common/messages.tact";

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
    amount: Int; // in jettons (MUSDT smallest units)
    buyerPaysCommission: Bool;
    optionalCommissionWallet: Address?; // None if not used
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
    musdtWallet: Address;
}

struct TransferPayload {
    req: PaymentRequest;
    deadline: Int;
}

contract PaymentProcessorUSDT with Ownable {

    owner: Address;
    platformCommissionBps: Int; // 0..10000
    mainCommissionWallet: Address;

    partnerCollection: Address; // contract address implementing IDefNFT
    partnerShareBps: map<Address, Int>;

    // Simple per-buyer nonce storage
    nonces: map<Address, Int>;

    // MUSDT jetton wallet owned by this contract (pre-computed from MUSDT master)
    musdtWallet: Address;

    // Outgoing jetton transfers need enough TON attached for forward fees and wallet staticTax
    const MUSDT_MSG_VALUE: Int = ton("0.05");
    const PARTNER_NOTIFY_VALUE: Int = ton("0.005");

    init(owner: Address, mainCommissionWallet: Address, partnerCollection: Address, musdtWallet: Address) {
        self.owner = owner;
        self.mainCommissionWallet = mainCommissionWallet;
        self.partnerCollection = partnerCollection;
        self.musdtWallet = musdtWallet;
        self.platformCommissionBps = 25; // 0.25%
    }

    // ==== Internal helpers ====
    inline fun onlyCollection() {
        throwIf(ExitCodeNotCollection, sender() != self.partnerCollection);
    }

    inline fun parseForwardPayload(payload: Cell): TransferPayload {
        let s = payload.beginParse();
        let op = s.loadUint(32);
        throwIf(UnknownFunction, op != 0x42c20f7a); // Transfer opcode

        let buyer = s.loadAddress();
        let seller = s.loadAddress();
        let amount = s.loadInt(257);
        let buyerPays = s.loadBit();

        let opt = s.loadRef().beginParse();
        let rawOpt = opt.loadAddress();
        let optionalWallet: Address? = null;
        // addr_none encoded as 0b00; treat it as null
        if (rawOpt.asSlice().preloadUint(2) != 0) {
            optionalWallet = rawOpt;
        }

        let dl = s.loadRef().beginParse();
        let deadline = dl.loadInt(257);

        return TransferPayload{
            req: PaymentRequest{
                buyer: buyer,
                seller: seller,
                amount: amount,
                buyerPaysCommission: buyerPays,
                optionalCommissionWallet: optionalWallet
            },
            deadline: deadline
        };
    }

    inline fun sendMusdt(to: Address, amount: Int) {
        send(SendParameters{
            to: self.musdtWallet,
            value: self.MUSDT_MSG_VALUE,
            mode: SendPayGasSeparately,
            bounce: true,
            body: TokenTransfer{
                queryId: 0,
                amount: amount,
                destination: to,
                responseDestination: myAddress(),
                customPayload: null,
                forwardAmount: 0,
                forwardPayload: null
            }.toCell()
        });
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

    receive(w: WithdrawAll) {
        self.requireOwner();
        let to = w.to;
        let bal = myBalance();
        // Minimal balance to keep contract operational (rent + small gas headroom)
        let MIN_KEEP: Int = 10_000_000; // ~0.01 TON
        throwIf(BelowReserve, !(bal > MIN_KEEP));
        nativeReserve(MIN_KEEP, 0);
        send(SendParameters{ to: to, value: 0, mode: SendRemainingBalance });
    }

    // ============ Payment entry (MUSDT jetton) ============
    receive(n: TransferNotification) {
        // only accept notifications from our MUSDT wallet
        throwIf(InvalidSignature, sender() != self.musdtWallet);
        throwIf(UnknownFunction, n.forwardPayload == null);

        let parsed = self.parseForwardPayload(n.forwardPayload!!);
        let req = parsed.req;

        // Basic validation
        throwIf(InvalidAmountValidation, n.amount <= 0);
        throwIf(InvalidAmountValidation, req.amount <= 0);
        throwIf(InvalidSellerValidation, req.seller == req.buyer);
        throwIf(SignatureExpired, now() > parsed.deadline);
        // Jetton wallet passes origin owner in sender field
        throwIf(InvalidSignature, req.buyer != n.sender);

        // Nonce check & consume
        let currentNonce = self.nonces.get(req.buyer);
        let nextNonce: Int = (currentNonce != null) ? (currentNonce!! + 1) : 1;
        self.nonces.set(req.buyer, nextNonce);

        let incomingJettons: Int = n.amount;
        let commission = (req.amount * self.platformCommissionBps) / 10000;
        let sellerValueBase = req.buyerPaysCommission ? req.amount : (req.amount - commission);
        let commissionValueBase = commission > 0 ? commission : 0;

        // Validate that total payment covers amount (+ commission when buyer pays it)
        let totalRequired = req.buyerPaysCommission ? (req.amount + commission) : req.amount;
        throwIf(InvalidTotalAmountValidation, incomingJettons < totalRequired);
        let extra = incomingJettons - totalRequired; // treat any overpay as seller tip

        // Split commission if partner provided
        let commissionValue = commissionValueBase;
        let optionalPart: Int = 0;
        if (req.optionalCommissionWallet != null) {
            let optionalCommissionWallet = req.optionalCommissionWallet!!;
            let shareOpt = self.partnerShareBps.get(optionalCommissionWallet);
            let shareBps = shareOpt != null ? shareOpt!! : 0;

            if (shareBps > 0 && shareBps <= 10000) {
                optionalPart = (commissionValue * shareBps) / 10000;
                commissionValue -= optionalPart;
            }
        }

        let sellerValue = sellerValueBase + extra;

        // Ensure we have enough TON forwarded to cover jetton sends + partner ping
        let incomingTon: Int = context().value;
        let transfersCount: Int = 1 + (commissionValue > 0 ? 1 : 0) + (optionalPart > 0 ? 1 : 0);
        let pingValue: Int = (optionalPart > 0) ? self.PARTNER_NOTIFY_VALUE : 0;
        let tonNeeded: Int = (self.MUSDT_MSG_VALUE * transfersCount) + pingValue;
        throwIf(BelowReserve, incomingTon < tonNeeded);

        let balBefore: Int = myBalance() - incomingTon;
        let prev: Int = (balBefore > 0) ? balBefore : 0;
        nativeReserve(prev, 0); // preserve previous balance; spend incoming on outgoing msgs

        // Seller payout in MUSDT
        self.sendMusdt(req.seller, sellerValue);

        if (commissionValue > 0) {
            self.sendMusdt(self.mainCommissionWallet, commissionValue);
            if (optionalPart > 0) {
                self.sendMusdt(req.optionalCommissionWallet!!, optionalPart);

                send(SendParameters{
                    to: self.partnerCollection,
                    value: self.PARTNER_NOTIFY_VALUE,
                    mode: SendPayGasSeparately,
                    bounce: true,
                    body: IncrementSuccessfulTx{
                        wallet: req.optionalCommissionWallet!!
                    }.toCell()
                });
            }
        }
    }

    receive(msg: RegisterPartnerShare) {
        self.onlyCollection();

        // Если share <= 0 — убираем из локального реестра
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

    // Quietly accept excess refunds from jetton wallets
    receive(msg: Excesses) {
        // no-op
    }

    // ============ Views ============
    get fun getConfig(): ConfigResponse {
        return ConfigResponse{
            owner: self.owner,
            mainCommissionWallet: self.mainCommissionWallet,
            nftCollection: self.partnerCollection,
            platformCommissionBps: self.platformCommissionBps,
            musdtWallet: self.musdtWallet
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
}
