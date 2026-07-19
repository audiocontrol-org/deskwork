// specs/037-instance-observability — T027 (RED), pairs with T028's impl.
//
// THE SESSION-FOLD CONTRACT (data-model.md § InstanceState, § Event types,
// FR-009/FR-009a; parallels T016's registry-instances.test.ts for the
// invocation/heartbeat fold):
//
//   buildInstanceRegistry(events) must fold `session.started` / `session.ended`
//   events into the InstanceState session fields:
//     - currentSession   `{ sessionId, startedAt }` for an OPEN session
//                        (started, not yet ended), else `null`
//     - sessionsStarted  count of `session.started`
//     - sessionsEnded    count of `session.ended`
//     - firstSessionAt   earliest `session.started` wallClock, across ALL
//                        sessions (open or since-closed)
//
//   An UNCLOSED session shows as "open since X" — `currentSession` stays
//   populated with its `startedAt` for as long as no matching `session.ended`
//   has folded (FR-009).
//
//   Attribution: an `invocation.completed` carrying a `sessionId` (envelope)
//   while a session is open is attributable to that open session — the
//   invocation's envelope `sessionId` matches `currentSession.sessionId`.
//
//   `session.*` events carry their payload on the event SNAPSHOT
//   (`{sessionId,startedAt}` / `{sessionId,endedAt,reason}` — data-model.md
//   § Event types), NOT on the envelope. The accumulator's fold reads
//   envelope identity (host/path) for keying plus the snapshot payload for
//   the session fields themselves.
//
// `src/plane/instance-accumulator.ts`'s local `ClassifiedEvent` currently has
// NO `snapshot` field (US1 scope note, instance-accumulator.ts:42-46) and
// `applyInstanceEvent` never inspects `session.started`/`session.ended` at
// all — `currentSession` stays `null`, `sessionsStarted`/`sessionsEnded` stay
// `0`, `firstSessionAt` stays `null` for every event in this file. This test
// MUST fail until T028 (a) adds `snapshot` to the accumulator's event type
// and (b) folds it into the session fields.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks, no `any`/`as`/`@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope, EventType, EventClassification } from '../../src/fleet/types.js';
import type { SnapshotPayload } from '../../src/fleet/event.js';
import type { InstanceRegistry } from '../../src/plane/instance-registry.js';
import { buildInstanceRegistry } from '../../src/plane/instance-registry.js';

/**
 * A classified event carrying its bounded snapshot payload — structurally
 * identical to `src/plane/registry.ts`'s `ClassifiedEvent` (which already
 * carries `snapshot`, specs/037 D5) and to what T028 must extend
 * `instance-accumulator.ts`'s local `ClassifiedEvent` to carry. Passing an
 * array of THIS shape to `buildInstanceRegistry` (whose parameter type is
 * currently the snapshot-less accumulator `ClassifiedEvent`) type-checks by
 * structural subtyping — this file's events are a strict superset.
 */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: EventClassification;
  readonly type: EventType;
  readonly snapshot: SnapshotPayload;
}

/**
 * Helper to mint a classified event carrying host/path/sessionId identity
 * fields on the envelope PLUS a session-shaped snapshot payload, with
 * predictable, controllable wallClock + invocationSequence for ordering
 * assertions. Mirrors registry-instances.test.ts's `mkEvent`, extended with
 * `snapshot` (defaults to `{}` for non-session events that don't need one).
 */
function mkEvent(opts: {
  host: string;
  path: string;
  sessionId: string | null;
  type: EventType;
  classification: EventClassification;
  invocationSequence: number;
  wallClock: string;
  snapshot?: SnapshotPayload;
  eventId?: string;
}): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: opts.eventId ?? mintUuidV7(),
    installationId: mintUuidV7(),
    invocationId: mintUuidV7(),
    runId: null,
    installationSequence: opts.invocationSequence,
    invocationSequence: opts.invocationSequence,
    schemaVersion: 2,
    type: opts.type,
    wallClock: opts.wallClock,
    monotonicOffsetMs: 0,
    classification: opts.classification,
    host: opts.host,
    path: opts.path,
    sessionId: opts.sessionId,
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

