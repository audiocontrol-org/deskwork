/**
 * plugins/dw-lifecycle/src/scope-discovery/recovery/recovery-types.ts
 *
 * Type contracts for the wrong-decision recovery
 * primitives.
 *
 * # Why these types live here
 *
 * The recovery library is the seam between three independent surfaces:
 *
 *   1. The audit-log (Task 7 + Task 10) — produces findings, some of
 *      which overturn an orchestrator-agent or LLM-judge auto-
 *      disposition.
 *
 *   2. The catalog state (Task 2 + Task 11) — every entry carries
 *      `status` + `provenance`; recovery targets entries whose
 *      provenance source is agent-driven (`orchestrator-agent` or
 *      `llm-judge-proposed`).
 *
 *   3. The orchestrator-agent (Task 3, not yet built) — consumes
 *      `CatalogEditProposal`s and applies them. The recovery library
 *      EMITS proposals; it never edits disk directly (per task pre-
 *      made decision #4: "Recovery operations are SOFT — they propose
 *      the reversal").
 *
 * # No casts, no any
 *
 * Every field is REQUIRED on its parent unless explicitly marked
 * optional via `?`. Optional fields carry documented null/undefined
 * semantics.
 */

import type { CatalogStatus, Provenance } from '../util/catalog-status.js';

/**
 * One wrong-decision event detected by `detectWrongDecisions`. Captures
 * the THREE coordinates needed to drive the rest of the recovery
 * pipeline (reversal proposal, trust calibration, systematic-wrongness
 * accounting):
 *
 *   - `catalogEntryId` — the catalog entry whose status was set by an
 *     agent source and has now been overturned. The orchestrator-agent
 *     resolves this id back to a registry path + entry via
 *     Task 3's edit-application primitive.
 *
 *   - `registryPath` — the registry path the entry lives in (e.g.
 *     `anti-patterns.yaml`, `clones.yaml`, `adopter-manifests.yaml`).
 *     Recovery DOES NOT carry the full entry — that's the consumer's
 *     job — but it does carry enough to drive a `findAuditEntriesAffecting`
 *     query with a registry filter.
 *
 *   - `findingId` — the audit-log Finding-ID that overturned the entry.
 *     The reversal proposal sets `status: withdrawn` and
 *     `provenance.context: audit-finding-<findingId>` (per
 *     `util/catalog-status.ts`'s reversibility-primitive contract).
 *
 * # Classification (for systematic-wrongness accounting)
 *
 *   - `priorStatus` — the catalog entry's current status that's being
 *     overturned (typically `blessed` or `cursed` — but in principle
 *     any actively-enforced status that came from an agent).
 *
 *   - `priorProvenanceSource` — `orchestrator-agent` or
 *     `llm-judge-proposed`. The TWO agent sources are the only ones
 *     recovery touches; operator-authored entries are out of scope by
 *     definition (the operator never produces a wrong auto-disposition).
 *
 *   - `patternType` — the pattern-type token from the catalog entry's
 *     own classification (e.g. `negative-space`, `coverage`,
 *     `statistical-outlier`, `unmatched-shape`, `semantic`). Carried
 *     verbatim from the entry so the systematic-wrongness classifier
 *     can group "wrong decisions on negative-space" separately from
 *     "wrong decisions on statistical-outlier". Optional because not
 *     every registry's entries carry a pattern-type (clones.yaml
 *     entries, for instance, don't).
 *
 * # Detection grounds
 *
 *   - `detectionGrounds` — short free-form explanation of WHY this was
 *     classified as a wrong-decision event. The detector populates this
 *     from the audit-log body text-search match (e.g. `body contains
 *     "overturn"`). The orchestrator surfaces it on the per-turn report
 *     so the operator can audit the detector's reasoning.
 */
