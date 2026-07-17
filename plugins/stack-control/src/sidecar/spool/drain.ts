/**
 * specs/036-fleet-control-plane — T085, Phase 6 (US4) / FR-017.
 *
 * FR-017: "The sidecar MUST reserve the right to coalesce or sample, and
 * MUST enforce a maximum event size and a spool size cap with a DEFINED DROP
 * POLICY NAMING WHAT IS DISCARDED FIRST." An unnamed/implicit drop policy is
 * the failure mode this file exists to prevent — `selectDropVictims` always
 * returns both WHICH records were discarded and a human-readable WHY.
 *
 * Two independent, pure/testable surfaces:
 *
 *   1. BOUNDED BACKOFF (`computeBackoffDelayMs` / `BackoffSchedule`) for the
 *      spool drain/transmit retry loop. Values align with
 *      contracts/sidecar-plane-protocol.md § C4 reconnect policy (line
 *      ~43): full jitter, base 1s (reseeded by the server's `retry:`
 *      field), ×2 growth, cap 30s, reset after 60s healthy. This is a
 *      SEPARATE backoff instance from the SSE stream reconnect loop
 *      (src/sidecar/uplink/transport.ts's future reconnect.ts) — same
 *      shape by design (one pinned policy, PT-014), different call site,
 *      deliberately decoupled (no shared mutable state).
 *
 *   2. DROP POLICY (`selectDropVictims`) for when the bounded spool is over
 *      capacity. The discard order is DERIVED from the storage economics
 *      already pinned in src/fleet/classification.ts's
 *      `CLASS_STORAGE_POLICY`:
 *        - `live-only`  { mintsDurableObject: false, feedsRollup: false } —
 *          cheapest to lose: never durably stored regardless of whether
 *          this spool record survives.
 *        - `aggregated` { mintsDurableObject: false, feedsRollup: true }  —
 *          losing one record only degrades (does not erase) the eventual
 *          rollup summary it would have fed.
 *        - `durable`    { mintsDurableObject: true,  feedsRollup: false } —
 *          IS the immutable historical record; the entire reason FR-017
 *          says "never silently dropped if avoidable" — dropped last, and
 *          only once live-only and aggregated capacity is exhausted.
 *      So "cheapest to lose first" is exactly live-only → aggregated →
 *      durable — the same ascending order as "value retained by keeping
 *      it" in CLASS_STORAGE_POLICY. `DropClassification` is a re-export of
 *      `EventClassification` (src/fleet/types.ts) rather than a
 *      hand-duplicated union, so the two can never drift apart.
 *
 *   3. `drainOnce` composes the two: given a spool SNAPSHOT (an injected,
 *      abstract array of `{ classification }` records — never the concrete
 *      WAL), an injected `transmit` function, and an injected
 *      `BackoffSchedule`, it applies the drop policy if the snapshot is
 *      over capacity, attempts transmit, and on failure advances the
 *      backoff schedule and reports a retry delay. `drainOnce` never
 *      touches the filesystem, the network, or a real clock/RNG — those
 *      all arrive via injection (Constitution Principle VI, DI seam),
 *      matching src/fleet/clock.ts and src/sidecar/uplink/transport.ts's
 *      established pattern in this codebase.
 *
 * KEEP IT DECOUPLED (explicit, per the task): this module does NOT import
 * src/sidecar/spool/wal.ts (a sibling task's concrete crash-safe WAL) or
 * src/sidecar/pipeline.ts (the sidecar pipeline that will eventually call
 * `drainOnce`). It operates purely over the `DrainRecord` shape and
 * injected functions.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI).
 */

import type { EventClassification } from '../../fleet/types.js';

// ---------------------------------------------------------------------------
// 1. Bounded backoff
// ---------------------------------------------------------------------------

/**
 * Inputs to a single (pure, stateless) backoff computation. `jitter` and
 * (implicitly, via `serverRetryMs`) the reseeded base are the ONLY sources
 * of variability — there is no `Math.random()` and no real clock anywhere
 * in this module's decision path.
 */
export interface BackoffOptions {
  /** The base delay (ms) before any growth/jitter is applied. */
  readonly baseMs: number;
  /** The maximum delay (ms) growth may reach before jitter is applied. */
  readonly capMs: number;
  /**
   * Injected randomness source. MUST return a value in `[0, 1)` — the same
   * contract as `Math.random()`, but supplied by the caller so backoff is
   * deterministically testable.
   */
  readonly jitter: () => number;
  /**
   * A server-suggested retry interval (e.g. an SSE `retry:` field). When
   * present, it REPLACES `baseMs` as the base for this computation — "the
   * server reseeds the base" (contracts/sidecar-plane-protocol.md § C4).
   */
  readonly serverRetryMs?: number;
}

