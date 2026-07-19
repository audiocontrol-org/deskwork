// specs/037-instance-observability — T018 (impl), pairs with
// tests/instance/registry-instances.test.ts (T016) and
// tests/instance/instance-state-shape.test.ts (T017).
//
// The per-instance fold trio — `newInstanceAccumulator` / `applyInstanceEvent` /
// `toInstanceState` — parallels `src/plane/registry.ts`'s `newRunAccumulator` /
// `applyRunEvent` / `toEntry` (T045-T050 of 036). Split into its own file
// (rather than folded into `instance-registry.ts`) to keep both files under
// the 300-500 line project cap (data-model.md § InstanceAccumulator; research.md
// D6 notes near-cap files are not extended, new behavior lands in new files).
//
// US1 SCOPE (this task): fold `invocation.completed` and `session.heartbeat`
// into `lastActivityAt` / `lastActivity` / `firstSeenAt` / `lastHeartbeatAt` /
// `connection` / `liveness` / `recentActivity`. The session/phase fields
// (`currentSession`, `currentBearing`, `sessionsStarted`, `sessionsEnded`,
// `firstSessionAt`, `phaseDurations`) are initialized to their honest empty
// values here — US2 (`session.started`/`session.ended`) and US3
// (`phase.entered`) fold into them later; this module is their seam.
//
// DELIVERY SEMANTICS (mirrors registry.ts, data-model.md § InstanceAccumulator):
// no-regress (an older `invocationSequence` never walks a field backward) is
// enforced HERE, per-field, via the `*Sequence` high-water/low-water marks on
// `InstanceAccumulator`. Effectively-once (dedupe by `eventId`) is enforced by
// the caller, `buildInstanceRegistry` (`instance-registry.ts`), before an event
// ever reaches `applyInstanceEvent` — mirrors `registry.ts`'s `seenEventIds`
// Set living in `buildRegistry`, not in the per-run accumulator.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias).

import { RECENT_ACTIVITY_CAP, deriveLiveness } from '../fleet/liveness-constants.js';
import type {
  EventClassification,
  EventEnvelope,
  EventType,
} from '../fleet/types.js';
import type { InstanceAccumulator, InstanceId, InstanceState } from '../fleet/instance/types.js';

/**
 * A telemetry event after `event.ts` wrapped the raw envelope and
 * `classification.ts` tagged its storage class — structurally identical to
 * `registry.ts`'s `ClassifiedEvent` MINUS the `snapshot` field. US1 folds only
 * envelope-carried identity/timing (host/path/sessionId, invocationSequence,
 * wallClock, type); event-specific `snapshot` payload folding (`phase.entered`'s
 * `{phase,item}`, `session.started`'s `{sessionId,startedAt}`) is US2/US3 scope
 * and will extend this interface then (data-model.md D5).
 */
export interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: EventClassification;
  readonly type: EventType;
}

/**
 * Seed a fresh `InstanceAccumulator` for a newly-observed `host:path`. Every
 * served field starts at its honest empty value; the `*Sequence` bookkeeping
 * fields start at sentinels (`-Infinity` for high-water marks so the FIRST
 * folded event always wins, `+Infinity` for the low-water `firstSeenSequence`
 * mark so the first folded event always sets `firstSeenAt`). This lets
 * `applyInstanceEvent` run unconditionally for every event — including the
 * instance's first — with no separate "new vs. apply" branch.
 */
export function newInstanceAccumulator(
  id: InstanceId,
  host: string,
  path: string,
): InstanceAccumulator {
  return {
    id,
    host,
    path,
    connection: 'disconnected',
    liveness: 'gone',
    lastHeartbeatAt: null,
    lastHeartbeatSequence: Number.NEGATIVE_INFINITY,
    currentSession: null,
    currentBearing: null,
    lastActivityAt: null,
    lastActivity: null,
    lastActivitySequence: Number.NEGATIVE_INFINITY,
    sessionsStarted: 0,
    sessionsEnded: 0,
    firstSeenAt: null,
    firstSeenSequence: Number.POSITIVE_INFINITY,
    firstSessionAt: null,
    phaseDurations: {},
    recentActivity: [],
  };
}

