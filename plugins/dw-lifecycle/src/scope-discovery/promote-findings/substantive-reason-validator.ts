/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/substantive-reason-validator.ts
 *
 * Substantive-reason validator for the `acknowledged` disposition path.
 *
 * Mechanically enforces the Phase 13 PRD discipline: a finding can be
 * dispositioned `acknowledged-<ref>` (deferral) only when the operator
 * supplies a substantive reason that documents WHY the work won't
 * happen. Two gates:
 *
 *   1. ≥40 characters after trim.
 *   2. No gaming phrases (case-insensitive substring OR word-boundary
 *      regex match depending on shape).
 *
 * The banned list duplicates the hygiene canon from
 * `../../promote-deferrals/substantive-reason.ts` verbatim (per Phase
 * 13 task brief: "duplicate the rules verbatim in this module's
 * BANNED_PHRASES constant"). Each skill owns its own gate so the
 * banned list IS the local contract — no cross-skill import of the
 * rule table.
 *
 * Phase 13 PRD additions beyond the hygiene canon:
 *   - `non-trivial`
 *   - `future work`
 *   - `deferred to vN` (regex)
 *   - `not in scope`
 *   - `come back to`
 *
 * The existing hygiene set already covers `for now`, `will fix later`,
 * and `TODO` — those are the overlap.
 */

export interface SubstantiveReasonValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

const MIN_LENGTH_AFTER_TRIM = 40;

interface BannedPhraseRule {
  readonly display: string;
  readonly match:
    | { readonly kind: 'substring'; readonly value: string }
    | { readonly kind: 'regex'; readonly pattern: RegExp };
}

// The banned-phrase canon. Phase 13 PRD-required entries are marked
// with `// P13:` for traceability; hygiene-canon entries duplicated
// verbatim from `promote-deferrals/substantive-reason.ts` carry no
// trailing comment. Order matters only for the message — hits are
// surfaced in iteration order.
const BANNED_PHRASES: readonly BannedPhraseRule[] = [
  // ===== Hygiene canon (duplicated verbatim) =====
  { display: 'for now', match: { kind: 'substring', value: 'for now' } },
  { display: 'just for now', match: { kind: 'substring', value: 'just for now' } },
  { display: 'next pass', match: { kind: 'substring', value: 'next pass' } },
  { display: 'TBD', match: { kind: 'regex', pattern: /\bTBD\b/i } },
  { display: 'will fix later', match: { kind: 'substring', value: 'will fix later' } },
  { display: 'will fix', match: { kind: 'substring', value: 'will fix' } },
  { display: 'will address', match: { kind: 'substring', value: 'will address' } },
  { display: 'address in', match: { kind: 'substring', value: 'address in' } },
  { display: 'fix later', match: { kind: 'substring', value: 'fix later' } },
  { display: 'eventually', match: { kind: 'substring', value: 'eventually' } },
  { display: 'tomorrow', match: { kind: 'substring', value: 'tomorrow' } },
  { display: 'next sprint', match: { kind: 'substring', value: 'next sprint' } },
  { display: 'next cycle', match: { kind: 'substring', value: 'next cycle' } },
  { display: 'next milestone', match: { kind: 'substring', value: 'next milestone' } },
  // 'deferred to v<N>' (PRD-named) before bare 'deferred' so the more-
  // specific match fires first and surfaces the PRD-mandated display name.
  { display: 'deferred to v<N>', match: { kind: 'regex', pattern: /\bdeferred to v\d+/i } },
  { display: 'deferred', match: { kind: 'substring', value: 'deferred' } },
  { display: 'todo', match: { kind: 'regex', pattern: /\btodo\b/i } },
  { display: 'fixme', match: { kind: 'regex', pattern: /\bfixme\b/i } },
  {
    display: 'later (standalone word)',
    match: { kind: 'regex', pattern: /(?:^|[\s.,;:!?()'"])later(?=$|[\s.,;:!?()'"])/i },
  },
  {
    display: 'follow up / follow-up',
    match: { kind: 'regex', pattern: /\bfollow[- ]up\b/i },
  },
  { display: 'HACK', match: { kind: 'regex', pattern: /\bHACK\b/i } },
  { display: 'XXX', match: { kind: 'regex', pattern: /\bXXX\b/i } },
  { display: 'temporary', match: { kind: 'regex', pattern: /\btemporary\b/i } },
  { display: 'stub', match: { kind: 'regex', pattern: /\bstub\b/i } },
  { display: 'placeholder', match: { kind: 'regex', pattern: /\bplaceholder\b/i } },
  { display: 'pending', match: { kind: 'regex', pattern: /\bpending\b/i } },
  { display: 'until F<phase>', match: { kind: 'regex', pattern: /until F\d+/i } },
  { display: 'until v<version>', match: { kind: 'regex', pattern: /until v\d+/i } },

  // ===== Phase 13 PRD additions =====
  // P13: from the task brief's "banned list MUST INCLUDE" list. The
  // 'deferred to v<N>' entry was promoted into the hygiene-canon section
  // above (before bare 'deferred') so the more-specific match fires first.
  { display: 'TODO', match: { kind: 'regex', pattern: /\bTODO\b/i } },
  { display: 'non-trivial', match: { kind: 'regex', pattern: /\bnon-trivial\b/i } },
  { display: 'future work', match: { kind: 'substring', value: 'future work' } },
  { display: 'not in scope', match: { kind: 'substring', value: 'not in scope' } },
  { display: 'come back to', match: { kind: 'substring', value: 'come back to' } },
];

function matchesRule(text: string, rule: BannedPhraseRule): boolean {
  if (rule.match.kind === 'substring') {
    return text.toLowerCase().includes(rule.match.value.toLowerCase());
  }
  return rule.match.pattern.test(text);
}

export function validateAcknowledgedReason(
  input: string,
): SubstantiveReasonValidationResult {
  if (typeof input !== 'string') {
    return { valid: false, reason: 'reason must be a string.' };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'reason is empty after trimming whitespace.' };
  }
  if (trimmed.length < MIN_LENGTH_AFTER_TRIM) {
    return {
      valid: false,
      reason: `reason is ${trimmed.length} characters after trim; minimum is ${MIN_LENGTH_AFTER_TRIM}.`,
    };
  }
  const hits: string[] = [];
  for (const rule of BANNED_PHRASES) {
    if (matchesRule(trimmed, rule)) hits.push(rule.display);
  }
  if (hits.length > 0) {
    return {
      valid: false,
      reason: `reason contains banned hedge phrase(s): ${hits.join(', ')}. Write a substantive explanation instead.`,
    };
  }
  return { valid: true };
}

export function bannedAcknowledgedPhraseDisplayNames(): readonly string[] {
  return BANNED_PHRASES.map((r) => r.display);
}

export const MIN_REASON_LENGTH = MIN_LENGTH_AFTER_TRIM;
