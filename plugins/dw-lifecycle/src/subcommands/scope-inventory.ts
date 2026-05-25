// Dispatch shim — see scope-discovery/scope-inventory.ts for the flag
// + exit-code contract. Routes the `dw-lifecycle scope-inventory`
// subcommand to the orchestrator's `scopeInventoryMain(argv)` and
// bridges its numeric return code into a process.exit so the
// dispatcher's contract (handlers exit the process) matches the other
// subcommands.

import { scopeInventoryMain } from '../scope-discovery/scope-inventory.js';

export async function scopeInventory(args: string[]): Promise<void> {
  const code = await scopeInventoryMain(args);
  process.exit(code);
}