/**
 * Full-jitter bounded backoff for a single attempt:
 *
 *   delay = jitter() * min(capMs, base * 2^attempt)
 *
 * where `base` is `serverRetryMs` when supplied, else `baseMs`. This is the
 * "full jitter" algorithm (not "equal jitter" or fixed-with-jitter): the
 * entire bounded-growth window is the sampling range, from `0` up to (but
 * not including, since `jitter()` is `< 1`) the bounded growth — which is
 * what actually de-synchronizes many reconnecting clients instead of
 * merely wobbling around a fixed midpoint.
 *
 * PURE: given the same `attempt` and `opts` (including a `jitter` that
 * returns the same value), this always returns the same delay. All
 * variability is INJECTED, never sourced from `Math.random()` or a real
 * clock inside this function.
 *
 * Fails loud (Principle V) on a malformed `attempt`, non-positive
 * `baseMs`/`capMs`/`serverRetryMs`, or a `jitter()` return value outside
 * `[0, 1)` — never silently clamps or defaults, because a silently-clamped
 * backoff is a silent behavior change nobody asked for.
 */
export function computeBackoffDelayMs(attempt: number, opts: BackoffOptions): number {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error(
      `computeBackoffDelayMs: attempt must be a non-negative integer, got ${String(attempt)}`,
    );
  }
  if (!(opts.baseMs > 0)) {
    throw new Error(
      `computeBackoffDelayMs: baseMs must be a positive number, got ${String(opts.baseMs)}`,
    );
  }
  if (!(opts.capMs > 0)) {
    throw new Error(
      `computeBackoffDelayMs: capMs must be a positive number, got ${String(opts.capMs)}`,
    );
  }
  if (opts.serverRetryMs !== undefined && !(opts.serverRetryMs > 0)) {
    throw new Error(
      'computeBackoffDelayMs: serverRetryMs must be a positive number when supplied, got ' +
        String(opts.serverRetryMs),
    );
  }

  const base = opts.serverRetryMs ?? opts.baseMs;
  const boundedGrowth = Math.min(opts.capMs, base * 2 ** attempt);

  const jitterValue = opts.jitter();
  if (!Number.isFinite(jitterValue) || jitterValue < 0 || jitterValue >= 1) {
    throw new Error(
      'computeBackoffDelayMs: jitter() must return a finite number in [0, 1), got ' +
        String(jitterValue),
    );
  }

  return jitterValue * boundedGrowth;
}

/** Constructor options for a stateful `BackoffSchedule`. */
export interface BackoffScheduleOptions {
  readonly baseMs: number;
  readonly capMs: number;
  readonly jitter: () => number;
  /**
   * How long (ms) the connection must be continuously healthy before the
   * attempt counter resets (contracts/sidecar-plane-protocol.md § C4:
   * "reset after 60s healthy" — "prevents a flapping link from pinning max
   * delay").
   */
  readonly healthyResetMs: number;
}

/**
 * A small stateful wrapper around `computeBackoffDelayMs` that models the
 * two behaviors a single pure computation cannot express on its own:
 *
 *   - **Reseed**: once the server has suggested a retry interval, EVERY
 *     subsequent delay uses it as the base — not just the one call that
 *     received it.
 *   - **Reset after healthy**: the attempt counter (the ×2 growth driver)
 *     returns to zero once the connection has been continuously healthy
 *     for `healthyResetMs`, so a link that flaps briefly does not stay
 *     pinned at the max delay forever.
 *
 * Time is passed in explicitly (`markHealthy(nowMs)`) rather than read
 * from a real clock — the caller supplies `nowMs` from its own injected
 * `Clock` (src/fleet/clock.ts), keeping this class free of real time.
 */
export class BackoffSchedule {
  private attempt = 0;
  private serverRetryMs: number | undefined;
  private healthySinceMs: number | undefined;

  constructor(private readonly opts: BackoffScheduleOptions) {}

  /** The current attempt count (0 before the first `nextDelayMs()` call). */
  get attemptCount(): number {
    return this.attempt;
  }

