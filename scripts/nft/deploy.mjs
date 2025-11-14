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
    else if (a === '--content') out.content = args[++i]; // URL коллекционной меты
    else if (a === '--salt') out.salt = args[++i];       // чисто для логов
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

// Универсальная загрузка кода контракта из .code.boc или .pkg
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

// TEP-64 off-chain content: 0x01 + URI
function buildOffchainContentCell(uri) {
  const builder = beginCell();
  builder.storeUint(1, 8);       // 0x01 = off-chain
  builder.storeStringTail(uri);  // URL как строка
  return builder.endCell();
}

// === ВАЖНО ===
// Эта функция должна соответствовать init(...) в PartnerNftCollection.tact:
// init(owner: Address, collectionContent: Cell, itemCode: Cell)
function buildCollectionInit(collectionCode, owner, collectionContent, itemCode) {
  const dataBuilder = beginCell();
  // layout data должен совпадать с тем, что ожидает контракт:
  // здесь как у тебя: (bit 0, owner, ref(collectionContent), ref(itemCode))
  dataBuilder.storeUint(0, 1);           // например, флаг / reserved
  dataBuilder.storeAddress(owner);
  dataBuilder.storeRef(collectionContent);
  dataBuilder.storeRef(itemCode);
  const data = dataBuilder.endCell();
  return { code: collectionCode, data };
}

async function main() {
  const args = parseArgs();
  const OWNER = (args.owner || process.env.DEFNFT_OWNER || process.env.OWNER || '').trim();
  if (!OWNER) throw new Error('Missing constructor param OWNER (pass --owner or set DEFNFT_OWNER)');
  const salt = args.salt || process.env.DEFNFT_SALT || Date.now().toString(16);
  console.log('Salt (log only):', salt);

  console.log('Compiling Tact contracts…');
  execSync('npx tact -c tact.config.json', { cwd: ROOT, stdio: 'inherit' });

  // Код айтема (как и раньше)
  const itemCodeBase = path.join(NFT_BUILD, 'PartnerNftItem_PartnerNftItem');
  const itemCode = loadCodeCell(itemCodeBase);

  // НОВОЕ: код коллекции тоже берём из билдов, а не из codeHex
  const collectionCodeBase = path.join(NFT_BUILD, 'PartnerNftCollection_PartnerNftCollection');
  const collectionCode = loadCodeCell(collectionCodeBase);

  // URI коллекционной меты (JSON)
  const collectionUri =
    args.content ||
    process.env.DEFNFT_COLLECTION_CONTENT;

  if (!collectionUri) {
    throw new Error(
      'Missing collection metadata URI. Pass --content "https://.../collection-meta.json" or set DEFNFT_COLLECTION_CONTENT'
    );
  }

  const collectionContent = buildOffchainContentCell(collectionUri);
  const ownerAddress = Address.parse(OWNER);

  console.log('Building state init…');
  const init = buildCollectionInit(collectionCode, ownerAddress, collectionContent, itemCode);
  const contractAddr = contractAddress(0, init);
  console.log('Collection address:', contractAddr.toString(), '| salt:', salt);

  const client = await getClient(args.network);
  const { wallet, contract: walletContract, keyPair } = await loadDeployerWallet(client);

  const balance = await walletContract.getBalance().catch(() => null);
  if (balance !== null) {
    console.log('Deployer wallet:', wallet.address.toString(), '| balance', fromNano(balance), 'TON');
  } else {
    console.log('Deployer wallet:', wallet.address.toString());
  }

  const deployValue = toNano(args.value || process.env.DEFNFT_DEPLOY_VALUE || '0.05');
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
