import {
    Cell,
    Slice,
    Address,
    Builder,
    beginCell,
    ComputeError,
    TupleItem,
    TupleReader,
    Dictionary,
    contractAddress,
    address,
    ContractProvider,
    Sender,
    Contract,
    ContractABI,
    ABIType,
    ABIGetter,
    ABIReceiver,
    TupleBuilder,
    DictionaryValue
} from '@ton/core';

export type DataSize = {
    $$type: 'DataSize';
    cells: bigint;
    bits: bigint;
    refs: bigint;
}

export function storeDataSize(src: DataSize) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.cells, 257);
        b_0.storeInt(src.bits, 257);
        b_0.storeInt(src.refs, 257);
    };
}

export function loadDataSize(slice: Slice) {
    const sc_0 = slice;
    const _cells = sc_0.loadIntBig(257);
    const _bits = sc_0.loadIntBig(257);
    const _refs = sc_0.loadIntBig(257);
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadGetterTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function storeTupleDataSize(source: DataSize) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.cells);
    builder.writeNumber(source.bits);
    builder.writeNumber(source.refs);
    return builder.build();
}

export function dictValueParserDataSize(): DictionaryValue<DataSize> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDataSize(src)).endCell());
        },
        parse: (src) => {
            return loadDataSize(src.loadRef().beginParse());
        }
    }
}

export type SignedBundle = {
    $$type: 'SignedBundle';
    signature: Buffer;
    signedData: Slice;
}

export function storeSignedBundle(src: SignedBundle) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBuffer(src.signature);
        b_0.storeBuilder(src.signedData.asBuilder());
    };
}

export function loadSignedBundle(slice: Slice) {
    const sc_0 = slice;
    const _signature = sc_0.loadBuffer(64);
    const _signedData = sc_0;
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadGetterTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function storeTupleSignedBundle(source: SignedBundle) {
    const builder = new TupleBuilder();
    builder.writeBuffer(source.signature);
    builder.writeSlice(source.signedData.asCell());
    return builder.build();
}

export function dictValueParserSignedBundle(): DictionaryValue<SignedBundle> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSignedBundle(src)).endCell());
        },
        parse: (src) => {
            return loadSignedBundle(src.loadRef().beginParse());
        }
    }
}

export type StateInit = {
    $$type: 'StateInit';
    code: Cell;
    data: Cell;
}

export function storeStateInit(src: StateInit) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeRef(src.code);
        b_0.storeRef(src.data);
    };
}

export function loadStateInit(slice: Slice) {
    const sc_0 = slice;
    const _code = sc_0.loadRef();
    const _data = sc_0.loadRef();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadGetterTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function storeTupleStateInit(source: StateInit) {
    const builder = new TupleBuilder();
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    return builder.build();
}

export function dictValueParserStateInit(): DictionaryValue<StateInit> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStateInit(src)).endCell());
        },
        parse: (src) => {
            return loadStateInit(src.loadRef().beginParse());
        }
    }
}

export type Context = {
    $$type: 'Context';
    bounceable: boolean;
    sender: Address;
    value: bigint;
    raw: Slice;
}

export function storeContext(src: Context) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBit(src.bounceable);
        b_0.storeAddress(src.sender);
        b_0.storeInt(src.value, 257);
        b_0.storeRef(src.raw.asCell());
    };
}

export function loadContext(slice: Slice) {
    const sc_0 = slice;
    const _bounceable = sc_0.loadBit();
    const _sender = sc_0.loadAddress();
    const _value = sc_0.loadIntBig(257);
    const _raw = sc_0.loadRef().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadGetterTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function storeTupleContext(source: Context) {
    const builder = new TupleBuilder();
    builder.writeBoolean(source.bounceable);
    builder.writeAddress(source.sender);
    builder.writeNumber(source.value);
    builder.writeSlice(source.raw.asCell());
    return builder.build();
}

export function dictValueParserContext(): DictionaryValue<Context> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeContext(src)).endCell());
        },
        parse: (src) => {
            return loadContext(src.loadRef().beginParse());
        }
    }
}

