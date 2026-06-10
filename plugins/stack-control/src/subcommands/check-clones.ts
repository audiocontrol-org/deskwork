// `stackctl check-clones` (010 T017) — per-codebase clone-detection gate.
//
// Thin dispatch shim over `checkClones` (scope-discovery/clone-detector.ts),
// which owns flag parsing (rejects unknown flags → exit 2), the boundary-scoped
// jscpd run, the baseline diff, and the documented exit codes
// (0 clean / 1 NEW groups / 2 I/O-or-engine error). The verb is the
// vendor-neutral core (FR-034): runnable in a plain shell, no Claude Code
// surface required.

import { checkClones } from '../scope-discovery/clone-detector.js';

export async function runCheckClones(args: string[]): Promise<void> {
  await checkClones(args);
}
