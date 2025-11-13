import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import core from '@ton/core';
const { Address, beginCell, toNano, Cell, address } = core;
import tonPkg from '@ton/ton';
const { TonClient, WalletContractV4, internal, fromNano } = tonPkg;
import { mnemonicToPrivateKey, keyPairFromSecretKey } from 'ton-crypto';

// Lightweight .env loader to avoid external dependency on dotenv
function loadDotEnv(path = '.env') {
  try {
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const valRaw = line.slice(eq + 1);
      // remove optional surrounding quotes
      const val = valRaw.replace(/^['"]|['"]$/g, '');
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
    else if (a === '--main') out.main = args[++i];
    else if (a === '--nft') out.nft = args[++i];
    else if (a === '--value') out.value = args[++i];
  }
  return out;
}

async function getClient(network) {
  // Allow override via env to bypass DNS/proxy restrictions
  const apiKey = process.env.TON_API_KEY || process.env.TONCENTER_API_KEY || undefined;
  let endpoint = process.env.RPC_ENDPOINT || (network === 'testnet'
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC');
  // TonCenter also supports api_key in query; add it to be safe with proxies
  if (apiKey && /toncenter\.com/.test(endpoint)) {
    const u = new URL(endpoint);
    u.searchParams.set('api_key', apiKey);
    endpoint = u.toString();
  }
  return new TonClient({ endpoint, apiKey });
}

async function loadDeployerWallet(client) {
  const mn = process.env.MNEMONIC && process.env.MNEMONIC.trim();
  const pkHex = process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.trim();
  if (!mn && !pkHex) throw new Error('Set MNEMONIC or PRIVATE_KEY in .env');

  let keyPair;
  if (mn) {
    const words = mn.split(/\s+/g);
    keyPair = await mnemonicToPrivateKey(words);
  } else {
    const sk = Buffer.from(pkHex, 'hex');
    keyPair = keyPairFromSecretKey(sk);
  }

  const workchain = 0;
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
  const contract = client.open(wallet);
  return { wallet, contract, keyPair };
}

async function main() {
  const args = parseArgs();
  const OWNER = (args.owner || process.env.OWNER || '').trim();
  const MAIN = (args.main || process.env.MAIN_COMMISSION_WALLET || '').trim();
  const NFT = (args.nft || process.env.NFT_COLLECTION || '').trim();
  if (!OWNER || !MAIN || !NFT) throw new Error('Missing constructor params: OWNER, MAIN_COMMISSION_WALLET, NFT_COLLECTION');

  console.log('Compiling Tact contract…');
  execSync('npx tact -c tact.config.json', { stdio: 'inherit' });
  // Load .pkg and build code/data manually
  const base = 'build/transfer/PaymentProcessor_PaymentProcessor';
  let code;
  try {
    const codeBoc = readFileSync(`${base}.code.boc`);
    code = Cell.fromBoc(codeBoc)[0];
  } catch (e) {
    const pkg = JSON.parse(readFileSync(`${base}.pkg`, 'utf8'));
    code = Cell.fromBoc(Buffer.from(pkg.code, 'base64'))[0];
  }
  const ownerAddr = Address.parse(OWNER);
  const mainAddr = Address.parse(MAIN);
  const nftAddr = Address.parse(NFT);
  const data = beginCell()
    .storeBit(0) // prefix per pkg.init.prefix.value
    .storeAddress(ownerAddr)
    .storeAddress(mainAddr)
    .storeAddress(nftAddr)
    .endCell();

  const workchain = 0;
  const stateInit = beginCell()
    .storeBit(0) // no split_depth
    .storeBit(0) // no special
    .storeBit(1).storeRef(code) // code
    .storeBit(1).storeRef(data) // data
    .storeBit(0) // no library
    .endCell();
  const contractAddr = new Address(workchain, stateInit.hash());
  console.log('Contract address:', contractAddr.toString());

  const client = await getClient(args.network);
  const { wallet, contract: walletContract, keyPair } = await loadDeployerWallet(client);

  if (process.env.CHECK_BALANCE !== '0') {
    try {
      const balance = await walletContract.getBalance();
      console.log('Deployer wallet:', wallet.address.toString(), '| balance', fromNano(balance), 'TON');
    } catch (_) {
      console.log('Deployer wallet:', wallet.address.toString());
    }
  } else {
    console.log('Deployer wallet:', wallet.address.toString());
  }

  const deployValue = toNano(args.value || '0.2');
  const body = beginCell().endCell();

  console.log('Sending deploy…');
  const sendOnce = async () => {
    await walletContract.sendTransfer({
      seqno: await walletContract.getSeqno(),
      secretKey: keyPair.secretKey,
      messages: [
        internal({ to: contractAddr, value: deployValue, init: { code, data }, body, bounce: false }),
      ],
    });
  };
  let attempts = 0;
  while (true) {
    try {
      await sendOnce();
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('429') && attempts < 3) {
        attempts++;
        const wait = 1500 * attempts;
        console.log(`Rate limited (429). Retry ${attempts}/3 after ${wait}ms…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
  console.log('Deploy sent. Check explorer:', `https://testnet.tonviewer.com/${contractAddr.toString()}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