export type SendParameters = {
    $$type: 'SendParameters';
    mode: bigint;
    body: Cell | null;
    code: Cell | null;
    data: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeSendParameters(src: SendParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        if (src.code !== null && src.code !== undefined) { b_0.storeBit(true).storeRef(src.code); } else { b_0.storeBit(false); }
        if (src.data !== null && src.data !== undefined) { b_0.storeBit(true).storeRef(src.data); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadSendParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _code = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _data = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleSendParameters(source: SendParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserSendParameters(): DictionaryValue<SendParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSendParameters(src)).endCell());
        },
        parse: (src) => {
            return loadSendParameters(src.loadRef().beginParse());
        }
    }
}

export type MessageParameters = {
    $$type: 'MessageParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeMessageParameters(src: MessageParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadMessageParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleMessageParameters(source: MessageParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserMessageParameters(): DictionaryValue<MessageParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeMessageParameters(src)).endCell());
        },
        parse: (src) => {
            return loadMessageParameters(src.loadRef().beginParse());
        }
    }
}

export type DeployParameters = {
    $$type: 'DeployParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    bounce: boolean;
    init: StateInit;
}

export function storeDeployParameters(src: DeployParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeBit(src.bounce);
        b_0.store(storeStateInit(src.init));
    };
}

export function loadDeployParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _bounce = sc_0.loadBit();
    const _init = loadStateInit(sc_0);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadGetterTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadGetterTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function storeTupleDeployParameters(source: DeployParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeBoolean(source.bounce);
    builder.writeTuple(storeTupleStateInit(source.init));
    return builder.build();
}

export function dictValueParserDeployParameters(): DictionaryValue<DeployParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployParameters(src)).endCell());
        },
        parse: (src) => {
            return loadDeployParameters(src.loadRef().beginParse());
        }
    }
}

export type StdAddress = {
    $$type: 'StdAddress';
    workchain: bigint;
    address: bigint;
}

export function storeStdAddress(src: StdAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 8);
        b_0.storeUint(src.address, 256);
    };
}

export function loadStdAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(8);
    const _address = sc_0.loadUintBig(256);
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleStdAddress(source: StdAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeNumber(source.address);
    return builder.build();
}

export function dictValueParserStdAddress(): DictionaryValue<StdAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStdAddress(src)).endCell());
        },
        parse: (src) => {
            return loadStdAddress(src.loadRef().beginParse());
        }
    }
}

export type VarAddress = {
    $$type: 'VarAddress';
    workchain: bigint;
    address: Slice;
}

export function storeVarAddress(src: VarAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 32);
        b_0.storeRef(src.address.asCell());
    };
}

export function loadVarAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(32);
    const _address = sc_0.loadRef().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleVarAddress(source: VarAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeSlice(source.address.asCell());
    return builder.build();
}

export function dictValueParserVarAddress(): DictionaryValue<VarAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeVarAddress(src)).endCell());
        },
        parse: (src) => {
            return loadVarAddress(src.loadRef().beginParse());
        }
    }
}

export type BasechainAddress = {
    $$type: 'BasechainAddress';
    hash: bigint | null;
}

export function storeBasechainAddress(src: BasechainAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        if (src.hash !== null && src.hash !== undefined) { b_0.storeBit(true).storeInt(src.hash, 257); } else { b_0.storeBit(false); }
    };
}

export function loadBasechainAddress(slice: Slice) {
    const sc_0 = slice;
    const _hash = sc_0.loadBit() ? sc_0.loadIntBig(257) : null;
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadGetterTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function storeTupleBasechainAddress(source: BasechainAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.hash);
    return builder.build();
}

export function dictValueParserBasechainAddress(): DictionaryValue<BasechainAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeBasechainAddress(src)).endCell());
        },
        parse: (src) => {
            return loadBasechainAddress(src.loadRef().beginParse());
        }
    }
}

