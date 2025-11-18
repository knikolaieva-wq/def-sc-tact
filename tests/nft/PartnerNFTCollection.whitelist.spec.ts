/// <reference types="jest" />

import { Blockchain, type SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { PartnerNftCollection, type Mint, type Burn } from '../../build/nft/PartnerNftCollection_PartnerNftCollection';
import { PartnerNftItem } from '../../build/nft/PartnerNftItem_PartnerNftItem';
import '@ton/test-utils';

const buildOffchainContent = (uri: string): Cell => beginCell().storeUint(1, 8).storeStringTail(uri).endCell();
const SET_WHITELIST_OPCODE = 0x1599f05f;

describe('PartnerNFTCollection - whitelist', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let stranger: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<PartnerNftCollection>;
    let itemCode: Cell;
    let collectionContent: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        alice = await blockchain.treasury('alice');
        stranger = await blockchain.treasury('stranger');

        collectionContent = buildOffchainContent('https://example.com/partner-collection.json');
        const dummyItemInit = await PartnerNftItem.init(owner.address, owner.address, 0n, 'https://dummy', 0n);
        itemCode = dummyItemInit.code;

        collection = blockchain.openContract(
            await PartnerNftCollection.fromInit(owner.address, collectionContent, itemCode)
        );

        await owner.send({ to: collection.address, value: toNano('0.3'), bounce: false });
    });

    const mintFor = async (wallet: SandboxContract<TreasuryContract>, shareBps: bigint, uri: string) =>
        collection.send(owner.getSender(), { value: toNano('0.25'), bounce: true }, {
            $$type: 'Mint',
            to: wallet.address,
            shareBps,
            uri,
        } satisfies Mint);

    const burnFrom = async (wallet: SandboxContract<TreasuryContract>, tokenId: bigint) =>
        collection.send(wallet.getSender(), { value: toNano('0.1'), bounce: true }, {
            $$type: 'Burn',
            tokenId,
        } satisfies Burn);

    const setWhitelist = async (
        sender: SandboxContract<TreasuryContract>,
        wallet: SandboxContract<TreasuryContract>,
        allowed: boolean
    ) =>
        collection.send(sender.getSender(), { value: toNano('0.15'), bounce: true }, {
            $$type: 'SetWalletWhitelist',
            wallet: wallet.address,
            allowed,
        });

    const sendWhitelistRaw = async (allowed: boolean, walletIsNull = false) => {
        const body = beginCell()
            .storeUint(SET_WHITELIST_OPCODE, 32)
            .storeAddress(walletIsNull ? null : alice.address)
            .storeBit(allowed ? 1 : 0)
            .endCell();
        return owner.send({ to: collection.address, value: toNano('0.1'), bounce: true, body });
    };

    describe('Positive', () => {
        it('owner can add and remove wallets', async () => {
            await mintFor(alice, 100n, 'ipfs://alice');
            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(true);

            const removeRes = await setWhitelist(owner, alice, false);
            expect(removeRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(false);

            const addRes = await setWhitelist(owner, alice, true);
            expect(addRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(true);
        });

        it('isWalletWhitelisted requires both whitelist flag and balance', async () => {
            const addRes = await setWhitelist(owner, alice, true);
            expect(addRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(false);

            await mintFor(alice, 100n, 'ipfs://alice');
            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(true);

            const burnRes = await burnFrom(alice, 0n);
            expect(burnRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(false);
        });
    });

    describe('Negative', () => {
        it('rejects zero address operations', async () => {
            const addRes = await sendWhitelistRaw(true, true);
            expect(addRes.transactions).toHaveTransaction({ to: collection.address, aborted: true });

            const removeRes = await sendWhitelistRaw(false, true);
            expect(removeRes.transactions).toHaveTransaction({ to: collection.address, aborted: true });
        });

        it('blocks non-owners from managing the whitelist', async () => {
            const addRes = await setWhitelist(stranger, alice, true);
            expect(addRes.transactions).toHaveTransaction({ to: collection.address, aborted: true });

            await mintFor(alice, 100n, 'ipfs://alice');
            const removeRes = await setWhitelist(stranger, alice, false);
            expect(removeRes.transactions).toHaveTransaction({ to: collection.address, aborted: true });

            expect(await collection.getIsWalletWhitelisted(alice.address)).toBe(true);
        });
    });
});
