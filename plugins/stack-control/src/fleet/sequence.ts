/**
 * specs/036-fleet-control-plane — T020 (impl), pairs with T019's RED test
 * (tests/fleet/sequence.test.ts).
 *
 * The SEQUENCING MODEL + GAP CLASSIFICATION that event.ts deferred here
 * (event.ts header: "sequencing itself — installationSequence vs
 * invocationSequence, gap classification — is src/fleet/sequence.ts's job").
 * `src/fleet/types.ts` owns the envelope SHAPES; event.ts owns building and
 * validating envelopes and ordering ENVELOPES by invocationSequence. This
 * file owns the two sequences AS DISTINCT MODELLED ROLES and the high-water /
 * gap-classification diagnostics.
 *
 * TWO SEQUENCES, TWO JOBS (kept structurally distinct so they cannot be
 * confused — the point of modelling them as separate nominal types):
 *
 *   - `InstallationSequence` (FR-039) — the sidecar's outbound EMISSION order
 *     across ALL invocations. Interleaves every concurrent invocation and
 *     short verb into ONE counter. Legitimate uses: transport diagnostics,
 *     gap detection, spool restoration. FR-041: it MUST NOT be used for
 *     domain or causal ordering — doing so would assert relationships between
 *     concurrent runs that DO NOT exist. `domainOrderKey` refuses it.
 *
 *   - `InvocationSequence` (FR-040) — per-invocation order. THE sequence with
 *     domain meaning. `domainOrderKey` / `compareInvocationSequences` /
 *     `sortByInvocationSequence` operate only on this one.
 *
 * GAP CLASSIFICATION (R-04 + FR-042 — the subtle, load-bearing invariant):
 * classification operates on the sidecar's durable HIGH-WATER MARK (FR-039,
 * passed IN — this module does NOT own the durable store; its durability
 * across restart is machine-state's job, T027/T028) plus event AGE. It MUST
 * NOT infer absence from the durable object store, because event
 * classification (FR-015) makes the stored object set SPARSE BY DESIGN — so
 * absence-of-object is NOT absence-of-event. `classifyGap`'s signature carries
 * NO store parameter, by construction: there is nowhere to read the store.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).
 */

import type { Clock } from './clock.js';

// ---------------------------------------------------------------------------
// Shared numeric validation — fail loud, never coerce (project no-fallback
// rule: fallbacks and silent coercion are bug factories).
// ---------------------------------------------------------------------------

