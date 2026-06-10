// `stackctl check-adopters` (010 / US4) — per-codebase adopter-manifest gate.
//
// Thin dispatch shim over the ported `check-adopters` module's CLI entry
// (`main`), which owns flag parsing, per-codebase registry + scan-root
// resolution (the nearest-enclosing stack-control installation), the
// glob + import-regex holdout scan, and the documented exit codes (0 clean /
// 1 holdouts under --gate-mode / 2 I/O-or-parse error). The verb is the
// vendor-neutral core (FR-034): runnable in a plain shell.

import { main } from '../scope-discovery/check-adopters.js';

export async function runCheckAdopters(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
