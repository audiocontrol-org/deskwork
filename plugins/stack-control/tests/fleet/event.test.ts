// specs/036-fleet-control-plane — T014 (RED), pairs with T015 impl.
//
// data-model.md § Event (line ~39-69) pins the three-part separation
// (FR-044): envelope (identity + sequence + schema + timestamps + type),
// a BOUNDED snapshot of current state, and append-only domain events from
// which history is reconstructed. FR-045 (spec.md line ~246): histories
// MUST NOT be resent — a per-event `history` array (e.g.
// `execution.history[]` / `governance.history[]`) is quadratic in run
// length and is PROHIBITED. This test pins:
//   1. `constructEnvelope` builds a well-formed EventEnvelope using an
//      injected Clock (never Date/performance directly) and a same-process
//      monotonic origin, per PT-013 ("computed at source").
//   2. `validateEnvelope` rejects missing/wrong-typed envelope fields.
//   3. `validateSnapshot` / `validateTelemetryEvent` enforce the BOUNDED
//      snapshot contract (PT-014) and REJECT a per-event history array
//      (FR-045).
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Real Clock fixture, no vitest
// fake timers (research.md § Testability strategy).

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import {
  constructEnvelope,
  validateEnvelope,
  validateSnapshot,
  validateTelemetryEvent,
  MAX_EVENT_SNAPSHOT_BYTES,
  type EnvelopeInput,
} from '../../src/fleet/event.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';

/** Deterministic fake Clock — same shape as clock.test.ts's fixture. */
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

function baseInput(): EnvelopeInput {
  return {
    installationId: mintInstallationId(),
    invocationId: mintUuidV7(),
    runId: null,
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 1,
    type: 'run.started',
    classification: 'durable',
    sessionId: null,
  };
}

/** A real, existing installation-root dir for tests that don't assert on the
 * derived host/path — `constructEnvelope` calls `realpathSync.native` on it. */
const TEST_INSTALLATION_ROOT = process.cwd();

describe('constructEnvelope (T014/T015, data-model § Event → Envelope)', () => {
  it('builds a well-formed EventEnvelope using the injected Clock', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 1000);
    const input = baseInput();
    const envelope = constructEnvelope(clock, 1000, input, TEST_INSTALLATION_ROOT);

    expect(envelope.installationId).toBe(input.installationId);
    expect(typeof envelope.eventId).toBe('string');
    expect(envelope.eventId.length).toBeGreaterThan(0);
    expect(envelope.invocationId).toBe(input.invocationId);
    expect(envelope.wallClock).toBe('2026-07-17T00:00:00.000Z');
    expect(envelope.monotonicOffsetMs).toBe(0);
    expect(envelope.classification).toBe('durable');
  });

  it('mints a fresh eventId on every construction (never supplied by the caller)', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
    const input = baseInput();
    const a = constructEnvelope(clock, 0, input, TEST_INSTALLATION_ROOT);
    const b = constructEnvelope(clock, 0, input, TEST_INSTALLATION_ROOT);
    expect(a.eventId).not.toBe(b.eventId);
  });

  it('computes monotonicOffsetMs AT SOURCE as a same-process delta, never a raw reading', () => {
    // PT-013: "the plane cannot difference hrtime even in principle" across
    // processes — the delta must be computed here, from two readings of the
    // SAME injected Clock, not carried in from outside.
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 5000);
    const origin = 4000; // invocation started 1000ms of monotonic time ago
    const envelope = constructEnvelope(clock, origin, baseInput(), TEST_INSTALLATION_ROOT);
    expect(envelope.monotonicOffsetMs).toBe(1000);
  });

  it('never calls Date/performance directly — wallClock and offset come only from the injected Clock', () => {
    // A clock frozen far in the past proves the envelope did not fall back
    // to real wall/monotonic time.
    const clock = new FakeClock('2000-01-01T00:00:00.000Z', 42);
    const envelope = constructEnvelope(clock, 42, baseInput(), TEST_INSTALLATION_ROOT);
    expect(envelope.wallClock).toBe('2000-01-01T00:00:00.000Z');
    expect(envelope.monotonicOffsetMs).toBe(0);
  });

  it('passes runId through as null for non-run invocations', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
    const envelope = constructEnvelope(clock, 0, { ...baseInput(), runId: null }, TEST_INSTALLATION_ROOT);
    expect(envelope.runId).toBeNull();
  });

  it('passes runId through as a UUIDv7 for run-scoped invocations', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
    const runId = mintUuidV7();
    const envelope = constructEnvelope(clock, 0, { ...baseInput(), runId }, TEST_INSTALLATION_ROOT);
    expect(envelope.runId).toBe(runId);
  });
});

