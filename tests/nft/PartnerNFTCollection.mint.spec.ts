/// <reference types="jest" />

import { Blockchain, type SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, contractAddress, toNano } from '@ton/core';
import { PartnerNftCollection, type Mint } from '../../build/nft/PartnerNftCollection_PartnerNftCollection';
import { PartnerNftItem } from '../../build/nft/PartnerNftItem_PartnerNftItem';
import '@ton/test-utils';

const buildOffchainContent = (uri: string): Cell => beginCell().storeUint(1, 8).storeStringTail(uri).endCell();

describe('PartnerNFTCollection - mint', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let bob: SandboxContract<TreasuryContract>;
    let stranger: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<PartnerNftCollection>;
    let collectionContent: Cell;
    let itemCode: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        alice = await blockchain.treasury('alice');
        bob = await blockchain.treasury('bob');
        stranger = await blockchain.treasury('stranger');

        collectionContent = buildOffchainContent('https://example.com/partner-collection.json');

        const dummyItemInit = await PartnerNftItem.init(owner.address, owner.address, 0n, 'https://dummy', 0n);
        itemCode = dummyItemInit.code;

        collection = blockchain.openContract(
            await PartnerNftCollection.fromInit(owner.address, collectionContent, itemCode)
        );

        await owner.send({ to: collection.address, value: toNano('0.3'), bounce: false });
    });

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

    const openItemByIndex = async (index: bigint) => {
        const address = await collection.getGetNftAddressByIndex(index);
        return {
            address,
            contract: blockchain.openContract(PartnerNftItem.fromAddress(address))
        };
    };

    const expectItemState = async (index: bigint, wallet: SandboxContract<TreasuryContract>, shareBps: bigint, uri: string) => {
        const { address, contract } = await openItemByIndex(index);
        const state = await contract.getGetNftData();
        expect(state.index).toBe(index);
        const ownerSlice = state.owner_address.loadAddress();
        expect(ownerSlice.toRawString()).toBe(wallet.address.toRawString());
        const collectionSlice = state.collection_address.loadAddress();
        expect(collectionSlice.toRawString()).toBe(collection.address.toRawString());
        const expectedContent = buildOffchainContent(uri);
        expect(state.individual_content.hash().equals(expectedContent.hash())).toBe(true);
        const getterOwner = await contract.getGetOwner();
        expect(getterOwner?.toRawString()).toBe(wallet.address.toRawString());
        const getterShare = await contract.getGetShareBps();
        expect(getterShare).toBe(shareBps);
        const getterIndex = await contract.getGetIndex();
        expect(getterIndex).toBe(index);
        const getterContent = await contract.getGetContent();
        expect(getterContent.hash().equals(expectedContent.hash())).toBe(true);

        const computedAddress = contractAddress(0, await PartnerNftItem.init(collection.address, wallet.address, index, uri, shareBps));
        expect(address.toRawString()).toBe(computedAddress.toRawString());
    };

    const expectMintFailure = async (
        sender: SandboxContract<TreasuryContract>,
        args: { to: SandboxContract<TreasuryContract>; shareBps: bigint; uri: string },
        exitCode: bigint | number
    ) => {
        const res = await mintFrom(sender, args);
        expect(res.transactions).toHaveTransaction({ to: collection.address, aborted: true, exitCode });
    };

    it('positive - owner can mint and sets URI/shareBps', async () => {
        const shareBps = 8000n;
        const uri = 'ipfs://1';

        const res = await mintFrom(owner, { to: alice, shareBps, uri });
        expect(res.transactions).toHaveTransaction({ to: collection.address, aborted: false });

        const tokenId = await collection.getTokenOf(alice.address);
        expect(tokenId).toBe(0n);
        const recordedShare = await collection.getPlatformShareBpsForWallet(alice.address);
        expect(recordedShare).toBe(shareBps);
        const whitelist = await collection.getIsWalletWhitelisted(alice.address);
        expect(whitelist).toBe(true);

        await expectItemState(0n, alice, shareBps, uri);
    });

    it('positive - mints sequential tokenIds for unique wallets', async () => {
        await mintFrom(owner, { to: alice, shareBps: 500n, uri: 'ipfs://alice' });
        await mintFrom(owner, { to: bob, shareBps: 600n, uri: 'ipfs://bob' });

        expect(await collection.getTokenOf(alice.address)).toBe(0n);
        expect(await collection.getTokenOf(bob.address)).toBe(1n);
        expect(await collection.getSuccessfulTxCountOf(alice.address)).toBe(0n);

        await expectItemState(0n, alice, 500n, 'ipfs://alice');
        await expectItemState(1n, bob, 600n, 'ipfs://bob');
    });

    it('negative - rejects mints from non-owner', async () => {
        const res = await mintFrom(stranger, { to: alice, shareBps: 100n, uri: 'ipfs://1' });
        expect(res.transactions).toHaveTransaction({ to: collection.address, aborted: true, exitCode: 132 });
        expect(await collection.getTokenOf(alice.address)).toBe(-1n);
    });

    it('negative - rejects invalid parameters', async () => {
        await expectMintFailure(owner, { to: alice, shareBps: 10001n, uri: 'ipfs://1' }, 1013);
        await expectMintFailure(owner, { to: alice, shareBps: -1n, uri: 'ipfs://1' }, 1013);
        await expectMintFailure(owner, { to: alice, shareBps: 100n, uri: '' }, 1014);
    });

    it('negative - enforces single token per wallet', async () => {
        await mintFrom(owner, { to: alice, shareBps: 500n, uri: 'ipfs://1' });
        await expectMintFailure(owner, { to: alice, shareBps: 600n, uri: 'ipfs://2' }, 1012);
    });
});
