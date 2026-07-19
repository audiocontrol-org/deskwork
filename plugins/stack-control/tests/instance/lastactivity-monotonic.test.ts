// specs/037-instance-observability — dogfood-found correctness regression.
//
// THE BUG (found by dogfooding; the green suite endorsed it): an instance's
// `lastActivityAt`/`lastActivity` (and `firstSeenAt`, `lastHeartbeatAt`) froze
// at the FIRST event instead of tracking the newest. Root cause: the instance
// fold keyed its no-regress ordering on `invocationSequence`, which is
// PER-INVOCATION — session/phase events set it to 0 and every fresh `stackctl`
// invocation restarts its own count — so it is NOT monotonic across an
// instance's lifetime. The first high-`invocationSequence` event won and every
// later event was rejected as "older", freezing the fields.
//
// THE CONTRACT this pins: the instance registry orders by `installationSequence`
// (the sidecar's durable, per-installation outbound counter — monotonic across
// invocations AND across sidecar restarts), NOT `invocationSequence`.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks, no `any`/`as`/`@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope, EventType, EventClassification } from '../../src/fleet/types.js';
import { buildInstanceRegistry } from '../../src/plane/instance-registry.js';
import type { ClassifiedEvent } from '../../src/plane/instance-registry.js';

/**
 * Mint a classified event with INDEPENDENT `installationSequence` (the
 * instance-monotonic key) and `invocationSequence` (per-invocation, resets),
 * so a test can drive the exact bug: `invocationSequence` reset across
 * invocations while `installationSequence` stays strictly monotonic.
 */
function mkEvent(opts: {
  host: string;
  path: string;
  type: EventType;
  classification: EventClassification;
  installationSequence: number;
  invocationSequence: number;
  wallClock: string;
  eventId?: string;
}): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: opts.eventId ?? mintUuidV7(),
    installationId: mintUuidV7(),
    invocationId: mintUuidV7(),
    runId: null,
    installationSequence: opts.installationSequence,
    invocationSequence: opts.invocationSequence,
    schemaVersion: 2,
    type: opts.type,
    wallClock: opts.wallClock,
    monotonicOffsetMs: 0,
    classification: opts.classification,
    host: opts.host,
    path: opts.path,
    sessionId: null,
  };
  return { envelope, classification: opts.classification, type: opts.type, snapshot: {} };
}

const HOST = 'orion-mbp';
const PATH = '/Users/orion/work/proj-a';

describe('instance registry orders lastActivity by installationSequence, not invocationSequence (dogfood regression)', () => {
  it('lastActivityAt/lastActivity track the newest event when invocationSequence RESETS across invocations but installationSequence is monotonic', () => {
    // Five events from ONE instance across multiple invocations. invocationSequence
    // resets per invocation (0,1,0,1,0) — the buggy key — while installationSequence
    // is strictly monotonic (1..5) with strictly-increasing wallClocks (the real key).
    const events: ClassifiedEvent[] = [
      mkEvent({
        host: HOST,
        path: PATH,
        type: 'session.started',
        classification: 'durable',
        installationSequence: 1,
        invocationSequence: 0,
        wallClock: '2026-07-18T07:18:30.885Z',
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        type: 'invocation.completed',
        classification: 'aggregated',
        installationSequence: 2,
        invocationSequence: 1,
        wallClock: '2026-07-18T07:18:35.000Z',
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        type: 'phase.entered',
        classification: 'durable',
        installationSequence: 3,
        invocationSequence: 0,
        wallClock: '2026-07-18T07:18:40.000Z',
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        type: 'invocation.completed',
        classification: 'aggregated',
        installationSequence: 4,
        invocationSequence: 1,
        wallClock: '2026-07-18T07:18:42.000Z',
      }),
      mkEvent({
        host: HOST,
        path: PATH,
        type: 'session.heartbeat',
        classification: 'live-only',
        installationSequence: 5,
        invocationSequence: 0,
        wallClock: '2026-07-18T07:18:45.085Z',
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    // The newest event (installationSequence 5) wins — NOT the first (which the
    // per-invocation key would freeze on). This is the exact dogfood symptom:
    // lastActivityAt was stuck at 07:18:30.885Z while a 07:18:45.085Z event existed.
    expect(instance.lastActivityAt).toBe('2026-07-18T07:18:45.085Z');
    expect(instance.lastActivity).toBe('session.heartbeat');

    // firstSeenAt tracks the EARLIEST (installationSequence 1) event.
    expect(instance.firstSeenAt).toBe('2026-07-18T07:18:30.885Z');

    // recentActivity[0] (newest-first) must AGREE with lastActivityAt — the
    // exact disagreement the dogfood surfaced.
    const newest = instance.recentActivity[0];
    if (typeof newest !== 'object' || newest === null || !('wallClock' in newest)) {
      throw new Error('recentActivity[0] missing wallClock');
    }
    expect(Reflect.get(newest, 'wallClock')).toBe(instance.lastActivityAt);
  });

  it('no-regress is genuinely preserved: a later-arriving event with a LOWER installationSequence does not walk lastActivityAt backward', () => {
    const events: ClassifiedEvent[] = [
      mkEvent({
        host: HOST,
        path: PATH,
        type: 'invocation.completed',
        classification: 'aggregated',
        installationSequence: 9,
        invocationSequence: 1,
        wallClock: '2026-07-18T07:20:00.000Z',
      }),
      // Arrives AFTER in the stream but carries a LOWER installationSequence and
      // an EARLIER wallClock (out-of-order redelivery) — must NOT regress.
      mkEvent({
        host: HOST,
        path: PATH,
        type: 'session.heartbeat',
        classification: 'live-only',
        installationSequence: 4,
        invocationSequence: 0,
        wallClock: '2026-07-18T07:19:50.000Z',
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    expect(instance.lastActivityAt).toBe('2026-07-18T07:20:00.000Z');
    expect(instance.lastActivity).toBe('invocation.completed');
  });
});
