// The shared lifecycle-skill precondition (024 US2 / FR-006/FR-007). Every
// lifecycle skill OPENS by consulting the compass for its item with its OWN action
// as the intent, and refuses loud — performing none of its work — on a non-zero
// verdict. The lifecycle rules live in exactly ONE place (the compass + the governed
// WORKFLOW.md), invoked through this helper; skills do not re-encode the gate. This
// is the enforcement surface that turns the compass from an advisory map into the
// thing an agent following its skills cannot skip. Enforcement lives in the skill
// body + this verb — never a git hook (`enforcement-lives-in-skills.md`).

import { resolveCompass } from './workflow/compass-resolve.js';
import { computeVerdict } from './workflow/compass.js';
import { knownIntents, resolveIntent } from './workflow/intent-vocabulary.js';
import { WorkflowError, type Verdict } from './workflow/workflow-types.js';

export interface PreconditionResult {
  /** True iff the verdict permits proceeding (`on-course` / `behind`, exit code 0). */
  readonly proceed: boolean;
  readonly verdict: Verdict;
}

export interface PreconditionArgs {
  /** The roadmap item the skill operates on. */
  readonly item: string;
  /** The skill's own action name (a known intent — FR-004). */
  readonly intent: string;
  /** The directory whose enclosing installation to resolve (defaults to cwd). */
  readonly cwd?: string;
}

/**
 * Compute the compass precondition for a lifecycle skill (FR-006). A non-zero
 * verdict ⇒ `proceed: false` with the verdict's reason + skipped step, so the
 * caller emits a uniform refusal and performs no work. An unknown intent is a
 * caller error (a skill passes its OWN known name) → fail loud (FR-004), never a
 * silent proceed.
 */
export function checkLifecyclePrecondition(args: PreconditionArgs): PreconditionResult {
  // 032 US3 (AUDIT-20260623-08): this shared gate backs EVERY lifecycle skill's precondition AND
  // `govern --item`, so it MUST thread the off-rail backstop signal `resolveCompass` computes —
  // otherwise a merged-but-status-in-flight item would block the compass CLI but NOT the
  // skill/govern preconditions (a backstop hole). `computeVerdict`'s now-required
  // `danglingMergedItem` + `intentItem` make this non-droppable (the compiler enforces it).
  const { doc, hasNode, currentPhase, nextGateUnmet, danglingMergedItem } = resolveCompass(
    args.cwd ?? process.cwd(),
    args.item,
  );
  const intent = resolveIntent(doc, args.intent);
  if (intent === null) {
    throw new WorkflowError(
      `lifecycle precondition: unknown intent '${args.intent}' (known: ${knownIntents(doc).join(', ')})`,
    );
  }
  const verdict = computeVerdict({
    doc, currentPhase, intent, hasNode, nextGateUnmet,
    danglingMergedItem, intentItem: args.item,
  });
  return { proceed: verdict.exitCode === 0, verdict };
}
