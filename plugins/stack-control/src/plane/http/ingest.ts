/**
 * specs/036-fleet-control-plane — T052 (impl), pairs with T052's RED test
 * (tests/fleet/ingest.test.ts).
 *
 * TELEMETRY INGEST — the plane's acceptance boundary for one raw inbound
 * event (contracts/sidecar-plane-protocol.md C1: telemetry travels
 * sidecar → plane as an HTTP POST; T051's `src/plane/http/server.ts`
 * router calls `ingestEvent` per POST body). data-model.md § Delivery
 * semantics (FR-043): transmission is at-least-once, so this boundary must
 * treat duplicated and reordered delivery as EXPECTED, not exceptional.
 *
 * FR-042 names four MUSTs for the plane: "deduplicate by `eventId`, MUST
 * NOT regress live registry state from an older sequence, MUST store late
 * events durably rather than discarding them, and MUST surface sequence
 * gaps diagnostically." This module covers the first three — dedupe,
 * no-regress, late-event durability — exactly this task's scope. The
 * fourth (gap surfacing) is `src/fleet/sequence.ts`'s `classifyGap` /
 * `classifyGapAt` (T019/T020, already implemented); this module does not
 * reimplement it.
 *
 * SCOPE BOUNDARY: this is the ingest DECISION boundary, not the B2 storage
 * adapter (T096) and not the http server/router (T051). The durable-store
 * WRITE for a late event is an injected seam (`DurableEventStore`) so this
 * task is fully testable against a fake — per data-model.md § Storage
 * layout: "A late event lands as a new object and triggers a new
 * derived-artifact revision — it never rewrites a stored object" (FR-066).
 * The key/revision mechanics of that promise are T093's job (Phase 5);
 * here only the hand-off happens.
 *
 * NO-REGRESS MODEL: this module tracks, per run, the highest
 * `invocationSequence` APPLIED and whether the run has already reached a
 * terminal lifecycle event (finalized). Two independent guards, checked in
 * this order:
 *
 *   1. **Finalized run** — once a run has emitted a terminal lifecycle
 *      event (`run.completed` / `run.failed` / `run.cancelled`), a FURTHER
 *      event for that run splits on whether it carries genuinely NEW
 *      information:
 *        - `invocationSequence` STRICTLY NEWER than what was applied by the
 *          time the run finalized: LATE (it arrived after the run already
 *          looks final AND was never previously observed) — handed to
 *          `DurableEventStore`, never applied to advance state, never
 *          silently discarded (FR-042).
 *        - `invocationSequence` no newer than what was already applied:
 *          ALREADY-SUPERSEDED — a reordered/duplicate delivery of something
 *          that occurred before the point this run is known to have
 *          reached. It is `accepted` (not late-stored, not discarded) since
 *          it cannot regress anything — `src/plane/registry.ts`'s own
 *          `applyRunEvent` no-regress guard independently prevents an older
 *          sequence from ever moving derived `executionStatus` backward —
 *          and its OTHER data (e.g. a `run.progress` tick's contribution to
 *          `progressEventCount`) is still legitimate to fold in (SC-015:
 *          duplicate + reordered delivery must land on the correct final
 *          state, not merely fail to regress it).
 *
 *   2. **Not-yet-finalized run** — an event whose `invocationSequence` is
 *      not STRICTLY newer than the run's applied high-water mark never
 *      advances state (mirrors `src/plane/registry.ts`'s `applyRunEvent`
 *      no-regress guard, FR-040/FR-042/SC-015). It is `stale` — a
 *      legitimate reordered/duplicate delivery, just not yet part of a
 *      known-final story, so (unlike the finalized case above) it is not
 *      folded in — not an error, not late-stored.
 *
 * Non-run events (`runId === null` — short verbs, heartbeats, FR-013/014)
 * carry no run state to regress; only dedupe applies to them.
 *
 * Fail loud (Principle V): a malformed raw event throws descriptively from
 * `validateTelemetryEvent` (event.ts) — this module never catches that and
 * silently drops the event.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
 * under node16 module resolution (no `@/` alias configured in this
 * plugin).
 */

