// `stackctl validate-scope-discovery` (010 / US5) — run the scope-discovery
// adversarial harness suite via vitest.
//
// Dispatch shim — see scope-discovery/validate-scope-discovery.ts for the
// flag + exit-code contract. Routes the `stackctl validate-scope-discovery`
// subcommand to the module's `main(argv)` and bridges its numeric return
// code into a process.exit.

import { main } from '../scope-discovery/validate-scope-discovery.js';

export async function runValidateScopeDiscovery(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
