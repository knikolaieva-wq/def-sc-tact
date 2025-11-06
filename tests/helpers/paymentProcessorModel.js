import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';

export class PaymentProcessorModel {
  constructor({ platformCommissionBps = 25, mainCommissionWallet }) {
    this.platformCommissionBps = platformCommissionBps;
    this.mainCommissionWallet = mainCommissionWallet;
    this.nonces = new Map();
    this.optionalShares = new Map();
    this.balances = new Map();
  }

  setOptionalShare(wallet, shareBps) {
    if (shareBps === 0) {
      this.optionalShares.delete(wallet);
    } else {
      if (shareBps < 0 || shareBps > 10_000) {
        throw new Error('Invalid share');
      }
      this.optionalShares.set(wallet, shareBps);
    }
  }

  setCommissionBps(newBps) {
    if (newBps < 0 || newBps > 10_000) {
      throw new Error('Invalid commission');
    }
    this.platformCommissionBps = newBps;
  }

  nonceOf(buyer) {
    return this.nonces.get(buyer) ?? 0n;
  }

  previewPayment(amount, buyerPaysCommission) {
    const commission = (amount * BigInt(this.platformCommissionBps)) / 10_000n;
    const total = buyerPaysCommission ? amount + commission : amount;
    return { commission, total };
  }

  static digest({ request, deadline, nonce, platformCommissionBps }) {
    const hash = createHash('sha256');
    hash.update(Buffer.from(request.buyer, 'hex'));
    hash.update(Buffer.from(request.seller, 'hex'));
    const amountBuffer = Buffer.alloc(16);
    amountBuffer.writeBigInt64BE(request.amount >> 64n, 0);
    amountBuffer.writeBigInt64BE(request.amount & ((1n << 64n) - 1n), 8);
    hash.update(amountBuffer);
    hash.update(Buffer.from([request.buyerPaysCommission ? 1 : 0]));
    const optional = request.optionalCommissionWallet
      ? Buffer.from(request.optionalCommissionWallet, 'hex')
      : Buffer.alloc(32);
    hash.update(optional);
    const deadlineBuf = Buffer.alloc(8);
    deadlineBuf.writeBigUInt64BE(deadline);
    hash.update(deadlineBuf);
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64BE(nonce);
    hash.update(nonceBuf);
    const bpsBuf = Buffer.alloc(4);
    bpsBuf.writeUInt32BE(platformCommissionBps);
    hash.update(bpsBuf);
    return hash.digest();
  }

  static signPayment({ keyPair, request, deadline, nonce, platformCommissionBps }) {
    const digest = PaymentProcessorModel.digest({
      request,
      deadline,
      nonce,
      platformCommissionBps
    });
    const signature = sign(null, digest, keyPair.privateKey);
    return signature;
  }

  static verifySignature({ request, deadline, nonce, platformCommissionBps, signature, publicKey }) {
    const digest = PaymentProcessorModel.digest({
      request,
      deadline,
      nonce,
      platformCommissionBps
    });
    return verify(null, digest, publicKey, signature);
  }

  credit(address, amount) {
    const current = this.balances.get(address) ?? 0n;
    this.balances.set(address, current + amount);
  }

  processPayment({
    request,
    deadline,
    signature,
    buyerPubKey,
    now,
    from,
    value
  }) {
    if (request.buyer === request.seller) throw new Error('Invalid seller');
    if (request.amount <= 0n) throw new Error('Invalid amount');
    if (now > deadline) throw new Error('Signature expired');
    if (from !== request.buyer) throw new Error('Invalid sender');

    const nonce = this.nonceOf(request.buyer);
    const validSignature = PaymentProcessorModel.verifySignature({
      request,
      deadline,
      nonce,
      platformCommissionBps: this.platformCommissionBps,
      signature,
      publicKey: buyerPubKey
    });
    if (!validSignature) throw new Error('Invalid signature');

    const commission = (request.amount * BigInt(this.platformCommissionBps)) / 10_000n;
    const totalPay = request.buyerPaysCommission ? request.amount + commission : request.amount;
    if (value < totalPay) throw new Error('Insufficient value');

    this.nonces.set(request.buyer, nonce + 1n);

    const sellerAmount = request.buyerPaysCommission ? request.amount : request.amount - commission;
    this.credit(request.seller, sellerAmount);

    if (commission > 0n) {
      let optionalAmount = 0n;
      if (request.optionalCommissionWallet) {
        const share = BigInt(this.optionalShares.get(request.optionalCommissionWallet) ?? 0);
        optionalAmount = (commission * share) / 10_000n;
        if (optionalAmount > 0n) {
          this.credit(request.optionalCommissionWallet, optionalAmount);
        }
      }
      const platformAmount = commission - optionalAmount;
      if (platformAmount > 0n) {
        this.credit(this.mainCommissionWallet, platformAmount);
      }
    }

    const refund = value - totalPay;
    if (refund > 0n) {
      this.credit(request.buyer, refund);
    }
  }
}

export function generateWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  return {
    publicKey,
    privateKey,
    address
  };
}
