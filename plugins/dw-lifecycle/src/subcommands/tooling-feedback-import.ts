// Dispatch shim — see scope-discovery/tooling-feedback-import.ts for the
// flag + exit-code contract. Routes the `dw-lifecycle
// tooling-feedback-import` subcommand to the library API; bridges its
// numeric result code into a process.exit so the dispatcher's contract
// (handlers exit the process) is honored.

import { main } from '../scope-discovery/tooling-feedback-import.js';

export async function toolingFeedbackImport(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
