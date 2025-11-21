import 'dotenv/config';
import { Address, Cell, beginCell, toNano } from '@ton/core';
import { TonClient, TupleBuilder } from '@ton/ton';
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
  const jettonMaster = Address.parse(requireEnv('USDT'));

  const contract = provider.open(
    await JettonPaymentProcessor.fromInit(
      owner,
      mainWallet,
      nftCollection,
      jettonMaster
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
  // 3) Считаем jetton-кошелёк ЭТОГО контракта
  //    ВАЖНО: тут используем адрес только что задеплоенного processor’а
  const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC'; // или свой
  const client = new TonClient({ endpoint });

  const tb = new TupleBuilder();
  tb.writeAddress(contract.address);

  const res = await client.runMethod(jettonMaster, 'get_wallet_address', tb.build());
  const processorJettonWallet = res.stack.readAddress();

  console.log('Processor jetton wallet:', processorJettonWallet.toString());

  // 4) Отправляем от OWNER сообщение SetJettonWallet{ newWallet = processorJettonWallet }
  const opSetJettonWallet = 0xccd3ca15; // тот же, что в контракте

  const body: Cell = beginCell()
    .storeUint(opSetJettonWallet, 32)           // можно number, можно BigInt
    .storeAddress(processorJettonWallet)       // Address из TonClient.runMethod
    .endCell();

  await provider.sender().send({
    to: contract.address,
    value: toNano('0.05'), // газ на конфиг
    bounce: true,
    body,
  });

  console.log('SetJettonWallet sent');
}