export type PaymentRequest = {
    $$type: 'PaymentRequest';
    buyer: Address;
    seller: Address;
    amount: bigint;
    buyerPaysCommission: boolean;
    optionalCommissionWallet: Address | null;
}

export function storePaymentRequest(src: PaymentRequest) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.buyer);
        b_0.storeAddress(src.seller);
        b_0.storeInt(src.amount, 257);
        b_0.storeBit(src.buyerPaysCommission);
        const b_1 = new Builder();
        b_1.storeAddress(src.optionalCommissionWallet);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadPaymentRequest(slice: Slice) {
    const sc_0 = slice;
    const _buyer = sc_0.loadAddress();
    const _seller = sc_0.loadAddress();
    const _amount = sc_0.loadIntBig(257);
    const _buyerPaysCommission = sc_0.loadBit();
    const sc_1 = sc_0.loadRef().beginParse();
    const _optionalCommissionWallet = sc_1.loadMaybeAddress();
    return { $$type: 'PaymentRequest' as const, buyer: _buyer, seller: _seller, amount: _amount, buyerPaysCommission: _buyerPaysCommission, optionalCommissionWallet: _optionalCommissionWallet };
}

export function loadTuplePaymentRequest(source: TupleReader) {
    const _buyer = source.readAddress();
    const _seller = source.readAddress();
    const _amount = source.readBigNumber();
    const _buyerPaysCommission = source.readBoolean();
    const _optionalCommissionWallet = source.readAddressOpt();
    return { $$type: 'PaymentRequest' as const, buyer: _buyer, seller: _seller, amount: _amount, buyerPaysCommission: _buyerPaysCommission, optionalCommissionWallet: _optionalCommissionWallet };
}

export function loadGetterTuplePaymentRequest(source: TupleReader) {
    const _buyer = source.readAddress();
    const _seller = source.readAddress();
    const _amount = source.readBigNumber();
    const _buyerPaysCommission = source.readBoolean();
    const _optionalCommissionWallet = source.readAddressOpt();
    return { $$type: 'PaymentRequest' as const, buyer: _buyer, seller: _seller, amount: _amount, buyerPaysCommission: _buyerPaysCommission, optionalCommissionWallet: _optionalCommissionWallet };
}

export function storeTuplePaymentRequest(source: PaymentRequest) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.buyer);
    builder.writeAddress(source.seller);
    builder.writeNumber(source.amount);
    builder.writeBoolean(source.buyerPaysCommission);
    builder.writeAddress(source.optionalCommissionWallet);
    return builder.build();
}

export function dictValueParserPaymentRequest(): DictionaryValue<PaymentRequest> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storePaymentRequest(src)).endCell());
        },
        parse: (src) => {
            return loadPaymentRequest(src.loadRef().beginParse());
        }
    }
}

export type Preview = {
    $$type: 'Preview';
    commission: bigint;
    totalPay: bigint;
}

export function storePreview(src: Preview) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.commission, 257);
        b_0.storeInt(src.totalPay, 257);
    };
}

export function loadPreview(slice: Slice) {
    const sc_0 = slice;
    const _commission = sc_0.loadIntBig(257);
    const _totalPay = sc_0.loadIntBig(257);
    return { $$type: 'Preview' as const, commission: _commission, totalPay: _totalPay };
}

export function loadTuplePreview(source: TupleReader) {
    const _commission = source.readBigNumber();
    const _totalPay = source.readBigNumber();
    return { $$type: 'Preview' as const, commission: _commission, totalPay: _totalPay };
}

export function loadGetterTuplePreview(source: TupleReader) {
    const _commission = source.readBigNumber();
    const _totalPay = source.readBigNumber();
    return { $$type: 'Preview' as const, commission: _commission, totalPay: _totalPay };
}

export function storeTuplePreview(source: Preview) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.commission);
    builder.writeNumber(source.totalPay);
    return builder.build();
}

