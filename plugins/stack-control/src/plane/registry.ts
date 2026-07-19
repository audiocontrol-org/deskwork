/**
 * specs/036-fleet-control-plane — T050 (impl), pairs with T045's RED test
 * (tests/fleet/registry.test.ts) and feeds T053 (src/plane/http/api.ts, the
 * snapshot/delta projection consumed by T046/T047).
 *
 * THE LIVE REGISTRY — the client-visible fleet view, DERIVED (never
 * authoritative — the sidecars are, PT-007) from the append-only classified
 * event stream. Its whole job (registry.test.ts header, C3, FR-013/014):
 *
 *   1. Build EXACTLY ONE entry per COMMANDABLE run (`execute` / `govern`,
 *      i.e. events with a non-null `runId` — FR-013) across all installations.
 *   2. Discard SHORT-VERB `invocation.completed` events (`runId: null`,
 *      FR-014) from the entries collection — the fleet means "runs you can
 *      act on".
 *   3. Keep short-verb (and every invocation's) TIMING data queryable via a
 *      separate `timings(invocationId)` path, even though those invocations
 *      are never fleet entries (FR-014).
 *
 * DELIVERY SEMANTICS (data-model.md § Delivery semantics, SC-015): transmission
 * is at-least-once and events may arrive DUPLICATED or REORDERED. Registry
 * application is therefore **effectively-once** and **no-regress**:
 *   - effectively-once — a re-delivered event (same `eventId`, the dedupe key
 *     data-model.md § Identity names) is applied at most once; it never
 *     double-counts progress or re-advances timing.
 *   - no-regress — a later-arriving event carrying an OLDER `invocationSequence`
 *     never walks the derived execution status backward. Status advances only on
 *     a STRICTLY-NEWER lifecycle event. Ordering keys off `invocationSequence`
 *     (FR-040, the sequence with domain meaning) — NEVER `installationSequence`
 *     (FR-041, transport diagnostics only) and NEVER `eventId` (identity, not an
 *     ordering key — PT-013).
 *
 * WHAT THIS PROJECTION CARRIES (data-model.md § Fleet instance, C3/C4):
 *   - identity: runId / installationId / invocationId
 *   - the THREE STATUS AXES, kept structurally SEPARATE (FR-029/030) — never
 *     collapsed into one authoritative status. `executionStatus` is DERIVED
 *     from the run-lifecycle event type; `connectionStatus` / `livenessStatus`
 *     report the baseline IMPLIED by having received this run's telemetry
 *     (attached + live) — see the derivation note on `deriveStatusAxes`. Socket-
 *     closure / heartbeat refinements (`abnormally-disconnected`, `unresponsive`,
 *     FR-026) are transport/heartbeat signals this envelope-only stream does not
 *     carry; the reconciliation subsystem (T074/T076/T083) refines them, and
 *     this projection never fabricates them.
 *   - `progress` — derived counters (progress-tick count + latest sequence).
 *   - `availableActions` — derived from `executionStatus` (an active run can be
 *     paused/cancelled; a terminal run cannot).
 *   - `firstObserved` / `lastObserved` — the run's timing envelope.
 *
 * The remaining Fleet-instance facets data-model.md § Fleet instance lists —
 * compass, model, git, and structured reconciliation detail — are sourced from
 * bounded SNAPSHOT PAYLOADS (event.ts § SnapshotPayload). The classified-event
 * stream this builder consumes carries ENVELOPES only, so those facets are not
 * derivable HERE and are deliberately NOT fabricated (per the project no-
 * fallback / no-mock rule): they attach in the per-run-detail projection (C5)
 * once snapshot payloads flow. This is the "typed fields WHERE the event stream
 * provides them" contract from the task.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution (no `@/` alias — this plugin has none).
 */

import type { CommandKind } from '../fleet/command.js';
import type { SnapshotPayload } from '../fleet/event.js';
import type { ExecutionStatus, StatusAxes } from '../fleet/status.js';
import type { EventClassification, EventEnvelope, EventType } from '../fleet/types.js';

// ---------------------------------------------------------------------------
// Input — a classified event. Mirrors the private test-local `ClassifiedEvent`
// in registry.test.ts / api-snapshot.test.ts / api-deltas.test.ts (structural
// typing makes the two interchangeable); exported here so T051–T055 and the
// plane's real event processor share ONE definition rather than re-declaring it.
// ---------------------------------------------------------------------------

