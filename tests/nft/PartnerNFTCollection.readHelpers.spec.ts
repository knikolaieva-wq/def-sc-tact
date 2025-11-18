/// <reference types="jest" />

import { Blockchain, type SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { PartnerNftCollection, type Mint } from '../../build/nft/PartnerNftCollection_PartnerNftCollection';
import { PartnerNftItem } from '../../build/nft/PartnerNftItem_PartnerNftItem';
import '@ton/test-utils';

const buildOffchainContent = (uri: string): Cell => beginCell().storeUint(1, 8).storeStringTail(uri).endCell();

describe('PartnerNFTCollection - read helpers', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<PartnerNftCollection>;
    let collectionContent: Cell;
    let itemCode: Cell;

    const mintFor = async (wallet: SandboxContract<TreasuryContract>, shareBps: bigint, uri: string) =>
        collection.send(owner.getSender(), { value: toNano('0.25'), bounce: true }, {
            $$type: 'Mint',
            to: wallet.address,
            shareBps,
            uri,
        } satisfies Mint);

    const setWhitelist = async (
        sender: SandboxContract<TreasuryContract>,
        wallet: SandboxContract<TreasuryContract>,
        allowed: boolean
    ) =>
        collection.send(sender.getSender(), { value: toNano('0.1'), bounce: true }, {
            $$type: 'SetWalletWhitelist',
            wallet: wallet.address,
            allowed,
        });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        alice = await blockchain.treasury('alice');

        collectionContent = buildOffchainContent('https://example.com/partner-collection.json');
        const dummyItemInit = await PartnerNftItem.init(owner.address, owner.address, 0n, 'https://dummy', 0n);
        itemCode = dummyItemInit.code;

        collection = blockchain.openContract(
            await PartnerNftCollection.fromInit(owner.address, collectionContent, itemCode)
        );

        await owner.send({ to: collection.address, value: toNano('0.3'), bounce: false });
        await setWhitelist(owner, owner, false); // deploy contract
    });

    describe('Positive', () => {
        it('getPlatformShareBpsForWallet returns live values', async () => {
            expect(await collection.getPlatformShareBpsForWallet(alice.address)).toBe(0n);

            const resAdd = await setWhitelist(owner, alice, true);
            expect(resAdd.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getPlatformShareBpsForWallet(alice.address)).toBe(0n);

            const share = 7777n;
            await mintFor(alice, share, 'ipfs://1');
            expect(await collection.getPlatformShareBpsForWallet(alice.address)).toBe(share);

            const resRemove = await setWhitelist(owner, alice, false);
            expect(resRemove.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getPlatformShareBpsForWallet(alice.address)).toBe(0n);
        });
    });
});
