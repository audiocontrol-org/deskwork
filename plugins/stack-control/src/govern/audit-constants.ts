// Implement-mode audit prompt constants — the CODE-diff "What to look for" lens and the
// "Under audit" artifact framing fed to the cross-model barrage. Pure data (no per-mode
// logic). Extracted from the retired monolithic `payload-implement.ts` (030 T085) so the
// whole-feature end-govern runtime can read them without the deleted assembler.

/**
 * Implement-mode audit lens bullets — the prompt's "What to look for" checklist for a
 * CODE diff. A single source array so the full lens (`CODE_AUDIT_LENS`) and the
 * code-only lens (`CODE_AUDIT_LENS_CODE_ONLY`, 034 FR-010) are derived from the SAME
 * data and cannot drift apart. The doc-drift bullet is held in its own constant so the
 * code-only variant can filter it out without a second hand-maintained list.
 */
const DOC_DRIFT_BULLET =
  '- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior ' +
  'the code actually implements? If the spec changed, did the implementation? If the ' +
  'implementation changed, did the spec?';

const CODE_AUDIT_LENS_BULLETS: readonly string[] = [
  '- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.',
  '- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don\'t, configuration that should be data ending up as code.',
  '- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?',
  '- **Code-quality concerns** — files growing past a reasonable cap, names that don\'t reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don\'t test the contract they claim to test.',
  '- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?',
  DOC_DRIFT_BULLET,
  '- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.',
];

/**
 * Implement-mode audit lens — the prompt's "What to look for" section for a CODE diff.
 * The audit-barrage template's 7-bullet checklist, hoisted out so implement-mode behavior
 * is byte-identical with the lens as a per-mode VAR. The render is mode-agnostic; the lens
 * is data.
 */
export const CODE_AUDIT_LENS = CODE_AUDIT_LENS_BULLETS.join('\n');

/**
 * Code-only variant of the implement-mode audit lens (034 FR-010 / SC-006): the same
 * checklist minus the documentation-drift bullet, for use when the audited payload has
 * been scoped to exclude documentation files (`resolveCodeScopePolicy`'s `codeOnly`
 * filter) — asking the fleet to flag doc drift over a payload that no longer contains
 * docs produces a structurally-unanswerable finding.
 */
export const CODE_AUDIT_LENS_CODE_ONLY = CODE_AUDIT_LENS_BULLETS.filter(
  (bullet) => bullet !== DOC_DRIFT_BULLET,
).join('\n');

/**
 * Implement-mode artifact framing — the prompt's "Under audit" lead-in for a CODE diff.
 * Verbatim the audit-barrage template's "Diff under audit" descriptive paragraph.
 */
export const CODE_ARTIFACT_FRAMING =
  'The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn\'t).';