/**
 * A telemetry event after event.ts wrapped the raw envelope and
 * classification.ts tagged its storage class (data-model.md § Event →
 * Envelope). The registry consumes a STREAM of these.
 */
export interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: EventClassification;
  readonly type: EventType;
  /**
   * The event's bounded, already-validated snapshot payload (`≤ 32 KiB` —
   * `event.ts` § `SnapshotPayload` / `MAX_EVENT_SNAPSHOT_BYTES`). Threaded
   * through the ingest→registry→log boundary (specs/037 D5, data-model.md
   * § ClassifiedEvent EXTEND): `toClassifiedEvent` copies it off the wire
   * `TelemetryEvent`, `appendDurably` serializes it, and `parseLine` restores
   * it (re-validated) so event-specific payload survives a plane restart.
   */
  readonly snapshot: SnapshotPayload;
}

// ---------------------------------------------------------------------------
// Output shapes.
// ---------------------------------------------------------------------------

/**
 * The short-verb (and every-invocation) timing projection (FR-014). Retrievable
 * via `FleetRegistry.timings(invocationId)` even for invocations that are NEVER
 * fleet entries. Timing values come straight off the envelope — `wallClock`
 * describes, `monotonicOffsetMs` is the at-source monotonic delta (never
 * differenced across a process boundary — PT-013).
 */
export interface TimingsRecord {
  readonly invocationId: string;
  readonly wallClock: string;
  readonly monotonicOffsetMs: number;
  /** The `invocationSequence` of the event this timing was taken from (FR-040). */
  readonly invocationSequence: number;
}

/**
 * Derived progress counters for a run. Bounded by construction — a COUNT and a
 * latest sequence, never a per-tick history array (FR-045). A new `run.progress`
 * event bumps `progressEventCount`, which is what makes a progress tick a
 * genuine, diffable change the delta projection (T053) can bound to one instance.
 */
export interface RunProgress {
  /** Distinct `run.progress` events applied to this run (effectively-once). */
  readonly progressEventCount: number;
  /** Highest `invocationSequence` observed for this run (FR-040). */
  readonly latestInvocationSequence: number;
}

/**
 * A command an operator may issue against a run (C6, FR-050). The set a given
 * run OFFERS is derived from its `executionStatus`.
 *
 * Alias of the canonical `CommandKind` union defined in `../fleet/command.js`
 * (T067 DRY unification) — the command state-machine module owns the one
 * definition; this projection re-exports it under the fleet-view name.
 */
export type FleetCommandKind = CommandKind;

/**
 * The client-visible projection of ONE commandable run (data-model.md § Fleet
 * instance, C3). Exactly one per commandable run. See the module header for why
 * the three status axes are separate (FR-030) and which Fleet-instance facets
 * are intentionally absent (snapshot-payload-sourced, not fabricated here).
 */
export interface FleetEntry {
  readonly runId: string;
  readonly installationId: string;
  readonly invocationId: string;
  /** The three axes, kept SEPARATE — never collapsed (FR-029/030). */
  readonly statusAxes: StatusAxes;
  readonly progress: RunProgress;
  /** Actions currently offered, derived from `executionStatus` (C6). */
  readonly availableActions: readonly FleetCommandKind[];
  readonly firstObserved: TimingsRecord;
  readonly lastObserved: TimingsRecord;
}

/**
 * The derived, client-visible fleet view. `entries()` returns exactly one
 * `FleetEntry` per commandable run in first-observed order; `timings()` exposes
 * per-invocation timing for EVERY invocation (FR-014), including short verbs
 * that are never entries.
 */
export interface FleetRegistry {
  /** One entry per commandable run, in first-observed order. Fresh array each call. */
  entries(): FleetEntry[];
  /** Timing for any invocation by id, or `undefined` if unseen. */
  timings(invocationId: string): TimingsRecord | undefined;
}

// ---------------------------------------------------------------------------
// Derivation tables.
// ---------------------------------------------------------------------------

/**
 * Run-lifecycle event type → derived `executionStatus`. These are the ONLY
 * event types that carry a non-null `runId` (classification.ts): every one maps.
 * A run event whose type is absent here is an unregistered lifecycle type and is
 * a hard error (fail loud — Principle V) rather than a silently-defaulted status.
 */
