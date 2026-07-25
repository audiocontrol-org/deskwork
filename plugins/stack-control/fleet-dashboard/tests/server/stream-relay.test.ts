// T012 — RED test for the Fleet Dashboard BFF's stream relay.
//
// Per research.md R1 the dashboard holds ONE upstream `/v1/instances/stream`
// subscription and fans it out to every connected browser subscriber —
// never one upstream connection per browser. Per FR-015 each subscriber
// gets an initial snapshot before any live delta. Per FR-016, when the
// single upstream connection drops, the relay surfaces a disconnected
// signal, reconnects, and re-fetches a fresh snapshot that fans out to
// every still-connected subscriber (a resync, not a silent gap).
//
// Both the upstream connection (`ConnectUpstream`) and the plane client's
// re-snapshot call are injected (DI), so this suite drives "one upstream,
// N subscribers" and "drop -> reconnect -> re-snapshot" deterministically —
// zero real network, zero real timers. The only asynchrony is the fake
// plane client's `instanceSnapshot()` Promise, which resolves on its own
// microtask; `flushAsync()` below drains that without any arbitrary sleep.

import { describe, it, expect } from 'vitest';
import {
  createStreamRelay,
  isInstanceDelta,
  type ConnectUpstream,
  type InstanceDelta,
  type RelayEvent,
  type ScheduleReconnect,
  type StreamRelayDeps,
  type UpstreamConnection,
  type UpstreamHandlers,
} from '../../src/server/stream-relay.js';
import { PlaneClientError } from '../../src/server/plane-client.js';

/** Drains the microtask queue (and one macrotask tick) so a relay-internal
 * `await planeClient.instanceSnapshot()` hop — kicked off by a
 * synchronously-invoked `onDrop()` — has settled before assertions run.
 * `setImmediate` fires after all currently-queued microtasks, regardless of
 * how many promise hops the resync chain takes, so this is deterministic
 * and requires no arbitrary wait duration. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface FakeUpstreamConnection {
  readonly handlers: UpstreamHandlers;
  closed: boolean;
}

/** Records every `connectUpstream()` call (and the handlers it was given)
 * without ever touching the network — the harness that lets a test prove
 * "exactly one upstream connection" and drive `onDelta`/`onDrop` by hand. */
function createFakeUpstream(): {
  readonly connectUpstream: ConnectUpstream;
  readonly connections: readonly FakeUpstreamConnection[];
} {
  const connections: FakeUpstreamConnection[] = [];
  const connectUpstream: ConnectUpstream = (handlers: UpstreamHandlers): UpstreamConnection => {
    const record: FakeUpstreamConnection = { handlers, closed: false };
    connections.push(record);
    return {
      close(): void {
        record.closed = true;
      },
    };
  };
  return { connectUpstream, connections };
}

/** A fake plane-client `instanceSnapshot()` that returns each body in
 * `bodies` in sequence (repeating the last one once exhausted) so a test
 * can prove a RE-snapshot after reconnect actually reflects fresh upstream
 * state, not a cached copy of the first snapshot. `calls` is the SAME
 * mutable array across the life of the fake (not a snapshot copy), so a
 * caller can read its live `.length` after further `onDrop()`-triggered
 * resyncs without re-destructuring. */
function createFakePlaneClient(bodies: readonly unknown[]): {
  readonly planeClient: StreamRelayDeps['planeClient'];
  readonly calls: readonly unknown[];
} {
  const calls: unknown[] = [];
  const planeClient: StreamRelayDeps['planeClient'] = {
    instanceSnapshot: async () => {
      const index = Math.min(calls.length, bodies.length - 1);
      calls.push(true);
      return bodies[index];
    },
  };
  return { planeClient, calls };
}

function snapshotBody(ids: readonly string[]): unknown {
  return { instances: ids.map((id) => ({ id })) };
}

/** One scripted `instanceSnapshot()` outcome: return a body, or throw to make
 * the call reject (simulating a plane that is still unreachable during a
 * post-drop resync — the exact FR-016 failure the retry loop must survive). */
type SnapshotStep = () => unknown;

/** A plane client whose `instanceSnapshot()` follows `steps` in sequence
 * (repeating the last step once exhausted), so a test can script
 * "success, then rejects N times, then succeeds" deterministically. */
