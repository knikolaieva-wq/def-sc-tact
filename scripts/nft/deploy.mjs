import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import core from '@ton/core';
const { Address, beginCell, Cell, toNano, contractAddress } = core;
import tonPkg from '@ton/ton';
const { TonClient, WalletContractV4, internal, fromNano } = tonPkg;
import { mnemonicToPrivateKey, keyPairFromSecretKey } from 'ton-crypto';

function loadDotEnv(path = '.env') {
  try {
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf8');
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

function loadCodeCell(basePath) {
  try {
    const boc = readFileSync(`${basePath}.code.boc`);
    return Cell.fromBoc(boc)[0];
  } catch (codeErr) {
    const pkg = JSON.parse(readFileSync(`${basePath}.pkg`, 'utf8'));
    if (!pkg.code) throw codeErr;
    return Cell.fromBoc(Buffer.from(pkg.code, 'base64'))[0];
  }
}

async function main() {
  const args = parseArgs();
  const OWNER = (args.owner || process.env.DEFNFT_OWNER || process.env.OWNER || '').trim();
  if (!OWNER) throw new Error('Missing constructor param OWNER (pass --owner or set DEFNFT_OWNER)');

  console.log('Compiling contracts via tact.config.json …');
  execSync('npx tact -c tact.config.json', { stdio: 'inherit' });

  const base = 'build/nft/DefNFT_PartnerNft';
  const code = loadCodeCell(base);
  const ownerAddr = Address.parse(OWNER);
  const data = beginCell().storeUint(0, 1).storeAddress(ownerAddr).endCell();
  const init = { code, data };
  const contractAddr = contractAddress(0, init);
  console.log('DefNFT will be deployed at:', contractAddr.toString());

  const client = await getClient(args.network);
  const { wallet, contract: walletContract, keyPair } = await loadDeployerWallet(client);

  const balance = await walletContract.getBalance().catch(() => null);
  if (balance !== null) {
    console.log('Deployer wallet:', wallet.address.toString(), '| balance', fromNano(balance), 'TON');
  } else {
    console.log('Deployer wallet:', wallet.address.toString());
  }

  const deployValue = toNano(args.value || process.env.DEFNFT_DEPLOY_VALUE || '0.2');
  const body = beginCell().endCell();

  const sender = walletContract.sender(keyPair.secretKey);
  console.log('Sending deploy (value', deployValue.toString(), 'nanoTON)…');
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

  console.log('Deploy message sent.');
  const explorer =
    args.network === 'mainnet' ? 'https://tonviewer.com/' : 'https://testnet.tonviewer.com/';
  console.log('Check explorer:', explorer + contractAddr.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
