// Dispatch shim — see scope-discovery/batch-dispose.ts for the flag
// + exit-code contract. Routes the `dw-lifecycle batch-dispose`
// subcommand to the CLI's `main(argv)` so the dispatcher's contract
// (handlers exit the process) matches the other subcommands.
//
// The underlying `main()` already calls process.exit with the
// numeric result code (0 applied + verified, 1 verify-after-write
// mismatch, 2 invalid args / unknown id / I/O error); this shim is
// the typed surface the dispatcher imports.

import { main } from '../scope-discovery/batch-dispose.js';

export async function batchDispose(args: string[]): Promise<void> {
  await main(args);
}