function createScriptedPlaneClient(steps: readonly SnapshotStep[]): {
  readonly planeClient: StreamRelayDeps['planeClient'];
  readonly calls: readonly unknown[];
} {
  const calls: unknown[] = [];
  const planeClient: StreamRelayDeps['planeClient'] = {
    instanceSnapshot: async () => {
      const step = steps[Math.min(calls.length, steps.length - 1)];
      calls.push(true);
      if (step === undefined) {
        throw new Error('createScriptedPlaneClient: no scripted step available');
      }
      return step();
    },
  };
  return { planeClient, calls };
}

/** A manually-pumped {@link ScheduleReconnect}: no real timers. `pending`
 * holds the retry callbacks the relay scheduled; `flushOne()` fires the
 * oldest one and drains the resulting async work. The canceller removes a
 * scheduled retry from `pending`, so a test can prove `stop()` cancels an
 * in-flight retry (no leaked timer, no retry-after-stop). */
function createManualReconnectScheduler(): {
  readonly scheduleReconnect: ScheduleReconnect;
  readonly pending: readonly (() => void)[];
  readonly flushOne: () => Promise<void>;
} {
  const pending: Array<() => void> = [];
  const scheduleReconnect: ScheduleReconnect = (retry) => {
    pending.push(retry);
    return (): void => {
      const index = pending.indexOf(retry);
      if (index >= 0) {
        pending.splice(index, 1);
      }
    };
  };
  const flushOne = async (): Promise<void> => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error('flushOne: no pending reconnect retry to flush');
    }
    next();
    await flushAsync();
  };
  return { scheduleReconnect, pending, flushOne };
}

/** A resolvable/rejectable promise handle, for driving a resync fetch that is
 * still in flight when `stop()` is called (the reconnect-after-stop channel). */
function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('stream-relay — single upstream subscription fanned out to N subscribers (research R1)', () => {
  it('opens exactly one upstream connection no matter how many browser subscribers join', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient } = createFakePlaneClient([snapshotBody(['a:b'])]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const subscriberEvents: RelayEvent[][] = [[], [], []];
    for (const events of subscriberEvents) {
      relay.subscribe((event) => events.push(event));
    }

    expect(connections).toHaveLength(1);
    for (const events of subscriberEvents) {
      expect(events).toEqual([{ kind: 'snapshot', instances: [{ id: 'a:b' }] }]);
    }
  });

  it('a subscriber joining after the initial snapshot gets only the current state, not deltas already delivered to earlier subscribers', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient } = createFakePlaneClient([snapshotBody(['a:b'])]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const earlyEvents: RelayEvent[] = [];
    relay.subscribe((event) => earlyEvents.push(event));

    const conn = connections[0];
    if (conn === undefined) throw new Error('expected one upstream connection');
    conn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: 'c:d' } });

    const lateEvents: RelayEvent[] = [];
    relay.subscribe((event) => lateEvents.push(event));

    expect(connections).toHaveLength(1);
    expect(lateEvents).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }, { id: 'c:d' }] },
    ]);
    expect(earlyEvents).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'delta', delta: { kind: 'instance-upserted', instance: { id: 'c:d' } } },
    ]);
  });
});

describe('stream-relay — snapshot-then-deltas ordering per subscriber (FR-015)', () => {
  it('delivers an initial snapshot before any incremental instance-upserted / instance-removed delta', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient } = createFakePlaneClient([snapshotBody(['a:b'])]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    const conn = connections[0];
    if (conn === undefined) throw new Error('expected one upstream connection');
    conn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: 'c:d' } });
    conn.handlers.onDelta({ kind: 'instance-removed', id: 'a:b' });

    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'delta', delta: { kind: 'instance-upserted', instance: { id: 'c:d' } } },
      { kind: 'delta', delta: { kind: 'instance-removed', id: 'a:b' } },
    ]);
  });

  it('never re-fetches per delta — the same upstream connection stays open across many deltas', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient, calls: planeCalls } = createFakePlaneClient([snapshotBody(['a:b'])]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();
    relay.subscribe(() => {});

    const conn = connections[0];
    if (conn === undefined) throw new Error('expected one upstream connection');
    for (let i = 0; i < 5; i += 1) {
      conn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: `instance-${i}` } });
    }

    expect(connections).toHaveLength(1);
    expect(planeCalls.length).toBe(1);
  });
});

