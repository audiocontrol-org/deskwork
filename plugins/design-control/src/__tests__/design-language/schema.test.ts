/**
 * Schema tests for the design-language spec convention (Phase 2).
 *
 * The spec is a HAND-AUTHORABLE markdown artifact — these tests pin the parse +
 * structural-validation contract: rules declared under `### rule: <id>` headings
 * with bullet fields (`kind:` / `css:` / `example:` / `do:` / `don't:`). The
 * example-presence acceptance is here: a rule with ZERO example references is
 * rejected (structural presence only — example truthfulness is named-deferred).
 *
 * Nothing in this module touches the engine or the filesystem: the schema is
 * pure text → structure (link-liveness is the separate, fs-backed axis).
 */

import { describe, expect, it } from 'vitest';
import { parseDesignSpec } from '@/design-language/schema';
import { RULE_KINDS } from '@/design-language/types';

const VALID_SPEC = `# Design language: deskwork studio

## Palette

### rule: ink-primary
- kind: palette
- css: styles/studio.css .btn-primary
- example: dashboard compose button uses .btn-primary
- do: Use the ink palette for every primary action.
- don't: Never introduce raw hex blues outside the palette tokens.

## Signature components

### rule: masthead
- kind: component
- css: styles/studio.css .masthead
- css: styles/chrome.css .masthead-rule
- example: every page renders the double-rule masthead
- example: entry-review header
- do: Every top-level page opens with the masthead.
`;

function findingsFor(markdown: string) {
  return parseDesignSpec(markdown).findings.map((f) => f.rule);
}

describe('parseDesignSpec — valid hand-authored spec', () => {
  it('parses a diverse valid spec with zero findings', () => {
    const result = parseDesignSpec(VALID_SPEC);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.spec.rules).toHaveLength(2);
  });

  it('captures rule fields: id, kind, css links, examples, guidance', () => {
    const result = parseDesignSpec(VALID_SPEC);
    const [ink, masthead] = result.spec.rules;
    expect(ink.id).toBe('ink-primary');
    expect(ink.kind).toBe('palette');
    expect(ink.cssLinks).toEqual([{ path: 'styles/studio.css', selector: '.btn-primary' }]);
    expect(ink.examples).toEqual(['dashboard compose button uses .btn-primary']);
    expect(ink.dos).toEqual(['Use the ink palette for every primary action.']);
    expect(ink.donts).toEqual(['Never introduce raw hex blues outside the palette tokens.']);

    expect(masthead.id).toBe('masthead');
    expect(masthead.kind).toBe('component');
    expect(masthead.cssLinks).toHaveLength(2);
    expect(masthead.cssLinks[1]).toEqual({ path: 'styles/chrome.css', selector: '.masthead-rule' });
    expect(masthead.examples).toHaveLength(2);
    expect(masthead.donts).toEqual([]);
  });

  it('accepts a descendant (multi-token) selector in a css link', () => {
    const result = parseDesignSpec(`### rule: nav-item
- kind: component
- css: styles/studio.css .masthead nav a
- example: top nav
- do: Keep nav items inside the masthead.
`);
    expect(result.findings).toEqual([]);
    expect(result.spec.rules[0].cssLinks[0]).toEqual({
      path: 'styles/studio.css',
      selector: '.masthead nav a',
    });
  });

  it('treats prose lines and non-field bullets as inert prose', () => {
    const result = parseDesignSpec(`### rule: spacing-scale
- kind: spacing
- css: styles/studio.css .stack
- example: entry list stacking

Background prose explaining the scale.

- Note: this bullet is prose, not a field (capitalised key).
- do: Use the 4px base scale.
`);
    expect(result.findings).toEqual([]);
    expect(result.spec.rules[0].dos).toEqual(['Use the 4px base scale.']);
  });

  it('exports the closed kind vocabulary', () => {
    expect(RULE_KINDS).toEqual(['palette', 'type', 'spacing', 'component']);
  });
});

describe('parseDesignSpec — example-presence (acceptance: zero examples rejected)', () => {
  it('rejects a rule with zero example references', () => {
    const result = parseDesignSpec(`### rule: ink-primary
- kind: palette
- css: styles/studio.css .btn-primary
- do: Use the ink palette.
`);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'missing-example' && f.ruleId === 'ink-primary')).toBe(
      true,
    );
  });

  it('an empty example value does not satisfy example-presence', () => {
    const findings = findingsFor(`### rule: ink-primary
- kind: palette
- css: styles/studio.css .btn-primary
- example:
- do: Use the ink palette.
`);
    expect(findings).toContain('empty-field');
    expect(findings).toContain('missing-example');
  });
});

