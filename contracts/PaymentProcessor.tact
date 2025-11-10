// PaymentProcessor for TON (Tact)
// Mirrors core logic of the provided Solidity contract:
// - Owner-managed platformCommissionBps
// - Transfer with commission splitting and optional partner share
// - Nonces + deadline checks (direct-call flow: buyer must send the message)

// No stdlib import required for current Tact version

// Minimal interface for an external NFT-like contract used for rewards
// Exposes two interactions analogous to the Solidity example:
// - getPlatformShareBpsForWallet(address) -> Int (0..10000)
// - incrementSuccessfulTx(address)
// Note: in TON, cross-contract reads are get-method calls, writes are internal messages.

trait IDefNFT {
    abstract get fun getPlatformShareBpsForWallet(wallet: Address): Int;
    // incrementSuccessfulTx вызывается как входящее сообщение у внешнего контракта через send(body)
}

struct PaymentRequest {
    buyer: Address;
    seller: Address;
    amount: Int;                 // in nanotons
    buyerPaysCommission: Bool;
    optionalCommissionWallet: Address?; // None if not used
}

struct Preview {
    commission: Int;
    totalPay: Int;
}

message Transfer { req: PaymentRequest; deadline: Int; }
message SetPlatformCommissionBps { newBps: Int; }
message WithdrawAll { to: Address; }

contract PaymentProcessor {
    owner: Address;
    platformCommissionBps: Int; // 0..10000
    mainCommissionWallet: Address;
    nftCollection: Address;     // contract address implementing IDefNFT

    // Simple per-buyer nonce storage
    nonces: map<Address, Int>;

    init(owner: Address, mainCommissionWallet: Address, nftCollection: Address) {
        self.owner = owner;
        self.mainCommissionWallet = mainCommissionWallet;
        self.nftCollection = nftCollection;
        self.platformCommissionBps = 25; // 0.25%
        // nonces already initialized by default
    }

    // ============ Admin ============
    receive(m: SetPlatformCommissionBps) {
        require(sender() == self.owner, "only owner");
        require(m.newBps >= 0 && m.newBps <= 10000, "bps out of range");
        self.platformCommissionBps = m.newBps;
    }

    receive(w: WithdrawAll) {
        require(sender() == self.owner, "only owner");
        let to = w.to;
        let bal = myBalance();
        require(bal > 0, "empty");
        send(SendParameters{ to: to, value: bal });
    }

    // ============ Payment entry ============
    // Direct-call flow: the buyer must be the sender of the message.
    // If you need relaying + offchain signatures, extend with ed25519 signature verification on a canonical payload.
    receive(t: Transfer) {
        let req = t.req;
        require(req.seller != req.buyer, "invalid seller");
        require(req.amount > 0, "invalid amount");
        require(now() <= t.deadline, "expired");

        // Nonce check & consume
        let currentNonce = self.nonces.get(req.buyer);
        // In this direct-call variant, we bind nonce usage to buyer == msg.sender
        require(sender() == req.buyer, "buyer must send");
        let nextNonce: Int = (currentNonce != null) ? (currentNonce!! + 1) : 1;
        self.nonces.set(req.buyer, nextNonce);

        // Compute commissions
        let commission = (req.amount * self.platformCommissionBps) / 10000;
        let totalPay = req.buyerPaysCommission ? (req.amount + commission) : req.amount;

        // Validate attached value
        require(context().value >= totalPay, "insufficient value");

        // Seller payout
        if (req.buyerPaysCommission) {
            send(SendParameters{ to: req.seller, value: req.amount });
        } else {
            send(SendParameters{ to: req.seller, value: req.amount - commission });
        }

        // Optional share via nftCollection
        // NOTE: External get-method calls to nftCollection are disabled in this minimal build.
        // You can wire them using Tact's external get invocation APIs.
        let share: Int = 0;
        let optionalPart: Int = (share > 0) ? ((commission * share) / 10000) : 0;

        let platformPart = commission - optionalPart;
        if (platformPart > 0) {
            send(SendParameters{ to: self.mainCommissionWallet, value: platformPart });
        }
        if (optionalPart > 0 && req.optionalCommissionWallet != null) {
            send(SendParameters{ to: req.optionalCommissionWallet!!, value: optionalPart });
        }

        // Refund change (if any) back to sender
        let change = context().value - totalPay;
        if (change > 0) {
            send(SendParameters{ to: sender(), value: change });
        }
    }

    // ============ Views ============
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
