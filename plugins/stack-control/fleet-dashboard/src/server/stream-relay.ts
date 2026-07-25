/**
 * Fleet Dashboard BFF — Stream Relay (T013)
 *
 * Holds the dashboard's ONE upstream connection to the plane's
 * `GET /v1/instances/stream` SSE route and fans it out to every connected
 * browser subscriber (research.md R1) — never one upstream connection per
 * browser. Each subscriber gets an initial snapshot (the current in-memory
 * `FleetView`, data-model.md) followed by incremental deltas as they arrive
 * (FR-015). When the single upstream connection drops, every subscriber is
 * told so immediately, the relay reconnects and re-fetches a fresh snapshot
 * from the plane (via {@link PlaneClient.instanceSnapshot}), and that fresh
 * snapshot fans out to every still-connected subscriber (FR-016) — a resync,
 * never a silent gap.
 *
 * Ordering discipline (AUDIT-20260725-06): a resync opens the upstream SSE
 * FIRST and BUFFERS every delta it emits — including the plane stream's own
 * opening snapshot-as-deltas burst — WITHOUT applying/broadcasting them yet.
 * It THEN reads the authoritative snapshot (GET /v1/instances), seeds the
 * in-memory map from it, and FOLDS the buffered deltas on top before going
 * live. Because the stream is subscribed before the snapshot is read, no plane
 * event committed around the snapshot boundary can fall into a gap between the
 * two channels; and because deltas are keyed by instance id, folding a
 * buffered delta the snapshot already reflects is a harmless idempotent
 * overwrite (see {@link applyDelta}). The same resync backs both initial
 * `start()` and post-drop recovery, so both first-load and reconnect close the
 * gap.
 *
 * Both the upstream connection ({@link ConnectUpstream}) and the plane client
 * are injected (composition, interface-first DI — mirrors `plane-client.ts`'s
 * `PlaneClientDeps`), so the fan-out/reconnect logic in this module is fully
 * testable without real network I/O or real timers:
 * `tests/server/stream-relay.test.ts` (T012) drives drop/reconnect by calling
 * the injected handlers directly. The REAL, network-backed `ConnectUpstream`
 * lives in `plane-stream-connector.ts`. The pure event/delta vocabulary,
 * validation and folds live in `stream-relay-model.ts` (re-exported below so
 * existing importers are unaffected).
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

import type { PlaneClient } from './plane-client.js';
import {
  applyDelta,
  extractInstances,
  StreamRelayError,
  type ConnectUpstream,
  type FleetInstanceRecord,
  type InstanceDelta,
  type RelayEvent,
  type ScheduleReconnect,
  type UpstreamConnection,
  type UpstreamHandlers,
} from './stream-relay-model.js';

export {
  applyDelta,
  extractInstances,
  isInstanceDelta,
  StreamRelayError,
} from './stream-relay-model.js';
export type {
  ConnectUpstream,
  FleetInstanceRecord,
  InstanceDelta,
  RelayEvent,
  ScheduleReconnect,
  UpstreamConnection,
  UpstreamHandlers,
} from './stream-relay-model.js';

/** Dependencies for {@link createStreamRelay}. `planeClient` /
 * `connectUpstream` are supplied by the caller (composition/DI, mirroring
 * `PlaneClientDeps`); `scheduleReconnect` / `maxBufferedDeltas` are optional
 * DI seams that default to production values. */
export interface StreamRelayDeps {
  /** Only the re-snapshot read is needed here — narrowed via `Pick` so this
   * module's dependency on `PlaneClient` is exactly the one method it
   * calls, not the whole six-method surface. */
  readonly planeClient: Pick<PlaneClient, 'instanceSnapshot'>;
  readonly connectUpstream: ConnectUpstream;
  /** Optional DI seam for the post-drop reconnect retry cadence; defaults to
   * a `setTimeout`-backed scheduler. See {@link ScheduleReconnect}. */
  readonly scheduleReconnect?: ScheduleReconnect;
  /** Optional cap on how many upstream deltas a single resync will buffer
   * while awaiting the authoritative snapshot (AUDIT-20260725-06 self
   * red-team: a hung snapshot GET must not let the pre-live buffer grow
   * without bound). On overflow the resync attempt is aborted and retried
   * with a fresh connection rather than accumulating unbounded memory.
   * Defaults to {@link DEFAULT_MAX_BUFFERED_DELTAS}. */
  readonly maxBufferedDeltas?: number;
}

