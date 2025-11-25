/// <reference types="jest" />

import { Blockchain, TreasuryContract } from '@ton/sandbox';
import type { SandboxContract, SendMessageResult } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import {
    JettonPaymentProcessor,
    type RegisterPartnerShare,
    type UnregisterPartnerShare,
    loadTokenTransfer,
    storeTransfer,
    type TokenTransfer,
} from '../../build/transfer-usdt/PaymentProcessorUSDT_JettonPaymentProcessor';
import { JettonWalletTemplate } from '../../build/jetton/Jetton_JettonWalletTemplate';
import '@ton/test-utils';

describe('PaymentProcessorUSDT - partner shares', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let seller: SandboxContract<TreasuryContract>;
    let platform: SandboxContract<TreasuryContract>;
    let optional: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<TreasuryContract>;
    let stranger: SandboxContract<TreasuryContract>;
    let jettonMaster: SandboxContract<TreasuryContract>;
    let paymentProcessor: SandboxContract<JettonPaymentProcessor>;
    let jettonWallet: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        buyer = await blockchain.treasury('buyer');
        seller = await blockchain.treasury('seller');
        platform = await blockchain.treasury('platform');
        optional = await blockchain.treasury('optional');
        collection = await blockchain.treasury('collection');
        stranger = await blockchain.treasury('stranger');
        jettonMaster = await blockchain.treasury('jettonMaster');

        const walletCode = (await JettonWalletTemplate.init(jettonMaster.address, owner.address)).code;

        paymentProcessor = blockchain.openContract(
            await JettonPaymentProcessor.fromInit(
                owner.address,
                platform.address,
                collection.address,
                jettonMaster.address,
                walletCode
            )
        );

        // Activate contract and fund for gas
        await owner.send({ to: paymentProcessor.address, value: toNano('0.5'), bounce: false });

        // Deploy by setting default commission
        await paymentProcessor.send(
            owner.getSender(),
            { value: toNano('0.05'), bounce: true },
            { $$type: 'SetPlatformCommissionBps', newBps: 25n } as any
        );

        const cfg = await paymentProcessor.getGetConfig();
        jettonWallet = cfg.jettonWallet;
    });

    const COMMISSION_BPS = 25n; // from contract default
    const calcCommission = (amount: bigint) => (amount * COMMISSION_BPS) / 10000n;

    const collectTokenTransfers = (txs: any[]): TokenTransfer[] => {
        const transfers: TokenTransfer[] = [];
        for (const tx of txs) {
            for (const msg of tx.outMessages.values()) {
                if (msg.info.dest && (msg.info.dest as Address).equals(jettonWallet)) {
                    try {
                        transfers.push(loadTokenTransfer(msg.body.beginParse()));
                    } catch {
                        // ignore non-token messages
                    }
                }
            }
        }
        return transfers;
    };

    const sendTransfer = async (args: {
        value: bigint;
        buyerPaysCommission: boolean;
        amount: bigint;
        buyer: Address;
        seller: Address;
        optionalCommissionWallet?: Address | null;
        deadline: number;
    }): Promise<SendMessageResult> => {
        const commission = calcCommission(args.amount);
        const jettonAmount = args.buyerPaysCommission ? args.amount + commission : args.amount;
        const forwardPayload = beginCell()
            .store(
                storeTransfer({
                    $$type: 'Transfer',
                    req: {
                        buyer: args.buyer,
                        seller: args.seller,
                        amount: args.amount,
                        buyerPaysCommission: args.buyerPaysCommission,
                        optionalCommissionWallet: args.optionalCommissionWallet ?? null,
                    },
                    deadline: BigInt(args.deadline),
                } as any)
            )
            .endCell();

        return paymentProcessor.send(
            blockchain.sender(jettonWallet),
            { value: args.value, bounce: true },
            {
                $$type: 'JettonTransferNotification',
                queryId: 0n,
                amount: jettonAmount,
                sender: args.buyer,
                forwardPayload,
            } as any
        );
    };

    const registerShare = async (
        sender: SandboxContract<TreasuryContract>,
        wallet: Address,
        shareBps: bigint | null
    ): Promise<SendMessageResult> => {
        return paymentProcessor.send(
            sender.getSender(),
            { value: toNano('0.05'), bounce: true },
            {
                $$type: 'RegisterPartnerShare',
                wallet,
                shareBps,
            } satisfies RegisterPartnerShare as any
        );
    };

    const unregisterShare = async (
        sender: SandboxContract<TreasuryContract>,
        wallet: Address
    ): Promise<SendMessageResult> => {
        return paymentProcessor.send(
            sender.getSender(),
            { value: toNano('0.05'), bounce: true },
            {
                $$type: 'UnregisterPartnerShare',
                wallet,
            } satisfies UnregisterPartnerShare as any
        );
    };

    describe('Positive', () => {
        it('collection can register partner share and split commission', async () => {
            const shareBps = 5000n; // 50% of platform commission
            const regRes = await registerShare(collection, optional.address, shareBps);
            expect(regRes.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            const amount = toNano('0.01');
            const commission = calcCommission(amount);
            const optionalPart = (commission * shareBps) / 10000n;
            const platformPart = commission - optionalPart;

            const deadline = blockchain.now!! + 3600;
            const res = await sendTransfer({
                value: toNano('0.06'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: optional.address,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            const transfers = collectTokenTransfers(res.transactions);
            const sellerTransfer = transfers.find((t) => t.destination.equals(seller.address));
            const platformTransfer = transfers.find((t) => t.destination.equals(platform.address));
            const optionalTransfer = transfers.find((t) => t.destination.equals(optional.address));

            expect(sellerTransfer?.amount).toBe(amount);
            expect(platformTransfer?.amount).toBe(platformPart);
            expect(optionalTransfer?.amount).toBe(optionalPart);
        });

        it('zero or null share removes partner from local registry', async () => {
            const shareBps = 4000n;
            const amount = toNano('0.02');
            const commission = calcCommission(amount);
            const optionalPart = (commission * shareBps) / 10000n;
            const platformFull = commission;

            // 1) Register positive share and verify optional gets a piece
            await registerShare(collection, optional.address, shareBps);

            let deadline = blockchain.now!! + 3600;
            let res = await sendTransfer({
                value: toNano('0.06'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: optional.address,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            let transfers = collectTokenTransfers(res.transactions);
            let platformTransfer = transfers.find((t) => t.destination.equals(platform.address));
            let optionalTransfer = transfers.find((t) => t.destination.equals(optional.address));
            let sellerTransfer = transfers.find((t) => t.destination.equals(seller.address));

            expect(sellerTransfer?.amount).toBe(amount);
            expect(platformTransfer?.amount).toBe(platformFull - optionalPart);
            expect(optionalTransfer?.amount).toBe(optionalPart);

            // 2) Send zero share from collection → entry removed, optional should no longer receive a cut
            const zeroRes = await registerShare(collection, optional.address, 0n);
            expect(zeroRes.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            deadline = blockchain.now!! + 3600;
            res = await sendTransfer({
                value: toNano('0.06'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: optional.address,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            transfers = collectTokenTransfers(res.transactions);
            platformTransfer = transfers.find((t) => t.destination.equals(platform.address));
            optionalTransfer = transfers.find((t) => t.destination.equals(optional.address));
            sellerTransfer = transfers.find((t) => t.destination.equals(seller.address));

            expect(sellerTransfer?.amount).toBe(amount);
            expect(platformTransfer?.amount).toBe(platformFull);
            expect(optionalTransfer).toBeUndefined();

            // 3) Also verify that sending null share behaves the same (no registry entry)
            const nullRes = await registerShare(collection, optional.address, null);
            expect(nullRes.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            deadline = blockchain.now!! + 3600;
            res = await sendTransfer({
                value: toNano('0.06'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: optional.address,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            transfers = collectTokenTransfers(res.transactions);
            platformTransfer = transfers.find((t) => t.destination.equals(platform.address));
            optionalTransfer = transfers.find((t) => t.destination.equals(optional.address));

            expect(platformTransfer?.amount).toBe(platformFull);
            expect(optionalTransfer).toBeUndefined();
        });

        it('UnregisterPartnerShare clears partner from local registry', async () => {
            const shareBps = 3000n;
            const amount = toNano('0.015');
            const commission = calcCommission(amount);
            const optionalPart = (commission * shareBps) / 10000n;
            const platformFull = commission;

            // Register partner and confirm it receives a share
            await registerShare(collection, optional.address, shareBps);

            let deadline = blockchain.now!! + 3600;
            let res = await sendTransfer({
                value: toNano('0.06'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: optional.address,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            let transfers = collectTokenTransfers(res.transactions);
            let platformTransfer = transfers.find((t) => t.destination.equals(platform.address));
            let optionalTransfer = transfers.find((t) => t.destination.equals(optional.address));

            expect(platformTransfer?.amount).toBe(platformFull - optionalPart);
            expect(optionalTransfer?.amount).toBe(optionalPart);

            // Unregister partner from collection side
            const unregRes = await unregisterShare(collection, optional.address);
            expect(unregRes.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            deadline = blockchain.now!! + 3600;
            res = await sendTransfer({
                value: toNano('0.06'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: optional.address,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            transfers = collectTokenTransfers(res.transactions);
            platformTransfer = transfers.find((t) => t.destination.equals(platform.address));
            optionalTransfer = transfers.find((t) => t.destination.equals(optional.address));

            expect(platformTransfer?.amount).toBe(platformFull);
            expect(optionalTransfer).toBeUndefined();
        });
    });

    describe('Negative', () => {
        it('only partner collection can manage partner shares', async () => {
            const resRegOwner = await registerShare(owner, optional.address, 5000n);
            expect(resRegOwner.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });

            const resRegStranger = await registerShare(stranger, optional.address, 5000n);
            expect(resRegStranger.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });

            const resUnregOwner = await unregisterShare(owner, optional.address);
            expect(resUnregOwner.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });

            const resUnregStranger = await unregisterShare(stranger, optional.address);
            expect(resUnregStranger.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });
    });
});
