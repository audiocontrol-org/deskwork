import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lintWireframe, lintWireframeStructural, ALLOWED_TAGS } from '@/lint/check-mockup-lofi';
import { URL_ATTRS, RESOURCE_URL_ATTRS } from '@/lint/allowlist';
import { SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';

/** Embed a body fragment in an otherwise-valid lo-fi skeleton to isolate one rule. */
const wrap = (bodyInner: string): string =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
  `<title>WF</title><link rel="stylesheet" href="sketch-kit.css"></head>` +
  `<body class="sk sk-theme-grayscale">${bodyInner}</body></html>`;

const rules = (html: string): string[] => lintWireframeStructural(html).findings.map((f) => f.rule);

describe('check-mockup-lofi — accepts genuinely lo-fi wireframes', () => {
  it('passes the shipped example wireframe', () => {
    const result = lintWireframeStructural(readFileSync(SKETCH_KIT_SAMPLE_PATH, 'utf8'));
    expect(result.findings, JSON.stringify(result.findings)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes a minimal hand-authored wireframe (banner + structural tags + sk-img)', () => {
    const html = wrap(
      `<div class="sk-banner"><strong>WIREFRAME</strong> structure only</div>` +
        `<div class="sk-shell"><section class="sk-card">` +
        `<h2 class="sk-title">Recent</h2>` +
        `<ul><li><span class="sk-line sk-line-l"></span></li></ul>` +
        `<div class="sk-img"><span class="sk-img-label">image</span></div>` +
        `<a href="#"><button type="button" class="sk-btn">Go</button></a>` +
        `</section></div>`,
    );
    const result = lintWireframeStructural(html);
    expect(result.findings, JSON.stringify(result.findings)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('permits arbitrary (inert) class values — pinned stylesheet is the sole CSS source', () => {
    // Per round-8: class values are permitted-but-inert; the lint constrains
    // tags/attrs, not class strings.
    const result = lintWireframeStructural(wrap(`<div class="totally-made-up not-an-sk-class">x</div>`));
    expect(result.ok, JSON.stringify(result.findings)).toBe(true);
  });

  it('permits HTML comments (inert)', () => {
    expect(lintWireframeStructural(wrap(`<!-- a note --><div>x</div>`)).ok).toBe(true);
  });
});

describe('check-mockup-lofi — rejects script/style/inline-style channels', () => {
  it('rejects <script>', () => {
    expect(rules(wrap(`<script>alert(1)</script>`))).toContain('disallowed-element');
  });
  it('rejects <style>', () => {
    expect(rules(wrap(`<style>.x{color:red}</style>`))).toContain('disallowed-element');
  });
  it('rejects inline style= with its own rule', () => {
    expect(rules(wrap(`<div style="color:red">x</div>`))).toContain('inline-style');
  });
});

describe('check-mockup-lofi — rejects external/embedded resources', () => {
  it('rejects <img> entirely (use .sk-img placeholder)', () => {
    expect(rules(wrap(`<img src="photo.png">`))).toContain('disallowed-element');
  });
  it('rejects a relative external .svg via <img>', () => {
    expect(rules(wrap(`<img src="icon.svg">`))).toContain('disallowed-element');
  });
  it('rejects <picture> and srcset', () => {
    expect(rules(wrap(`<picture></picture>`))).toContain('disallowed-element');
  });
  it('rejects <iframe>, <object>, <embed>', () => {
    expect(rules(wrap(`<iframe></iframe>`))).toContain('disallowed-element');
    expect(rules(wrap(`<object></object>`))).toContain('disallowed-element');
    expect(rules(wrap(`<embed>`))).toContain('disallowed-element');
  });
  it('rejects a srcset attribute via the allowlist catch-all', () => {
    // srcset is not enumerated for any allowed tag → disallowed-attribute (the
    // allowlist outcome; we do not maintain a denylist of srcset specifically).
    expect(rules(wrap(`<div srcset="a 1x">x</div>`))).toContain('disallowed-attribute');
  });
  it('rejects a non-stylesheet <link> relation (favicon/preload resource channel)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css">` +
      `<link rel="icon" href="favicon.ico"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('disallowed-link-rel');
  });
  // AUDIT-20260606-02 (codex-01): mixed rel tokens must not slip the gate.
  it('rejects a MIXED <link> rel that merely contains stylesheet (rel="stylesheet icon")', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet icon" href="sketch-kit.css"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('disallowed-link-rel');
  });
  it('rejects a javascript: URI scheme in a navigation href', () => {
    expect(rules(wrap(`<a href="javascript:alert(1)">x</a>`))).toContain('disallowed-uri-scheme');
  });
  // AUDIT-20260606-03 (codex-02 + claude-03; cross-model): control-char-obfuscated
  // schemes decode past a start-anchored regex — reject C0 controls in href.
  it('rejects a control-char-obfuscated javascript scheme (java\\nscript:)', () => {
    expect(rules(wrap(`<a href="java&#x0a;script:alert(1)">x</a>`))).toContain('disallowed-uri-scheme');
  });
  it('rejects a data: URI in a stylesheet href', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="data:text/css,body{}"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('data-uri');
  });
  it('does NOT false-positive on the substring "data:" inside an ordinary value', () => {
    expect(lintWireframeStructural(wrap(`<div class="metadata-row">x</div>`)).ok).toBe(true);
  });
  // AUDIT-20260606-01 (claude-01): data: scanning must be scoped to href, not
  // every attribute value — class values are inert/unconstrained (round-8).
  it('permits a class value that literally contains "data:" (inert, round-8)', () => {
    const r = lintWireframeStructural(wrap(`<div class="data:x">y</div>`));
    expect(r.ok, JSON.stringify(r.findings)).toBe(true);
  });
  it('permits prose containing "data:" in a non-URL attribute (meta content / title)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="description" content="a dashboard of the data: scheme">` +
      `<title>WF</title><link rel="stylesheet" href="sketch-kit.css"></head>` +
      `<body class="sk"><div title="see the data: scheme">x</div></body></html>`;
    expect(lintWireframeStructural(html).ok, JSON.stringify(lintWireframeStructural(html).findings)).toBe(true);
  });
  // AUDIT-20260606-01 (claude-02): a disallowed attribute carrying a data: value
  // is reported as disallowed-attribute (allowlist membership decided first), not
  // mislabeled data-uri.
  it('labels a data:-bearing DISALLOWED attribute as disallowed-attribute, not data-uri', () => {
    const r = rules(wrap(`<div foo="data:text/css,x">y</div>`));
    expect(r).toContain('disallowed-attribute');
    expect(r).not.toContain('data-uri');
  });
  it('rejects an external http(s) stylesheet href', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="https://cdn.example.com/x.css"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('external-resource');
  });
});

describe('check-mockup-lofi — rejects presentational attributes', () => {
  it.each(['bgcolor', 'background', 'width', 'height', 'align', 'border', 'color'])(
    'rejects presentational attribute %s',
    (attr) => {
      expect(rules(wrap(`<div ${attr}="1">x</div>`))).toContain('presentational-attribute');
    },
  );
  it('rejects the <font> element', () => {
    expect(rules(wrap(`<font size="7">x</font>`))).toContain('disallowed-element');
  });
  it('rejects event-handler attributes (onclick)', () => {
    expect(rules(wrap(`<div onclick="x()">x</div>`))).toContain('event-handler');
  });
});

describe('check-mockup-lofi — allowlist surface', () => {
  it('the allowed-tag set is closed and excludes every polish channel', () => {
    for (const banned of ['script', 'style', 'img', 'picture', 'iframe', 'object', 'embed', 'font', 'svg', 'video', 'canvas']) {
      expect(ALLOWED_TAGS.has(banned)).toBe(false);
    }
    for (const ok of ['html', 'head', 'body', 'div', 'span', 'section', 'h1', 'ul', 'li', 'a', 'button', 'link', 'meta']) {
      expect(ALLOWED_TAGS.has(ok)).toBe(true);
    }
  });

  // AUDIT-20260606-04 (claude-01): the cross-module invariant must be explicit —
  // every resource-loading attr is scheme/control-scanned because the lint gates
  // value-shape checks on URL_ATTRS. If a future task adds a resource attr to
  // RESOURCE_URL_ATTRS without adding it to URL_ATTRS, this test fails instead of
  // silently leaving that attr's values unscanned.
  it('every RESOURCE_URL_ATTRS attribute is covered by URL_ATTRS (scheme-scanned)', () => {
    for (const attrs of Object.values(RESOURCE_URL_ATTRS)) {
      for (const attr of attrs) {
        expect(URL_ATTRS.has(attr), `resource attr ${attr} not in URL_ATTRS`).toBe(true);
      }
    }
  });
});

// AUDIT-20260610-04 (gpt-5-03 HIGH + fable-07; cross-model channel): preserved
// whitespace in <pre> renders ASCII-art logos/wordmarks from purely allowlisted
// codepoints — a text-channel image the codepoint axis structurally cannot see.
// <pre> is removed from the allowlist: it is THE preserved-whitespace channel,
// and the lo-fi answer for a code-sample region is the .sk-img placeholder.
// Outside <pre>, HTML whitespace collapsing destroys the art (and nbsp-style
// spacers are already rejected by the codepoint axis), so removal closes the
// channel rather than relocating it.
describe('check-mockup-lofi — rejects the <pre> preserved-whitespace imagery channel (AUDIT-20260610-04)', () => {
  it('rejects the planted ASCII-art wordmark (gpt-5-03 defeating input)', () => {
    const art =
      `<pre>   ___   ____ __  __ _____\n  / _ \\ / ___|  \\/  | ____|\n / /_\\ \\ |   | |\\/| |  _|\n/ ___ \\ |___| |  | | |___\n/_/   \\_\\____|_|  |_|_____|</pre>`;
    expect(rules(wrap(art))).toContain('disallowed-element');
  });

  it('rejects <pre> even with innocuous content (the channel, not the payload, is closed)', () => {
    expect(rules(wrap(`<pre>plain text</pre>`))).toContain('disallowed-element');
  });

  it('still accepts inline <code> (whitespace collapses; not an art channel)', () => {
    expect(rules(wrap(`<p>run <code>npm test</code> first</p>`))).toEqual([]);
  });
});

// AUDIT-20260610-29 (round-7 gpt-5-01, HIGH): a document that never applies
// the kit ROOT class loads the pinned stylesheet but renders entirely through
// UA default styling — green meant the kit was linked and byte-true, not IN
// EFFECT. The body must carry the `sk` root token.
describe('check-mockup-lofi — kit root class required (AUDIT-20260610-29)', () => {
  it('rejects a document whose body lacks the sk root class (round-7 defeating input)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head>` +
      `<body><main><h1>Acme Analytics</h1></main></body></html>`;
    expect(rules(html)).toContain('kit-root-missing');
  });
  it('accepts a body carrying sk among other classes', () => {
    expect(rules(wrap(`<div class="sk-shell">x</div>`))).toEqual([]);
  });
  it('rejects a body whose classes do not include the bare sk token (sk-theme alone)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head>` +
      `<body class="sk-theme-grayscale"><div>x</div></body></html>`;
    expect(rules(html)).toContain('kit-root-missing');
  });
});

// AUDIT-20260610-32 (round-7 gpt-5-04, LOW fp): textarea is the multi-line
// sibling of the accepted input case — same structural class.
describe('check-mockup-lofi — textarea (AUDIT-20260610-32)', () => {
  it('accepts a labeled textarea with placeholder', () => {
    expect(rules(wrap(`<form><label for="n">Notes</label><textarea id="n" placeholder="Add notes"></textarea></form>`))).toEqual([]);
  });
  it('textarea placeholder rides the visible-attr gates', () => {
    expect(rules(wrap(`<textarea placeholder="𝐍𝐨𝐭𝐞𝐬"></textarea>`))).toContain('disallowed-codepoint');
  });

  // AUDIT-20260610-33 (round-8 gpt-5-01, HIGH): textarea preserves whitespace
  // (the pre channel reopened) AND scrolls, so the visible viewport renders
  // punctuation art while scrolled-out prose dilutes the density counter.
  // Allowlist-shaped closure, not statistics: a wireframe textarea must be
  // EMPTY — placeholder (gated) is the lo-fi idiom for its copy.
  it('rejects textarea with non-whitespace content (round-8 defeating input shape)', () => {
    const art = `<textarea>###..###..#####\n#..##..#..#....\nLong diluting prose copy here.</textarea>`;
    expect(rules(wrap(art))).toContain('textarea-content');
  });
  it('rejects textarea with even plain prose content (the channel, not the payload)', () => {
    expect(rules(wrap(`<textarea>prefilled review copy</textarea>`))).toContain('textarea-content');
  });
  it('accepts whitespace-only textarea content (formatting artifacts)', () => {
    expect(rules(wrap(`<textarea>\n  </textarea>`))).toEqual([]);
  });
});

// AUDIT-20260610-35 (round-8 gpt-5-03, LOW fp): checked is structural state
// for a form wireframe (default-selected checkbox/radio), not styling.
describe('check-mockup-lofi — checked state (AUDIT-20260610-35)', () => {
  it('accepts a checked checkbox', () => {
    expect(rules(wrap(`<form><label><input type="checkbox" checked> Email updates</label></form>`))).toEqual([]);
  });
});

// AUDIT-20260610-59 (round-16 gpt-5-02, LOW fp): details/summary are
// structure-and-flow disclosure primitives — same UA-baseline class as the
// accepted form controls. `open` is structural state like checked.
describe('check-mockup-lofi — details/summary (AUDIT-20260610-59)', () => {
  it('accepts a disclosure block', () => {
    expect(
      rules(wrap(`<details><summary>Advanced filters</summary><p>Status and owner controls.</p></details>`)),
    ).toEqual([]);
  });
  it('accepts a default-open disclosure', () => {
    expect(rules(wrap(`<details open><summary>Filters</summary><p>x</p></details>`))).toEqual([]);
  });
});

// Round-15 fixes (AUDIT-20260610-53..57): zero-HIGH round; 2 MED + 3 LOW.
describe('check-mockup-lofi — round-15 channels', () => {
  // AUDIT-53 (gpt-5-01, MED): dir flips layout direction — author-supplied
  // rendering input. The codepoint axis is Latin-only in v1, so RTL has no
  // legitimate v1 use; dir drops from the global allowlist (re-add with i18n).
  it('rejects dir (layout-direction channel; Latin-only v1)', () => {
    expect(rules(wrap(`<div dir="rtl">x</div>`))).toContain('disallowed-attribute');
  });
  // AUDIT-54 (gpt-5-02, MED): li value="-1" renders "-1." markers — generated
  // punctuation columns. List numbering must be digits-only.
  it('rejects negative list numbering (generated-marker punctuation)', () => {
    expect(rules(wrap(`<ol><li value="-1"></li><li value="-1"></li></ol>`))).toContain(
      'list-numbering',
    );
  });
  it('accepts ordinary list numbering', () => {
    expect(rules(wrap(`<ol start="3"><li>One</li><li value="7">Two</li></ol>`))).toEqual([]);
  });
  // AUDIT-55 (gpt-5-03, LOW): a legacy doctype flips the browser to quirks
  // mode — author-controlled rendering mode. The standards doctype is required.
  it('rejects a legacy doctype (quirks-mode channel)', () => {
    const html =
      `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><html lang="en"><head>` +
      `<meta charset="utf-8"><title>WF</title><link rel="stylesheet" href="sketch-kit.css">` +
      `</head><body class="sk"><p>x</p></body></html>`;
    expect(rules(html)).toContain('doctype-required');
  });
  it('rejects a missing doctype', () => {
    const html =
      `<html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head><body class="sk"><p>x</p></body></html>`;
    expect(rules(html)).toContain('doctype-required');
  });
  // AUDIT-56 (gpt-5-04, LOW fp): browsers percent-decode URLs —
  // %73ketch-kit.css names the kit. Compare decoded.
  it('accepts a percent-encoded kit href (browser-equivalent)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="%73ketch-kit.css"></head><body class="sk"><p>x</p></body></html>`;
    expect(rules(html)).not.toContain('stylesheet-filename-mismatch');
  });
  // AUDIT-57 (gpt-5-05, LOW fp): initial-scale=1.0 ≡ 1 — numeric values
  // normalize before the viewport compare.
  it('accepts initial-scale=1.0 (numeric-equivalent viewport)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head><body class="sk"><p>x</p></body></html>`;
    expect(rules(html)).not.toContain('disallowed-viewport');
  });
});