export function dictValueParserPreview(): DictionaryValue<Preview> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storePreview(src)).endCell());
        },
        parse: (src) => {
            return loadPreview(src.loadRef().beginParse());
        }
    }
}

export type Transfer = {
    $$type: 'Transfer';
    req: PaymentRequest;
    deadline: bigint;
}

export function storeTransfer(src: Transfer) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1120014202, 32);
        b_0.store(storePaymentRequest(src.req));
        const b_1 = new Builder();
        b_1.storeInt(src.deadline, 257);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadTransfer(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1120014202) { throw Error('Invalid prefix'); }
    const _req = loadPaymentRequest(sc_0);
    const sc_1 = sc_0.loadRef().beginParse();
    const _deadline = sc_1.loadIntBig(257);
    return { $$type: 'Transfer' as const, req: _req, deadline: _deadline };
}

export function loadTupleTransfer(source: TupleReader) {
    const _req = loadTuplePaymentRequest(source);
    const _deadline = source.readBigNumber();
    return { $$type: 'Transfer' as const, req: _req, deadline: _deadline };
}

export function loadGetterTupleTransfer(source: TupleReader) {
    const _req = loadGetterTuplePaymentRequest(source);
    const _deadline = source.readBigNumber();
    return { $$type: 'Transfer' as const, req: _req, deadline: _deadline };
}

export function storeTupleTransfer(source: Transfer) {
    const builder = new TupleBuilder();
    builder.writeTuple(storeTuplePaymentRequest(source.req));
    builder.writeNumber(source.deadline);
    return builder.build();
}

export function dictValueParserTransfer(): DictionaryValue<Transfer> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeTransfer(src)).endCell());
        },
        parse: (src) => {
            return loadTransfer(src.loadRef().beginParse());
        }
    }
}

export type SetPlatformCommissionBps = {
    $$type: 'SetPlatformCommissionBps';
    newBps: bigint;
}

export function storeSetPlatformCommissionBps(src: SetPlatformCommissionBps) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(4004194512, 32);
        b_0.storeInt(src.newBps, 257);
    };
}

export function loadSetPlatformCommissionBps(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 4004194512) { throw Error('Invalid prefix'); }
    const _newBps = sc_0.loadIntBig(257);
    return { $$type: 'SetPlatformCommissionBps' as const, newBps: _newBps };
}

export function loadTupleSetPlatformCommissionBps(source: TupleReader) {
    const _newBps = source.readBigNumber();
    return { $$type: 'SetPlatformCommissionBps' as const, newBps: _newBps };
}

export function loadGetterTupleSetPlatformCommissionBps(source: TupleReader) {
    const _newBps = source.readBigNumber();
    return { $$type: 'SetPlatformCommissionBps' as const, newBps: _newBps };
}

export function storeTupleSetPlatformCommissionBps(source: SetPlatformCommissionBps) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.newBps);
    return builder.build();
}

export function dictValueParserSetPlatformCommissionBps(): DictionaryValue<SetPlatformCommissionBps> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSetPlatformCommissionBps(src)).endCell());
        },
        parse: (src) => {
            return loadSetPlatformCommissionBps(src.loadRef().beginParse());
        }
    }
}

export type WithdrawAll = {
    $$type: 'WithdrawAll';
    to: Address;
}

export function storeWithdrawAll(src: WithdrawAll) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(3794127834, 32);
        b_0.storeAddress(src.to);
    };
}

export function loadWithdrawAll(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 3794127834) { throw Error('Invalid prefix'); }
    const _to = sc_0.loadAddress();
    return { $$type: 'WithdrawAll' as const, to: _to };
}

export function loadTupleWithdrawAll(source: TupleReader) {
    const _to = source.readAddress();
    return { $$type: 'WithdrawAll' as const, to: _to };
}

export function loadGetterTupleWithdrawAll(source: TupleReader) {
    const _to = source.readAddress();
    return { $$type: 'WithdrawAll' as const, to: _to };
}

