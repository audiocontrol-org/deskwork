// Build the derivation inputs + gate context for a roadmap item (022 US1/US2
// integration). The pure derivation function and the gate evaluator both consume
// observed artifacts; this is the one place those artifacts are READ from disk
// (roadmap node fields, the convergence records, tasks.md, the design record),
// each resolved through the installation anchor (FR-030). Kept separate from the
// CLI dispatch so the query/advance verbs stay thin.

import { isModeConverged } from '../govern/convergence-record.js';
import type { WorkItem } from '../roadmap/roadmap-model.js';
import { anchorWithin } from './anchor.js';
import { convergenceKeyFor } from './identity.js';
import { evaluateCriterion, type GateContext } from './gate-eval.js';
import type { DerivationInputs } from './phase-derivation.js';

export interface ItemContext {
  readonly inputs: DerivationInputs;
  readonly gate: GateContext;
}

/** Resolve an install-anchored pointer to an absolute path (null when unset); fail loud on escape. */
function anchored(installationRoot: string, pointer: string | null): string | null {
  if (pointer === null) return null;
  return anchorWithin(installationRoot, pointer);
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
  // The govern-convergence record is keyed by the CANONICAL node id (024 FR-013 /
  // TASK-139) — never the spec-dir basename, which collides across two features
  // whose spec dirs share a basename. govern's write side resolves the same node
  // id via `resolveIdentityFromSpecDir`, so read and write agree.
  const convergenceKey = convergenceKeyFor(item);
  const implRecordConverged = isModeConverged(installationRoot, 'impl', convergenceKey);
  const specRecordConverged = isModeConverged(installationRoot, 'spec', convergenceKey);

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