describe('stream-relay — upstream drop -> reconnect -> re-snapshot (FR-016)', () => {
  it('on drop, surfaces a disconnected signal, reconnects, and fans a fresh re-snapshot to existing subscribers', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient, calls: planeCalls } = createFakePlaneClient([
      snapshotBody(['a:b']),
      snapshotBody(['a:b', 'e:f']),
    ]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected an initial upstream connection');

    firstConn.handlers.onDrop();
    await flushAsync();

    expect(connections).toHaveLength(2);
    expect(planeCalls.length).toBe(2);
    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
      { kind: 'snapshot', instances: [{ id: 'a:b' }, { id: 'e:f' }] },
    ]);
  });

  it('a subscriber joining mid-outage (after disconnected, before the resync completes) gets nothing until the fresh snapshot lands', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient } = createFakePlaneClient([
      snapshotBody(['a:b']),
      snapshotBody(['g:h']),
    ]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected an initial upstream connection');
    firstConn.handlers.onDrop();

    // Subscribe synchronously, in the same tick as the drop — after the
    // (already-broadcast-to-nobody, since this subscriber wasn't
    // registered yet) disconnected signal. A late joiner never receives a
    // past broadcast; it just waits for readiness.
    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));
    expect(events).toEqual([]);

    await flushAsync();

    expect(events).toEqual([{ kind: 'snapshot', instances: [{ id: 'g:h' }] }]);
  });

  it('deltas that arrive on the fresh upstream connection after reconnect keep applying', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient } = createFakePlaneClient([
      snapshotBody(['a:b']),
      snapshotBody(['a:b']),
    ]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected an initial upstream connection');
    firstConn.handlers.onDrop();
    await flushAsync();

    const secondConn = connections[1];
    if (secondConn === undefined) throw new Error('expected a reconnect');
    secondConn.handlers.onDelta({ kind: 'instance-removed', id: 'a:b' });

    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'delta', delta: { kind: 'instance-removed', id: 'a:b' } },
    ]);
  });
});

describe('stream-relay — unsubscribe stops delivery', () => {
  it('a delta fired after unsubscribe is never delivered to the unsubscribed listener', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient } = createFakePlaneClient([snapshotBody(['a:b'])]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const events: RelayEvent[] = [];
    const subscription = relay.subscribe((event) => events.push(event));
    subscription.unsubscribe();

    const conn = connections[0];
    if (conn === undefined) throw new Error('expected one upstream connection');
    conn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: 'c:d' } });

    expect(events).toEqual([{ kind: 'snapshot', instances: [{ id: 'a:b' }] }]);
  });
});

describe('stream-relay — isInstanceDelta validates raw upstream JSON (used by the real connector)', () => {
  it('accepts a well-formed instance-upserted delta', () => {
    expect(isInstanceDelta({ kind: 'instance-upserted', instance: { id: 'a:b' } })).toBe(true);
  });

  it('accepts a well-formed instance-removed delta', () => {
    expect(isInstanceDelta({ kind: 'instance-removed', id: 'a:b' })).toBe(true);
  });

  it('rejects malformed shapes', () => {
    expect(isInstanceDelta(null)).toBe(false);
    expect(isInstanceDelta({})).toBe(false);
    expect(isInstanceDelta({ kind: 'instance-upserted' })).toBe(false);
    expect(isInstanceDelta({ kind: 'instance-upserted', instance: { notAnId: 1 } })).toBe(false);
    expect(isInstanceDelta({ kind: 'instance-removed' })).toBe(false);
    expect(isInstanceDelta({ kind: 'something-else', id: 'a:b' })).toBe(false);
  });
});