/**
 * Recompute `connection`/`liveness` from the instance's freshest known signal
 * (`lastActivityAt`, which no-regress above has already settled to the
 * highest-`invocationSequence` event's wallClock). Per D1/D6 (task-scoped
 * derivation for the pure event fold, no separate uplink tracker at this
 * layer): a signal within the liveness window means the uplink is currently
 * delivering, so `connection` tracks `liveness === 'live'` directly.
 * Idempotent — safe to call after every fold.
 */
function refreshConnectionAndLiveness(acc: InstanceAccumulator): void {
  if (acc.lastActivityAt === null) {
    acc.liveness = 'gone';
    acc.connection = 'disconnected';
    return;
  }
  const ageMs = Date.now() - Date.parse(acc.lastActivityAt);
  acc.liveness = deriveLiveness(ageMs);
  acc.connection = acc.liveness === 'live' ? 'attached' : 'disconnected';
}

/**
 * Fold one event into its instance accumulator, honoring no-regress ordering
 * (mirrors `registry.ts`'s `applyRunEvent`, data-model.md § InstanceAccumulator).
 * `lastActivityAt`/`lastActivity` and `lastHeartbeatAt` advance only on a
 * STRICTLY-newer `invocationSequence`; `firstSeenAt` only regresses EARLIER
 * (a strictly-lower sequence). Caller (`buildInstanceRegistry`) has already
 * deduped by `eventId` — effectively-once is not re-checked here.
 */
export function applyInstanceEvent(acc: InstanceAccumulator, event: ClassifiedEvent): void {
  const { envelope, type } = event;
  const sequence = envelope.invocationSequence;

  // Bounded convenience view (FR-016b, RECENT_ACTIVITY_CAP = 50, D1). Stored
  // oldest-pushed-first; toInstanceState reverses to newest-first on read.
  acc.recentActivity.push({ eventId: envelope.eventId, type, wallClock: envelope.wallClock });
  if (acc.recentActivity.length > RECENT_ACTIVITY_CAP) {
    acc.recentActivity.shift();
  }

  // No-regress: lastActivityAt/lastActivity advance only on a strictly-newer
  // invocationSequence — a duplicate or out-of-order older event never walks
  // them backward.
  if (sequence > acc.lastActivitySequence) {
    acc.lastActivitySequence = sequence;
    acc.lastActivityAt = envelope.wallClock;
    acc.lastActivity = type;
  }

  // firstSeenAt: earliest-sequence wallClock across the whole fold.
  if (sequence < acc.firstSeenSequence) {
    acc.firstSeenSequence = sequence;
    acc.firstSeenAt = envelope.wallClock;
  }

  // lastHeartbeatAt: latest session.heartbeat by sequence (feeds liveness, D1).
  if (type === 'session.heartbeat' && sequence > acc.lastHeartbeatSequence) {
    acc.lastHeartbeatSequence = sequence;
    acc.lastHeartbeatAt = envelope.wallClock;
  }

  // connection/liveness derive from the freshest settled signal, recomputed
  // after every fold so they stay correct regardless of arrival order.
  refreshConnectionAndLiveness(acc);
}

/**
 * Project an `InstanceAccumulator`'s internal fold state to the served
 * `InstanceState` shape (data-model.md § InstanceState, FR-016/016a/016b/016c;
 * FR-017 — NO `waiting` field). Exactly the 16 contract fields; the
 * `*Sequence` bookkeeping fields never leak into the projection.
 */
export function toInstanceState(acc: InstanceAccumulator): InstanceState {
  return {
    id: acc.id,
    host: acc.host,
    path: acc.path,
    connection: acc.connection,
    liveness: acc.liveness,
    lastHeartbeatAt: acc.lastHeartbeatAt,
    currentSession: acc.currentSession,
    currentBearing: acc.currentBearing,
    lastActivityAt: acc.lastActivityAt,
    lastActivity: acc.lastActivity,
    sessionsStarted: acc.sessionsStarted,
    sessionsEnded: acc.sessionsEnded,
    firstSeenAt: acc.firstSeenAt,
    firstSessionAt: acc.firstSessionAt,
    phaseDurations: { ...acc.phaseDurations },
    recentActivity: [...acc.recentActivity].reverse().slice(0, RECENT_ACTIVITY_CAP),
  };
}
