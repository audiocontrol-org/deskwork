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
 * Both the upstream connection ({@link ConnectUpstream}) and the plane
 * client are injected (composition, interface-first DI — mirrors
 * `plane-client.ts`'s `PlaneClientDeps`), so the fan-out/reconnect logic in
 * this module is fully testable without real network I/O or real timers:
 * `tests/server/stream-relay.test.ts` (T012) drives drop/reconnect by
 * calling the injected handlers directly. The REAL, network-backed
 * `ConnectUpstream` lives in `plane-stream-connector.ts` — kept in its own
 * file so this module stays under the project's 300–500 line file cap and
 * so the fan-out logic never depends on `fetch`/SSE-framing details.
 *
 * Per FR-017 the instance payload carried on a delta / in a snapshot is
 * passed through VERBATIM — the same "no reshaping, no new projection"
 * discipline `plane-client.ts` follows for its return values. Since that
 * payload originates as unknown upstream JSON, it is represented as
 * {@link FleetInstanceRecord} (an opaque record with a validated `id`
 * field) rather than importing the plane's internal `InstanceState` type —
 * this package has no dependency on `src/plane/*` (R5: the dashboard is a
 * standalone subtree that will spin out of this repository).
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

import type { PlaneClient } from './plane-client.js';

/** Raised for a malformed upstream response this relay cannot silently
 * absorb (e.g. a plane snapshot body missing its `instances` array, or an
 * instance entry missing a string `id`). Never a fallback — a malformed
 * upstream shape is a bug to surface loudly, not paper over. */
export class StreamRelayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamRelayError';
  }
}

/** An opaque plane instance record, passed through verbatim (FR-017) except
 * for the one field this module needs to key its in-memory `FleetView` by:
 * a validated string `id`. */
export interface FleetInstanceRecord {
  readonly id: string;
  readonly [key: string]: unknown;
}

/**
 * The instance-stream delta vocabulary (mirrors the plane's own
 * `InstanceDelta`, src/plane/http/instance-api.ts, by kind name — but
 * defined independently here since this package does not import
 * `src/plane/*` types, R5).
 */
export type InstanceDelta =
  | { readonly kind: 'instance-upserted'; readonly instance: FleetInstanceRecord }
  | { readonly kind: 'instance-removed'; readonly id: string };

/** The event vocabulary a relay subscriber receives, in order: exactly one
 * `snapshot` before any `delta` (FR-015); a `disconnected` when the single
 * upstream connection drops, immediately followed (once the resync
 * completes) by a fresh `snapshot` that resumes the same ordering guarantee
 * (FR-016). */
export type RelayEvent =
  | { readonly kind: 'snapshot'; readonly instances: readonly FleetInstanceRecord[] }
  | { readonly kind: 'delta'; readonly delta: InstanceDelta }
  | { readonly kind: 'disconnected' };

/**
 * The handlers a {@link ConnectUpstream} implementation drives. `onDrop`
 * MUST fire AT MOST ONCE per `connectUpstream()` call, and MUST NOT fire
 * after the connection's `close()` was called (a deliberate teardown is not
 * a drop) — mirrors the sidecar SSE client's `onClosed` contract
 * (src/sidecar/uplink/sse-client.ts).
 */
export interface UpstreamHandlers {
  readonly onDelta: (delta: InstanceDelta) => void;
  readonly onDrop: () => void;
}

/** A live upstream connection handle. `close()` is idempotent-safe and,
 * per the {@link UpstreamHandlers} contract, suppresses any further
 * `onDrop()` from this connection. */
export interface UpstreamConnection {
  close(): void;
}

/** The DI seam for the ONE upstream `/v1/instances/stream` connection this
 * relay holds. Called exactly once on `start()` and once more per
 * reconnect after a drop — NEVER once per browser subscriber (research
 * R1's fan-out invariant is structural: `subscribe()` never calls this). */
export type ConnectUpstream = (handlers: UpstreamHandlers) => UpstreamConnection;

/**
 * Schedules a post-drop reconnect retry after the relay's retry interval and
 * returns a canceller.
 *
 * This is the DI seam that makes drop-recovery deterministically testable
 * (AUDIT-20260725-01/03): production wiring omits it and gets the
 * {@link defaultScheduleReconnect} `setTimeout`-backed default — mirroring
 * `index.ts`'s boot-time `RELAY_RETRY_INTERVAL_MS` cadence — while tests
 * inject a manually-pumped scheduler so `drop -> reject -> retry -> success`
 * is driven without real timers.
 *
 * The returned canceller MUST make `retry` un-fireable so `stop()` can cancel
 * a pending retry — no leaked timer, no retry after teardown. This is NOT a
 * fallback/mock: it is a real, named dependency whose only default is the
 * production `setTimeout` implementation.
 */
export type ScheduleReconnect = (retry: () => void) => () => void;

/** Dependencies for {@link createStreamRelay}. `planeClient` /
 * `connectUpstream` are supplied by the caller (composition/DI, mirroring
 * `PlaneClientDeps`); `scheduleReconnect` is an optional DI seam that
 * defaults to the production `setTimeout`-backed scheduler. */
export interface StreamRelayDeps {
  /** Only the re-snapshot read is needed here — narrowed via `Pick` so this
   * module's dependency on `PlaneClient` is exactly the one method it
   * calls, not the whole six-method surface. */
  readonly planeClient: Pick<PlaneClient, 'instanceSnapshot'>;
  readonly connectUpstream: ConnectUpstream;
  /** Optional DI seam for the post-drop reconnect retry cadence; defaults to
   * a `setTimeout`-backed scheduler. See {@link ScheduleReconnect}. */
  readonly scheduleReconnect?: ScheduleReconnect;
}

