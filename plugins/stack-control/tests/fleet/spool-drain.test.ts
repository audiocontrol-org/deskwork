// specs/036-fleet-control-plane — T085 (RED, written alongside its own
// impl), Phase 6 (US4) / FR-017.
//
// FR-017: "The sidecar MUST reserve the right to coalesce or sample, and
// MUST enforce a maximum event size and a spool size cap with a DEFINED DROP
// POLICY NAMING WHAT IS DISCARDED FIRST." An unnamed/implicit drop policy is
// the failure mode this requirement guards against — this suite pins that
// the policy is explicit, deterministic, and observable (a caller/operator
// can see what was discarded and why).
//
// Two independent surfaces, both pure/testable without real time or network:
//
//   1. BOUNDED BACKOFF (the drain/transmit retry loop) — full jitter, ×2
//      growth, capped, server-suggested base reseeds, reset after a
//      sustained healthy period. Values align with
//      contracts/sidecar-plane-protocol.md § C4 reconnect policy (line ~43):
//      "full jitter, base 1s (reseeded by the server's `retry:` field), ×2,
//      cap 30s, reset after 60s healthy." This is a SEPARATE backoff (the
//      spool drain/transmit loop), not the SSE stream reconnect loop
//      (src/sidecar/uplink/transport.ts's future reconnect.ts) — same
//      shape, different call site, deliberately decoupled.
//
//   2. DROP POLICY — when the bounded spool is over capacity, WHICH records
//      are discarded first. Derived from the storage economics already
//      pinned in src/fleet/classification.ts's `CLASS_STORAGE_POLICY`:
//        - `live-only`  { mintsDurableObject: false, feedsRollup: false } —
//          cheapest to lose; never durably stored regardless.
//        - `aggregated` { mintsDurableObject: false, feedsRollup: true }  —
//          losing one record degrades (not erases) the eventual rollup.
//        - `durable`    { mintsDurableObject: true,  feedsRollup: false } —
//          IS the immutable historical record; dropped last, only when
//          unavoidable (never silently).
//      So the drop order (cheapest-to-lose first) is exactly live-only →
//      aggregated → durable.
//
// KEEP IT DECOUPLED: drain.ts operates over an INJECTED abstract spool
// snapshot (`{ classification }[]`) and an injected `transmit` function —
// it does NOT import src/sidecar/spool/wal.ts (a sibling task's concrete
// WAL) or src/sidecar/pipeline.ts. This test constructs its own fixture
// records; no concrete spool implementation exists yet.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore` (Principle VI). Real fixtures
// (fake clocks/jitter functions passed as plain closures), no mocking
// libraries.

import { describe, expect, it } from 'vitest';
import type { DrainRecord, DropClassification } from '../../src/sidecar/spool/drain.js';
import {
  BackoffSchedule,
  computeBackoffDelayMs,
  drainOnce,
  DROP_POLICY_NAME,
  selectDropVictims,
} from '../../src/sidecar/spool/drain.js';

describe('computeBackoffDelayMs — pure bounded-backoff schedule (PT-014 shape)', () => {
  it('grows the bounded delay ×2 per attempt (isolated via a constant jitter multiplier)', () => {
    const opts = { baseMs: 1000, capMs: 30_000, jitter: () => 0.5 };
    const d0 = computeBackoffDelayMs(0, opts);
    const d1 = computeBackoffDelayMs(1, opts);
    const d2 = computeBackoffDelayMs(2, opts);
    expect(d0).toBe(500); // 0.5 * min(30000, 1000 * 2^0)
    expect(d1).toBe(1000); // 0.5 * min(30000, 1000 * 2^1)
    expect(d2).toBe(2000); // 0.5 * min(30000, 1000 * 2^2)
  });

  it('is full-jitter — bounded within [0, boundedGrowth), not a fixed delay', () => {
    const boundedGrowth = Math.min(30_000, 1000 * 2 ** 3); // 8000
    const atZero = computeBackoffDelayMs(3, { baseMs: 1000, capMs: 30_000, jitter: () => 0 });
    const nearMax = computeBackoffDelayMs(3, {
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.999999,
    });
    expect(atZero).toBe(0);
    expect(nearMax).toBeLessThan(boundedGrowth);
    expect(nearMax).toBeGreaterThan(boundedGrowth * 0.99);
  });

  it('honors the cap: growth far past the cap is bounded to capMs, never unbounded ×2', () => {
    const delay = computeBackoffDelayMs(10, {
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.999999999,
    });
    // 1000 * 2^10 = 1,024,000ms, far past the 30s cap.
    expect(delay).toBeLessThanOrEqual(30_000);
    expect(delay).toBeGreaterThan(29_000);
  });

  it('a server-suggested retry (SSE retry: field) reseeds the base used for growth', () => {
    const withoutHint = computeBackoffDelayMs(0, { baseMs: 1000, capMs: 30_000, jitter: () => 0.5 });
    const withHint = computeBackoffDelayMs(0, {
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      serverRetryMs: 5000,
    });
    expect(withoutHint).toBe(500);
    expect(withHint).toBe(2500); // 0.5 * 5000, baseMs ignored in favor of the server hint
  });

  it('rejects a negative or non-integer attempt (fail loud, no silent clamp)', () => {
    expect(() =>
      computeBackoffDelayMs(-1, { baseMs: 1000, capMs: 30_000, jitter: () => 0 }),
    ).toThrow(/attempt/);
    expect(() =>
      computeBackoffDelayMs(1.5, { baseMs: 1000, capMs: 30_000, jitter: () => 0 }),
    ).toThrow(/attempt/);
  });

  it('rejects a jitter() return value outside [0, 1)', () => {
    expect(() =>
      computeBackoffDelayMs(0, { baseMs: 1000, capMs: 30_000, jitter: () => 1 }),
    ).toThrow(/jitter/);
    expect(() =>
      computeBackoffDelayMs(0, { baseMs: 1000, capMs: 30_000, jitter: () => -0.1 }),
    ).toThrow(/jitter/);
  });

  it('rejects a non-positive baseMs or capMs', () => {
    expect(() =>
      computeBackoffDelayMs(0, { baseMs: 0, capMs: 30_000, jitter: () => 0 }),
    ).toThrow(/baseMs/);
    expect(() =>
      computeBackoffDelayMs(0, { baseMs: 1000, capMs: 0, jitter: () => 0 }),
    ).toThrow(/capMs/);
  });
});

