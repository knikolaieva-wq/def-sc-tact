import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentProcessorModel, generateWallet } from './helpers/paymentProcessorModel.js';

let buyer;
let seller;
let optional;
let platform;
let processor;

beforeEach(() => {
  buyer = generateWallet();
  seller = generateWallet();
  optional = generateWallet();
  platform = generateWallet();
  processor = new PaymentProcessorModel({ mainCommissionWallet: platform.address });
  processor.setOptionalShare(optional.address, 4000);
});

function createRequest({ amount = 1_000_000n, buyerPaysCommission = true } = {}) {
  return {
    buyer: buyer.address,
    seller: seller.address,
    amount,
    buyerPaysCommission,
    optionalCommissionWallet: optional.address
  };
}

function signRequest({ request, deadline, nonce }) {
  const signature = PaymentProcessorModel.signPayment({
    keyPair: { publicKey: buyer.publicKey, privateKey: buyer.privateKey },
    request,
    deadline,
    nonce,
    platformCommissionBps: processor.platformCommissionBps
  });
  return signature;
}

test('previewPayment matches commission math', () => {
  const request = createRequest({ amount: 2_000_000n, buyerPaysCommission: false });
  const { commission, total } = processor.previewPayment(
    request.amount,
    request.buyerPaysCommission
  );

  assert.equal(commission, (request.amount * 25n) / 10_000n);
  assert.equal(total, request.amount);
});

test('successful payment distributes funds', () => {
  const request = createRequest();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = processor.nonceOf(request.buyer);
  const signature = signRequest({ request, deadline, nonce });

  processor.processPayment({
    request,
    deadline,
    signature,
    buyerPubKey: buyer.publicKey,
    now: BigInt(Math.floor(Date.now() / 1000)),
    from: request.buyer,
    value: 1_025_000n
  });

  const commission = (request.amount * BigInt(processor.platformCommissionBps)) / 10_000n;
  const optionalAmount = (commission * 4000n) / 10_000n;
  const platformAmount = commission - optionalAmount;

  assert.equal(processor.balances.get(seller.address), request.amount);
  assert.equal(processor.balances.get(platform.address), platformAmount);
  assert.equal(processor.balances.get(optional.address), optionalAmount);
  assert.equal(processor.nonceOf(request.buyer), 1n);
});

test('rejects invalid signature', () => {
  const request = createRequest();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = processor.nonceOf(request.buyer);
  const signature = signRequest({ request, deadline, nonce });

  assert.throws(() => {
    processor.processPayment({
      request: { ...request, amount: request.amount + 1n },
      deadline,
      signature,
      buyerPubKey: buyer.publicKey,
      now: BigInt(Math.floor(Date.now() / 1000)),
      from: request.buyer,
      value: 1_025_000n
    });
  }, /Invalid signature/);
});

test('refunds excess value', () => {
  const request = createRequest();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = processor.nonceOf(request.buyer);
  const signature = signRequest({ request, deadline, nonce });

  processor.processPayment({
    request,
    deadline,
    signature,
    buyerPubKey: buyer.publicKey,
    now: BigInt(Math.floor(Date.now() / 1000)),
    from: request.buyer,
    value: 2_000_000n
  });

  const commission = (request.amount * BigInt(processor.platformCommissionBps)) / 10_000n;
  const total = request.amount + commission;
  const refund = 2_000_000n - total;

  assert.equal(processor.balances.get(request.buyer), refund);
});
