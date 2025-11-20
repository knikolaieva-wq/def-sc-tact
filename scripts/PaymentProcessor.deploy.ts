import 'dotenv/config';
import { Address, toNano } from '@ton/core';
import { type NetworkProvider } from '@ton/blueprint';
import { PaymentProcessor } from '../build/transfer/PaymentProcessor_PaymentProcessor';

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

export async function run(provider: NetworkProvider) {
  const owner = Address.parse(requireEnv('OWNER'));
  const mainWallet = Address.parse(requireEnv('MAIN_COMMISSION_WALLET'));
  const nftCollection = Address.parse(requireEnv('NFT_COLLECTION'));

  const contract = provider.open(await PaymentProcessor.fromInit(owner, mainWallet, nftCollection));
  const deployValue = toNano(process.env.PAYMENT_PROCESSOR_DEPLOY_VALUE ?? '0.2');

  await provider.sender().send({
    to: contract.address,
    value: deployValue,
    bounce: false,
    init: contract.init,
  });

  console.log('PaymentProcessor deployed at', contract.address.toString());
}
