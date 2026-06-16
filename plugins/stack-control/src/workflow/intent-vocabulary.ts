// The fixed intent vocabulary (024 US1 / FR-004). An intent is a lifecycle
// skill/verb name an agent declares it is about to act with; the compass maps it
// to the lifecycle phase that action belongs to and diffs against the derived
// current phase. The mapping is a FIXED enumeration single-sourced from the
// governed WORKFLOW.md — built by inverting each phase's `work:` skill, plus a
// small fixed set of transition aliases. An unknown intent is NOT classified (the
// caller fails loud) — a heuristic NL→phase mapping would reintroduce the agent
// judgment this feature removes (FR-004, clarification 2026-06-16).

import type { PhaseId, WorkflowDoc } from './workflow-types.js';

/** Strip a `<plugin>:` namespace prefix from a work-skill name (`stack-control:design` → `design`). */
function shortName(work: string): string {
  const colon = work.lastIndexOf(':');
  return colon >= 0 ? work.slice(colon + 1) : work;
}

/**
 * Fixed transition / verb aliases that are not a phase's own `work:` skill but name
 * an intent against a phase: `govern` (the after_implement hook), `ship`/`release`
 * (the back-half graduate target), and the `specify`/`speckit-*` skill aliases.
 * Each VALUE is a phase id that MUST exist in the governed doc (validated below).
 */
const ALIAS_TO_PHASE: ReadonlyArray<readonly [string, PhaseId]> = [
  ['specify', 'specifying'],
  ['speckit-specify', 'specifying'],
  ['speckit-implement', 'implementing'],
  ['govern', 'governing'],
  ['ship', 'shipped'],
  ['release', 'shipped'],
];

/**
 * Phase-NEUTRAL finishing intents: they run at any phase to capture/close, so they
 * are never "ahead"/"behind" on phase grounds — only `off-rail` when there is no
 * node. `session-end` is the canonical case (the journal-capture skill).
 */
const PHASE_NEUTRAL_INTENTS: ReadonlySet<string> = new Set(['session-end']);

/**
 * Build the fixed intent→phase map from the governed doc (FR-007 single-source).
 * Inverts each work-bearing phase's `work:` skill (the EARLIEST phase wins when two
 * phases share a work skill — e.g. `execute` resolves to `implementing`, not the
 * later `governing`), then layers the fixed aliases. A phase work-skill that cannot
 * be normalized, or an alias whose target phase is absent from the doc, is a
 * load-time error (the vocabulary must stay coherent with the phases).
 */
export function buildIntentVocabulary(doc: WorkflowDoc): ReadonlyMap<string, PhaseId> {
  const phaseIds = new Set(doc.phases.map((p) => p.id));
  const vocab = new Map<string, PhaseId>();
  // Walk phases in declared (forward) order so the EARLIEST phase wins a shared skill.
  for (const phase of doc.phases) {
    if (phase.work === '(none)' || phase.work.length === 0) continue;
    const name = shortName(phase.work);
    if (name.length === 0) {
      throw new Error(`intent-vocabulary: phase '${phase.id}' has an unmappable work skill '${phase.work}'`);
    }
    if (!vocab.has(name)) vocab.set(name, phase.id);
  }
  for (const [alias, phase] of ALIAS_TO_PHASE) {
    if (!phaseIds.has(phase)) {
      throw new Error(`intent-vocabulary: alias '${alias}' targets phase '${phase}', which is not in WORKFLOW.md`);
    }
    vocab.set(alias, phase);
  }
  return vocab;
}

/** The resolution of an intent name against the governed lifecycle. */
export interface IntentResolution {
  readonly kind: 'phase' | 'neutral';
  /** The phase the intent maps to (`kind: 'phase'`); null for a phase-neutral intent. */
  readonly phase: PhaseId | null;
}

/**
 * Resolve an intent name. A phase-bearing intent → its phase; a phase-neutral
 * finishing intent → `{ kind: 'neutral' }`; an unknown intent → null (the caller
 * fails loud per FR-004 — never a silent `on-course`).
 */
export function resolveIntent(doc: WorkflowDoc, name: string): IntentResolution | null {
  if (PHASE_NEUTRAL_INTENTS.has(name)) return { kind: 'neutral', phase: null };
  const phase = buildIntentVocabulary(doc).get(name);
  return phase === undefined ? null : { kind: 'phase', phase };
}

/** The recognized intent names (for the fail-loud "unknown intent" message). */
export function knownIntents(doc: WorkflowDoc): readonly string[] {
  return [...buildIntentVocabulary(doc).keys(), ...PHASE_NEUTRAL_INTENTS].sort();
}
