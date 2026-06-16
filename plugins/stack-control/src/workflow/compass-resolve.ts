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
import { evaluateGate, type GateContext } from './gate-eval.js';
import type { Criterion, DerivedPhase, WorkflowDoc } from './workflow-types.js';

export interface ResolvedCompass {
  readonly root: string;
  readonly doc: WorkflowDoc;
  /** The roadmap item, or null when no node exists for the id (orphan → off-rail). */
  readonly item: WorkItem | null;
  readonly hasNode: boolean;
  readonly currentPhase: DerivedPhase;
  /** The gate context (null when there is no node). */
  readonly gate: GateContext | null;
  /**
   * The UNMET exit-gate criteria of the legitimate-next transition out of `currentPhase`
   * (T040). Fed to `computeVerdict` so a graduation intent is refused when its gate is unmet.
   * Empty when there is no node / side-state / terminal phase / the gate is met.
   */
  readonly nextGateUnmet: readonly Criterion[];
}

/** Unmet exit-gate criteria of the forward transition out of `currentPhase` (empty when none/met). */
function nextTransitionExitGateUnmet(
  doc: WorkflowDoc,
  currentPhase: DerivedPhase,
  gate: GateContext | null,
): readonly Criterion[] {
  if (gate === null || currentPhase.kind !== 'phase') return [];
  const phase = doc.phases.find((p) => p.id === currentPhase.id);
  const nextId = phase?.next ?? null;
  if (nextId === null) return [];
  const transition = doc.transitions.find((t) => t.from === currentPhase.id && t.to === nextId);
  if (transition === undefined) return [];
  return evaluateGate(transition.exitGate, gate).unmet;
}

/** Resolve the compass inputs for an item id under the installation enclosing `cwd`. */
export function resolveCompass(cwd: string, itemId: string): ResolvedCompass {
  const inst = resolveInstallation(cwd);
  const doc = loadWorkflowDoc(inst.root);
  const model = loadRoadmap(inst.resolved.roadmap, grammarOptsForRoot(inst.root));
  const item = model.byId.get(itemId) ?? null;
  if (item === null) {
    return {
      root: inst.root, doc, item: null, hasNode: false,
      currentPhase: { kind: 'phase', id: doc.phases[0]!.id }, gate: null, nextGateUnmet: [],
    };
  }
  const { inputs, gate } = buildItemContext(inst.root, item);
  const currentPhase = derivePhase(doc, inputs);
  return {
    root: inst.root, doc, item, hasNode: true, currentPhase, gate,
    nextGateUnmet: nextTransitionExitGateUnmet(doc, currentPhase, gate),
  };
}
