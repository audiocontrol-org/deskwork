// `stackctl check-refactor-preconditions` (010 T027 / US2) — refactor gate.
//
// Thin dispatch shim over `main` (scope-discovery/check-refactor-preconditions.ts),
// which owns flag parsing (rejects unknown flags → exit 2), the refactor-marker
// extraction, the per-precondition runtime checks, and the documented exit codes
// (0 clean-or-informational / 1 failures under --gate-mode / 2 infra error).
// The module's `main` returns the numeric code; the shim translates it to
// process.exit.

import { main } from '../scope-discovery/check-refactor-preconditions.js';

export async function runCheckRefactorPreconditions(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
