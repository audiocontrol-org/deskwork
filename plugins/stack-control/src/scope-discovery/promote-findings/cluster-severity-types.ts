/**
 * plugins/stack-control/src/scope-discovery/promote-findings/cluster-severity-types.ts
 *
 * specs/015-audit-protocol-convergence — Phase 2 (T003).
 *
 * Shared types for the cross-lane severity-agreement computation (FR-001) and
 * its on-disk record (FR-002). Defined in a leaf module so both the pure
 * `cluster-severity.ts` computation and the `extract-barrage-findings.ts` merge
 * consume them without a runtime import cycle (the `NormalizedSeverity` import
 * is type-only — erased at compile time — so it does not create a runtime edge
 * back into `extract-barrage-findings.ts`).
 *
 * data-model.md § PerLaneSeverity / § ClusterSeverityDecision are the authority
 * for these shapes.
 */

import type { NormalizedSeverity } from './extract-barrage-findings.js';

/** The severity one covering lane assigned to a finding it raised (data-model § PerLaneSeverity). */
export interface PerLaneSeverity {
  /** The lane's pinned model id (e.g. `opus`, `gpt-5.5`). */
  readonly model: string;
  /** That lane's own raw severity for the cluster. */
  readonly severity: NormalizedSeverity;
}

/**
 * Which mechanism produced a cluster's gate-counted severity:
 *   - `single-model`  — only one lane flagged it; that lane's severity is kept
 *                       (004 FR-003: a single-model HIGH still blocks).
 *   - `agreement`     — ≥2 lanes flagged it; the gate-counted severity is the
 *                       highest level ≥2 covering lanes rate at-or-above (D1).
 *   - `adjudicated`   — a residual single-lane inflation re-scored on
 *                       blast-radius / reachability / fix-debt (D2).
 */
export type ClusterSeverityRule = 'single-model' | 'agreement' | 'adjudicated';

/**
 * The record of how a cross-lane cluster's gate-counted severity was derived,
 * persisted at lift (FR-002 / SC-002). The dampener reads only
 * `gateCountedSeverity` (its contract is unchanged); the rest is the audit trail
 * that makes the de-inflation decision reproducible.
 *
 * data-model.md § ClusterSeverityDecision § Validation: `gateCountedSeverity`
 * MUST be ≤ `max(perLane.severity)` (de-inflation never raises severity).
 */
export interface ClusterSeverityDecision {
  /** Every covering lane's raw severity for the cluster (≥1, ordered by model). */
  readonly perLane: readonly PerLaneSeverity[];
  /** Which mechanism produced the result. */
  readonly rule: ClusterSeverityRule;
  /** What the dampener will count (the single `Severity:` line). */
  readonly gateCountedSeverity: NormalizedSeverity;
  /**
   * Present iff `rule === 'adjudicated'`: the recorded blast-radius /
   * reachability / fix-debt basis (D2). Mandatory for an adjudicated decision —
   * never silent (Constitution V).
   */
  readonly adjudicationBasis?: string;
}
