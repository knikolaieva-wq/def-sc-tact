import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Address, beginCell, Cell, contractAddress, toNano } from '@ton/core';
import { TonClient, WalletContractV4, internal, fromNano } from '@ton/ton';
import { mnemonicToPrivateKey, keyPairFromSecretKey } from 'ton-crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NFT_BUILD = path.join(ROOT, 'build', 'nft');

function loadDotEnv(file = path.join(ROOT, '.env')) {
  try {
    if (!existsSync(file)) return;
    const content = readFileSync(file, 'utf8');
    for (const raw of content.split(/\r?\n/)) {
      if (!raw || raw.trim().startsWith('#')) continue;
      const eq = raw.indexOf('=');
      if (eq === -1) continue;
      const key = raw.slice(0, eq).trim();
      const val = raw.slice(eq + 1).replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
}

loadDotEnv();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { network: 'testnet' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--network') out.network = args[++i];
    else if (a === '--owner') out.owner = args[++i];
    else if (a === '--value') out.value = args[++i];
    else if (a === '--content') out.content = args[++i];
  }
  return out;
}

async function getClient(network) {
  const apiKey = process.env.TON_API_KEY || process.env.TONCENTER_API_KEY || undefined;
  let endpoint =
    process.env.RPC_ENDPOINT ||
    (network === 'testnet'
      ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
      : 'https://toncenter.com/api/v2/jsonRPC');
  if (apiKey && /toncenter\.com/.test(endpoint)) {
    const url = new URL(endpoint);
    url.searchParams.set('api_key', apiKey);
    endpoint = url.toString();
  }
  return new TonClient({ endpoint, apiKey });
}

async function loadDeployerWallet(client) {
  const mn = process.env.MNEMONIC && process.env.MNEMONIC.trim();
  const pkHex = process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.trim();
  if (!mn && !pkHex) throw new Error('Set MNEMONIC or PRIVATE_KEY in .env');

  let keyPair;
  if (mn) {
    keyPair = await mnemonicToPrivateKey(mn.split(/\s+/g));
  } else {
    const sk = Buffer.from(pkHex, 'hex');
    keyPair = keyPairFromSecretKey(sk);
  }

  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const contract = client.open(wallet);
  return { wallet, contract, keyPair };
}

function loadCodeCell(basePath) {
  try {
    const boc = readFileSync(`${basePath}.code.boc`);
    return Cell.fromBoc(boc)[0];
  } catch (err) {
    const pkg = JSON.parse(readFileSync(`${basePath}.pkg`, 'utf8'));
    if (!pkg.code) throw err;
    return Cell.fromBoc(Buffer.from(pkg.code, 'base64'))[0];
  }
}

function buildCommentCell(text) {
  const builder = beginCell();
  builder.storeUint(0, 32);
  builder.storeStringTail(text);
  return builder.endCell();
}

function buildCollectionInit(owner, collectionContent, itemCode) {
  const codeHex =
    'b5ee9c7241023d01000dc8000114ff00f4a413f4bcf2c80b01020162022903f4d001d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018e24fa40810101d700d4d401d0d4f404f404d430d0f404f404f404f40430107a107910786c1a8e12fa40d4d4552003d158706d43306d6d6d6d6de20b925f0be009d70d1ff2e082218210157c62bbbae302218210ca9e378abae30221031f2302fe31fa40810101d700d430d0109a108a107a106a105a104a103a4abc8200bb75f8422bc705f2f48200bc542cc2ff952c812710bb9170e2f2f4814a838b0852e001f90101f901bdf2f42481010b2c8101014133f40a6fa19401d70030925b6de2206eb3923070df8200a98101c000f2f428a40ddb3c109a1d1817506d1514433004060142c87001cb1f6f00016f8c6d6f8c01db3c6f2201c993216eb396016f2259ccc9e8310500b620d74a21d7499720c20022c200b18e48036f22807f22cf31ab02a105ab025155b60820c2009a20aa0215d71803ce4014de596f025341a1c20099c8016f025044a1aa028e123133c20099d430d020d74a21d749927020e2e2e85f0303e0db3c546cc311102fdb3c5c705920f90022f9005ad76501d76582020134c8cb17cb0fcb0fcbffcbff71f90400c87401cb0212ca07cbffc9d00f8101012d5611206e953059f45a30944133f414e20681010b53ed810101216e955b59f4593098c801cf004133f441e21781010b500e7f7107081d0004f828013888c87001ca0055415045ce12ce810101cf00cc01c8810101cf00cdc9090114ff00f4a413f4bcf2c80b0a0201620b0f02eed001d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018e22fa40d72c01916d93fa4001e201810101d700d4d401d0810101d70030151443306c158e1bfa40fa40810101d700d4d401d0810101d700301514433005d15503e206925f06e004d70d1ff2e0822182100f8a7ea5bae302210c0d007a31fa403010344135816ff9f84226c705f2f433103458c87f01ca0055405045ce58206e9430cf84809201cee2810101cf00cc01c8810101cf00cdc9ed54019e8210ca9e378aba8e365b4034816ff9f84226c705f2f46d34c87f01ca0055405045ce58206e9430cf84809201cee2810101cf00cc01c8810101cf00cdc9ed54e0018210946a98b6bae3025f06f2c0820e00bed33f30c8018210aff90f5758cb1fcb3fc910354430f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb00c87f01ca0055405045ce58206e9430cf84809201cee2810101cf00cc01c8810101cf00cdc9ed5402012010150201201113019dbb9a5ed44d0d200018e22fa40d72c01916d93fa4001e201810101d700d4d401d0810101d70030151443306c158e1bfa40fa40810101d700d4d401d0810101d700301514433005d15503e2db3c6c51812000223019dbba7bed44d0d200018e22fa40d72c01916d93fa4001e201810101d700d4d401d0810101d70030151443306c158e1bfa40fa40810101d700d4d401d0810101d700301514433005d15503e2db3c6c518140002220201481618019db5f9fda89a1a400031c45f481ae580322db27f48003c403020203ae01a9a803a1020203ae00602a288660d82b1c37f481f481020203ae01a9a803a1020203ae00602a2886600ba2aa07c5b678d8ab017006c236e91709171e2246e8e248d08600000000000000000000000000000000000000000000000000000000000000000049124e25464702502039450191b019bbb9ed44d0d200018e22fa40d72c01916d93fa4001e201810101d700d4d401d0810101d70030151443306c158e1bfa40fa40810101d700d4d401d0810101d700301514433005d15503e2db3c6c5181a000221019bbbbed44d0d200018e22fa40d72c01916d93fa4001e201810101d700d4d401d0810101d70030151443306c158e1bfa40fa40810101d700d4d401d0810101d700301514433005d15503e2db3c6c5181c00022001f2216e955b59f4593098c801cf004133f441e28101012010464d301f216e955b59f45a3098c801cf004133f442e2102c820afaf080725a6d40e7103555127fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0010591048103710265e22121e0058c87f01ca005590509ace17810101cf0015cc03c8cc12f400f40002c8f40013f40013f40013f400cdcdc9ed5402fe31810101d70030f8422481010b228101014133f40a6fa19401d70030925b6de2206eb392307fdf8114065113baf2f42b8101012359f40c6fa192306ddf8115db216eb3f2f4c88210ca9e378a01cb1fc98209312d0001706d50426d50427fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf818ae2f400c9012021001a58cf8680cf8480f400f400cf8101e8fb000481010b2570810101216e955b59f4593098c801cf004133f441e21581010b50056d71216e955b59f4593098c801cf004133f441e28101016d5316104659216e955b59f45a3098c801cf004133f442e28101016d5316104559216e955b59f45a3098c801cf004133f442e21a81010150056d22008c206e953059f45a30944133f414e210791068105710465e314330c87f01ca005590509ace17810101cf0015cc03c8cc12f400f40002c8f40013f40013f40013f400cdcdc9ed5401f482102231a99dba8e6f31fa4030108910781067105610451034413a8200bb75f8422bc705f2f41581010b500b7f71216e955b59f4593098c801cf004133f441e2108910781067050610344130c87f01ca005590509ace17810101cf0015cc03c8cc12f400f40002c8f40013f40013f40013f400cdcdc9ed54e0212401f48210871d66ebba8e6f31fa4030108910781067105610451034413a8200bb75f8422bc705f2f41581010b500b6d71216e955b59f4593098c801cf004133f441e2108910781067050610344130c87f01ca005590509ace17810101cf0015cc03c8cc12f400f40002c8f40013f40013f40013f400cdcdc9ed54e0212502f68210791c083bba8e6631fa40d2003050ab8200bb75f8422bc705f2f481010b401350bc71216e955b59f4593098c801cf004133f441e210791068105710461035440302c87f01ca005590509ace17810101cf0015cc03c8cc12f400f40002c8f40013f40013f40013f400cdcdc9ed54e0218210b803b08dbae30201262801fe31fa4030108910781067105610451034413a81010bf8422359714133f40a6fa19401d70030925b6de2206eb3923070df8119ca01f2f481010b54451c8101014133f40a6fa19401d70030925b6de2206eb3923070df8115db21c300f2f481010154530052304133f40c6fa19401d70030925b6de2206eb3923070df810101012700a4a42110451023216e955b59f45a3098c801cf004133f442e21089107810671056104510344013c87f01ca005590509ace17810101cf0015cc03c8cc12f400f40002c8f40013f40013f40013f400cdcdc9ed5400fc8210946a98b6ba8e6fd33f30c8018210aff90f5758cb1fcb3fc9108a10791068105710461035443012f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb00c87f01ca005590509ace17810101cf0015cc03c8cc12f400f40002c8f40013f40013f40013f400cdcdc9ed54e05f0bf2c0820201202a350201202b300201202c2e0193b56bbda89a1a400031c49f481020203ae01a9a803a1a9e809e809a861a1e809e809e809e8086020f420f220f0d8351c25f481a9a8aa4007a2b0e0da8660dadadadadbc4aa33b678d94302d0002310193b6ec3da89a1a400031c49f481020203ae01a9a803a1a9e809e809a861a1e809e809e809e8086020f420f220f0d8351c25f481a9a8aa4007a2b0e0da8660dadadadadbc4aa13b678d94302f00c02681010b22714133f40a6fa19401d70030925b6de2206eb3923070df923070e181010b26028101014133f40a6fa19401d70030925b6de2206eb3923070df20923070e1810101530550334133f40c6fa19401d70030925b6de2206eb3923070df02012031330193b7de1da89a1a400031c49f481020203ae01a9a803a1a9e809e809a861a1e809e809e809e8086020f420f220f0d8351c25f481a9a8aa4007a2b0e0da8660dadadadadbc4aa13b678d943032003c81010b26028101014133f40a6fa19401d70030925b6de2206eb3923070df0193b4f47da89a1a400031c49f481020203ae01a9a803a1a9e809e809a861a1e809e809e809e8086020f420f220f0d8351c25f481a9a8aa4007a2b0e0da8660dadadadadbc4aa13b678d943034002e810101220259f40c6fa192306ddf82008dd5216eb3f2f40201203638018fb905bed44d0d200018e24fa40810101d700d4d401d0d4f404f404d430d0f404f404f404f40430107a107910786c1a8e12fa40d4d4552003d158706d43306d6d6d6d6de2db3c6ca38370006547879020120393b0193b5cedda89a1a400031c49f481020203ae01a9a803a1a9e809e809a861a1e809e809e809e8086020f420f220f0d8351c25f481a9a8aa4007a2b0e0da8660dadadadadbc4aa13b678d94303a008081010b26028101014133f40a6fa19401d70030925b6de2206eb3923070df20923070e1810101530450334133f40c6fa19401d70030925b6de2206eb3923070df0193b4c79da89a1a400031c49f481020203ae01a9a803a1a9e809e809a861a1e809e809e809e8086020f420f220f0d8351c25f481a9a8aa4007a2b0e0da8660dadadadadbc4aa13b678d94303c00862681010b22714133f40a6fa19401d70030925b6de2206eb3923070df81010b5447138101014133f40a6fa19401d70030925b6de2206eb3923070df0192c300923070e2fb64dc40';
  const code = Cell.fromHex(codeHex);
  const builder = beginCell();
  builder.storeUint(0, 1);
  builder.storeAddress(owner);
  builder.storeRef(collectionContent);
  builder.storeRef(itemCode);
  return { code, data: builder.endCell() };
}

async function main() {
  const args = parseArgs();
  const OWNER = (args.owner || process.env.DEFNFT_OWNER || process.env.OWNER || '').trim();
  if (!OWNER) throw new Error('Missing constructor param OWNER (pass --owner or set DEFNFT_OWNER)');

  console.log('Compiling Tact contracts…');
  execSync('npx tact -c tact.config.json', { cwd: ROOT, stdio: 'inherit' });

  const itemCodeBase = path.join(NFT_BUILD, 'PartnerNftItem_PartnerNftItem');
  const itemCode = loadCodeCell(itemCodeBase);
  const contentText =
    args.content || process.env.DEFNFT_COLLECTION_CONTENT || 'Partner NFT Collection';
  const collectionContent = buildCommentCell(contentText);
  const ownerAddress = Address.parse(OWNER);

  console.log('Building state init…');
  const init = buildCollectionInit(ownerAddress, collectionContent, itemCode);
  const contractAddr = contractAddress(0, init);
  console.log('Collection address:', contractAddr.toString());

  const client = await getClient(args.network);
  const { wallet, contract: walletContract, keyPair } = await loadDeployerWallet(client);

  const balance = await walletContract.getBalance().catch(() => null);
  if (balance !== null) {
    console.log('Deployer wallet:', wallet.address.toString(), '| balance', fromNano(balance), 'TON');
  } else {
    console.log('Deployer wallet:', wallet.address.toString());
  }

  const deployValue = toNano(args.value || process.env.DEFNFT_DEPLOY_VALUE || '0.3');
  const body = beginCell().endCell();

  console.log('Sending deploy (value', fromNano(deployValue), 'TON)…');
  await walletContract.sendTransfer({
    seqno: await walletContract.getSeqno(),
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: contractAddr,
        value: deployValue,
        init,
        body,
        bounce: false,
      }),
    ],
  });

  const explorerBase =
    args.network === 'mainnet' ? 'https://tonviewer.com/' : 'https://testnet.tonviewer.com/';
  console.log('Deploy message sent. Explorer:', explorerBase + contractAddr.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
