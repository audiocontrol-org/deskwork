// Dispatch shim — see scope-discovery/dispose-clone.ts for the flag +
// exit-code contract. Routes the `dw-lifecycle dispose-clone` subcommand
// to the wrapper's `main(argv)` and bridges its numeric result code into
// a process.exit so the dispatcher's contract (handlers exit the
// process) is honored.

import { main } from '../scope-discovery/dispose-clone.js';

export async function disposeClone(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
