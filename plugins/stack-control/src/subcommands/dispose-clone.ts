// `stackctl dispose-clone` (010 T027 / US2) — single-clone disposition wrapper.
//
// Thin dispatch shim over `main` (scope-discovery/dispose-clone.ts), which owns
// flag parsing (rejects unknown flags → exit 2), the refactor gate, and the
// pass-through to batch-dispose. The module's `main` returns a numeric exit
// code; the shim translates it to process.exit.

import { main } from '../scope-discovery/dispose-clone.js';

export async function runDisposeClone(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
