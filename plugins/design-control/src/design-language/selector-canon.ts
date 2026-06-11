/**
 * Selector-text canonicalization primitives for link-liveness
 * (AUDIT-round2-codex-01, AUDIT-round2-claude-04).
 *
 * The liveness matcher compares a query selector against source selector
 * preludes as TEXT. These helpers make that comparison honest in both
 * directions: attribute values are rewritten to ONE canonical spelling
 * (double-quoted) so quote style never produces a false dead AND distinct
 * values never conflate into a false green; functional pseudo-class arguments
 * are preserved for comparison (or stripped/blanked by the matcher when the
 * query does not name them — an exclusion argument or attribute value is not
 * a selector definition); whitespace is normalized identically on both sides.
 *
 * Remaining accepted approximations (stated, not silent):
 * - Escape sequences inside quoted values are kept verbatim, not decoded —
 *   `[a='it\'s']` and `[a="it's"]` spell the same value but do not unify.
 * - Whitespace inside functional-pseudo arguments is collapsed to single
 *   spaces (and trimmed at parens/commas/combinator-shaped characters), not
 *   erased — the combinator pass strips spacing around `+`, so
 *   `:nth-child(2n+1)` and `:nth-child(2n + 1)` DO unify, while the
 *   `-`-spelled forms (`:nth-child(2n-1)` vs `(2n - 1)`) do not.
 * - Attribute names are matched as plain idents; namespaced attribute
 *   selectors (`[svg|href]`) are left un-canonicalized (compared verbatim).
 */

/** True for characters that extend a CSS ident (would change the selector). */
export function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_-]/.test(ch);
}

/**
 * Copy a string literal verbatim starting at `text[start]` (an opening quote),
 * walking `\` escapes. Returns the copied literal (closing quote included when
 * present) and the index just past it.
 */
export function copyStringLiteral(text: string, start: number): { copied: string; end: number } {
  const quote = text[start];
  let copied = quote;
  let i = start + 1;
  while (i < text.length && text[i] !== quote) {
    copied += text[i];
    if (text[i] === '\\' && i + 1 < text.length) {
      copied += text[i + 1];
      i += 2;
    } else {
      i += 1;
    }
  }
  if (i < text.length) {
    copied += quote;
    i += 1;
  }
  return { copied, end: i };
}

/** Strip CSS comments; string-literal contents are copied verbatim. */
export function stripComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const literal = copyStringLiteral(text, i);
      out += literal.copied;
      i = literal.end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * One attribute selector: name, optional operator + value (double-quoted,
 * single-quoted, or unquoted) + optional case-sensitivity flag.
 */
const ATTRIBUTE_SELECTOR =
  /\[\s*([A-Za-z0-9_-]+)\s*(?:([~|^$*]?=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s\]'"]+))(?:\s+([iIsS]))?\s*)?\]/g;

/**
 * Rewrite every attribute selector to one canonical spelling:
 * `[attr=val]` / `[attr='val']` / `[attr="val"]` → `[attr="val"]` (value text
 * preserved; flag lowercased; internal whitespace dropped). Different values
 * therefore never conflate, and quote styles never diverge.
 */
export function canonicalizeAttributeSelectors(text: string): string {
  let out = '';
  let last = 0;
  ATTRIBUTE_SELECTOR.lastIndex = 0;
  let match = ATTRIBUTE_SELECTOR.exec(text);
  while (match !== null) {
    out += text.slice(last, match.index);
    const name: string = match[1];
    const operator: string | undefined = match[2];
    if (operator === undefined) {
      out += `[${name}]`;
    } else {
      const value: string = match[3] ?? match[4] ?? match[5] ?? '';
      const flag: string | undefined = match[6];
      out += `[${name}${operator}"${value}"${flag === undefined ? '' : ` ${flag.toLowerCase()}`}]`;
    }
    last = match.index + match[0].length;
    match = ATTRIBUTE_SELECTOR.exec(text);
  }
  return out + text.slice(last);
}

/**
 * Blank the VALUES of canonicalized attribute selectors (`[a="x"]` → `[a=""]`).
 * Used on the haystack when the query names no attribute selector, so a bare
 * query never matches text that exists only as an attribute value — an
 * attribute value is not a selector definition. Run AFTER
 * {@link canonicalizeAttributeSelectors} (it only sees double-quoted values).
 */
export function blankAttributeValues(text: string): string {
  return text.replace(/(\[[A-Za-z0-9_-]+[~|^$*]?=)"(?:[^"\\]|\\.)*"/g, '$1""');
}

/**
 * Strip the CONTENTS of functional pseudo-class arguments (delimiters stay):
 * `:not(.ghost)` → `:not()`, for any `:<ident>(` / `::<ident>(`, balancing
 * nested parens (`:not(:is(.a))` → `:not()`) and skipping string literals so
 * parens inside quoted values do not unbalance the walk. A selector that
 * appears only as an exclusion or matcher argument is not styled by the rule,
 * so it must not satisfy a liveness query that never named the argument.
 */
export function stripFunctionalPseudoArgs(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const literal = copyStringLiteral(text, i);
      out += literal.copied;
      i = literal.end;
      continue;
    }
    if (ch === ':') {
      let identStart = i + 1;
      if (text[identStart] === ':') {
        identStart += 1;
      }
      let identEnd = identStart;
      while (identEnd < text.length && isIdentChar(text[identEnd])) {
        identEnd += 1;
      }
      if (identEnd > identStart && text[identEnd] === '(') {
        out += text.slice(i, identEnd + 1);
        let depth = 1;
        i = identEnd + 1;
        while (i < text.length && depth > 0) {
          if (text[i] === '"' || text[i] === "'") {
            i = copyStringLiteral(text, i).end;
            continue;
          }
          if (text[i] === '(') {
            depth += 1;
          } else if (text[i] === ')') {
            depth -= 1;
          }
          i += 1;
        }
        if (depth === 0) {
          out += ')';
        }
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Normalize selector whitespace for textual comparison: runs collapse to one
 * space; spaces inside paren delimiters, around commas, and around the
 * non-descendant combinators (`>` `+` `~` `||`) drop; ends trim. Prettier
 * writes spaced combinators, so `.a>.b` and `.a > .b` must compare equal — a
 * CSS reformat must never flip a green link dead. The `~` of the `~=`
 * attribute operator is safe here: {@link canonicalizeAttributeSelectors}
 * runs first and emits `[a~="x"]` with no surrounding spaces, so the
 * combinator pass is an identity on it. Applied identically to query and
 * haystack, so descendant-combinator, combinator, and argument-list spacing
 * differences never produce a false dead.
 */
export function normalizeSelectorWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*(\|\||[>+~])\s*/g, '$1')
    .trim();
}
