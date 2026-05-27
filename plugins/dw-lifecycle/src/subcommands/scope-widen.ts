// Dispatch shim — see scope-discovery/scope-widen.ts for the flag
// + exit-code contract. Routes the `dw-lifecycle scope-widen` subcommand
// to the orchestrator's `scopeWidenMain(argv)` and bridges its numeric
// return code into a process.exit so the dispatcher's contract
// (handlers exit the process) matches the other subcommands.

import { scopeWidenMain } from '../scope-discovery/scope-widen.js';

export async function scopeWiden(args: string[]): Promise<void> {
  const code = await scopeWidenMain(args);
  process.exit(code);
}