describe('stream-relay — post-drop resync retries instead of crashing/stalling (AUDIT-20260725-01/03, FR-016)', () => {
  it('when the post-drop resync rejects, it is caught (no unhandled rejection) and retried until a fresh snapshot lands', async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const { connectUpstream, connections } = createFakeUpstream();
      const { scheduleReconnect, pending, flushOne } = createManualReconnectScheduler();
      const { planeClient, calls } = createScriptedPlaneClient([
        () => snapshotBody(['a:b']), // start()
        () => {
          throw new PlaneClientError('plane still restarting — resync 1 fails');
        },
        () => {
          throw new PlaneClientError('plane still restarting — resync 2 fails');
        },
        () => snapshotBody(['a:b', 'e:f']), // resync 3 succeeds
      ]);
      const relay = createStreamRelay({ planeClient, connectUpstream, scheduleReconnect });

      await relay.start();

      const events: RelayEvent[] = [];
      relay.subscribe((event) => events.push(event));

      const firstConn = connections[0];
      if (firstConn === undefined) throw new Error('expected an initial upstream connection');

      firstConn.handlers.onDrop();
      await flushAsync(); // first post-drop resync attempt runs and rejects

      // A retry has been scheduled rather than the rejection being lost. Per
      // AUDIT-20260725-06 each resync attempt now opens the upstream BEFORE it
      // reads the snapshot, so a failed attempt has already opened (and closed)
      // a fresh connection — one connection per attempt (was snapshot-first, so
      // the old ordering opened none until a snapshot succeeded).
      expect(connections).toHaveLength(2);
      expect(pending.length).toBe(1);
      expect(calls.length).toBe(2);

      await flushOne(); // second attempt rejects, reschedules
      expect(connections).toHaveLength(3);
      expect(pending.length).toBe(1);
      expect(calls.length).toBe(3);

      await flushOne(); // third attempt succeeds -> fresh snapshot + reconnect
      expect(connections).toHaveLength(4);
      expect(calls.length).toBe(4);
      expect(events).toEqual([
        { kind: 'snapshot', instances: [{ id: 'a:b' }] },
        { kind: 'disconnected' },
        { kind: 'snapshot', instances: [{ id: 'a:b' }, { id: 'e:f' }] },
      ]);

      // The whole point: the drop-recovery never produced an unhandled
      // rejection (fatal since Node 15) — every resync failure was caught.
      await flushAsync();
      expect(rejections).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  it('a second onDrop while a reconnect retry is already pending does not spawn a parallel retry loop or re-broadcast disconnected', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { scheduleReconnect, pending } = createManualReconnectScheduler();
    const { planeClient, calls } = createScriptedPlaneClient([
      () => snapshotBody(['a:b']), // start()
      () => {
        throw new PlaneClientError('plane down — resync fails');
      },
    ]);
    const relay = createStreamRelay({ planeClient, connectUpstream, scheduleReconnect });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected an initial upstream connection');

    firstConn.handlers.onDrop();
    await flushAsync(); // attempt rejects -> one retry scheduled
    expect(pending.length).toBe(1);
    expect(calls.length).toBe(2);

    // A second drop arrives while the retry loop already owns recovery.
    firstConn.handlers.onDrop();
    await flushAsync();

    // No parallel retry loop, no extra resync call, and exactly ONE
    // disconnected broadcast total (the second onDrop is a no-op).
    expect(pending.length).toBe(1);
    expect(calls.length).toBe(2);
    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
    ]);
  });

  it('stop() during a pending reconnect retry cancels it — no retry-after-stop, no reconnect-after-stop', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { scheduleReconnect, pending } = createManualReconnectScheduler();
    const { planeClient, calls } = createScriptedPlaneClient([
      () => snapshotBody(['a:b']), // start()
      () => {
        throw new PlaneClientError('plane down — resync fails');
      },
      () => snapshotBody(['should', 'never', 'be', 'fetched']),
    ]);
    const relay = createStreamRelay({ planeClient, connectUpstream, scheduleReconnect });

    await relay.start();
    relay.subscribe(() => {});

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected an initial upstream connection');

    firstConn.handlers.onDrop();
    await flushAsync(); // attempt rejects -> retry scheduled
    expect(pending.length).toBe(1);

    relay.stop();

    // The scheduled retry is cancelled (no leaked timer), and nothing
    // reconnects or re-fetches after stop. Per AUDIT-20260725-06 the one failed
    // attempt already opened+closed a buffering connection (subscribe-first),
    // so `connections` records 2 — but no THIRD is ever opened after stop.
    expect(pending.length).toBe(0);
    await flushAsync();
    expect(connections).toHaveLength(2);
    expect(calls.length).toBe(2);
  });

  it('stop() while a post-drop resync fetch is still in flight does not reconnect after stop', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const deferred = createDeferred<unknown>();
    let resyncCall = 0;
    const planeClient: StreamRelayDeps['planeClient'] = {
      instanceSnapshot: async () => {
        resyncCall += 1;
        if (resyncCall === 1) {
          return snapshotBody(['a:b']); // start()
        }
        return deferred.promise; // post-drop resync — resolves only when we say
      },
    };
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected an initial upstream connection');

    firstConn.handlers.onDrop(); // resync fetch begins, awaiting the deferred
    relay.stop(); // teardown races the in-flight fetch
    deferred.resolve(snapshotBody(['late:snapshot']));
    await flushAsync();

    // The in-flight fetch resolved AFTER stop() — it must not re-arm the relay
    // or go live. Per AUDIT-20260725-06 the recovery attempt opened its
    // buffering connection (subscribe-first) before the fetch, so `connections`
    // records 2; `stop()` closed it and the late snapshot is discarded (no
    // snapshot broadcast, no live delivery).
    expect(connections).toHaveLength(2);
    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
    ]);
  });

  it('a delta arriving during the outage window is superseded by the authoritative fresh snapshot', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { scheduleReconnect, pending, flushOne } = createManualReconnectScheduler();
    const { planeClient } = createScriptedPlaneClient([
      () => snapshotBody(['a:b']), // start()
      () => {
        throw new PlaneClientError('plane down — resync fails');
      },
      () => snapshotBody(['a:b']), // authoritative fresh snapshot on recovery
    ]);
    const relay = createStreamRelay({ planeClient, connectUpstream, scheduleReconnect });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected an initial upstream connection');

    firstConn.handlers.onDrop();
    await flushAsync(); // resync fails, retry pending
    expect(pending.length).toBe(1);

    // A late delta from the (soon-to-be-replaced) upstream arrives mid-window.
    firstConn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: 'ghost:1' } });

    await flushOne(); // recovery succeeds -> authoritative snapshot

    // Per AUDIT-20260725-06 each resync attempt opens the upstream before the
    // snapshot, so the failed first recovery attempt + the successful second
    // one add two connections on top of start's — three total.
    expect(connections).toHaveLength(3);
    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
      { kind: 'delta', delta: { kind: 'instance-upserted', instance: { id: 'ghost:1' } } },
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
    ]);
  });
});