export function storeTupleWithdrawAll(source: WithdrawAll) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.to);
    return builder.build();
}

export function dictValueParserWithdrawAll(): DictionaryValue<WithdrawAll> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeWithdrawAll(src)).endCell());
        },
        parse: (src) => {
            return loadWithdrawAll(src.loadRef().beginParse());
        }
    }
}

export type PaymentProcessor$Data = {
    $$type: 'PaymentProcessor$Data';
    owner: Address;
    platformCommissionBps: bigint;
    mainCommissionWallet: Address;
    nftCollection: Address;
    nonces: Dictionary<Address, bigint>;
}

export function storePaymentProcessor$Data(src: PaymentProcessor$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeInt(src.platformCommissionBps, 257);
        b_0.storeAddress(src.mainCommissionWallet);
        const b_1 = new Builder();
        b_1.storeAddress(src.nftCollection);
        b_1.storeDict(src.nonces, Dictionary.Keys.Address(), Dictionary.Values.BigInt(257));
        b_0.storeRef(b_1.endCell());
    };
}

export function loadPaymentProcessor$Data(slice: Slice) {
    const sc_0 = slice;
    const _owner = sc_0.loadAddress();
    const _platformCommissionBps = sc_0.loadIntBig(257);
    const _mainCommissionWallet = sc_0.loadAddress();
    const sc_1 = sc_0.loadRef().beginParse();
    const _nftCollection = sc_1.loadAddress();
    const _nonces = Dictionary.load(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), sc_1);
    return { $$type: 'PaymentProcessor$Data' as const, owner: _owner, platformCommissionBps: _platformCommissionBps, mainCommissionWallet: _mainCommissionWallet, nftCollection: _nftCollection, nonces: _nonces };
}

export function loadTuplePaymentProcessor$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _platformCommissionBps = source.readBigNumber();
    const _mainCommissionWallet = source.readAddress();
    const _nftCollection = source.readAddress();
    const _nonces = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), source.readCellOpt());
    return { $$type: 'PaymentProcessor$Data' as const, owner: _owner, platformCommissionBps: _platformCommissionBps, mainCommissionWallet: _mainCommissionWallet, nftCollection: _nftCollection, nonces: _nonces };
}

export function loadGetterTuplePaymentProcessor$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _platformCommissionBps = source.readBigNumber();
    const _mainCommissionWallet = source.readAddress();
    const _nftCollection = source.readAddress();
    const _nonces = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), source.readCellOpt());
    return { $$type: 'PaymentProcessor$Data' as const, owner: _owner, platformCommissionBps: _platformCommissionBps, mainCommissionWallet: _mainCommissionWallet, nftCollection: _nftCollection, nonces: _nonces };
}

export function storeTuplePaymentProcessor$Data(source: PaymentProcessor$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.owner);
    builder.writeNumber(source.platformCommissionBps);
    builder.writeAddress(source.mainCommissionWallet);
    builder.writeAddress(source.nftCollection);
    builder.writeCell(source.nonces.size > 0 ? beginCell().storeDictDirect(source.nonces, Dictionary.Keys.Address(), Dictionary.Values.BigInt(257)).endCell() : null);
    return builder.build();
}

export function dictValueParserPaymentProcessor$Data(): DictionaryValue<PaymentProcessor$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storePaymentProcessor$Data(src)).endCell());
        },
        parse: (src) => {
            return loadPaymentProcessor$Data(src.loadRef().beginParse());
        }
    }
}

 type PaymentProcessor_init_args = {
    $$type: 'PaymentProcessor_init_args';
    owner: Address;
    mainCommissionWallet: Address;
    nftCollection: Address;
}

function initPaymentProcessor_init_args(src: PaymentProcessor_init_args) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.mainCommissionWallet);
        b_0.storeAddress(src.nftCollection);
    };
}

