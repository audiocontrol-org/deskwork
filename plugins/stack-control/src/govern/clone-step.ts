// plugins/stack-control/src/govern/clone-step.ts
//
// US7 (010 / FR-032 / SC-011): the per-codebase clone-detection step that
// governance runs in implement mode. It resolves the codebase boundary for
// `repoRoot`, runs the migrated detector scoped to that installation, and
// surfaces NEW intra-codebase clones (vs the committed baseline) in the
// governance output. This replaces the prior "clone detection is handled
// separately by the orchestrator" deferral — the step now fires as part of the
// implement-mode chain.
//
// The step is ADVISORY: it reports duplication alongside the governance verdict
// but does NOT override the convergence-gate decision (#432 — the barrage gate
// is the single decision). When `repoRoot` is not inside a stack-control
// installation, per-codebase clone detection does not apply; the step reports
// that and returns `ran:false` (an informational outcome, not a swallowed
// failure — any OTHER error propagates).

import { detectCodebaseClones } from '../scope-discovery/clone-detector.js';
import { InstallationError } from '../config/errors.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';

export interface CloneStepResult {
  /** True when the detector ran (an enclosing installation was found). */
  readonly ran: boolean;
  /** Total clone groups detected in the codebase (0 when not run). */
  readonly groupCount: number;
  /** NEW groups vs the committed baseline (0 when not run / no baseline diff). */
  readonly newCount: number;
}

/**
 * Run the per-codebase clone-detection step and write a short report via
 * `write`. Returns a structured result for the caller's bookkeeping.
 */
export async function runCloneDetectionStep(opts: {
  readonly repoRoot: string;
  readonly write: (s: string) => void;
}): Promise<CloneStepResult> {
  const { repoRoot, write } = opts;
  try {
    const result = await detectCodebaseClones({ startDir: repoRoot });
    const groupCount = result.groups.length;
    const newGroups = result.baselineExisted ? result.diff.newGroups : result.groups;
    const newCount = newGroups.length;

    write(
      `govern clone-step: ${groupCount} clone group(s) in this codebase; ` +
        `${newCount} NEW${result.baselineExisted ? ' vs baseline' : ' (no baseline yet)'}.\n`,
    );
    for (const g of newGroups) {
      write(`  NEW clone ${g.id} (${g.lines} lines)\n`);
      for (const m of g.members) write(`    ${m}\n`);
    }
    return { ran: true, groupCount, newCount };
  } catch (err) {
    if (err instanceof InstallationError && err.code === 'not-found') {
      write(
        'govern clone-step: skipped — not inside a stack-control installation, ' +
          'so per-codebase clone detection does not apply here.\n',
      );
      return { ran: false, groupCount: 0, newCount: 0 };
    }
    // Any other failure (engine crash, malformed baseline) is surfaced, not swallowed.
    write(`govern clone-step: clone detection error — ${errorMessage(err)}\n`);
    throw err;
  }
}
