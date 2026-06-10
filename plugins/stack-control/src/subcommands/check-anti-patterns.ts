// `stackctl check-anti-patterns` (010 / US4) — per-codebase anti-pattern gate.
//
// Thin dispatch shim over the ported `check-anti-patterns` module's CLI entry
// (`main`), which owns flag parsing, per-codebase registry + scan-root
// resolution (the nearest-enclosing stack-control installation), the
// regex/fingerprint scan, and the documented exit codes (0 clean / 1 findings
// under --gate-mode / 2 I/O-or-parse error). The verb is the vendor-neutral
// core (FR-034): runnable in a plain shell, no Claude Code surface required.

import { main } from '../scope-discovery/check-anti-patterns.js';

export async function runCheckAntiPatterns(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
