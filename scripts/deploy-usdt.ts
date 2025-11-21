import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Address, beginCell, Cell, TupleBuilder, toNano, fromNano, contractAddress } from '@ton/core';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import { TonClient, WalletContractV4, internal } from '@ton/ton';
import { mnemonicToPrivateKey, keyPairFromSecretKey } from 'ton-crypto';
import { createRequire, Module as ModuleCtor } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Deploy PaymentProcessorUSDT (jetton-based) to TON testnet/mainnet.
// Params can be passed via CLI or .env:
// OWNER, MAIN_COMMISSION_WALLET, NFT_COLLECTION, MUSDT_MASTER, MUSDT_WALLET, MNEMONIC|PRIVATE_KEY

type Args = {
  network: 'testnet' | 'mainnet';
  owner?: string;
  main?: string;
  nft?: string;
  musdtMaster?: string;
  musdtWallet?: string;
  value?: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { network: 'testnet' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--network') out.network = args[++i] as Args['network'];
    else if (a === '--owner') out.owner = args[++i];
    else if (a === '--main') out.main = args[++i];
    else if (a === '--nft') out.nft = args[++i];
    else if (a === '--musdt-master') out.musdtMaster = args[++i];
    else if (a === '--musdt-wallet') out.musdtWallet = args[++i];
    else if (a === '--value') out.value = args[++i];
  }
  return out;
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
    keyPair = await mnemonicToPrivateKey(words);
  } else {
    const sk = Buffer.from(pkHex!, 'hex');
    keyPair = keyPairFromSecretKey(sk);
  }

  const workchain = 0;
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
  const contract = client.open(wallet);
  return { wallet, contract, keyPair };
}

type Wrapper = { init: (...args: any[]) => Promise<{ code: Cell; data: Cell }> };

async function loadWrapper(): Promise<Wrapper> {
  const require = createRequire(import.meta.url);
  const candidates = [
    '../build/PaymentProcessorUSDT.js',
    '../build/PaymentProcessorUSDT/PaymentProcessorUSDT.js',
    '../build/transfer-usdt/PaymentProcessorUSDT.js',
    '../build/transfer-usdt/PaymentProcessorUSDT/PaymentProcessorUSDT.js',
    '../build/PaymentProcessorUSDT.ts',
    '../build/transfer-usdt/PaymentProcessorUSDT.ts',
    '../build/transfer-usdt/PaymentProcessorUSDT_PaymentProcessorUSDT.js',
    '../build/transfer-usdt/PaymentProcessorUSDT_PaymentProcessorUSDT.ts',
    '../build/transfer-usdt/PaymentProcessorUSDT_PaymentProcessorUSDT', // let resolver pick .js/.ts
    '../build/PaymentProcessorUSDT', // legacy
  ];
  const errors: string[] = [];
  for (const p of candidates) {
    try {
      const mod = await import(p);
      if (mod?.PaymentProcessorUSDT?.init) return mod.PaymentProcessorUSDT as Wrapper;
      errors.push(`${p}: loaded but PaymentProcessorUSDT.init not found`);
    } catch (e: any) {
      errors.push(`${p}: ${e?.message || e}`);
    }
    try {
      const modReq = require(p);
      if (modReq?.PaymentProcessorUSDT?.init) return modReq.PaymentProcessorUSDT as Wrapper;
      errors.push(`${p} [require]: loaded but PaymentProcessorUSDT.init not found`);
    } catch (e: any) {
      errors.push(`${p} [require]: ${e?.message || e}`);
    }
  }
  // As a last resort, transpile TS wrapper manually to CJS and load
  const tsPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../build/transfer-usdt/PaymentProcessorUSDT_PaymentProcessorUSDT.ts');
  if (fs.existsSync(tsPath)) {
    try {
      const source = fs.readFileSync(tsPath, 'utf8');
      const compiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
        },
        fileName: tsPath,
      }).outputText;
      const ModuleAny: any = ModuleCtor as any;
      const m = new ModuleAny(tsPath, require.main);
      m.filename = tsPath;
      m.paths = ModuleAny._nodeModulePaths(path.dirname(tsPath));
      m._compile(compiled, tsPath);
      // eslint-disable-next-line no-console
      console.log('Loaded wrapper via manual transpile:', Object.keys(m.exports || {}));
      if (m.exports?.PaymentProcessorUSDT?.init) {
        return m.exports.PaymentProcessorUSDT as Wrapper;
      }
      errors.push(`${tsPath} [transpile]: loaded but PaymentProcessorUSDT.init not found`);
    } catch (e: any) {
      errors.push(`${tsPath} [transpile]: ${e?.message || e}`);
    }
  } else {
    errors.push(`${tsPath}: file does not exist`);
  }
  throw new Error(`Cannot locate generated wrapper for PaymentProcessorUSDT in build/. Tried:\n${errors.join('\n')}`);
}

