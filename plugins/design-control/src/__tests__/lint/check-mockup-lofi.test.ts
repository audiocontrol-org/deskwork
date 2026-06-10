import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lintWireframe, ALLOWED_TAGS } from '@/lint/check-mockup-lofi';
import { URL_ATTRS, RESOURCE_URL_ATTRS } from '@/lint/allowlist';
import { SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';

/** Embed a body fragment in an otherwise-valid lo-fi skeleton to isolate one rule. */
const wrap = (bodyInner: string): string =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
  `<title>WF</title><link rel="stylesheet" href="sketch-kit.css"></head>` +
  `<body class="sk sk-theme-grayscale">${bodyInner}</body></html>`;

const rules = (html: string): string[] => lintWireframe(html).findings.map((f) => f.rule);

describe('check-mockup-lofi — accepts genuinely lo-fi wireframes', () => {
  it('passes the shipped example wireframe', () => {
    const result = lintWireframe(readFileSync(SKETCH_KIT_SAMPLE_PATH, 'utf8'));
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
    const result = lintWireframe(html);
    expect(result.findings, JSON.stringify(result.findings)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('permits arbitrary (inert) class values — pinned stylesheet is the sole CSS source', () => {
    // Per round-8: class values are permitted-but-inert; the lint constrains
    // tags/attrs, not class strings.
    const result = lintWireframe(wrap(`<div class="totally-made-up not-an-sk-class">x</div>`));
    expect(result.ok, JSON.stringify(result.findings)).toBe(true);
  });

  it('permits HTML comments (inert)', () => {
    expect(lintWireframe(wrap(`<!-- a note --><div>x</div>`)).ok).toBe(true);
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
    expect(lintWireframe(wrap(`<div class="metadata-row">x</div>`)).ok).toBe(true);
  });
  // AUDIT-20260606-01 (claude-01): data: scanning must be scoped to href, not
  // every attribute value — class values are inert/unconstrained (round-8).
  it('permits a class value that literally contains "data:" (inert, round-8)', () => {
    const r = lintWireframe(wrap(`<div class="data:x">y</div>`));
    expect(r.ok, JSON.stringify(r.findings)).toBe(true);
  });
  it('permits prose containing "data:" in a non-URL attribute (meta content / title)', () => {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="description" content="a dashboard of the data: scheme">` +
      `<title>WF</title><link rel="stylesheet" href="sketch-kit.css"></head>` +
      `<body class="sk"><div title="see the data: scheme">x</div></body></html>`;
    expect(lintWireframe(html).ok, JSON.stringify(lintWireframe(html).findings)).toBe(true);
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
