const { Address, toNano } = require('@ton/core');
const { JettonMasterTemplate } = require('../../build/jetton/Jetton_JettonMasterTemplate');

function env(name, def = '') {
  return process.env[name]?.trim() || def;
}

async function run(provider) {
  const ui = provider.ui();
  const sender = provider.sender();
  const senderAddr = sender.address || null;

  const defaultOwner = env('JETTON_OWNER', senderAddr?.toString() || '');
  const defaultContent = env('JETTON_CONTENT');
  const defaultMintTo = env('JETTON_MINT_TO', senderAddr?.toString() || defaultOwner);
  const defaultMintAmount = env('JETTON_MINT_AMOUNT', '1000');
  const defaultDeployValue = env('JETTON_DEPLOY_VALUE', '0.15');
  const defaultMintValue = env('JETTON_MINT_VALUE', '0.05');
  const defaultForwardAmount = env('JETTON_FORWARD_AMOUNT', '0');

  const owner = Address.parse((await ui.input('Owner address', defaultOwner)).trim());
  const contentUri = (await ui.input('Jetton metadata URL', defaultContent)).trim();
  if (!contentUri) throw new Error('Jetton metadata URL is required');

  const mintTo = Address.parse((await ui.input('Mint to address', defaultMintTo)).trim());
  const mintAmount = BigInt((await ui.input('Mint amount (integer)', defaultMintAmount)).trim());
  const deployValue = toNano((await ui.input('Deploy value, TON', defaultDeployValue)).trim());
  const mintValue = toNano((await ui.input('Mint value, TON', defaultMintValue)).trim());
  const forwardAmount = toNano((await ui.input('Forward amount, TON', defaultForwardAmount)).trim());

  const content = { $$type: 'Tep64TokenData', flag: 1n, content: contentUri };
  const master = provider.open(await JettonMasterTemplate.fromInit(owner, content));

  ui.write(`Deploying Jetton master to ${master.address}. Owner: ${owner}`);
  await master.send(provider.sender(), { value: deployValue, bounce: false }, { $$type: 'Deploy', queryId: 0n });

  ui.write(`Minting ${mintAmount} tokens to ${mintTo}`);
  await master.send(provider.sender(), { value: mintValue, bounce: true }, {
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

module.exports = { run };
