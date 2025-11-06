import "@stdlib/deploy";
import "@stdlib/ownable";
import "@stdlib/crypto";
import "@stdlib/time";

struct PaymentRequest {
    buyer: Address;
    seller: Address;
    amount: Int;
    buyerPaysCommission: Bool;
    optionalCommissionWallet: Address?;
}

struct SignedPaymentRequest {
    request: PaymentRequest;
    deadline: Int;
    signature: Slice;
    buyerPubKey: Int;
}

message ProcessPayment {
    signed: SignedPaymentRequest;
}

message UpdateCommission {
    newBps: Int;
}

message UpdateOptionalShare {
    wallet: Address;
    shareBps: Int;
}

message RescueTon {
    destination: Address;
}

contract PaymentProcessor with Deployable, Ownable {
    const ERROR_INVALID_SELLER: Int = 401;
    const ERROR_INVALID_AMOUNT: Int = 402;
    const ERROR_SIGNATURE_EXPIRED: Int = 410;
    const ERROR_SIGNATURE_INVALID: Int = 411;
    const ERROR_INVALID_COMMISSION: Int = 420;

    mainCommissionWallet: Address;
    platformCommissionBps: Int = 25;
    nonces: map<Address, Int> = map();
    optionalShares: map<Address, Int> = map();

    init(owner: Address, commissionWallet: Address) {
        self.owner = owner;
        self.mainCommissionWallet = commissionWallet;
    }

    receive(msg: UpdateCommission) with Ownable {
        require(msg.newBps >= 0 && msg.newBps <= 10_000, ERROR_INVALID_COMMISSION);
        self.platformCommissionBps = msg.newBps;
    }

    receive(msg: UpdateOptionalShare) with Ownable {
        if (msg.shareBps == 0) {
            delete self.optionalShares[msg.wallet];
        } else {
            require(msg.shareBps >= 0 && msg.shareBps <= 10_000, ERROR_INVALID_COMMISSION);
            self.optionalShares[msg.wallet] = msg.shareBps;
        }
    }

    receive(msg: RescueTon) with Ownable {
        send(SendParameters{
            to: msg.destination,
            value: myBalance() - context().value,
            bounce: false,
            body: null
        });
    }

    receive(msg: ProcessPayment) {
        let signed = msg.signed;
        let req = signed.request;

        require(req.buyer != req.seller, ERROR_INVALID_SELLER);
        require(req.amount > 0, ERROR_INVALID_AMOUNT);
        require(now() <= signed.deadline, ERROR_SIGNATURE_EXPIRED);
        require(context().sender == req.buyer, ERROR_SIGNATURE_INVALID);

        let nonce = self.nonces.get(req.buyer).unwrapOrElse(|| 0);
        require(signed.verify(self.platformCommissionBps, nonce), ERROR_SIGNATURE_INVALID);

        let commission = req.amount * self.platformCommissionBps / 10_000;
        let totalPay = req.buyerPaysCommission ? req.amount + commission : req.amount;
        require(context().value >= totalPay, ERROR_INVALID_AMOUNT);

        self.nonces[req.buyer] = nonce + 1;

        let payoutAmount = req.buyerPaysCommission ? req.amount : req.amount - commission;
        send(SendParameters{ to: req.seller, value: payoutAmount, bounce: false, body: null });

        if (commission > 0) {
            let optionalAmount = req.optionalCommissionWallet.match(
                fun (wallet: Address) => {
                    let share = self.optionalShares.get(wallet).unwrapOrElse(|| 0);
                    return commission * share / 10_000;
                },
                fun () => 0
            );

            let platformAmount = commission - optionalAmount;

            if (platformAmount > 0) {
                send(SendParameters{ to: self.mainCommissionWallet, value: platformAmount, bounce: false, body: null });
            }

            req.optionalCommissionWallet.match(
                fun (wallet: Address) => {
                    if (optionalAmount > 0) {
                        send(SendParameters{ to: wallet, value: optionalAmount, bounce: false, body: null });
                    }
                },
                fun () => {}
            );
        }

        let refund = context().value - totalPay;
        if (refund > 0) {
            send(SendParameters{ to: req.buyer, value: refund, bounce: false, body: null });
        }
    }

    get fun previewPayment(amount: Int, buyerPaysCommission: Bool): (Int, Int) {
        let commission = amount * self.platformCommissionBps / 10_000;
        let total = buyerPaysCommission ? amount + commission : amount;
        return (commission, total);
    }

    get fun nonceOf(buyer: Address): Int {
        return self.nonces.get(buyer).unwrapOrElse(|| 0);
    }
}

fun SignedPaymentRequest.totalPay(bps: Int): Int {
    let commission = self.request.amount * bps / 10_000;
    return self.request.buyerPaysCommission ? self.request.amount + commission : self.request.amount;
}

fun SignedPaymentRequest.verify(bps: Int, nonce: Int): Bool {
    let builder = beginCell();
    builder.storeAddress(self.request.buyer);
    builder.storeAddress(self.request.seller);
    builder.storeUint(self.request.amount, 128);
    builder.storeBit(self.request.buyerPaysCommission);
    let optionalHash = self.request.optionalCommissionWallet.match(
        fun (wallet: Address) => wallet.hash(),
        fun () => 0
    );
    builder.storeUint(optionalHash, 256);
    builder.storeUint(self.deadline, 64);
    builder.storeUint(nonce, 64);
    builder.storeUint(bps, 32);

    let hash = builder.endCell().hash();
    return ed25519_verify(self.signature, hash, self.buyerPubKey);
}
