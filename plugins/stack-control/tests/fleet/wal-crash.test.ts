// specs/036-fleet-control-plane — T080 (RED), Phase 6 (US4 — trust what the
// fleet says), pairs with T084's `src/sidecar/spool/wal.ts` impl.
//
// CONTRACT UNDER TEST (research.md R-03, PT-003; data-model.md § Delivery
// semantics): the spec's original phrasing — "the sidecar must not exit
// holding an un-flushed spool" — is UNSATISFIABLE by construction, because
// `SIGKILL` runs no code (and Windows does not deliver a real `SIGTERM`).
// R-03 inverts the guarantee: a CRASH-SAFE ON-DISK WRITE-AHEAD SPOOL makes
// exiting-with-an-unflushed-spool NON-CATASTROPHIC rather than impossible.
// Records are durable BEFORE acknowledgement (fsync-before-ack), so a
// SIGKILL mid-spool loses NO record that was ever acknowledged or made
// durable — replay on restart recovers it. Graceful shutdown is demoted
// from a correctness guarantee to a latency optimization.
//
// THIS TEST MODELS THE SIGKILL, NOT A GRACEFUL SHUTDOWN: it appends records
// through one WAL handle, then — WITHOUT calling close()/flush() on that
// handle, exactly as a real SIGKILL would prevent — constructs a FRESH WAL
// handle over the SAME on-disk directory (simulating the sidecar process
// restarting after being killed) and asserts every durably-written record
// replays. If durability depended on a graceful close, this test would
// fail; the R-03 decision is that it must not.
//
// WHY THIS IS RED AT MODULE LOAD (not a typo): `src/sidecar/spool/wal.ts`
// does not exist yet (T084 is unimplemented). This test imports `openWal`
// (a VALUE) from that module, so the import itself fails module-not-found
// until T084 lands.
//
// EXPECTED SURFACE THIS TEST ASSUMES OF `src/sidecar/spool/wal.ts` (T084):
//
//   export interface WalRecord {
//     readonly sequence: number;
//     // Byte-identical to what will be transmitted/stored (FR-049) — a
//     // spooled record is opaque bytes to the WAL, never reinterpreted.
//     readonly payload: string;
//   }
//
//   export interface WalHandle {
//     // Durable BEFORE the returned promise resolves (fsync-before-ack,
//     // R-03) — the caller's at-least-once transmit loop may treat a
//     // resolved append() as "safe to have acknowledged upstream".
//     append(payload: string): Promise<void>;
//     // Reads every durably-written record back, in write order, on
//     // restart. Must recover records written by a PRIOR handle over the
//     // same directory that was never closed (this is the whole point).
//     replay(): Promise<WalRecord[]>;
//     // Graceful-shutdown path (a latency optimization per PT-003) —
//     // deliberately NOT called in this test, which exercises the ungraceful
//     // path R-03 exists to make safe.
//     close(): Promise<void>;
//   }
//
//   export function openWal(directory: string): Promise<WalHandle>;
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real tmp dir on disk (never a mocked filesystem — .claude/rules/
// testing.md); the dir is `mkdtemp`-unique per the file-handling rule (never
// a bare `/tmp/<name>` path).

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWal, type WalHandle, type WalRecord } from '../../src/sidecar/spool/wal.js';

describe('crash-safe WAL spool: SIGKILL mid-spool loses no records (T080, R-03)', () => {
  let dir: string;

  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('replays every durably-appended record after an ungraceful restart (no close() called)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wal-crash-'));

    const written = [
      JSON.stringify({ sequence: 1, note: 'run.started' }),
      JSON.stringify({ sequence: 2, note: 'run.progress' }),
      JSON.stringify({ sequence: 3, note: 'run.completed' }),
    ];

    const beforeCrash: WalHandle = await openWal(dir);
    await beforeCrash.append(written[0]);
    await beforeCrash.append(written[1]);
    await beforeCrash.append(written[2]);

    // SIMULATE SIGKILL: deliberately no `beforeCrash.close()`, no flush call
    // of any kind. `SIGKILL` runs no code — a real crash gives the process
    // exactly this much (and no more) opportunity to clean up. `beforeCrash`
    // is simply abandoned here, unreferenced from this point on.

    // SIMULATE RESTART: a fresh WAL handle over the SAME directory, as the
    // sidecar's next boot would construct.
    const afterCrash: WalHandle = await openWal(dir);
    const replayed: WalRecord[] = await afterCrash.replay();

    expect(replayed).toHaveLength(3);
    expect(replayed.map((record) => record.payload)).toEqual(written);
    // Sequence is preserved in write order — replay must not reorder.
    expect(replayed.map((record) => record.sequence)).toEqual([1, 2, 3]);
  });

  it('survives a SECOND ungraceful restart, accumulating durable records across both crashes', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wal-crash-'));

    const first: WalHandle = await openWal(dir);
    await first.append(JSON.stringify({ sequence: 1, note: 'first-epoch' }));
    // No close() — first crash.

    const second: WalHandle = await openWal(dir);
    const afterFirstCrash = await second.replay();
    expect(afterFirstCrash).toHaveLength(1);

    await second.append(JSON.stringify({ sequence: 2, note: 'second-epoch' }));
    // No close() — second crash.

    const third: WalHandle = await openWal(dir);
    const afterSecondCrash = await third.replay();

    expect(afterSecondCrash).toHaveLength(2);
    expect(afterSecondCrash.map((record) => record.sequence)).toEqual([1, 2]);
  });
});
