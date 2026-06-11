/**
 * Static link-liveness for design-language spec rules (Phase 2, axis B).
 *
 * Each rule's `css: <path> <selector>` link must point at an author-written
 * CSS file in which the selector is DEFINED. The check is STATIC — pure file
 * reads against source, no app boot, no engine (round-6 M1: "authoring
 * artifacts only / no capture dependency").
 *
 * Scope (v1, named-deferred boundary): only `.css` targets are validated.
 * Utility-framework, CSS-in-JS, and hashed CSS-Modules resolution are NOT
 * validated in v1 — such links are recorded as `skipped` (visible in the
 * result and in CLI output), never silently dropped and never fabricated into
 * a dead-link verdict. Liveness ≠ truthfulness: a resolving selector does not
 * prove the live CSS still matches the rule's described intent
 * (`spec-truthfulness`, named-deferred).
 *
 * "Defined in source" is implemented as: the selector appears, ident-boundary
 * exact, inside some selector prelude of the file — preludes are the text
 * runs that precede `{` after comments and string literals are stripped and
 * at-rule preludes are excluded (their blocks are descended into, so a rule
 * inside `@media` counts; `content: ".ghost"` and commented-out rules do not).
 * Functional pseudo-class ARGUMENTS (`:not(.ghost)`, `:is(...)`, `:where(...)`,
 * `:has(...)`, `:nth-child(...)`) are excluded too — a class that exists only
 * as an exclusion or only inside a matcher argument has no styling of its own,
 * so it must not count as a live anchor.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CssLink,
  DesignSpecFinding,
  ParsedDesignSpec,
  RuleScopedCssLink,
} from '@/design-language/types';

/** A link excluded from v1 validation, recorded visibly. */
export interface SkippedLink {
  readonly ruleId: string;
  readonly link: CssLink;
  readonly reason: 'non-css-target';
}

export interface LivenessResult {
  /** True iff findings is empty (skipped links do not fail the check). */
  readonly ok: boolean;
  readonly findings: readonly DesignSpecFinding[];
  readonly skipped: readonly SkippedLink[];
}

/** Strip CSS comments and the CONTENTS of string literals (delimiters stay). */
function stripCommentsAndStrings(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i += 1;
      while (i < css.length && css[i] !== ch) {
        i += css[i] === '\\' ? 2 : 1;
      }
      if (i < css.length) {
        out += ch;
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Collect selector preludes: text runs preceding `{`, at every nesting depth,
 * excluding at-rule preludes (which are descended into, not matched against).
 * Prelude buffers reset on `{`, `}`, and `;` so declaration text never leaks
 * into selector position.
 */
function collectSelectorPreludes(css: string): string[] {
  const preludes: string[] = [];
  let buffer = '';
  for (const ch of stripCommentsAndStrings(css)) {
    if (ch === '{') {
      const prelude = buffer.trim();
      if (prelude !== '' && !prelude.startsWith('@')) {
        preludes.push(prelude);
      }
      buffer = '';
      continue;
    }
    if (ch === '}' || ch === ';') {
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  return preludes;
}

/** True for characters that extend a CSS ident (would change the selector). */
function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_-]/.test(ch);
}

/**
 * Strip the CONTENTS of functional pseudo-class arguments (delimiters stay):
 * `:not(.ghost)` → `:not()`, for any `:<ident>(` / `::<ident>(`, balancing
 * nested parens (`:not(:is(.a))` → `:not()`). A selector that appears only as
 * an exclusion or matcher argument is not styled by the rule, so it must not
 * satisfy a liveness query.
 */
function stripFunctionalPseudoArgs(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
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
 * True iff `selector` appears ident-boundary exact inside some selector
 * prelude of `css`. Whitespace in a multi-token (descendant) selector is
 * normalized on both sides before matching. String-literal CONTENTS are
 * stripped on both sides identically, so quoted attribute selectors
 * (`input[type="text"]`) match their source rules; the accepted
 * over-approximation is that quoted VALUES are not compared —
 * `[data-state="open"]` matches a source rule for `[data-state="closed"]`.
 * Functional pseudo-class ARGUMENTS are likewise stripped on both sides
 * identically, so `.ghost` does not match `.real:not(.ghost)` (an exclusion
 * is not a definition), while a full-selector query like `.real:not(.ghost)`
 * still matches its source rule; the symmetric accepted over-approximation is
 * that argument CONTENTS are not compared — `.real:not(.ghost)` matches a
 * source rule for `.real:not(.other)`.
 */
export function cssDefinesSelector(css: string, selector: string): boolean {
  const query = stripFunctionalPseudoArgs(stripCommentsAndStrings(selector))
    .trim()
    .replace(/\s+/g, ' ');
  if (query === '') {
    return false;
  }
  for (const prelude of collectSelectorPreludes(css)) {
    const haystack = stripFunctionalPseudoArgs(prelude).replace(/\s+/g, ' ');
    let from = 0;
    while (true) {
      const at = haystack.indexOf(query, from);
      if (at === -1) {
        break;
      }
      if (!isIdentChar(haystack[at - 1]) && !isIdentChar(haystack[at + query.length])) {
        return true;
      }
      from = at + 1;
    }
  }
  return false;
}

/**
 * Check a flat list of rule-scoped css links against source. This is the
 * liveness core: it carries no opinion about the HOUSING of a link, so the
 * file-level check can run it over the valid rules' links AND the parse
 * result's `auxiliaryCssLinks` (links of structurally-invalid / duplicate
 * sections) in the same pass. Paths resolve relative to `baseDir` (the spec
 * file's directory). Missing file → `dead-link-file`; selector not defined →
 * `dead-link-selector`; non-.css target → skipped.
 */
export function checkCssLinkLiveness(
  links: readonly RuleScopedCssLink[],
  baseDir: string,
): LivenessResult {
  const findings: DesignSpecFinding[] = [];
  const skipped: SkippedLink[] = [];
  for (const { ruleId, link } of links) {
    if (!link.path.toLowerCase().endsWith('.css')) {
      skipped.push({ ruleId, link, reason: 'non-css-target' });
      continue;
    }
    const absolute = resolve(baseDir, link.path);
    let css: string;
    try {
      css = readFileSync(absolute, 'utf8');
    } catch {
      findings.push({
        rule: 'dead-link-file',
        message: `Rule "${ruleId}" links to "${link.path}" which does not resolve to a readable file (looked at ${absolute}).`,
        ruleId,
      });
      continue;
    }
    if (!cssDefinesSelector(css, link.selector)) {
      findings.push({
        rule: 'dead-link-selector',
        message: `Rule "${ruleId}" links to selector "${link.selector}" which is not defined in "${link.path}".`,
        ruleId,
      });
    }
  }
  return { ok: findings.length === 0, findings, skipped };
}

/**
 * Check every valid rule's css links against source — the spec-shaped wrapper
 * over {@link checkCssLinkLiveness} (same per-link contract).
 */
export function checkLinkLiveness(spec: ParsedDesignSpec, baseDir: string): LivenessResult {
  const links = spec.rules.flatMap((rule) =>
    rule.cssLinks.map((link) => ({ ruleId: rule.id, link })),
  );
  return checkCssLinkLiveness(links, baseDir);
}