describe('instance registry — folds session.* events into InstanceState session fields (T027, data-model.md § InstanceState)', () => {
  it('folds an unmatched session.started into an OPEN currentSession (FR-009: "open since X") and bumps sessionsStarted', () => {
    const sessionId = mintUuidV7();
    const startedAt = '2026-07-18T12:00:00.000Z';

    const events: ClassifiedEvent[] = [
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId,
        type: 'session.started',
        classification: 'durable',
        invocationSequence: 1,
        wallClock: startedAt,
        snapshot: { sessionId, startedAt },
      }),
    ];

    const registry: InstanceRegistry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.currentSession).toEqual({ sessionId, startedAt });
    expect(instance.sessionsStarted).toBe(1);
    expect(instance.sessionsEnded).toBe(0);
    expect(instance.firstSessionAt).toBe(startedAt);
  });

  it('folds a matching session.ended: currentSession clears to null, sessionsEnded increments', () => {
    const sessionId = mintUuidV7();
    const startedAt = '2026-07-18T12:00:00.000Z';
    const endedAt = '2026-07-18T12:10:00.000Z';

    const events: ClassifiedEvent[] = [
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId,
        type: 'session.started',
        classification: 'durable',
        invocationSequence: 1,
        wallClock: startedAt,
        snapshot: { sessionId, startedAt },
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId,
        type: 'session.ended',
        classification: 'durable',
        invocationSequence: 2,
        wallClock: endedAt,
        snapshot: { sessionId, endedAt, reason: 'ended' },
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.currentSession).toBeNull();
    expect(instance.sessionsStarted).toBe(1);
    expect(instance.sessionsEnded).toBe(1);
  });

  it('firstSessionAt is the EARLIEST session.started wallClock, even when that session has since closed and a later one is open', () => {
    const sessionA = mintUuidV7();
    const sessionB = mintUuidV7();
    const aStartedAt = '2026-07-18T09:00:00.000Z';
    const aEndedAt = '2026-07-18T10:00:00.000Z';
    const bStartedAt = '2026-07-18T11:00:00.000Z';

    const events: ClassifiedEvent[] = [
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId: sessionA,
        type: 'session.started',
        classification: 'durable',
        invocationSequence: 1,
        wallClock: aStartedAt,
        snapshot: { sessionId: sessionA, startedAt: aStartedAt },
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId: sessionA,
        type: 'session.ended',
        classification: 'durable',
        invocationSequence: 2,
        wallClock: aEndedAt,
        snapshot: { sessionId: sessionA, endedAt: aEndedAt, reason: 'ended' },
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId: sessionB,
        type: 'session.started',
        classification: 'durable',
        invocationSequence: 3,
        wallClock: bStartedAt,
        snapshot: { sessionId: sessionB, startedAt: bStartedAt },
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.firstSessionAt).toBe(aStartedAt);
    expect(instance.sessionsStarted).toBe(2);
    expect(instance.sessionsEnded).toBe(1);
    expect(instance.currentSession).toEqual({ sessionId: sessionB, startedAt: bStartedAt });
  });

  it('attributes an invocation.completed carrying a sessionId to the currently-open session', () => {
    const sessionId = mintUuidV7();
    const startedAt = '2026-07-18T12:00:00.000Z';
    const invocationWallClock = '2026-07-18T12:01:00.000Z';

    const events: ClassifiedEvent[] = [
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId,
        type: 'session.started',
        classification: 'durable',
        invocationSequence: 1,
        wallClock: startedAt,
        snapshot: { sessionId, startedAt },
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        sessionId,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 2,
        wallClock: invocationWallClock,
      }),
    ];

    const attributedSessionId = events[1].envelope.sessionId;

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.currentSession?.sessionId).toBe(attributedSessionId);
  });
});
