// Substantive-reason validator for the inline-wontfix disposition.
//
// Mechanically enforces the project rule that "Just for now" / "next pass" /
// "will fix later" style hedges are not valid dispositions: a wontfix must
// carry a substantive reason that documents WHY the work won't happen.
//
// Two gates:
//   1. ≥40 characters after trim (forces enough text to constitute an
//      explanation rather than a one-word dismissal).
//   2. No gaming phrases (case-insensitive substring or word-boundary match
//      depending on the phrase shape).
//
// The banned-phrase list is intentionally a built-in constant in this file.
// If operators want to tune it per project, that's an operator-overrides
// concern that lives outside this dispatch's scope.

export interface SubstantiveReasonValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

// Minimum character count after trim. Tuned to roughly one short-sentence's
// worth of text — enough to force a real explanation; not so high that an
// honest one-liner gets refused.
const MIN_LENGTH_AFTER_TRIM = 40;

// Banned-phrase rules. Each rule is either a literal substring (case-
// insensitive) or a regex. The regex form is reserved for word-boundary
// matches where a bare substring would over-match.
interface BannedPhraseRule {
  readonly display: string; // operator-facing label in the rejection message
  readonly match: { readonly kind: 'substring'; readonly value: string }
    | { readonly kind: 'regex'; readonly pattern: RegExp };
}

const BANNED_PHRASES: readonly BannedPhraseRule[] = [
  // Substring matches — case-insensitive contains check.
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
  { display: 'deferred', match: { kind: 'substring', value: 'deferred' } },
  { display: 'todo', match: { kind: 'regex', pattern: /\btodo\b/i } },
  { display: 'fixme', match: { kind: 'regex', pattern: /\bfixme\b/i } },
  // Bare-token `later` — refuses the standalone word but not compounds like
  // "later-version" or "later-stage". Uses non-word-char (excluding `-`)
  // boundaries: the match fires when `later` is bounded by whitespace,
  // line-edges, or punctuation other than `-`. This is tighter than
  // `\blater\b`, which treats `-` as a word boundary and over-matches.
  {
    display: 'later (standalone word)',
    match: { kind: 'regex', pattern: /(?:^|[\s.,;:!?()'"])later(?=$|[\s.,;:!?()'"])/i },
  },
  // "follow up" / "follow-up" as a verb phrase. Word-boundary on each end to
  // avoid hitting `follow-uplift` or similar oddities.
  {
    display: 'follow up / follow-up',
    match: { kind: 'regex', pattern: /\bfollow[- ]up\b/i },
  },
];

function matchesRule(text: string, rule: BannedPhraseRule): boolean {
  if (rule.match.kind === 'substring') {
    return text.toLowerCase().includes(rule.match.value.toLowerCase());
  }
  return rule.match.pattern.test(text);
}

export function validateSubstantiveReason(
  input: string,
): SubstantiveReasonValidationResult {
  if (typeof input !== 'string') {
    return {
      valid: false,
      reason: 'reason must be a string.',
    };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      reason: 'reason is empty after trimming whitespace.',
    };
  }
  if (trimmed.length < MIN_LENGTH_AFTER_TRIM) {
    return {
      valid: false,
      reason: `reason is ${trimmed.length} characters after trim; minimum is ${MIN_LENGTH_AFTER_TRIM}.`,
    };
  }
  const hits: string[] = [];
  for (const rule of BANNED_PHRASES) {
    if (matchesRule(trimmed, rule)) {
      hits.push(rule.display);
    }
  }
  if (hits.length > 0) {
    return {
      valid: false,
      reason: `reason contains banned hedge phrase(s): ${hits.join(', ')}. Write a substantive explanation instead.`,
    };
  }
  return { valid: true };
}

// Surfaced for tests that want to assert the canonical banned list.
export function bannedPhraseDisplayNames(): readonly string[] {
  return BANNED_PHRASES.map((r) => r.display);
}

export const MIN_REASON_LENGTH = MIN_LENGTH_AFTER_TRIM;