// AUDIT-20260610-50 (round-14 gpt-5-01 + gpt-5-02, both HIGH; one mechanism):
// whitespace-DEFINITION differential — JS \s matches NBSP but the browser's
// HTML token lists split on ASCII whitespace only, so rel="stylesheet&nbsp;"
// and class="sk&nbsp;..." read as DIFFERENT tokens to the browser than to the
// lint (kit silently not applied under a green pin). All token splits now use
// the HTML-spec ASCII set.
describe('check-mockup-lofi — ASCII-whitespace tokenization (AUDIT-20260610-50)', () => {
  it('rejects an NBSP-suffixed stylesheet rel (browser sees a non-stylesheet token)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet " href="sketch-kit.css"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('disallowed-link-rel');
  });
  it('rejects an NBSP-joined body class (browser sees one token, not sk)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head>` +
      `<body class="sk sk-theme-grayscale"><div>x</div></body></html>`;
    expect(rules(html)).toContain('kit-root-missing');
  });
});

// AUDIT-20260610-51 (round-14 gpt-5-03, HIGH): punctuation rows sharded
// through RENDERED input values — visible author text riding controls, which
// aggregateText (text nodes only) never saw. Rendered values join the
// sibling-run accumulator.
describe('check-mockup-lofi — rendered values join density runs (AUDIT-20260610-51)', () => {
  it('rejects sharded punctuation button values (round-14 defeating input)', () => {
    const html =
      `<form><input type="button" value="###"><input type="button" value="..###">` +
      `<input type="button" value="#####"><br><input type="button" value="#..">` +
      `<input type="button" value="##..."></form>`;
    expect(rules(wrap(html))).toContain('punctuation-density');
  });
  it('accepts ordinary button rows (copy-shaped values break the run)', () => {
    const html =
      `<form><input type="button" value="Back"><input type="button" value="Save draft">` +
      `<input type="button" value="Continue"></form>`;
    expect(rules(wrap(html))).toEqual([]);
  });
});

