/// <reference types="jest" />

import { Blockchain, TreasuryContract } from '@ton/sandbox';
import type { SandboxContract, SendMessageResult } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import {
    PaymentProcessor,
    type RegisterPartnerShare,
    type UnregisterPartnerShare,
} from '../../build/transfer/PaymentProcessor_PaymentProcessor';
import '@ton/test-utils';

describe('PaymentProcessor - partner shares', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let seller: SandboxContract<TreasuryContract>;
    let platform: SandboxContract<TreasuryContract>;
    let optional: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<TreasuryContract>;
    let stranger: SandboxContract<TreasuryContract>;
    let paymentProcessor: SandboxContract<PaymentProcessor>;

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

        paymentProcessor = blockchain.openContract(
            await PaymentProcessor.fromInit(owner.address, platform.address, collection.address)
        );

        // Activate contract and fund for gas
        await owner.send({ to: paymentProcessor.address, value: toNano('0.2'), bounce: false });
    });

    const COMMISSION_BPS = 25n; // from contract default
    const calcCommission = (amount: bigint) => (amount * COMMISSION_BPS) / 10000n;

    const getBal = async (w: SandboxContract<TreasuryContract>) => await w.getBalance();
    const approx = (got: bigint, exp: bigint, tol: bigint = 200_000n) => {
        expect(got).toBeGreaterThanOrEqual(exp - tol);
        expect(got).toBeLessThanOrEqual(exp + tol);
    };

    async function sendTransfer(args: {
        value: bigint;
        buyerPaysCommission: boolean;
        amount: bigint;
        buyer: Address;
        seller: Address;
        optionalCommissionWallet?: Address | null;
        deadline: number;
    }): Promise<SendMessageResult> {
        return paymentProcessor.send(
            buyer.getSender(),
            { value: args.value, bounce: true },
            {
                $$type: 'Transfer',
                req: {
                    buyer: args.buyer,
                    seller: args.seller,
                    amount: args.amount,
                    buyerPaysCommission: args.buyerPaysCommission,
                    optionalCommissionWallet: args.optionalCommissionWallet ?? null,
                },
                deadline: BigInt(args.deadline),
            } as any
        );
    }

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

            const sellerBefore = await getBal(seller);
            const platformBefore = await getBal(platform);
            const optionalBefore = await getBal(optional);

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

            const sellerAfter = await getBal(seller);
            const platformAfter = await getBal(platform);
            const optionalAfter = await getBal(optional);

            approx(sellerAfter - sellerBefore, amount);
            approx(platformAfter - platformBefore, platformPart);
            approx(optionalAfter - optionalBefore, optionalPart);
        });

        it('zero or null share removes partner from local registry', async () => {
            const shareBps = 4000n;
            const amount = toNano('0.02');
            const commission = calcCommission(amount);
            const optionalPart = (commission * shareBps) / 10000n;
            const platformFull = commission;

            // 1) Register positive share and verify optional gets a piece
            await registerShare(collection, optional.address, shareBps);

            let sellerBefore = await getBal(seller);
            let platformBefore = await getBal(platform);
            let optionalBefore = await getBal(optional);

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

            let sellerAfter = await getBal(seller);
            let platformAfter = await getBal(platform);
            let optionalAfter = await getBal(optional);

            approx(sellerAfter - sellerBefore, amount);
            approx(platformAfter - platformBefore, platformFull - optionalPart);
            approx(optionalAfter - optionalBefore, optionalPart);

            // 2) Send zero share from collection → entry removed, optional should no longer receive a cut
            const zeroRes = await registerShare(collection, optional.address, 0n);
            expect(zeroRes.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            sellerBefore = await getBal(seller);
            platformBefore = await getBal(platform);
            optionalBefore = await getBal(optional);

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

            sellerAfter = await getBal(seller);
            platformAfter = await getBal(platform);
            optionalAfter = await getBal(optional);

            approx(sellerAfter - sellerBefore, amount);
            approx(platformAfter - platformBefore, platformFull);
            expect(optionalAfter - optionalBefore).toBe(0n);

            // 3) Also verify that sending null share behaves the same (no registry entry)
            const nullRes = await registerShare(collection, optional.address, null);
            expect(nullRes.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            platformBefore = await getBal(platform);
            optionalBefore = await getBal(optional);

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

            platformAfter = await getBal(platform);
            optionalAfter = await getBal(optional);

            approx(platformAfter - platformBefore, platformFull);
            expect(optionalAfter - optionalBefore).toBe(0n);
        });

        it('UnregisterPartnerShare clears partner from local registry', async () => {
            const shareBps = 3000n;
            const amount = toNano('0.015');
            const commission = calcCommission(amount);
            const optionalPart = (commission * shareBps) / 10000n;
            const platformFull = commission;

            // Register partner and confirm it receives a share
            await registerShare(collection, optional.address, shareBps);

            let platformBefore = await getBal(platform);
            let optionalBefore = await getBal(optional);

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

            let platformAfter = await getBal(platform);
            let optionalAfter = await getBal(optional);

            approx(platformAfter - platformBefore, platformFull - optionalPart);
            approx(optionalAfter - optionalBefore, optionalPart);

            // Unregister partner from collection side
            const unregRes = await unregisterShare(collection, optional.address);
            expect(unregRes.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            platformBefore = await getBal(platform);
            optionalBefore = await getBal(optional);

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

            platformAfter = await getBal(platform);
            optionalAfter = await getBal(optional);

            approx(platformAfter - platformBefore, platformFull);
            expect(optionalAfter - optionalBefore).toBe(0n);
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
