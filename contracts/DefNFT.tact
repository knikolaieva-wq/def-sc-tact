// DefNFT (Tact) — simplified NFT-like contract for TON
// Mirrors core ideas of the provided Solidity DefNFT:
// - Owner-managed mint (1 NFT per wallet), optional burn by holder
// - Per-token shareBps (0..10000)
// - Wallet whitelist toggle by owner
// - Mapping wallet -> tokenId and tokenId -> owner
// - successfulTxCount per token, incrementable only by authorized processors
// - Disabled transfers/approvals (no transfer entrypoints exposed)

// Notes:
// - This is not a full TIP-4 implementation; it’s a minimal purpose-built NFT analog.
// - tokenURI is stored as a cell (slice). Off-chain consumers can interpret it as UTF-8.

const OP_MINT: Int = 0x6d696e74;            // 'mint'
const OP_BURN: Int = 0x6275726e;            // 'burn'
const OP_SET_WL: Int = 0x736574776c;        // 'setwl'
const OP_SET_PROC: Int = 0x7370726f63;      // 'sproc'
const OP_INC_SUC: Int = 0x696e63737563;     // 'incsuc'

message Mint { to: Address; shareBps: Int; tokenUri: Cell; }
message Burn { tokenId: Int; }
message SetWalletWhitelist { wallet: Address; allowed: Bool; }
message SetTxProcessor { processor: Address; allowed: Bool; }
message IncrementSuccessfulTx { wallet: Address; }
struct NftOpsResponse { mint: Int; burn: Int; setWl: Int; setProc: Int; incSuc: Int; }

contract DefNFT {
    owner: Address;
    nextTokenId: Int;

    // token -> owner
    tokenOwner: map<Int, Address>;
    // owner -> token
    walletTokenId: map<Address, Int>;

    // token -> share bps (0..10000)
    tokenShareBps: map<Int, Int>;
    // token -> successful tx count
    successfulTxCount: map<Int, Int>;
    // token -> tokenURI (stored as a Cell)
    tokenURI: map<Int, Cell>;

    // flags
    walletWhitelist: map<Address, Bool>;
    txProcessors: map<Address, Bool>;

    init(owner: Address) {
        self.owner = owner;
        self.nextTokenId = 1;
    }

    get fun getOps(): NftOpsResponse {
        return NftOpsResponse{ mint: OP_MINT, burn: OP_BURN, setWl: OP_SET_WL, setProc: OP_SET_PROC, incSuc: OP_INC_SUC };
    }

    // ============ Admin ============
    receive(msg: SetWalletWhitelist) {
        require(sender() == self.owner, "only owner");
        if (msg.allowed) {
            self.walletWhitelist.set(msg.wallet, true);
        } else {
            // remove flag
            self.walletWhitelist.set(msg.wallet, false);
        }
    }

    receive(msg: SetTxProcessor) {
        require(sender() == self.owner, "only owner");
        if (msg.allowed) {
            self.txProcessors.set(msg.processor, true);
        } else {
            self.txProcessors.set(msg.processor, false);
        }
    }

    // ============ Mint/Burn ============
    receive(m: Mint) {
        require(sender() == self.owner, "only owner");

        // Validate shareBps
        require(m.shareBps >= 0 && m.shareBps <= 10000, "bps out of range");

        // Enforce 1 NFT per address
        let existing = self.walletTokenId.get(m.to);
        require((existing == null) || (existing!! == 0), "OwnerAlreadyHasToken");

        // tokenUri may be empty; off-chain may choose to ignore empty URI

        let tokenId = self.nextTokenId;
        self.nextTokenId = tokenId + 1;

        // Write ownership mappings
        self.tokenOwner.set(tokenId, m.to);
        self.walletTokenId.set(m.to, tokenId);

        // Set token fields
        self.tokenShareBps.set(tokenId, m.shareBps);
        self.successfulTxCount.set(tokenId, 0);
        self.tokenURI.set(tokenId, m.tokenUri);

        // Whitelist wallet automatically
        self.walletWhitelist.set(m.to, true);
    }

    receive(b: Burn) {
        // Burn by token owner only
        let ownerOpt = self.tokenOwner.get(b.tokenId);
        require(ownerOpt != null, "InvalidToken");
        let holder = ownerOpt!!;
        require(sender() == holder, "NotOwner");

        // Cleanup per-token config and whitelist for holder
        self.tokenShareBps.set(b.tokenId, 0);
        self.successfulTxCount.set(b.tokenId, 0);
        self.tokenURI.set(b.tokenId, null); // remove stored URI
        self.tokenOwner.set(b.tokenId, null);

        let cur = self.walletTokenId.get(holder);
        if (cur != null && cur!! == b.tokenId) {
            self.walletTokenId.set(holder, 0);
        }
        self.walletWhitelist.set(holder, false);
    }

    // ============ External processor ============
    receive(m: IncrementSuccessfulTx) {
        // Only authorized processors allowed
        let allowed = self.txProcessors.get(sender());
        require((allowed != null) && (allowed!! == true), "UnauthorizedProcessor");

        // wallet is a non-optional Address; no null check needed
        let tidOpt = self.walletTokenId.get(m.wallet);
        require((tidOpt != null) && (tidOpt!! != 0), "InvalidToken");
        let tid = tidOpt!!;

        // Ensure ownership is active
        let holderOpt = self.tokenOwner.get(tid);
        require((holderOpt != null) && (holderOpt!! == m.wallet), "InvalidToken");

        let cnt = self.successfulTxCount.get(tid);
        let next = (cnt != null) ? (cnt!! + 1) : 1;
        self.successfulTxCount.set(tid, next);
    }

    // ============ Views ============
    get fun successfulTxCountOf(wallet: Address): Int {
        let tid = self.walletTokenId.get(wallet);
        if (tid == null || tid!! == 0) {
            return 0;
        }
        let cnt = self.successfulTxCount.get(tid!!);
        return (cnt != null) ? cnt!! : 0;
    }

    get fun tokenOf(owner: Address): Int {
        let tid = self.walletTokenId.get(owner);
        return (tid != null) ? tid!! : 0;
    }

    get fun isWalletWhitelisted(wallet: Address): Bool {
        let wh = self.walletWhitelist.get(wallet);
        let tid = self.walletTokenId.get(wallet);
        let has = (tid != null) && (tid!! != 0);
        return ((wh != null) && (wh!! == true) && has);
    }

    get fun getPlatformShareBpsForWallet(wallet: Address): Int {
        let wh = self.walletWhitelist.get(wallet);
        if (wh == null || wh!! == false) {
            return 0;
        }
        let tid = self.walletTokenId.get(wallet);
        if (tid == null || tid!! == 0) {
            return 0;
        }
        let bps = self.tokenShareBps.get(tid!!);
        return (bps != null) ? bps!! : 0;
    }

    get fun getTokenURI(tokenId: Int): Cell {
        let u = self.tokenURI.get(tokenId);
        if (u == null) {
            // return empty cell
            return beginCell().endCell();
        }
        return u!!;
    }

    get fun ownerOf(tokenId: Int): Address {
        let o = self.tokenOwner.get(tokenId);
        require(o != null, "InvalidToken");
        return o!!;
    }
}