/**
 * A fake plane modeling BOTH read channels the relay uses over ONE evolving
 * registry, so a test can reproduce AUDIT-20260725-06's snapshot-to-stream
 * gap deterministically:
 *
 *   - `connectUpstream()` emits the registry's current ids as an initial
 *     snapshot-as-deltas burst — `instance-upserted` per present id, mirroring
 *     the plane's `/v1/instances/stream` which computes its opening burst from
 *     `last = []` (src/plane/instance-handlers.ts) — and REGISTERS the
 *     connection so any subsequent registry mutation is delivered to it as an
 *     ongoing delta.
 *   - `instanceSnapshot()` returns the registry state at call time; the FIRST
 *     call also applies a scripted removal IMMEDIATELY AFTER capturing its
 *     return value — a delta "committed around the snapshot read" — emitting an
 *     ongoing `instance-removed` to every currently-connected stream.
 *
 * Under the OLD snapshot-first ordering the GET is read (and its removal
 * applied) BEFORE any stream is connected, so the removal's ongoing delta is
 * emitted to nobody, and the stream's later opening burst (upserts-only, per
 * the plane) never mentions the already-gone instance — so the removal is
 * LOST and the view stays permanently stale. Under the buffered-reconcile fix
 * the stream is connected FIRST, so the removal's ongoing delta is buffered
 * and folded into the reconcile — applied, never lost.
 */