describe('validateEnvelope (T014/T015 — reject missing/wrong-typed fields)', () => {
  function validEnvelopeLiteral(): Record<string, unknown> {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
    return { ...constructEnvelope(clock, 0, baseInput(), TEST_INSTALLATION_ROOT) };
  }

  it('accepts a well-formed envelope and returns it typed', () => {
    const literal = validEnvelopeLiteral();
    const envelope = validateEnvelope(literal);
    expect(envelope.eventId).toBe(literal.eventId);
    expect(envelope.classification).toBe('durable');
  });

  it('rejects a non-object value', () => {
    expect(() => validateEnvelope(null)).toThrow();
    expect(() => validateEnvelope('not-an-envelope')).toThrow();
    expect(() => validateEnvelope(42)).toThrow();
    expect(() => validateEnvelope(undefined)).toThrow();
  });

  it('rejects a missing eventId', () => {
    const literal = validEnvelopeLiteral();
    delete literal.eventId;
    expect(() => validateEnvelope(literal)).toThrow(/eventId/);
  });

  it('rejects a wrong-typed installationSequence (must be an integer, not a string)', () => {
    const literal = validEnvelopeLiteral();
    literal.installationSequence = '1';
    expect(() => validateEnvelope(literal)).toThrow(/installationSequence/);
  });

  it('rejects a non-integer invocationSequence', () => {
    const literal = validEnvelopeLiteral();
    literal.invocationSequence = 1.5;
    expect(() => validateEnvelope(literal)).toThrow(/invocationSequence/);
  });

  it('rejects an invalid classification value', () => {
    const literal = validEnvelopeLiteral();
    literal.classification = 'sometimes';
    expect(() => validateEnvelope(literal)).toThrow(/classification/);
  });

  it('rejects a runId that is neither a string nor null', () => {
    const literal = validEnvelopeLiteral();
    literal.runId = 12345;
    expect(() => validateEnvelope(literal)).toThrow(/runId/);
  });

  it('accepts runId === null', () => {
    const literal = validEnvelopeLiteral();
    literal.runId = null;
    expect(() => validateEnvelope(literal)).not.toThrow();
  });

  it('rejects a malformed wallClock string', () => {
    const literal = validEnvelopeLiteral();
    literal.wallClock = 'not-a-timestamp';
    expect(() => validateEnvelope(literal)).toThrow(/wallClock/);
  });

  it('rejects a non-finite monotonicOffsetMs', () => {
    const literal = validEnvelopeLiteral();
    literal.monotonicOffsetMs = Number.POSITIVE_INFINITY;
    expect(() => validateEnvelope(literal)).toThrow(/monotonicOffsetMs/);
  });
});

describe('validateSnapshot / validateTelemetryEvent — bounded snapshot contract (PT-014)', () => {
  it('accepts a small, well-formed snapshot', () => {
    const snapshot = validateSnapshot({ status: 'running', progress: 0.5 });
    expect(snapshot.status).toBe('running');
  });

  it('rejects a snapshot exceeding MAX_EVENT_SNAPSHOT_BYTES', () => {
    // Build a payload whose serialized size deliberately exceeds the bound.
    const oversized = { blob: 'x'.repeat(MAX_EVENT_SNAPSHOT_BYTES + 1) };
    expect(() => validateSnapshot(oversized)).toThrow(/bound|size|byte/i);
  });

  it('accepts a snapshot right at the boundary and rejects one byte over', () => {
    // Binary-search-free sanity check: a snapshot just under the bound
    // passes; padding it past the bound fails. Exercises the boundary,
    // not just "big enough to obviously fail."
    const underField = 'x'.repeat(Math.max(0, MAX_EVENT_SNAPSHOT_BYTES - 64));
    expect(() => validateSnapshot({ blob: underField })).not.toThrow();

    const overField = 'x'.repeat(MAX_EVENT_SNAPSHOT_BYTES + 64);
    expect(() => validateSnapshot({ blob: overField })).toThrow();
  });

  it('rejects a snapshot carrying a top-level per-event history array (FR-045)', () => {
    expect(() =>
      validateSnapshot({ status: 'running', history: [{ at: 1 }, { at: 2 }] }),
    ).toThrow(/history/i);
  });

  it('rejects execution.history[] specifically (FR-045\'s named example)', () => {
    expect(() =>
      validateSnapshot({
        execution: { status: 'running', history: [{ step: 'a' }, { step: 'b' }] },
      }),
    ).toThrow(/history/i);
  });

  it('rejects governance.history[] specifically (FR-045\'s named example)', () => {
    expect(() =>
      validateSnapshot({
        governance: { verdict: 'pending', history: [{ round: 1 }] },
      }),
    ).toThrow(/history/i);
  });

  it('rejects a nested history array at arbitrary depth', () => {
    expect(() =>
      validateSnapshot({
        a: { b: { c: { history: [1, 2, 3] } } },
      }),
    ).toThrow(/history/i);
  });

  it('does NOT reject a "history" key that is not an array (e.g. a scalar or an object)', () => {
    // The prohibition (FR-045) targets the *quadratic array* shape
    // specifically ("execution.history[]"), not the bare word "history".
    expect(() => validateSnapshot({ historyEnabled: true })).not.toThrow();
    expect(() => validateSnapshot({ history: 'none' })).not.toThrow();
  });

  it('validateTelemetryEvent validates both the envelope and the snapshot together', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
    const envelope = constructEnvelope(clock, 0, baseInput(), TEST_INSTALLATION_ROOT);
    const event = validateTelemetryEvent({
      envelope: { ...envelope },
      snapshot: { status: 'running' },
    });
    expect(event.envelope.eventId).toBe(envelope.eventId);
    expect(event.snapshot.status).toBe('running');
  });

  it('validateTelemetryEvent rejects when the snapshot carries a history array, even if the envelope is valid', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
    const envelope = constructEnvelope(clock, 0, baseInput(), TEST_INSTALLATION_ROOT);
    expect(() =>
      validateTelemetryEvent({
        envelope: { ...envelope },
        snapshot: { execution: { history: [{ step: 1 }] } },
      }),
    ).toThrow(/history/i);
  });

  it('validateTelemetryEvent rejects when the envelope is invalid, even if the snapshot is fine', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
    const envelope = constructEnvelope(clock, 0, baseInput(), TEST_INSTALLATION_ROOT);
    const badEnvelope: Record<string, unknown> = { ...envelope };
    delete badEnvelope.eventId;
    expect(() =>
      validateTelemetryEvent({
        envelope: badEnvelope,
        snapshot: { status: 'running' },
      }),
    ).toThrow(/eventId/);
  });
});