// AUDIT-20260610-52 (round-14 gpt-5-04, LOW fp): url is the same text-field
// class as email/search/tel.
describe('check-mockup-lofi — url input (AUDIT-20260610-52)', () => {
  it('accepts input type=url', () => {
    expect(rules(wrap(`<form><label for="s">Website</label><input id="s" type="url" placeholder="https://example.com"></form>`))).toEqual([]);
  });
});

// AUDIT-20260610-48 (round-13 gpt-5-01 HIGH + gpt-5-02 MED) — DOCUMENTED
// BOUNDARY, the general form: imagery composed by GEOMETRIC PLACEMENT of
// sanctioned visual atoms (kit primitives like .sk-dot; native control
// states like checked checkboxes; text glyphs). Both defeating inputs are
// statistically indistinguishable from legitimate idioms — a dot-status
// matrix and a permissions grid ARE wireframe content; the image emerges
// only by LOOKING, which is the referee's charter (gross classes 5–7).
// These fixtures pin the composition side of the declared boundary.
describe('check-mockup-lofi — composition boundary (AUDIT-20260610-48)', () => {
  it('BOUNDARY (documented): a kit-primitive dot grid passes the mechanical axes', () => {
    const grid =
      `<table><tbody><tr><td></td><td><div class="sk-dot"></div></td></tr>` +
      `<tr><td><div class="sk-dot"></div></td><td></td></tr></tbody></table>`;
    expect(rules(wrap(grid))).toEqual([]);
  });
  it('BOUNDARY (documented): a checked-checkbox grid passes the mechanical axes', () => {
    const grid =
      `<table><tbody><tr><td><input type="checkbox" checked disabled></td>` +
      `<td><input type="checkbox" disabled></td></tr></tbody></table>`;
    expect(rules(wrap(grid))).toEqual([]);
  });
});

