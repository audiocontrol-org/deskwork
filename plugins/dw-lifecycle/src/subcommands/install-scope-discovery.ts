// Dispatch shim — see scope-discovery/install-scope-discovery.ts for
// the flag + exit-code contract. Routes the `dw-lifecycle
// install-scope-discovery` subcommand to the library API; bridges the
// numeric result code into a process.exit so the dispatcher's contract
// (handlers exit the process) is honored.

import { main } from '../scope-discovery/install-scope-discovery.js';

export async function installScopeDiscovery(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