const RUN_LIFECYCLE_STATUS: ReadonlyMap<EventType, ExecutionStatus> = new Map<
  EventType,
  ExecutionStatus
>([
  ['run.started', 'starting'],
  ['run.progress', 'running'],
  ['run.completed', 'completed'],
  ['run.failed', 'failed'],
  ['run.cancelled', 'cancelled'],
]);

/**
 * Actions offered per `executionStatus` (C6). An ACTIVE run may be paused or
 * cancelled; a PAUSED run resumed or cancelled; a `cancelling` or TERMINAL run
 * offers nothing (cooperative cancel is already in flight, or the run is done).
 * `Record` (total over the union) so a new `ExecutionStatus` value would be a
 * compile error here until its action set is declared.
 */
const ACTIONS_BY_EXECUTION_STATUS: Readonly<Record<ExecutionStatus, readonly FleetCommandKind[]>> = {
  starting: ['pause', 'cancel'],
  running: ['pause', 'cancel'],
  paused: ['resume', 'cancel'],
  cancelling: [],
  cancelled: [],
  completed: [],
  failed: [],
};

/**
 * Derive the three status axes for a run. `executionStatus` is the real derived
 * value (from the latest lifecycle event). `connectionStatus` / `livenessStatus`
 * report the baseline IMPLIED by having received this run's telemetry: a run we
 * have durable events for was attached and answering when it emitted them. These
 * two axes' transport/heartbeat refinements (`abnormally-disconnected`,
 * `unresponsive` — FR-026) are NOT carried by this envelope-only stream and are
 * refined by the reconciliation subsystem (T074/T076/T083); this projection does
 * not fabricate them. Kept SEPARATE per FR-030 — nothing here derives one axis
 * from another.
 */
function deriveStatusAxes(executionStatus: ExecutionStatus): StatusAxes {
  return {
    connectionStatus: 'attached',
    livenessStatus: 'live',
    executionStatus,
  };
}

// ---------------------------------------------------------------------------
// Per-run mutable accumulator. Distilled into an immutable `FleetEntry` once the
// whole stream has been folded in.
// ---------------------------------------------------------------------------

interface RunAccumulator {
  readonly runId: string;
  readonly installationId: string;
  readonly invocationId: string;
  executionStatus: ExecutionStatus;
  /** `invocationSequence` of the event that set `executionStatus` (no-regress). */
  statusSequence: number;
  progressEventCount: number;
  latestInvocationSequence: number;
  firstObserved: TimingsRecord;
  lastObserved: TimingsRecord;
}

function timingOf(envelope: EventEnvelope): TimingsRecord {
  return {
    invocationId: envelope.invocationId,
    wallClock: envelope.wallClock,
    monotonicOffsetMs: envelope.monotonicOffsetMs,
    invocationSequence: envelope.invocationSequence,
  };
}

function requireRunStatus(type: EventType): ExecutionStatus {
  const status = RUN_LIFECYCLE_STATUS.get(type);
  if (status === undefined) {
    throw new Error(
      `buildRegistry: event ${JSON.stringify(type)} carries a non-null runId but is not a ` +
        'registered run-lifecycle event type (run.started | run.progress | run.completed | ' +
        'run.failed | run.cancelled). Refusing to default its executionStatus: a silent ' +
        'default would fabricate a status the event stream never carried.',
    );
  }
  return status;
}

/**
 * Fold one commandable-run event into its accumulator, honoring no-regress
 * ordering (FR-042/SC-015). `executionStatus` advances only on a STRICTLY-newer
 * lifecycle sequence, so a duplicate or out-of-order older event never regresses
 * it. Progress and timing are monotone by sequence for the same reason.
 */
