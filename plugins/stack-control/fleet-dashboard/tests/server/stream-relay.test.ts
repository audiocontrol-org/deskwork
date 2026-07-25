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

      // Still on the original (dead) connection — no reconnect yet — and a
      // retry has been scheduled rather than the rejection being lost.
      expect(connections).toHaveLength(1);
      expect(pending.length).toBe(1);
      expect(calls.length).toBe(2);

      await flushOne(); // second attempt rejects, reschedules
      expect(connections).toHaveLength(1);
      expect(pending.length).toBe(1);
      expect(calls.length).toBe(3);

      await flushOne(); // third attempt succeeds -> fresh snapshot + reconnect
      expect(connections).toHaveLength(2);
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
    // reconnects or re-fetches after stop.
    expect(pending.length).toBe(0);
    await flushAsync();
    expect(connections).toHaveLength(1);
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
    // or open a fresh upstream connection.
    expect(connections).toHaveLength(1);
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

    expect(connections).toHaveLength(2);
    expect(events).toEqual([
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
      { kind: 'disconnected' },
      { kind: 'delta', delta: { kind: 'instance-upserted', instance: { id: 'ghost:1' } } },
      { kind: 'snapshot', instances: [{ id: 'a:b' }] },
    ]);
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