async function PaymentProcessor_init(owner: Address, mainCommissionWallet: Address, nftCollection: Address) {
    const __code = Cell.fromHex('b5ee9c7241020f010003de000114ff00f4a413f4bcf2c80b01020162020a03f6d001d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018e19fa40810101d700fa40d401d0fa40f404301025102410236c158e10fa40fa40fa40552003d1586d80195520e206925f06e004d70d1ff2e082218210eeab28d0bae302218210e225cbdabae30201821042c20f7abae3025f06f2c0820304050088316c12810101d700308200e594f84224c705f2f48200e1be21c2ff9521812710bb9170e2f2f4443302c87f01ca0055405045ce12810101cf00ce01c8ce12f400cdc9ed5400e031fa40308200e594f84225c705f2f4f8276f10812f2a21c200f2f4706d5a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb004034c87f01ca0055405045ce12810101cf00ce01c8ce12f400cdc9ed5401f4fa40fa40810101d700d200d401d0d72c01916d93fa4001e231151443303004d430d0810101d700308200f54a5334c705b3f2f48200d3a222c200f2f4813caef82358bbf2f42881010b248101014133f40a6fa19401d70030925b6de28200a439f84225c705f2f4206eb391a4923071e2102981010b40448101010603fa216e955b59f4593098c801cf004133f441e25314a8812710a90423935320a09122e28200bb0cf8416f24135f0322bef2f4048e3c5122a118706d5a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00e30d20c2009130e30df8416f2407080900745082706d5a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0000745220706d5a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0000ca135f0301a120c2008e3bf84201706d5a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb009130e24034c87f01ca0055405045ce12810101cf00ce01c8ce12f400cdc9ed540201200b0d0179bf77d76a268690000c70cfd20408080eb807d206a00e87d207a0218081288120811b60ac7087d207d207d202a9001e8ac36c00caa90712a826d9e3628c0c003c81010b22028101014133f40a6fa19401d70030925b6de2206eb3923070df0179bdcd176a268690000c70cfd20408080eb807d206a00e87d207a0218081288120811b60ac7087d207d207d202a9001e8ac36c00caa90712a8a6d9e362940e001e5315a8812710a904019266a09101e268604357');
    const builder = beginCell();
    builder.storeUint(0, 1);
    initPaymentProcessor_init_args({ $$type: 'PaymentProcessor_init_args', owner, mainCommissionWallet, nftCollection })(builder);
    const __data = builder.endCell();
    return { code: __code, data: __data };
}

export const PaymentProcessor_errors = {
    2: { message: "Stack underflow" },
    3: { message: "Stack overflow" },
    4: { message: "Integer overflow" },
    5: { message: "Integer out of expected range" },
    6: { message: "Invalid opcode" },
    7: { message: "Type check error" },
    8: { message: "Cell overflow" },
    9: { message: "Cell underflow" },
    10: { message: "Dictionary error" },
    11: { message: "'Unknown' error" },
    12: { message: "Fatal error" },
    13: { message: "Out of gas error" },
    14: { message: "Virtualization error" },
    32: { message: "Action list is invalid" },
    33: { message: "Action list is too long" },
    34: { message: "Action is invalid or not supported" },
    35: { message: "Invalid source address in outbound message" },
    36: { message: "Invalid destination address in outbound message" },
    37: { message: "Not enough Toncoin" },
    38: { message: "Not enough extra currencies" },
    39: { message: "Outbound message does not fit into a cell after rewriting" },
    40: { message: "Cannot process a message" },
    41: { message: "Library reference is null" },
    42: { message: "Library change action error" },
    43: { message: "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree" },
    50: { message: "Account state size exceeded limits" },
    128: { message: "Null reference exception" },
    129: { message: "Invalid serialization prefix" },
    130: { message: "Invalid incoming message" },
    131: { message: "Constraints error" },
    132: { message: "Access denied" },
    133: { message: "Contract stopped" },
    134: { message: "Invalid argument" },
    135: { message: "Code of a contract was not found" },
    136: { message: "Invalid standard address" },
    138: { message: "Not a basechain address" },
    12074: { message: "empty" },
    15534: { message: "expired" },
    42041: { message: "buyer must send" },
    47884: { message: "insufficient value" },
    54178: { message: "invalid amount" },
    57790: { message: "bps out of range" },
    58772: { message: "only owner" },
    62794: { message: "invalid seller" },
} as const