/** Interval between post-drop reconnect resync attempts, mirroring
 * `index.ts`'s boot-time `RELAY_RETRY_INTERVAL_MS`. */
const RECONNECT_RETRY_INTERVAL_MS = 5000;

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
  /** Fetches the initial snapshot and opens the single upstream
   * connection. Callers (production wiring, tests) call this once before
   * relying on `subscribe()` to deliver anything. */
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
// Runtime validation of unknown upstream JSON (no `any`, no `as`).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFleetInstanceRecord(value: unknown): value is FleetInstanceRecord {
  return isRecord(value) && typeof value.id === 'string';
}

/**
 * Whether `value` is a well-formed {@link InstanceDelta}. Exported so the
 * real, network-backed connector (`plane-stream-connector.ts`) can validate
 * every frame it parses off the wire before ever calling `onDelta` — a
 * malformed upstream frame is dropped there, never forwarded downstream.
 */
export function isInstanceDelta(value: unknown): value is InstanceDelta {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'instance-upserted') {
    return isFleetInstanceRecord(value.instance);
  }
  if (value.kind === 'instance-removed') {
    return typeof value.id === 'string';
  }
  return false;
}

/** Extract + validate the `instances` array out of a plane
 * `GET /v1/instances` response body (returned as `unknown` by
 * `PlaneClient.instanceSnapshot`, FR-017 — no reshaping). Throws
 * {@link StreamRelayError} on any malformed shape rather than silently
 * dropping or coercing entries. */
function extractInstances(body: unknown): readonly FleetInstanceRecord[] {
  if (!isRecord(body) || !Array.isArray(body.instances)) {
    throw new StreamRelayError(
      'stream-relay: plane instance snapshot response is missing an "instances" array',
    );
  }
  const instances: FleetInstanceRecord[] = [];
  for (const entry of body.instances) {
    if (!isFleetInstanceRecord(entry)) {
      throw new StreamRelayError(
        'stream-relay: plane instance snapshot entry is missing a string "id" field',
      );
    }
    instances.push(entry);
  }
  return instances;
}

// ---------------------------------------------------------------------------
// The relay.
// ---------------------------------------------------------------------------

function applyDelta(
  instances: readonly FleetInstanceRecord[],
  delta: InstanceDelta,
): readonly FleetInstanceRecord[] {
  if (delta.kind === 'instance-upserted') {
    const withoutExisting = instances.filter((instance) => instance.id !== delta.instance.id);
    return [...withoutExisting, delta.instance];
  }
  return instances.filter((instance) => instance.id !== delta.id);
}

/**
 * Build a {@link StreamRelay}. Nothing async happens until `start()` is
 * called — no implicit fire-and-forget work in the constructor — so both
 * production wiring and tests control exactly when the initial snapshot
 * fetch + upstream connect fire.
 */
export function createStreamRelay(deps: StreamRelayDeps): StreamRelay {
  const scheduleReconnect = deps.scheduleReconnect ?? defaultScheduleReconnect;
  const listeners = new Set<(event: RelayEvent) => void>();
  let currentInstances: readonly FleetInstanceRecord[] = [];
  let ready = false;
  let upstreamConnection: UpstreamConnection | undefined;
  // Drop-recovery state (AUDIT-20260725-01/03): `reconnecting` guards against
  // a concurrent `onDrop` spawning a parallel retry loop; `stopped` makes a
  // teardown cancel every in-flight/pending recovery; `cancelPendingRetry`
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
   * synchronous initial-snapshot delivery (which does not go through
   * `broadcast`), so neither path can be crashed by a bad listener. Log and
   * continue.
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

  const handlers: UpstreamHandlers = {
    onDelta(delta: InstanceDelta): void {
      currentInstances = applyDelta(currentInstances, delta);
      broadcast({ kind: 'delta', delta });
    },
    onDrop(): void {
      // AUDIT-20260725-01/03: a drop that arrives while a reconnect loop
      // already owns recovery must NOT re-broadcast `disconnected` or spawn a
      // second, parallel retry loop — and a drop after `stop()` is ignored
      // entirely (a deliberate teardown is not a recoverable outage).
      if (reconnecting || stopped) {
        return;
      }
      ready = false;
      broadcast({ kind: 'disconnected' });
      reconnecting = true;
      attemptReconnect();
    },
  };

  async function resync(): Promise<void> {
    const body = await deps.planeClient.instanceSnapshot();
    if (stopped) {
      // A teardown (`stop()`) raced this in-flight snapshot fetch — do NOT
      // re-arm `ready`, broadcast, or open a fresh upstream connection after
      // stop (channel: reconnect-after-stop).
      return;
    }
    currentInstances = extractInstances(body);
    ready = true;
    broadcast({ kind: 'snapshot', instances: currentInstances });
    // Defensive: an upstream that reported its own drop is already dead,
    // but closing it again before replacing it is a harmless no-op per the
    // `UpstreamConnection.close()` contract, and keeps exactly one live
    // connection reference at all times.
    upstreamConnection?.close();
    upstreamConnection = deps.connectUpstream(handlers);
  }

  /**
   * Drive one post-drop resync attempt, RETRYING on failure instead of
   * firing-and-forgetting (AUDIT-20260725-01/03). The most likely trigger of
   * a drop is the plane restarting / being briefly unreachable, so the very
   * first re-snapshot often hits the still-down plane and rejects; catching
   * that rejection and retrying on an interval (mirroring `index.ts`'s
   * boot-time retry loop) is what makes FR-016's "recovers on reconnect" hold
   * — instead of crashing (an unhandled rejection, fatal since Node 15) or
   * stalling forever (`ready` stuck `false`, no subscriber ever re-snapshotted).
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
      upstreamConnection?.close();
    },
  };
}