// AUDIT-20260610-49 (round-13 gpt-5-03, LOW fp): checkbox/radio value is a
// SUBMISSION value, never rendered — the visible-value gates scope to types
// whose value actually renders.
describe('check-mockup-lofi — non-rendered values (AUDIT-20260610-49)', () => {
  it('accepts a non-Latin submission value on a checkbox', () => {
    expect(rules(wrap(`<form><label><input type="checkbox" value="plan-①"> Starter plan</label></form>`))).toEqual([]);
  });
  it('still rejects designed glyphs in a rendered submit value', () => {
    expect(rules(wrap(`<input type="submit" value="🎉 Launch">`))).toContain('disallowed-codepoint');
  });
});

// AUDIT-20260610-41 (round-11 gpt-5-01, MED): viewport meta content is a
// rendering channel (forced scale/zoom presentation) — the one enumerated meta
// whose VALUE stayed unconstrained. Only the canonical responsive declaration
// is permitted.
describe('check-mockup-lofi — viewport content (AUDIT-20260610-41)', () => {
  const metaDoc = (content: string): string =>
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="${content}"><title>WF</title>` +
    `<link rel="stylesheet" href="sketch-kit.css"></head><body class="sk">x</body></html>`;
  it('rejects a scaling/zoom-forcing viewport (round-11 defeating input)', () => {
    expect(rules(metaDoc('width=375, initial-scale=0.38, user-scalable=no'))).toContain(
      'disallowed-viewport',
    );
  });
  it('accepts the canonical responsive viewport', () => {
    expect(rules(metaDoc('width=device-width, initial-scale=1'))).toEqual([]);
  });
});

// AUDIT-20260610-42 (round-11 gpt-5-02, MED): a password value renders as
// masking BULLETS — author-controlled glyph substitution through an allowed
// attribute. Wireframes have no business prefilling secrets; password inputs
// must not carry value (placeholder renders as plain text and stays fine).
describe('check-mockup-lofi — password value (AUDIT-20260610-42)', () => {
  it('rejects a prefilled password (renders as decorative bullets)', () => {
    expect(rules(wrap(`<input type="password" value="AAAAAAAAAAAAAAAA">`))).toContain(
      'password-value',
    );
  });
  it('accepts a password input with placeholder only', () => {
    expect(rules(wrap(`<input type="password" placeholder="Enter code">`))).toEqual([]);
  });
});

// AUDIT-20260610-43 (round-11 gpt-5-03, LOW fp): number is structural
// (quantity/seats); spinner chrome is UA baseline per the declared boundary.
describe('check-mockup-lofi — number input (AUDIT-20260610-43)', () => {
  it('accepts input type=number', () => {
    expect(rules(wrap(`<form><label>Seats <input type="number" placeholder="3"></label></form>`))).toEqual([]);
  });
  // AUDIT-20260610-47 (round-12 gpt-5-04, LOW fp): tel is the same structural
  // class as email/search.
  it('accepts input type=tel', () => {
    expect(rules(wrap(`<form><label for="p">Phone</label><input id="p" type="tel" placeholder="Phone number"></form>`))).toEqual([]);
  });
});

// AUDIT-20260610-38 (round-10 gpt-5-01, HIGH): sk-theme-* below body composes
// mixed-theme surfaces (per-section typography/palette/texture switching) —
// the DECISION doc's contract is ONE theme, selected on the body root. Theme
// tokens are placement-checked: body only, at most one.
describe('check-mockup-lofi — theme placement (AUDIT-20260610-38)', () => {
  it('rejects a theme class below body (round-10 defeating input shape)', () => {
    expect(
      rules(wrap(`<section class="sk-card sk-theme-blueprint"><h1>Acme Pro</h1></section>`)),
    ).toContain('theme-placement');
  });
  it('rejects two theme tokens on body', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head>` +
      `<body class="sk sk-theme-grayscale sk-theme-marker"><div>x</div></body></html>`;
    expect(rules(html)).toContain('theme-placement');
  });
  it('accepts a single body theme (the sanctioned shape)', () => {
    expect(rules(wrap(`<div class="sk-shell">x</div>`))).toEqual([]);
  });
  // AUDIT-20260610-46 (round-12 gpt-5-03, LOW fp): duplicate IDENTICAL tokens
  // compose nothing — count distinct themes, not tokens.
  it('accepts a duplicated identical theme token', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head>` +
      `<body class="sk sk-theme-grayscale sk-theme-grayscale"><div>x</div></body></html>`;
    expect(rules(html)).toEqual([]);
  });
});

// AUDIT-20260610-36 (round-9 gpt-5-01 HIGH + gpt-5-02 MED; one mechanism):
// multiline visible-attr values RENDER per line (placeholder in the textarea
// viewport; title in the tooltip), but density scanned the aggregate string —
// art rows hid behind a prose tail. The density gate runs per LINE of a
// multiline visible-attr value.
describe('check-mockup-lofi — per-line density on visible attrs (AUDIT-20260610-36)', () => {
  it('rejects placeholder art rows with a diluting prose tail (round-9 gpt-5-01)', () => {
    const v = `#######   #######&#10;#.....#   #.....#&#10;Ordinary onboarding notes and review copy that dilutes the whole-string statistics`;
    expect(rules(wrap(`<textarea placeholder="${v}"></textarea>`))).toContain('punctuation-density');
  });
  it('rejects title tooltip art rows with a diluting prose tail (round-9 gpt-5-02)', () => {
    const v = `#######   #######&#10;#.....#   #.....#&#10;Ordinary roadmap approval notes and review prose dilute the aggregate value`;
    expect(rules(wrap(`<button type="button" class="sk-btn" title="${v}">Continue</button>`))).toContain('punctuation-density');
  });
  it('accepts a legitimate multiline placeholder', () => {
    const v = `Add your notes here&#10;One idea per line&#10;(optional)`;
    expect(rules(wrap(`<textarea placeholder="${v}"></textarea>`))).toEqual([]);
  });
});

