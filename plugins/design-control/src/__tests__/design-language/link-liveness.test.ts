/**
 * Static link-liveness tests (Phase 2, axis B).
 *
 * Each rule's `css: <path> <selector>` link must resolve to an author-written
 * CSS file in which the selector is DEFINED — checked statically against
 * source with NO app boot (the check is pure file reads; the acceptance's
 * "flags a dead selector with no app boot — engine absent" lands here).
 *
 * Scope is author-written CSS only: non-.css targets (CSS-in-JS, hashed
 * CSS-Modules, utility frameworks) are NOT validated in v1 (named-deferred) —
 * they are recorded as skipped, visibly, never silently dropped and never
 * fabricated into a dead-link finding.
 *
 * Real-fs temp fixtures per .claude/rules/testing.md — never mock the fs.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkLinkLiveness } from '@/design-language/link-liveness';
import type { ParsedDesignSpec } from '@/design-language/types';

const tempDirs: string[] = [];

function makeFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'design-language-liveness-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function specWithLink(path: string, selector: string): ParsedDesignSpec {
  return {
    rules: [
      {
        id: 'probe',
        kind: 'palette',
        cssLinks: [{ path, selector }],
        examples: ['an example'],
        dos: ['guidance'],
        donts: [],
      },
    ],
  };
}

describe('checkLinkLiveness — live selectors pass', () => {
  it('passes a class selector defined in the referenced file', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', '.btn-primary'), dir);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('finds a selector defined inside an @media block', () => {
    const dir = makeFixtureDir();
    writeFileSync(
      join(dir, 'studio.css'),
      '@media (min-width: 80rem) {\n  .desktop-rail { width: 16rem; }\n}\n',
    );
    expect(checkLinkLiveness(specWithLink('studio.css', '.desktop-rail'), dir).ok).toBe(true);
  });

  it('finds a selector that appears with a pseudo-class in source', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.chip:hover { outline: 1px solid; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.chip'), dir).ok).toBe(true);
  });

  it('finds a descendant selector sequence regardless of whitespace', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.masthead   nav a { text-decoration: none; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.masthead nav a'), dir).ok).toBe(true);
  });

  it('resolves the css path relative to the spec base dir, including subdirectories', () => {
    const dir = makeFixtureDir();
    mkdirSync(join(dir, 'styles'));
    writeFileSync(join(dir, 'styles', 'chrome.css'), '.masthead-rule { border-top: 2px solid; }\n');
    expect(checkLinkLiveness(specWithLink('styles/chrome.css', '.masthead-rule'), dir).ok).toBe(true);
  });
});

describe('checkLinkLiveness — dead links flagged (no app boot)', () => {
  it('flags a selector that is not defined anywhere in the file', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', '.btn-ghost'), dir);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'dead-link-selector' && f.ruleId === 'probe')).toBe(
      true,
    );
  });

  it('flags a missing css file', () => {
    const dir = makeFixtureDir();
    const result = checkLinkLiveness(specWithLink('nope.css', '.btn'), dir);
    expect(result.findings.some((f) => f.rule === 'dead-link-file')).toBe(true);
  });

  it('does not let a longer ident satisfy a shorter selector (.btn vs .btn-primary)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.btn'), dir).ok).toBe(false);
  });

  it('a selector appearing only in a comment is dead', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '/* .ghost was retired */\n.real { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
  });

  it('a selector appearing only inside a declaration string is dead', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real::before { content: ".ghost"; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
  });

  it('a selector appearing only as a property value token is dead', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real { background: url(.ghost/x.png); }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
  });
});

describe('checkLinkLiveness — v1 scope boundary (named-deferred, visible)', () => {
  it('records a non-.css target as skipped — no finding, never silent', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'styles.ts'), 'export const btn = css`color: navy;`;\n');
    const result = checkLinkLiveness(specWithLink('styles.ts', '.btn'), dir);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      ruleId: 'probe',
      reason: 'non-css-target',
      link: { path: 'styles.ts', selector: '.btn' },
    });
  });
});