describe('BackoffSchedule — stateful wrapper modeling reseed + reset-after-healthy explicitly', () => {
  it('advances its own attempt counter across successive nextDelayMs() calls', () => {
    const schedule = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });
    expect(schedule.attemptCount).toBe(0);
    const d0 = schedule.nextDelayMs();
    expect(schedule.attemptCount).toBe(1);
    const d1 = schedule.nextDelayMs();
    expect(schedule.attemptCount).toBe(2);
    expect(d0).toBe(500);
    expect(d1).toBe(1000);
  });

  it('reseedBase() reseeds the base used by subsequent nextDelayMs() calls', () => {
    const schedule = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });
    schedule.reseedBase(5000);
    expect(schedule.nextDelayMs()).toBe(2500); // 0.5 * 5000 * 2^0
  });

  it('resets the attempt counter after a sustained healthy period (PT-014: "reset after 60s healthy")', () => {
    const schedule = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });
    schedule.nextDelayMs();
    schedule.nextDelayMs();
    schedule.nextDelayMs();
    expect(schedule.attemptCount).toBe(3);

    schedule.markHealthy(0);
    schedule.markHealthy(59_999); // not yet sustained for the full window
    expect(schedule.attemptCount).toBe(3);

    schedule.markHealthy(60_000); // sustained >= healthyResetMs since the first mark
    expect(schedule.attemptCount).toBe(0);
  });

  it('markBroken() clears the healthy-tracking window so a new sustained period is required to reset again', () => {
    const schedule = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });
    schedule.nextDelayMs();
    schedule.markHealthy(0);
    schedule.markBroken();
    schedule.markHealthy(60_000); // starts a NEW window; does not reset off the cleared one
    expect(schedule.attemptCount).toBe(1);
  });

  it('rejects a non-positive reseeded base', () => {
    const schedule = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });
    expect(() => schedule.reseedBase(0)).toThrow(/serverRetryMs/);
    expect(() => schedule.reseedBase(-5)).toThrow(/serverRetryMs/);
  });
});