async function computeMusdtWallet(client: TonClient, master: Address, owner: Address) {
  const tb = new TupleBuilder();
  tb.writeAddress(owner);
  const { stack } = await client.runMethod(master, 'get_wallet_address', tb.build());
  return stack.readAddress();
}

const ZERO_ADDR = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

async function main() {
  const args = parseArgs();
  const OWNER = args.owner || process.env.OWNER || '';
  const MAIN = args.main || process.env.MAIN_COMMISSION_WALLET || '';
  const NFT = args.nft || process.env.NFT_COLLECTION || '';
  const MUSDT_MASTER = args.musdtMaster || process.env.MUSDT_MASTER;
  const MUSDT_WALLET_RAW = args.musdtWallet || process.env.MUSDT_WALLET;

  if (!OWNER || !MAIN || !NFT) {
    throw new Error('Missing constructor params: OWNER, MAIN_COMMISSION_WALLET, NFT_COLLECTION');
  }
  if (!MUSDT_MASTER && !MUSDT_WALLET_RAW) {
    throw new Error('Provide MUSDT_MASTER (preferred) or MUSDT_WALLET');
  }

  console.log('Compiling Tact contracts…');
  execSync('npx tact -c tact.config.json', { stdio: 'inherit' });

  const wrapper = await loadWrapper();
  const client = await getClient(args.network);
  const musdtMasterAddr = MUSDT_MASTER ? Address.parse(MUSDT_MASTER) : null;

  let musdtWallet = MUSDT_WALLET_RAW ? Address.parse(MUSDT_WALLET_RAW) : ZERO_ADDR;
  let init: { code: Cell; data: Cell };
  let contractAddr: Address;

  // Iterate to align musdtWallet with contract address (owner of wallet).
  const maxIterations = musdtMasterAddr ? 20 : 1;
  for (let i = 0; i < maxIterations; i++) {
    init = await wrapper.init(Address.parse(OWNER), Address.parse(MAIN), Address.parse(NFT), musdtWallet);
    if (!init?.code || !init?.data) {
      throw new Error('Wrapper.init returned empty code/data (check wrapper import)');
    }
    console.log('Wrapper.init ok:', init.code?.constructor?.name, init.data?.constructor?.name);
    contractAddr = contractAddress(0, {
      code: init.code,
      data: init.data,
    });

    if (!musdtMasterAddr) break;

    const expectedWallet = await computeMusdtWallet(client, musdtMasterAddr, contractAddr);
    console.log(
      `Iteration ${i + 1}: contract ${contractAddr.toString()}, wallet guess ${musdtWallet.toString()}, expected ${expectedWallet.toString()}`
    );

    if (expectedWallet.equals(musdtWallet)) break;
    musdtWallet = expectedWallet;
  }
  if (musdtMasterAddr && !musdtWallet) {
    throw new Error('Failed to derive MUSDT wallet');
  }

  console.log('Final MUSDT wallet used in init:', musdtWallet.toString());
  console.log('Contract will be deployed at:', contractAddr!.toString());

  const { contract: walletContract, keyPair, wallet } = await loadDeployerWallet(client);
  const balance = await walletContract.getBalance();
  console.log('Deployer wallet:', wallet.address.toString(), '| balance', fromNano(balance), 'TON');

  const deployValue = args.value ? toNano(args.value) : toNano('0.2');
  const body = beginCell().endCell(); // no-op body for deploy

  console.log('Sending deploy…');
  await walletContract.sendTransfer({
    seqno: await walletContract.getSeqno(),
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: contractAddr!,
        value: deployValue,
        init: { code: init!.code, data: init!.data },
        body,
        bounce: false,
      }),
    ],
  });

  console.log(
    'Deploy message sent. Verify contract and MUSDT wallet ownership in explorer:',
    args.network === 'testnet' ? 'https://testnet.tonviewer.com/' : 'https://tonviewer.com/',
    contractAddr!.toString()
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
