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

  it('throws on a drive-RELATIVE Windows link path (C:styles.css — machine-contextual on Windows)', () => {
    const dir = makeFixtureDir();
    expect(() =>
      checkCssLinkLiveness(
        [{ ruleId: 'probe', link: { path: 'C:styles.css', selector: '.btn' } }],
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

describe('checkLinkLiveness — combinator spacing normalized (AUDIT-20260611 combinator finding)', () => {
  it('a spaced child query matches an unspaced source — .a > .b vs .a>.b', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.a>.b { color: ink; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', '.a > .b'), dir);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('an unspaced adjacent-sibling query matches a spaced source — .c+.d vs .c + .d', () => {
    // Prettier writes spaced combinators, so a CSS reformat must not flip a
    // green link dead.
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.c + .d { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.c+.d'), dir).ok).toBe(true);
  });

  it('a spaced general-sibling query matches an unspaced source — .x ~ .y vs .x~.y', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.x~.y { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.x ~ .y'), dir).ok).toBe(true);
  });

  it('an unspaced column-combinator query matches a spaced source — .col||.cell vs .col || .cell', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.col || .cell { width: 4rem; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.col||.cell'), dir).ok).toBe(true);
  });

  it('combinator unification never fabricates a green — .a>.b is dead against a descendant .a .b source', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.a .b { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.a>.b'), dir).ok).toBe(false);
  });

  it('descendant combinators keep their single-space normalization alongside the combinator pass', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.list   >   .item   .label { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.list > .item .label'), dir).ok).toBe(true);
  });

  it('the ~= attribute operator is untouched — [a~="x"] matches a spaced [a ~= "x"] source', () => {
    // Attribute canonicalization owns operator spacing (the ~ there is part of
    // ~=); the combinator pass must not corrupt it.
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real[a ~= "x"] { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.real[a~="x"]'), dir).ok).toBe(true);
  });

  it('nth-child + spelling unifies as a consequence — :nth-child(2n+1) matches :nth-child(2n + 1)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.row:nth-child(2n + 1) { background: paper; }\n');
    expect(
      checkLinkLiveness(specWithLink('studio.css', '.row:nth-child(2n+1)'), dir).ok,
    ).toBe(true);
  });
});

describe('checkLinkLiveness — leading discriminator required (AUDIT-round4-claude-01)', () => {
  it('a bare-ident query does not match a class definition — btn-primary vs .btn-primary', () => {
    // Dropping the dot from a real class name must go DEAD, not silently green:
    // a class definition does not define the type selector of the same name.
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', 'btn-primary'), dir);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'dead-link-selector')).toBe(true);
  });

  it('a bare-ident query does not match a class definition — header vs .header', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.header { position: sticky; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', 'header'), dir).ok).toBe(false);
  });

  it('a bare-ident query does not match an id definition — header vs #header', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '#header { position: sticky; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', 'header'), dir).ok).toBe(false);
  });

  it('a bare-ident query does not match an attribute NAME — ghost vs [ghost]', () => {
    // Names mirror values (AUDIT-round2): an attribute name is not a selector
    // definition for a query that never named the bracket.
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '[ghost] { color: ink; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', 'ghost'), dir).ok).toBe(false);
  });

  it('a genuine type selector still matches a bare element rule — header vs header', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), 'header { position: sticky; }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', 'header'), dir);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('a type selector after a combinator still matches — header vs main > header', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), 'main > header { position: sticky; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', 'header'), dir).ok).toBe(true);
  });

  it('a class query still matches its class definition — .btn vs .btn (pin)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn { color: navy; }\n');
    expect(checkLinkLiveness(specWithLink('studio.css', '.btn'), dir).ok).toBe(true);
  });
});

describe('checkLinkLiveness — @keyframes steps are not preludes (AUDIT-round4-claude-04)', () => {
  it('a "from" query is dead against a @keyframes block — step selectors are not definitions', () => {
    const dir = makeFixtureDir();
    writeFileSync(
      join(dir, 'studio.css'),
      '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n',
    );
    const result = checkLinkLiveness(specWithLink('studio.css', 'from'), dir);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'dead-link-selector')).toBe(true);
  });

  it('prefix-tolerant — a "from" query is dead against @-webkit-keyframes too', () => {
    const dir = makeFixtureDir();
    writeFileSync(
      join(dir, 'studio.css'),
      '@-webkit-keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n',
    );
    expect(checkLinkLiveness(specWithLink('studio.css', 'from'), dir).ok).toBe(false);
  });

  it('a rule following a skipped @keyframes block is still live — the skip is exact', () => {
    const dir = makeFixtureDir();
    writeFileSync(
      join(dir, 'studio.css'),
      '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n.after { color: ink; }\n',
    );
    expect(checkLinkLiveness(specWithLink('studio.css', '.after'), dir).ok).toBe(true);
  });

  it('a rule inside @media remains live — conditional at-rule descent unchanged (pin)', () => {
    const dir = makeFixtureDir();
    writeFileSync(
      join(dir, 'studio.css'),
      '@media (min-width: 80rem) {\n  .rail { width: 16rem; }\n}\n',
    );
    expect(checkLinkLiveness(specWithLink('studio.css', '.rail'), dir).ok).toBe(true);
  });
});

describe('checkLinkLiveness — CSS nesting matched flat, not ancestor-composed (AUDIT-round4-claude-02 pins)', () => {
  // These two tests PIN the stated approximation (they pass against current
  // behavior): preludes are collected flat at their own nesting depth, never
  // composed with ancestors — on nested sources, rules anchor to the LEAF
  // selector. The approximation is documented in selector-canon.ts and
  // collectSelectorPreludes, not discovered by an author's dead link.
  it('a composed query is dead against a nested source — .btn .icon vs .btn { .icon {} } (pin)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn { color: navy; .icon { width: 1rem; } }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', '.btn .icon'), dir);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'dead-link-selector')).toBe(true);
  });

  it('the leaf query is live against the same nested source — anchor to the leaf selector (pin)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn { color: navy; .icon { width: 1rem; } }\n');
    const result = checkLinkLiveness(specWithLink('studio.css', '.icon'), dir);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
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