import { validateTelemetryEvent, type TelemetryEvent } from '../../fleet/event.js';
import type { ClassifiedEvent } from '../registry.js';

/**
 * Run-lifecycle event types that FINALIZE a run (data-model.md § Command
 * state machine's sibling — run terminal states). Mirrors
 * `src/plane/registry.ts`'s `RUN_LIFECYCLE_STATUS` terminal entries
 * (`completed` | `failed` | `cancelled`); kept as an independent literal
 * set here rather than importing registry's derivation table, since this
 * module only needs "did this event finalize the run", not the full
 * type → `ExecutionStatus` mapping.
 */
const RUN_TERMINAL_EVENT_TYPES: ReadonlySet<string> = new Set([
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

/**
 * The durable-store hand-off seam (data-model.md § Storage layout). A
 * LATER task (T096) implements this against the vendor-free
 * `ObjectStorePort` (`src/storage/port.ts`) plus the key/revision
 * mechanics data-model.md § Storage layout pins (T093, Phase 5). Ingest
 * depends only on this capability — never on the storage vendor or the
 * revisioning mechanism, so this task is testable with an in-memory fake.
 */
export interface DurableEventStore {
  /**
   * Persist a late event durably. The adapter's contract (FR-066): never
   * rewrite a published object — a late event always lands as a NEW
   * object. This seam only hands the event off; the adapter owns how.
   */
  storeLateEvent(event: TelemetryEvent): Promise<void>;
}

/** Dependencies `ingestEvent` needs beyond its own bookkeeping state. */
export interface IngestDeps {
  readonly durableStore: DurableEventStore;
}

/** Per-run no-regress + finalization bookkeeping. */
interface RunIngestState {
  latestInvocationSequence: number;
  finalized: boolean;
}

/**
 * Mutable ingest bookkeeping: the dedupe set (FR-042 "deduplicate by
 * `eventId`") plus per-run no-regress/finalization state. Create with
 * `createIngestState()` — one instance per plane process (or per test);
 * `ingestEvent` mutates it in place across calls, mirroring how a real
 * HTTP router accumulates state across POSTs.
 *
 * `dedupeEnabled` records whether `ingestEvent` should consult/populate
 * `seenEventIds` at all (FR-042a — see `IngestStateOptions` below).
 * `seenEventIds` is still always PRESENT (never `undefined`) so a caller
 * with `dedupeEnabled: false` isn't forced into an optional-field dance —
 * it's simply never read or written by `ingestEvent` in that mode.
 */
export interface IngestState {
  readonly seenEventIds: Set<string>;
  readonly runs: Map<string, RunIngestState>;
  readonly dedupeEnabled: boolean;
}

/**
 * Options for `createIngestState`. `dedupe` defaults to `true` — every
 * existing zero-arg caller (including this module's own T052 suite) keeps
 * today's always-dedupe behavior unchanged.
 *
 * FR-042a: eventId dedupe is an OPTIMIZATION, not a correctness mechanism.
 * FR-042's no-regress rule (below) plus deterministic object naming
 * (FR-063) and byte-identity (FR-049) make ingestion correct with the
 * dedupe set entirely absent — `dedupe: false` exists so that claim is
 * provable, not just asserted (tests/fleet/dedupe-is-optional.test.ts,
 * T139).
 */
export interface IngestStateOptions {
  readonly dedupe?: boolean;
}

/** Construct a fresh, empty `IngestState`. */
export function createIngestState(options: IngestStateOptions = {}): IngestState {
  return {
    seenEventIds: new Set(),
    runs: new Map(),
    dedupeEnabled: options.dedupe ?? true,
  };
}

/**
 * The disposition of one ingested event. Every kind is a LEGITIMATE
 * outcome under at-least-once transmission (FR-043) — none of these
 * represent an error; a malformed event throws instead of producing an
 * outcome (fail loud, see module header).
 */
export type IngestOutcome =
  | { readonly kind: 'accepted'; readonly event: ClassifiedEvent }
  | { readonly kind: 'duplicate'; readonly eventId: string }
  | { readonly kind: 'stale'; readonly event: ClassifiedEvent }
  | { readonly kind: 'late'; readonly event: ClassifiedEvent };

function toClassifiedEvent(telemetryEvent: TelemetryEvent): ClassifiedEvent {
  const { envelope } = telemetryEvent;
  return {
    envelope,
    classification: envelope.classification,
    type: envelope.type,
  };
}

/**
 * Ingest one raw inbound telemetry event — the POST body T051's router
 * hands this, validated here, never trusted pre-validated (fail loud on
 * malformed, per Principle V). Dedupes by `eventId`, enforces no-regress,
 * and hands late events off to the injected durable store.
 *
 * Never throws on a well-formed-but-out-of-order or duplicate event —
 * those are legitimate outcomes under at-least-once transmission (FR-043),
 * modelled as `IngestOutcome` kinds, not errors. Only a genuinely
 * malformed payload throws (via `validateTelemetryEvent`).
 */
export async function ingestEvent(
  state: IngestState,
  deps: IngestDeps,
  raw: unknown,
): Promise<IngestOutcome> {
  const telemetryEvent = validateTelemetryEvent(raw);
  const { envelope } = telemetryEvent;

  // Idempotent ingestion (FR-042/FR-043): a re-delivered eventId is a
  // no-op, applied at most once. FR-042a: this short-circuit is an
  // OPTIMIZATION, not the correctness mechanism — with `dedupeEnabled:
  // false` it is skipped entirely, and the no-regress guard below (for run
  // events) or the absence of any guard (for non-run events, whose "only
  // guard" comment further down remains literally true when dedupe is on)
  // is left to determine the outcome on its own.
  if (state.dedupeEnabled) {
    if (state.seenEventIds.has(envelope.eventId)) {
      return { kind: 'duplicate', eventId: envelope.eventId };
    }
    state.seenEventIds.add(envelope.eventId);
  }

  const classified = toClassifiedEvent(telemetryEvent);

  if (envelope.runId === null) {
    // Short verbs / non-run events (FR-013/014): no run state to regress
    // or finalize against — dedupe above is the only guard they need.
    return { kind: 'accepted', event: classified };
  }

  const runId = envelope.runId;
  const runState = state.runs.get(runId);

  if (runState !== undefined && runState.finalized) {
    if (envelope.invocationSequence > runState.latestInvocationSequence) {
      // Genuinely NEW information: a sequence never before observed,
      // arriving after the run already reached a terminal lifecycle event
      // (data-model.md § Storage layout). Hand off to the durable store;
      // never applied to advance state (there is no live view left to
      // advance), never discarded.
      await deps.durableStore.storeLateEvent(telemetryEvent);
      return { kind: 'late', event: classified };
    }
    // A sequence no newer than what was already applied by the time the
    // run finalized is ALREADY-SUPERSEDED information — a reordered or
    // duplicate delivery of something that occurred before the point this
    // run is known to have reached, not new information the finalized view
    // is missing. It cannot regress anything (the derived executionStatus
    // no-regress guard lives independently in `src/plane/registry.ts`'s
    // `applyRunEvent`, which never lets an older sequence move status
    // backward), so it is safe to hand off as ordinary `accepted` data —
    // e.g. a reordered `run.progress` tick still counts toward
    // `progressEventCount` even though it arrived after the run's
    // `run.completed` (SC-015: duplicate + reordered delivery must still
    // land on the correct final state). Run bookkeeping (`latestInvocation
    // Sequence` / `finalized`) is intentionally left untouched here.
    return { kind: 'accepted', event: classified };
  }

  if (
    runState !== undefined &&
    envelope.invocationSequence <= runState.latestInvocationSequence
  ) {
    // No-regress (FR-042/SC-015): a sequence no newer than what is already
    // applied never walks state backward. Legitimate reordered/duplicate
    // delivery, just stale relative to what is already applied — not
    // rejected, not late-stored (the run is not finalized).
    return { kind: 'stale', event: classified };
  }

  state.runs.set(runId, {
    latestInvocationSequence: envelope.invocationSequence,
    finalized: RUN_TERMINAL_EVENT_TYPES.has(envelope.type),
  });

  return { kind: 'accepted', event: classified };
}
