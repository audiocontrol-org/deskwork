// specs/036-fleet-control-plane — T019 (RED), pairs with T020 impl
// (src/fleet/sequence.ts). This test pins the SEQUENCING MODEL and GAP
// CLASSIFICATION that event.ts deliberately deferred here (event.ts header:
// "sequencing itself — installationSequence vs invocationSequence, gap
// classification — is src/fleet/sequence.ts's job").
//
// Two sequences with DISTINCT roles:
//   - installationSequence — the sidecar's outbound EMISSION order across ALL
//     invocations. Transport diagnostics / gap detection / spool restoration
//     ONLY. FR-041: it MUST NOT be used for domain or causal ordering, because
//     it interleaves concurrent invocations and would imply relationships
//     between concurrent runs that do not exist.
//   - invocationSequence — per-invocation order. FR-040: the ONLY sequence
//     with domain meaning.
//
// Gap classification (R-04 + FR-042, the load-bearing part): operates on the
// sidecar's durable HIGH-WATER MARK (FR-039, passed in — this module does NOT
// own the durable store, that is machine-state T027/T028) plus event age. It
// MUST NOT infer absence from the durable object store, because event
// classification (FR-015) makes the stored object set SPARSE BY DESIGN — so
// absence-of-object is NOT absence-of-event. Three classifications of a
// missing sequence number:
//   - below the high-water mark AND older than the settle bound → lost
//   - below the high-water mark AND younger than the settle bound → in-flight
//   - above the high-water mark → never-sent
//
// The settle bound (PT-014 "pinned at task time"; research.md open item
// "T_SETTLE is a formula, not a measured value — it derives from the backoff
// schedule fixed in PT-014. Pin the derivation, not a magic number.") is a
// DERIVED constant, not a magic number — asserted below by re-deriving it
// from the backoff constants, never by hardcoding 90000.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Injected Clock for event age; NO
// vitest fake timers (research.md § Testability strategy).

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import {
  InstallationSequence,
  InvocationSequence,
  domainOrderKey,
  compareInvocationSequences,
  sortByInvocationSequence,
  highWaterMark,
  classifyGap,
  classifyGapAt,
  GAP_SETTLE_BOUND_MS,
  RECONNECT_BACKOFF_CAP_MS,
  BACKOFF_RESET_HEALTHY_MS,
  type GapClassification,
  type GapInput,
} from '../../src/fleet/sequence.js';

/** Deterministic fake Clock — same shape as clock.test.ts / event.test.ts. */
class FakeClock implements Clock {
  constructor(
    private wall: string,
    private mono: number,
  ) {}

  nowIso(): string {
    return this.wall;
  }

  monotonicNowMs(): number {
    return this.mono;
  }

  advance(ms: number): void {
    this.mono += ms;
    this.wall = new Date(new Date(this.wall).getTime() + ms).toISOString();
  }
}

describe('two sequences, distinct roles (T019/T020, FR-040/FR-041)', () => {
  it('models installationSequence and invocationSequence as distinct nominal types', () => {
    const installation = new InstallationSequence(7);
    const invocation = new InvocationSequence(7);
    // Same numeric value, but distinguishable kinds — they are NOT
    // interchangeable, which is what makes FR-041 enforceable.
    expect(installation.value).toBe(7);
    expect(invocation.value).toBe(7);
    expect(installation.kind).toBe('installation');
    expect(invocation.kind).toBe('invocation');
  });

  it('rejects a non-integer / negative sequence value (fail loud, no coercion)', () => {
    expect(() => new InstallationSequence(1.5)).toThrow(/integer/i);
    expect(() => new InstallationSequence(-1)).toThrow(/negative|integer/i);
    expect(() => new InvocationSequence(Number.NaN)).toThrow(/integer|number/i);
    expect(() => new InvocationSequence(Number.POSITIVE_INFINITY)).toThrow(/integer|finite|number/i);
  });

  it('domainOrderKey RETURNS the value for an invocationSequence (FR-040 — the domain one)', () => {
    expect(domainOrderKey(new InvocationSequence(42))).toBe(42);
  });

  it('domainOrderKey REJECTS an installationSequence (FR-041 — never domain/causal ordering)', () => {
    // The load-bearing FR-041 assertion: installationSequence must not be
    // usable as a domain/causal ordering key. Passing it to the domain-order
    // entry point is a hard, runtime-observable refusal.
    expect(() => domainOrderKey(new InstallationSequence(42))).toThrow(
      /FR-041|domain|causal|installation/i,
    );
  });

  it('SOURCE GUARD: domainOrderKey actually inspects the sequence kind (guard is not vacuous)', () => {
    // If a refactor stopped distinguishing the two kinds, this catches it:
    // the refusal must key off the sequence's own kind discriminant.
    expect(domainOrderKey.toString()).toContain('installation');
  });

  it('compareInvocationSequences orders strictly by invocation value', () => {
    const a = new InvocationSequence(1);
    const b = new InvocationSequence(2);
    expect(compareInvocationSequences(a, b)).toBeLessThan(0);
    expect(compareInvocationSequences(b, a)).toBeGreaterThan(0);
    expect(compareInvocationSequences(a, a)).toBe(0);
  });

  it('sortByInvocationSequence returns invocation order ascending without mutating input', () => {
    const three = new InvocationSequence(3);
    const one = new InvocationSequence(1);
    const two = new InvocationSequence(2);
    const shuffled = [three, one, two];
    const snapshot = [...shuffled];
    const sorted = sortByInvocationSequence(shuffled);
    expect(sorted.map((s) => s.value)).toEqual([1, 2, 3]);
    expect(shuffled).toEqual(snapshot); // input untouched
  });
});

