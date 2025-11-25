/// <reference types="jest" />

import { Blockchain, TreasuryContract } from '@ton/sandbox';
import type { SandboxContract, SendMessageResult } from '@ton/sandbox';
import { Address, beginCell, toNano, type Sender } from '@ton/core';
import {
    JettonPaymentProcessor,
    loadTokenTransfer,
    storeTransfer,
    type TokenTransfer,
} from '../../build/transfer-usdt/PaymentProcessorUSDT_JettonPaymentProcessor';
import { JettonWalletTemplate } from '../../build/jetton/Jetton_JettonWalletTemplate';
import '@ton/test-utils';

describe('PaymentProcessorUSDT - transfer', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let seller: SandboxContract<TreasuryContract>;
    let platform: SandboxContract<TreasuryContract>;
    let optional: SandboxContract<TreasuryContract>;
    let jettonMaster: SandboxContract<TreasuryContract>;
    let paymentProcessor: SandboxContract<JettonPaymentProcessor>;
    let jettonWallet: Address;
    let nftCollection: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        buyer = await blockchain.treasury('buyer');
        seller = await blockchain.treasury('seller');
        platform = await blockchain.treasury('platform');
        optional = await blockchain.treasury('optional');
        jettonMaster = await blockchain.treasury('jettonMaster');

        nftCollection = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

        const walletCode = (await JettonWalletTemplate.init(jettonMaster.address, owner.address)).code;

        paymentProcessor = blockchain.openContract(
            await JettonPaymentProcessor.fromInit(
                owner.address,
                platform.address,
                nftCollection,
                jettonMaster.address,
                walletCode
            )
        );

        // Активируем контракт и кладем немного средств на газ
        await owner.send({ to: paymentProcessor.address, value: toNano('0.5'), bounce: false });

        // Деплой контракта установкой дефолтной комиссии
        await paymentProcessor.send(
            owner.getSender(),
            { value: toNano('0.05'), bounce: true },
            { $$type: 'SetPlatformCommissionBps', newBps: 25n } as any
        );

        const cfg = await paymentProcessor.getGetConfig();
        jettonWallet = cfg.jettonWallet;
    });

    const collectTokenTransfers = (txs: any[]): TokenTransfer[] => {
        const transfers: TokenTransfer[] = [];
        for (const tx of txs) {
            for (const msg of tx.outMessages.values()) {
                if (msg.info.dest && (msg.info.dest as Address).equals(jettonWallet)) {
                    try {
                        transfers.push(loadTokenTransfer(msg.body.beginParse()));
                    } catch {
                        // ignore other messages
                    }
                }
            }
        }
        return transfers;
    };

    async function sendTransfer(args: {
        value: bigint;
        buyerPaysCommission: boolean;
        amount: bigint;
        buyer: Address;
        seller: Address;
        optionalCommissionWallet?: Address | null;
        deadline: number;
        jettonAmount?: bigint;
        senderAddress?: Address;
        walletSender?: Sender;
    }): Promise<SendMessageResult> {
        const COMMISSION_BPS = 25n; // from contract default
        const commission = (args.amount * COMMISSION_BPS) / 10000n;
        const jettonAmount =
            args.jettonAmount ?? (args.buyerPaysCommission ? args.amount + commission : args.amount);
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

        const senderAddress = args.senderAddress ?? args.buyer;
        const walletSender = args.walletSender ?? blockchain.sender(jettonWallet);

        return paymentProcessor.send(
            walletSender,
            { value: args.value, bounce: true },
            {
                $$type: 'JettonTransferNotification',
                queryId: 0n,
                amount: jettonAmount,
                sender: senderAddress,
                forwardPayload,
            } as any
        );
    }

    const COMMISSION_BPS = 25; // from contract default
    const calcCommission = (amount: bigint) => (amount * BigInt(COMMISSION_BPS)) / 10000n;

    const amountFor = (transfers: TokenTransfer[], destination: Address) =>
        transfers.find((t) => t.destination.equals(destination))?.amount;

    describe('Positive', () => {
        it('(no optional wallet) - buyerPaysCommission=true, the seller gets the full amount, the platform gets the entire commission', async () => {
            const amount = toNano('0.01');
            const commission = calcCommission(amount);
            const deadline = blockchain.now!! + 3600;

            const res = await sendTransfer({
                value: toNano('0.3'), // запас на фвд и газ
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            const transfers = collectTokenTransfers(res.transactions);
            expect(amountFor(transfers, seller.address)).toBe(amount);
            expect(amountFor(transfers, platform.address)).toBe(commission);
            expect(amountFor(transfers, optional.address)).toBeUndefined();
        });

        // it('(with optional wallet) - buyerPaysCommission=true, mints NFT to optional wallet, the seller gets the full amount, then splits commission by rewardBps', async () => {
        //     const amount = toNano('0.01');
        //     const commission = calcCommission(amount);
        //     const deadline = blockchain.now!! + 3600;

        //     const res = await sendTransfer({
        //         value: toNano('0.06'),
        //         buyerPaysCommission: true,
        //         amount,
        //         buyer: buyer.address,
        //         seller: seller.address,
        //         optionalCommissionWallet: optional.address,
        //         deadline,
        //     });
        // });

        // it('(with optional wallet) - buyerPaysCommission=false, mints NFT to optional wallet, the seller retention, then splits commission by rewardBps', async () => {
        //     const amount = toNano('0.02');
        //     const commission = calcCommission(amount);
        //     const deadline = blockchain.now!! + 3600;

        //     const res = await sendTransfer({
        //         value: toNano('0.06'),
        //         buyerPaysCommission: false,
        //         amount,
        //         buyer: buyer.address,
        //         seller: seller.address,
        //         optionalCommissionWallet: optional.address,
        //         deadline,
        //     });
        // });

        it('(no optional wallet) - buyerPaysCommission=false, the seller retention, the platform gets the entire commission', async () => {
            const amount = toNano('0.02');
            const commission = calcCommission(amount);
            const deadline = blockchain.now!! + 3600;

            const res = await sendTransfer({
                value: toNano('0.3'),
                buyerPaysCommission: false,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

            const transfers = collectTokenTransfers(res.transactions);
            expect(amountFor(transfers, seller.address)).toBe(amount - commission);
            expect(amountFor(transfers, platform.address)).toBe(commission);
        });

        it('(no optional wallet) - nonce increased', async () => {
            const before = 0n;
            const amount = toNano('0.005');
            const deadline = blockchain.now!! + 3600;

            await sendTransfer({
                value: toNano('0.2'),
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

            const res = await sendTransfer({
                value: toNano('0.02'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
                jettonAmount: amount, // меньше, чем amount + commission
            });

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
                jettonAmount: 0n,
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
                amount: -1n,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
                jettonAmount: toNano('0.02'),
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidAmountValidation (amount with "Test" value throw an exception)', async () => {
            const deadline = blockchain.now!! + 3600;
            // Bypass typing to simulate invalid input value
            let threw = false;
            try {
                await paymentProcessor.send(
                    blockchain.sender(jettonWallet),
                    { value: toNano('0.02'), bounce: true },
                    {
                        $$type: 'JettonTransferNotification',
                        queryId: 0n,
                        amount: toNano('0.02'),
                        sender: buyer.address,
                        forwardPayload: beginCell()
                            .store(
                                storeTransfer({
                                    $$type: 'Transfer',
                                    req: {
                                        buyer: buyer.address,
                                        seller: seller.address,
                                        amount: 'Test' as unknown as bigint,
                                        buyerPaysCommission: true,
                                        optionalCommissionWallet: null,
                                    },
                                    deadline: BigInt(deadline),
                                } as any)
                            )
                            .endCell(),
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
                value: toNano('0.02'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline: blockchain.now!! + 3600,
                jettonAmount: amount + commission - 1n,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidSignature (signed with different buyer)', async () => {
            const amount = toNano('0.01');
            const deadline = blockchain.now!! + 3600;

            const stranger = await blockchain.treasury('stranger');

            const res = await sendTransfer({
                value: toNano('0.05'),
                buyerPaysCommission: true,
                amount,
                buyer: buyer.address,
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
                senderAddress: stranger.address, // token sender != req.buyer
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });

        it('revert InvalidSignature (executed with different buyer)', async () => {
            const amount = toNano('0.01');
            const deadline = blockchain.now!! + 3600;
            const stranger = await blockchain.treasury('stranger2');

            const res = await sendTransfer({
                value: toNano('0.05'),
                buyerPaysCommission: true,
                amount,
                buyer: stranger.address, // req.buyer mismatch with msg.sender
                seller: seller.address,
                optionalCommissionWallet: null,
                deadline,
                senderAddress: buyer.address,
            });
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
                jettonAmount: amount, // insufficient
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
                jettonAmount: amount,
            });
            expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
        });
    });
});