function createGapPlane(
  initialIds: readonly string[],
  gapRemovedId: string,
): {
  readonly connectUpstream: ConnectUpstream;
  readonly planeClient: StreamRelayDeps['planeClient'];
  readonly connections: readonly FakeUpstreamConnection[];
} {
  let ids: string[] = [...initialIds];
  const live = new Set<UpstreamHandlers>();
  const connections: FakeUpstreamConnection[] = [];
  let didMutate = false;

  const connectUpstream: ConnectUpstream = (handlers: UpstreamHandlers): UpstreamConnection => {
    const record: FakeUpstreamConnection = { handlers, closed: false };
    connections.push(record);
    for (const id of ids) {
      handlers.onDelta({ kind: 'instance-upserted', instance: { id } });
    }
    live.add(handlers);
    return {
      close(): void {
        record.closed = true;
        live.delete(handlers);
      },
    };
  };

  const planeClient: StreamRelayDeps['planeClient'] = {
    instanceSnapshot: async () => {
      const body = { instances: ids.map((id) => ({ id })) };
      if (!didMutate) {
        didMutate = true;
        ids = ids.filter((id) => id !== gapRemovedId);
        const removal: InstanceDelta = { kind: 'instance-removed', id: gapRemovedId };
        for (const handlers of live) {
          handlers.onDelta(removal);
        }
      }
      return body;
    },
  };

  return { connectUpstream, planeClient, connections };
}

