/**
 * plugins/dw-lifecycle/src/scope-discovery/controller/controller-types.ts
 *
 * Phase 11 Task 5 — Type contracts for the self-correcting controller.
 *
 * The controller is a PURE computation (per task pre-made decision #1):
 * it takes codebase-state metrics, history of prior decisions, and recent
 * audit-log entries, and returns the next decision (cadence, intensity,
 * escalation-threshold) plus an audit trail naming the reason for each
 * adjustment. Persistence of the history + decision lives in
 * `controller-state.ts`.
 *
 * # Signal vocabulary
 *
 *   - drift — derivative-toward-worse of the codebase-state metrics
 *     (classification completeness DECREASING; coverage DECREASING;
 *     violation density INCREASING; surface uniformity DECREASING;
 *     discovered-candidate rate INCREASING; disposition latency
 *     INCREASING). Bounded [0.0, 1.0]: 0.0 = no drift, 1.0 = every
 *     observed metric is moving toward worse.
 *
 *   - correction — derivative-toward-better of the same metrics, same
 *     bounding. The complement of drift on a per-metric basis but not
 *     globally (a metric can be stable, contributing to neither).
 *
 *   - auditorCorrectionRate — TRUTH SIGNAL per Phase 11 Task 5 PRD:
 *     count of catalog edits driven by auditor findings since the
 *     last controller run, normalised to a rate. The metric ratchets
 *     UP when the model is consistently undercounting drift in its
 *     own scans (auditor catches what the regime missed); the
 *     controller reads this as "the regime's own self-measurement is
 *     not enough — tighten cadence + intensity."
 *
 * # Bounds + cold-start
 *
 * `frequency` and `intensity` are bounded [0.0, 1.0]. `frequency` is
 * turns-per-loop-invocation (1.0 = every turn; 0.5 = every other turn;
 * 0.0 = never — the controller refuses to go to 0.0). `intensity` is
 * the confidence threshold for auto-disposition (1.0 = strictest =
 * LLM-judge on every action; 0.0 = most permissive). Cold-start picks
 * the MAXIMUM for both.
 *
 * `escalationThreshold` is in [0.0, 1.0]: proposals with confidence
 * BELOW this threshold escalate to the operator. Cold-start picks a
 * conservative high threshold (so most proposals escalate); the
 * controller relaxes it as auditor-correction-rate falls.
 *
 * # No casts, no any
 *
 * Every field is REQUIRED on its parent unless explicitly marked
 * optional via `?`. Optional fields carry documented null/undefined
 * semantics.
 */

/**
 * The three signals the controller computes from its input.
 *
 *   - drift in [0.0, 1.0]
 *   - correction in [0.0, 1.0]
 *   - auditorCorrectionRate in [0.0, 1.0] — clamped to [0, 1] by the
 *     computation (a rate of >1 audit-driven edits per turn saturates
 *     to 1.0; the controller's policy doesn't differentiate beyond that
 *     ceiling).
 *
 * Signals are reported on every decision (even cold-start, where
 * drift/correction are 0.0 because no history exists yet).
 */
export interface ControllerSignals {
  readonly drift: number;
  readonly correction: number;
  readonly auditorCorrectionRate: number;
}

/**
 * One entry in the audit_trail recorded on every adjustment.
 *
 *   - field — which decision field was adjusted (`frequency`,
 *     `intensity`, `escalationThreshold`).
 *   - signal_used — which signal drove the change (`drift`,
 *     `correction`, `auditorCorrectionRate`, `cold-start`,
 *     `anti-thrashing-damping`, or a composite tag).
 *   - prior_value / new_value — exact values for back-compute audit.
 *   - reason — one-sentence operator-readable rationale.
 */
export interface ControllerAdjustment {
  readonly field: 'frequency' | 'intensity' | 'escalationThreshold';
  readonly signal_used: ControllerSignalTag;
  readonly prior_value: number;
  readonly new_value: number;
  readonly reason: string;
  /** ISO-8601 when the adjustment was decided. */
  readonly adjusted_at: string;
}

/**
 * Tag identifying what kind of signal or policy drove an adjustment.
 *
 *   - `cold-start` — no history, defaults applied.
 *   - `drift` / `correction` / `auditor-correction-rate` — derivative
 *     signals from metrics or audit log.
 *   - `anti-thrashing-damping` — proposed adjustment was damped (50%)
 *     because it reversed the prior K decisions' direction.
 *   - `ratchet-down` — low-drift + low-correction streak triggered a
 *     gradual loosening per controller-config's `ratchet_down_rate`.
 *   - `steady-state` — signal was within deadband; no change applied
 *     (still recorded for audit completeness).
 */
export type ControllerSignalTag =
  | 'cold-start'
  | 'drift'
  | 'correction'
  | 'auditor-correction-rate'
  | 'anti-thrashing-damping'
  | 'ratchet-down'
  | 'steady-state';

/**
 * The full decision returned from `runController`. The orchestrator
 * uses `frequency`, `intensity`, and `escalationThreshold` to gate
 * its per-turn behavior; `audit_trail` is persisted for telemetry.
 *
 *   - frequency in [0.0, 1.0]
 *   - intensity in [0.0, 1.0]
 *   - escalationThreshold in [0.0, 1.0]
 *   - signals — the signals the decision was computed from
 *   - audit_trail — one entry per FIELD adjusted (or one summary entry
 *     when no field changed, signalling the steady-state evaluation).
 */
export interface ControllerDecision {
  readonly frequency: number;
  readonly intensity: number;
  readonly escalationThreshold: number;
  readonly signals: ControllerSignals;
  readonly audit_trail: ReadonlyArray<ControllerAdjustment>;
  /** ISO-8601 of the decision moment. */
  readonly decided_at: string;
}

