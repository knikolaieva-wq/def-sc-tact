// ===== PartnerNftItem.tact =====
// TEP-62 NFT item + доп поля под твой кейс

import "@stdlib/deploy";
import "@stdlib/content";
import "./messages.tact";

message(0x0f8a7ea5) SetOwner {
    newOwner: Address;
}
message(0xca9e378a) BurnFromCollection {
    
}
struct NftData {
    init: Int;
    index: Int;
    collection_address: Slice;
    owner_address: Slice;
    individual_content: Cell;
}    

contract PartnerNftItem with Deployable {

    // ---- Storage ----
    collection: Address;      // адрес коллекции
    owner: Address?;           // владелец NFT
    index: Int;               // индекс в коллекции
    content: Cell;            // индивидуальный контент (uri в виде comment-ячейки)
    shareBps: Int;            // 0..10000
    // successfulTxCount будет храниться в коллекции (как у тебя сейчас), чтобы не ходить в item

    // ---- Init ----
    init(
        collection: Address,
        owner: Address,
        index: Int,
        uri: String,
        shareBps: Int
    ) {
        self.collection = collection;
        self.owner = owner;
        self.index = index;
        self.content = createOffchainContent(uri);
        self.shareBps = shareBps;
    }

    // ---- Internal helpers ----
    inline fun onlyCollection() {
        require(sender() == self.collection, "NOT_COLLECTION");
    }

    // Сигнал от коллекции, что надо сменить owner (если когда-то захочешь делать transfer)
    receive(msg: SetOwner) {
        self.onlyCollection();
        self.owner = msg.newOwner;
    }

    // Сигнал от коллекции на burn (если захочешь реально уничтожать контракт)
    receive(msg: BurnFromCollection) {
        self.onlyCollection();
        // Либо просто помечаем как неинициализированный:
        self.owner = null;
        // Либо совсем вырубаем контракт:
        // selfdestruct(self.collection);
    }

    // ---- TEP-62 обязательный get-метод ----
    // get_nft_data() returns:
    // (int init?, int index, slice collection_address, slice owner_address, cell individual_content)
    get fun get_nft_data(): NftData {
        let initFlag: Int = self.owner == null ? 0 : 1;
        let ownerSlice: Slice = self.owner == null
            ? newAddress(0, 0).asSlice()      // dummy, всё равно не используется при initFlag = 0
            : self.owner!!.asSlice();          // !! разыменует Address? → Address

        return NftData{
            init: initFlag,
            index: self.index,
            collection_address: self.collection.asSlice(),
            owner_address: ownerSlice,
            individual_content: self.content
        };
    }

    // Пустой receive для деплоя и простых переводов
    receive(msg: Transfer) { 
        self.onlyCollection();
        self.owner = msg.new_owner;
    }

    // ---- Доп геттеры под твой кейс ----

    get fun get_share_bps(): Int {
        return self.shareBps;
    }

    get fun get_owner(): Address? {
        return self.owner;
    }

    get fun get_index(): Int {
        return self.index;
    }

    get fun get_content(): Cell {
        return self.content;
    }
}