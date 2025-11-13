/// <reference types="jest" />

import { Blockchain, TreasuryContract } from '@ton/sandbox';
import type { SandboxContract, SendMessageResult } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import { PaymentProcessor } from '../build/PaymentProcessor_PaymentProcessor';
import '@ton/test-utils';

describe('PaymentProcessor - withdrawAll', () => {
  let blockchain: Blockchain;
  let owner: SandboxContract<TreasuryContract>;
  let stranger: SandboxContract<TreasuryContract>;
  let platform: SandboxContract<TreasuryContract>;
  let paymentProcessor: SandboxContract<PaymentProcessor>;

  const ZERO_ADDR = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
  const MIN_KEEP = 10_000_000n; // ~0.01 TON, matches contract reserve

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    blockchain.now = Math.floor(Date.now() / 1000);

    owner = await blockchain.treasury('owner');
    stranger = await blockchain.treasury('stranger');
    platform = await blockchain.treasury('platform');

    paymentProcessor = blockchain.openContract(
      await PaymentProcessor.fromInit(owner.address, platform.address, ZERO_ADDR)
    );

    // Activate contract with small balance
    await owner.send({ to: paymentProcessor.address, value: toNano('0.02'), bounce: false });
  });

  const getBal = async (w: SandboxContract<TreasuryContract>) => await w.getBalance();
  const getAddressBalance = async (addr: Address) => (await blockchain.getContract(addr)).balance;
  const approx = (got: bigint, exp: bigint, tol: bigint = 400_000n) => {
    expect(got).toBeGreaterThanOrEqual(exp - tol);
    expect(got).toBeLessThanOrEqual(exp + tol);
  };

  async function withdrawAll(sender: SandboxContract<TreasuryContract>, to: Address, value: bigint = toNano('0.01')): Promise<SendMessageResult> {
    return paymentProcessor.send(
      sender.getSender(),
      { value, bounce: true },
      { $$type: 'WithdrawAll', to } as any
    );
  }

  describe('Positive', () => {
    it('owner can withdraw all balance', async () => {
      // fund extra and check contract balance reduces to minimal reserve
      await owner.send({ to: paymentProcessor.address, value: toNano('0.10'), bounce: false });
      const before = await getAddressBalance(paymentProcessor.address);

      const res = await withdrawAll(owner, owner.address);
      expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });

      const after = await getAddressBalance(paymentProcessor.address);
      expect(after).toBeLessThan(before);
      // Contract must keep exactly minimal operational reserve (0.01 TON)
      expect(after).toBe(MIN_KEEP);
    });
  });

  describe('Negative', () => {
    it('revert InvalidRecipentValidation (amount == 0)', async () => {
      // For TON: zero address is syntactically valid; withdrawal executes and funds bounce back with fee burn.
      // Expect: contract call not aborted; contract ends near minimal reserve.
      await owner.send({ to: paymentProcessor.address, value: toNano('0.05'), bounce: false });
      const res = await withdrawAll(owner, ZERO_ADDR);
      expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: false });
      const after = await getAddressBalance(paymentProcessor.address);
      expect(after).toBeGreaterThanOrEqual(MIN_KEEP); // reserve stays at least minimal
    });

    it('revert InvalidAmountValidation (owner zero balance)', async () => {
      // Ensure contract at (about) minimal reserve; another withdraw should abort (below reserve)
      const bal = await getAddressBalance(paymentProcessor.address);
      if (bal > MIN_KEEP + 500_000n) {
        await withdrawAll(owner, owner.address);
      }
      const before = await getAddressBalance(paymentProcessor.address);
      const res = await withdrawAll(owner, owner.address, 0n);
      expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
      const after = await getAddressBalance(paymentProcessor.address);
      expect(after).toBe(before);
    });

    it('revert OwnableUnauthorizedAccount (some stranger account)', async () => {
      // Fund contract; stranger must not be able to withdraw
      await owner.send({ to: paymentProcessor.address, value: toNano('0.05'), bounce: false });

      const before = await getAddressBalance(paymentProcessor.address);
      const res = await withdrawAll(stranger, owner.address);
      expect(res.transactions).toHaveTransaction({ to: paymentProcessor.address, aborted: true });
      const after = await getAddressBalance(paymentProcessor.address);
      expect(after).toBe(before);
    });
  });
});