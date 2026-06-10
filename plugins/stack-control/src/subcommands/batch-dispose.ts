// `stackctl batch-dispose` (010 T027 / US2) — bulk clone-disposition apply.
//
// Thin dispatch shim over `main` (scope-discovery/batch-dispose.ts), which owns
// flag parsing (rejects unknown flags → exit 2), the per-codebase baseline
// resolution, the apply + verify-after-write, and the documented exit codes
// (0 applied+verified / 1 verify mismatch / 2 invalid-args-or-unknown-id).
// `main` calls process.exit itself.

import { main } from '../scope-discovery/batch-dispose.js';

export async function runBatchDispose(args: string[]): Promise<void> {
  await main(args);
}
