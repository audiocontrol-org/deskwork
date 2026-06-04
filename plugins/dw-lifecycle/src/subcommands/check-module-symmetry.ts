// Dispatch shim — see scope-discovery/check-module-symmetry.ts for the
// flag + exit-code contract. Routes the `dw-lifecycle check-editor-
// symmetry` subcommand (verb-name unchanged in Phase 25 Task 4; verb
// rename lives in Task 5) to the scanner's `main(argv)` and bridges
// its numeric return code into a process.exit so the dispatcher's
// contract (handlers exit the process) matches the other subcommands.

import { main } from '../scope-discovery/check-module-symmetry.js';

export async function checkEditorSymmetry(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
