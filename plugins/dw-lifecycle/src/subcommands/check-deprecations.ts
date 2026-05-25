// Dispatch shim — see scope-discovery/check-deprecations.ts for the flag
// + exit-code contract. Routes the `dw-lifecycle check-deprecations`
// subcommand to the scanner's `main(argv)` and bridges its numeric return
// code into a process.exit so the dispatcher's contract (handlers exit
// the process) matches the other subcommands.
//
// The underlying check-deprecations is currently a SUBCOMMAND SHELL —
// see https://github.com/audiocontrol-org/deskwork/issues/287 for the
// full deprecation-scan port. The shim contract is forward-compatible:
// when #287 lands, the shim does not change.

import { main } from '../scope-discovery/check-deprecations.js';

export async function checkDeprecations(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
