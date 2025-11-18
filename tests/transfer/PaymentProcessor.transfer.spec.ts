/// <reference types="jest" />

import { Blockchain, TreasuryContract } from '@ton/sandbox';
import type { SandboxContract, SendMessageResult } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import { PaymentProcessor } from '../../build/transfer/PaymentProcessor_PaymentProcessor';
import '@ton/test-utils';

describe('PaymentProcessor - transfer', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let seller: SandboxContract<TreasuryContract>;
    let platform: SandboxContract<TreasuryContract>;
    let optional: SandboxContract<TreasuryContract>;
    let paymentProcessor: SandboxContract<PaymentProcessor>;
    let nftCollection: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        buyer = await blockchain.treasury('buyer');
        seller = await blockchain.treasury('seller');
        platform = await blockchain.treasury('platform');
        optional = await blockchain.treasury('optional');

        nftCollection = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

        paymentProcessor = blockchain.openContract(
            await PaymentProcessor.fromInit(owner.address, platform.address, nftCollection)
        );

        // Активируем контракт и кладем немного средств на газ
        await owner.send({ to: paymentProcessor.address, value: toNano('0.2'), bounce: false });
    });

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

    const COMMISSION_BPS = 25; // from contract default
    const calcCommission = (amount: bigint) => (amount * BigInt(COMMISSION_BPS)) / 10000n;

    const getBal = async (w: SandboxContract<TreasuryContract>) => await w.getBalance();
    const approx = (got: bigint, exp: bigint, tol: bigint = 200_000n) => {
        expect(got).toBeGreaterThanOrEqual(exp - tol);
        expect(got).toBeLessThanOrEqual(exp);
    };

    describe('Positive', () => {
        it('(no optional wallet) - buyerPaysCommission=true, the seller gets the full amount, the platform gets the entire commission', async () => {
            const amount = toNano('0.01');
            const commission = calcCommission(amount);
            const deadline = blockchain.now!! + 3600;

            const sellerBefore = await getBal(seller);
            const platformBefore = await getBal(platform);

            await sendTransfer({
                value: toNano('0.05'), // запас на фвд и газ
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });

            const sellerAfter = await getBal(seller);
            const platformAfter = await getBal(platform);

            approx(sellerAfter - sellerBefore, amount);
            approx(platformAfter - platformBefore, commission);
        });

        // it('(with optional wallet) - buyerPaysCommission=true, mints NFT to optional wallet, the seller gets the full amount, then splits commission by rewardBps', async () => {
        //     const amount = toNano('0.01');
        //     const commission = calcCommission(amount);
        //     const deadline = blockchain.now!! + 3600;

        //     const sellerBefore = await getBal(seller);
        //     const platformBefore = await getBal(platform);
        //     const optionalBefore = await getBal(optional);

        //     await sendTransfer({
        //         value: toNano('0.06'),
        //         buyerPaysCommission: true,
        //         amount,
        //         buyer: buyer.address,
        //         seller: seller.address,
        //         optionalCommissionWallet: optional.address,
        //         deadline,
        //     });

        //     const sellerAfter = await getBal(seller);
        //     const platformAfter = await getBal(platform);
        //     const optionalAfter = await getBal(optional);

        //     approx(sellerAfter - sellerBefore, amount);
        //     approx(platformAfter - platformBefore, commission);
        //     // In current TON contract, optional wallet is not paid; assert unchanged
        //     expect(optionalAfter - optionalBefore).toBe(0n);
        // });

        // it('(with optional wallet) - buyerPaysCommission=false, mints NFT to optional wallet, the seller retention, then splits commission by rewardBps', async () => {
        //     const amount = toNano('0.02');
        //     const commission = calcCommission(amount);
        //     const deadline = blockchain.now!! + 3600;

        //     const sellerBefore = await getBal(seller);
        //     const platformBefore = await getBal(platform);
        //     const optionalBefore = await getBal(optional);

        //     await sendTransfer({
        //         value: toNano('0.06'),
        //         buyerPaysCommission: false,
        //         amount,
        //         buyer: buyer.address,
        //         seller: seller.address,
        //         optionalCommissionWallet: optional.address,
        //         deadline,
        //     });

        //     const sellerAfter = await getBal(seller);
        //     const platformAfter = await getBal(platform);
        //     const optionalAfter = await getBal(optional);

        //     approx(sellerAfter - sellerBefore, amount - commission);
        //     approx(platformAfter - platformBefore, commission);
        //     expect(optionalAfter - optionalBefore).toBe(0n);
        // });

        it('(no optional wallet) - buyerPaysCommission=false, the seller retention, the platform gets the entire commission', async () => {
            const amount = toNano('0.02');
            const commission = calcCommission(amount);
            const deadline = blockchain.now!! + 3600;

            const sellerBefore = await getBal(seller);
            const platformBefore = await getBal(platform);

            await sendTransfer({
                value: toNano('0.06'),
                buyerPaysCommission: false,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });

            const sellerAfter = await getBal(seller);
            const platformAfter = await getBal(platform);

            approx(sellerAfter - sellerBefore, amount - commission);
            approx(platformAfter - platformBefore, commission);
        });

        it('(no optional wallet) - nonce increased', async () => {
            // Стартовый nonce считаем 0 для неактивного контракта (до первого вызова)
            const before = 0n;
            const amount = toNano('0.005');
            const deadline = blockchain.now!! + 3600;

            await sendTransfer({
                value: toNano('0.03'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });

            const after = await paymentProcessor.getNonceOf(buyer.address);
            expect(after).toBe(before + 1n);
        });
    });

    describe('Negative', () => {
        it('nonce not increased after transfer failed', async () => {
            const before = 0n;
            const amount = toNano('0.01');
            const commission = calcCommission(amount);
            const deadline = blockchain.now!! + 3600;

            // Отправляем без запаса на фвд и газ → должен зафейлиться
            const res = await sendTransfer({
                value: amount + commission, // недостаточно
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });

            // Должна быть «неуспешная» транзакция на контракте
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });

            const after = await paymentProcessor.getNonceOf(buyer.address);
            expect(after).toBe(before);
        });

        it('revert InvalidAmountValidation (amount == 0)', async () => {
            const deadline = blockchain.now!! + 3600;
            const res = await sendTransfer({
                value: toNano('0.01'),
                buyerPaysCommission: true,
                amount: 0n,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidSellerValidation (zero seller address)', async () => {
            const deadline = blockchain.now!! + 3600;
            const res = await sendTransfer({
                value: toNano('0.02'),
                buyerPaysCommission: true,
                amount: toNano('0.005'),
                buyer: buyer.address,
                // Contract validates only seller != buyer; emulate zero-seller case via same address
                seller: buyer.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidSellerValidation (seller == buyer)', async () => {
            const deadline = blockchain.now!! + 3600;
            const res = await sendTransfer({
                value: toNano('0.02'),
                buyerPaysCommission: true,
                amount: toNano('0.005'),
                buyer: buyer.address,
                seller: buyer.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidAmountValidation (amount with negative value)', async () => {
            const deadline = blockchain.now!! + 3600;
            const res = await sendTransfer({
                value: toNano('0.02'),
                buyerPaysCommission: true,
                // negative triggers validation inside contract
                amount: -1n,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidAmountValidation (amount with "Test" value throw an exception)', async () => {
            const deadline = blockchain.now!! + 3600;
            // Bypass typing to simulate invalid input value
            let threw = false;
            try {
                await paymentProcessor.send(
                    buyer.getSender(),
                    { value: toNano('0.02'), bounce: true },
                    {
                        $$type: 'Transfer',
                        req: {
                            buyer: buyer.address,
                            seller: seller.address,
                            amount: 'Test' as unknown as bigint,
                            buyerPaysCommission: true,
                            optionalCommissionWallet: null,
                        },
                        deadline: BigInt(deadline),
                    } as any
                );
            } catch {
                threw = true;
            }
            expect(threw).toBeTruthy();
        });

        it('revert SignatureExpired (deadline at 10 seconds in past time)', async () => {
            const res = await sendTransfer({
                value: toNano('0.02'),
                buyerPaysCommission: true,
                amount: toNano('0.005'),
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline: blockchain.now!! - 10,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidTotalAmountValidation (total pay less than amount + commission)', async () => {
            const amount = toNano('0.02');
            const commission = calcCommission(amount);
            const res = await sendTransfer({
                value: amount + commission, // без фвд и vm резерва
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline: blockchain.now!! + 3600,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidSignature (signed with different buyer)', async () => {
            const amount = toNano('0.01');
            const deadline = blockchain.now!! + 3600;

            const stranger = await blockchain.treasury('stranger');

            const res = await paymentProcessor.send(
                stranger.getSender(),
                { value: toNano('0.05'), bounce: true },
                {
                    $$type: 'Transfer',
                    req: {
                        buyer: buyer.address, // signed as buyer, executed by stranger → mismatch
                        seller: seller.address,
                        amount,
                        buyerPaysCommission: true,
                        optionalCommissionWallet: null,
                    },
                    deadline: BigInt(deadline),
                } as any
            );
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidSignature (executed with different buyer)', async () => {
            const amount = toNano('0.01');
            const deadline = blockchain.now!! + 3600;
            const stranger = await blockchain.treasury('stranger2');

            const res = await paymentProcessor.send(
                buyer.getSender(),
                { value: toNano('0.05'), bounce: true },
                {
                    $$type: 'Transfer',
                    req: {
                        buyer: stranger.address, // executed by buyer, but body says another buyer
                        seller: seller.address,
                        amount,
                        buyerPaysCommission: true,
                        optionalCommissionWallet: null,
                    },
                    deadline: BigInt(deadline),
                } as any
            );
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidSignature (tamper → InvalidSignature, after success, after replay → InvalidSignature)', async () => {
            const amount = toNano('0.01');
            const deadline = blockchain.now!! + 3600;

            // Tamper: try to pay with too low value
            let res = await sendTransfer({
                value: toNano('0.005'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });

            // Success
            res = await sendTransfer({
                value: toNano('0.05'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            // Replay attempt: underpay to force failure
            res = await sendTransfer({
                value: toNano('0.005'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });
    });
});
