import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Address, beginCell, contractAddress, toNano } from '@ton/core';
import { TonClient, WalletContractV4, internal, fromNano } from '@ton/ton';
import { mnemonicToPrivateKey, keyPairFromSecretKey } from 'ton-crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JETTON_BUILD = path.join(ROOT, 'build', 'jetton');

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

type Args = {
  network: 'testnet' | 'mainnet';
  owner: string;
  content: string;
  mintTo: string;
  mintAmount: string;
  deployValue: string;
  mintValue: string;
  forwardAmount: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: any = {
    network: 'testnet',
    mintAmount: process.env.JETTON_MINT_AMOUNT || '1000',
    deployValue: process.env.JETTON_DEPLOY_VALUE || '0.15',
    mintValue: process.env.JETTON_MINT_VALUE || '0.05',
    forwardAmount: process.env.JETTON_FORWARD_AMOUNT || '0',
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--network') out.network = args[++i];
    else if (a === '--owner') out.owner = args[++i];
    else if (a === '--content') out.content = args[++i];
    else if (a === '--to') out.mintTo = args[++i];
    else if (a === '--mint') out.mintAmount = args[++i];
    else if (a === '--deploy-value') out.deployValue = args[++i];
    else if (a === '--mint-value') out.mintValue = args[++i];
    else if (a === '--forward') out.forwardAmount = args[++i];
  }

  out.owner = (out.owner || process.env.JETTON_OWNER || process.env.OWNER || '').trim();
  out.mintTo = (out.mintTo || process.env.JETTON_MINT_TO || out.owner).trim();
  out.content = (out.content || process.env.JETTON_CONTENT || '').trim();

  return out as Args;
}

async function getClient(network: 'testnet' | 'mainnet') {
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

async function loadDeployerWallet(client: TonClient) {
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

async function importJettonWrappers() {
  const masterUrl = pathToFileURL(path.join(JETTON_BUILD, 'Jetton_JettonMasterTemplate.ts')).href;
  const walletUrl = pathToFileURL(path.join(JETTON_BUILD, 'Jetton_JettonWalletTemplate.ts')).href;
  const master = await import(masterUrl);
  const wallet = await import(walletUrl);
  return { master, wallet };
}

function buildOffchainContent(content: string) {
  if (!content) throw new Error('Missing jetton content URI. Pass --content or set JETTON_CONTENT');
  return { $$type: 'Tep64TokenData', flag: 1n, content };
}

function buildMintBody(storeMintJetton: any, queryId: bigint, amount: bigint, receiver: Address, forwardAmount: bigint) {
  return beginCell()
    .store(
      storeMintJetton({
        $$type: 'MintJetton',
        queryId,
        amount,
        receiver,
        responseDestination: receiver,
        forwardAmount,
        forwardPayload: null,
      }),
    )
    .endCell();
}

async function main() {
  const args = parseArgs();
  if (!args.owner) throw new Error('Missing owner address (--owner or JETTON_OWNER/OWNER)');
  if (!args.content) throw new Error('Missing jetton metadata URL (--content or JETTON_CONTENT)');

  console.log('Compiling Tact contracts…');
  execSync('npx tact -c tact.config.json', { cwd: ROOT, stdio: 'inherit' });

  const { master, wallet } = await importJettonWrappers();
  const ownerAddress = Address.parse(args.owner);
  const mintToAddress = Address.parse(args.mintTo);
  const content = buildOffchainContent(args.content);

  const init = await master.JettonMasterTemplate.init(ownerAddress, content);
  const masterAddress = contractAddress(0, init);

  const jettonWalletInit = await wallet.JettonWalletTemplate.init(masterAddress, mintToAddress);
  const jettonWalletAddress = contractAddress(0, jettonWalletInit);

  console.log('Master address:', masterAddress.toString());
  console.log('Wallet (mint target):', jettonWalletAddress.toString());

  const client = await getClient(args.network);
  const { wallet: deployerWallet, contract: walletContract, keyPair } = await loadDeployerWallet(client);

  const balance = await walletContract.getBalance().catch(() => null);
  if (balance !== null) {
    console.log('Deployer wallet:', deployerWallet.address.toString(), '| balance', fromNano(balance), 'TON');
  }

  const deployValue = toNano(args.deployValue);
  const forwardAmount = toNano(args.forwardAmount);
  const mintValue = toNano(args.mintValue);
  const staticTax = toNano('0.001');
  if (mintValue <= forwardAmount + staticTax) {
    throw new Error('mint-value must be greater than forwardAmount + staticTax (0.001 TON)');
  }

  const mintBody = buildMintBody(master.storeMintJetton, BigInt(Date.now()), BigInt(args.mintAmount), mintToAddress, forwardAmount);

  const deployMsg = internal({
    to: masterAddress,
    value: deployValue,
    bounce: false,
    init,
    body: beginCell().endCell(),
  });

  const mintMsg = internal({
    to: masterAddress,
    value: mintValue,
    bounce: true,
    body: mintBody,
  });

  console.log('Sending deploy + mint in one transfer…');
  await walletContract.sendTransfer({
    seqno: await walletContract.getSeqno(),
    secretKey: keyPair.secretKey,
    messages: [deployMsg, mintMsg],
  });

  const explorerBase = args.network === 'mainnet' ? 'https://tonviewer.com/' : 'https://testnet.tonviewer.com/';
  console.log('Explorer (master):', explorerBase + masterAddress.toString());
  console.log('Explorer (wallet):', explorerBase + jettonWalletAddress.toString());
  console.log('Minted amount:', args.mintAmount, '| receiver:', mintToAddress.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
