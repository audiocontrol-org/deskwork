/**
 * Fleet Dashboard BFF — Stream Relay model (T013)
 *
 * The pure, stateless half of the stream relay: the event / delta vocabulary,
 * the upstream-connection DI seams, runtime validation of unknown upstream
 * JSON, and the two folds (`extractInstances`, `applyDelta`) the stateful
 * relay ({@link module:stream-relay}) builds its in-memory `FleetView` from.
 *
 * Split out of `stream-relay.ts` so the stateful relay stays well under the
 * project's 300–500 line file cap once the buffered-reconcile resync
 * (AUDIT-20260725-06) is added, and so these decidable, side-effect-free
 * pieces are directly unit-testable. `stream-relay.ts` re-exports this
 * module's public surface, so existing importers (`plane-stream-connector.ts`,
 * `routes.ts`, tests) are unaffected.
 *
 * Per FR-017 the instance payload carried on a delta / in a snapshot is passed
 * through VERBATIM — the same "no reshaping, no new projection" discipline
 * `plane-client.ts` follows. Since that payload originates as unknown upstream
 * JSON, it is represented as {@link FleetInstanceRecord} (an opaque record with
 * a validated `id` field) rather than importing the plane's internal
 * `InstanceState` type — this package has no dependency on `src/plane/*` (R5).
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

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
 * relay holds. Called once per resync attempt (initial start + each post-drop
 * reconnect) — NEVER once per browser subscriber (research R1's fan-out
 * invariant is structural: `subscribe()` never calls this). Per
 * AUDIT-20260725-06 the relay opens this connection BEFORE it reads the
 * authoritative snapshot, so no delta between the two boundaries is lost. */
export type ConnectUpstream = (handlers: UpstreamHandlers) => UpstreamConnection;

/**
 * Schedules a post-drop reconnect retry after the relay's retry interval and
 * returns a canceller.
 *
 * This is the DI seam that makes drop-recovery deterministically testable
 * (AUDIT-20260725-01/03): production wiring omits it and gets the
 * `setTimeout`-backed default — mirroring `index.ts`'s boot-time
 * `RELAY_RETRY_INTERVAL_MS` cadence — while tests inject a manually-pumped
 * scheduler so `drop -> reject -> retry -> success` is driven without real
 * timers.
 *
 * The returned canceller MUST make `retry` un-fireable so `stop()` can cancel
 * a pending retry — no leaked timer, no retry after teardown. This is NOT a
 * fallback/mock: it is a real, named dependency whose only default is the
 * production `setTimeout` implementation.
 */
export type ScheduleReconnect = (retry: () => void) => () => void;

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
export function extractInstances(body: unknown): readonly FleetInstanceRecord[] {
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

/**
 * Fold one {@link InstanceDelta} onto the current instance list, keyed by
 * instance id. `instance-upserted` overwrites (or appends) by id;
 * `instance-removed` deletes by id. Both are IDEMPOTENT — re-applying a delta
 * the current list already reflects is a harmless no-op — which is exactly
 * what makes the buffered-reconcile safe: folding a buffered delta that the
 * authoritative snapshot already captured cannot corrupt the view, while a
 * delta the snapshot missed is captured (AUDIT-20260725-06).
 */
export function applyDelta(
  instances: readonly FleetInstanceRecord[],
  delta: InstanceDelta,
): readonly FleetInstanceRecord[] {
  if (delta.kind === 'instance-upserted') {
    const withoutExisting = instances.filter((instance) => instance.id !== delta.instance.id);
    return [...withoutExisting, delta.instance];
  }
  return instances.filter((instance) => instance.id !== delta.id);
}
