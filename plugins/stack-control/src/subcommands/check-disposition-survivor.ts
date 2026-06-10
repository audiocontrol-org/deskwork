// `stackctl check-disposition-survivor` (010 T027 / US2) — silent-revert gate.
//
// Thin dispatch shim over `main` (scope-discovery/check-disposition-survivor.ts),
// which owns flag parsing (rejects unknown flags → exit 2), the HEAD-vs-working
// disposition diff, and the documented exit codes (0 clean / 1 destructive
// transition / 2 I/O-or-git error). The module's `main` returns the numeric
// code; the shim translates it to process.exit.

import { main } from '../scope-discovery/check-disposition-survivor.js';

export async function runCheckDispositionSurvivor(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
