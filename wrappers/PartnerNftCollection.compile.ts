import { type CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/PartnerNftCollection.tact',
  options: {
      debug: true,
      external: true,
  },
};