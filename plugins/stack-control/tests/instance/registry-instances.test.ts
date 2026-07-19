// specs/037-instance-observability — T016 (RED), pairs with T018's impl.
//
// THE INSTANCE REGISTRY CONTRACT (data-model.md § InstanceState,
// § InstanceAccumulator; parallels src/plane/registry.ts's buildRegistry /
// RunAccumulator / toEntry trio, T045-T050 of 036):
//
//   buildInstanceRegistry(events) folds a stream of ClassifiedEvents into
//   EXACTLY ONE InstanceState per instance identity (`host:path`). Unlike
//   036's run registry (keyed by runId, discarding invocation.completed for
//   short verbs), the instance registry is keyed by host:path and RETAINS
//   invocation.completed (FR: the fleet "instances" view means "machines
//   running stack-control", not "commandable runs") plus folds
//   session.heartbeat for liveness.
//
//   Per-instance state carries (FR-016, this task's slice):
//     - id            `${host}:${path}`
//     - lastActivityAt  wallClock of the newest event of any kind
//     - lastActivity    a short label of that event (its `type`)
//     - connection      'attached' | 'disconnected'
//     - liveness        'live' | 'stale' | 'gone' (deriveLiveness against
//                        the last-signal age, src/fleet/liveness-constants.js)
//
//   DELIVERY SEMANTICS (mirrors registry.ts, data-model.md § InstanceAccumulator):
//   effectively-once (a re-delivered event, same `eventId`, applies at most
//   once) and no-regress (an older event never walks `lastActivityAt`/
//   `lastActivity` backward). The instance registry orders by
//   `installationSequence` — the instance-monotonic, per-installation outbound
//   counter (monotonic across invocations AND sidecar restarts) — NOT
//   `invocationSequence`, which is per-invocation (resets to 0 for session/phase
//   events, restarts each invocation). Keying no-regress on `invocationSequence`
//   was the WRONG contract: it froze `lastActivityAt` at the first
//   high-`invocationSequence` event (dogfood finding).
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks, no `any`/`as`/`@ts-ignore`.
//
// `src/plane/instance-registry.ts` is currently an empty `export {};` stub
// (T016 predates T018's implementation) — this test MUST fail until T018
// lands `buildInstanceRegistry`.

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope, EventType, EventClassification } from '../../src/fleet/types.js';
// The instance registry module: does not exist yet (T018 impl target).
// Importing a not-yet-exported member from the current `export {};` stub is
// itself what makes this RED — TypeScript has no `buildInstanceRegistry` to
// resolve, so this file fails to type-check/run.
import type { InstanceRegistry } from '../../src/plane/instance-registry.js';
import { buildInstanceRegistry } from '../../src/plane/instance-registry.js';

/**
 * A classified event, structurally identical to registry.ts's `ClassifiedEvent`
 * (registry.test.ts's own test-local re-declaration is interchangeable by
 * structural typing — same convention followed here).
 */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: EventClassification;
  readonly type: EventType;
}

/**
 * Helper to mint a classified event carrying host/path/sessionId identity
 * fields (specs/037 EventEnvelope EXTEND) with predictable, controllable
 * wallClock + sequences for ordering/dedupe assertions. `installationSequence`
 * (the instance-monotonic ORDERING key the registry uses) defaults to
 * `invocationSequence` for the identity/dedupe cases where they coincide, but
 * the no-regress case sets it INDEPENDENTLY so the test pins the correct key.
 */
function mkEvent(opts: {
  host: string;
  path: string;
  sessionId: string | null;
  type: EventType;
  classification: EventClassification;
  invocationSequence: number;
  installationSequence?: number;
  wallClock: string;
  eventId?: string;
}): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: opts.eventId ?? mintUuidV7(),
    installationId: mintUuidV7(),
    invocationId: mintUuidV7(),
    runId: null,
    installationSequence: opts.installationSequence ?? opts.invocationSequence,
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
  };
}