  /**
   * Computes the delay for the current attempt, then advances the attempt
   * counter. Call this once per retry; the growth (×2) and cap are handled
   * by `computeBackoffDelayMs`.
   */
  nextDelayMs(): number {
    const delay = computeBackoffDelayMs(this.attempt, {
      baseMs: this.opts.baseMs,
      capMs: this.opts.capMs,
      jitter: this.opts.jitter,
      serverRetryMs: this.serverRetryMs,
    });
    this.attempt += 1;
    return delay;
  }

  /**
   * Reseeds the base used by every subsequent `nextDelayMs()` call — "the
   * server's `retry:` field reseeds the base."
   */
  reseedBase(serverRetryMs: number): void {
    if (!(serverRetryMs > 0)) {
      throw new Error(
        `BackoffSchedule.reseedBase: serverRetryMs must be a positive number, got ${String(serverRetryMs)}`,
      );
    }
    this.serverRetryMs = serverRetryMs;
  }

  /**
   * Marks the connection healthy as of `nowMs`. The FIRST call after
   * construction or after `markBroken()` merely starts the healthy-tracking
   * window. Once the window has been open for at least `healthyResetMs`,
   * the attempt counter resets to zero — explicitly modeling "reset after a
   * sustained healthy period."
   */
  markHealthy(nowMs: number): void {
    if (this.healthySinceMs === undefined) {
      this.healthySinceMs = nowMs;
      return;
    }
    if (nowMs - this.healthySinceMs >= this.opts.healthyResetMs) {
      this.attempt = 0;
    }
  }

  /**
   * Marks the connection broken, clearing the healthy-tracking window. A
   * subsequent `markHealthy()` call starts a FRESH window rather than
   * resuming the cleared one.
   */
  markBroken(): void {
    this.healthySinceMs = undefined;
  }
}

// ---------------------------------------------------------------------------
// 2. Drop policy (FR-017 — names what is discarded first)
// ---------------------------------------------------------------------------

/**
 * Re-export of the event-classification vocabulary
 * (src/fleet/classification.ts / src/fleet/types.ts) under the spool-drain
 * domain's own name. Deliberately an ALIAS, not a hand-duplicated union
 * literal — the drop policy's ordering is DERIVED from the same three
 * classes the storage-economy seam already defines, so the two can never
 * silently drift apart.
 */
export type DropClassification = EventClassification;

/** The minimal shape `selectDropVictims`/`drainOnce` need from a spool record. */
export interface DrainRecord {
  readonly classification: DropClassification;
}

/** The result of a drop-policy decision: WHICH indices, and WHY. */
export interface DropSelection {
  /**
   * Indices into the input spool snapshot that are discarded, in the ORDER
   * they were selected (cheapest-class-first, oldest-within-class-first).
   */
  readonly dropped: readonly number[];
  /** Human-readable name/description of the policy that produced `dropped`. */
  readonly policy: string;
}

/**
 * Priority weight per classification — LOWER drops FIRST. A `Record` (not a
 * partial map), so a new `DropClassification` value is a compile error here
 * until its priority is declared explicitly, mirroring
 * `CLASS_STORAGE_POLICY`'s own "exhaustive by construction" idiom in
 * src/fleet/classification.ts.
 *
 * Derivation (cited in the file header): `live-only` never mints a durable
 * object and never feeds a rollup (cheapest to lose) → 0. `aggregated`
 * feeds a rollup — losing one record degrades, not erases, that summary →
 * 1. `durable` mints the immutable historical record itself — the entire
 * point of FR-017's "never silently dropped if avoidable" — → 2 (last).
 */
const DROP_PRIORITY: Readonly<Record<DropClassification, number>> = {
  'live-only': 0,
  aggregated: 1,
  durable: 2,
};

/** The fixed, named drop policy every `selectDropVictims` call reports. */
export const DROP_POLICY_NAME =
  'drop-cheapest-class-first: live-only discarded before aggregated before durable; ' +
  'within a class the oldest (earliest-arrived) record drops first; durable is dropped ' +
  'last and only once live-only and aggregated capacity is exhausted (FR-017)';

/**
 * Decides which `overflowBy` records to discard from `spool` when it is
 * over its bounded capacity, per the FR-017 drop policy: live-only first,
 * then aggregated, then durable — oldest (lowest index) first within each
 * class. Returns the discarded indices AND a human-readable policy name, so
 * a caller/operator can observe what was discarded and why (never a silent
 * drop).
 *
 * `overflowBy` is the count to discard — the CALLER computes it (typically
 * `snapshot.length - capacity`), keeping this function agnostic to what
 * "capacity" means for any particular spool implementation.
 *
 * Fails loud (Principle V): a negative/non-integer `overflowBy`, or one
 * exceeding `spool.length` (dropping more than exists), throws rather than
 * silently clamping — a clamp would hide a caller bug in the overflow
 * computation.
 */
