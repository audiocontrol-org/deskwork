// Gate-criterion evaluation (022 US1 / T012, US5 design gate / T025).
//
// Every entrance / exit / exit-gate Criterion is a computable true/false
// predicate over artifacts that already exist (FR-008). A judgment criterion is
// the check of a RECORDED node marker (`approval-marker` / `node-marker`), never a
// subjective evaluation at gate time (FR-009). The `target` is a SYMBOLIC key the
// evaluator binds to the item's resolved artifacts — the governed doc carries no
// item-specific paths. `evaluateGate` enumerates the unmet criteria (M of N).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkflowError, type Criterion } from './workflow-types.js';
import { designGateCriteria } from './house-rules.js';
import { composeConvergedImpl } from '../govern/compose-convergence.js';
import { featureCheckpointKey } from '../govern/phase-checkpoint-status.js';

/**
 * The resolved, install-anchored facts the evaluator reads. Built by the query /
 * advance layer from the roadmap node + convergence records + the advance tree.
 */
export interface GateContext {
  readonly installationRoot: string;
  readonly item: string;
  readonly designPointer: string | null;
  readonly specPointer: string | null;
  readonly analyzeClean: boolean;
  readonly designApproved: boolean;
  /** Absolute path of the design record (resolved from `designPointer`), or null. */
  readonly designRecordPath: string | null;
  /** Absolute path of the spec dir (resolved from `specPointer`), or null. */
  readonly specDirPath: string | null;
  readonly implRecordConverged: boolean;
  readonly specRecordConverged: boolean;
  /** Whether the advance-touched tree is clean (for `tree-clean advance`). */
  readonly advanceTreeClean: boolean;
}

export interface GateResult {
  readonly met: readonly Criterion[];
  readonly unmet: readonly Criterion[];
  readonly allMet: boolean;
}

/** Slugify a markdown heading's text for section matching (`Problem Domain` → `problem-domain`). */
function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** True when the file at `path` has a heading whose slug equals `section`. */
function sectionPresent(path: string | null, section: string): boolean {
  if (path === null || !existsSync(path)) return false;
  const want = headingSlug(section);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m && headingSlug(m[1]!) === want) return true;
  }
  return false;
}

/**
 * Count alternatives listed in the design record's `solution-space` section —
 * the bullet items from the section heading until the next same-or-higher heading.
 */
function countSolutionSpaceAlternatives(path: string | null): number {
  if (path === null || !existsSync(path)) return 0;
  const lines = readFileSync(path, 'utf8').split('\n');
  let inSection = false;
  let sectionLevel = 0;
  let count = 0;
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      if (inSection && level <= sectionLevel) break; // section ended
      if (!inSection && headingSlug(h[2]!) === 'solution-space') {
        inSection = true;
        sectionLevel = level;
      }
      continue;
    }
    if (inSection && /^\s*[-*]\s+\S/.test(line)) count++;
  }
  return count;
}

/** True when every checkbox in `<specDir>/tasks.md` is checked (and there is at least one). */
function tasksComplete(specDirPath: string | null): boolean {
  if (specDirPath === null) return false;
  const tasksPath = join(specDirPath, 'tasks.md');
  if (!existsSync(tasksPath)) return false;
  let total = 0;
  let done = 0;
  for (const line of readFileSync(tasksPath, 'utf8').split('\n')) {
    const m = /^\s*-\s+\[( |x|X)\]/.exec(line);
    if (!m) continue;
    total++;
    if (m[1]!.toLowerCase() === 'x') done++;
  }
  return total > 0 && done === total;
}

/**
 * The per-phase graduate signal (025 US1): met IFF every tasks.md phase has a current
 * per-phase checkpoint. No spec dir / no tasks.md → UNMET (not fail-loud): a feature
 * without a runnable tasks.md simply cannot have current per-phase checkpoints; the
 * dangerous masquerade (a phase with no file list) still fails loud inside
 * composeConvergedImpl (FR-004). The checkpoint namespace key is single-sourced via
 * featureCheckpointKey (the spec-dir basename — the SAME key govern writes under).
 * Shared by `all-phase-checkpoints-current` and the 029 US6 `graduate-impl` either-of.
 */
function allPhaseCheckpointsCurrent(ctx: GateContext): boolean {
  if (ctx.specDirPath === null) return false;
  const tasksPath = join(ctx.specDirPath, 'tasks.md');
  if (!existsSync(tasksPath)) return false;
  return composeConvergedImpl(ctx.installationRoot, featureCheckpointKey(ctx.specDirPath), tasksPath);
}

