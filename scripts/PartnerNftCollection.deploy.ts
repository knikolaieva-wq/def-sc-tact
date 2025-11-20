import 'dotenv/config';
import { Address, beginCell, toNano } from '@ton/core';
import { type NetworkProvider, compile } from '@ton/blueprint';
import { PartnerNftCollection } from '../build/nft/PartnerNftCollection_PartnerNftCollection';

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

function buildOffchainContent(uri: string) {
  return beginCell().storeUint(1, 8).storeStringTail(uri).endCell();
}

export async function run(provider: NetworkProvider) {
  const owner = Address.parse(requireEnv('OWNER'));
  const uri = requireEnv('DEFNFT_COLLECTION_CONTENT');
  const collectionContent = buildOffchainContent(uri);
  const itemCode = await compile('PartnerNftItem');

  const init = await PartnerNftCollection.fromInit(owner, collectionContent, itemCode);
  const collection = provider.open(init);

  const deployValue = toNano(process.env.DEFNFT_DEPLOY_VALUE ?? '0.05');
  await provider.sender().send({
    to: collection.address,
    value: deployValue,
    bounce: false,
    init: collection.init,
  });
  
  console.log('PartnerNftCollection deployed at', collection.address.toString());
}