export const PaymentProcessor_errors_backward = {
    "Stack underflow": 2,
    "Stack overflow": 3,
    "Integer overflow": 4,
    "Integer out of expected range": 5,
    "Invalid opcode": 6,
    "Type check error": 7,
    "Cell overflow": 8,
    "Cell underflow": 9,
    "Dictionary error": 10,
    "'Unknown' error": 11,
    "Fatal error": 12,
    "Out of gas error": 13,
    "Virtualization error": 14,
    "Action list is invalid": 32,
    "Action list is too long": 33,
    "Action is invalid or not supported": 34,
    "Invalid source address in outbound message": 35,
    "Invalid destination address in outbound message": 36,
    "Not enough Toncoin": 37,
    "Not enough extra currencies": 38,
    "Outbound message does not fit into a cell after rewriting": 39,
    "Cannot process a message": 40,
    "Library reference is null": 41,
    "Library change action error": 42,
    "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree": 43,
    "Account state size exceeded limits": 50,
    "Null reference exception": 128,
    "Invalid serialization prefix": 129,
    "Invalid incoming message": 130,
    "Constraints error": 131,
    "Access denied": 132,
    "Contract stopped": 133,
    "Invalid argument": 134,
    "Code of a contract was not found": 135,
    "Invalid standard address": 136,
    "Not a basechain address": 138,
    "empty": 12074,
    "expired": 15534,
    "buyer must send": 42041,
    "insufficient value": 47884,
    "invalid amount": 54178,
    "bps out of range": 57790,
    "only owner": 58772,
    "invalid seller": 62794,
} as const

