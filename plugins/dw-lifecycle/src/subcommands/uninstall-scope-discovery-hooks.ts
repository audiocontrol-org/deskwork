// Dispatch shim — see scope-discovery/uninstall-scope-discovery-hooks.ts
// for the flag + exit-code contract. Routes the `dw-lifecycle
// uninstall-scope-discovery-hooks` subcommand to the library API.

import { main } from '../scope-discovery/uninstall-scope-discovery-hooks.js';

export async function uninstallScopeDiscoveryHooks(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
