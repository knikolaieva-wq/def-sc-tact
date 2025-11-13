// Partner NFT on TON (Tact version, soulbound-like)

import "@stdlib/deploy";

message(0x157c62bb) Mint {
    to: Address;
    shareBps: Int;
    uri: String;
}

message(0xca9e378a) Burn {
    tokenId: Int;
}

message(0xb803b08d) IncrementSuccessfulTx {
    wallet: Address;
}

message(0x791c083b) SetTxProcessor {
    processor: Address;
    allowed: Bool;
}

message(0x2231a99d) AddToWhitelist {
    wallet: Address;
}

message(0x871d66eb) RemoveFromWhitelist {
    wallet: Address;
}

contract PartnerNft with Deployable {

    // ===== Storage =====
    owner: Address;
    nextTokenId: Int; // auto-incrementing tokenId
    tokenOwners: map<Int, Address>; // tokenId -> owner
    tokenURIs: map<Int, Cell>; // tokenId -> uri
    tokenShareBps: map<Int, Int>; // tokenId -> shareBps (0..10000)
    walletWhitelist: map<Address, Bool>; // wallet -> bool
    walletTokenId: map<Address, Int>; // wallet -> tokenId (0 если нет токена)
    successfulTxCount: map<Int, Int>; // tokenId -> count
    txProcessors: map<Address, Bool>; // processor -> bool

    // ===== Init =====
    init(owner: Address) {
        self.owner = owner;
        self.nextTokenId = 1;

        self.tokenOwners = emptyMap();
        self.tokenURIs = emptyMap();
        self.tokenShareBps = emptyMap();
        self.walletWhitelist = emptyMap();
        self.walletTokenId = emptyMap();
        self.successfulTxCount = emptyMap();
        self.txProcessors = emptyMap();
    }

    // ===== Internal helpers =====

    inline fun onlyOwner() {
        require(sender() == self.owner, "NOT_OWNER");
    }

    inline fun onlyTxProcessor() {
        let okOpt = self.txProcessors.get(sender());
        let ok = okOpt != null ? okOpt!! : false;
        require(ok, "NOT_PROCESSOR");
    }

    fun getTokenOwner(tokenId: Int): Address {
        let optOwner = self.tokenOwners.get(tokenId);
        require(optOwner != null, "INVALID_TOKEN");
        return optOwner!!;
    }

    // ===== Messages =====

    // Mint 1 NFT per address
    receive(msg: Mint) {
        self.onlyOwner();
        require(msg.shareBps >= 0 && msg.shareBps <= 10000, "SHARE_TOO_HIGH");
        require(msg.uri != "", "EMPTY_URI");

        // инвариант: 1 токен на адрес
        let existingOpt = self.walletTokenId.get(msg.to);
        let existing = existingOpt != null ? existingOpt!! : 0;
        require(existing == 0, "OWNER_ALREADY_HAS_TOKEN");

        let tokenId = self.nextTokenId;
        self.nextTokenId = tokenId + 1;

        // запись владельца и данных
        self.tokenOwners.set(tokenId, msg.to);
        self.tokenURIs.set(tokenId, msg.uri.asComment());
        self.tokenShareBps.set(tokenId, msg.shareBps);

        self.walletTokenId.set(msg.to, tokenId);
        // whitelist
        self.walletWhitelist.set(msg.to, true);

        // аналога events в EVM нет – можно логировать в комментарии/off-chain
    }

    // Burn by token owner, освободить слот
    receive(msg: Burn) {
        let owner = self.getTokenOwner(msg.tokenId);
        require(sender() == owner, "NOT_TOKEN_OWNER");

        // очистка данных по токену
        self.tokenOwners.set(msg.tokenId, null);
        self.tokenURIs.set(msg.tokenId, null);
        self.tokenShareBps.set(msg.tokenId, null);
        self.successfulTxCount.set(msg.tokenId, null);

        // очистка связи wallet -> tokenId
        self.walletTokenId.set(owner, 0);

        // удалить из whitelist (как в твоём Solidity)
        self.walletWhitelist.set(owner, null);
    }

    // Management: добавить кошелёк в whitelist (не минтя NFT)
    receive(msg: AddToWhitelist) {
        self.onlyOwner();
        self.walletWhitelist.set(msg.wallet, true);
    }

    receive(msg: RemoveFromWhitelist) {
        self.onlyOwner();
        self.walletWhitelist.set(msg.wallet, null);
    }

    // Управление процессорами
    receive(msg: SetTxProcessor) {
        self.onlyOwner();
        self.txProcessors.set(msg.processor, msg.allowed);
    }

    // Инкремент счётчика успешных транзакций по кошельку
    receive(msg: IncrementSuccessfulTx) {
        self.onlyTxProcessor();

        let tokenIdOpt = self.walletTokenId.get(msg.wallet);
        let tokenId = tokenIdOpt != null ? tokenIdOpt!! : 0;
        require(tokenId != 0, "INVALID_TOKEN");

        let owner = self.getTokenOwner(tokenId);
        require(owner == msg.wallet, "NOT_ACTIVE_OWNER");

        let currentOpt = self.successfulTxCount.get(tokenId);
        let current = currentOpt != null ? currentOpt!! : 0;
        self.successfulTxCount.set(tokenId, current + 1);
    }

    // ===== Get-методы (off-chain) =====

    // successfulTxCount(wallet)
    get fun successfulTxCountOf(wallet: Address): Int {
        let tokenIdOpt = self.walletTokenId.get(wallet);
        let tokenId = tokenIdOpt != null ? tokenIdOpt!! : 0;
        if (tokenId == 0) {
            return 0;
        }
        let countOpt = self.successfulTxCount.get(tokenId);
        return countOpt != null ? countOpt!! : 0;
    }
    // tokenOf(owner)
    get fun tokenOf(owner: Address): Int {
        let tokenIdOpt = self.walletTokenId.get(owner);
        return tokenIdOpt != null ? tokenIdOpt!! : 0;
    }
    // isWalletWhitelisted(wallet)
    get fun isWalletWhitelisted(wallet: Address): Bool {
        let inListOpt = self.walletWhitelist.get(wallet);
        let inList = inListOpt != null ? inListOpt!! : false;
        let tokenIdOpt = self.walletTokenId.get(wallet);
        let tokenId = tokenIdOpt != null ? tokenIdOpt!! : 0;
        return inList && tokenId != 0;
    }
    // getPlatformShareBpsForWallet(wallet)
    get fun platformShareBpsForWallet(wallet: Address): Int {
        let inListOpt = self.walletWhitelist.get(wallet);
        let inList = inListOpt != null ? inListOpt!! : false;
        if (!inList) {
            return 0;
        }
        let tokenIdOpt = self.walletTokenId.get(wallet);
        let tokenId = tokenIdOpt != null ? tokenIdOpt!! : 0;
        if (tokenId == 0) {
            return 0;
        }
        let shareBpsOpt = self.tokenShareBps.get(tokenId);
        return shareBpsOpt != null ? shareBpsOpt!! : 0;
    }

    // ownerOf(tokenId)
    get fun ownerOf(tokenId: Int): Address {
        return self.getTokenOwner(tokenId);
    }

    // tokenURI(tokenId)
    get fun tokenURI(tokenId: Int): Cell {
        let uriOpt = self.tokenURIs.get(tokenId);
        require(uriOpt != null, "INVALID_TOKEN");
        return uriOpt!!;
    }
}