/** Evaluate one criterion to a definite boolean (FR-008). */
export function evaluateCriterion(c: Criterion, ctx: GateContext): boolean {
  switch (c.kind) {
    case 'file-exists':
      if (c.target === 'design') return ctx.designRecordPath !== null && existsSync(ctx.designRecordPath);
      if (c.target === 'spec') return ctx.specDirPath !== null && existsSync(ctx.specDirPath);
      throw new WorkflowError(`criterion 'file-exists' has unknown target '${c.target}' (expected design|spec)`);
    case 'section-present':
      // F-M (governance MEDIUM): validate the target rather than silently reading the
      // design record for any target — a malformed `section-present spec ...` fails loud.
      if (c.target !== 'design') {
        throw new WorkflowError(`criterion 'section-present' has unknown target '${c.target}' (expected design)`);
      }
      if (c.param === undefined) throw new WorkflowError(`criterion 'section-present ${c.target}' requires a section name`);
      return sectionPresent(ctx.designRecordPath, String(c.param));
    case 'count-gte': {
      if (c.target !== 'solution-space-alternatives') {
        throw new WorkflowError(`criterion 'count-gte' has unknown target '${c.target}' (expected solution-space-alternatives)`);
      }
      const threshold = typeof c.param === 'number' ? c.param : Number(c.param);
      return countSolutionSpaceAlternatives(ctx.designRecordPath) >= threshold;
    }
    case 'tasks-complete':
      if (c.target !== 'spec') {
        throw new WorkflowError(`criterion 'tasks-complete' has unknown target '${c.target}' (expected spec)`);
      }
      return tasksComplete(ctx.specDirPath);
    case 'tree-clean':
      if (c.target !== 'advance') {
        throw new WorkflowError(`criterion 'tree-clean' has unknown target '${c.target}' (expected advance)`);
      }
      return ctx.advanceTreeClean;
    case 'pointer-set':
      if (c.target === 'design') return ctx.designPointer !== null;
      if (c.target === 'spec') return ctx.specPointer !== null;
      throw new WorkflowError(`criterion 'pointer-set' has unknown target '${c.target}' (expected design|spec)`);
    case 'record-converged':
      if (c.target === 'impl') return ctx.implRecordConverged;
      if (c.target === 'spec') return ctx.specRecordConverged;
      throw new WorkflowError(`criterion 'record-converged' has unknown target '${c.target}' (expected impl|spec)`);
    case 'all-phase-checkpoints-current': {
      // 025 US1 (FR-001/001a/002/003): met IFF every tasks.md phase has a current
      // per-phase checkpoint. The composed `record-converged impl` signal is DERIVED
      // from this union — a standalone whole-feature record never satisfies it. Reads
      // only the per-phase checkpoints (no whole-feature payload); fails loud (FR-004)
      // on a spec with no resolvable dir or a malformed phase set. Pure read (Principle IV).
      //
      // 026 US3 (FR-015): this IS the per-capability harmless-bypass backstop for
      // spec-execution — a feature implemented by reaching around the front door (no
      // per-phase govern checkpoints) cannot graduate here, on any host, regardless of
      // whether the interceptor observed the raw call. `capability reconcile` surfaces the
      // same un-governed state this gate refuses (the report-only half of the backstop).
      if (c.target !== 'impl') {
        throw new WorkflowError(`criterion 'all-phase-checkpoints-current' has unknown target '${c.target}' (expected impl)`);
      }
      return allPhaseCheckpointsCurrent(ctx);
    }
    case 'graduate-impl': {
      // 029 US6 (FR-023/024): EITHER-OF graduate gate. Met when the DEFAULT per-phase
      // path is satisfied (all-phase-checkpoints-current) OR the OPT-IN whole-feature
      // path is (a converged whole-feature convergence record). Per-phase remains the
      // default (the standard execute flow produces it); the whole-feature record is the
      // opt-in escape an operator produces by running whole-feature govern (FR-025
      // re-admits it — the 025 "compose, reject augment" record is amended accordingly).
      if (c.target !== 'impl') {
        throw new WorkflowError(`criterion 'graduate-impl' has unknown target '${c.target}' (expected impl)`);
      }
      return allPhaseCheckpointsCurrent(ctx) || ctx.implRecordConverged;
    }
    case 'approval-marker':
      if (c.target === 'design-approved') return ctx.designApproved;
      throw new WorkflowError(`criterion 'approval-marker' has unknown target '${c.target}' (expected design-approved)`);
    case 'node-marker':
      if (c.target === 'analyze-clean') return ctx.analyzeClean;
      if (c.target === 'design-approved') return ctx.designApproved;
      throw new WorkflowError(`criterion 'node-marker' has unknown target '${c.target}'`);
    default: {
      const exhaustive: never = c.kind;
      throw new WorkflowError(`unhandled criterion kind '${String(exhaustive)}'`);
    }
  }
}

/** Evaluate a criterion list, partitioning met / unmet (M of N). */
export function evaluateGate(criteria: readonly Criterion[], ctx: GateContext): GateResult {
  const met: Criterion[] = [];
  const unmet: Criterion[] = [];
  for (const c of criteria) {
    if (evaluateCriterion(c, ctx)) met.push(c);
    else unmet.push(c);
  }
  return { met, unmet, allMet: unmet.length === 0 };
}

/** A human-readable one-line description of a criterion (for query output). */
export function describeCriterion(c: Criterion): string {
  const param = c.param === undefined ? '' : ` ${c.param}`;
  return `${c.kind} ${c.target}${param}`;
}

/**
 * The `design-to-spec` exit gate (022 US5 / T025, FR-027): every required design-
 * record section present, ≥2 solution-space alternatives, and the recorded
 * `design-approved:` marker. The criteria are DERIVED from the single-source
 * house-rules block (one opinion injected into the backend AND checked here).
 */
export function evaluateDesignGate(ctx: GateContext): GateResult {
  return evaluateGate(designGateCriteria(), ctx);
}
