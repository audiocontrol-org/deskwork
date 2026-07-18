// specs/036-fleet-control-plane — AUDIT-20260717-07 concurrency worker.
// NOT a *.test.ts (leading underscore keeps vitest from collecting it).
//
// One child process that reserves a single `installationSequence` value against
// a shared machine-local store, then prints it. Run N of these concurrently
// against ONE store to exercise the cross-process read-increment-write.
//
// Two modes, selected by SCF_MODE:
//   - 'naive':  the DEFECTIVE cli.ts pattern —
//               `advanceHighWaterMark(location, readHighWaterMark(location) + 1)`,
//               with the READ taken BEFORE a cross-process barrier so every
//               worker reads the same value → the TOCTOU collision is forced,
//               deterministically. This is the defect the fix removes.
//   - 'atomic': the fixed `reserveNextSequence(location)` primitive, contended
//               after the barrier — the exclusive-create lock serializes the
//               read-increment-write so every worker gets a DISTINCT value.
//
// A FILESYSTEM barrier (a marker file per worker + a spin until N markers exist)
// synchronizes the workers across processes — no shared memory needed. It does
// NOT rely on the workers starting simultaneously.
//
// Reads only the machine-state modules (NEVER the test harness, whose import
// poisons durable env) so the redirected store env passed by the parent is what
// resolves. Relative `.js` imports under node16.

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { locateMachineState } from '../../src/machine-state/locate.js';
import {
  advanceHighWaterMark,
  readHighWaterMark,
  reserveNextSequence,
} from '../../src/machine-state/highwater.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`_sequence-reserve-worker: missing required env ${name}`);
  }
  return value;
}

function sleepSyncMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function barrier(barrierDir: string, id: string, n: number): void {
  writeFileSync(join(barrierDir, id), '');
  const deadline = Date.now() + 20_000;
  while (readdirSync(barrierDir).length < n) {
    if (Date.now() > deadline) {
      throw new Error(`_sequence-reserve-worker: barrier timed out waiting for ${n} workers`);
    }
    sleepSyncMs(5);
  }
}

function main(): void {
  const mode = requireEnv('SCF_MODE');
  const root = requireEnv('SCF_ROOT');
  const barrierDir = requireEnv('SCF_BARRIER');
  const id = requireEnv('SCF_ID');
  const n = Number.parseInt(requireEnv('SCF_N'), 10);

  const location = locateMachineState(root);

  let value: number;
  if (mode === 'naive') {
    // Read BEFORE the barrier so all workers observe the same value — the TOCTOU
    // the fix removes, forced deterministic.
    const current = readHighWaterMark(location);
    barrier(barrierDir, id, n);
    value = advanceHighWaterMark(location, current + 1);
  } else {
    barrier(barrierDir, id, n);
    value = reserveNextSequence(location);
  }

  process.stdout.write(String(value));
}

main();
