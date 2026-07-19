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
// no-regress (an older `installationSequence` never walks a field backward) is
// enforced HERE, per-field, via the `*Sequence` high-water/low-water marks on
// `InstanceAccumulator`. The ordering key is `installationSequence` — the
// sidecar's durable, per-installation outbound counter, monotonic across
// invocations AND across sidecar restarts — NOT `invocationSequence`, which is
// per-invocation (session/phase events set it to 0 and every fresh `stackctl`
// invocation restarts its own count), so it would freeze the fields at the
// first high-`invocationSequence` event (dogfood finding). Effectively-once
// (dedupe by `eventId`) is enforced by
// the caller, `buildInstanceRegistry` (`instance-registry.ts`), before an event
// ever reaches `applyInstanceEvent` — mirrors `registry.ts`'s `seenEventIds`
// Set living in `buildRegistry`, not in the per-run accumulator.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias).

import {
  FUTURE_SKEW_TOLERANCE_MS,
  LIVENESS_WINDOW_MS,
  RECENT_ACTIVITY_CAP,
  deriveLiveness,
} from '../fleet/liveness-constants.js';
import type { SnapshotPayload } from '../fleet/event.js';
import type {
  EventClassification,
  EventEnvelope,
  EventType,
} from '../fleet/types.js';
import type { InstanceAccumulator, InstanceId, InstanceState } from '../fleet/instance/types.js';

/**
 * A telemetry event after `event.ts` wrapped the raw envelope and
 * `classification.ts` tagged its storage class — structurally identical to
 * `registry.ts`'s `ClassifiedEvent` (which already carries `snapshot`, specs/037
 * D5). US1 folded only envelope-carried identity/timing (host/path/sessionId,
 * invocationSequence, wallClock, type); US2/US3 (this feature) additionally read
 * event-specific payload off the bounded `snapshot` — `session.started`'s
 * `{sessionId,startedAt}`, `session.ended`'s `{sessionId,endedAt,reason}`, and
 * `phase.entered`'s `{phase,from,item}` (data-model.md § ClassifiedEvent EXTEND).
 * The plane feeds the full snapshot-carrying stream (`registry.ts`'s
 * `ClassifiedEvent`), so this shape stays assignable in both directions.
 */
export interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: EventClassification;
  readonly type: EventType;
  /** The event's bounded, already-validated snapshot payload (`≤ 32 KiB`). */
  readonly snapshot: SnapshotPayload;
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
  installationId: string,
): InstanceAccumulator {
  return {
    id,
    host,
    path,
    installationId,
    connection: 'disconnected',
    liveness: 'gone',
    lastHeartbeatAt: null,
    lastHeartbeatSequence: Number.NEGATIVE_INFINITY,
    currentSession: null,
    currentSessionSequence: Number.NEGATIVE_INFINITY,
    currentBearing: null,
    currentBearingSequence: Number.NEGATIVE_INFINITY,
    lastActivityAt: null,
    lastActivity: null,
    lastActivitySequence: Number.NEGATIVE_INFINITY,
    sessionsStarted: 0,
    sessionsEnded: 0,
    firstSeenAt: null,
    firstSeenSequence: Number.POSITIVE_INFINITY,
    firstSessionAt: null,
    phaseDurations: {},
    phaseEnteredAt: null,
    recentActivity: [],
  };
}

/**
 * Read a non-empty string field off a bounded snapshot payload, or `null` when
 * it is absent/empty. `snapshot` is `Record<string, unknown>`, so this narrows
 * without a cast (Principle VI). Returning `null` rather than throwing keeps the
 * derived registry resilient: `buildInstanceRegistry` recomputes on EVERY poll,
 * so a single payload-less/malformed event must degrade THAT event's derivation
 * (honest absence — the field stays at its empty value, no fabrication), never
 * throw and take down the whole instance API — the same resilience posture the
 * fleet-side tick already enforces (`computeFleetTickGuarded`, AUDIT-20260718-04).
 * `snapshot` is typed non-optional, but a synthetic/legacy event may omit it, so
 * the guard tolerates `undefined` too.
 */
