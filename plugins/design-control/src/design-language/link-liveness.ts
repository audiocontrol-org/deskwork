/**
 * Static link-liveness for design-language spec rules (Phase 2, axis B).
 *
 * Each rule's `css: <path> <selector>` link must point at an author-written
 * CSS file in which the selector is DEFINED. The check is STATIC — pure file
 * reads against source, no app boot, no engine (round-6 M1: "authoring
 * artifacts only / no capture dependency").
 *
 * Scope: this check validates selectors in author-written `.css` sources
 * only. Utility-framework, CSS-in-JS, and hashed CSS-Modules links do
 * not establish link-liveness — they are recorded as `skipped` (visible in
 * the result and in CLI output), never silently dropped and never fabricated
 * into a dead-link verdict. Liveness ≠ truthfulness: a resolving selector
 * does not establish that the live CSS still matches the rule's described
 * intent — `spec-truthfulness` is a separate axis this check does not
 * perform (scope decision recorded in specs/001-design-control/spec.md).
 *
 * "Defined in source" is implemented as: the selector appears, ident-boundary
 * exact, inside some selector prelude of the file — preludes are the text
 * runs that precede `{` after comments are stripped and at-rule preludes are
 * excluded (their blocks are descended into, so a rule inside `@media` counts;
 * `content: ".ghost"` and commented-out rules do not). Both sides are
 * canonicalized before comparison (AUDIT-round2-codex-01 / -claude-04):
 * attribute values rewrite to one double-quoted spelling with the value text
 * PRESERVED, so `input[type=text]` matches `input[type="text"]` while
 * `[data-state="open"]` never matches `[data-state="closed"]`; functional
 * pseudo-class arguments (`:not(.ghost)`, `:is(...)`, `:where(...)`,
 * `:has(...)`, `:nth-child(...)`) are compared when the QUERY names them and
 * excluded from the scan when it does not — a class that exists only as an
 * exclusion, matcher argument, or attribute value has no styling of its own,
 * so it must not count as a live anchor for a query that never named it.
 * Remaining accepted approximations are stated in `selector-canon.ts`
 * (verbatim escapes; collapsed-not-erased argument whitespace).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isNonPortableCssPath } from '@/design-language/schema';
import {
  blankAttributeValues,
  canonicalizeAttributeSelectors,
  copyStringLiteral,
  isIdentChar,
  normalizeSelectorWhitespace,
  stripComments,
  stripFunctionalPseudoArgs,
} from '@/design-language/selector-canon';
import type {
  CssLink,
  DesignSpecFinding,
  ParsedDesignSpec,
  RuleScopedCssLink,
} from '@/design-language/types';

/** A link outside the validated .css scope, recorded visibly. */
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

/**
 * Collect selector preludes: text runs preceding `{`, at every nesting depth,
 * excluding at-rule preludes (which are descended into, not matched against).
 * Comments are stripped; string-literal CONTENTS are copied verbatim (their
 * structural characters are content, never braces/semicolons) so attribute
 * values survive into preludes for canonical comparison. Prelude buffers
 * reset on `{`, `}`, and `;` so declaration text (`content: ".ghost"`) never
 * leaks into selector position.
 */
function collectSelectorPreludes(css: string): string[] {
  const preludes: string[] = [];
  let buffer = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const literal = copyStringLiteral(css, i);
      buffer += literal.copied;
      i = literal.end;
      continue;
    }
    if (ch === '{') {
      const prelude = buffer.trim();
      if (prelude !== '' && !prelude.startsWith('@')) {
        preludes.push(prelude);
      }
      buffer = '';
    } else if (ch === '}' || ch === ';') {
      buffer = '';
    } else {
      buffer += ch;
    }
    i += 1;
  }
  return preludes;
}

/**
 * True iff `selector` appears ident-boundary exact inside some selector
 * prelude of `css`, with both sides canonicalized identically: attribute
 * values rewrite to one double-quoted spelling with their text PRESERVED
 * (quote style never diverges; `[data-state="open"]` never matches
 * `[data-state="closed"]`), and whitespace normalizes (descendant
 * combinators, argument spacing).
 *
 * Two-mode scan, derived from the query (a value or argument the query never
 * named is not a definition — exclusion is not styling, AUDIT-20260611-18):
 * - Query WITHOUT functional pseudo args: haystack args are stripped, so
 *   `.ghost` does not match `.real:not(.ghost)`. A query WITH them compares
 *   argument text — `.real:not(.ghost)` matches only a `:not(.ghost)` source,
 *   never `:not(.other)`.
 * - Query WITHOUT an attribute selector: haystack attribute values are
 *   blanked, so `.ghost` does not match `[data-icon=".ghost"]` and `ghost`
 *   does not match `[class~=ghost]`. A query WITH one compares values.
 */
export function cssDefinesSelector(css: string, selector: string): boolean {
  const canonicalQuery = canonicalizeAttributeSelectors(stripComments(selector));
  const compareArgs = canonicalQuery.includes('(');
  const compareAttrValues = canonicalQuery.includes('[');
  // Stripping/blanking the query itself would be a no-op in the modes where
  // they apply (no parens / no brackets to act on), so normalize directly.
  const query = normalizeSelectorWhitespace(canonicalQuery);
  if (query === '') {
    return false;
  }
  for (const prelude of collectSelectorPreludes(css)) {
    let haystack = canonicalizeAttributeSelectors(prelude);
    if (!compareArgs) {
      haystack = stripFunctionalPseudoArgs(haystack);
    }
    if (!compareAttrValues) {
      haystack = blankAttributeValues(haystack);
    }
    haystack = normalizeSelectorWhitespace(haystack);
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
 *
 * Machine-rooted paths THROW (AUDIT-round2-codex-02): `resolve(baseDir, path)`
 * ignores baseDir for an absolute path, so the check would read the author's
 * machine-local file and fabricate a verdict that does not travel.
 * {@link parseDesignSpec} rejects such paths as `malformed-css-link` before
 * they reach this seam, so a machine-rooted link arriving here is a caller
 * contract violation (this function is exported and callable with hand-built
 * links) — fail loud rather than return a nonportable green/red.
 */
export function checkCssLinkLiveness(
  links: readonly RuleScopedCssLink[],
  baseDir: string,
): LivenessResult {
  const findings: DesignSpecFinding[] = [];
  const skipped: SkippedLink[] = [];
  for (const { ruleId, link } of links) {
    if (isNonPortableCssPath(link.path)) {
      throw new Error(
        `Rule "${ruleId}" css link path ${JSON.stringify(link.path)} is machine-rooted — ` +
          `css link paths are relative to the spec file, and resolve() would ignore baseDir for ` +
          `an absolute path, checking a machine-local file the spec cannot portably name. ` +
          `parseDesignSpec rejects these as malformed-css-link; fix the call site to pass ` +
          `spec-relative paths ("../" traversal within the repository is allowed).`,
      );
    }
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
