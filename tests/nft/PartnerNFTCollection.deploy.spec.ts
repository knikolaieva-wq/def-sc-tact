/// <reference types="jest" />

import { Blockchain, type SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, contractAddress, toNano } from '@ton/core';
import { PartnerNftCollection, type Mint } from '../../build/nft/PartnerNftCollection_PartnerNftCollection';
import { PartnerNftItem } from '../../build/nft/PartnerNftItem_PartnerNftItem';
import '@ton/test-utils';

const buildOffchainContent = (uri: string): Cell => beginCell().storeUint(1, 8).storeStringTail(uri).endCell();

describe('PartnerNFTCollection - deploy', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let partner: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<PartnerNftCollection>;
    let collectionContent: Cell;
    let itemCode: Cell;

    const COLLECTION_URI = 'https://example.com/partner-collection.json';

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        partner = await blockchain.treasury('partner');

        collectionContent = buildOffchainContent(COLLECTION_URI);

        const dummyItemInit = await PartnerNftItem.init(owner.address, owner.address, 0n, 'https://dummy', 0n);
        itemCode = dummyItemInit.code;

        collection = blockchain.openContract(
            await PartnerNftCollection.fromInit(owner.address, collectionContent, itemCode)
        );

        await owner.send({ to: collection.address, value: toNano('0.3'), bounce: false });
    });

    describe('Positive', () => {
        it('deploys collection metadata and mints Partner NFT items', async () => {
            const shareBps = 500n;
            const mintedUri = 'ipfs://partner-nft/item-1.json';

            const expectedItemInit = await PartnerNftItem.init(collection.address, partner.address, 0n, mintedUri, shareBps);
            const expectedItemAddress = contractAddress(0, expectedItemInit);

            const mintPayload: Mint = {
                $$type: 'Mint',
                to: partner.address,
                shareBps,
                uri: mintedUri,
            };

            await collection.send(owner.getSender(), { value: toNano('0.25'), bounce: true }, mintPayload);

            const collectionData = await collection.getGetCollectionData();
            expect(collectionData.next_item_index).toBe(1n);
            expect(collectionData.collection_content.hash().equals(collectionContent.hash())).toBe(true);
            const ownerFromCollectionData = collectionData.owner_address.loadAddress();
            expect(ownerFromCollectionData.toRawString()).toBe(owner.address.toRawString());

            const storedOwner = await collection.getOwner();
            expect(storedOwner.toRawString()).toBe(owner.address.toRawString());
            const version = await collection.getGetVersion();
            expect(version).toBe(1n);

            const tokenId = await collection.getTokenOf(partner.address);
            expect(tokenId).toBe(0n);
            const isWhitelisted = await collection.getIsWalletWhitelisted(partner.address);
            expect(isWhitelisted).toBe(true);
            const shareRecorded = await collection.getPlatformShareBpsForWallet(partner.address);
            expect(shareRecorded).toBe(shareBps);
            const successfulTxCount = await collection.getSuccessfulTxCountOf(partner.address);
            expect(successfulTxCount).toBe(0n);

            const onchainItemAddress = await collection.getGetNftAddressByIndex(0n);
            expect(onchainItemAddress.toRawString()).toBe(expectedItemAddress.toRawString());

            const mintedAccount = await blockchain.getContract(onchainItemAddress);
            expect(mintedAccount.accountState?.type).toBe('active');

            const nftItem = blockchain.openContract(PartnerNftItem.fromAddress(onchainItemAddress));
            const nftData = await nftItem.getGetNftData();
            expect(nftData.init).toBe(1n);
            expect(nftData.index).toBe(0n);
            const nftOwner = nftData.owner_address.loadAddress();
            expect(nftOwner.toRawString()).toBe(partner.address.toRawString());
            const nftCollection = nftData.collection_address.loadAddress();
            expect(nftCollection.toRawString()).toBe(collection.address.toRawString());

            const expectedItemContent = buildOffchainContent(mintedUri);
            expect(nftData.individual_content.hash().equals(expectedItemContent.hash())).toBe(true);

            const itemOwnerGetter = await nftItem.getGetOwner();
            expect(itemOwnerGetter?.toRawString()).toBe(partner.address.toRawString());
            const itemShare = await nftItem.getGetShareBps();
            expect(itemShare).toBe(shareBps);
            const itemIndex = await nftItem.getGetIndex();
            expect(itemIndex).toBe(0n);
            const itemContent = await nftItem.getGetContent();
            expect(itemContent.hash().equals(expectedItemContent.hash())).toBe(true);
        });
    });
});
