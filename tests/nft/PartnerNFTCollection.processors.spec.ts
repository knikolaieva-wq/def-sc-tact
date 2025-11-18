/// <reference types="jest" />

import { Blockchain, type SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import {
    PartnerNftCollection,
    type Mint,
    type Burn,
    type SetTxProcessor,
    type IncrementSuccessfulTx,
} from '../../build/nft/PartnerNftCollection_PartnerNftCollection';
import { PartnerNftItem } from '../../build/nft/PartnerNftItem_PartnerNftItem';
import '@ton/test-utils';

const buildOffchainContent = (uri: string): Cell => beginCell().storeUint(1, 8).storeStringTail(uri).endCell();
const SET_TX_PROCESSOR_OPCODE = 0x791c083b;
const INCREMENT_SUCCESSFUL_TX_OPCODE = 0xb803b08d;

describe('PartnerNFTCollection - processors', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let stranger: SandboxContract<TreasuryContract>;
    let processor: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<PartnerNftCollection>;
    let collectionContent: Cell;
    let itemCode: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        alice = await blockchain.treasury('alice');
        stranger = await blockchain.treasury('stranger');
        processor = await blockchain.treasury('processor');

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

    const setProcessor = async (
        sender: SandboxContract<TreasuryContract>,
        proc: SandboxContract<TreasuryContract>,
        allowed: boolean
    ) =>
        collection.send(sender.getSender(), { value: toNano('0.15'), bounce: true }, {
            $$type: 'SetTxProcessor',
            processor: proc.address,
            allowed,
        } satisfies SetTxProcessor);

    const sendSetProcessorRaw = async (allowed: boolean, processorIsNull = false) => {
        const body = beginCell()
            .storeUint(SET_TX_PROCESSOR_OPCODE, 32)
            .storeAddress(processorIsNull ? null : processor.address)
            .storeBit(allowed ? 1 : 0)
            .endCell();

        return owner.send({ to: collection.address, value: toNano('0.15'), bounce: true, body });
    };

    const incrementFrom = async (
        sender: SandboxContract<TreasuryContract>,
        wallet: SandboxContract<TreasuryContract>
    ) =>
        collection.send(sender.getSender(), { value: toNano('0.1'), bounce: true }, {
            $$type: 'IncrementSuccessfulTx',
            wallet: wallet.address,
        } satisfies IncrementSuccessfulTx);

    const sendIncrementRaw = async (walletIsNull = false) => {
        const body = beginCell()
            .storeUint(INCREMENT_SUCCESSFUL_TX_OPCODE, 32)
            .storeAddress(walletIsNull ? null : alice.address)
            .endCell();

        return processor.send({ to: collection.address, value: toNano('0.1'), bounce: true, body });
    };

    describe('Positive', () => {
        it('owner can set and unset a processor', async () => {
            const enableRes = await setProcessor(owner, processor, true);
            expect(enableRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getIsPaymentProccesorAllowed(processor.address)).toBe(true);

            const disableRes = await setProcessor(owner, processor, false);
            expect(disableRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getIsPaymentProccesorAllowed(processor.address)).toBe(false);
        });

        it('authorized processor increments successful tx count', async () => {
            await mintFor(alice, 100n, 'ipfs://1');
            await setProcessor(owner, processor, true);

            expect(await collection.getSuccessfulTxCountOf(alice.address)).toBe(0n);

            const firstRes = await incrementFrom(processor, alice);
            expect(firstRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getSuccessfulTxCountOf(alice.address)).toBe(1n);

            const secondRes = await incrementFrom(processor, alice);
            expect(secondRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getSuccessfulTxCountOf(alice.address)).toBe(2n);
        });
    });

    describe('Negative', () => {
        it('validates processor management inputs and permissions', async () => {
            const zeroRes = await sendSetProcessorRaw(true, true);
            expect(zeroRes.transactions).toHaveTransaction({ to: collection.address, aborted: true });

            const strangerRes = await setProcessor(stranger, processor, true);
            expect(strangerRes.transactions).toHaveTransaction({ to: collection.address, aborted: true });
            expect(await collection.getIsPaymentProccesorAllowed(processor.address)).toBe(false);
        });

        it('ignores calls from unauthorized processors', async () => {
            await mintFor(alice, 100n, 'ipfs://1');
            expect(await collection.getSuccessfulTxCountOf(alice.address)).toBe(0n);

            const res = await incrementFrom(stranger, alice);
            expect(res.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getSuccessfulTxCountOf(alice.address)).toBe(0n);
        });

        it('requires valid wallets and active tokens when incrementing', async () => {
            await mintFor(alice, 100n, 'ipfs://1');
            await setProcessor(owner, processor, true);

            const zeroWalletRes = await sendIncrementRaw(true);
            expect(zeroWalletRes.transactions).toHaveTransaction({ to: collection.address, aborted: true });

            const strangerRes = await incrementFrom(processor, stranger);
            expect(strangerRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getSuccessfulTxCountOf(stranger.address)).toBe(0n);

            const burnRes = await burnFrom(alice, 0n);
            expect(burnRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });

            const afterBurnRes = await incrementFrom(processor, alice);
            expect(afterBurnRes.transactions).toHaveTransaction({ to: collection.address, aborted: false });
            expect(await collection.getSuccessfulTxCountOf(alice.address)).toBe(0n);
        });
    });
});
