/**
 * plugins/stack-control/src/scope-discovery/promote-findings/cluster-severity.ts
 *
 * specs/015-audit-protocol-convergence — Phase 3 / US1 (T007).
 *
 * Cross-lane severity-agreement computation (FR-001 mechanism A / D1). Replaces
 * the retired max-of-cluster rule in `extract-barrage-findings.ts:mergeCluster`.
 * Pure — no I/O. contracts/cluster-severity.md is the authority.
 *
 * The retired rule took the MAX severity any single lane assigned, so one lane's
 * HIGH on a finding the rest of the fleet rated MEDIUM inflated the whole cluster
 * to HIGH and the dampener's two-consecutive-raw-0-HIGH branch could never
 * engage (the 014 plateau). The agreement rule counts a cluster at a level only
 * when ≥2 covering lanes rate it at-or-above that level — so [high, medium]
 * de-inflates to MEDIUM while [high, high] stays HIGH and blocks (SC-003).
 *
 * `SEVERITY_RANK` lives here (the leaf of the severity-computation module graph)
 * and is imported by `extract-barrage-findings.ts`, so there is no runtime import
 * cycle: this module's only import from `extract-barrage-findings.ts` is the
 * type-only `NormalizedSeverity` (erased at compile time).
 */

import type { NormalizedSeverity } from './extract-barrage-findings.js';
import type {
  ClusterSeverityDecision,
  PerLaneSeverity,
} from './cluster-severity-types.js';

/** Severity ordering: blocking > high > medium > low > informational. */
export const SEVERITY_RANK: Record<NormalizedSeverity, number> = {
  blocking: 4,
  high: 3,
  medium: 2,
  low: 1,
  informational: 0,
};

const RANK_TO_SEVERITY: readonly NormalizedSeverity[] = [
  'informational',
  'low',
  'medium',
  'high',
  'blocking',
];

/**
 * The highest severity level at which ≥2 covering lanes rate the cluster
 * at-or-above (the agreement floor, D1). Walk levels high→low; return the first
 * where `count(perLane with rank >= rank(level)) >= 2`. With ≥2 lanes (every lane
 * is ≥ informational) the loop always returns at `informational` at worst.
 */
function highestLevelWithAtLeastTwoAtOrAbove(
  perLane: readonly PerLaneSeverity[],
): NormalizedSeverity {
  for (let rank = RANK_TO_SEVERITY.length - 1; rank >= 0; rank -= 1) {
    const atOrAbove = perLane.filter((p) => SEVERITY_RANK[p.severity] >= rank).length;
    if (atOrAbove >= 2) return RANK_TO_SEVERITY[rank]!;
  }
  return 'informational';
}

/**
 * Compute a cluster's gate-counted severity by cross-lane agreement (D1).
 *
 *   - 0 lanes  → throw (a cluster always has ≥1 covering lane; absence is a
 *                defect — fail loud, Constitution V).
 *   - 1 lane   → `single-model`; the lane's severity is kept unchanged (004
 *                FR-003: a single-model HIGH still blocks).
 *   - ≥2 lanes → `agreement`; the highest level ≥2 lanes rate at-or-above.
 *
 * Invariant (data-model § Validation): `gateCountedSeverity` rank ≤
 * `max(perLane rank)` — de-inflation never RAISES severity.
 */
export function computeClusterSeverity(
  perLane: readonly PerLaneSeverity[],
): ClusterSeverityDecision {
  if (perLane.length === 0) {
    throw new Error(
      'computeClusterSeverity: empty cluster — a cluster always has ≥1 covering lane (FR-001, Constitution V).',
    );
  }
  if (perLane.length === 1) {
    return {
      perLane,
      rule: 'single-model',
      gateCountedSeverity: perLane[0]!.severity,
    };
  }
  return {
    perLane,
    rule: 'agreement',
    gateCountedSeverity: highestLevelWithAtLeastTwoAtOrAbove(perLane),
  };
}
