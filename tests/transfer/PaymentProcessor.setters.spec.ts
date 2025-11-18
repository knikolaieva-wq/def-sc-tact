/// <reference types="jest" />

import { Blockchain, TreasuryContract } from '@ton/sandbox';
import type { SandboxContract, SendMessageResult } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import { PaymentProcessor } from '../../build/transfer/PaymentProcessor_PaymentProcessor';
import '@ton/test-utils';

describe('PaymentProcessor - setters', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let platform: SandboxContract<TreasuryContract>;
    let stranger: SandboxContract<TreasuryContract>;
    let paymentProcessor: SandboxContract<PaymentProcessor>;

    const NFT_COLLECTION = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const DEFAULT_BPS = 25n;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        platform = await blockchain.treasury('platform');
        stranger = await blockchain.treasury('stranger');

        paymentProcessor = blockchain.openContract(
            await PaymentProcessor.fromInit(owner.address, platform.address, NFT_COLLECTION)
        );
    });

    const sendSetCommission = async (
        sender: SandboxContract<TreasuryContract>,
        newBps: bigint,
        value: bigint = toNano('0.02')
    ): Promise<SendMessageResult> => {
        return paymentProcessor.send(
            sender.getSender(),
            { value, bounce: true },
            { $$type: 'SetPlatformCommissionBps', newBps } as any
        );
    };

    const commissionFor = (amount: bigint, bps: bigint) => (amount * bps) / 10000n;

    describe('Positive - SetPlatformCommissionBps', () => {
        it('owner can change commission and preview reflects new value', async () => {
            const amount = toNano('1');
            const newBps = 1000n; // 10%

            const res = await sendSetCommission(owner, newBps);
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            const preview = await paymentProcessor.getPreviewPayment(amount, true);
            expect(preview.commission).toBe(commissionFor(amount, newBps));
            expect(preview.totalPay).toBe(amount + commissionFor(amount, newBps));
        });

        it('setting commission to 0 yields zero commission in preview', async () => {
            const amount = toNano('1.5');
            const res = await sendSetCommission(owner, 0n);
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            const preview = await paymentProcessor.getPreviewPayment(amount, true);
            expect(preview.commission).toBe(0n);
            expect(preview.totalPay).toBe(amount);
        });

        it('setting commission to 10000 bps results in 100% commission', async () => {
            const amount = toNano('0.75');
            const res = await sendSetCommission(owner, 10000n);
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            const preview = await paymentProcessor.getPreviewPayment(amount, true);
            expect(preview.commission).toBe(amount);
            expect(preview.totalPay).toBe(amount * 2n);
        });
    });

    describe('Negative - SetPlatformCommissionBps', () => {
        it('non-owner cannot change commission', async () => {
            const amount = toNano('2');
            const res = await sendSetCommission(stranger, 500n);
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });

            const preview = await paymentProcessor.getPreviewPayment(amount, true);
            expect(preview.commission).toBe(commissionFor(amount, DEFAULT_BPS));
            expect(preview.totalPay).toBe(amount + commissionFor(amount, DEFAULT_BPS));
        });

        it('owner cannot set commission above 10000 bps', async () => {
            const amount = toNano('0.5');
            const res = await sendSetCommission(owner, 10001n);
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });

            const preview = await paymentProcessor.getPreviewPayment(amount, true);
            expect(preview.commission).toBe(commissionFor(amount, DEFAULT_BPS));
            expect(preview.totalPay).toBe(amount + commissionFor(amount, DEFAULT_BPS));
        });
    });
});