function readSnapshotString(snapshot: SnapshotPayload | undefined, key: string): string | null {
  if (snapshot === undefined) return null;
  const value = snapshot[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Fold a `session.started` / `session.ended` event into the instance's session
 * fields (data-model.md § InstanceState; FR-009/FR-009a). The identity fields
 * (host/path) keyed the accumulator already; the session payload itself rides
 * the snapshot.
 *
 * TWO axes with different ordering discipline (AUDIT-20260719-09):
 *  - Order-INDEPENDENT: counts (`sessionsStarted`/`sessionsEnded`) accrue on the
 *    event TYPE alone — the caller's eventId-dedup already guarantees
 *    effectively-once, and a count doesn't depend on arrival order. `firstSessionAt`
 *    stays the earliest `startedAt` by timestamp (low-water). Neither is gated.
 *  - LATEST-WINS by `installationSequence` (no-regress, mirrors the T049
 *    `lastActivitySequence` pattern): `currentSession` is governed by the
 *    highest-`installationSequence` session-lifecycle event. A `session.started`
 *    opens it only when strictly newer than the governing mark; a `session.ended`
 *    advances the mark and clears `currentSession` only when it matches the open
 *    session. This blocks a stale started from re-opening a closed session and a
 *    stale ended from clearing a newer open one. An UNCLOSED session stays "open
 *    since X" (FR-009). Never touches `currentBearing` (FR-016c).
 */
function applySessionEvent(acc: InstanceAccumulator, event: ClassifiedEvent): void {
  const { envelope, type, snapshot } = event;
  const sequence = envelope.installationSequence;
  if (type === 'session.started') {
    acc.sessionsStarted += 1;
    const sessionId = readSnapshotString(snapshot, 'sessionId');
    const startedAt = readSnapshotString(snapshot, 'startedAt');
    if (sessionId !== null && startedAt !== null) {
      // firstSessionAt: earliest startedAt by timestamp (order-independent).
      if (acc.firstSessionAt === null || Date.parse(startedAt) < Date.parse(acc.firstSessionAt)) {
        acc.firstSessionAt = startedAt;
      }
      // currentSession: only the newest session.started by installationSequence
      // opens it — a stale/out-of-order lower-sequence started never clobbers a
      // newer open (or re-opens a newer-closed) session.
      if (sequence > acc.currentSessionSequence) {
        acc.currentSessionSequence = sequence;
        acc.currentSession = { sessionId, startedAt };
      }
    }
    return;
  }
  // session.ended: advance the governing mark (blocking any lower-sequence
  // started that arrives later from re-opening), clearing the open session only
  // when its id matches (FR-009a). A stale ended (lower sequence) is ignored.
  acc.sessionsEnded += 1;
  const endedSessionId = readSnapshotString(snapshot, 'sessionId');
  if (endedSessionId !== null && sequence > acc.currentSessionSequence) {
    acc.currentSessionSequence = sequence;
    if (acc.currentSession !== null && acc.currentSession.sessionId === endedSessionId) {
      acc.currentSession = null;
    }
  }
}

/**
 * Fold a `phase.entered` event into `currentBearing` + cumulative
 * `phaseDurations` (data-model.md § InstanceAccumulator; FR-018, SC-009). The
 * transition payload `{phase, from, item}` rides the snapshot. `currentBearing`
 * becomes the DERIVED `{phase, item}` (latest wins). On leaving a phase (the
 * NEXT `phase.entered`), `(now - phaseEnteredAt)` accrues to the LEAVING phase's
 * running total — re-entries ADD to the same total rather than resetting it. A
 * phase entered-but-not-yet-left is ABSENT from `phaseDurations` (never `0`). A
 * payload-less event is a no-op (honest absence — see `readSnapshotString`).
 *
 * LATEST-WINS by `installationSequence` (no-regress, AUDIT-20260719-09, mirrors
 * the T049 `lastActivitySequence` pattern): only a phase.entered whose
 * `installationSequence` is STRICTLY newer than the one that set the current
 * bearing advances `currentBearing`/`phaseEnteredAt` and accrues the leaving
 * phase's span. A stale/out-of-order lower-sequence event is skipped entirely,
 * so it can't set a stale bearing or accrue a negative/double-counted duration.
 */
function applyPhaseEnteredEvent(acc: InstanceAccumulator, event: ClassifiedEvent): void {
  const { envelope, snapshot } = event;
  const sequence = envelope.installationSequence;
  if (sequence <= acc.currentBearingSequence) return; // stale/out-of-order — no-regress
  const phase = readSnapshotString(snapshot, 'phase');
  const item = readSnapshotString(snapshot, 'item');
  if (phase === null || item === null) return;

  // Accrue the LEAVING phase's elapsed time before advancing the bearing.
  if (acc.phaseEnteredAt !== null && acc.currentBearing !== null) {
    const leaving = acc.currentBearing.phase;
    const elapsedMs = Date.parse(envelope.wallClock) - Date.parse(acc.phaseEnteredAt);
    acc.phaseDurations[leaving] = (acc.phaseDurations[leaving] ?? 0) + elapsedMs;
  }

  acc.currentBearing = { phase, item };
  acc.phaseEnteredAt = envelope.wallClock;
  acc.currentBearingSequence = sequence;
}

/** The later of two optional epoch-ms readings, or `null` when both are absent. */
function maxDefined(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Parse an ISO instant to epoch-ms, or `null` when absent/unparseable
 * (AUDIT-20260719-10). A garbage timestamp must degrade to "no signal" — never a
 * raw `NaN`, which would poison `maxDefined`/`deriveLiveness` (`Math.max(x, NaN)`
 * is `NaN`, and every comparison against `NaN` is false) and corrupt the derived
 * liveness for the WHOLE instance until plane restart.
 */
function parseInstantMs(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Reduce a stored heartbeat to a valid LIVE-signal epoch-ms, or `null` when it
 * must NOT count as one (AUDIT-20260719-10). A heartbeat is a live signal only
 * when it parses AND is not dated in the future beyond `FUTURE_SKEW_TOLERANCE_MS`.
 * A future-dated heartbeat (clock-skewed or malicious sidecar) is rejected here so
 * it can NEVER pin an instance `live`/`attached` indefinitely — the load-bearing
 * belt that keeps the poison-resistance invariant even if a bad value reaches the
 * store or arrives on an event-carried `session.heartbeat`.
 */
function liveHeartbeatMs(iso: string | null, now: number): number | null {
  const ms = parseInstantMs(iso);
  if (ms === null) return null;
  return ms > now + FUTURE_SKEW_TOLERANCE_MS ? null : ms;
}

/**
 * Recompute `connection`/`liveness` as TWO DISTINCT axes (research.md D1,
 * FR-016a). Both derive from the freshest settled signals on the accumulator —
 * `lastActivityAt` (highest-`installationSequence` event) and `lastHeartbeatAt`
 * (the live session-liveness heartbeat, injected after the fold by
 * `applyHeartbeatSignal`):
 *
 *  - `liveness` tracks the MOST-RECENT signal of EITHER axis. A fresh heartbeat
 *    keeps an activity-idle-but-connected instance `live` instead of wrongly
 *    aging it off `lastActivityAt` alone (dogfood T050) — this is the whole bug
 *    fix. `live` <= LIVENESS_WINDOW_MS, `stale` up to RECONCILIATION_GRACE_MS,
 *    else `gone`.
 *  - `connection` is real uplink presence: `attached` ONLY while a heartbeat is
 *    recent (within LIVENESS_WINDOW_MS = one missed-beat tolerance), else
 *    `disconnected`. Independent of `liveness` — an instance with fresh activity
 *    but a lapsed heartbeat is `live` + `disconnected`; an open uplink to a hung
 *    instance is `attached` + `stale`.
 *
 * Idempotent — safe to call after every fold and after the heartbeat injection.
 */
function refreshConnectionAndLiveness(acc: InstanceAccumulator): void {
  const now = Date.now();
  // Defensive parse (AUDIT-20260719-10): an unparseable or future-dated heartbeat
  // is reduced to `null` (NOT a live signal), so it can never NaN-poison the
  // freshest-signal max nor pin liveness/connection with a year-3000 timestamp.
  const activityMs = parseInstantMs(acc.lastActivityAt);
  const heartbeatMs = liveHeartbeatMs(acc.lastHeartbeatAt, now);
  const freshestMs = maxDefined(activityMs, heartbeatMs);
  acc.liveness = freshestMs === null ? 'gone' : deriveLiveness(now - freshestMs);
  acc.connection =
    heartbeatMs !== null && now - heartbeatMs <= LIVENESS_WINDOW_MS ? 'attached' : 'disconnected';
}

/**
 * Inject the live session-liveness heartbeat (from `/v1/sidecar/liveness`, held
 * in the in-memory `HeartbeatStore`) into an instance AFTER its event fold, then
 * recompute the two liveness/connection axes. Adopt `emittedAt` when it is newer
 * than any event-carried heartbeat (latest wins — best-effort heartbeats may
 * arrive out of order). Keyed by the accumulator's `installationId`
 * (1:1 with `host:path`) at the `buildInstanceRegistry` call site.
 */
export function applyHeartbeatSignal(acc: InstanceAccumulator, emittedAt: string): void {
  // Never ADOPT an implausible heartbeat (unparseable, or future beyond skew): a
  // bad value must not become the served `lastHeartbeatAt` nor the live signal that
  // pins the instance live forever (AUDIT-20260719-10). Still recompute so the
  // axes stay current off the (unpoisoned) event-fold signals.
  if (liveHeartbeatMs(emittedAt, Date.now()) === null) {
    refreshConnectionAndLiveness(acc);
    return;
  }
  if (acc.lastHeartbeatAt === null || Date.parse(emittedAt) > Date.parse(acc.lastHeartbeatAt)) {
    acc.lastHeartbeatAt = emittedAt;
  }
  refreshConnectionAndLiveness(acc);
}

/**
 * Fold one event into its instance accumulator, honoring no-regress ordering
 * (mirrors `registry.ts`'s `applyRunEvent`, data-model.md § InstanceAccumulator).
 * `lastActivityAt`/`lastActivity` and `lastHeartbeatAt` advance only on a
 * STRICTLY-newer `installationSequence`; `firstSeenAt` only regresses EARLIER
 * (a strictly-lower sequence). The ordering key is `installationSequence` (the
 * instance-monotonic, per-installation outbound counter — monotonic across
 * invocations AND sidecar restarts), NOT `invocationSequence` (per-invocation,
 * resets to 0 for session/phase events and restarts each invocation — keying on
 * it froze the fields at the first high-`invocationSequence` event, a dogfood
 * finding). Caller (`buildInstanceRegistry`) has already deduped by `eventId` —
 * effectively-once is not re-checked here.
 */
export function applyInstanceEvent(acc: InstanceAccumulator, event: ClassifiedEvent): void {
  const { envelope, type } = event;
  const sequence = envelope.installationSequence;

  // Bounded convenience view (FR-016b, RECENT_ACTIVITY_CAP = 50, D1). Stored
  // oldest-pushed-first; toInstanceState reverses to newest-first on read. NOT
  // sequence-gated — every folded event is recorded.
  acc.recentActivity.push({ eventId: envelope.eventId, type, wallClock: envelope.wallClock });
  if (acc.recentActivity.length > RECENT_ACTIVITY_CAP) {
    acc.recentActivity.shift();
  }

  // No-regress: lastActivityAt/lastActivity advance only on a strictly-newer
  // installationSequence — a duplicate or out-of-order older event never walks
  // them backward.
  if (sequence > acc.lastActivitySequence) {
    acc.lastActivitySequence = sequence;
    acc.lastActivityAt = envelope.wallClock;
    acc.lastActivity = type;
  }

  // firstSeenAt: earliest-installationSequence wallClock across the whole fold.
  if (sequence < acc.firstSeenSequence) {
    acc.firstSeenSequence = sequence;
    acc.firstSeenAt = envelope.wallClock;
  }

  // lastHeartbeatAt: latest session.heartbeat by installationSequence (feeds liveness, D1).
  if (type === 'session.heartbeat' && sequence > acc.lastHeartbeatSequence) {
    acc.lastHeartbeatSequence = sequence;
    acc.lastHeartbeatAt = envelope.wallClock;
  }

  // Session lifetime fold (US2): open/close currentSession, count started/ended,
  // pull firstSessionAt earlier. Counts fold once per event (buildInstanceRegistry
  // deduped by eventId), independent of the no-regress sequence guards above.
  if (type === 'session.started' || type === 'session.ended') {
    applySessionEvent(acc, event);
  }

  // Phase-transition fold (US3): currentBearing + cumulative phaseDurations.
  // currentBearing PERSISTS through session.ended (FR-016c) — only phase.entered
  // ever moves it.
  if (type === 'phase.entered') {
    applyPhaseEnteredEvent(acc, event);
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
