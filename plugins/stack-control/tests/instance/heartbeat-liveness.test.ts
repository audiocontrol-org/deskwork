// specs/037-instance-observability — dogfood finding T050 (RED-first fix).
//
// THE GAP: `lastHeartbeatAt` was ALWAYS null and `liveness`/`connection` derived
// only from `lastActivityAt` recency — so an IDLE-but-connected instance (sidecar
// heartbeating, operator running no verbs) wrongly aged live -> stale -> gone.
// Per research.md D1, liveness must track heartbeat recency (live -> stale at
// LIVENESS_WINDOW_MS = 2x the 45s heartbeat; stale -> gone at 10min) and
// `connection` is a DISTINCT axis = real uplink presence (a recent heartbeat).
//
// THE FIX (approach a): the plane records the sidecar's session-liveness
// heartbeat in an in-memory (live-only) map; `buildInstanceRegistry` consults it
// to set `lastHeartbeatAt` and derive liveness from
// max(lastActivityAt, lastHeartbeatAt), and `connection` from heartbeat recency.
//
// KEYED BY host:path, NOT installationId (AUDIT-20260719-21): installationId is a
// UUID copied when a checkout is copied, so it CANNOT distinguish two observed
// instances that share it (a copied/moved checkout — the exact reason 037 keys the
// instance by `host:path`). Keying the heartbeat by installationId would inject one
// sidecar's beat into EVERY instance sharing the id, marking a stale copy `attached`/
// `live`. The heartbeat carries and is keyed by the instance's own `host:path`.
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
  host?: string;
  path?: string;
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
    host: opts.host ?? HOST,
    path: opts.path ?? PATH,
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
    const heartbeats = new Map<string, string>([[ID, emittedAt]]);

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
    const heartbeats = new Map<string, string>([[ID, emittedAt]]);

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

  // AUDIT-20260719-10 (HIGH): a single malformed/implausible heartbeat must NOT
  // poison an instance's liveness. The derivation is the load-bearing belt — even
  // if a bad emittedAt slips into the store, it can never be a valid live signal.
  it('a FAR-FUTURE heartbeat is NOT a live signal — it cannot pin an idle instance live (poison resistance)', () => {
    const installationId = mintUuidV7();
    // Only activity is 5 min stale (-> would derive 'stale' off activity alone).
    const events = [
      mkEvent({
        installationId,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(300_000),
      }),
    ];
    // A clock-skewed / malicious sidecar sends emittedAt ~= year 3000.
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 975).toISOString();
    const heartbeats = new Map<string, string>([[ID, farFuture]]);

    const instance = buildInstanceRegistry(events, heartbeats).instance(ID);
    if (instance === undefined) throw new Error('expected the instance to exist');
    // The future heartbeat is rejected as a live signal: liveness derives off the
    // (stale) activity, NOT the future timestamp — it can never sit 'live' forever.
    expect(instance.liveness).toBe('stale');
    expect(instance.connection).toBe('disconnected'); // a future heartbeat is not real uplink presence
    expect(instance.lastHeartbeatAt).toBeNull(); // an implausible heartbeat is never adopted
  });

  it('an UNPARSEABLE heartbeat does not corrupt liveness — fresh activity still reads live', () => {
    const installationId = mintUuidV7();
    // Fresh activity 1s ago keeps liveness live UNLESS a garbage heartbeat poisons it.
    const events = [
      mkEvent({
        installationId,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(1_000),
      }),
    ];
    const heartbeats = new Map<string, string>([[ID, 'not-a-timestamp']]);

    const instance = buildInstanceRegistry(events, heartbeats).instance(ID);
    if (instance === undefined) throw new Error('expected the instance to exist');
    expect(instance.liveness).toBe('live'); // activity governs; garbage heartbeat ignored, not NaN-poisoned to 'gone'
    expect(instance.connection).toBe('disconnected'); // a garbage heartbeat is not a valid uplink
    expect(instance.lastHeartbeatAt).toBeNull(); // an unparseable heartbeat is never adopted
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
    const heartbeats = new Map<string, string>([[ID, isoAgo(120_000)]]);
    const instance = buildInstanceRegistry(events, heartbeats).instance(ID);
    if (instance === undefined) throw new Error('expected the instance to exist');
    expect(instance.liveness).toBe('live'); // activity keeps liveness live
    expect(instance.connection).toBe('disconnected'); // heartbeat lapsed -> uplink absent
  });

  // AUDIT-20260719-21 (HIGH, blast-radius-high): a heartbeat keyed by host:path
  // marks ONLY the matching instance. Two observed instances that SHARE an
  // installationId but differ in host:path (a copied/moved checkout) must NOT both
  // go live off one sidecar's beat — that is the exact confusion 037's host:path
  // identity exists to prevent. RED against the pre-fix code (keyed by
  // installationId): a map keyed by host:path is never found by the installationId
  // lookup, so instance A is NOT attached; GREEN once the lookup keys by host:path.
  it('a heartbeat keyed by host:path marks ONLY that instance — a same-installationId copy stays disconnected', () => {
    const installationId = mintUuidV7(); // ONE installationId, shared by two checkouts.
    const HOST_A = 'orion-mbp';
    const PATH_A = '/Users/orion/work/proj-original';
    const HOST_B = 'orion-mbp';
    const PATH_B = '/Users/orion/work/proj-copy'; // a copied checkout — same UUID, different path.
    const ID_A = `${HOST_A}:${PATH_A}`;
    const ID_B = `${HOST_B}:${PATH_B}`;

    // Both instances are activity-idle (stale) so ONLY a heartbeat can hold one live.
    const events = [
      mkEvent({
        installationId,
        host: HOST_A,
        path: PATH_A,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(120_000),
      }),
      mkEvent({
        installationId,
        host: HOST_B,
        path: PATH_B,
        type: 'invocation.completed',
        classification: 'aggregated',
        invocationSequence: 1,
        wallClock: isoAgo(120_000),
      }),
    ];
    // The sidecar for instance A heartbeats — keyed by A's OWN host:path.
    // Capture the instant ONCE: `isoAgo` re-samples `Date.now()` on each call, so
    // asserting against a re-derived `isoAgo(5_000)` races a 1ms wall-clock tick.
    const heartbeatAt = isoAgo(5_000);
    const heartbeats = new Map<string, string>([[ID_A, heartbeatAt]]);

    const registry = buildInstanceRegistry(events, heartbeats);
    const a = registry.instance(ID_A);
    const b = registry.instance(ID_B);
    if (a === undefined || b === undefined) throw new Error('expected both instances to exist');

    // A: the heartbeat's own instance — attached + live.
    expect(a.connection).toBe('attached');
    expect(a.liveness).toBe('live');
    expect(a.lastHeartbeatAt).toBe(heartbeatAt);

    // B: the same-installationId copy A's heartbeat must NOT reach.
    expect(b.connection).toBe('disconnected');
    expect(b.liveness).toBe('stale'); // off its own stale activity, never A's heartbeat
    expect(b.lastHeartbeatAt).toBeNull();
  });

  // AUDIT-20260719-20 (HIGH): `connection` recency is fed by TWO heartbeat
  // channels, and a fresh signal from EITHER marks `attached`:
  //   (1) an in-band `session.heartbeat` telemetry EVENT (folded by the accumulator
  //       into lastHeartbeatAt), and
  //   (2) the out-of-band `/v1/sidecar/liveness` POST (HeartbeatStore -> injected
  //       into lastHeartbeatAt, latest-wins).
  // Ordinary activity (invocation.completed) feeds lastActivityAt/liveness but NOT
  // connection. This exercises BOTH channels together (one stale, one fresh) and
  // asserts the freshest of the two governs — the documented multi-channel invariant
  // on `refreshConnectionAndLiveness`.
  it('connection derives from the freshest of BOTH heartbeat channels (in-band event + out-of-band POST)', () => {
    const installationId = mintUuidV7();

    // Channel 1 (in-band): a session.heartbeat EVENT that is STALE (2 min old).
    // Channel 2 (out-of-band POST) will be FRESH — it must win and mark attached.
    const staleInBand = [
      mkEvent({
        installationId,
        type: 'session.heartbeat',
        classification: 'live-only',
        invocationSequence: 1,
        wallClock: isoAgo(120_000),
      }),
    ];
    const freshPostAt = isoAgo(5_000);
    const freshOutOfBand = new Map<string, string>([[ID, freshPostAt]]);
    const withFreshPost = buildInstanceRegistry(staleInBand, freshOutOfBand).instance(ID);
    if (withFreshPost === undefined) throw new Error('expected the instance to exist');
    expect(withFreshPost.connection).toBe('attached'); // fresh out-of-band POST wins
    expect(withFreshPost.liveness).toBe('live');
    expect(withFreshPost.lastHeartbeatAt).toBe(freshPostAt);

    // Symmetric: a FRESH in-band session.heartbeat EVENT + a STALE out-of-band POST.
    // The in-band channel alone must mark attached (latest-wins keeps the fresher).
    const freshEventAt = isoAgo(5_000);
    const freshInBand = [
      mkEvent({
        installationId,
        type: 'session.heartbeat',
        classification: 'live-only',
        invocationSequence: 1,
        wallClock: freshEventAt,
      }),
    ];
    const staleOutOfBand = new Map<string, string>([[ID, isoAgo(120_000)]]);
    const withFreshEvent = buildInstanceRegistry(freshInBand, staleOutOfBand).instance(ID);
    if (withFreshEvent === undefined) throw new Error('expected the instance to exist');
    expect(withFreshEvent.connection).toBe('attached'); // fresh in-band event wins
    expect(withFreshEvent.liveness).toBe('live');
    expect(withFreshEvent.lastHeartbeatAt).toBe(freshEventAt);
  });
});
