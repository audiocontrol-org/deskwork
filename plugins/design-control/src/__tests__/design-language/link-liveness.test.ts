/**
 * Static link-liveness tests (Phase 2, axis B).
 *
 * Each rule's `css: <path> <selector>` link must resolve to an author-written
 * CSS file in which the selector is DEFINED — checked statically against
 * source with NO app boot (the check is pure file reads; the acceptance's
 * "flags a dead selector with no app boot — engine absent" lands here).
 *
 * Scope is author-written CSS only: non-.css targets (CSS-in-JS, hashed
 * CSS-Modules, utility frameworks) do not establish link-liveness — they are
 * recorded as skipped, visibly, never silently dropped and never fabricated
 * into a dead-link finding.
 *
 * Real-fs temp fixtures per .claude/rules/testing.md — never mock the fs.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCssLinkLiveness, checkLinkLiveness } from '@/design-language/link-liveness';
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

  it('finds a quoted attribute selector — input[type="text"] is live, not fabricated dead', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), 'input[type="text"] { border: 1px solid; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', 'input[type="text"]'), dir);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('finds a class + quoted attribute selector — .chip[data-state="open"] is live', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.chip[data-state="open"] { outline: 2px solid; }\n');
    expect(
      checkLinkLiveness(specWithLink('studio.css', '.chip[data-state="open"]'), dir).ok,
    ).toBe(true);
  });

  it('resolves the css path relative to the spec base dir, including subdirectories', () => {
    const dir = makeFixtureDir();
    mkdirSync(join(dir, 'styles'));
    writeFileSync(join(dir, 'styles', 'chrome.css'), '.masthead-rule { border-top: 2px solid; }\n');
    expect(checkLinkLiveness(specWithLink('styles/chrome.css', '.masthead-rule'), dir).ok).toBe(true);
  });

  it('resolves parent traversal — a subdir spec referencing ../ css is live', () => {
    // Deliberate (AUDIT-round2-codex-02): `../` stays accepted — a spec
    // legitimately references author CSS elsewhere in the repository tree;
    // the portability boundary is the repository/collection, not the spec's
    // own directory.
    const dir = makeFixtureDir();
    mkdirSync(join(dir, 'specs'));
    writeFileSync(join(dir, 'shared.css'), '.btn-primary { color: navy; }\n');
    const result = checkLinkLiveness(specWithLink('../shared.css', '.btn-primary'), join(dir, 'specs'));
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('checkCssLinkLiveness — public-seam portability defense (AUDIT-round2-codex-02)', () => {
  it('throws on a machine-rooted link path instead of fabricating a machine-local verdict', () => {
    // The path EXISTS on this machine — exactly the trap: resolve() would
    // ignore baseDir and the check would go green here while the spec is
    // nonportable. The schema never emits such a link; a hand-built one at
    // this public seam is a caller contract violation → fail loud.
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn { color: navy; }\n');
    expect(() =>
      checkCssLinkLiveness(
        [{ ruleId: 'probe', link: { path: join(dir, 'studio.css'), selector: '.btn' } }],
        dir,
      ),
    ).toThrow(/relative to the spec file/);
  });

  it('throws on a ~-prefixed link path too (home expansion is machine-local)', () => {
    const dir = makeFixtureDir();
    expect(() =>
      checkCssLinkLiveness(
        [{ ruleId: 'probe', link: { path: '~/styles/studio.css', selector: '.btn' } }],
        dir,
      ),
    ).toThrow(/relative to the spec file/);
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

  it('a selector appearing only inside :not(...) is dead — exclusion is not styling', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:not(.ghost) { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
  });

  it('a selector appearing only inside :is(...) arguments is dead', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:is(.ghost, .other) { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
  });

  it('a selector nested inside :not(:is(...)) is dead — parens balance across nesting', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:not(:is(.ghost)) { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
  });

  it('the subject outside the functional pseudo-class still matches (.real in .real:not(.ghost))', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:not(.ghost) { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.real'), dir).ok).toBe(true);
  });

  it('a full-selector query with parens matches its source rule — argument text compared', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:not(.ghost) { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.real:not(.ghost)'), dir).ok).toBe(true);
  });
});

describe('checkLinkLiveness — attribute values compared canonically (AUDIT-round2-codex-01 / -claude-04)', () => {
  it('a [data-state="open"] query is dead against a source defining only [data-state="closed"]', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.chip[data-state="closed"] { outline: none; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', '.chip[data-state="open"]'), dir);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'dead-link-selector')).toBe(true);
  });

  it('an unquoted query matches a double-quoted source — input[type=text] vs input[type="text"]', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), 'input[type="text"] { border: 1px solid; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', 'input[type=text]'), dir).ok).toBe(true);
  });

  it('a double-quoted query matches an unquoted source — input[type="text"] vs input[type=text]', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), 'input[type=text] { border: 1px solid; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', 'input[type="text"]'), dir).ok).toBe(true);
  });

  it('a single-quoted query matches a double-quoted source', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), 'input[type="text"] { border: 1px solid; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', "input[type='text']"), dir).ok).toBe(true);
  });

  it('a double-quoted query matches a single-quoted source', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), ".chip[data-state='open'] { outline: 2px solid; }\n");
    expect(
      checkLinkLiveness(specWithLink('studio.css', '.chip[data-state="open"]'), dir).ok,
    ).toBe(true);
  });

  it('a selector appearing only as a quoted attribute VALUE is dead — values are not definitions', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real[data-icon=".ghost"] { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
  });

  it('a selector appearing only as an UNQUOTED attribute value is dead too', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real[class~=ghost] { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', 'ghost'), dir).ok).toBe(false);
  });
});

describe('checkLinkLiveness — functional pseudo-class arguments compared (AUDIT-round2-codex-01)', () => {
  it('a .real:not(.ghost) query is dead against a source defining only .real:not(.other)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:not(.other) { color: ink; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', '.real:not(.ghost)'), dir);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'dead-link-selector')).toBe(true);
  });

  it('argument whitespace is normalized — .real:not(.ghost) matches a :not( .ghost ) source', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:not( .ghost ) { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.real:not(.ghost)'), dir).ok).toBe(true);
  });

  it('argument-list comma spacing is normalized — :is(.a,.b) matches :is(.a, .b)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real:is(.a, .b) { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.real:is(.a,.b)'), dir).ok).toBe(true);
  });
});

describe('checkLinkLiveness — validated-scope boundary (non-CSS targets, visible)', () => {
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
