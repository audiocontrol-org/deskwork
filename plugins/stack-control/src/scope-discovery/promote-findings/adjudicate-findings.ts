/**
 * plugins/stack-control/src/scope-discovery/promote-findings/adjudicate-findings.ts
 *
 * specs/015-audit-protocol-convergence — Phase 3 / US1 (T009).
 *
 * The second-stage adjudication pass (FR-001 mechanism C / D2). Agreement (D1)
 * de-inflates intra-cluster severity DISagreement; it cannot resolve a single
 * lane's HIGH on a finding NO other lane covered — the 014 AUDIT-19/-21 shape: a
 * consistency-seam / prior-round fix-code finding whose own prose self-assesses
 * low/latent blast radius. Adjudication re-scores those on three signals already
 * on disk — blast-radius prose, reachability through the public path, and
 * fix-debt classification — and records the basis so the decision is auditable
 * (SC-002) and never silent (Constitution V).
 *
 * It MUST NOT downgrade a finding whose body asserts a reachable, high-blast
 * defect (no suppression of real signal — SC-003). contracts/cluster-severity.md
 * § adjudicate-findings.ts is the authority.
 */

import type { NormalizedSeverity } from './extract-barrage-findings.js';
import type {
  ClusterSeverityDecision,
  PerLaneSeverity,
} from './cluster-severity-types.js';
import { SEVERITY_RANK } from './cluster-severity.js';

export interface AdjudicationInput {
  /** The covering lanes' raw severities (preserved on the decision). */
  readonly perLane: readonly PerLaneSeverity[];
  /** The finding body — the blast-radius / reachability / fix-debt evidence. */
  readonly body: string;
}

const LOW_BLAST_RE = /\b(low blast|genuinely low|latent|minor|cosmetic|negligible|nit)\b/i;
const UNREACHABLE_RE =
  /\b(unreachable|not reachable|cannot be reached|internal (?:path|caller)|only an internal)\b/i;
const REACHABLE_RE = /\breachable\b/i;
const HIGH_BLAST_RE =
  /\b(data.?loss|corrupt\w*|drops? findings|silently|security|exploit|crash)\b/i;
const FIX_DEBT_RE = /\b(fix.?code|prior round|previous round|round \d+|the fix introduced)\b/i;

/** The single dominant lane's severity (the inflated label adjudication re-scores). */
function dominantSeverity(perLane: readonly PerLaneSeverity[]): NormalizedSeverity {
  let top: NormalizedSeverity = 'informational';
  for (const p of perLane) {
    if (SEVERITY_RANK[p.severity] > SEVERITY_RANK[top]) top = p.severity;
  }
  return top;
}

/**
 * Re-score a residual single-lane inflation on its on-disk evidence (D2).
 *
 * Calibrates DOWN to ≤ medium when the body self-assesses low/latent blast radius
 * AND (it is unreachable via the public path OR it is prior-round fix-debt) — the
 * AUDIT-19/-21 shape. A reachable high-blast defect stays at its dominant
 * severity (SC-003). The basis records all three signals + the resulting
 * calibration and is ALWAYS non-empty.
 */
export function adjudicate(input: AdjudicationInput): ClusterSeverityDecision {
  const lane = dominantSeverity(input.perLane);
  const lowBlast = LOW_BLAST_RE.test(input.body);
  const unreachable = UNREACHABLE_RE.test(input.body);
  const reachable = REACHABLE_RE.test(input.body) && !unreachable;
  const highBlast = HIGH_BLAST_RE.test(input.body);
  const fixDebt = FIX_DEBT_RE.test(input.body);

  const reachableHighBlast = reachable && highBlast;
  const calibrateDown = !reachableHighBlast && lowBlast && (unreachable || fixDebt);

  const gateCountedSeverity: NormalizedSeverity =
    calibrateDown && SEVERITY_RANK[lane] > SEVERITY_RANK.medium ? 'medium' : lane;

  const signals = `blast-radius=${lowBlast ? 'low/latent' : highBlast ? 'high' : 'unstated'}, reachability=${
    unreachable ? 'unreachable' : reachable ? 'reachable' : 'unstated'
  }, fix-debt=${fixDebt ? 'yes' : 'no'}`;
  const adjudicationBasis = calibrateDown
    ? `${signals}; calibrated ${lane}→${gateCountedSeverity} (single-lane inflation on low-blast/unreachable/fix-debt evidence).`
    : reachableHighBlast
      ? `${signals}; reachable, high blast radius — NOT calibrated down (real signal preserved, SC-003).`
      : `${signals}; no down-calibration signal — ${lane} retained.`;

  return {
    perLane: input.perLane,
    rule: 'adjudicated',
    gateCountedSeverity,
    adjudicationBasis,
  };
}
