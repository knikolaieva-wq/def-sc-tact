import 'dotenv/config';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Address, beginCell, Cell, toNano } from 'ton-core';
import { getHttpEndpoint } from '@ton/ton';
import { TonClient, WalletContractV4, internal, fromNano } from '@ton/ton';
import { mnemonicToPrivateKey, keyPairFromSecretKey } from 'ton-crypto';

// This script compiles Tact contract and deploys it to TON testnet
// It expects Tact to generate TypeScript wrappers in build/ and uses them to get init (code+data)

type Args = { network: 'testnet' | 'mainnet'; owner: string; main: string; nft: string; value: string };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: any = { network: 'testnet' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--network') out.network = args[++i];
    else if (a === '--owner') out.owner = args[++i];
    else if (a === '--main') out.main = args[++i];
    else if (a === '--nft') out.nft = args[++i];
    else if (a === '--value') out.value = args[++i];
  }
  return out as Args;
}

async function getClient(network: 'testnet' | 'mainnet') {
  const endpoint = await getHttpEndpoint({ network });
  return new TonClient({ endpoint });
}

async function loadDeployerWallet(client: TonClient) {
  const mn = process.env.MNEMONIC?.trim();
  const pkHex = process.env.PRIVATE_KEY?.trim();
  if (!mn && !pkHex) throw new Error('Set MNEMONIC or PRIVATE_KEY in .env');

  let keyPair;
  if (mn) {
    const words = mn.split(/\s+/g);
    const kp = await mnemonicToPrivateKey(words);
    keyPair = kp;
  } else {
    const sk = Buffer.from(pkHex!, 'hex');
    keyPair = keyPairFromSecretKey(sk);
  }

  const workchain = 0;
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
  const contract = client.open(wallet);
  return { wallet, contract, keyPair };
}

async function main() {
  const { network, owner, main, nft, value } = parseArgs();
  const OWNER = owner || process.env.OWNER || '';
  const MAIN = main || process.env.MAIN_COMMISSION_WALLET || '';
  const NFT = nft || process.env.NFT_COLLECTION || '';
  if (!OWNER || !MAIN || !NFT) throw new Error('Missing constructor params: OWNER, MAIN_COMMISSION_WALLET, NFT_COLLECTION');

  // 1) Compile Tact -> build with wrappers (via tact.config.json)
  console.log('Compiling Tact contract…');
  execSync('npx tact -c tact.config.json', { stdio: 'inherit' });

  // 2) Import generated wrapper to build init
  // Tact wrapper usually exports <ContractName> with init(args)
  // Try common paths depending on compiler version
  let init: { code: Cell; data: Cell } | null = null;
  try {
    const mod = await import('../build/PaymentProcessor.js');
    if (mod?.PaymentProcessor?.init) {
      init = await mod.PaymentProcessor.init(Address.parse(OWNER), Address.parse(MAIN), Address.parse(NFT));
    }
  } catch {}
  if (!init) {
    try {
      const modAlt = await import('../build/PaymentProcessor/PaymentProcessor.js');
      if (modAlt?.PaymentProcessor?.init) {
        init = await modAlt.PaymentProcessor.init(Address.parse(OWNER), Address.parse(MAIN), Address.parse(NFT));
      }
    } catch {}
  }
  if (!init) {
    try {
      const modTs = await import('../build/PaymentProcessor.ts');
      if ((modTs as any)?.PaymentProcessor?.init) {
        init = await (modTs as any).PaymentProcessor.init(Address.parse(OWNER), Address.parse(MAIN), Address.parse(NFT));
      }
    } catch {}
  }
  if (!init) throw new Error('Cannot locate generated wrapper in build/. Ensure tact build produced PaymentProcessor wrapper.');

  // 3) Target address (deterministic)
  const workchain = 0;
  const contractAddr = Address.computeSmartContractAddress({
    workchain,
    initialCode: init.code,
    initialData: init.data,
  });

  console.log('Contract will be deployed at:', contractAddr.toString());

  // 4) Send deploy via wallet
  const client = await getClient(network);
  const { wallet, contract: walletContract, keyPair } = await loadDeployerWallet(client);

  const sender = walletContract.sender(keyPair.secretKey);
  const balance = await walletContract.getBalance();
  console.log('Deployer wallet:', wallet.address.toString(), '| balance', fromNano(balance), 'TON');

  const deployValue = value ? toNano(value) : toNano('0.2'); // enough for storage+gas

  const body = beginCell().endCell(); // no-op body for deploy

  console.log('Sending deploy…');
  await walletContract.sendTransfer({
    seqno: await walletContract.getSeqno(),
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: contractAddr,
        value: deployValue,
        init: { code: init.code, data: init.data },
        body,
        bounce: false,
      }),
    ],
  });

  console.log('Deploy message sent. Wait a bit and check address in explorer (testnet): https://testnet.tonviewer.com/', contractAddr.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
