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
