// ===== PartnerNftCollection.tact =====

import "@stdlib/deploy";
import "./PartnerNftItem.tact";

message(0x157c62bb) Mint {
    to: Address;
    shareBps: Int;
    uri: String;
}

message(0xca9e378a) Burn {
    tokenId: Int;   // == item index
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

struct CollectionData {
    next_item_index: Int;
    collection_content: Cell;
    owner_address: Slice;
}

contract PartnerNftCollection with Deployable {

    // ===== Storage =====
    owner: Address;
    nextItemIndex: Int;            // TEP-62: next_item_index
    collectionContent: Cell;       // TEP-64 совместимый контент коллекции (можно просто comment с описанием)
    itemCode: Cell;                // код PartnerNftItem

    // business-логика
    walletWhitelist: map<Address, Bool>; // wallet -> bool
    walletIndex: map<Address, Int>;      // wallet -> item index (0 если нет токена)
    tokenShareBps: map<Int, Int>;        // index -> shareBps
    successfulTxCount: map<Int, Int>;    // index -> count
    txProcessors: map<Address, Bool>;    // processor -> bool
    indexToAddress: map<Int, Address>;   // index -> NFT item address (для get_nft_address_by_index)

    // ===== Init =====
    init(owner: Address, collectionContent: Cell, itemCode: Cell) {
        self.owner = owner;
        self.nextItemIndex = 0; // TEP-62 обычно начинает с 0

        self.collectionContent = collectionContent;
        self.itemCode = itemCode;

        self.walletWhitelist = emptyMap();
        self.walletIndex = emptyMap();
        self.tokenShareBps = emptyMap();
        self.successfulTxCount = emptyMap();
        self.txProcessors = emptyMap();
        self.indexToAddress = emptyMap();
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

    // helper: адрес этого контракта
    fun selfAddress(): Address {
        return myAddress(); // в Tact есть myAddress()
    }

    // ===== Messages =====

    // Mint 1 NFT per address (TEP-62 style)
    receive(msg: Mint) {
        self.onlyOwner();
        // инвариант: 1 токен на адрес
        let existingOpt = self.walletIndex.get(msg.to);
        require(existingOpt == null, "OWNER_ALREADY_HAS_TOKEN");
        require(msg.shareBps >= 0 && msg.shareBps <= 10000, "SHARE_TOO_HIGH");
        require(msg.uri != "", "EMPTY_URI");

        // индекс в коллекции по TEP-62
        let index = self.nextItemIndex;
        self.nextItemIndex = index + 1;

        // content для item – храним uri как comment
        let uriCell = msg.uri.asComment();

        // Init item-контракта
        let itemInit = initOf PartnerNftItem(
            self.selfAddress(),
            msg.to,
            index,
            uriCell,
            msg.shareBps
        );
        // 2) считаем адрес айтема
        let itemAddress: Address = contractAddress(itemInit);

        // 3) сохраняем индекс -> адрес, whitelist, shareBps и т.д.
        self.indexToAddress.set(index, itemAddress);
        self.walletIndex.set(msg.to, index);
        self.walletWhitelist.set(msg.to, true);
        self.tokenShareBps.set(index, msg.shareBps);

        // 4) отправляем сообщение с init (deploy + msg)
        send(SendParameters{
            to: itemAddress,
            value: ton("0.05"),   // подбери по gas/хранилищу
            mode: SendIgnoreErrors, // опционально
            body: null,            // без тела
            code: itemInit.code,   // ← вот это вместо stateInit
            data: itemInit.data    // ← и это
        });
    }

    // Burn: владелец NFT может инициировать burn через коллекцию
    receive(msg: Burn) {
        // узнаём, кто _должен_ быть владельцем этого tokenId
        let claimedOwner = sender();

        let idxOpt = self.walletIndex.get(claimedOwner);
        let idx = idxOpt != null ? idxOpt!! : -1;
        require(idx == msg.tokenId, "NOT_TOKEN_OWNER");

        // адрес item
        let itemAddrOpt = self.indexToAddress.get(msg.tokenId);
        require(itemAddrOpt != null, "INVALID_TOKEN");
        let itemAddr = itemAddrOpt!!;

        // шлём в item сообщение BurnFromCollection
        let body = beginCell()
            .storeUint(0xca9e378a, 32) // op BurnFromCollection в item
            .endCell();

        send(SendParameters{
            to: itemAddr,
            value: ton("0.02"), // чуть на gas
            body: body
        });

        // чистим данные коллекции
        self.walletIndex.set(claimedOwner, 0);
        self.walletWhitelist.set(claimedOwner, null);
        self.tokenShareBps.set(msg.tokenId, null);
        self.successfulTxCount.set(msg.tokenId, null);
        self.indexToAddress.set(msg.tokenId, null);
    }

    // Management: whitelist
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

        let idxOpt = self.walletIndex.get(msg.wallet);
        let idx = idxOpt != null ? idxOpt!! : 0;
        require(idx != 0, "INVALID_TOKEN");

        let currentOpt = self.successfulTxCount.get(idx);
        let current = currentOpt != null ? currentOpt!! : 0;
        self.successfulTxCount.set(idx, current + 1);
    }

    // ===== TEP-62 get-методы коллекции =====

    // (int next_item_index, cell collection_content, slice owner_address)
    get fun get_collection_data(): CollectionData {
        return CollectionData{
            next_item_index: self.nextItemIndex,
            collection_content: self.collectionContent,
            owner_address: self.owner.asSlice()
        };
    }

    // get_nft_address_by_index(int index) -> slice address
    get fun get_nft_address_by_index(index: Int): Address {
        let addrOpt = self.indexToAddress.get(index);
        require(addrOpt != null, "NFT_NOT_EXISTS");
        return addrOpt!!; // Address как slice нормально читается снаружи
    }

    // get_nft_content(int index, cell individual_content) -> cell full_content
    // У нас весь контент уже лежит в коллекции/айтеме, игнорируем individual_content
    // get_nft_content(int index, cell individual_content) -> cell full_content
    get fun get_nft_content(index: Int, individual_content: Cell): Cell {
        // index можешь даже не использовать, все данные уже в individual_content
        return individual_content;
    }

    // ===== Твои геттеры, адаптированные под индексы =====

    // successfulTxCount(wallet)
    get fun successfulTxCountOf(wallet: Address): Int {
        let idxOpt = self.walletIndex.get(wallet);
        let idx = idxOpt != null ? idxOpt!! : 0;
        if (idxOpt == null) {
            return 0;
        }
        let countOpt = self.successfulTxCount.get(idx);
        return countOpt != null ? countOpt!! : 0;
    }

    // tokenOf(owner)
    get fun tokenOf(owner: Address): Int {
        let idxOpt = self.walletIndex.get(owner);
        return idxOpt != null ? idxOpt!! : -1;
    }   

    // isWalletWhitelisted(wallet)
    get fun isWalletWhitelisted(wallet: Address): Bool {
        let inListOpt = self.walletWhitelist.get(wallet);
        let inList = inListOpt != null ? inListOpt!! : false;
        let hasToken = self.walletIndex.get(wallet) != null;
        return inList && hasToken;
    }

    // getPlatformShareBpsForWallet(wallet)
    get fun platformShareBpsForWallet(wallet: Address): Int {
        let inListOpt = self.walletWhitelist.get(wallet);
        let inList = inListOpt != null ? inListOpt!! : false;
        if (!inList) {
            return 0;
        }
        let idxOpt = self.walletIndex.get(wallet);
        if (idxOpt == null) {
            return 0;
        }
        let idx = idxOpt!!;
        let shareOpt = self.tokenShareBps.get(idx);
        return shareOpt != null ? shareOpt!! : 0;
    }
}