describe('high-water mark (T019/T020, FR-039)', () => {
  it('is the maximum emitted installationSequence, regardless of arrival order', () => {
    expect(highWaterMark([3, 1, 7, 2, 5])).toBe(7);
    expect(highWaterMark([0])).toBe(0);
  });

  it('fails loud on an empty emission set (no silent zero default)', () => {
    // A high-water mark is meaningless with nothing emitted; do not invent a
    // fallback (fallbacks are bug factories). The durable store's initial
    // value is machine-state's concern (T027/T028), not a silent default here.
    expect(() => highWaterMark([])).toThrow();
  });

  it('rejects a non-integer emitted value (fail loud)', () => {
    expect(() => highWaterMark([1, 2.5, 3])).toThrow(/integer/i);
  });
});

describe('gap classification: lost / in-flight / never-sent (T019/T020, R-04 + FR-042)', () => {
  it('classifies a missing sequence ABOVE the high-water mark as never-sent', () => {
    const result: GapClassification = classifyGap({
      sequence: 105,
      highWaterMark: 100,
      ageMs: 5_000,
      settleBoundMs: GAP_SETTLE_BOUND_MS,
    });
    expect(result).toBe('never-sent');
  });

  it('never-sent is age-independent — even a very old above-mark gap is never-sent, not lost', () => {
    expect(
      classifyGap({
        sequence: 105,
        highWaterMark: 100,
        ageMs: 10 * 60 * 1000,
        settleBoundMs: GAP_SETTLE_BOUND_MS,
      }),
    ).toBe('never-sent');
  });

  it('classifies a below-mark gap OLDER than the settle bound as lost', () => {
    expect(
      classifyGap({
        sequence: 42,
        highWaterMark: 100,
        ageMs: GAP_SETTLE_BOUND_MS + 1,
        settleBoundMs: GAP_SETTLE_BOUND_MS,
      }),
    ).toBe('lost');
  });

  it('classifies a below-mark gap YOUNGER than the settle bound as in-flight/retrying', () => {
    expect(
      classifyGap({
        sequence: 42,
        highWaterMark: 100,
        ageMs: 5_000,
        settleBoundMs: GAP_SETTLE_BOUND_MS,
      }),
    ).toBe('in-flight');
  });

  it('at exactly the settle bound the gap is still in-flight ("older than" is strict)', () => {
    expect(
      classifyGap({
        sequence: 42,
        highWaterMark: 100,
        ageMs: GAP_SETTLE_BOUND_MS,
        settleBoundMs: GAP_SETTLE_BOUND_MS,
      }),
    ).toBe('in-flight');
  });

  it('fails loud on invalid classification inputs (no coercion, no fallback)', () => {
    expect(() =>
      classifyGap({ sequence: 1.5, highWaterMark: 100, ageMs: 0, settleBoundMs: 1 }),
    ).toThrow(/integer/i);
    expect(() =>
      classifyGap({ sequence: 1, highWaterMark: 100, ageMs: -1, settleBoundMs: 1 }),
    ).toThrow(/age|negative/i);
    expect(() =>
      classifyGap({ sequence: 1, highWaterMark: 100, ageMs: 0, settleBoundMs: 0 }),
    ).toThrow(/settle|positive/i);
  });

  it('STRUCTURAL R-04 GUARD: classifyGap takes exactly ONE argument — its pure input object', () => {
    // R-04's invariant is enforced BY THE SIGNATURE: classification consumes
    // only (sequence, highWaterMark, ageMs, settleBound). There is nowhere to
    // pass a store. Arity 1 means the sole input is the pure GapInput object.
    expect(classifyGap.length).toBe(1);
  });

  it('STRUCTURAL R-04 GUARD: classifyGap never reads an object/store in its own source', () => {
    // The durable object set is SPARSE BY DESIGN (FR-015) — absence-of-object
    // is not absence-of-event. Classification must NEVER consult the store.
    // This source guard fails immediately if a future edit wires a store read
    // (list/get/fetch of stored objects) into classification.
    const source = classifyGap.toString();
    for (const forbidden of ['objectStore', 'listObjects', 'getObject', 'fetch', 'ObjectStore']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('the GapInput shape carries no store/object field (absence is structural, not runtime)', () => {
    // Building a complete input from ONLY the four permitted fields must
    // type-check and classify — proof there is no required store dependency.
    const input: GapInput = {
      sequence: 42,
      highWaterMark: 100,
      ageMs: 5_000,
      settleBoundMs: GAP_SETTLE_BOUND_MS,
    };
    expect(Object.keys(input).sort()).toEqual(
      ['ageMs', 'highWaterMark', 'sequence', 'settleBoundMs'].sort(),
    );
    expect(classifyGap(input)).toBe('in-flight');
  });
});

describe('classifyGapAt derives event age from the injected Clock (PT-013, no Date/performance)', () => {
  it('computes age as a same-process monotonic delta and classifies lost past the settle bound', () => {
    const firstMissingMonotonicMs = 1_000;
    // now is 99_000ms after the sequence was first observed missing → older
    // than the 90s settle bound → lost.
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', firstMissingMonotonicMs + 99_000);
    const result = classifyGapAt(clock, {
      sequence: 42,
      highWaterMark: 100,
      firstMissingMonotonicMs,
    });
    expect(result).toBe('lost');
  });

  it('classifies in-flight when the clock shows the gap is still younger than the settle bound', () => {
    const firstMissingMonotonicMs = 1_000;
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', firstMissingMonotonicMs + 4_000);
    expect(
      classifyGapAt(clock, {
        sequence: 42,
        highWaterMark: 100,
        firstMissingMonotonicMs,
      }),
    ).toBe('in-flight');
  });

  it('classifies never-sent above the mark irrespective of the clock', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 10_000_000);
    expect(
      classifyGapAt(clock, {
        sequence: 105,
        highWaterMark: 100,
        firstMissingMonotonicMs: 0,
      }),
    ).toBe('never-sent');
  });

  it('SOURCE GUARD: classifyGapAt reads only the injected clock, never Date/performance directly', () => {
    const source = classifyGapAt.toString();
    expect(source).not.toContain('Date');
    expect(source).not.toContain('performance');
    expect(source).toContain('monotonicNowMs');
  });
});

describe('settle bound is a DERIVED constant, not a magic number (PT-014, research T_SETTLE open item)', () => {
  it('derives GAP_SETTLE_BOUND_MS from the PT-014 backoff schedule, not a hardcoded value', () => {
    // Pin the DERIVATION (research.md: "T_SETTLE is a formula … Pin the
    // derivation, not a magic number"): the settle bound is the reconnect
    // backoff cap plus the healthy-reset window — the window during which a
    // below-mark event could still legitimately be in-flight/retrying.
    expect(GAP_SETTLE_BOUND_MS).toBe(RECONNECT_BACKOFF_CAP_MS + BACKOFF_RESET_HEALTHY_MS);
  });

  it('exposes the PT-014 backoff constants it derives from', () => {
    expect(RECONNECT_BACKOFF_CAP_MS).toBe(30_000);
    expect(BACKOFF_RESET_HEALTHY_MS).toBe(60_000);
  });
});
