// Pure phase derivation (022 US2 / T009-T010, contracts/phase-derivation.md).
//
// Phase is a pure function of artifacts that already exist — NO stored phase
// field (FR-001). The mapping is total (every observable state → exactly one
// phase or terminal side-state) and deterministic (FR-002). The function reads
// the ORDERED phase list + each phase's derive predicate FROM the governed
// WorkflowDoc and returns the most-advanced phase whose predicate holds; terminal
// side-states are checked first. The artifact-reading that BUILDS these inputs
// lives in the query layer (workflow.ts); this function is pure over `inputs`.

import { SIDE_STATES, WorkflowError, type DerivedPhase, type DerivePredicate, type WorkflowDoc } from './workflow-types.js';

/**
 * The observable artifacts an item's phase is a function of (contracts/
 * phase-derivation.md). Built by the query layer from the roadmap node, the
 * convergence records, `tasks.md`, and the release tag; consumed purely here.
 */
export interface DerivationInputs {
  /** A roadmap node exists for the item. */
  readonly hasNode: boolean;
  /** The item is present in the local backlog. */
  readonly inBacklog: boolean;
  /** The roadmap node status (null when there is no node). */
  readonly status: string | null;
  readonly designPointer: string | null;
  readonly specPointer: string | null;
  readonly analyzeClean: boolean;
  readonly designApproved: boolean;
  readonly tasksComplete: boolean;
  readonly implRecordConverged: boolean;
  readonly specRecordConverged: boolean;
  readonly releaseTagged: boolean;
  /** A recorded blocked side-state (induct-style move). */
  readonly blocked: boolean;
}

/** Evaluate a single derive predicate against the observed inputs. */
function deriveHolds(pred: DerivePredicate, inputs: DerivationInputs): boolean {
  switch (pred.kind) {
    case 'backlog-only':
      return inputs.inBacklog && !inputs.hasNode;
    case 'node-present':
      return inputs.hasNode;
    case 'pointer-set':
      if (pred.target === 'design') return inputs.designPointer !== null;
      if (pred.target === 'spec') return inputs.specPointer !== null;
      throw new WorkflowError(`derive 'pointer-set' has unknown target '${pred.target ?? ''}' (expected design|spec)`);
    case 'node-marker':
      if (pred.target === 'analyze-clean') return inputs.analyzeClean;
      if (pred.target === 'design-approved') return inputs.designApproved;
      throw new WorkflowError(`derive 'node-marker' has unknown target '${pred.target ?? ''}'`);
    case 'record-converged':
      if (pred.target === 'impl') return inputs.implRecordConverged;
      if (pred.target === 'spec') return inputs.specRecordConverged;
      throw new WorkflowError(`derive 'record-converged' has unknown target '${pred.target ?? ''}' (expected impl|spec)`);
    case 'tasks-complete':
      return inputs.tasksComplete;
    case 'release-tagged':
      return inputs.releaseTagged;
    case 'status-is':
      // 032 (ship-stage) FR-007: the recorded node `status:` equals the predicate's
      // target (e.g. `status-is shipped`). The post-merge `validating` phase derives
      // from `status-is shipped` — the SAME recorded status the close gate reads, so
      // the derived phase and the close gate cannot diverge. NO marker-absence here
      // (the `validated` marker is the validating→closed gate, not a derive input; F1).
      if (pred.target === undefined || pred.target.length === 0) {
        throw new WorkflowError(`derive 'status-is' requires a status value (e.g. 'status-is shipped')`);
      }
      return (inputs.status?.toLowerCase() ?? null) === pred.target.toLowerCase();
    case 'never':
      // By-name-only sentinel (031): NEVER placed by the artifact loop. A phase
      // with `derive: never` (the terminal `closed`) is reached solely by the
      // recorded-status by-name rule — closing is an explicit operator action,
      // not an artifact a release tag or convergence record could stand in for.
      return false;
    default: {
      const exhaustive: never = pred.kind;
      throw new WorkflowError(`unhandled derive kind '${String(exhaustive)}'`);
    }
  }
}

/** Map a node status / blocked flag to a terminal side-state, or null. */
function sideStateOf(inputs: DerivationInputs): DerivedPhase | null {
  const status = inputs.status?.toLowerCase() ?? null;
  if (status !== null && (SIDE_STATES as readonly string[]).includes(status)) {
    return { kind: 'side-state', id: status as (typeof SIDE_STATES)[number] };
  }
  if (inputs.blocked) return { kind: 'side-state', id: 'blocked' };
  return null;
}

/**
 * Derive an item's current phase from the governed lifecycle + observed inputs.
 * Terminal side-states win; otherwise the most-advanced phase (walking the doc's
 * ordered phase list from last to first) whose derive predicate holds; the first
 * phase is the total fallback.
 */
export function derivePhase(doc: WorkflowDoc, inputs: DerivationInputs): DerivedPhase {
  const side = sideStateOf(inputs);
  if (side !== null) return side;

  // A recorded roadmap status that NAMES a post-graduation, work-less phase
  // (`work: (none)` — `shipped` / `closed` in the bundled lifecycle) is an
  // operator-recorded terminal FACT: derive that phase BY NAME (031 FR-014, clean
  // break), rather than re-deriving from a convergence record a pre-workflow
  // process never wrote. This is a PURE by-name rule over the governed doc — NOT a
  // hardcoded `shipped`/`closed` enumeration and NOT the doc's positional last
  // phase (adding `closed` after `shipped` makes `shipped` no longer array-last, so
  // a positional `phases[last]` would mis-derive a `shipped` item as `closed`).
  //
  // It mirrors the recorded-fact discipline of `cancelled`/`retired` (handled by
  // sideStateOf) and the `analyze-clean:`/`design-approved:` markers — the operator
  // records, derivation reads. It is scoped to WORK-LESS phases so a status that
  // also names an ACTIVE (work-bearing) phase (e.g. `planned`) still derives
  // through the predicate chain: a `planned` item whose artifacts have advanced is
  // mid-pipeline, not pinned to its un-updated status.
  const status = inputs.status?.toLowerCase() ?? null;
  if (status !== null) {
    const byName = doc.phases.find((p) => p.id === status);
    if (byName !== undefined && (byName.work === '(none)' || byName.work.length === 0)) {
      return { kind: 'phase', id: byName.id };
    }
  }

  for (let i = doc.phases.length - 1; i >= 0; i--) {
    const phase = doc.phases[i]!;
    if (deriveHolds(phase.derive, inputs)) return { kind: 'phase', id: phase.id };
  }
  // Totality: the first phase is the entry point when no predicate holds.
  return { kind: 'phase', id: doc.phases[0]!.id };
}
