// specs/037-instance-observability — AUDIT-20260719-09 (RED), pairs with the
// instance-accumulator.ts fix.
//
// THE BUG (cross-model govern finding, HIGH; same class as the T049 fix in
// lastactivity-monotonic.test.ts): the LATEST-WINS projected fields
// (`currentSession`, `currentBearing`) and the cumulative `phaseDurations`
// timing update fold in ARRAY / FOLD order, NOT by `installationSequence`. The
// T049 fix already keyed `lastActivityAt`/`firstSeenAt`/`lastHeartbeatAt` on
// `installationSequence` no-regress, but `applySessionEvent` /
// `applyPhaseEnteredEvent` were left folding in order. So an out-of-order or
// re-delivered event (replay, reconnection) can set `currentSession` /
// `currentBearing` from a STALE (lower-`installationSequence`) event, or
// mis-accrue `phaseDurations` (negative / double-counted).
//
// THE CONTRACT this pins (mirrors T049's installationSequence no-regress):
//   - `currentBearing` only advances to a phase.entered whose
//     `installationSequence` is strictly NEWER than the one that set it.
//   - `currentSession` open/close is ordering-correct by `installationSequence`:
//     a stale started can't re-open a closed session; a stale ended can't clear
//     a newer session; the newest session-governing event wins.
//   - `phaseDurations` accrue only on a strictly-newer phase.entered (never a
//     negative / double-counted span from an out-of-order event).
//   - COUNTS (`sessionsStarted`/`sessionsEnded`) stay order-INDEPENDENT (fold
//     once per event; eventId-dedup guarantees effectively-once). `firstSessionAt`
//     stays earliest. These do NOT change.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks, no `any`/`as`/`@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope, EventType, EventClassification } from '../../src/fleet/types.js';
import type { SnapshotPayload } from '../../src/fleet/event.js';
import { buildInstanceRegistry } from '../../src/plane/instance-registry.js';
import type { ClassifiedEvent } from '../../src/plane/instance-registry.js';

/**
 * Mint a classified event with an INDEPENDENT `installationSequence` (the
 * instance-monotonic ordering key) plus a snapshot payload — so a test can
 * deliver events OUT OF `installationSequence` order (array order != sequence
 * order), the exact shape that exercises this bug. Mirrors the independent-key
 * `mkEvent` in lastactivity-monotonic.test.ts (T049), extended with `snapshot`.
 */
function mkEvent(opts: {
  host: string;
  path: string;
  type: EventType;
  classification: EventClassification;
  installationSequence: number;
  wallClock: string;
  snapshot?: SnapshotPayload;
  eventId?: string;
}): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: opts.eventId ?? mintUuidV7(),
    installationId: mintUuidV7(),
    invocationId: mintUuidV7(),
    runId: null,
    installationSequence: opts.installationSequence,
    invocationSequence: 0,
    schemaVersion: 2,
    type: opts.type,
    wallClock: opts.wallClock,
    monotonicOffsetMs: 0,
    classification: opts.classification,
    host: opts.host,
    path: opts.path,
    sessionId: null,
  };
  return {
    envelope,
    classification: opts.classification,
    type: opts.type,
    snapshot: opts.snapshot ?? {},
  };
}

const HOST = 'orion-mbp';
const PATH = '/Users/orion/work/proj-a';
const ITEM = 'INSTANCE-001';

function phaseEntered(installationSequence: number, wallClock: string, phase: string): ClassifiedEvent {
  return mkEvent({
    host: HOST,
    path: PATH,
    type: 'phase.entered',
    classification: 'durable',
    installationSequence,
    wallClock,
    snapshot: { phase, from: null, item: ITEM },
  });
}

function sessionStarted(
  installationSequence: number,
  wallClock: string,
  sessionId: string,
  eventId?: string,
): ClassifiedEvent {
  return mkEvent({
    host: HOST,
    path: PATH,
    type: 'session.started',
    classification: 'durable',
    installationSequence,
    wallClock,
    snapshot: { sessionId, startedAt: wallClock },
    eventId,
  });
}

function sessionEnded(installationSequence: number, wallClock: string, sessionId: string): ClassifiedEvent {
  return mkEvent({
    host: HOST,
    path: PATH,
    type: 'session.ended',
    classification: 'durable',
    installationSequence,
    wallClock,
    snapshot: { sessionId, endedAt: wallClock, reason: 'ended' },
  });
}