// AUDIT-20260610-37 (round-9 gpt-5-03, LOW fp): select/option are the same
// structural form class as input/textarea.
describe('check-mockup-lofi — select/option (AUDIT-20260610-37)', () => {
  it('accepts a labeled select with options', () => {
    expect(
      rules(wrap(`<form><label for="plan">Plan</label><select id="plan"><option>Starter</option><option>Team</option></select></form>`)),
    ).toEqual([]);
  });
  it('option text rides the text gates', () => {
    expect(rules(wrap(`<select><option>𝐏𝐫𝐞𝐦𝐢𝐮𝐦</option></select>`))).toContain('disallowed-codepoint');
  });
});

// AUDIT-20260610-40 (round-10 gpt-5-03/-04, LOW fps): disabled and selected
// are structural form state, same class as checked.
describe('check-mockup-lofi — disabled/selected state (AUDIT-20260610-40)', () => {
  it('accepts a disabled button', () => {
    expect(rules(wrap(`<form><button type="button" disabled>Continue</button></form>`))).toEqual([]);
  });
  it('accepts a selected option', () => {
    expect(
      rules(wrap(`<select><option>Starter</option><option selected>Team</option></select>`)),
    ).toEqual([]);
  });
});

// AUDIT-20260610-24 (round-5 gpt-5-codex-04; FOURTH surfacing of the
// form-controls over-rejection: rounds 1, 3, 5 = AUDIT-08/TASK-15): native
// form flow is structure, not polish. form / input / label[for] are
// allowlisted; input type is an ENUMERATED structural set — type="image"
// (resource-loading) and type="color" (visual picker chrome) stay rejected.
describe('check-mockup-lofi — native form flow (AUDIT-20260610-24)', () => {
  it('accepts the round-5 form-step wireframe', () => {
    expect(
      rules(wrap(`<form><label>Email</label><input type="text"><button type="button" class="sk-btn">Continue</button></form>`)),
    ).toEqual([]);
  });
  it('accepts label[for] + input id/placeholder (the round-1 variant)', () => {
    expect(
      rules(wrap(`<label for="q">Search</label><input id="q" type="search" placeholder="Query">`)),
    ).toEqual([]);
  });
  it('rejects input type="image" (resource-loading control)', () => {
    expect(rules(wrap(`<input type="image">`))).toContain('disallowed-input-type');
  });
  it('rejects input type="color" (visual picker channel)', () => {
    expect(rules(wrap(`<input type="color">`))).toContain('disallowed-input-type');
  });
  it('rejects a src attribute on input via the allowlist catch-all', () => {
    expect(rules(wrap(`<input type="text" src="x.png">`))).toContain('disallowed-attribute');
  });

  // AUDIT-20260610-25 (round-6 gpt-5-codex-01, HIGH): input placeholder/value
  // are RENDERED text (the field shows the placeholder; the submit button shows
  // the value) — they get the same codepoint + density gates as title/aria.
  it('rejects designed glyphs in a placeholder (round-6 defeating input)', () => {
    expect(rules(wrap(`<input type="text" placeholder="𝐏𝐫𝐞𝐦𝐢𝐮𝐦 brand search">`))).toContain(
      'disallowed-codepoint',
    );
  });
  it('rejects emoji in a submit value', () => {
    expect(rules(wrap(`<input type="submit" value="🎉 Launch">`))).toContain(
      'disallowed-codepoint',
    );
  });
  it('rejects punctuation art in a placeholder (density gate applies)', () => {
    expect(rules(wrap(`<input type="text" placeholder="###..###..#####">`))).toContain(
      'punctuation-density',
    );
  });
  it('accepts ordinary placeholder/value copy', () => {
    expect(rules(wrap(`<input type="search" placeholder="Search entries…" value="draft">`))).toEqual([]);
  });
});

