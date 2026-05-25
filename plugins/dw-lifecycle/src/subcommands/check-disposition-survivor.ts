// Dispatch shim — see scope-discovery/check-disposition-survivor.ts for
// the flag + exit-code contract. Routes the `dw-lifecycle
// check-disposition-survivor` subcommand to the gate's `main(argv)`
// and bridges its numeric return code into a process.exit so the
// dispatcher's contract (handlers exit the process) matches the other
// subcommands.
//
// Operators wire this as a pre-commit hook in `.githooks/pre-commit`
// (or via Phase 8's install-scope-discovery-hooks installer) — the
// gate's exit-1 fails the commit when a disposition silently reverts
// to `pending`.

import { main } from '../scope-discovery/check-disposition-survivor.js';

export async function checkDispositionSurvivor(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
