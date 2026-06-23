// 030 hardening (TASK-440) — the operator-facing "implementation NOT done" message
// for a non-converged end-govern run. Pure (no I/O, no process.exit) so it is unit
// testable; govern-arms.ts writes the returned string to stderr. Surfaces the
// cross-chunk SEAM breaks that can drive an `override-eligible` outcome while
// `liftedFindings` is empty — without this, a seam-blocked run printed "0 open
// finding(s)" and the operator could not see what blocked.

import type { SeamFinding, WholeFeatureConvergenceRecord } from './chunk-artifacts.js';

/** One-line human summary of a seam break: `removed-export 'foo' (consumed across a boundary)`. */
function describeSeamFinding(f: SeamFinding): string {
  const across = f.consumedAcross ? ' (consumed across a chunk boundary)' : '';
  return `${f.kind} '${f.symbol}'${across}`;
}

/**
 * Render the "implementation NOT done" message for a non-converged convergence
 * record. Reports the open-finding count, the chunk/round counts, the SEAM breaks
 * (when any), and outcome-appropriate next-step advice. A degraded-fleet outcome is a
 * reachability problem, not a findings problem, so it points at fleet reachability
 * (AUDIT-20260622-10) rather than "fix the findings".
 */
export function renderEndGovernNotDoneMessage(record: WholeFeatureConvergenceRecord): string {
  const advice =
    record.outcome === 'degraded-fleet-surfaced'
      ? `the audit fleet was degraded for the convergence-determining round (a quiet round from ` +
        `fewer lanes is not full cross-model convergence). Ensure every configured model CLI is ` +
        `installed/reachable & re-govern, or record --override to accept the weakened audit.`
      : `Fix the surfaced findings & re-govern, or record --override.`;

  const seam = record.seamResult.findings;
  const seamLine =
    seam.length > 0
      ? ` Plus ${seam.length} cross-chunk seam break(s): ${seam.map(describeSeamFinding).join('; ')}.`
      : '';

  return (
    `govern: implementation NOT done — end-govern reconciled to '${record.outcome}' ` +
    `(${record.liftedFindings.length} open finding(s) over ${record.chunkIds.length} chunk(s), ` +
    `${record.rounds} round(s)).${seamLine} ${advice}\n`
  );
}
