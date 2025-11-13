// Global BigInt JSON serialization shim for Jest workers
// Ensures any BigInt inside results, errors or logs won't crash stringify
// eslint-disable-next-line @typescript-eslint/no-explicit-any
try { (BigInt.prototype as any).toJSON = function () { return this.toString(); }; } catch {}

// Patch JSON.stringify to convert BigInt values to strings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __jsonStringify = JSON.stringify as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(JSON as any).stringify = function (value: any, replacer?: any, space?: any) {
  const wrapped = (key: any, val: any) => (typeof val === 'bigint' ? val.toString() : (replacer ? replacer(key, val) : val));
  return __jsonStringify(value, wrapped, space);
};