describe('selectDropVictims — the FR-017 drop policy (names what is discarded first)', () => {
  const spool: readonly DrainRecord[] = [
    { classification: 'durable' }, // 0
    { classification: 'live-only' }, // 1
    { classification: 'aggregated' }, // 2
    { classification: 'live-only' }, // 3
    { classification: 'durable' }, // 4
    { classification: 'aggregated' }, // 5
  ];

  it('discards live-only records first, oldest-arrived first', () => {
    const result = selectDropVictims(spool, 1);
    expect(result.dropped).toEqual([1]);
  });

  it('exhausts live-only (both instances) before ever touching aggregated', () => {
    const result = selectDropVictims(spool, 2);
    expect(result.dropped).toEqual([1, 3]);
  });

  it('moves on to aggregated only once live-only is exhausted', () => {
    const result = selectDropVictims(spool, 3);
    expect(result.dropped).toEqual([1, 3, 2]);
  });

  it('never touches durable until BOTH live-only and aggregated are exhausted', () => {
    const result = selectDropVictims(spool, 4);
    expect(result.dropped).toEqual([1, 3, 2, 5]);
    expect(result.dropped).not.toContain(0);
    expect(result.dropped).not.toContain(4);
  });

  it('drops durable only as a last resort, oldest durable first — and it IS reachable (never silently protected)', () => {
    const result = selectDropVictims(spool, 5);
    expect(result.dropped).toEqual([1, 3, 2, 5, 0]);
  });

  it('names the policy in a human-readable, observable string (the "naming what is discarded" requirement)', () => {
    const result = selectDropVictims(spool, 1);
    expect(result.policy).toBe(DROP_POLICY_NAME);
    expect(result.policy).toMatch(/live-only/);
    expect(result.policy).toMatch(/aggregated/);
    expect(result.policy).toMatch(/durable/);
  });

  it('overflowBy 0 drops nothing', () => {
    expect(selectDropVictims(spool, 0).dropped).toEqual([]);
  });

  it('rejects a negative or non-integer overflowBy', () => {
    expect(() => selectDropVictims(spool, -1)).toThrow(/overflowBy/);
    expect(() => selectDropVictims(spool, 1.5)).toThrow(/overflowBy/);
  });

  it('rejects an overflowBy greater than the spool length (cannot drop more than exists)', () => {
    expect(() => selectDropVictims(spool, spool.length + 1)).toThrow(/exceeds/);
  });

  it('drop-order derivation matches classification.ts CLASS_STORAGE_POLICY economics: the sole survivor of an almost-total drop is a durable record', () => {
    const almostAll = spool.length - 1;
    const result = selectDropVictims(spool, almostAll);
    const allIndices = [0, 1, 2, 3, 4, 5];
    const survivors = allIndices.filter((i) => !result.dropped.includes(i));
    expect(survivors).toHaveLength(1);
    const survivorIndex = survivors[0];
    if (survivorIndex === undefined) {
      throw new Error('test invariant violated: expected exactly one survivor index');
    }
    const survivorRecord = spool[survivorIndex];
    if (survivorRecord === undefined) {
      throw new Error('test invariant violated: survivor index out of range');
    }
    expect(survivorRecord.classification).toBe<DropClassification>('durable');
  });
});

describe('drainOnce — composes drop policy + injected transmit + injected backoff', () => {
  it('transmits the whole snapshot and drops nothing when under capacity', async () => {
    const records: readonly DrainRecord[] = [
      { classification: 'durable' },
      { classification: 'live-only' },
    ];
    const transmittedBatches: (readonly DrainRecord[])[] = [];
    const backoff = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });

    const result = await drainOnce({
      records,
      capacity: 10,
      transmit: async (batch) => {
        transmittedBatches.push(batch);
      },
      backoff,
    });

    expect(result.outcome).toBe('transmitted');
    if (result.outcome === 'transmitted') {
      expect(result.transmittedCount).toBe(2);
      expect(result.drop).toBeUndefined();
    }
    expect(transmittedBatches).toHaveLength(1);
    expect(transmittedBatches[0]).toHaveLength(2);
  });

  it('applies the drop policy before transmit when the snapshot exceeds capacity', async () => {
    const records: readonly DrainRecord[] = [
      { classification: 'durable' },
      { classification: 'live-only' },
      { classification: 'aggregated' },
    ];
    const transmittedBatches: (readonly DrainRecord[])[] = [];
    const backoff = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });

    const result = await drainOnce({
      records,
      capacity: 2,
      transmit: async (batch) => {
        transmittedBatches.push(batch);
      },
      backoff,
    });

    expect(result.outcome).toBe('transmitted');
    if (result.outcome === 'transmitted') {
      expect(result.drop).toBeDefined();
      expect(result.drop?.dropped).toEqual([1]); // the live-only record dropped first
    }
    expect(transmittedBatches[0]).toHaveLength(2);
  });

  it('advances the injected backoff schedule and reports a retry outcome when transmit rejects', async () => {
    const records: readonly DrainRecord[] = [{ classification: 'durable' }];
    const backoff = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });
    const boom = new Error('plane unreachable');

    const result = await drainOnce({
      records,
      capacity: 10,
      transmit: async () => {
        throw boom;
      },
      backoff,
    });

    expect(result.outcome).toBe('retry');
    if (result.outcome === 'retry') {
      expect(result.error).toBe(boom);
      expect(result.delayMs).toBe(500); // attempt 0: 0.5 * 1000
      expect(result.drop).toBeUndefined();
    }
    expect(backoff.attemptCount).toBe(1);
  });

  it('rejects a negative or non-integer capacity', async () => {
    const records: readonly DrainRecord[] = [{ classification: 'durable' }];
    const backoff = new BackoffSchedule({
      baseMs: 1000,
      capMs: 30_000,
      jitter: () => 0.5,
      healthyResetMs: 60_000,
    });
    await expect(
      drainOnce({
        records,
        capacity: -1,
        transmit: async () => {},
        backoff,
      }),
    ).rejects.toThrow(/capacity/);
  });
});
