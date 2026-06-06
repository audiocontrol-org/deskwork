import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAllowedCodepoint, findDisallowedCodepoints } from '@/lint/codepoint';
import { lintWireframe } from '@/lint/check-mockup-lofi';
import { SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';

const cp = (ch: string): number => ch.codePointAt(0)!;
const wrap = (bodyInner: string): string =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
  `<title>WF</title><link rel="stylesheet" href="sketch-kit.css"></head>` +
  `<body class="sk sk-theme-grayscale">${bodyInner}</body></html>`;

describe('codepoint allowlist — permits genuine lo-fi text', () => {
  it('permits Basic-Latin letters and digits', () => {
    for (const ch of 'ABCxyz0189') expect(isAllowedCodepoint(cp(ch))).toBe(true);
  });

  it('permits the enumerated whitespace set (space, newline, tab)', () => {
    for (const ch of [' ', '\n', '\t']) expect(isAllowedCodepoint(cp(ch))).toBe(true);
  });

  it('permits ASCII punctuation and common typographic punctuation', () => {
    for (const ch of '.,;:!?\'"`-()[]{}/@#$%^&*_+=<>~|\\') {
      expect(isAllowedCodepoint(cp(ch)), `ASCII ${JSON.stringify(ch)}`).toBe(true);
    }
    for (const ch of '–—…·“”‘’') {
      expect(isAllowedCodepoint(cp(ch)), `typographic ${JSON.stringify(ch)}`).toBe(true);
    }
  });

  it('permits enumerated accented Latin (Latin-1 + Latin Extended-A)', () => {
    for (const ch of 'café naïve Zürich Łódź Œuvre señor ÿ') {
      expect(isAllowedCodepoint(cp(ch)), `accented ${JSON.stringify(ch)}`).toBe(true);
    }
  });
});

describe('codepoint allowlist — rejects designed-typography / non-lo-fi codepoints', () => {
  it('rejects Mathematical-Alphanumeric bold letters (round-9 leakage)', () => {
    // 𝐃𝐚𝐬𝐡 — these carry Unicode category Letter, so a range-denylist would pass them
    for (const ch of '𝐃𝐚𝐬𝐡') expect(isAllowedCodepoint(cp(ch))).toBe(false);
  });
  it('rejects enclosed alphanumerics, fullwidth, and fraktur/double-struck', () => {
    for (const ch of '①②Ｄａｓｈ𝔇𝕊') expect(isAllowedCodepoint(cp(ch))).toBe(false);
  });
  it('rejects pictographic/emoji', () => {
    for (const ch of '🎉🔥✅') expect(isAllowedCodepoint(cp(ch))).toBe(false);
  });
  it('rejects box-drawing, tag chars, variation selectors, and zero-width formatting', () => {
    expect(isAllowedCodepoint(0x2500)).toBe(false); // ─ box drawing
    expect(isAllowedCodepoint(0xe0041)).toBe(false); // tag char
    expect(isAllowedCodepoint(0xfe0f)).toBe(false); // variation selector-16
    expect(isAllowedCodepoint(0x200b)).toBe(false); // zero-width space
    expect(isAllowedCodepoint(0xfeff)).toBe(false); // zero-width no-break space / BOM
  });
  it('rejects non-enumerated whitespace (nbsp, em space, ideographic space) — round-10', () => {
    expect(isAllowedCodepoint(0x00a0)).toBe(false); // nbsp
    expect(isAllowedCodepoint(0x2003)).toBe(false); // em space
    expect(isAllowedCodepoint(0x3000)).toBe(false); // ideographic space
    expect(isAllowedCodepoint(0x000d)).toBe(false); // carriage return (only \n/\t/space)
  });
  it('rejects the × and ÷ math symbols inside the Latin-1 block', () => {
    expect(isAllowedCodepoint(0x00d7)).toBe(false); // ×
    expect(isAllowedCodepoint(0x00f7)).toBe(false); // ÷
  });
});

describe('findDisallowedCodepoints', () => {
  it('returns nothing for clean lo-fi prose', () => {
    expect(findDisallowedCodepoints('Recent entries — café, naïve. 12 items…')).toEqual([]);
  });
  // AUDIT-20260606-22 (claude-01): NFD-decomposed accented Latin (macOS / pasted
  // text) must compose to its allowlisted precomposed form, not trip the
  // combining-mark block.
  it('accepts NFD-decomposed accented Latin (café / Zürich in decomposed form)', () => {
    const nfd = 'café Zürich'.normalize('NFD'); // ensure decomposed
    expect(findDisallowedCodepoints(nfd)).toEqual([]);
  });

  it('reports each distinct disallowed codepoint once, with its char', () => {
    const found = findDisallowedCodepoints('Dashboard 𝐃 and 🎉 and 🎉 again');
    const cps = found.map((f) => f.codepoint);
    expect(cps).toContain(cp('𝐃'));
    expect(cps).toContain(cp('🎉'));
    // deduped: 🎉 appears twice in the text but once in findings
    expect(cps.filter((c) => c === cp('🎉'))).toHaveLength(1);
  });
});

describe('lintWireframe — axis 2 integration', () => {
  const rules = (html: string): string[] => lintWireframe(html).findings.map((f) => f.rule);

  it('the shipped example wireframe passes the codepoint allowlist', () => {
    const r = lintWireframe(readFileSync(SKETCH_KIT_SAMPLE_PATH, 'utf8'));
    expect(r.findings.filter((f) => f.rule === 'disallowed-codepoint')).toEqual([]);
  });
  it('rejects a Math-bold heading (the planted round-9 case)', () => {
    expect(rules(wrap(`<h1 class="sk-h1">𝐃𝐚𝐬𝐡𝐛𝐨𝐚𝐫𝐝</h1>`))).toContain('disallowed-codepoint');
  });
  it('rejects emoji-as-icon in text', () => {
    expect(rules(wrap(`<div class="sk-btn">🎉 New</div>`))).toContain('disallowed-codepoint');
  });
  it('does not flag designed typography hidden in a class value (inert, not text)', () => {
    // class values are not text content; axis-1 keeps them inert, axis-2 ignores them
    expect(rules(wrap(`<div class="𝐃-decorative">ok</div>`))).not.toContain('disallowed-codepoint');
  });
});
