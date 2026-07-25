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

/** Dependencies for {@link createStreamRelay}. Both are supplied by the
 * caller (composition/DI), mirroring `PlaneClientDeps`. */
export interface StreamRelayDeps {
  /** Only the re-snapshot read is needed here — narrowed via `Pick` so this
   * module's dependency on `PlaneClient` is exactly the one method it
   * calls, not the whole six-method surface. */
  readonly planeClient: Pick<PlaneClient, 'instanceSnapshot'>;
  readonly connectUpstream: ConnectUpstream;
}

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
  const listeners = new Set<(event: RelayEvent) => void>();
  let currentInstances: readonly FleetInstanceRecord[] = [];
  let ready = false;
  let upstreamConnection: UpstreamConnection | undefined;

  function broadcast(event: RelayEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  const handlers: UpstreamHandlers = {
    onDelta(delta: InstanceDelta): void {
      currentInstances = applyDelta(currentInstances, delta);
      broadcast({ kind: 'delta', delta });
    },
    onDrop(): void {
      ready = false;
      broadcast({ kind: 'disconnected' });
      // Fire-and-forget from the DI contract's perspective (`onDrop` is
      // `() => void`, mirroring every other close-callback in this
      // codebase, src/sidecar/uplink/sse-client.ts's `onClosed`) — the
      // resync's own completion is what re-arms `ready` and broadcasts the
      // fresh snapshot; tests await it by draining the microtask queue
      // (`flushAsync`), never a real timer.
      void resync();
    },
  };

  async function resync(): Promise<void> {
    const body = await deps.planeClient.instanceSnapshot();
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

  return {
    start(): Promise<void> {
      return resync();
    },
    subscribe(onEvent: (event: RelayEvent) => void): RelaySubscription {
      listeners.add(onEvent);
      if (ready) {
        onEvent({ kind: 'snapshot', instances: currentInstances });
      }
      return {
        unsubscribe(): void {
          listeners.delete(onEvent);
        },
      };
    },
    stop(): void {
      upstreamConnection?.close();
    },
  };
}