describe('instance registry — folds events into one InstanceState per host:path (T016, data-model.md § InstanceState)', () => {
  it('builds exactly one InstanceState per host:path, keyed by the composite id', () => {
    const events: ClassifiedEvent[] = [
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
      }),
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'session.heartbeat',
        classification: 'live-only',
        invocationSequence: 2,
        wallClock: '2026-07-18T12:00:05.000Z',
      }),
    ];

    const registry: InstanceRegistry = buildInstanceRegistry(events);
    const instances = registry.instances();

    expect(instances).toHaveLength(1);
    expect(instances[0].id).toBe('orion-mbp:/Users/orion/work/proj-a');
  });

  it('sets lastActivityAt/lastActivity to the newest event (by wallClock/sequence), not the first or an arbitrary one', () => {
    const events: ClassifiedEvent[] = [
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
      }),
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'session.heartbeat',
        classification: 'live-only',
        invocationSequence: 2,
        wallClock: '2026-07-18T12:05:00.000Z',
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.lastActivityAt).toBe('2026-07-18T12:05:00.000Z');
    expect(instance.lastActivity).toBe('session.heartbeat');
  });

  it('sets connection and liveness derived from the last-signal age', () => {
    const now = Date.now();
    const recentWallClock = new Date(now).toISOString();

    const events: ClassifiedEvent[] = [
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'session.heartbeat',
        classification: 'live-only',
        invocationSequence: 1,
        wallClock: recentWallClock,
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.connection).toBe('attached');
    expect(instance.liveness).toBe('live');
  });

  it('classifies liveness as gone when the last signal is far in the past', () => {
    const longAgoWallClock = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago

    const events: ClassifiedEvent[] = [
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: longAgoWallClock,
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.liveness).toBe('gone');
    expect(instance.connection).toBe('disconnected');
  });

  it('effectively-once: a re-delivered event with the same eventId does not double-count or advance state', () => {
    const dupEventId = mintUuidV7();

    const first = mkEvent({
      host: 'orion-mbp',
      path: '/Users/orion/work/proj-a',
      sessionId: null,
      type: 'invocation.completed',
      classification: 'aggregated',
      invocationSequence: 1,
      wallClock: '2026-07-18T12:00:00.000Z',
      eventId: dupEventId,
    });

    // Same eventId, but a LATER wallClock/type — if dedupe by eventId is
    // honored, this redelivery must be dropped and lastActivity must stay
    // 'invocation.completed' at the original wallClock.
    const redelivered = mkEvent({
      host: 'orion-mbp',
      path: '/Users/orion/work/proj-a',
      sessionId: null,
      type: 'session.heartbeat',
      classification: 'live-only',
      invocationSequence: 1,
      wallClock: '2026-07-18T12:30:00.000Z',
      eventId: dupEventId,
    });

    const registry = buildInstanceRegistry([first, redelivered]);
    const [instance] = registry.instances();

    expect(instance.lastActivityAt).toBe('2026-07-18T12:00:00.000Z');
    expect(instance.lastActivity).toBe('invocation.completed');
  });

  it('no-regress: an out-of-order event with a LOWER installationSequence never regresses lastActivityAt/lastActivity', () => {
    // The registry orders by installationSequence (instance-monotonic), NOT
    // invocationSequence (per-invocation). To pin that contract, the two events
    // DISAGREE on the two keys: the newer event has the higher installationSequence
    // but a LOWER invocationSequence, and the out-of-order redelivery has a lower
    // installationSequence but a HIGHER invocationSequence. If the fold keyed on
    // invocationSequence (the shipped bug), the redelivery would win and regress
    // lastActivityAt to 12:05; keying on installationSequence, it does not.
    const events: ClassifiedEvent[] = [
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        installationSequence: 5,
        invocationSequence: 1,
        wallClock: '2026-07-18T12:10:00.000Z',
      }),
      // Arrives AFTER the above in the stream, but carries a LOWER
      // installationSequence (out-of-order redelivery) and an EARLIER wallClock —
      // must not regress. Its HIGHER invocationSequence must be ignored.
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'session.heartbeat',
        classification: 'live-only',
        installationSequence: 3,
        invocationSequence: 9,
        wallClock: '2026-07-18T12:05:00.000Z',
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.lastActivityAt).toBe('2026-07-18T12:10:00.000Z');
    expect(instance.lastActivity).toBe('invocation.completed');
  });

  it('two distinct hosts (same path) produce two distinct InstanceStates', () => {
    const events: ClassifiedEvent[] = [
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
      }),
      mkEvent({
        host: 'orion-linux-box',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const instances = registry.instances();

    expect(instances).toHaveLength(2);
    const ids = instances.map((i) => i.id).sort();
    expect(ids).toEqual([
      'orion-linux-box:/Users/orion/work/proj-a',
      'orion-mbp:/Users/orion/work/proj-a',
    ]);
  });

  it('two distinct paths (same host) produce two distinct InstanceStates', () => {
    const events: ClassifiedEvent[] = [
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-a',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
      }),
      mkEvent({
        host: 'orion-mbp',
        path: '/Users/orion/work/proj-b',
        sessionId: null,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const instances = registry.instances();

    expect(instances).toHaveLength(2);
    const ids = instances.map((i) => i.id).sort();
    expect(ids).toEqual([
      'orion-mbp:/Users/orion/work/proj-a',
      'orion-mbp:/Users/orion/work/proj-b',
    ]);
  });
});