export function selectDropVictims<T extends DrainRecord>(
  spool: readonly T[],
  overflowBy: number,
): DropSelection {
  if (!Number.isInteger(overflowBy) || overflowBy < 0) {
    throw new Error(
      `selectDropVictims: overflowBy must be a non-negative integer, got ${String(overflowBy)}`,
    );
  }
  if (overflowBy === 0) {
    return { dropped: [], policy: DROP_POLICY_NAME };
  }
  if (overflowBy > spool.length) {
    throw new Error(
      `selectDropVictims: overflowBy (${overflowBy}) exceeds spool length (${spool.length}) — ` +
        'cannot drop more records than exist in the spool',
    );
  }

  const indices: number[] = [];
  for (let i = 0; i < spool.length; i += 1) {
    indices.push(i);
  }

  const ordered = indices.sort((a, b) => {
    const recordA = spool[a];
    const recordB = spool[b];
    if (recordA === undefined || recordB === undefined) {
      throw new Error(
        'selectDropVictims: internal invariant violated — drop-candidate index out of range',
      );
    }
    const priorityDelta = DROP_PRIORITY[recordA.classification] - DROP_PRIORITY[recordB.classification];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return a - b; // stable within a class: oldest (earliest-arrived) first
  });

  return { dropped: ordered.slice(0, overflowBy), policy: DROP_POLICY_NAME };
}

// ---------------------------------------------------------------------------
// 3. drainOnce — composes drop policy + injected transmit + injected backoff
// ---------------------------------------------------------------------------

/**
 * Inputs to a single drain attempt. `records` is a plain SNAPSHOT (never
 * the concrete WAL — src/sidecar/spool/wal.ts is a sibling task's
 * responsibility and is not imported here); `transmit` and `backoff` are
 * both injected, keeping `drainOnce` free of real network/time.
 */
export interface DrainOnceInput<T extends DrainRecord> {
  /** A snapshot of records currently in the spool, oldest first. */
  readonly records: readonly T[];
  /** The spool's bounded capacity — records beyond it are dropped first. */
  readonly capacity: number;
  /**
   * Attempts to transmit a batch. Resolves on success; a rejection is
   * treated as a transient transmit failure that advances `backoff`.
   */
  readonly transmit: (batch: readonly T[]) => Promise<void>;
  /** The backoff schedule to advance on a transmit failure. */
  readonly backoff: BackoffSchedule;
}

/** The outcome of a single `drainOnce` call. */
export type DrainOnceResult<T extends DrainRecord> =
  | {
      readonly outcome: 'transmitted';
      readonly transmittedCount: number;
      /** Present only when the snapshot was over capacity and records were dropped first. */
      readonly drop: DropSelection | undefined;
    }
  | {
      readonly outcome: 'retry';
      /** The delay `backoff.nextDelayMs()` returned for this failure. */
      readonly delayMs: number;
      readonly drop: DropSelection | undefined;
      readonly error: unknown;
    };

/**
 * A single drain attempt: apply the FR-017 drop policy if `records` exceeds
 * `capacity`, then attempt `transmit` on the survivors. On success, reports
 * how many were transmitted (and what, if anything, was dropped first). On
 * failure, advances `backoff` and reports the resulting retry delay — the
 * caller is responsible for actually waiting `delayMs` and re-invoking
 * `drainOnce` with a fresh snapshot.
 */
export async function drainOnce<T extends DrainRecord>(
  input: DrainOnceInput<T>,
): Promise<DrainOnceResult<T>> {
  if (!Number.isInteger(input.capacity) || input.capacity < 0) {
    throw new Error(
      `drainOnce: capacity must be a non-negative integer, got ${String(input.capacity)}`,
    );
  }

  const overflowBy = input.records.length - input.capacity;
  const drop = overflowBy > 0 ? selectDropVictims(input.records, overflowBy) : undefined;
  const droppedIndices: ReadonlySet<number> = new Set(drop?.dropped ?? []);
  const batch = input.records.filter((_, index) => !droppedIndices.has(index));

  try {
    await input.transmit(batch);
    return { outcome: 'transmitted', transmittedCount: batch.length, drop };
  } catch (error) {
    const delayMs = input.backoff.nextDelayMs();
    return { outcome: 'retry', delayMs, drop, error };
  }
}
