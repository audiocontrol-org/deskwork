// specs/037-instance-observability — T018, data-model.md § InstanceState /
// § InstanceAccumulator.
//
// The served projection (`InstanceState`) and its internal mutable fold state
// (`InstanceAccumulator`), kept in one home so `src/plane/instance-registry.ts`
// and its sibling `src/plane/instance-accumulator.ts` share ONE definition
// rather than re-declaring the shape (mirrors how `src/fleet/status.ts` /
// `src/fleet/command.ts` hold shared vocabulary for `src/plane/registry.ts`).
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias — this plugin has none).

import type { Liveness } from '../liveness-constants.js';

export type { Liveness };

/** The composite identity key, `${host}:${path}` (data-model.md § Instance Identity). */
export type InstanceId = string;

/**
 * Current uplink presence — whether the instance's sidecar currently has an
 * open connection to the plane. Independent of `liveness` (FR-016a): an open
 * uplink to a hung instance is `attached` + `stale`.
 */
export type Connection = 'attached' | 'disconnected';

/** An open session not yet ended. */
export interface CurrentSession {
  readonly sessionId: string;
  readonly startedAt: string;
}

/** The latest `phase.entered` payload; persists through `session.ended` (FR-016c). */
export interface CurrentBearing {
  readonly phase: string;
  readonly item: string;
}

/**
 * The InstanceState (materialized projection — served by the API; T018).
 *
 * Exactly the 16 fields data-model.md § InstanceState lists. No `waiting`
 * field (FR-017) — do not add one.
 */
export interface InstanceState {
  readonly id: InstanceId; // host:path (derived, never persisted)
  readonly host: string;
  readonly path: string;
  readonly connection: Connection; // current uplink presence (D1)
  readonly liveness: Liveness; // recency of last signal (D1)
  readonly lastHeartbeatAt: string | null; // ISO timestamp of latest session.heartbeat
  readonly currentSession: CurrentSession | null; // open session
  readonly currentBearing: CurrentBearing | null; // latest phase.entered; persists through session.ended
  readonly lastActivityAt: string | null; // wallClock of latest event
  readonly lastActivity: string | null; // short label (verb name, event type)
  readonly sessionsStarted: number; // count of session.started
  readonly sessionsEnded: number; // count of session.ended
  readonly firstSeenAt: string | null; // wallClock of earliest event
  readonly firstSessionAt: string | null; // earliest session.started
  readonly phaseDurations: Record<string, number>; // cumulative ms per phase; absent → unobserved
  readonly recentActivity: readonly unknown[]; // Event[] (≤ N=50, newest-first)
}

/**
 * A bounded, minimal record of one folded event, kept on the accumulator's
 * `recentActivity` ring (data-model.md § InstanceState `recentActivity`).
 * `toInstanceState` projects this ring to the served, capped, newest-first
 * `recentActivity` array.
 */
export interface RecentActivityItem {
  readonly eventId: string;
  readonly type: string;
  readonly wallClock: string;
  /**
   * A short human-readable "what happened" derived from the event's snapshot —
   * the phase for `phase.entered`, the verb for `invocation.completed`, etc. —
   * or `null` when the event type carries no meaningful detail. Records WHAT
   * happened alongside THAT it happened, so an activity timeline is legible
   * rather than a wall of bare event types.
   */
  readonly detail: string | null;
}

/**
 * InstanceAccumulator (NEW — internal fold state — parallels `RunAccumulator`,
 * `registry.ts:229-240`).
 *
 * The mutable per-instance fold state `buildInstanceRegistry` maintains,
 * keyed by `InstanceId`. Carries every served `InstanceState` field PLUS the
 * internal no-regress high-water marks (`*Sequence`) that keep folding
 * effectively-once + no-regress by `installationSequence` — the
 * instance-monotonic, per-installation outbound counter (NOT `invocationSequence`,
 * which is per-invocation and resets; keying on it froze the fields at the first
 * event, a dogfood finding). Mirrors `registry.ts`'s `statusSequence` /
 * `latestInvocationSequence` no-regress shape. These
 * sequence fields are internal bookkeeping ONLY — `toInstanceState` never
 * projects them onto the served shape.
 *
 * `recentActivity` is stored oldest-pushed-first (chronological fold order);
 * `toInstanceState` reverses it to the served newest-first order.
 */
export interface InstanceAccumulator {
  id: InstanceId;
  host: string;
  path: string;
  connection: Connection;
  liveness: Liveness;
  lastHeartbeatAt: string | null;
  /** `installationSequence` of the event that set `lastHeartbeatAt` (no-regress). */
  lastHeartbeatSequence: number;
  currentSession: CurrentSession | null;
  /**
   * `installationSequence` of the session-lifecycle event that last GOVERNED
   * `currentSession` (the opening `session.started` or the closing/ending
   * `session.ended`). Latest-wins no-regress: a stale (lower-sequence)
   * `session.started` can't re-open a closed session, and a stale
   * `session.ended` can't clear a newer open one (AUDIT-20260719-09, mirrors the
   * T049 `lastActivitySequence` pattern). Internal bookkeeping — never projected.
   */
  currentSessionSequence: number;
  currentBearing: CurrentBearing | null;
  /**
   * `installationSequence` of the `phase.entered` that last set `currentBearing`
   * (and `phaseEnteredAt`). `currentBearing` / `phaseDurations` only advance on a
   * STRICTLY-newer `phase.entered` (AUDIT-20260719-09) so an out-of-order event
   * can't set a stale bearing or mis-accrue a negative/double-counted duration.
   * Internal bookkeeping — never projected.
   */
  currentBearingSequence: number;
  lastActivityAt: string | null;
  lastActivity: string | null;
  /** `installationSequence` of the event that set `lastActivityAt`/`lastActivity` (no-regress). */
  lastActivitySequence: number;
  sessionsStarted: number;
  sessionsEnded: number;
  firstSeenAt: string | null;
  /** `installationSequence` of the event that set `firstSeenAt` (earliest wins). */
  firstSeenSequence: number;
  firstSessionAt: string | null;
  phaseDurations: Record<string, number>;
  /**
   * `wallClock` of the CURRENT (last-entered, not-yet-left) phase — internal
   * bookkeeping for accruing `phaseDurations` cumulatively (FR-018). On the NEXT
   * `phase.entered`, `(next.wallClock - phaseEnteredAt)` is added to the LEAVING
   * phase's running total, then this advances to the new entry. `null` until the
   * first `phase.entered` folds. Never projected onto the served `InstanceState`.
   */
  phaseEnteredAt: string | null;
  recentActivity: RecentActivityItem[];
}