function applyRunEvent(acc: RunAccumulator, event: ClassifiedEvent): void {
  const { envelope } = event;
  const sequence = envelope.invocationSequence;
  const candidate = requireRunStatus(event.type);

  if (sequence > acc.statusSequence) {
    acc.executionStatus = candidate;
    acc.statusSequence = sequence;
  }

  // No-regress applies to COUNTING too (AUDIT-20260717-04): a `run.progress`
  // tick only counts when it carries a STRICTLY-newer sequence than the run's
  // applied high-water mark. A stale/reordered progress delivery (an older
  // sequence than one already applied — e.g. a tick that arrives after a
  // higher-sequence `run.completed` already advanced the run) must NOT
  // increment the counter; counting it would reintroduce exactly the
  // over-count the no-regress invariant exists to prevent (FR-042/SC-015).
  // Checked BEFORE `latestInvocationSequence` is advanced below.
  if (event.type === 'run.progress' && sequence > acc.latestInvocationSequence) {
    acc.progressEventCount += 1;
  }

  if (sequence > acc.latestInvocationSequence) {
    acc.latestInvocationSequence = sequence;
    acc.lastObserved = timingOf(envelope);
  }
  if (sequence < acc.firstObserved.invocationSequence) {
    acc.firstObserved = timingOf(envelope);
  }
}

function newRunAccumulator(event: ClassifiedEvent, runId: string): RunAccumulator {
  const { envelope } = event;
  const timing = timingOf(envelope);
  return {
    runId,
    installationId: envelope.installationId,
    invocationId: envelope.invocationId,
    executionStatus: requireRunStatus(event.type),
    statusSequence: envelope.invocationSequence,
    progressEventCount: event.type === 'run.progress' ? 1 : 0,
    latestInvocationSequence: envelope.invocationSequence,
    firstObserved: timing,
    lastObserved: timing,
  };
}

function toEntry(acc: RunAccumulator): FleetEntry {
  return {
    runId: acc.runId,
    installationId: acc.installationId,
    invocationId: acc.invocationId,
    statusAxes: deriveStatusAxes(acc.executionStatus),
    progress: {
      progressEventCount: acc.progressEventCount,
      latestInvocationSequence: acc.latestInvocationSequence,
    },
    availableActions: ACTIONS_BY_EXECUTION_STATUS[acc.executionStatus],
    firstObserved: acc.firstObserved,
    lastObserved: acc.lastObserved,
  };
}

/**
 * Record per-invocation timing (FR-014), keeping the reading from the HIGHEST
 * `invocationSequence` seen for that invocation (the latest domain-ordered
 * timing). Applies to EVERY invocation — short verbs (never entries) and
 * commandable runs alike.
 */
function recordTiming(timings: Map<string, TimingsRecord>, envelope: EventEnvelope): void {
  const existing = timings.get(envelope.invocationId);
  if (existing === undefined || envelope.invocationSequence > existing.invocationSequence) {
    timings.set(envelope.invocationId, timingOf(envelope));
  }
}

/**
 * Build the derived live registry from a classified event stream.
 *
 * Derived, effectively-once, no-regress (see module header). Exactly one entry
 * per commandable run (`runId !== null`); short verbs (`runId === null`) never
 * become entries but their timing stays retrievable. Entries preserve
 * first-observed order (the order each run's first event appears in the stream).
 */
export function buildRegistry(events: ClassifiedEvent[]): FleetRegistry {
  const runs = new Map<string, RunAccumulator>();
  const timings = new Map<string, TimingsRecord>();
  const seenEventIds = new Set<string>();

  for (const event of events) {
    const { envelope } = event;

    // Effectively-once: a re-delivered event (same eventId — the dedupe key,
    // data-model.md § Identity) is applied at most once. This is what keeps
    // at-least-once transmission from double-counting progress or timing.
    if (seenEventIds.has(envelope.eventId)) {
      continue;
    }
    seenEventIds.add(envelope.eventId);

    // Every invocation's timing is retrievable (FR-014), entry or not.
    recordTiming(timings, envelope);

    // Short verbs (runId === null) are NEVER fleet entries — the fleet means
    // "runs you can act on" (FR-013/014). Their timing was recorded above.
    if (envelope.runId === null) {
      continue;
    }

    const runId = envelope.runId;
    const existing = runs.get(runId);
    if (existing === undefined) {
      runs.set(runId, newRunAccumulator(event, runId));
    } else {
      applyRunEvent(existing, event);
    }
  }

  const built: FleetEntry[] = [...runs.values()].map(toEntry);

  return {
    entries(): FleetEntry[] {
      return [...built];
    },
    timings(invocationId: string): TimingsRecord | undefined {
      return timings.get(invocationId);
    },
  };
}
