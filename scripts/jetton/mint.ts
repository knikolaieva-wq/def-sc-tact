type NetworkProvider = import('@ton/blueprint').NetworkProvider;
const { Address, toNano } = require('@ton/core');
const { JettonMasterTemplate } = require('../../build/jetton/Jetton_JettonMasterTemplate');

const env = (name: string, def = ''): string => (process.env[name] ?? '').trim() || def;

async function run(provider: NetworkProvider) {
  const ui = provider.ui();
  const sender = provider.sender();
  const senderAddr = sender.address || null;

  const defaultOwner = env('JETTON_OWNER', senderAddr?.toString() || '');
  const defaultContent = env('JETTON_CONTENT');
  const defaultMintTo = env('JETTON_MINT_TO', senderAddr?.toString() || defaultOwner);
  const defaultMintAmount = env('JETTON_MINT_AMOUNT', '1000');
  const defaultDecimals = env('JETTON_DECIMALS', '9'); // most jettons use 9 decimals
  const defaultDeployValue = env('JETTON_DEPLOY_VALUE', '0.15');
  // default mint value чуть больше, чтобы гарантировать деплой кошелька с запасом
  const defaultMintValue = env('JETTON_MINT_VALUE', '0.2');
  const defaultForwardAmount = env('JETTON_FORWARD_AMOUNT', '0');
  const defaultMaster = env('JETTON_MASTER', '');
  const defaultWalletOwner = env('JETTON_WALLET_OWNER', '');

  const masterInput = (await ui.input(`Existing master address (leave empty to deploy new) [default: ${defaultMaster || 'none'}]`)).trim();
  const masterAddrProvided = masterInput || defaultMaster || '';

  let master;
  if (masterAddrProvided) {
    const masterAddr = Address.parse(masterAddrProvided);
    master = provider.open(JettonMasterTemplate.fromAddress(masterAddr));
    ui.write(`Using existing master: ${masterAddr}`);
  } else {
    const ownerInput = (await ui.input(`Owner address [default: ${defaultOwner || 'none'}]`)).trim();
    const owner = Address.parse(ownerInput || defaultOwner);

    const contentUriInput = (await ui.input(`Jetton metadata URL [default: ${defaultContent || 'required'}]`)).trim();
    const contentUri = contentUriInput || defaultContent;
    if (!contentUri) throw new Error('Jetton metadata URL is required');

    const deployValueInput = (await ui.input(`Deploy value, TON [default: ${defaultDeployValue}]`)).trim();
    const deployValue = toNano(deployValueInput || defaultDeployValue);

    const content = { $$type: 'Tep64TokenData' as const, flag: 1n, content: contentUri };
    master = provider.open(await JettonMasterTemplate.fromInit(owner, content));
    ui.write(`Deploying Jetton master to ${master.address}. Owner: ${owner}`);
    await master.send(provider.sender(), { value: deployValue }, { $$type: 'Deploy', queryId: 0n });
  }

  const mintToInput = (await ui.input(`Mint to address [default: ${defaultMintTo || 'owner'}]`)).trim();
  const mintTo = Address.parse(mintToInput || defaultMintTo);

  // Show handy env hints for MUSDT integration
  ui.write(`MUSDT_MASTER=${master.address}`);
  try {
    const walletOwnerInput = (await ui.input(`Address to compute MUSDT_WALLET (default: mint-to) [default: ${defaultWalletOwner || mintTo}]`)).trim();
    const walletOwner = Address.parse(walletOwnerInput || defaultWalletOwner || mintTo.toString());
    const musdtWallet = await master.getGetWalletAddress(provider, walletOwner);
    ui.write(`MUSDT_WALLET=${musdtWallet}`);
  } catch (err) {
    ui.write(`Cannot compute MUSDT_WALLET automatically: ${(err as Error).message}`);
  }

  const decimalsInput = (await ui.input(`Decimals (from metainfo) [default: ${defaultDecimals}]`)).trim();
  const decimals = BigInt(decimalsInput || defaultDecimals);

  const mintAmountInput = (await ui.input(`Mint amount (display units) [default: ${defaultMintAmount}]`)).trim();
  const mintAmountDisplay = BigInt(mintAmountInput || defaultMintAmount);
  const multiplier = 10n ** decimals;
  const mintAmount = mintAmountDisplay * multiplier;

  const mintValueInput = (await ui.input(`Mint value, TON [default: ${defaultMintValue}]`)).trim();
  const mintValue = toNano(mintValueInput || defaultMintValue);

  const forwardAmountInput = (await ui.input(`Forward amount, TON [default: ${defaultForwardAmount}]`)).trim();
  const forwardAmount = toNano(forwardAmountInput || defaultForwardAmount);

  ui.write(`Minting ${mintAmount} tokens to ${mintTo}`);
  await master.send(provider.sender(), { value: mintValue }, {
    $$type: 'MintJetton',
    queryId: 1n,
    amount: mintAmount,
    receiver: mintTo,
    responseDestination: mintTo,
    forwardAmount,
    forwardPayload: null,
  });

  ui.write('Done. If first deploy, wait for inclusion and check tonviewer.');
}

// Export in CJS form for blueprint loader
module.exports = { run };
