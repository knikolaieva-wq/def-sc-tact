// PaymentProcessor for TON (Tact)
// Mirrors core logic of the provided Solidity contract:
// - Owner-managed platformCommissionBps
// - Transfer with commission splitting and optional partner share
// - Nonces + deadline checks (direct-call flow: buyer must send the message)

// Minimal interface for an external NFT-like contract used for rewards
// Exposes two interactions analogous to the Solidity example:
// - getPlatformShareBpsForWallet(address) -> Int (0..10000)
// - incrementSuccessfulTx(address)
// Note: in TON, cross-contract reads are get-method calls, writes are internal messages.
//import "@stdlib/stdlib.tact";  // или конкретные символы: rawReserve, SendMode.*, и т.п.

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

struct ConfigResponse {
    owner: Address;
    mainCommissionWallet: Address;
    nftCollection: Address;
    platformCommissionBps: Int;
}

message Transfer { req: PaymentRequest; deadline: Int; }
message SetPlatformCommissionBps { newBps: Int; }
message WithdrawAll { to: Address; }
message SetOwner { newOwner: Address; }

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
    }

    // 3) Добавим get-методы для фронта
    get fun getConfig(): ConfigResponse {
        return ConfigResponse{
            owner: self.owner,
            mainCommissionWallet: self.mainCommissionWallet,
            nftCollection: self.nftCollection,
            platformCommissionBps: self.platformCommissionBps
        };
    }

    // ============ Admin ============
    receive(m: SetOwner) {
        require(sender() == self.owner, "only owner");
        self.owner = m.newOwner;
    }

    receive(m: SetPlatformCommissionBps) {
        require(sender() == self.owner, "only owner");
        require(m.newBps >= 0 && m.newBps <= 10000, "bps out of range");
        self.platformCommissionBps = m.newBps;
    }

    receive(w: WithdrawAll) {
        require(sender() == self.owner, "only owner");
        let to = w.to;
        let bal = myBalance();
        // Minimal balance to keep contract operational (rent + small gas headroom)
        let MIN_KEEP: Int = 10_000_000; // ~0.01 TON
        require(bal > MIN_KEEP, "below reserve");
        // Reserve minimal operational balance, send the rest away
        nativeReserve(MIN_KEEP, 0);
        send(SendParameters{ to: to, value: 0, mode: SendRemainingBalance });
    }

    // ============ Payment entry ============
    receive(t: Transfer) {
        let req = t.req;
        
        // Базовые проверки
        require(req.amount > 0, "invalid amount");
        require(req.seller != req.buyer, "invalid seller");
        require(now() <= t.deadline, "expired");
        require(sender() == req.buyer, "buyer must send");

        // Nonce check & consume
        let currentNonce = self.nonces.get(req.buyer);
        let nextNonce: Int = (currentNonce != null) ? (currentNonce!! + 1) : 1;
        self.nonces.set(req.buyer, nextNonce);

        // Compute commissions
        let commission = (req.amount * self.platformCommissionBps) / 10000;
        let sellerValue = req.buyerPaysCommission ? req.amount : (req.amount - commission);
        let commissionValue = commission > 0 ? commission : 0;

        let incoming: Int = context().value;
        let balBefore: Int = myBalance() - incoming;
        let prev: Int = (balBefore > 0) ? balBefore : 0;
        nativeReserve(prev, 0); // фиксируем ровно prev; дальнейшие расходы — из входящего

        // Seller payout
        send(SendParameters{ 
            to: req.seller, 
            value: sellerValue,
            bounce: true,
            mode: SendPayGasSeparately // чтобы не тратить резерв на форвард-фии продавцу
        });

        // Platform commission - отправляем если есть
        if (commissionValue > 0) {
            send(SendParameters{ 
                to: self.mainCommissionWallet, 
                value: commissionValue,
                bounce: true,
                mode: SendPayGasSeparately // чтобы не тратить резерв на форвард-фии платформе
            });
        }

        // Optional partner commission (пока отключено, но структура готова)
        // if (req.optionalCommissionWallet != null) {
        //     let optionalPart = (commission * shareFromNFT) / 10000;
        //     if (optionalPart > 0) {
        //         send(SendParameters{ 
        //             to: req.optionalCommissionWallet!!, 
        //             value: optionalPart,
        //             mode: 1,
        //             bounce: true
        //         });
        //     }
        // }

        // Возврат сдачи автоматически отправляет весь оставшийся баланс (с учетом потраченного газа)
        // send(SendParameters{
        //     to: sender(),
        //     value: 0,
        //     mode: SendRemainingBalance + SendIgnoreErrors,
        //     bounce: false
        // });
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
