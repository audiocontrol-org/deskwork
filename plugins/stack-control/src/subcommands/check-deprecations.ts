// `stackctl check-deprecations` (010 / US4) — per-codebase deprecation queue.
//
// Thin dispatch shim over the ported `check-deprecations` module's CLI entry
// (`main`), which owns flag parsing, per-codebase scan-root resolution (the
// nearest-enclosing stack-control installation), the @deprecated-marker +
// importer scan, and the documented exit codes (0 success — the gate is
// informational and never blocks on importers / 2 I/O-or-parse error). The
// verb is the vendor-neutral core (FR-034): runnable in a plain shell.

import { main } from '../scope-discovery/check-deprecations.js';

export async function runCheckDeprecations(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