function requireNonNegativeInteger(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `${label}: expected a non-negative integer, got ${String(value)}`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// The two sequences as DISTINCT nominal types (FR-040 / FR-041).
//
// Modelled as separate classes with a `kind` discriminant rather than as bare
// `number`s so the compiler distinguishes them (an `InstallationSequence`
// cannot be passed where an `InvocationSequence` is required, and vice versa)
// AND `domainOrderKey` can refuse the diagnostics sequence at runtime. This is
// the structural teeth behind FR-041.
// ---------------------------------------------------------------------------

/**
 * The sidecar's outbound emission order (FR-039). Diagnostics only —
 * transport diagnostics, gap detection, spool restoration. NEVER a domain or
 * causal ordering key (FR-041); `domainOrderKey` refuses it.
 */
export class InstallationSequence {
  readonly kind: 'installation' = 'installation';
  readonly value: number;

  constructor(value: number) {
    this.value = requireNonNegativeInteger(value, 'InstallationSequence.value');
  }
}

/**
 * Per-invocation order (FR-040) — the ONLY sequence with domain meaning.
 */
export class InvocationSequence {
  readonly kind: 'invocation' = 'invocation';
  readonly value: number;

  constructor(value: number) {
    this.value = requireNonNegativeInteger(value, 'InvocationSequence.value');
  }
}

/** Either sequence — accepted only where the two are handled distinctly. */
export type Sequence = InstallationSequence | InvocationSequence;

/**
 * The single entry point for DOMAIN / CAUSAL ordering. Returns the numeric
 * order key for an `InvocationSequence` (FR-040) and REFUSES an
 * `InstallationSequence` (FR-041) — the diagnostics counter interleaves
 * concurrent invocations, so using it for domain ordering would assert
 * relationships between concurrent runs that do not exist. The refusal keys
 * off the sequence's own `kind` discriminant, so it holds even if a caller
 * launders the type through the `Sequence` union.
 */
export function domainOrderKey(sequence: Sequence): number {
  if (sequence.kind === 'installation') {
    throw new Error(
      'installationSequence must not be used for domain or causal ordering (FR-041): ' +
        'it interleaves concurrent invocations and would imply relationships between ' +
        'concurrent runs that do not exist. Use invocationSequence (FR-040) instead.',
    );
  }
  return sequence.value;
}

/**
 * Compare two `InvocationSequence`s by their domain value (FR-040). The
 * parameter types make it a compile error to pass an `InstallationSequence`.
 */
export function compareInvocationSequences(
  a: InvocationSequence,
  b: InvocationSequence,
): number {
  return a.value - b.value;
}

/**
 * Sort `InvocationSequence`s ascending by domain value. Returns a new array;
 * does not mutate the input.
 */
export function sortByInvocationSequence(
  sequences: readonly InvocationSequence[],
): InvocationSequence[] {
  return [...sequences].sort(compareInvocationSequences);
}

// ---------------------------------------------------------------------------
// High-water mark (FR-039). Pure diagnostic: the maximum emitted
// installationSequence. This is the EMISSION high-water computed from emitted
// values — NOT the durable persisted store (that is machine-state T027/T028,
// which passes a high-water value in to gap classification).
// ---------------------------------------------------------------------------

/**
 * The high-water mark of a set of emitted `installationSequence` values — the
 * maximum, regardless of arrival order. Fails loud on an empty set (a
 * high-water mark is meaningless with nothing emitted; do NOT invent a silent
 * zero) and on any non-integer member.
 */
export function highWaterMark(emitted: readonly number[]): number {
  if (emitted.length === 0) {
    throw new Error(
      'highWaterMark: cannot derive a high-water mark from an empty emission set',
    );
  }
  let mark = requireNonNegativeInteger(emitted[0]!, 'highWaterMark.emitted[0]');
  for (let i = 1; i < emitted.length; i += 1) {
    const value = requireNonNegativeInteger(emitted[i]!, `highWaterMark.emitted[${i}]`);
    if (value > mark) {
      mark = value;
    }
  }
  return mark;
}

// ---------------------------------------------------------------------------
// Gap classification (R-04 + FR-042). The settle bound is a DERIVED constant,
// not a magic number.
// ---------------------------------------------------------------------------

/**
 * Reconnect backoff cap (PT-014). Engineering judgment sized against real
 * infrastructure idle floors, NOT a looked-up fact.
 */
export const RECONNECT_BACKOFF_CAP_MS = 30_000;

/**
 * Backoff reset-after-healthy window (PT-014). After this much healthy time a
 * flapping link is considered stably recovered. Engineering judgment.
 */
export const BACKOFF_RESET_HEALTHY_MS = 60_000;

/**
 * Gap settle bound `T_SETTLE` (PT-014 "pinned at task time"; research.md open
 * item: "T_SETTLE is a formula, not a measured value — it derives from the
 * backoff schedule fixed in PT-014. Pin the derivation, not a magic number").
 *
 * DERIVATION (not a magic number): a below-mark sequence could still
 * legitimately be in-flight/retrying for as long as the reconnect loop might
 * take to redeliver it — the backoff cap (`RECONNECT_BACKOFF_CAP_MS`) — plus
 * the healthy-reset window (`BACKOFF_RESET_HEALTHY_MS`) that must elapse before
 * the link is considered stably recovered. Past that combined window, a still-
 * missing below-mark sequence is `lost`, not `in-flight`. This is engineering
 * judgment, flagged as such — not a measured value.
 */
export const GAP_SETTLE_BOUND_MS = RECONNECT_BACKOFF_CAP_MS + BACKOFF_RESET_HEALTHY_MS;

/** The three classifications of a missing `installationSequence` (R-04). */
export type GapClassification = 'lost' | 'in-flight' | 'never-sent';

/**
 * The PURE input to gap classification (R-04). It carries ONLY the four facts
 * the classification needs — a missing sequence number, the durable
 * high-water mark, the gap's age, and the settle bound. There is deliberately
 * NO store/object field: absence-of-object is not absence-of-event (FR-015
 * makes the stored set sparse by design), so classification must never consult
 * the object store. The signature is the enforcement.
 */
export interface GapInput {
  /** The missing `installationSequence` number being classified. */
  readonly sequence: number;
  /** The sidecar's durable high-water mark (FR-039), passed in. */
  readonly highWaterMark: number;
  /** How long the sequence has been observed missing, in milliseconds. */
  readonly ageMs: number;
  /** The settle bound `T_SETTLE`; typically `GAP_SETTLE_BOUND_MS`. */
  readonly settleBoundMs: number;
}

/**
 * Classify a missing `installationSequence` (R-04 + FR-042) as `lost`,
 * `in-flight`, or `never-sent`, from the high-water mark and the gap's age
 * ALONE:
 *
 *   - above the high-water mark              → `never-sent`
 *   - below the mark, older than the settle  → `lost`
 *   - below the mark, at/younger than settle → `in-flight` (retrying)
 *
 * PURE and store-free by construction: the only argument is a `GapInput`, which
 * has no store field. This is the R-04 invariant made structural — there is no
 * way to read the durable object store from here, so a sparse stored set
 * (FR-015) can never be mistaken for absent events. Fails loud on invalid
 * inputs; never coerces.
 */
export function classifyGap(input: GapInput): GapClassification {
  const sequence = requireNonNegativeInteger(input.sequence, 'classifyGap.sequence');
  const mark = requireNonNegativeInteger(input.highWaterMark, 'classifyGap.highWaterMark');

  if (typeof input.ageMs !== 'number' || !Number.isFinite(input.ageMs) || input.ageMs < 0) {
    throw new Error(
      `classifyGap.ageMs: expected a non-negative finite number, got ${String(input.ageMs)}`,
    );
  }
  if (
    typeof input.settleBoundMs !== 'number' ||
    !Number.isFinite(input.settleBoundMs) ||
    input.settleBoundMs <= 0
  ) {
    throw new Error(
      `classifyGap.settleBoundMs: expected a positive finite number, got ${String(input.settleBoundMs)}`,
    );
  }

  if (sequence > mark) {
    return 'never-sent';
  }
  // Below (or at) the mark: age decides. "Older than the settle bound" is
  // strict — at exactly the bound the gap is still in-flight.
  return input.ageMs > input.settleBoundMs ? 'lost' : 'in-flight';
}

/**
 * The AGE-deriving layer over `classifyGap`. Computes the gap's age as a
 * same-process monotonic DELTA from the INJECTED clock (PT-013 — never
 * `Date`/`performance` directly; the pure core stays clock-free), then
 * delegates to `classifyGap`. `firstMissingMonotonicMs` is a reading of the
 * SAME clock taken when the sequence was first observed missing.
 */
export function classifyGapAt(
  clock: Clock,
  input: {
    readonly sequence: number;
    readonly highWaterMark: number;
    readonly firstMissingMonotonicMs: number;
    readonly settleBoundMs?: number;
  },
): GapClassification {
  const ageMs = clock.monotonicNowMs() - input.firstMissingMonotonicMs;
  return classifyGap({
    sequence: input.sequence,
    highWaterMark: input.highWaterMark,
    ageMs,
    settleBoundMs: input.settleBoundMs ?? GAP_SETTLE_BOUND_MS,
  });
}