describe('stream-relay — snapshot-to-stream gap cannot lose a live delta (AUDIT-20260725-06)', () => {
  it('a delta committed in the gap window (around the snapshot read, before the stream is live) is applied, not lost', async () => {
    const { connectUpstream, planeClient } = createGapPlane(['a:b', 'gone:1'], 'gone:1');
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    // A subscriber joining after start() sees the AUTHORITATIVE reconciled view.
    // The gap-window removal of `gone:1` must be reflected — under the old
    // snapshot-first ordering it leaks (the stream connects too late to observe
    // it and its opening burst never re-removes an already-gone instance).
    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    expect(events).toEqual([{ kind: 'snapshot', instances: [{ id: 'a:b' }] }]);
  });

  it('a buffered instance-removed for an id present in the authoritative snapshot removes it after reconcile', async () => {
    // The reconcile seeds from the GET snapshot (which still lists `gone:1`) and
    // folds the buffered removal on top — an idempotent delete by id.
    const { connectUpstream, planeClient } = createGapPlane(['a:b', 'c:d', 'gone:1'], 'gone:1');
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }, { id: 'c:d' }] },
    ]);
  });

  it('stop() during the subscribe-buffer-snapshot window tears down cleanly — no snapshot broadcast after stop', async () => {
    // Channel: stop() called after the upstream is opened + buffering but
    // before the authoritative snapshot resolves. The buffering connection
    // must be closed (no leaked upstream) and the relay must never go live.
    const { connectUpstream, connections } = createFakeUpstream();
    const deferred = createDeferred<unknown>();
    const planeClient: StreamRelayDeps['planeClient'] = {
      instanceSnapshot: async () => deferred.promise,
    };
    const relay = createStreamRelay({ planeClient, connectUpstream });

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event)); // subscribes before ready

    const startResult = relay.start(); // opens upstream + buffers; GET in flight

    const conn = connections[0];
    if (conn === undefined) throw new Error('expected a buffering upstream connection');
    // The plane stream's opening burst arrives while buffering.
    conn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: 'buffered:1' } });

    relay.stop(); // teardown during the buffer-snapshot window
    deferred.resolve(snapshotBody(['a:b']));
    await startResult;
    await flushAsync();

    // The relay never went live: no snapshot (and none of the buffered deltas)
    // ever reached the subscriber, and the buffering connection was closed.
    expect(events).toEqual([]);
    expect(conn.closed).toBe(true);
  });

  it('a buffering connection that drops mid-reconnect is abandoned; a fresh attempt completes the resync with exactly one live stream', async () => {
    // Channel: onDrop on the connection a recovery attempt is still buffering
    // (before it reconciled). The attempt must be abandoned (its partial buffer
    // discarded, its connection closed) rather than going live on a corpse, and
    // the retry loop must open a FRESH connection — never a duplicate live one.
    const { connectUpstream, connections } = createFakeUpstream();
    const { scheduleReconnect, pending, flushOne } = createManualReconnectScheduler();
    const secondGet = createDeferred<unknown>();
    let call = 0;
    const planeClient: StreamRelayDeps['planeClient'] = {
      instanceSnapshot: async () => {
        call += 1;
        if (call === 1) return snapshotBody(['a:b']); // start()
        if (call === 2) return secondGet.promise; // recovery attempt 1 — held
        return snapshotBody(['a:b', 'z:z']); // recovery attempt 2 succeeds
      },
    };
    const relay = createStreamRelay({ planeClient, connectUpstream, scheduleReconnect });

    await relay.start();

    const events: RelayEvent[] = [];
    relay.subscribe((event) => events.push(event));

    const firstConn = connections[0];
    if (firstConn === undefined) throw new Error('expected a start connection');
    firstConn.handlers.onDrop(); // live drop -> recovery attempt 1 opens conn#2, buffers

    const secondConn = connections[1];
    if (secondConn === undefined) throw new Error('expected a recovery connection');
    // conn#2 buffers a delta, then DROPS before its snapshot resolves.
    secondConn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: 'buffered:x' } });
    secondConn.handlers.onDrop(); // buffering drop -> attempt aborted

    secondGet.resolve(snapshotBody(['a:b'])); // resolves AFTER the abort
    await flushAsync(); // resync sees the abort -> throws -> retry scheduled

    expect(pending.length).toBe(1);
    expect(secondConn.closed).toBe(true); // the abandoned attempt's connection is closed
    // conn#2 never went live: neither its buffered delta nor a snapshot from it
    // reached the subscriber.
    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
    ]);

    await flushOne(); // recovery attempt 2 opens conn#3, GET succeeds -> live

    const thirdConn = connections[2];
    if (thirdConn === undefined) throw new Error('expected a fresh recovery connection');
    // Exactly one live upstream: only the fresh conn#3 is open.
    expect(firstConn.closed).toBe(true);
    expect(secondConn.closed).toBe(true);
    expect(thirdConn.closed).toBe(false);
    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
      { kind: 'snapshot', instances: [{ id: 'a:b' }, { id: 'z:z' }] },
    ]);
  });

  it('caps the pre-live buffer so a wedged snapshot GET cannot leak unbounded memory (self red-team)', async () => {
    // Round-0 self red-team: if the authoritative snapshot GET hangs, the
    // subscribe-first buffer would grow without bound. The cap aborts the
    // attempt (freeing the buffer, closing the connection) so the caller retries
    // with a fresh connection instead of accumulating memory forever.
    const { connectUpstream, connections } = createFakeUpstream();
    const hung = createDeferred<unknown>();
    const planeClient: StreamRelayDeps['planeClient'] = {
      instanceSnapshot: async () => hung.promise, // start's snapshot never resolves
    };
    const relay = createStreamRelay({ planeClient, connectUpstream, maxBufferedDeltas: 3 });

    const startResult = relay.start();

    const conn = connections[0];
    if (conn === undefined) throw new Error('expected a buffering connection');
    // Flood the buffer past the cap while the snapshot GET is wedged.
    for (let i = 0; i < 6; i += 1) {
      conn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: `flood:${i}` } });
    }
    // Overflow aborted the attempt and closed the connection (bounded memory).
    expect(conn.closed).toBe(true);

    // Unwedging the GET does not resurrect the aborted attempt: it rejects so
    // the boot/reconnect retry opens a fresh one.
    hung.resolve(snapshotBody(['late']));
    await expect(startResult).rejects.toThrow();
  });
});

describe('stream-relay — broadcast isolates a throwing subscriber (AUDIT-20260725-02)', () => {
  it('a subscriber that throws does not abort delivery to the others and does not propagate', async () => {
    const { connectUpstream, connections } = createFakeUpstream();
    const { planeClient } = createFakePlaneClient([snapshotBody(['a:b'])]);
    const relay = createStreamRelay({ planeClient, connectUpstream });

    await relay.start();

    // First subscriber throws synchronously on every event (models a severed
    // SSE response whose next write emits EPIPE/ECONNRESET).
    relay.subscribe(() => {
      throw new Error('severed SSE write (EPIPE)');
    });
    const goodEvents: RelayEvent[] = [];
    relay.subscribe((event) => goodEvents.push(event));

    const conn = connections[0];
    if (conn === undefined) throw new Error('expected one upstream connection');

    expect(() =>
      conn.handlers.onDelta({ kind: 'instance-upserted', instance: { id: 'c:d' } }),
    ).not.toThrow();

    expect(goodEvents).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'delta', delta: { kind: 'instance-upserted', instance: { id: 'c:d' } } },
    ]);
  });
});
