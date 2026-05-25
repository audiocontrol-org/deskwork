// Dispatch shim — see scope-discovery/refresh-clones-baseline.ts for the
// flag + exit-code contract. Routes the `dw-lifecycle
// refresh-clones-baseline` subcommand to the wrapper's `main(argv)`.
// The underlying `detectClones` calls process.exit, so the shim just
// awaits.

import { main } from '../scope-discovery/refresh-clones-baseline.js';

export async function refreshClonesBaseline(args: string[]): Promise<void> {
  await main(args);
}
