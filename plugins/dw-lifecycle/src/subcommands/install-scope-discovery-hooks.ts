// Dispatch shim — see scope-discovery/install-scope-discovery-hooks.ts
// for the flag + exit-code contract. Routes the `dw-lifecycle
// install-scope-discovery-hooks` subcommand to the library API.

import { main } from '../scope-discovery/install-scope-discovery-hooks.js';

export async function installScopeDiscoveryHooks(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
