/**
 * Rule-declaration ATTEMPT detection for the design-language schema
 * (extracted from `schema.ts` to keep that module under the file-size cap).
 *
 * The convention's only valid declaration is an ATX heading `rule: <id>`.
 * Everything here classifies the NEAR MISSES — text that an author plainly
 * meant as a declaration but that misses the strict form — so the parser can
 * surface a `malformed-rule-heading` finding instead of silently demoting the
 * intended rule to inert prose (and, worse, merging its bullets into the
 * preceding rule's section).
 *
 * Trigger calibration (deliberately narrow): a heading counts as an attempt
 * only when it carries a colon after the `rule` word (`Rule: x`, `rule : x`)
 * OR is exact-lowercase `rule` followed by exactly one id-shaped token
 * (`rule missing-colon`). Multi-word prose headings (`Rule of thumb`,
 * `Rule kinds`) stay inert — reserving every heading that merely STARTS with
 * "rule" would structurally forbid ordinary prose headings.
 *
 * Non-heading lines count only when they are line-initial exact-lowercase
 * `rule: <id>` — the unambiguous declaration shape in the wrong syntax
 * (setext heading or bare paragraph). Capitalised prose like "Rule: always X."
 * and mid-line mentions of "rule:" stay inert.
 */

/** A classified declaration attempt: finding message + attribution id. */
export interface RuleAttempt {
  /** Complete `malformed-rule-heading` finding message. */
  readonly message: string;
  /** Best-effort id from the attempted declaration, for finding attribution. */
  readonly attemptedId: string;
}

/** Colon after the rule word, any case / spacing: `Rule: x`, `rule : x`. */
const COLON_ATTEMPT_RE = /^rule\s*:/i;
/** Space between `rule` and the colon: `rule :x`, `Rule : x`. */
const SPACED_COLON_RE = /^rule\s+:/i;
/** Exact-lowercase `rule` + exactly one id-shaped token: `rule missing-colon`. */
const BARE_ID_ATTEMPT_RE = /^rule\s+[\w-]+$/;
/** Line-initial exact-lowercase declaration shape on a non-heading line. */
const LINE_ATTEMPT_RE = /^rule\s*:\s*\S/;
/** A setext underline: a line of only `=` or only `-` characters. */
const SETEXT_UNDERLINE_RE = /^(?:=+|-+)$/;

/** Best-effort id from the attempted heading text (`Rule: x` → `x`). */
function deriveAttemptedId(text: string): string {
  const id = /^rule\s*:?\s*(.*)$/i.exec(text)?.[1].trim() ?? '';
  return id === '' ? text : id;
}

/**
 * Classify an ATX heading's text (already known NOT to match the strict
 * `rule: <id>` form) as a declaration attempt, naming the ACTUAL mismatch.
 */
export function classifyHeadingAttempt(headingText: string): RuleAttempt | undefined {
  const colonAttempt = COLON_ATTEMPT_RE.test(headingText);
  if (!colonAttempt && !BARE_ID_ATTEMPT_RE.test(headingText)) {
    return undefined;
  }
  let offence: string;
  if (SPACED_COLON_RE.test(headingText)) {
    offence = 'has a space between "rule" and the ":"';
  } else if (colonAttempt) {
    offence = 'the "rule:" prefix must be lowercase';
  } else {
    offence = 'missing the ":" after "rule"';
  }
  return {
    message: `Heading "${headingText}" looks like a rule heading but ${offence} — expected "rule: <id>".`,
    attemptedId: deriveAttemptedId(headingText),
  };
}

/**
 * Classify a non-heading line as a declaration attempt: a line-initial
 * `rule: <id>` rendered as a setext heading (underlined by `---`/`===`) or as
 * a bare paragraph. Both direct the author to the documented ATX syntax.
 */
export function classifyLineAttempt(lineText: string, nextLine: string | undefined): RuleAttempt | undefined {
  if (!LINE_ATTEMPT_RE.test(lineText)) {
    return undefined;
  }
  const attemptedId = deriveAttemptedId(lineText);
  const isSetext = nextLine !== undefined && SETEXT_UNDERLINE_RE.test(nextLine.trim());
  const message = isSetext
    ? `Setext heading "${lineText}" attempts a rule declaration — rule headings use ATX syntax: "### rule: ${attemptedId}".`
    : `Line "${lineText}" looks like a rule declaration but is not a heading — declare it as an ATX heading: "### rule: ${attemptedId}".`;
  return { message, attemptedId };
}
