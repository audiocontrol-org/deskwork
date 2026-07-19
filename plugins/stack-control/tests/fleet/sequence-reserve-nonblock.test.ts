// specs/036-fleet-control-plane — AUDIT-20260718-15 (RED-first regression).
//
// THE DEFECT (a REGRESSION introduced by the round-1 AUDIT-20260717-07 fix):
// `reserveNextSequence` acquires a cross-process lockfile via a SYNCHRONOUS poll
// loop. On contention it calls `sleepSyncMs(LOCK_POLL_MS)` — a genuinely
// blocking `Atomics.wait` on the main thread — repeatedly for up to
// `LOCK_ACQUIRE_TIMEOUT_MS` (formerly 10_000ms). That is real, synchronous,
// single-threaded blocking of the whole `stackctl` process: the fail-open
// try/catch around the caller cannot interrupt it, because the block happens
// INSIDE the synchronous call before it ever returns or throws.
//
// The feature's dominating invariant is "emission never blocks the invocation"
// (spec § "The constraint that dominates every other"; cli.ts wraps every verb
// with `runInvocationWithTelemetry` under "emission never blocks, throws, or
// affects exit code/output"). Under this repo's own parallel `stackctl`
// dispatch (up to 16 concurrent agents each shelling out), contention on the
// single per-installation lockfile could stall many invocations for seconds —
// directly violating that invariant.
//
// THE FIX: the reservation must NEVER block the hot path for a meaningful time.
// On contention it now fails open FAST (bounded sub-second budget, orders of
// magnitude above the real single-digit-ms critical section but far below the
// old multi-second block) rather than blocking. A fail-open reservation drops
// this one event's sequence (the caller's fail-open try/catch skips the emit) —
// telemetry is best-effort; the invocation is never degraded.
//
// RED PROOF: hold the reservation lock with a FRESH (non-stale) lockfile, then
// time `reserveNextSequence`. Pre-fix it blocks multiple seconds (poll loop
// until the old ceiling / the 5s stale-steal). Post-fix it fails open within a
// tiny bound. The `sequence-race.test.ts` distinctness guarantee for the
// legitimately-contended concurrent case stays green (proven separately there).
//
// Real fs, real temp dirs. No fake timers — real wall-clock is the whole point.
// Relative `.js` imports under node16.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { locateMachineState } from '../../src/machine-state/locate.js';
import {
  highWaterMarkLockPath,
  readHighWaterMark,
  reserveNextSequence,
} from '../../src/machine-state/highwater.js';
import { useMachineStateStore } from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';

function makeInstallationRoot(): { root: string; dispose(): void } {
  const base = IS_WIN ? tmpdir() : '/tmp';
  const root = mkdtempSync(join(base, 'scf-seqnonblock-inst-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('AUDIT-20260718-15 — reserveNextSequence never synchronously blocks the invocation', () => {
  const store = useMachineStateStore();

  it('fails open FAST under a held lock — bounded well under a second, never the old multi-second block', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      const lockPath = highWaterMarkLockPath(location);
      // Hold the lock with a FRESH lockfile (mtime = now), so the stale-steal
      // path (LOCK_STALE_MS) does NOT apply — this models a concurrent holder
      // mid-reservation. `wx` guarantees we are the sole creator.
      writeFileSync(lockPath, `${process.pid}\n`, { flag: 'wx' });

      const start = performance.now();
      let failedOpen = false;
      try {
        reserveNextSequence(location);
      } catch {
        // A throw is the fail-open signal — the caller's try/catch skips the emit.
        failedOpen = true;
      }
      const elapsedMs = performance.now() - start;

      // eslint-disable-next-line no-console
      console.log(`[AUDIT-15] reserveNextSequence under held lock: ${elapsedMs.toFixed(1)}ms`);

      // The load-bearing assertion: it must NOT block for a meaningful time.
      // Pre-fix: multiple seconds (poll loop to the old ceiling / stale-steal).
      // Post-fix: a tiny sub-second budget.
      expect(elapsedMs).toBeLessThan(1000);
      // And it fails open (drops this event's sequence) rather than blocking on.
      expect(failedOpen).toBe(true);
      // The durable mark was NOT advanced — a dropped reservation reserves nothing.
      expect(readHighWaterMark(location)).toBe(0);
    } finally {
      inst.dispose();
    }
  }, 30_000);
});
