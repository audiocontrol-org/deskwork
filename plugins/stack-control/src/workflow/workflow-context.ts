// Build the derivation inputs + gate context for a roadmap item (022 US1/US2
// integration). The pure derivation function and the gate evaluator both consume
// observed artifacts; this is the one place those artifacts are READ from disk
// (roadmap node fields, the convergence records, tasks.md, the design record),
// each resolved through the installation anchor (FR-030). Kept separate from the
// CLI dispatch so the query/advance verbs stay thin.

import { isAbsolute, join } from 'node:path';
import { isModeConverged } from '../govern/convergence-record.js';
import type { WorkItem } from '../roadmap/roadmap-model.js';
import { evaluateCriterion, type GateContext } from './gate-eval.js';
import type { DerivationInputs } from './phase-derivation.js';

export interface ItemContext {
  readonly inputs: DerivationInputs;
  readonly gate: GateContext;
}

/** Resolve an install-anchored pointer to an absolute path (null when unset). */
function anchored(installationRoot: string, pointer: string | null): string | null {
  if (pointer === null) return null;
  return isAbsolute(pointer) ? pointer : join(installationRoot, pointer);
}

/**
 * Build the derivation inputs + gate context for a roadmap `WorkItem`. The advance
 * tree is assumed clean for read-only queries; the advance path overrides
 * `advanceTreeClean` with the real git status of its touched paths.
 */
export function buildItemContext(
  installationRoot: string,
  item: WorkItem,
  opts?: { readonly advanceTreeClean?: boolean; readonly releaseTagged?: boolean; readonly blocked?: boolean },
): ItemContext {
  const designRecordPath = anchored(installationRoot, item.design);
  const specDirPath = anchored(installationRoot, item.spec);
  const implRecordConverged = isModeConverged(installationRoot, 'impl', item.identifier);
  const specRecordConverged = isModeConverged(installationRoot, 'spec', item.identifier);

  const gate: GateContext = {
    installationRoot,
    item: item.identifier,
    designPointer: item.design,
    specPointer: item.spec,
    analyzeClean: item.analyzeClean,
    designApproved: item.designApproved,
    designRecordPath,
    specDirPath,
    implRecordConverged,
    specRecordConverged,
    advanceTreeClean: opts?.advanceTreeClean ?? true,
  };

  const tasksComplete = evaluateCriterion({ kind: 'tasks-complete', target: 'spec' }, gate);

  const inputs: DerivationInputs = {
    hasNode: true,
    inBacklog: false,
    status: item.status,
    designPointer: item.design,
    specPointer: item.spec,
    analyzeClean: item.analyzeClean,
    designApproved: item.designApproved,
    tasksComplete,
    implRecordConverged,
    specRecordConverged,
    releaseTagged: opts?.releaseTagged ?? false,
    blocked: opts?.blocked ?? false,
  };

  return { inputs, gate };
}
