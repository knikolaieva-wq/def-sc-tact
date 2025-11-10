# Tact compilation report
Contract: PaymentProcessor
BoC Size: 1002 bytes

## Structures (Structs and Messages)
Total structures: 16

### DataSize
TL-B: `_ cells:int257 bits:int257 refs:int257 = DataSize`
Signature: `DataSize{cells:int257,bits:int257,refs:int257}`

### SignedBundle
TL-B: `_ signature:fixed_bytes64 signedData:remainder<slice> = SignedBundle`
Signature: `SignedBundle{signature:fixed_bytes64,signedData:remainder<slice>}`

### StateInit
TL-B: `_ code:^cell data:^cell = StateInit`
Signature: `StateInit{code:^cell,data:^cell}`

### Context
TL-B: `_ bounceable:bool sender:address value:int257 raw:^slice = Context`
Signature: `Context{bounceable:bool,sender:address,value:int257,raw:^slice}`

### SendParameters
TL-B: `_ mode:int257 body:Maybe ^cell code:Maybe ^cell data:Maybe ^cell value:int257 to:address bounce:bool = SendParameters`
Signature: `SendParameters{mode:int257,body:Maybe ^cell,code:Maybe ^cell,data:Maybe ^cell,value:int257,to:address,bounce:bool}`

### MessageParameters
TL-B: `_ mode:int257 body:Maybe ^cell value:int257 to:address bounce:bool = MessageParameters`
Signature: `MessageParameters{mode:int257,body:Maybe ^cell,value:int257,to:address,bounce:bool}`

### DeployParameters
TL-B: `_ mode:int257 body:Maybe ^cell value:int257 bounce:bool init:StateInit{code:^cell,data:^cell} = DeployParameters`
Signature: `DeployParameters{mode:int257,body:Maybe ^cell,value:int257,bounce:bool,init:StateInit{code:^cell,data:^cell}}`

### StdAddress
TL-B: `_ workchain:int8 address:uint256 = StdAddress`
Signature: `StdAddress{workchain:int8,address:uint256}`

### VarAddress
TL-B: `_ workchain:int32 address:^slice = VarAddress`
Signature: `VarAddress{workchain:int32,address:^slice}`

### BasechainAddress
TL-B: `_ hash:Maybe int257 = BasechainAddress`
Signature: `BasechainAddress{hash:Maybe int257}`

### PaymentRequest
TL-B: `_ buyer:address seller:address amount:int257 buyerPaysCommission:bool optionalCommissionWallet:address = PaymentRequest`
Signature: `PaymentRequest{buyer:address,seller:address,amount:int257,buyerPaysCommission:bool,optionalCommissionWallet:address}`

### Preview
TL-B: `_ commission:int257 totalPay:int257 = Preview`
Signature: `Preview{commission:int257,totalPay:int257}`

### Transfer
TL-B: `transfer#42c20f7a req:PaymentRequest{buyer:address,seller:address,amount:int257,buyerPaysCommission:bool,optionalCommissionWallet:address} deadline:int257 = Transfer`
Signature: `Transfer{req:PaymentRequest{buyer:address,seller:address,amount:int257,buyerPaysCommission:bool,optionalCommissionWallet:address},deadline:int257}`

### SetPlatformCommissionBps
TL-B: `set_platform_commission_bps#eeab28d0 newBps:int257 = SetPlatformCommissionBps`
Signature: `SetPlatformCommissionBps{newBps:int257}`

### WithdrawAll
TL-B: `withdraw_all#e225cbda to:address = WithdrawAll`
Signature: `WithdrawAll{to:address}`

### PaymentProcessor$Data
TL-B: `_ owner:address platformCommissionBps:int257 mainCommissionWallet:address nftCollection:address nonces:dict<address, int> = PaymentProcessor`
Signature: `PaymentProcessor{owner:address,platformCommissionBps:int257,mainCommissionWallet:address,nftCollection:address,nonces:dict<address, int>}`

## Get methods
Total get methods: 2

## previewPayment
Argument: amount
Argument: buyerPaysCommission

## nonceOf
Argument: account

## Exit codes
* 2: Stack underflow
* 3: Stack overflow
* 4: Integer overflow
* 5: Integer out of expected range
* 6: Invalid opcode
* 7: Type check error
* 8: Cell overflow
* 9: Cell underflow
* 10: Dictionary error
* 11: 'Unknown' error
* 12: Fatal error
* 13: Out of gas error
* 14: Virtualization error
* 32: Action list is invalid
* 33: Action list is too long
* 34: Action is invalid or not supported
* 35: Invalid source address in outbound message
* 36: Invalid destination address in outbound message
* 37: Not enough Toncoin
* 38: Not enough extra currencies
* 39: Outbound message does not fit into a cell after rewriting
* 40: Cannot process a message
* 41: Library reference is null
* 42: Library change action error
* 43: Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree
* 50: Account state size exceeded limits
* 128: Null reference exception
* 129: Invalid serialization prefix
* 130: Invalid incoming message
* 131: Constraints error
* 132: Access denied
* 133: Contract stopped
* 134: Invalid argument
* 135: Code of a contract was not found
* 136: Invalid standard address
* 138: Not a basechain address
* 12074: empty
* 15534: expired
* 42041: buyer must send
* 47884: insufficient value
* 54178: invalid amount
* 57790: bps out of range
* 58772: only owner
* 62794: invalid seller

## Trait inheritance diagram

```mermaid
graph TD
PaymentProcessor
PaymentProcessor --> BaseTrait
```

## Contract dependency diagram

```mermaid
graph TD
PaymentProcessor
```