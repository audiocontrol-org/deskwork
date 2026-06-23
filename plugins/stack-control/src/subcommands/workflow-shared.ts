// Shared resolution + helpers for the `stackctl workflow <subaction>` surface
// (022). Extracted from workflow.ts (032 R7 / T001) so the read-only query verbs
// (workflow.ts) and the mutating advance/link/redesign verbs (workflow-advance.ts)
// share ONE resolution path without a circular import, and each file stays under
// the size cap as the ship/backstop wiring lands.

import { resolveInstallation } from '../config/installation.js';
import { loadRoadmap, type WorkItem } from '../roadmap/roadmap-model.js';
import { grammarOptsForRoot } from './document-verb-shared.js';
import { loadWorkflowDoc } from '../workflow/workflow-grammar.js';
import type { Phase, Transition, WorkflowDoc } from '../workflow/workflow-types.js';
import type { LoadOptions } from '../document-model/document.js';

/** Fail-loud usage exit shared by every workflow subaction (exit 2). */
export function failUsage(message: string): never {
  process.stderr.write(`workflow: ${message}\n`);
  process.exit(2);
}

export interface Resolved {
  readonly root: string;
  readonly doc: WorkflowDoc;
  readonly item: WorkItem;
  readonly roadmapPath: string;
  readonly journalPath: string;
  readonly opts: LoadOptions;
}

/** Resolve the installation, governed doc, and the named roadmap item. */
export function resolve(itemId: string): Resolved {
  const inst = resolveInstallation(process.cwd());
  const doc = loadWorkflowDoc(inst.root);
  const opts = grammarOptsForRoot(inst.root);
  const model = loadRoadmap(inst.resolved.roadmap, opts);
  const item = model.byId.get(itemId);
  if (item === undefined) {
    failUsage(`no roadmap item '${itemId}' (known: ${[...model.byId.keys()].join(', ') || '(none)'})`);
  }
  return {
    root: inst.root,
    doc,
    item,
    roadmapPath: inst.resolved.roadmap,
    journalPath: inst.resolved.journal,
    opts,
  };
}

export function phaseById(doc: WorkflowDoc, id: string): Phase | undefined {
  return doc.phases.find((p) => p.id === id);
}

/** The forward transition out of `phase` (from → next), when one exists. */
export function forwardTransition(doc: WorkflowDoc, phase: Phase): Transition | undefined {
  if (phase.next === null) return undefined;
  return doc.transitions.find((t) => t.from === phase.id && t.to === phase.next);
}
