// Dispatch shim — see scope-discovery/validate-scope-discovery.ts for
// the flag + exit-code contract. Routes the
// `dw-lifecycle validate-scope-discovery` subcommand to the wrapper's
// `main(argv)` and bridges its numeric return code into a process.exit.

import { main } from '../scope-discovery/validate-scope-discovery.js';

export async function validateScopeDiscovery(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