/** Interval between post-drop reconnect resync attempts, mirroring
 * `index.ts`'s boot-time `RELAY_RETRY_INTERVAL_MS`. */
const RECONNECT_RETRY_INTERVAL_MS = 5000;

/** Default ceiling on deltas buffered during one resync's subscribe-before-
 * snapshot window. Large enough that a healthy fleet's opening burst plus
 * any churn during a single snapshot round-trip fits comfortably; small
 * enough that a wedged snapshot GET cannot leak unbounded memory. */
const DEFAULT_MAX_BUFFERED_DELTAS = 100_000;

/** The production {@link ScheduleReconnect}: a real `setTimeout`, cancellable
 * via the returned `clearTimeout` closure. */
const defaultScheduleReconnect: ScheduleReconnect = (retry) => {
  const handle = setTimeout(retry, RECONNECT_RETRY_INTERVAL_MS);
  return (): void => {
    clearTimeout(handle);
  };
};

export interface RelaySubscription {
  readonly unsubscribe: () => void;
}

export interface StreamRelay {
  /** Opens the single upstream connection, buffers its opening burst, reads
   * the authoritative snapshot, reconciles, and goes live. Callers
   * (production wiring, tests) call this once before relying on `subscribe()`
   * to deliver anything. Rejects on failure so `index.ts`'s boot-time retry
   * can back off. */
  start(): Promise<void>;
  /** Register a browser-facing subscriber. If the initial snapshot has
   * already landed, `onEvent` is invoked synchronously with the current
   * `snapshot` before `subscribe()` returns; otherwise the subscriber
   * receives it once `start()`'s resync completes. Live `delta` /
   * `disconnected` / re-`snapshot` events follow in order. */
  subscribe(onEvent: (event: RelayEvent) => void): RelaySubscription;
  /** Tears down the current upstream connection (test/shutdown). */
  stop(): void;
}

// ---------------------------------------------------------------------------
// The relay.
// ---------------------------------------------------------------------------

/**
 * One subscribe-buffer-snapshot-reconcile attempt's state. While `live` is
 * false, every upstream delta is buffered rather than applied; the attempt's
 * `connection` is the upstream it owns; `aborted` records that the connection
 * dropped (or the buffer overflowed) before reconcile, so the awaiting resync
 * abandons this attempt instead of going live on a dead/stale connection.
 */
interface ResyncEpisode {
  readonly buffer: InstanceDelta[];
  live: boolean;
  aborted: boolean;
  connection: UpstreamConnection | undefined;
}

/**
 * Build a {@link StreamRelay}. Nothing async happens until `start()` is
 * called — no implicit fire-and-forget work in the constructor — so both
 * production wiring and tests control exactly when the upstream connect +
 * snapshot fetch fire.
 */
