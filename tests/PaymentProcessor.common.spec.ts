/// <reference types="jest" />

import { Blockchain, TreasuryContract } from '@ton/sandbox';
import type { SandboxContract, SendMessageResult } from '@ton/sandbox';
import { Address, toNano } from '@ton/core';
import { PaymentProcessor } from '../build/PaymentProcessor_PaymentProcessor';
import '@ton/test-utils';

describe('PaymentProcessor - common', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let seller: SandboxContract<TreasuryContract>;
    let platform: SandboxContract<TreasuryContract>;
    let paymentProcessor: SandboxContract<PaymentProcessor>;

    const NFT_COLLECTION = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const DEFAULT_BPS = 25n;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        owner = await blockchain.treasury('owner');
        buyer = await blockchain.treasury('buyer');
        seller = await blockchain.treasury('seller');
        platform = await blockchain.treasury('platform');

        paymentProcessor = blockchain.openContract(
            await PaymentProcessor.fromInit(owner.address, platform.address, NFT_COLLECTION)
        );

        // Activate contract storage
        await owner.send({ to: paymentProcessor.address, value: toNano('0.2'), bounce: false });
    });

    it('deploy - mainCommissionWallet and nft address save correctly', async () => {
        // First inbound message deploys contract (set to same default BPS)
        await paymentProcessor.send(
            owner.getSender(),
            { value: toNano('0.05'), bounce: true },
            { $$type: 'SetPlatformCommissionBps', newBps: DEFAULT_BPS } as any
        );

        const cfg = await paymentProcessor.getGetConfig();
        expect(cfg.owner.toRawString()).toBe(owner.address.toRawString());
        expect(cfg.mainCommissionWallet.toRawString()).toBe(platform.address.toRawString());
        expect(cfg.nftCollection.toRawString()).toBe(NFT_COLLECTION.toRawString());
        expect(cfg.platformCommissionBps).toBe(DEFAULT_BPS);
    });
});
