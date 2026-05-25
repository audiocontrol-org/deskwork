// Dispatch shim — see scope-discovery/check-adopters.ts for the flag
// + exit-code contract. Routes the `dw-lifecycle check-adopters`
// subcommand to the scanner's `main(argv)` and bridges its numeric
// return code into a process.exit so the dispatcher's contract
// (handlers exit the process) matches the other subcommands.

import { main } from '../scope-discovery/check-adopters.js';

export async function checkAdopters(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