export interface WrongDecisionEvent {
  readonly catalogEntryId: string;
  readonly registryPath: string;
  readonly findingId: string;
  readonly priorStatus: CatalogStatus;
  readonly priorProvenanceSource: 'orchestrator-agent' | 'llm-judge-proposed';
  readonly patternType?: string;
  readonly detectionGrounds: string;
  /** ISO-8601 timestamp the wrong-decision was detected (turn marker). */
  readonly detectedAt: string;
}

/**
 * A proposed catalog edit. Recovery operations are SOFT — they emit
 * one of these per wrong-decision event; the orchestrator-agent
 * (orchestrator-agent mediation) applies them.
 *
 * The shape is intentionally minimal: the three fields needed to drive
 * an edit (registry-path + entry-id + the target metadata block), plus
 * a `proposalSource` discriminator so the consumer can distinguish
 * recovery-driven proposals from other surfaces (LLM-judge initial
 * proposals, scope-widen, etc.) when they all land in the same queue.
 */
export interface CatalogEditProposal {
  readonly registryPath: string;
  readonly entryId: string;
  /** The status the proposal targets. Recovery emits `withdrawn`. */
  readonly targetStatus: CatalogStatus;
  /** Provenance block the proposal targets. */
  readonly targetProvenance: Provenance;
  /**
   * Per pre-made decision #1: recovery operations are SOFT — the
   * consumer commits the edit (per orchestrator-agent mediation). This tag names
   * the proposal's origin so consumers can attribute it.
   */
  readonly proposalSource: 'recovery';
  /** Free-form note explaining the proposal's rationale. */
  readonly note: string;
  /** ISO-8601 timestamp the proposal was emitted. */
  readonly proposedAt: string;
}

/**
 * Trust calibration durable state.
 *
 * # Why it's separate from `controller-state.json`
 *
 * The controller (Task 5) reasons about codebase-state derivatives +
 * auditor-correction-rate. Trust calibration is FINER-GRAINED — per
 * class of decisions — and updates on EVERY wrong-decision event (not
 * per-turn). Co-locating with controller-state would force a load/
 * persist on every detected event; a separate file keeps the
 * concerns split and the controller's per-turn read/write footprint
 * stable.
 *
 * Path: `.dw-lifecycle/scope-discovery/orchestrator-runtime/trust-calibration.json`
 *
 * # Schema (version 1)
 *
 *   {
 *     "version": 1,
 *     "globalThresholdAdjustment": <number>,
 *     "perClassThresholdAdjustments": {
 *       "<class-key>": <number>
 *     },
 *     "recentEvents": [
 *       { "classKey": "<class-key>", "kind": "wrong" | "correct", "at": "<iso>" },
 *       ...
 *     ]
 *   }
 *
 * # Adjustment semantics
 *
 * Per pre-made decision #2:
 *   - Each wrong-decision event raises the relevant class's threshold
 *     by 0.05 (and the global adjustment by 0.05 / N where N is the
 *     class count — so the global signal averages, not sums).
 *   - Each correct-decision event (verified-<date>-tagged audit-log
 *     entry on an agent-driven catalog entry) ratchets the threshold
 *     DOWN by 0.01 — slow decay to avoid premature recovery.
 *
 * Adjustments are bounded: at most +0.4 (the relevant intensity_max
 * ceiling slack from `DEFAULT_CONTROLLER_CONFIG.intensity_max = 1.0`
 * leaves room for headroom-sensible numbers) and at least 0.0 (we
 * never propose LOWER than the controller's baseline; that's
 * controller-business).
 *
 * # Recent events ring buffer
 *
 * `recentEvents` retains the last K=10 events (per pre-made decision
 * #3's window). Older events are dropped; this is the lookback window
 * `systematic-wrongness.ts` uses to count "wrong N times in a row in
 * the same class".
 *
 * Newest-first storage so prepending is O(1) on persist.
 */