/**
 * One history entry — last-N entries are read by the controller to
 * compute drift / correction / anti-thrashing damping. The state file
 * persists these in append-only order.
 */
export interface ControllerHistoryEntry {
  readonly decision: ControllerDecision;
  /**
   * Snapshot of the metrics observed at the time the decision was
   * made. The controller uses the most-recent N to derive drift /
   * correction. Stored verbatim — no transform.
   */
  readonly metrics_snapshot: MetricsSnapshot;
}

/**
 * Compact projection of the seven codebase-state metrics into the
 * scalar signals the controller cares about. The synthesis pass
 * (Phase 11 Task 4) emits the full metrics block; the controller
 * projects to this shape so it can compare history entries without
 * carrying the full metrics blob (which can be megabytes for large
 * codebases). Each field is the value the controller derives drift /
 * correction from.
 *
 *   - classification_completeness — ratio in [0, 1]; toward-better is
 *     INCREASING.
 *   - average_coverage — average of per-blessed-pattern coverage
 *     ratios in [0, 1]; toward-better is INCREASING.
 *   - violation_density — total hit count across all cursed patterns;
 *     toward-better is DECREASING.
 *   - average_surface_variance — average per-directory variance; toward-
 *     better is DECREASING (lower variance = more uniform).
 *   - catalog_edit_rate — edits-per-commit avg from the catalog-
 *     stability metric; INFORMATIONAL only (no toward-better direction;
 *     just churn).
 *   - pending_count — total pending entries; toward-better is
 *     DECREASING (less unresolved backlog).
 *   - median_disposition_latency_ms — null when no transitions;
 *     toward-better is DECREASING.
 *
 * Fields that are null in the snapshot do NOT contribute to drift or
 * correction — they're treated as "no signal."
 */
export interface MetricsSnapshot {
  readonly classification_completeness: number;
  readonly average_coverage: number;
  readonly violation_density: number;
  readonly average_surface_variance: number;
  readonly catalog_edit_rate: number;
  readonly pending_count: number;
  readonly median_disposition_latency_ms: number | null;
}

/**
 * Recent audit-log entry projection. The controller doesn't need the
 * full markdown body — only enough to count "auditor-driven catalog
 * edits since last run." Caller pre-filters: only entries with
 * Finding-ID greater than the controller's last-read watermark are
 * passed in; the controller does not re-filter.
 */
export interface RecentAuditEntry {
  readonly findingId: string;
  /** Provenance source: 'llm-judge-proposed', 'operator-authored', etc. */
  readonly provenance?: string;
  /**
   * Context tag — typically `audit-finding-<id>`. The controller
   * counts entries whose context matches `^audit-finding-` as
   * auditor-driven.
   */
  readonly context?: string;
}

/**
 * Input contract for the pure computation. The orchestrator assembles
 * each field per-turn:
 *
 *   - currentMetrics — fresh metrics from Phase 11 Task 4.
 *   - history — last-N controller decisions + their metrics snapshots,
 *     newest-first (history[0] is the most-recent prior decision).
 *   - auditEntries — entries since the controller's prior turn (caller
 *     filters via `audit-log-reader`'s watermark).
 *   - config — config-derived knobs (defaults + overrides).
 *   - decidedAt — ISO-8601 timestamp for the decision moment.
 */
export interface ControllerInput {
  readonly currentMetrics: MetricsSnapshot;
  readonly history: ReadonlyArray<ControllerHistoryEntry>;
  readonly auditEntries: ReadonlyArray<RecentAuditEntry>;
  readonly config: ControllerConfig;
  readonly decidedAt: string;
}

/**
 * Tunable knobs the controller uses. Defaults live in
 * `controller-config.ts`. Operators override via
 * `.dw-lifecycle/scope-discovery/controller-config.yaml`.
 *
 *   - cold_start_frequency — default 1.0 (every turn).
 *   - cold_start_intensity — default 1.0 (strictest threshold).
 *   - cold_start_escalation_threshold — default 0.9 (high — most
 *     proposals escalate until the controller earns confidence).
 *   - ratchet_down_rate — default 0.1 (decrease 10% per low-drift
 *     window — operator-decision N=5 turns).
 *   - ratchet_down_window — default 5 (turns of low drift before
 *     ratchet-down fires).
 *   - low_drift_threshold — default 0.1 (drift below this counts as
 *     "low" for ratchet-down accounting).
 *   - high_drift_threshold — default 0.4 (drift above this triggers
 *     immediate intensification).
 *   - anti_thrashing_window — default 3 (K = look back this many
 *     decisions to detect oscillation).
 *   - anti_thrashing_damping_factor — default 0.5 (multiply the
 *     proposed adjustment magnitude by this when oscillation detected).
 *   - auditor_correction_high_threshold — default 0.5 (auditor-
 *     correction-rate above this triggers intensification).
 *   - frequency_min / intensity_min / escalation_min — floor values
 *     the controller refuses to ratchet below.
 *   - frequency_max / intensity_max / escalation_max — ceiling
 *     values.
 *
 * All numeric fields are bounded [0, 1] except the window/integer
 * fields which are positive integers.
 */
export interface ControllerConfig {
  readonly cold_start_frequency: number;
  readonly cold_start_intensity: number;
  readonly cold_start_escalation_threshold: number;
  readonly ratchet_down_rate: number;
  readonly ratchet_down_window: number;
  readonly low_drift_threshold: number;
  readonly high_drift_threshold: number;
  readonly anti_thrashing_window: number;
  readonly anti_thrashing_damping_factor: number;
  readonly auditor_correction_high_threshold: number;
  readonly frequency_min: number;
  readonly frequency_max: number;
  readonly intensity_min: number;
  readonly intensity_max: number;
  readonly escalation_min: number;
  readonly escalation_max: number;
}