describe('parseDesignSpec — structural rejections', () => {
  it('flags a document with no rules at all', () => {
    expect(findingsFor('# Design language\n\nProse only.\n')).toContain('no-rules');
  });

  it('flags a missing kind', () => {
    expect(
      findingsFor(`### rule: ink
- css: styles/studio.css .btn
- example: a button
- do: x
`),
    ).toContain('missing-kind');
  });

  it('flags a kind outside the closed vocabulary', () => {
    expect(
      findingsFor(`### rule: ink
- kind: colour
- css: styles/studio.css .btn
- example: a button
- do: x
`),
    ).toContain('unknown-kind');
  });

  it('flags a rule with no css link (every rule links to live CSS)', () => {
    expect(
      findingsFor(`### rule: ink
- kind: palette
- example: a button
- do: x
`),
    ).toContain('missing-css-link');
  });

  it('flags a css link without a selector as malformed', () => {
    expect(
      findingsFor(`### rule: ink
- kind: palette
- css: styles/studio.css
- example: a button
- do: x
`),
    ).toContain('malformed-css-link');
  });

  it('flags a rule with neither do nor don’t guidance', () => {
    expect(
      findingsFor(`### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
`),
    ).toContain('missing-guidance');
  });

  it('flags duplicate rule ids', () => {
    expect(
      findingsFor(`### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: x

### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: x
`),
    ).toContain('duplicate-rule-id');
  });

  it('flags a rule heading without an id', () => {
    expect(findingsFor('### rule:\n- kind: palette\n')).toContain('malformed-rule-heading');
  });

  it('flags an unknown lowercase field key (typo guard, allowlist-shaped)', () => {
    const findings = findingsFor(`### rule: ink
- kind: palette
- css: styles/studio.css .btn
- exmaple: a button
- do: x
`);
    expect(findings).toContain('unknown-field');
    expect(findings).toContain('missing-example');
  });

  it('flags a capitalised "Rule:" heading as a near-miss, not inert structure', () => {
    const result = parseDesignSpec(`### Rule: masthead
- kind: component
- css: styles/studio.css .masthead
- example: every page renders the masthead
- do: Every page opens with the masthead.
`);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.rule === 'malformed-rule-heading')).toBe(true);
    expect(result.spec.rules).toEqual([]);
  });

  it('flags a colon-less "rule <id>" heading as a near-miss', () => {
    expect(findingsFor('### rule missing-colon\n- kind: palette\n')).toContain(
      'malformed-rule-heading',
    );
  });

  it('leaves genuinely unrelated headings inert (word boundary: "Ruler" is not "rule")', () => {
    const result = parseDesignSpec(`## Ruler settings

## Palette

### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: x
`);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.spec.rules.map((r) => r.id)).toEqual(['ink']);
  });

  it('a near-miss heading alongside a valid rule still flags (no silent green)', () => {
    const result = parseDesignSpec(`### Rule: masthead
- kind: component
- css: styles/studio.css .masthead
- example: every page renders the masthead
- do: Every page opens with the masthead.

### rule: fine
- kind: type
- css: styles/studio.css .serif
- example: body copy
- do: Use the serif stack for prose.
`);
    expect(result.ok).toBe(false);
    expect(result.spec.rules.map((r) => r.id)).toEqual(['fine']);
    expect(result.findings.map((f) => f.rule)).toContain('malformed-rule-heading');
  });

  it('captures a curly-apostrophe don’t (U+2019) exactly like ASCII don\'t', () => {
    const result = parseDesignSpec(`### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: Use the ink palette.
- don’t: Never introduce raw hex blues.
`);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.spec.rules[0].donts).toEqual(['Never introduce raw hex blues.']);
  });

  it('flags an unknown key containing a curly apostrophe (normalized typo guard)', () => {
    const findings = findingsFor(`### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- can’t: x
- do: y
`);
    expect(findings).toContain('unknown-field');
  });

  it('excludes invalid rules from spec.rules but keeps valid siblings', () => {
    const result = parseDesignSpec(`### rule: broken
- kind: palette

### rule: fine
- kind: type
- css: styles/studio.css .serif
- example: body copy
- do: Use the serif stack for prose.
`);
    expect(result.ok).toBe(false);
    expect(result.spec.rules.map((r) => r.id)).toEqual(['fine']);
  });
});