// AUDIT-20260610-19 (round-4 gpt-5-codex-02 MED; third surfacing of the
// attr-value channel = AUDIT-05/TASK-12, found by both models across rounds
// 1/2/4): human-visible attribute VALUES — title tooltips, aria-* announced
// text — now pass the codepoint allowlist; meta name is an enumerated set, so
// the theme-color / color-scheme browser-chrome channels are rejected by NAME.
// class/id stay value-unconstrained (inert under the pin, round-8 as amended).
describe('check-mockup-lofi — human-visible attr values (AUDIT-20260610-19)', () => {
  it('rejects designed glyphs in a title tooltip (gpt-5-codex-02 defeating input)', () => {
    expect(
      rules(wrap(`<button type="button" class="sk-btn" title="𝐏𝐫𝐞𝐦𝐢𝐮𝐦 polished CTA">Continue</button>`)),
    ).toContain('disallowed-codepoint');
  });
  it('rejects emoji in aria-label (announced/displayable channel)', () => {
    expect(rules(wrap(`<div aria-label="🎉 launch">x</div>`))).toContain('disallowed-codepoint');
  });
  it('accepts ordinary ASCII/accented title and aria values', () => {
    expect(rules(wrap(`<div title="Détails du plan" aria-label="plan details">x</div>`))).toEqual([]);
  });
  it('rejects meta theme-color by NAME (browser-chrome color channel)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="theme-color" content="#ff0066"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('disallowed-meta-name');
  });
  it('rejects meta color-scheme by NAME (dark-mode flip channel)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="color-scheme" content="dark"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('disallowed-meta-name');
  });
  it('accepts enumerated meta names (viewport, description)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<meta name="description" content="structure-and-flow wireframe">` +
      `<title>WF</title><link rel="stylesheet" href="sketch-kit.css"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toEqual([]);
  });
});

// AUDIT-20260610-13 (round-2 gpt-5-04 MED + round-1 fable-07a; cross-round
// recurrence): media="print" mutes the pinned kit for screen rendering, so
// "lint green" no longer guarantees the kit is IN EFFECT — browser-default
// rendering replaces it. Wireframes have no print-styling use case; media is
// removed from link's allowlisted attrs entirely.
describe('check-mockup-lofi — rejects link media (kit-muting channel, AUDIT-20260610-13)', () => {
  it('rejects media="print" on the kit stylesheet link', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css" media="print"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('disallowed-attribute');
  });
  it('rejects media even with an innocuous value (the attr, not the value, is the channel)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>` +
      `<link rel="stylesheet" href="sketch-kit.css" media="screen"></head><body class="sk">x</body></html>`;
    expect(rules(html)).toContain('disallowed-attribute');
  });
});

