// Dispatch shim — see scope-discovery/customize.ts for the flag + exit-code
// contract. Routes `stackctl customize scope-discovery <name>` to the library
// API; bridges its numeric result code into a process.exit so the dispatcher's
// contract (handlers exit the process) is honored.

import { main } from '../scope-discovery/customize.js';

export async function runCustomize(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
