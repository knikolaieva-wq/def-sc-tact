/// <reference types="jest" />

import { Blockchain, type SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { PartnerNftCollection, type Mint } from '../../build/nft/PartnerNftCollection_PartnerNftCollection';
import { PartnerNftItem } from '../../build/nft/PartnerNftItem_PartnerNftItem';
import '@ton/test-utils';

const buildOffchainContent = (uri: string): Cell => beginCell().storeUint(1, 8).storeStringTail(uri).endCell();
const emptySlice = () => beginCell().endCell().beginParse();
const NON_TRANSFERABLE_EXIT = Number(PartnerNftItem.ExitCodeNonTransferable);

describe('PartnerNFTCollection - transfers & approvals', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let bob: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<PartnerNftCollection>;
    let nftItem: SandboxContract<PartnerNftItem>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        alice = await blockchain.treasury('alice');
        bob = await blockchain.treasury('bob');

        const collectionContent = buildOffchainContent('https://example.com/partner-collection.json');
        const dummyItemInit = await PartnerNftItem.init(owner.address, owner.address, 0n, 'https://dummy', 0n);
        const itemCode = dummyItemInit.code;

        collection = blockchain.openContract(
            await PartnerNftCollection.fromInit(owner.address, collectionContent, itemCode)
        );

        await owner.send({ to: collection.address, value: toNano('0.3'), bounce: false });

        const mintPayload: Mint = {
            $$type: 'Mint',
            to: alice.address,
            shareBps: 100n,
            uri: 'ipfs://1',
        };
        await collection.send(owner.getSender(), { value: toNano('0.25'), bounce: true }, mintPayload);

        const nftItemAddress = await collection.getGetNftAddressByIndex(0n);
        nftItem = blockchain.openContract(PartnerNftItem.fromAddress(nftItemAddress));
    });

    const sendTransferAttempt = async (
        sender: SandboxContract<TreasuryContract>,
        params: { newOwner: SandboxContract<TreasuryContract>; responseDestination?: SandboxContract<TreasuryContract> }
    ) => {
        return nftItem.send(sender.getSender(), { value: toNano('0.05'), bounce: true }, {
            $$type: 'NFTTransfer',
            queryId: 0n,
            newOwner: params.newOwner.address,
            responseDestination: (params.responseDestination ?? sender).address,
            customPayload: null,
            forwardAmount: 0n,
            forwardPayload: emptySlice(),
        });
    };

    it('negative - disables approvals', async () => {
        const res = await sendTransferAttempt(alice, { newOwner: alice, responseDestination: bob });
        expect(res.transactions).toHaveTransaction({
            to: nftItem.address,
            aborted: true,
            exitCode: NON_TRANSFERABLE_EXIT,
        });

        expect(await collection.getTokenOf(alice.address)).toBe(0n);
    });

    it('negative - disables direct transfers', async () => {
        const res = await sendTransferAttempt(alice, { newOwner: bob });
        expect(res.transactions).toHaveTransaction({
            to: nftItem.address,
            aborted: true,
            exitCode: NON_TRANSFERABLE_EXIT,
        });

        const nftData = await nftItem.getGetNftData();
        const ownerSlice = nftData.owner_address.loadAddress();
        expect(ownerSlice.toRawString()).toBe(alice.address.toRawString());
        const bobState = await collection.getTokenOf(bob.address);
        expect(bobState).toBe(-1n);
    });
});