describe('instance registry — latest-wins fields honor installationSequence no-regress (AUDIT-20260719-09)', () => {
  it('currentBearing: a stale (lower installationSequence) phase.entered arriving LATER does not overwrite the newer bearing', () => {
    // Newer bearing (seq 5) arrives first; a stale seq-2 event arrives later in
    // the stream. Folding in array order would let the stale 'design' win.
    const events: ClassifiedEvent[] = [
      phaseEntered(5, '2026-07-18T12:00:05.000Z', 'spec'),
      phaseEntered(2, '2026-07-18T12:00:02.000Z', 'design'),
    ];

    const [instance] = buildInstanceRegistry(events).instances();

    expect(instance.currentBearing).toEqual({ phase: 'spec', item: ITEM });
  });

  it('currentSession: a stale (lower installationSequence) session.started arriving LATER does not overwrite the newer open session', () => {
    const sessB = mintUuidV7();
    const sessA = mintUuidV7();
    const events: ClassifiedEvent[] = [
      sessionStarted(5, '2026-07-18T12:00:05.000Z', sessB), // newest — governs
      sessionStarted(2, '2026-07-18T12:00:02.000Z', sessA), // stale, arrives later
    ];

    const [instance] = buildInstanceRegistry(events).instances();

    // Newest session by installationSequence wins; the stale started can't clobber it.
    expect(instance.currentSession?.sessionId).toBe(sessB);
    // Counts stay order-INDEPENDENT — both starteds are counted regardless.
    expect(instance.sessionsStarted).toBe(2);
    expect(instance.sessionsEnded).toBe(0);
  });

  it('currentSession: a stale (lower installationSequence) session.ended can NOT clear a newer open session', () => {
    const sessB = mintUuidV7();
    const events: ClassifiedEvent[] = [
      sessionStarted(5, '2026-07-18T12:00:05.000Z', sessB), // opens B at seq 5
      sessionEnded(2, '2026-07-18T12:00:02.000Z', sessB), // stale ended (seq 2) arrives later
    ];

    const [instance] = buildInstanceRegistry(events).instances();

    // The stale ended (seq 2 < 5) must not clear the newer open session.
    expect(instance.currentSession?.sessionId).toBe(sessB);
    expect(instance.sessionsEnded).toBe(1); // still counted
  });

  it('currentSession: a stale (lower installationSequence) session.started can NOT re-open a session closed by a newer ended', () => {
    const sessA = mintUuidV7();
    const events: ClassifiedEvent[] = [
      sessionStarted(1, '2026-07-18T12:00:01.000Z', sessA), // open A at seq 1
      sessionEnded(5, '2026-07-18T12:00:05.000Z', sessA), // close A at seq 5 (newest, governs)
      sessionStarted(3, '2026-07-18T12:00:03.000Z', sessA), // stale re-delivery/out-of-order
    ];

    const [instance] = buildInstanceRegistry(events).instances();

    // A was closed as of seq 5; the seq-3 started arriving later must not re-open it.
    expect(instance.currentSession).toBeNull();
    expect(instance.sessionsStarted).toBe(2);
    expect(instance.sessionsEnded).toBe(1);
  });

  it('phaseDurations: an out-of-order (lower installationSequence) phase.entered does NOT mis-accrue (no negative / double-counted span)', () => {
    // In installationSequence order: design(10) -> spec(20) accrues design = 5_000ms.
    // A stale seq-5 event, with a wallClock BEFORE the current phase-entry, arrives
    // last — folding in array order would accrue spec += (T05 - T20) = -15_000ms and
    // move the bearing to the stale phase.
    const events: ClassifiedEvent[] = [
      phaseEntered(10, '2026-07-18T12:00:10.000Z', 'design'),
      phaseEntered(20, '2026-07-18T12:00:15.000Z', 'spec'), // design leaves -> +5_000
      phaseEntered(5, '2026-07-18T12:00:05.000Z', 'governing'), // stale, arrives later
    ];

    const [instance] = buildInstanceRegistry(events).instances();

    expect(instance.phaseDurations.design).toBe(5_000);
    // spec was never LEFT by a newer event, so it must be absent — and must never
    // be a negative span accrued from the stale event.
    expect('spec' in instance.phaseDurations).toBe(false);
    expect('governing' in instance.phaseDurations).toBe(false);
    for (const ms of Object.values(instance.phaseDurations)) {
      expect(ms).toBeGreaterThanOrEqual(0);
    }
    // Bearing stays on the newest phase (spec), not the stale 'governing'.
    expect(instance.currentBearing).toEqual({ phase: 'spec', item: ITEM });
  });

  it('re-delivery (same eventId) folds effectively-once and does not corrupt latest-wins fields', () => {
    const sessA = mintUuidV7();
    const dupId = mintUuidV7();
    const events: ClassifiedEvent[] = [
      sessionStarted(1, '2026-07-18T12:00:01.000Z', sessA, dupId),
      sessionStarted(1, '2026-07-18T12:00:01.000Z', sessA, dupId), // exact re-delivery
    ];

    const [instance] = buildInstanceRegistry(events).instances();

    expect(instance.sessionsStarted).toBe(1);
    expect(instance.currentSession?.sessionId).toBe(sessA);
  });
});
