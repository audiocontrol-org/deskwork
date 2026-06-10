import { describe, it, expect } from 'vitest';
import { lintWireframeStructural } from '@/lint/check-mockup-lofi';
import { URL_ATTRS, URL_ATTR_PAIRS, TAG_ATTRS, GLOBAL_ATTRS } from '@/lint/allowlist';

/** Embed a body fragment in an otherwise-valid lo-fi skeleton to isolate one rule. */
const wrap = (bodyInner: string): string =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
  `<title>WF</title><link rel="stylesheet" href="sketch-kit.css"></head>` +
  `<body class="sk sk-theme-grayscale">${bodyInner}</body></html>`;

const rules = (html: string): string[] => lintWireframeStructural(html).findings.map((f) => f.rule);

/** Render one element carrying `attr="value"`, valid enough to isolate the value check. */
const elementWith = (tag: string, attr: string, value: string): string => {
  if (tag === 'link') return `<link rel="stylesheet" ${attr}="${value}">`;
  if (tag === 'meta') return `<meta name="x" ${attr}="${value}">`;
  return `<${tag} ${attr}="${value}">x</${tag}>`;
};

// AUDIT-20260606-07 / ex-#428 (backlog TASK-7 + TASK-1): URL_ATTRS is DERIVED
// from kind-tagged allowlist entries, and the allowlist→scanning direction is
// behaviorally enforced — every url-kind (tag, attr) pair is value-scanned by
// the lint, so an allowlisted URL-bearing attr cannot silently skip scanning.
describe('allowlist URL-attr derivation (AUDIT-20260606-07 / TASK-7+1)', () => {
  it('exposes the url-kind (tag, attr) pairs and they cover the known URL attrs', () => {
    expect(URL_ATTR_PAIRS.length).toBeGreaterThan(0);
    const asStrings = URL_ATTR_PAIRS.map(([tag, attr]) => `${tag} ${attr}`);
    expect(asStrings).toContain('a href');
    expect(asStrings).toContain('link href');
  });

  it('URL_ATTRS is exactly the derived attr set of the url-kind pairs (no parallel maintenance)', () => {
    const derived = new Set(URL_ATTR_PAIRS.map(([, attr]) => attr));
    expect(new Set(URL_ATTRS)).toEqual(derived);
  });

  it('every url-kind pair points at an attr the allowlist actually permits on that tag', () => {
    for (const [tag, attr] of URL_ATTR_PAIRS) {
      const permitted = TAG_ATTRS[tag]?.has(attr) === true || GLOBAL_ATTRS.has(attr);
      expect(permitted, `${tag} ${attr} is url-tagged but not allowlisted`).toBe(true);
    }
  });

  it('BEHAVIORAL: every url-kind pair is scheme-scanned — javascript: is rejected on each', () => {
    for (const [tag, attr] of URL_ATTR_PAIRS) {
      const found = rules(wrap(elementWith(tag, attr, 'javascript:alert(1)')));
      expect(found, `${tag} ${attr} javascript: leaked unscanned`).toContain(
        'disallowed-uri-scheme',
      );
    }
  });

  it('BEHAVIORAL: every url-kind pair is data:-scanned — data: is rejected on each', () => {
    for (const [tag, attr] of URL_ATTR_PAIRS) {
      const found = rules(wrap(elementWith(tag, attr, 'data:text/css,body{}')));
      expect(found, `${tag} ${attr} data: leaked unscanned`).toContain('data-uri');
    }
  });

  it('the kind distinction is live: a plain-kind attr value is not scheme-gated', () => {
    // `button type` is allowlisted plain-kind: its value never reaches the
    // URL-shape checks (it gets no disallowed-uri-scheme finding; the attr is
    // simply not URL-bearing). Documents the boundary the derivation encodes.
    const found = rules(wrap(`<button type="javascript:x" class="sk-btn">x</button>`));
    expect(found).not.toContain('disallowed-uri-scheme');
  });
});