const PaymentProcessor_types: ABIType[] = [
    {"name":"DataSize","header":null,"fields":[{"name":"cells","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bits","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"refs","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"SignedBundle","header":null,"fields":[{"name":"signature","type":{"kind":"simple","type":"fixed-bytes","optional":false,"format":64}},{"name":"signedData","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"StateInit","header":null,"fields":[{"name":"code","type":{"kind":"simple","type":"cell","optional":false}},{"name":"data","type":{"kind":"simple","type":"cell","optional":false}}]},
    {"name":"Context","header":null,"fields":[{"name":"bounceable","type":{"kind":"simple","type":"bool","optional":false}},{"name":"sender","type":{"kind":"simple","type":"address","optional":false}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"raw","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"SendParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"code","type":{"kind":"simple","type":"cell","optional":true}},{"name":"data","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"MessageParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"DeployParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}},{"name":"init","type":{"kind":"simple","type":"StateInit","optional":false}}]},
    {"name":"StdAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":8}},{"name":"address","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"VarAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"address","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"BasechainAddress","header":null,"fields":[{"name":"hash","type":{"kind":"simple","type":"int","optional":true,"format":257}}]},
    {"name":"PaymentRequest","header":null,"fields":[{"name":"buyer","type":{"kind":"simple","type":"address","optional":false}},{"name":"seller","type":{"kind":"simple","type":"address","optional":false}},{"name":"amount","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"buyerPaysCommission","type":{"kind":"simple","type":"bool","optional":false}},{"name":"optionalCommissionWallet","type":{"kind":"simple","type":"address","optional":true}}]},
    {"name":"Preview","header":null,"fields":[{"name":"commission","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"totalPay","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"Transfer","header":1120014202,"fields":[{"name":"req","type":{"kind":"simple","type":"PaymentRequest","optional":false}},{"name":"deadline","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"SetPlatformCommissionBps","header":4004194512,"fields":[{"name":"newBps","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"WithdrawAll","header":3794127834,"fields":[{"name":"to","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"PaymentProcessor$Data","header":null,"fields":[{"name":"owner","type":{"kind":"simple","type":"address","optional":false}},{"name":"platformCommissionBps","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"mainCommissionWallet","type":{"kind":"simple","type":"address","optional":false}},{"name":"nftCollection","type":{"kind":"simple","type":"address","optional":false}},{"name":"nonces","type":{"kind":"dict","key":"address","value":"int"}}]},
]

const PaymentProcessor_opcodes = {
    "Transfer": 1120014202,
    "SetPlatformCommissionBps": 4004194512,
    "WithdrawAll": 3794127834,
}

const PaymentProcessor_getters: ABIGetter[] = [
    {"name":"previewPayment","methodId":113058,"arguments":[{"name":"amount","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"buyerPaysCommission","type":{"kind":"simple","type":"bool","optional":false}}],"returnType":{"kind":"simple","type":"Preview","optional":false}},
    {"name":"nonceOf","methodId":93946,"arguments":[{"name":"account","type":{"kind":"simple","type":"address","optional":false}}],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
]

export const PaymentProcessor_getterMapping: { [key: string]: string } = {
    'previewPayment': 'getPreviewPayment',
    'nonceOf': 'getNonceOf',
}

const PaymentProcessor_receivers: ABIReceiver[] = [
    {"receiver":"internal","message":{"kind":"typed","type":"SetPlatformCommissionBps"}},
    {"receiver":"internal","message":{"kind":"typed","type":"WithdrawAll"}},
    {"receiver":"internal","message":{"kind":"typed","type":"Transfer"}},
]


export class PaymentProcessor implements Contract {
    
    public static readonly storageReserve = 0n;
    public static readonly errors = PaymentProcessor_errors_backward;
    public static readonly opcodes = PaymentProcessor_opcodes;
    
    static async init(owner: Address, mainCommissionWallet: Address, nftCollection: Address) {
        return await PaymentProcessor_init(owner, mainCommissionWallet, nftCollection);
    }
    
    static async fromInit(owner: Address, mainCommissionWallet: Address, nftCollection: Address) {
        const __gen_init = await PaymentProcessor_init(owner, mainCommissionWallet, nftCollection);
        const address = contractAddress(0, __gen_init);
        return new PaymentProcessor(address, __gen_init);
    }
    
    static fromAddress(address: Address) {
        return new PaymentProcessor(address);
    }
    
    readonly address: Address; 
    readonly init?: { code: Cell, data: Cell };
    readonly abi: ContractABI = {
        types:  PaymentProcessor_types,
        getters: PaymentProcessor_getters,
        receivers: PaymentProcessor_receivers,
        errors: PaymentProcessor_errors,
    };
    
    constructor(address: Address, init?: { code: Cell, data: Cell }) {
        this.address = address;
        this.init = init;
    }
    
    async send(provider: ContractProvider, via: Sender, args: { value: bigint, bounce?: boolean| null | undefined }, message: SetPlatformCommissionBps | WithdrawAll | Transfer) {
        
        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'SetPlatformCommissionBps') {
            body = beginCell().store(storeSetPlatformCommissionBps(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'WithdrawAll') {
            body = beginCell().store(storeWithdrawAll(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Transfer') {
            body = beginCell().store(storeTransfer(message)).endCell();
        }
        if (body === null) { throw new Error('Invalid message type'); }
        
        await provider.internal(via, { ...args, body: body });
        
    }
    
    async getPreviewPayment(provider: ContractProvider, amount: bigint, buyerPaysCommission: boolean) {
        const builder = new TupleBuilder();
        builder.writeNumber(amount);
        builder.writeBoolean(buyerPaysCommission);
        const source = (await provider.get('previewPayment', builder.build())).stack;
        const result = loadGetterTuplePreview(source);
        return result;
    }
    
    async getNonceOf(provider: ContractProvider, account: Address) {
        const builder = new TupleBuilder();
        builder.writeAddress(account);
        const source = (await provider.get('nonceOf', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }
    
}