describe('parseDesignSpec — single-pass defect surfacing (no finding waves)', () => {
  const VALID_INK = `### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: x
`;

  it('a valid spec carries zero auxiliary css links', () => {
    const result = parseDesignSpec(VALID_SPEC);
    expect(result.auxiliaryCssLinks).toEqual([]);
  });

  it('routes a structurally-invalid rule’s css links to auxiliaryCssLinks', () => {
    const result = parseDesignSpec(`### rule: no-example
- kind: palette
- css: styles/studio.css .btn
- do: x
`);
    expect(result.findings.map((f) => f.rule)).toContain('missing-example');
    expect(result.spec.rules).toEqual([]);
    expect(result.auxiliaryCssLinks).toEqual([
      { ruleId: 'no-example', link: { path: 'styles/studio.css', selector: '.btn' } },
    ]);
  });

  it('a duplicate section’s field bullets are still inspected — typo guard fires', () => {
    const result = parseDesignSpec(`${VALID_INK}
### rule: ink
- kind: palette
- css: styles/studio.css .btn
- exmaple: a button
- do: x
`);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('duplicate-rule-id');
    expect(rules).toContain('unknown-field');
    const typo = result.findings.find((f) => f.rule === 'unknown-field');
    expect(typo?.ruleId).toBe('ink');
  });

  it('a duplicate section’s empty fields and malformed css links surface in the same pass', () => {
    const result = parseDesignSpec(`${VALID_INK}
### rule: ink
- kind:
- css: styles/studio.css
- example: a button
- do: x
`);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('duplicate-rule-id');
    expect(rules).toContain('empty-field');
    expect(rules).toContain('malformed-css-link');
  });

  it('routes a duplicate section’s css links to auxiliaryCssLinks, excluded from spec.rules', () => {
    const result = parseDesignSpec(`${VALID_INK}
### rule: ink
- kind: palette
- css: styles/studio.css .ghost
- example: a button
- do: x
`);
    expect(result.spec.rules.map((r) => r.id)).toEqual(['ink']);
    expect(result.spec.rules[0].cssLinks).toEqual([
      { path: 'styles/studio.css', selector: '.btn' },
    ]);
    expect(result.auxiliaryCssLinks).toEqual([
      { ruleId: 'ink', link: { path: 'styles/studio.css', selector: '.ghost' } },
    ]);
  });

  it('a duplicate section does NOT fire per-rule validation (it is not a rule)', () => {
    // The duplicate carries only `css:` — missing-kind/example/guidance would
    // fire if it were validated as a rule. Deliberately they do not: the
    // canonical rule owns the per-rule contract; the duplicate surfaces only
    // its field-level defects + duplicate-rule-id.
    const result = parseDesignSpec(`${VALID_INK}
### rule: ink
- css: styles/studio.css .ghost
`);
    expect(result.findings.map((f) => f.rule)).toEqual(['duplicate-rule-id']);
    expect(result.auxiliaryCssLinks).toEqual([
      { ruleId: 'ink', link: { path: 'styles/studio.css', selector: '.ghost' } },
    ]);
  });

  it("inspects a near-miss section's body: typo guard fires, css link reaches auxiliaryCssLinks", () => {
    const result = parseDesignSpec(`### Rule: masthead
- exmaple: every page renders the masthead
- css: styles/studio.css .ghost
`);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('malformed-rule-heading');
    expect(rules).toContain('unknown-field');
    const typo = result.findings.find((f) => f.rule === 'unknown-field');
    expect(typo?.ruleId).toBe('masthead');
    expect(result.auxiliaryCssLinks).toEqual([
      { ruleId: 'masthead', link: { path: 'styles/studio.css', selector: '.ghost' } },
    ]);
  });
});

describe('parseDesignSpec — rule-declaration attempts outside the ATX form', () => {
  it('flags a setext "rule: beta" heading and does not merge its fields into the prior rule', () => {
    const result = parseDesignSpec(`### rule: alpha
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: x

rule: beta
----------
- kind: component
- css: styles/studio.css .ghost
- example: ghost button
- do: y
`);
    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.rule === 'malformed-rule-heading');
    expect(finding?.message).toMatch(/setext/i);
    // beta's section is NOT merged into alpha…
    expect(result.spec.rules.map((r) => r.id)).toEqual(['alpha']);
    expect(result.spec.rules[0].cssLinks).toEqual([
      { path: 'styles/studio.css', selector: '.btn' },
    ]);
    expect(result.spec.rules[0].examples).toEqual(['a button']);
    // …and its css link is still inspected for the liveness axis.
    expect(result.auxiliaryCssLinks).toEqual([
      { ruleId: 'beta', link: { path: 'styles/studio.css', selector: '.ghost' } },
    ]);
  });

  it('flags a paragraph-line "rule: gamma" (no underline) as an attempted declaration, not inert prose', () => {
    const result = parseDesignSpec(`rule: gamma
- kind: palette
- css: styles/studio.css .ghost
`);
    const finding = result.findings.find((f) => f.rule === 'malformed-rule-heading');
    expect(finding).toBeDefined();
    expect(finding?.message).toMatch(/heading/i);
    expect(result.auxiliaryCssLinks).toEqual([
      { ruleId: 'gamma', link: { path: 'styles/studio.css', selector: '.ghost' } },
    ]);
  });

  it('leaves a prose sentence mentioning "rule:" mid-line inert (only line-initial attempts count)', () => {
    const result = parseDesignSpec(`### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: x

The guiding rule: keep ink primary everywhere.
`);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('leaves prose headings starting with "Rule" inert ("Rule of thumb", "Rule kinds")', () => {
    const result = parseDesignSpec(`## Rule of thumb

## Rule kinds

### rule: ink
- kind: palette
- css: styles/studio.css .btn
- example: a button
- do: x
`);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.spec.rules.map((r) => r.id)).toEqual(['ink']);
  });

  it('names the spaced-colon mismatch for "### rule :x" (not "missing the colon")', () => {
    const result = parseDesignSpec('### rule :x\n');
    const finding = result.findings.find((f) => f.rule === 'malformed-rule-heading');
    expect(finding?.message).toMatch(/space/i);
    expect(finding?.message).not.toMatch(/missing the ":"/);
  });
});
