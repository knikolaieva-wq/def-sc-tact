/// <reference types="jest" />

import { Blockchain, type SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, contractAddress, toNano } from '@ton/core';
import { PartnerNftCollection, type Mint, type Burn } from '../../build/nft/PartnerNftCollection_PartnerNftCollection';
import { PartnerNftItem } from '../../build/nft/PartnerNftItem_PartnerNftItem';
import '@ton/test-utils';

const buildOffchainContent = (uri: string): Cell => beginCell().storeUint(1, 8).storeStringTail(uri).endCell();

describe('PartnerNFTCollection - burn', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let bob: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<PartnerNftCollection>;
    let collectionContent: Cell;
    let itemCode: Cell;
    let initialItemAddress: Address;
    let initialItem: SandboxContract<PartnerNftItem>;

    const INITIAL_URI = 'ipfs://1';
    const INITIAL_SHARE_BPS = 100n;

    const mintFrom = async (
        sender: SandboxContract<TreasuryContract>,
        args: { to: SandboxContract<TreasuryContract>; shareBps: bigint; uri: string; value?: string }
    ) =>
        collection.send(sender.getSender(), { value: toNano(args.value ?? '0.25'), bounce: true }, {
            $$type: 'Mint',
            to: args.to.address,
            shareBps: args.shareBps,
            uri: args.uri,
        } satisfies Mint);

    const burnFrom = async (
        sender: SandboxContract<TreasuryContract>,
        tokenId: bigint,
        value: string = '0.1'
    ) =>
        collection.send(sender.getSender(), { value: toNano(value), bounce: true }, {
            $$type: 'Burn',
            tokenId,
        } satisfies Burn);

    const expectItemState = async (
        index: bigint,
        wallet: SandboxContract<TreasuryContract>,
        shareBps: bigint,
        uri: string
    ) => {
        const address = await collection.getGetNftAddressByIndex(index);
        const contract = blockchain.openContract(PartnerNftItem.fromAddress(address));
        const data = await contract.getGetNftData();
        expect(data.init).toBe(1n);
        expect(data.index).toBe(index);
        const ownerSlice = data.owner_address.loadAddress();
        expect(ownerSlice.toRawString()).toBe(wallet.address.toRawString());
        const collectionSlice = data.collection_address.loadAddress();
        expect(collectionSlice.toRawString()).toBe(collection.address.toRawString());
        const expectedContent = buildOffchainContent(uri);
        expect(data.individual_content.hash().equals(expectedContent.hash())).toBe(true);
        const getterOwner = await contract.getGetOwner();
        expect(getterOwner?.toRawString()).toBe(wallet.address.toRawString());
        const getterShare = await contract.getGetShareBps();
        expect(getterShare).toBe(shareBps);
        const getterIndex = await contract.getGetIndex();
        expect(getterIndex).toBe(index);
        const getterContent = await contract.getGetContent();
        expect(getterContent.hash().equals(expectedContent.hash())).toBe(true);

        const expectedAddress = contractAddress(
            0,
            await PartnerNftItem.init(collection.address, wallet.address, index, uri, shareBps)
        );
        expect(address.toRawString()).toBe(expectedAddress.toRawString());
    };

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        alice = await blockchain.treasury('alice');
        bob = await blockchain.treasury('bob');

        collectionContent = buildOffchainContent('https://example.com/partner-collection.json');

        const dummyItemInit = await PartnerNftItem.init(owner.address, owner.address, 0n, 'https://dummy', 0n);
        itemCode = dummyItemInit.code;

        collection = blockchain.openContract(
            await PartnerNftCollection.fromInit(owner.address, collectionContent, itemCode)
        );

        await owner.send({ to: collection.address, value: toNano('0.3'), bounce: false });
        await mintFrom(owner, { to: alice, shareBps: INITIAL_SHARE_BPS, uri: INITIAL_URI });

        initialItemAddress = await collection.getGetNftAddressByIndex(0n);
        initialItem = blockchain.openContract(PartnerNftItem.fromAddress(initialItemAddress));
    });

    describe('Positive', () => {
        it('token owner can burn their NFT', async () => {
            const burnRes = await burnFrom(alice, 0n);
            expect(burnRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });

            expect(await collection.getTokenOf(alice.address)).toBe(-1n);
            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(false);

            const nftData = await initialItem.getGetNftData();
            expect(nftData.init).toBe(0n);
            const ownerAfter = await initialItem.getGetOwner();
            expect(ownerAfter).toBeNull();
        });

        it('owner can re-mint after burning', async () => {
            await burnFrom(alice, 0n);

            const newShare = 200n;
            const newUri = 'ipfs://new';

            await mintFrom(owner, { to: alice, shareBps: newShare, uri: newUri });

            expect(await collection.getTokenOf(alice.address)).toBe(1n);
            await expectItemState(1n, alice, newShare, newUri);
        });
    });

    describe('Negative', () => {
        it('prevents non-owners from burning', async () => {
            const res = await burnFrom(bob, 0n);
            expect(res.transactions).toHaveTransaction({ to: collection.address, aborted: true, exitCode: 1018 });
            expect(await collection.getTokenOf(alice.address)).toBe(0n);
        });

        it('rejects burning nonexistent tokens', async () => {
            const invalidRes = await burnFrom(alice, 999n);
            expect(invalidRes.transactions).toHaveTransaction({ to: collection.address, aborted: true, exitCode: 1018 });
            expect(await collection.getTokenOf(alice.address)).toBe(0n);

            await burnFrom(alice, 0n);
            const repeatRes = await burnFrom(alice, 0n);
            expect(repeatRes.transactions).toHaveTransaction({ to: collection.address, aborted: true, exitCode: 1018 });
            expect(await collection.getTokenOf(alice.address)).toBe(-1n);
        });
    });
});
