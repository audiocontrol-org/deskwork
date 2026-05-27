// Dispatch shim — see scope-discovery/migrate-from-pilot.ts for the
// flag + exit-code contract. Routes `dw-lifecycle migrate-from-pilot`
// to `migrateFromPilotMain(argv)` and bridges the numeric return code
// into a process.exit so the dispatcher's contract (handlers exit the
// process) is honored.

import { migrateFromPilotMain } from '../scope-discovery/migrate-from-pilot.js';

export async function migrateFromPilot(args: string[]): Promise<void> {
  const code = await migrateFromPilotMain(args);
  process.exit(code);
}