export interface TrustCalibration {
  readonly version: 1;
  /**
   * Global adjustment applied uniformly across classes. Bounded
   * [0.0, 0.4].
   */
  readonly globalThresholdAdjustment: number;
  /**
   * Per-class adjustments keyed by class-key. Bounded [0.0, 0.4].
   */
  readonly perClassThresholdAdjustments: Readonly<Record<string, number>>;
  /**
   * Newest-first ring buffer; max length = K (default 10).
   */
  readonly recentEvents: ReadonlyArray<TrustCalibrationEvent>;
}

/**
 * One event in the trust-calibration ring buffer.
 */
export interface TrustCalibrationEvent {
  readonly classKey: string;
  readonly kind: 'wrong' | 'correct';
  /** ISO-8601 timestamp the event happened. */
  readonly at: string;
}

/**
 * A class of decisions identified as systematically wrong.
 *
 * Per pre-made decision #3:
 *   - Class definition: same pattern-type + same disposition (target
 *     status the agent proposed) + similar shape.
 *   - Threshold: N=3 wrong decisions in the same class within K=10
 *     turns triggers routing-to-escalation by default.
 *
 * The `classKey` is the discriminator the recovery surface uses
 * everywhere — it's the same value that appears under
 * `TrustCalibration.perClassThresholdAdjustments` AND in
 * `TrustCalibrationEvent.classKey`. The format is stable + parseable:
 *
 *   `<pattern-type>|<disposition>|<shape-tag>`
 *
 * where `<shape-tag>` is a short normalised token from the entry's
 * registry path (e.g. `anti-patterns.yaml` → `anti-patterns`). When
 * `pattern-type` is absent the slot becomes the literal `untyped`.
 */
export interface SystematicWrongnessClass {
  readonly classKey: string;
  /**
   * Pattern type from the wrong-decision events (or `untyped` when
   * absent on every event in the class).
   */
  readonly patternType: string;
  /** The disposition the agent proposed for every event in the class. */
  readonly disposition: CatalogStatus;
  /** Shape-tag derived from the registry path. */
  readonly shapeTag: string;
  /** Count of wrong-decision events in the class within the window. */
  readonly wrongCount: number;
  /**
   * The wrong-decision events that contributed to this class
   * (newest-first); the surface exposes them so the operator can
   * inspect the cluster.
   */
  readonly contributingEvents: ReadonlyArray<WrongDecisionEvent>;
  /**
   * Whether the class has crossed the systematic-wrongness threshold.
   * When true, the orchestrator routes this class to escalation by
   * default until evidence improves.
   */
  readonly thresholdCrossed: boolean;
}

/**
 * Default systematic-wrongness threshold per pre-made decision #3.
 * "3 wrong decisions in the same class within K=10 turns → route to
 * escalation by default."
 */
export const DEFAULT_SYSTEMATIC_WRONGNESS_THRESHOLD = 3;

/**
 * Default lookback window for trust-calibration recent events. The same
 * value gates systematic-wrongness accounting; the two ride together
 * by design.
 */
export const DEFAULT_TRUST_LOOKBACK_WINDOW = 10;

/**
 * Per-wrong-decision threshold adjustment magnitude. Per pre-made
 * decision #2: "+0.05 per wrong-decision event."
 */
export const WRONG_DECISION_THRESHOLD_DELTA = 0.05;

/**
 * Per-correct-decision threshold ratchet-down magnitude. Per pre-made
 * decision #2: "0.01 per correct decision."
 */
export const CORRECT_DECISION_THRESHOLD_DELTA = 0.01;

/**
 * Adjustment floor + ceiling (clamps applied on every update). The
 * threshold adjustment is layered ON TOP of the controller's baseline
 * confidence threshold; the recovery library never proposes a value
 * outside this bounded delta.
 */
export const MIN_TRUST_THRESHOLD_ADJUSTMENT = 0.0;
export const MAX_TRUST_THRESHOLD_ADJUSTMENT = 0.4;
