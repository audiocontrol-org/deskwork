// Dispatch shim — see scope-discovery/scope-doctor.ts for the flag + exit-code
// contract. Routes `stackctl scope-doctor` to the runner; bridges its numeric
// result code into a process.exit so the dispatcher's contract (handlers exit
// the process) is honored. Named `scope-doctor` to avoid colliding with a
// future generic `doctor` verb.

import { main } from '../scope-discovery/scope-doctor.js';

export async function runScopeDoctor(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
