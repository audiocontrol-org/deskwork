// `stackctl check-module-symmetry` (010 / US4) — per-codebase fleet matrix.
//
// Thin dispatch shim over the ported `check-module-symmetry` module's CLI entry
// (`main`), which owns flag parsing, per-codebase registry + scan-root
// resolution (the nearest-enclosing stack-control installation), the
// cross-module adoption matrix computation, and the documented exit codes
// (0 clean / 1 ⚠-or-✗ cells / 2 I/O-or-parse error). The verb is the
// vendor-neutral core (FR-034): runnable in a plain shell.

import { main } from '../scope-discovery/check-module-symmetry.js';

export async function runCheckModuleSymmetry(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
