// `stackctl refresh-clones-baseline` (010 T027 / US2) — rewrite the baseline.
//
// Thin dispatch shim over `main` (scope-discovery/refresh-clones-baseline.ts),
// which injects `--refresh-baseline` and forwards to checkClones (which owns
// flag validation + the documented exit codes and calls process.exit). The
// shim surfaces --help/-h through the module.

import { main } from '../scope-discovery/refresh-clones-baseline.js';

export async function runRefreshClonesBaseline(args: string[]): Promise<void> {
  await main(args);
}
