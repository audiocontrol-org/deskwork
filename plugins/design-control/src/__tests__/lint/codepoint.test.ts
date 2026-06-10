import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAllowedCodepoint, findDisallowedCodepoints } from '@/lint/codepoint';
import { lintWireframeStructural } from '@/lint/check-mockup-lofi';
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

  // AUDIT-20260606-24 (claude-01): NFC COMPOSES, it does not STRIP — a combining
  // mark with no composable base must still be flagged (locks the invariant the
  // -22 fix rests on, so a strip-based regression would fail).
  it('still rejects a non-composable combining mark (NFC does not strip)', () => {
    const acute = String.fromCodePoint(0x0301); // combining acute, no composable base here
    expect(findDisallowedCodepoints(acute)).toEqual([{ codepoint: 0x0301, char: acute }]);
    expect(findDisallowedCodepoints(`1${acute}`).map((f) => f.codepoint)).toEqual([0x0301]);
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
  const rules = (html: string): string[] => lintWireframeStructural(html).findings.map((f) => f.rule);

  it('the shipped example wireframe passes the codepoint allowlist', () => {
    const r = lintWireframeStructural(readFileSync(SKETCH_KIT_SAMPLE_PATH, 'utf8'));
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

// AUDIT-20260610-15 (round-2 gpt-5-05, LOW false-positive): Romanian
// comma-below letters Ș/ș/Ț/ț are Latin Extended-B (U+0218–U+021B), one block
// past the allowlist's Extended-A ceiling — genuinely lo-fi structural copy
// was rejected. Enumerated extension, not a block grant.
describe('codepoint allowlist — Romanian comma-below letters (AUDIT-20260610-15)', () => {
  it('permits Ș ș Ț ț', () => {
    for (const ch of ['Ș', 'ș', 'Ț', 'ț']) {
      expect(isAllowedCodepoint(ch.codePointAt(0)!), ch).toBe(true);
    }
  });
  it('accepts the planted Romanian lo-fi copy through the lint', () => {
    const r = lintWireframeStructural(wrap(`<h1 class="sk-h1">Conținut și acțiuni</h1>`));
    expect(r.findings.map((f) => f.rule)).not.toContain('disallowed-codepoint');
  });
  it('does not open the rest of Latin Extended-B (Ǎ stays rejected)', () => {
    expect(isAllowedCodepoint(0x01cd)).toBe(false);
  });
});

// AUDIT-20260610-12 (round-2 gpt-5-02, HIGH): <code>+<br> rows of dense
// punctuation reconstruct pixel-art wordmarks after the <pre> removal — the
// channel is punctuation MASS with row control, not preserved whitespace.
// Density rule: a text node with ≥ 8 non-whitespace codepoints of which ≥ 80%
// are punctuation is imagery-shaped, not copy-shaped. Bounds the channel; the
// referee's gross-class judgment remains the backstop for text-as-imagery.
describe('lintWireframe — punctuation-density imagery channel (AUDIT-20260610-12)', () => {
  const rules = (html: string): string[] => lintWireframeStructural(html).findings.map((f) => f.rule);

  it('rejects the planted pixel-art row (gpt-5-02 defeating input, single row)', () => {
    expect(rules(wrap(`<code>###..###..#####</code>`))).toContain('punctuation-density');
  });

  it('rejects the full code+br wordmark', () => {
    const art =
      `<h1 class="sk-h1"><code>###..###..#####</code><br><code>#..##..#..#....</code><br><code>#####..#..####.</code></h1>`;
    expect(rules(wrap(art))).toContain('punctuation-density');
  });

  it('rejects punctuation art outside code too (divs give rows; the channel is density)', () => {
    expect(rules(wrap(`<div>(((((-----)))))</div>`))).toContain('punctuation-density');
  });

  it('accepts ordinary copy with trailing ellipsis and punctuation', () => {
    expect(rules(wrap(`<p>Loading the dashboard, please wait…</p>`))).not.toContain('punctuation-density');
  });

  it('accepts a short pure-punctuation node (below the length floor)', () => {
    expect(rules(wrap(`<p>…</p>`))).not.toContain('punctuation-density');
    expect(rules(wrap(`<span>—</span>`))).not.toContain('punctuation-density');
  });

  it('accepts parenthesized/punctuation-heavy but copy-shaped text', () => {
    expect(rules(wrap(`<p>(see notes, p. 4–7)</p>`))).not.toContain('punctuation-density');
  });

  it('accepts inline code that is actual code-shaped copy', () => {
    expect(rules(wrap(`<p>run <code>npm test --workspaces</code> first</p>`))).not.toContain(
      'punctuation-density',
    );
  });

  // AUDIT-20260610-17 (round-3 gpt-5-01/-02, HIGH): per-text-node density is
  // defeated by SHARDING — adjacent <code> shards each below the length floor,
  // or one glyph per table cell. The density gate also runs over each BLOCK
  // container's aggregate descendant text (the rendered-row granularity the
  // shards reassemble at).
  describe('block-aggregate density (sharding defeats, AUDIT-20260610-17)', () => {
    it('rejects the sharded code wordmark (round-3 gpt-5-01 defeating input)', () => {
      const art =
        `<h1 class="sk-h1"><code>#######</code><code>.......</code><code>#######</code><br>` +
        `<code>#.....#</code><code>.....#.</code><code>#.....#</code></h1>`;
      expect(rules(wrap(art))).toContain('punctuation-density');
    });

    it('rejects the table-cell mosaic (round-3 gpt-5-02 defeating input)', () => {
      const art =
        `<table><tbody>` +
        `<tr><td>#</td><td>#</td><td>#</td><td>.</td><td>.</td><td>#</td><td>#</td><td>#</td></tr>` +
        `<tr><td>#</td><td>.</td><td>.</td><td>#</td><td>#</td><td>.</td><td>.</td><td>#</td></tr>` +
        `</tbody></table>`;
      expect(rules(wrap(art))).toContain('punctuation-density');
    });

    it('rejects inline-shard art inside a letter-diluted block (per-node floor still matters)', () => {
      // The parent div's aggregate is diluted by prose; the single dense node
      // must still be caught by the per-text-node check.
      const html = `<div><p>Quarterly revenue summary for the northwest region and all subsidiary accounts.</p><button class="sk-btn">###..###..#####</button></div>`;
      expect(rules(wrap(html))).toContain('punctuation-density');
    });

    it('accepts an ordinary data table (letters/digits dominate)', () => {
      const table =
        `<table><tbody>` +
        `<tr><th>Plan</th><th>Price</th><th>Seats</th></tr>` +
        `<tr><td>Basic</td><td>9</td><td>5</td></tr>` +
        `<tr><td>Team</td><td>49</td><td>25</td></tr>` +
        `</tbody></table>`;
      expect(rules(wrap(table))).not.toContain('punctuation-density');
    });

    it('accepts a short placeholder row (below the aggregate floor)', () => {
      expect(rules(wrap(`<tr><td>—</td><td>—</td><td>—</td></tr>`))).not.toContain(
        'punctuation-density',
      );
    });

    it('accepts a normal prose page (whole-body aggregate is letter-dominated)', () => {
      const html =
        `<main><h1>Checkout</h1><p>Review your order, then continue to payment.</p>` +
        `<p>(Prices include VAT — see notes…)</p></main>`;
      expect(rules(wrap(html))).not.toContain('punctuation-density');
    });
  });
});
