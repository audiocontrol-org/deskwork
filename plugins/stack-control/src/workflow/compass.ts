// The lifecycle compass verdict (024 US1 / FR-001..FR-003). A PURE diff of an
// intended action's phase against an item's live derived phase, over the governed
// doc's ORDERED phase list — it reuses 022 derivation (no reimplementation of phase
// logic, FR-007). The verdict + its exit code let a skill body gate mechanically
// (FR-003) so an agent following its skills cannot skip a step. Read-only: this
// module computes; it never writes (FR-005).

import type { DerivedPhase, PhaseId, Verdict, WorkflowDoc } from './workflow-types.js';
import { VERDICT_EXIT } from './workflow-types.js';
import type { IntentResolution } from './intent-vocabulary.js';

/** The ordinal of a phase id in the doc's ordered pipeline (−1 when absent). */
function ordinal(doc: WorkflowDoc, id: PhaseId): number {
  return doc.phases.findIndex((p) => p.id === id);
}

/** The single legitimate next phase out of `currentId` (the phase's `next`), or null at a terminal phase. */
export function legitimateNextPhase(doc: WorkflowDoc, currentId: PhaseId): PhaseId | null {
  const phase = doc.phases.find((p) => p.id === currentId);
  return phase?.next ?? null;
}

function mk(
  outcome: Verdict['outcome'],
  currentPhase: DerivedPhase,
  intentPhase: PhaseId | null,
  legitimateNext: PhaseId | null,
  skippedStep: PhaseId | null,
  reason: string,
): Verdict {
  return { outcome, currentPhase, intentPhase, legitimateNext, skippedStep, reason, exitCode: VERDICT_EXIT[outcome] };
}

export interface ComputeVerdictArgs {
  readonly doc: WorkflowDoc;
  /** The item's derived current phase (from 022 `derivePhase`). */
  readonly currentPhase: DerivedPhase;
  /** The resolved intent (phase-bearing or phase-neutral). Unknown intents are rejected by the caller (FR-004). */
  readonly intent: IntentResolution;
  /** Whether a roadmap node exists for the item (false ⇒ orphan ⇒ off-rail). */
  readonly hasNode: boolean;
}

/**
 * Compute the compass verdict (FR-002). `off-rail` wins first (no node, or a
 * terminal side-state — there is no legitimate linear move). A phase-neutral
 * finishing intent (session-end) is `on-course` on any pipeline node. Otherwise the
 * intent's phase ordinal is diffed against the legitimate next: equal ⇒ on-course;
 * ≤ current ⇒ behind (re-entry/redundant, allowed); later ⇒ ahead, naming the first
 * skipped step.
 */
export function computeVerdict(args: ComputeVerdictArgs): Verdict {
  const { doc, currentPhase, intent, hasNode } = args;

  // off-rail: orphan (no node) or a terminal side-state — refuse linear advancement.
  if (!hasNode) {
    return mk('off-rail', currentPhase, intent.phase, null, null,
      'no roadmap node for this item — capture it first (off-rail; the front door creates the node)');
  }
  if (currentPhase.kind === 'side-state') {
    return mk('off-rail', currentPhase, intent.phase, null, null,
      `item is in terminal side-state '${currentPhase.id}'; induct it back to resume (off-rail)`);
  }

  const currentId = currentPhase.id;
  const nextId = legitimateNextPhase(doc, currentId);

  // Phase-neutral finishing intent (session-end): always on-course on a real node.
  if (intent.kind === 'neutral') {
    return mk('on-course', currentPhase, null, nextId, null,
      `finishing intent on a '${currentId}' item (allowed; orients the close)`);
  }

  const intentId = intent.phase!;
  const currentOrd = ordinal(doc, currentId);
  const intentOrd = ordinal(doc, intentId);
  const nextOrd = nextId === null ? -1 : ordinal(doc, nextId);

  if (nextId !== null && intentOrd === nextOrd) {
    return mk('on-course', currentPhase, intentId, nextId, null,
      `'${intentId}' is the legitimate next move from '${currentId}'`);
  }
  if (intentOrd <= currentOrd) {
    return mk('behind', currentPhase, intentId, nextId, null,
      `'${intentId}' is at or before the current phase '${currentId}' — re-entry/redundant (allowed)`);
  }
  // ahead: a later phase than the legitimate next — the immediate next phase is the first skipped step.
  return mk('ahead', currentPhase, intentId, nextId, nextId,
    `'${intentId}' belongs to a later phase; the '${nextId}' step is skipped — do its work first`);
}
