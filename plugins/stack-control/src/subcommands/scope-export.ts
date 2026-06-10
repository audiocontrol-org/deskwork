// Dispatch shim — see scope-discovery/scope-export.ts for the flag + exit-code
// contract. Routes `stackctl scope-export` to the library API; bridges its
// numeric result code into a process.exit so the dispatcher's contract
// (handlers exit the process) is honored.

import { main } from '../scope-discovery/scope-export.js';

export async function runScopeExport(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