// AUDIT-20260610-11 (round-2 gpt-5-01 HIGH + fable5-01; cross-model): the
// guarantee-bearing entry point must not make the unsafe configuration the
// default. lintWireframe REQUIRES the pin (throws without — no fallbacks);
// axis-1/2-only linting lives under the explicitly non-guarantee name
// lintWireframeStructural.
describe('lintWireframe API contract — pin is required (AUDIT-20260610-11)', () => {
  it('lintWireframe THROWS when invoked without a stylesheet pin', () => {
    const html = wrap(`<div class="sk-shell">x</div>`);
    // Cast through the structural escape hatch a JS caller would have.
    const bare = lintWireframe as unknown as (h: string) => unknown;
    expect(() => bare(html)).toThrowError(/stylesheetPin/);
  });

  it('lintWireframeStructural lints axes 1+2 and is named to carry no identity guarantee', () => {
    expect(lintWireframeStructural(wrap(`<div class="sk-shell">x</div>`)).ok).toBe(true);
    expect(
      lintWireframeStructural(wrap(`<script>1</script>`)).findings.map((f) => f.rule),
    ).toContain('disallowed-element');
  });
});

// AUDIT-20260610-01 (gpt-5-02 + fable-02; cross-model HIGH): bare lintWireframe
// admitted ANY local stylesheet — the pin was the only identity check and it is
// opt-in. Axis-1 narrowing (filesystem-free): the stylesheet link must be a
// SINGLETON whose href lexically references the kit filename. RESIDUAL (stated,
// not hand-waved): a local non-kit file NAMED sketch-kit.css still passes bare
// axis-1 — byte identity is axis-1.5's job; every pin-consuming call site must
// pass stylesheetPin.
describe('check-mockup-lofi — axis-1 stylesheet narrowing (AUDIT-20260610-01)', () => {
  const head = (links: string): string =>
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>${links}</head>` +
    `<body class="sk">x</body></html>`;

  it('rejects a foreign-named local stylesheet (fable-02 defeating input)', () => {
    expect(rules(head(`<link rel="stylesheet" href="theme.css">`))).toContain(
      'stylesheet-filename-mismatch',
    );
  });

  it('rejects a second stylesheet link even when both name the kit (no smuggling via multiples)', () => {
    const html = head(
      `<link rel="stylesheet" href="sketch-kit.css"><link rel="stylesheet" href="extra/sketch-kit.css">`,
    );
    expect(rules(html)).toContain('stylesheet-not-singleton');
  });

  it('accepts a subdirectory kit href (basename match, no over-rejection)', () => {
    const html = head(`<link rel="stylesheet" href="assets/sketch-kit/sketch-kit.css">`);
    expect(rules(html)).not.toContain('stylesheet-filename-mismatch');
    expect(rules(html)).not.toContain('stylesheet-not-singleton');
  });

  it('rejects a backslash-path href whose basename is not the kit', () => {
    // Backslashes normalize to / in WHATWG URL parsing; basename extraction
    // must treat them as separators, not as part of a kit-named basename.
    expect(rules(head(`<link rel="stylesheet" href="themes\\brand.css">`))).toContain(
      'stylesheet-filename-mismatch',
    );
  });

  it('RESIDUAL boundary (documented): a local file NAMED sketch-kit.css passes bare axis-1', () => {
    // gpt-5-02's deeper variant: axis-1 is filesystem-free and cannot prove the
    // bytes. This test pins the boundary so the residual is explicit; identity
    // is the pin's job (see stylesheet-pin tests).
    const html = head(`<link rel="stylesheet" href="sketch-kit.css">`);
    expect(rules(html)).toEqual([]);
  });
});