export function createStreamRelay(deps: StreamRelayDeps): StreamRelay {
  const scheduleReconnect = deps.scheduleReconnect ?? defaultScheduleReconnect;
  const maxBufferedDeltas = deps.maxBufferedDeltas ?? DEFAULT_MAX_BUFFERED_DELTAS;
  const listeners = new Set<(event: RelayEvent) => void>();
  let currentInstances: readonly FleetInstanceRecord[] = [];
  let ready = false;
  // The episode that currently owns the live/buffering upstream connection.
  let activeEpisode: ResyncEpisode | undefined;
  // Drop-recovery state (AUDIT-20260725-01/03): `reconnecting` guards against
  // a concurrent live `onDrop` spawning a parallel retry loop; `stopped` makes
  // a teardown cancel every in-flight/pending recovery; `cancelPendingRetry`
  // cancels a scheduled-but-not-yet-fired retry from `stop()`.
  let reconnecting = false;
  let stopped = false;
  let cancelPendingRetry: (() => void) | undefined;

  /**
   * Deliver one event to one listener with full isolation (AUDIT-20260725-02):
   * a subscriber throwing (classically a severed SSE response whose next write
   * emits EPIPE/ECONNRESET) must NEVER propagate up to become an uncaught
   * exception that kills the whole BFF process for every connected dashboard,
   * and — in {@link broadcast}'s fan-out — must never abort delivery to the
   * remaining subscribers. Used both by the fan-out loop AND by `subscribe()`'s
   * synchronous initial-snapshot delivery. Log and continue.
   */
  function deliver(listener: (event: RelayEvent) => void, event: RelayEvent): void {
    try {
      listener(event);
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error(
        `stream-relay: a subscriber threw while receiving a "${event.kind}" event ` +
          `(continuing): ${String(err)}`,
      );
    }
  }

  function broadcast(event: RelayEvent): void {
    for (const listener of listeners) {
      deliver(listener, event);
    }
  }

  /**
   * A live upstream connection dropped (FR-016). This is the ONLY drop path
   * that surfaces `disconnected` and starts recovery; a drop during an
   * episode's pre-live buffering window is handled inline by that episode's
   * handlers (it just aborts the in-flight attempt, which the retry loop
   * re-drives). A drop that arrives while a reconnect loop already owns
   * recovery must NOT re-broadcast or spawn a second loop; a drop after
   * `stop()` is ignored (a deliberate teardown is not a recoverable outage).
   */
  function handleLiveDrop(): void {
    if (reconnecting || stopped) {
      return;
    }
    ready = false;
    broadcast({ kind: 'disconnected' });
    reconnecting = true;
    attemptReconnect();
  }

  /**
   * Open a fresh upstream connection and start BUFFERING its deltas (including
   * the plane stream's opening snapshot-as-deltas burst) — the subscribe-first
   * half of the gap-closing resync (AUDIT-20260725-06). The previous
   * connection, if any, is closed first so exactly one upstream connection is
   * ever open. Returns the episode the caller reconciles + promotes to live.
   */
  function openBufferingEpisode(): ResyncEpisode {
    activeEpisode?.connection?.close();
    const episode: ResyncEpisode = { buffer: [], live: false, aborted: false, connection: undefined };
    const handlers: UpstreamHandlers = {
      onDelta(delta: InstanceDelta): void {
        if (episode.live) {
          currentInstances = applyDelta(currentInstances, delta);
          broadcast({ kind: 'delta', delta });
          return;
        }
        if (episode.aborted) {
          return;
        }
        episode.buffer.push(delta);
        if (episode.buffer.length > maxBufferedDeltas) {
          // Self red-team: a wedged snapshot GET must not let the pre-live
          // buffer grow without bound. Abort this attempt (free the buffer,
          // drop the connection); the awaiting resync sees `aborted` and the
          // retry loop opens a fresh one.
          episode.aborted = true;
          episode.buffer.length = 0;
          episode.connection?.close();
        }
      },
      onDrop(): void {
        if (episode.live) {
          handleLiveDrop();
          return;
        }
        // Dropped while still buffering (plane flapping): mark the attempt so
        // the in-flight resync abandons it rather than going live on a corpse.
        episode.aborted = true;
      },
    };
    const connection = deps.connectUpstream(handlers);
    episode.connection = connection;
    // The overflow / buffering-drop branch above may have fired synchronously
    // during connect (before `connection` was assigned); honour it now.
    if (episode.aborted) {
      connection.close();
    }
    activeEpisode = episode;
    return episode;
  }

  /**
   * One subscribe-buffer-snapshot-reconcile attempt. Opens + buffers the
   * upstream, reads the authoritative snapshot, folds the buffered deltas onto
   * it, then goes live and broadcasts the reconciled snapshot. Any failure
   * after the connection is opened closes it (no leaked upstream) and rejects,
   * so the caller (`start()`'s boot retry, or the post-drop {@link
   * attemptReconnect} loop) opens a fresh attempt.
   */
  async function resync(): Promise<void> {
    const episode = openBufferingEpisode();
    try {
      const body = await deps.planeClient.instanceSnapshot();
      if (stopped) {
        // A teardown raced this in-flight snapshot fetch — do NOT go live or
        // broadcast after stop (channel: reconnect-after-stop).
        episode.connection?.close();
        return;
      }
      if (activeEpisode !== episode || episode.aborted) {
        // The connection this attempt opened dropped (or overflowed) before we
        // could reconcile, or a newer attempt superseded it — never go live on
        // a dead/stale connection.
        throw new StreamRelayError(
          'stream-relay: upstream connection dropped before snapshot reconcile — retrying',
        );
      }
      // Seed from the authoritative snapshot, then fold the buffered deltas on
      // top (idempotent by id) so any event around the snapshot boundary is
      // captured (AUDIT-20260725-06).
      let reconciled = extractInstances(body);
      for (const delta of episode.buffer) {
        reconciled = applyDelta(reconciled, delta);
      }
      currentInstances = reconciled;
      episode.buffer.length = 0;
      episode.live = true;
      ready = true;
      broadcast({ kind: 'snapshot', instances: currentInstances });
    } catch (err: unknown) {
      // Any failure after we opened the buffering connection must close it so a
      // failed/aborted resync never leaks an upstream connection.
      episode.connection?.close();
      if (activeEpisode === episode) {
        activeEpisode = undefined;
      }
      throw err;
    }
  }

  /**
   * Drive one post-drop resync attempt, RETRYING on failure instead of
   * firing-and-forgetting (AUDIT-20260725-01/03). The most likely trigger of
   * a drop is the plane restarting / being briefly unreachable, so the very
   * first attempt often hits the still-down plane and rejects; catching that
   * rejection and retrying on an interval (mirroring `index.ts`'s boot-time
   * retry loop) is what makes FR-016's "recovers on reconnect" hold — instead
   * of crashing (an unhandled rejection, fatal since Node 15) or stalling
   * forever (`ready` stuck `false`, no subscriber ever re-snapshotted).
   */
  function attemptReconnect(): void {
    if (stopped) {
      reconnecting = false;
      return;
    }
    resync().then(
      () => {
        // Success (or a stop()-short-circuited resync): recovery is over.
        reconnecting = false;
        cancelPendingRetry = undefined;
      },
      (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error(
          `stream-relay: post-drop resync failed (retrying in ` +
            `${RECONNECT_RETRY_INTERVAL_MS}ms): ${String(err)}`,
        );
        if (stopped) {
          reconnecting = false;
          return;
        }
        cancelPendingRetry = scheduleReconnect(() => {
          cancelPendingRetry = undefined;
          attemptReconnect();
        });
      },
    );
  }

  return {
    start(): Promise<void> {
      // `start()` intentionally uses the throwing `resync()` directly (NOT the
      // retrying loop): `index.ts`'s `startRelayResilient` owns the boot-time
      // retry, and it relies on `start()` rejecting so it can back off. The
      // internal retry loop covers only the post-drop path.
      return resync();
    },
    subscribe(onEvent: (event: RelayEvent) => void): RelaySubscription {
      listeners.add(onEvent);
      if (ready) {
        deliver(onEvent, { kind: 'snapshot', instances: currentInstances });
      }
      return {
        unsubscribe(): void {
          listeners.delete(onEvent);
        },
      };
    },
    stop(): void {
      stopped = true;
      // Cancel any scheduled-but-not-yet-fired reconnect retry so `stop()`
      // leaves no leaked timer and no retry fires after teardown.
      if (cancelPendingRetry !== undefined) {
        cancelPendingRetry();
        cancelPendingRetry = undefined;
      }
      reconnecting = false;
      activeEpisode?.connection?.close();
      activeEpisode = undefined;
    },
  };
}
