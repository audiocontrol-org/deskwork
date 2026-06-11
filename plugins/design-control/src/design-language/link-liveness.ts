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
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CssLink,
  DesignSpecFinding,
  ParsedDesignSpec,
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
 * True iff `selector` appears ident-boundary exact inside some selector
 * prelude of `css`. Whitespace in a multi-token (descendant) selector is
 * normalized on both sides before matching. String-literal CONTENTS are
 * stripped on both sides identically, so quoted attribute selectors
 * (`input[type="text"]`) match their source rules; the accepted
 * over-approximation is that quoted VALUES are not compared —
 * `[data-state="open"]` matches a source rule for `[data-state="closed"]`.
 */
export function cssDefinesSelector(css: string, selector: string): boolean {
  const query = stripCommentsAndStrings(selector).trim().replace(/\s+/g, ' ');
  if (query === '') {
    return false;
  }
  for (const prelude of collectSelectorPreludes(css)) {
    const haystack = prelude.replace(/\s+/g, ' ');
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
 * Check every rule's css links against source. Paths resolve relative to
 * `baseDir` (the spec file's directory). Missing file → `dead-link-file`;
 * selector not defined → `dead-link-selector`; non-.css target → skipped.
 */
export function checkLinkLiveness(spec: ParsedDesignSpec, baseDir: string): LivenessResult {
  const findings: DesignSpecFinding[] = [];
  const skipped: SkippedLink[] = [];
  for (const rule of spec.rules) {
    for (const link of rule.cssLinks) {
      if (!link.path.toLowerCase().endsWith('.css')) {
        skipped.push({ ruleId: rule.id, link, reason: 'non-css-target' });
        continue;
      }
      const absolute = resolve(baseDir, link.path);
      let css: string;
      try {
        css = readFileSync(absolute, 'utf8');
      } catch {
        findings.push({
          rule: 'dead-link-file',
          message: `Rule "${rule.id}" links to "${link.path}" which does not resolve to a readable file (looked at ${absolute}).`,
          ruleId: rule.id,
        });
        continue;
      }
      if (!cssDefinesSelector(css, link.selector)) {
        findings.push({
          rule: 'dead-link-selector',
          message: `Rule "${rule.id}" links to selector "${link.selector}" which is not defined in "${link.path}".`,
          ruleId: rule.id,
        });
      }
    }
  }
  return { ok: findings.length === 0, findings, skipped };
}
