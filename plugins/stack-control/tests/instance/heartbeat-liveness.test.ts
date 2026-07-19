// specs/037-instance-observability — dogfood finding T050 (RED-first fix).
//
// THE GAP: `lastHeartbeatAt` was ALWAYS null and `liveness`/`connection` derived
// only from `lastActivityAt` recency — so an IDLE-but-connected instance (sidecar
// heartbeating, operator running no verbs) wrongly aged live -> stale -> gone.
// Per research.md D1, liveness must track heartbeat recency (live -> stale at
// LIVENESS_WINDOW_MS = 2x the 45s heartbeat; stale -> gone at 10min) and
// `connection` is a DISTINCT axis = real uplink presence (a recent heartbeat).
//
// THE FIX (approach a): the plane records the sidecar's per-installation
// session-liveness heartbeat in an in-memory (live-only) map; `buildInstanceRegistry`
// consults it (keyed by the instance's installationId, 1:1 with host:path) to set
// `lastHeartbeatAt` and derive liveness from max(lastActivityAt, lastHeartbeatAt),
// and `connection` from heartbeat recency.
//
// RED against current code: `buildInstanceRegistry` takes only `(events)` today,
// so a stale-activity + fresh-heartbeat instance derives liveness off the stale
// activity (-> 'stale'/'gone') and `lastHeartbeatAt` stays null. GREEN once the
// heartbeat map feeds the fold.
//
// Injected-clock discipline: NO real 45s wait — wallClock/emittedAt are set
// relative to `Date.now()` (the established pattern in registry-instances.test.ts).
// Relative `.js` imports under node16; no `any`/`as`/`@ts-ignore`.

import { describe, expect, it } from 'vitest';
import type { EventClassification, EventEnvelope, EventType } from '../../src/fleet/types.js';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { buildInstanceRegistry, type ClassifiedEvent } from '../../src/plane/instance-registry.js';

const HOST = 'orion-mbp';
const PATH = '/Users/orion/work/proj-idle';
const ID = `${HOST}:${PATH}`;

function mkEvent(opts: {
  installationId: string;
  type: EventType;
  classification: EventClassification;
  invocationSequence: number;
  wallClock: string;
}): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId: opts.installationId,
    invocationId: mintUuidV7(),
    runId: null,
    installationSequence: opts.invocationSequence,
    invocationSequence: opts.invocationSequence,
    schemaVersion: 2,
    type: opts.type,
    wallClock: opts.wallClock,
    monotonicOffsetMs: 0,
    classification: opts.classification,
    host: HOST,
    path: PATH,
    sessionId: null,
  };
  return { envelope, classification: opts.classification, type: opts.type, snapshot: {} };
}

/** An ISO timestamp `ms` in the past — relative to now, so no wall-clock wait. */
function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('instance liveness folds the live session-liveness heartbeat (dogfood T050)', () => {
  it('a RECENT heartbeat keeps an activity-idle instance live (heartbeat vs 120s-old activity)', () => {
    const installationId = mintUuidV7();
    // lastActivityAt is STALE past the live->stale window (120s > 90s) ...
    const events = [
      mkEvent({
        installationId,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(120_000),
      }),
    ];
    // ... but the sidecar heartbeated 5s ago (well within the window).
    const emittedAt = isoAgo(5_000);
    const heartbeats = new Map<string, string>([[installationId, emittedAt]]);

    const instance = buildInstanceRegistry(events, heartbeats).instance(ID);
    if (instance === undefined) throw new Error('expected the instance to exist');

    expect(instance.liveness).toBe('live'); // heartbeat holds it alive
    expect(instance.connection).toBe('attached'); // recent heartbeat = uplink present
    expect(instance.lastHeartbeatAt).toBe(emittedAt);
  });

  it('BOTH signals stale -> stale + disconnected; lastHeartbeatAt still reflects the heartbeat', () => {
    const installationId = mintUuidV7();
    const events = [
      mkEvent({
        installationId,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(120_000), // 2 min ago (stale band)
      }),
    ];
    // heartbeat 3 min ago — also past the 90s window (still within 10min).
    const emittedAt = isoAgo(180_000);
    const heartbeats = new Map<string, string>([[installationId, emittedAt]]);

    const instance = buildInstanceRegistry(events, heartbeats).instance(ID);
    if (instance === undefined) throw new Error('expected the instance to exist');
    expect(instance.liveness).toBe('stale'); // freshest signal (120s) is in the stale band
    expect(instance.connection).toBe('disconnected'); // no RECENT heartbeat -> uplink absent
    expect(instance.lastHeartbeatAt).toBe(emittedAt);
  });

  it('no heartbeat + far-past activity -> gone + disconnected, lastHeartbeatAt null (no-regress guard)', () => {
    const installationId = mintUuidV7();
    const events = [
      mkEvent({
        installationId,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(24 * 60 * 60 * 1000), // 24h ago
      }),
    ];
    const instance = buildInstanceRegistry(events /* no heartbeats */).instance(ID);
    if (instance === undefined) throw new Error('expected the instance to exist');
    expect(instance.liveness).toBe('gone');
    expect(instance.connection).toBe('disconnected');
    expect(instance.lastHeartbeatAt).toBeNull();
  });

  it('connection lapses to disconnected once the heartbeat ages out, even with fresh activity (axes independent)', () => {
    const installationId = mintUuidV7();
    // fresh activity 1s ago (keeps liveness live) ...
    const events = [
      mkEvent({
        installationId,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(1_000),
      }),
    ];
    // ... but the last heartbeat was 2 min ago — the uplink lapsed.
    const heartbeats = new Map<string, string>([[installationId, isoAgo(120_000)]]);
    const instance = buildInstanceRegistry(events, heartbeats).instance(ID);
    if (instance === undefined) throw new Error('expected the instance to exist');
    expect(instance.liveness).toBe('live'); // activity keeps liveness live
    expect(instance.connection).toBe('disconnected'); // heartbeat lapsed -> uplink absent
  });
});
