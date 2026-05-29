// Dispatch shim — see scope-discovery/check-refactor-preconditions.ts for the
// flag + exit-code contract. Routes the `dw-lifecycle
// check-refactor-preconditions` subcommand to the gate's `main(argv)` and
// bridges its numeric return code into a process.exit so the dispatcher's
// contract (handlers exit the process) matches the other subcommands.
//
// Operators wire this as a commit-msg hook in `.githooks/commit-msg`:
//   dw-lifecycle check-refactor-preconditions --commit-msg-file "$1"
// per Phase 2 Risk #10 in the pilot map.

import { main } from '../scope-discovery/check-refactor-preconditions.js';

export async function checkRefactorPreconditions(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
