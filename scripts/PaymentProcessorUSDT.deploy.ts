import 'dotenv/config';
import { Address, Cell, toNano } from '@ton/core';
import { type NetworkProvider } from '@ton/blueprint';
import { JettonPaymentProcessor } from '../build/transfer-usdt/PaymentProcessorUSDT_JettonPaymentProcessor';

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

  // master-адрес USDT (тот, что ты дал с tonviewer)
  const jettonMaster = Address.parse(requireEnv('USDT'));

  // код jetton-кошелька в виде base64 BOC
  const jettonWalletCodeHex = requireEnv('USDT_WALLET_CODE_HEX');
  const jettonWalletCode = Cell.fromBoc(Buffer.from(jettonWalletCodeHex, 'hex'))[0];

  const contract = provider.open(
    await JettonPaymentProcessor.fromInit(
      owner,
      mainWallet,
      nftCollection,
      jettonMaster,
      jettonWalletCode,
    ),
  );

  const deployValue = toNano(process.env.PAYMENT_PROCESSOR_DEPLOY_VALUE ?? '0.2');
  await provider.sender().send({
    to: contract.address,
    value: deployValue,
    bounce: false,
    init: contract.init,
  });

  console.log('PaymentProcessorUSDT deployed at', contract.address.toString());
}
