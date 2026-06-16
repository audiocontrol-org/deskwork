// Shared compass resolution (024 US1/US2). The CLI verb (`workflow compass`) and
// the lifecycle-skill precondition both need the same thing: resolve the
// installation + governed doc + roadmap item, then derive the item's current phase
// (a no-node item is at the pre-node entry phase → off-rail). Factoring it here
// keeps the verdict path single-sourced (no per-caller drift, FR-007).

import { resolveInstallation } from '../config/installation.js';
import { loadRoadmap, type WorkItem } from '../roadmap/roadmap-model.js';
import { grammarOptsForRoot } from '../subcommands/document-verb-shared.js';
import { loadWorkflowDoc } from './workflow-grammar.js';
import { buildItemContext } from './workflow-context.js';
import { derivePhase } from './phase-derivation.js';
import type { GateContext } from './gate-eval.js';
import type { DerivedPhase, WorkflowDoc } from './workflow-types.js';

export interface ResolvedCompass {
  readonly root: string;
  readonly doc: WorkflowDoc;
  /** The roadmap item, or null when no node exists for the id (orphan → off-rail). */
  readonly item: WorkItem | null;
  readonly hasNode: boolean;
  readonly currentPhase: DerivedPhase;
  /** The gate context (null when there is no node). */
  readonly gate: GateContext | null;
}

/** Resolve the compass inputs for an item id under the installation enclosing `cwd`. */
export function resolveCompass(cwd: string, itemId: string): ResolvedCompass {
  const inst = resolveInstallation(cwd);
  const doc = loadWorkflowDoc(inst.root);
  const model = loadRoadmap(inst.resolved.roadmap, grammarOptsForRoot(inst.root));
  const item = model.byId.get(itemId) ?? null;
  if (item === null) {
    return { root: inst.root, doc, item: null, hasNode: false, currentPhase: { kind: 'phase', id: doc.phases[0]!.id }, gate: null };
  }
  const { inputs, gate } = buildItemContext(inst.root, item);
  return { root: inst.root, doc, item, hasNode: true, currentPhase: derivePhase(doc, inputs), gate };
}
