// The lifecycle compass verdict (024 US1 / FR-001..FR-003). A PURE diff of an
// intended action's phase against an item's live derived phase, over the governed
// doc's ORDERED phase list — it reuses 022 derivation (no reimplementation of phase
// logic, FR-007). The verdict + its exit code let a skill body gate mechanically
// (FR-003) so an agent following its skills cannot skip a step. Read-only: this
// module computes; it never writes (FR-005).

import type { Criterion, DerivedPhase, PhaseId, Verdict, WorkflowDoc } from './workflow-types.js';
import { VERDICT_EXIT } from './workflow-types.js';
import { describeCriterion } from './gate-eval.js';
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
  unmetGate: readonly string[] = [],
): Verdict {
  return { outcome, currentPhase, intentPhase, legitimateNext, skippedStep, unmetGate, reason, exitCode: VERDICT_EXIT[outcome] };
}

export interface ComputeVerdictArgs {
  readonly doc: WorkflowDoc;
  /** The item's derived current phase (from 022 `derivePhase`). */
  readonly currentPhase: DerivedPhase;
  /** The resolved intent (phase-bearing or phase-neutral). Unknown intents are rejected by the caller (FR-004). */
  readonly intent: IntentResolution;
  /** Whether a roadmap node exists for the item (false ⇒ orphan ⇒ off-rail). */
  readonly hasNode: boolean;
  /**
   * The UNMET exit-gate criteria of the legitimate-next transition out of the current phase
   * (T040/codex-01). When the intent targets that next phase (a graduation like `release`/`ship`
   * → `shipped`) but this is non-empty, the verdict is `ahead` (refuse) instead of `on-course` —
   * the compass cannot say "go" while the transition's gate (e.g. `record-converged impl`) is
   * unmet. Empty (default) when the gate is met or the caller doesn't supply it.
   */
  readonly nextGateUnmet?: readonly Criterion[];
  /**
   * 032 US3 (FR-009/FR-012) — the id of a merged-but-status-in-flight item found over the
   * roadmap (the off-rail residual), or null/undefined when none dangles. While one dangles,
   * forward lifecycle motion for ANY OTHER item is refused (off-rail), naming it + the reconcile
   * command. EXEMPTION (FR-010): when `intentItem === danglingMergedItem` the backstop is dormant
   * — the dangling item's own reconcile (advance to shipped) must never be blocked.
   */
  readonly danglingMergedItem?: string | null;
  /** 032 US3 — the id of the item this verdict is being computed FOR (the backstop exemption key). */
  readonly intentItem?: string;
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
  const nextGateUnmet = args.nextGateUnmet ?? [];

  // 032 US3 backstop (FR-009/FR-010): while a merged-but-status-in-flight item exists, refuse
  // forward lifecycle motion — naming the dangling item + the reconcile command. The ONLY thing
  // exempt is the dangling item's own RECONCILE: a phase-bearing intent ON the dangling item that
  // is at-or-before its current phase (e.g. `ship` → its `merging` phase, which fires graduate to
  // record shipped). A FORWARD intent on the dangling item (e.g. `release` → `validating`) is NOT
  // exempt — it would let the off-rail item advance past merge before its status is recorded
  // (AUDIT-20260623-02). Phase-NEUTRAL intents (session-end) are never backstop-refused
  // (session-skills-never-block). Cross-item invariant: overrides the per-item phase diff below.
  const dangling = args.danglingMergedItem ?? null;
  if (dangling !== null && intent.kind === 'phase') {
    const intentOrd = ordinal(doc, intent.phase!);
    const curOrd = currentPhase.kind === 'phase' ? ordinal(doc, currentPhase.id) : -1;
    const isReconcileOfDangling = args.intentItem === dangling && intentOrd <= curOrd;
    if (!isReconcileOfDangling) {
      return mk('off-rail', currentPhase, intent.phase, null, null,
        `a merged-but-status-in-flight item exists ('${dangling}') — forward lifecycle motion is ` +
          `blocked until it is reconciled; run \`stackctl workflow advance ${dangling} --apply\` ` +
          `(or \`stackctl roadmap advance ${dangling} --to shipped --apply\`) to record its status, then retry`);
    }
  }

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
    // T040/codex-01: the next phase is ordinally legitimate, but if the transition's exit gate
    // is UNMET the move is not actually available — refuse (`ahead`) naming the unmet gate, so
    // the compass cannot green-light a graduation (`release`/`ship`) without its gate satisfied.
    if (nextGateUnmet.length > 0) {
      const names = nextGateUnmet.map(describeCriterion);
      return mk('ahead', currentPhase, intentId, nextId, null,
        `'${intentId}' targets the legitimate next phase '${nextId}', but its exit gate is unmet ` +
          `(${names.join('; ')}) — complete the current phase's work first`,
        names);
    }
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
