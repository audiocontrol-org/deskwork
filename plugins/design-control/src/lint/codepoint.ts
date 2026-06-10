/**
 * Text-content codepoint ALLOWLIST — axis 2 of the `check-mockup-lofi` lint
 * (PRD round-9/10). Symmetric with the element/attribute allowlist: a denylist
 * of "designed typography" ranges is the same whack-a-mole an allowlist abolishes
 * — Mathematical-Alphanumeric letters (𝐃𝐚𝐬𝐡), enclosed (①), fullwidth (Ｄ),
 * and fraktur/double-struck all carry Unicode category *Letter*, so a category-
 * or range-denylist passes them and "designed typography" leaks with zero CSS.
 *
 * So this is an allowlist: it PERMITS only Basic-Latin letters/digits, a closed
 * enumerated punctuation set, an ENUMERATED whitespace set (space + newline + tab
 * only — NOT the Unicode whitespace category, which would leak em/en/hair/
 * ideographic spacers as an alignment channel, round-10), and an enumerated set
 * of accented-Latin extras (Latin-1 Supplement letters + Latin Extended-A). It
 * REJECTS everything else in one rule: math-alphanumeric, enclosed, fullwidth,
 * fraktur/double-struck, pictographic/emoji, box-drawing, tag chars, variation
 * selectors, zero-width formatting, and non-enumerated whitespace.
 */

/** Enumerated whitespace: space, newline, tab only (round-10). */
const WHITESPACE = new Set<number>([0x20, 0x0a, 0x09]);

/**
 * Typographic punctuation permitted beyond ASCII punctuation: middle dot, en/em
 * dash, single/double curly quotes, ellipsis. A closed, enumerated set.
 */
const TYPOGRAPHIC_PUNCT = new Set<number>([
  0x00b7, // · middle dot
  0x2013, // – en dash
  0x2014, // — em dash
  0x2018, 0x2019, // ‘ ’ single curly quotes
  0x201c, 0x201d, // “ ” double curly quotes
  0x2026, // … horizontal ellipsis
]);

function isAsciiLetterOrDigit(cp: number): boolean {
  return (
    (cp >= 0x41 && cp <= 0x5a) || // A–Z
    (cp >= 0x61 && cp <= 0x7a) || // a–z
    (cp >= 0x30 && cp <= 0x39) // 0–9
  );
}

function isAsciiPunctuation(cp: number): boolean {
  return (
    (cp >= 0x21 && cp <= 0x2f) || // ! " # $ % & ' ( ) * + , - . /
    (cp >= 0x3a && cp <= 0x40) || // : ; < = > ? @
    (cp >= 0x5b && cp <= 0x60) || // [ \ ] ^ _ `
    (cp >= 0x7b && cp <= 0x7e) // { | } ~
  );
}

function isAccentedLatin(cp: number): boolean {
  // Latin-1 Supplement letters (U+00C0–U+00FF) minus the × (U+00D7) and ÷
  // (U+00F7) math symbols, plus Latin Extended-A (U+0100–U+017F), plus the
  // Romanian comma-below letters Ș/ș/Ț/ț (U+0218–U+021B; AUDIT-20260610-15 —
  // an enumerated four-codepoint extension, NOT a Latin Extended-B grant).
  if (cp >= 0x00c0 && cp <= 0x00ff) return cp !== 0x00d7 && cp !== 0x00f7;
  if (cp >= 0x0218 && cp <= 0x021b) return true;
  return cp >= 0x0100 && cp <= 0x017f;
}

/** True iff `cp` is permitted in wireframe text content. */
export function isAllowedCodepoint(cp: number): boolean {
  return (
    isAsciiLetterOrDigit(cp) ||
    WHITESPACE.has(cp) ||
    isAsciiPunctuation(cp) ||
    TYPOGRAPHIC_PUNCT.has(cp) ||
    isAccentedLatin(cp)
  );
}

export interface DisallowedCodepoint {
  readonly codepoint: number;
  readonly char: string;
}

/**
 * Scan `text` and return each DISTINCT disallowed codepoint once, in first-seen
 * order. The text is NFC-normalized first so that accented Latin written in
 * decomposed (NFD) form — `e`+combining-acute, common from macOS APIs and pasted
 * text — composes to its precomposed form (AUDIT-20260606-22). This rescues NFD
 * input ONLY when the precomposed form lands in the allowlisted ranges (Latin-1
 * Supplement / Latin Extended-A); an accent whose precomposed form is off-
 * allowlist (e.g. `Ǎ` = U+01CD, Latin Extended-B) or has no precomposed form
 * still fails — correctly, and now identically in NFC and NFD. NFC composes; it
 * does NOT strip combining marks, so a non-composable mark stays flagged.
 * Iterated by Unicode codepoint, so astral chars like emoji are one unit.
 */
export function findDisallowedCodepoints(text: string): DisallowedCodepoint[] {
  const seen = new Set<number>();
  const out: DisallowedCodepoint[] = [];
  for (const char of text.normalize('NFC')) {
    const codepoint = char.codePointAt(0)!;
    if (!isAllowedCodepoint(codepoint) && !seen.has(codepoint)) {
      seen.add(codepoint);
      out.push({ codepoint, char });
    }
  }
  return out;
}

/** Render a codepoint as `U+XXXX` for finding messages. */
export function formatCodepoint(cp: number): string {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Punctuation-density imagery gate (AUDIT-20260610-12, round-2 gpt-5-02):
 * after `<pre>`'s removal closed preserved-whitespace ASCII art, dense
 * punctuation rows with `<br>`/block row control reconstruct pixel-art
 * wordmarks from allowlisted codepoints. The channel is punctuation MASS —
 * copy-shaped text is mostly letters; imagery-shaped text is mostly
 * punctuation. A text node with at least {@link PUNCT_DENSITY_MIN_LENGTH}
 * non-whitespace codepoints of which at least {@link PUNCT_DENSITY_RATIO}
 * are punctuation is rejected. This BOUNDS the channel (run-detection is
 * defeatable by alternation; density is what imagery cannot do without); the
 * referee's gross-class judgment remains the backstop for text-as-imagery.
 */
export const PUNCT_DENSITY_MIN_LENGTH = 8;
export const PUNCT_DENSITY_RATIO = 0.8;

/**
 * Punctuation ratio of `text`'s non-whitespace codepoints (0 for empty). Used
 * by the density gate and by the sibling-run accumulator (AUDIT-20260610-22),
 * which needs the ratio WITHOUT the length floor.
 */
export function punctuationRatio(text: string): number {
  let total = 0;
  let punct = 0;
  for (const char of text.normalize('NFC')) {
    const cp = char.codePointAt(0)!;
    if (WHITESPACE.has(cp)) continue;
    total += 1;
    if (isAsciiPunctuation(cp) || TYPOGRAPHIC_PUNCT.has(cp)) punct += 1;
  }
  return total === 0 ? 0 : punct / total;
}

/** Non-whitespace codepoint count of `text`. */
function nonWhitespaceLength(text: string): number {
  let total = 0;
  for (const char of text.normalize('NFC')) {
    if (!WHITESPACE.has(char.codePointAt(0)!)) total += 1;
  }
  return total;
}

/** True iff `text` trips the punctuation-density imagery gate. */
export function isPunctuationDense(text: string): boolean {
  return (
    nonWhitespaceLength(text) >= PUNCT_DENSITY_MIN_LENGTH &&
    punctuationRatio(text) >= PUNCT_DENSITY_RATIO
  );
}
