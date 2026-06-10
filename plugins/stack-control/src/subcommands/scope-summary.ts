// Dispatch shim — see scope-discovery/summary.ts for the flag + exit-code
// contract. Routes `stackctl scope-summary` to the summary library API; the
// library function process.exits with the numeric result code (0 success,
// 2 invalid args / bad glob / no install / I/O error).

import { scopeSummaryMain } from '../scope-discovery/summary.js';

export async function runScopeSummary(args: string[]): Promise<void> {
  await scopeSummaryMain(args);
}
