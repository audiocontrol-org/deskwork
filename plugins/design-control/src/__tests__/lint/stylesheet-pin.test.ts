import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hashStylesheet,
  buildSketchKitPin,
  checkStylesheetIdentity,
} from '@/lint/stylesheet-pin';
import { lintWireframe } from '@/lint/check-mockup-lofi';
import { SKETCH_KIT_CSS_PATH } from '@/wireframe-kit/sketch-kit';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Make a temp wireframe dir with a genuine copy of the shipped sketch-kit.css. */
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sk-pin-'));
  dirs.push(dir);
  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
  return dir;
}

const page = (head: string, body = '<div class="sk">x</div>'): string =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>${head}</head>` +
  `<body class="sk sk-theme-grayscale">${body}</body></html>`;

const rules = (findings: { rule: string }[]): string[] => findings.map((f) => f.rule);

describe('hashStylesheet', () => {
  it('produces a deterministic sha256- SRI-format digest', () => {
    expect(hashStylesheet('body{}')).toBe(hashStylesheet('body{}'));
    expect(hashStylesheet('body{}')).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
    expect(hashStylesheet('a')).not.toBe(hashStylesheet('b'));
  });
});

describe('buildSketchKitPin', () => {
  it('pins the shipped sketch-kit.css content hash + the expected local path', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    expect(pin.expectedHash).toBe(hashStylesheet(readFileSync(SKETCH_KIT_CSS_PATH)));
    expect(pin.canonicalPath).toBe(join(dir, 'sketch-kit.css'));
    expect(pin.baseDir).toBe(dir);
  });
});

describe('checkStylesheetIdentity', () => {
  it('accepts exactly one local <link> whose content matches the pin', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const findings = checkStylesheetIdentity(page(`<link rel="stylesheet" href="sketch-kit.css">`), pin);
    expect(findings, JSON.stringify(findings)).toEqual([]);
  });

  it('flags a wireframe with no stylesheet link', () => {
    const dir = freshDir();
    const findings = checkStylesheetIdentity(page(''), buildSketchKitPin(dir));
    expect(rules(findings)).toContain('stylesheet-missing');
  });

  it('flags more than one stylesheet link (not-singleton)', () => {
    const dir = freshDir();
    copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'copy.css'));
    const head = `<link rel="stylesheet" href="sketch-kit.css"><link rel="stylesheet" href="copy.css">`;
    expect(rules(checkStylesheetIdentity(page(head), buildSketchKitPin(dir)))).toContain('stylesheet-not-singleton');
  });

  it('flags a tampered stylesheet (content hash mismatch)', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    writeFileSync(join(dir, 'sketch-kit.css'), '/* tampered */ body{color:red}');
    expect(rules(checkStylesheetIdentity(page(`<link rel="stylesheet" href="sketch-kit.css">`), pin)))
      .toContain('stylesheet-hash-mismatch');
  });

  it('flags an href that resolves to a path other than the canonical one', () => {
    const dir = freshDir();
    copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'elsewhere.css'));
    const findings = checkStylesheetIdentity(page(`<link rel="stylesheet" href="elsewhere.css">`), buildSketchKitPin(dir));
    expect(rules(findings)).toContain('stylesheet-path-mismatch');
  });

  it('flags an href that cannot be resolved on disk', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    rmSync(join(dir, 'sketch-kit.css'));
    expect(rules(checkStylesheetIdentity(page(`<link rel="stylesheet" href="sketch-kit.css">`), pin)))
      .toContain('stylesheet-unresolvable');
  });

  it('accepts a correct SRI integrity attribute and rejects a wrong one', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const good = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="${pin.expectedHash}">`);
    expect(checkStylesheetIdentity(good, pin)).toEqual([]);
    const bad = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="sha256-WRONG">`);
    expect(rules(checkStylesheetIdentity(bad, pin))).toContain('stylesheet-sri-mismatch');
  });

  // AUDIT-20260606-08 (claude-01 + codex-01): standalone, a mixed rel must NOT
  // pass as a clean stylesheet (the favicon channel axis-1 already closes).
  it('does NOT treat a mixed rel="stylesheet icon" as a clean stylesheet link', () => {
    const dir = freshDir();
    const findings = checkStylesheetIdentity(
      page(`<link rel="stylesheet icon" href="sketch-kit.css">`),
      buildSketchKitPin(dir),
    );
    expect(findings).not.toEqual([]);
    expect(rules(findings)).toContain('stylesheet-missing');
  });

  // AUDIT-20260606-10 (claude-02): a path-escaping href is reported WITHOUT
  // reading anything off disk (no arbitrary file read).
  it('reports path-mismatch for an escaping href and does not read other findings', () => {
    const dir = freshDir();
    const findings = checkStylesheetIdentity(
      page(`<link rel="stylesheet" href="../../../../etc/passwd">`),
      buildSketchKitPin(dir),
    );
    expect(rules(findings)).toEqual(['stylesheet-path-mismatch']); // short-circuited, no read
  });

  // SRI is strongest-algorithm-wins. A stronger-algo token with a WRONG digest
  // overrides the pinned sha256 in the browser → must be rejected.
  it('rejects a stronger-algo token whose digest is not the kit (overrides the sha256)', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const html = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="sha384-wrong ${pin.expectedHash}">`);
    expect(rules(checkStylesheetIdentity(html, pin))).toContain('stylesheet-sri-mismatch');
  });

  // AUDIT-20260606-15 (claude-01): a legitimately-STRONGER pin (the real kit
  // sha384 alongside the sha256) is the secure best practice and must be ACCEPTED.
  it('accepts a stronger-algo integrity whose digest IS the kit (sha384 + sha256)', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const html = page(
      `<link rel="stylesheet" href="sketch-kit.css" integrity="${pin.expectedSri.sha384} ${pin.expectedSri.sha256}">`,
    );
    expect(checkStylesheetIdentity(html, pin)).toEqual([]);
  });

  it('verifies sha512 as the strongest algorithm (accept real, reject wrong)', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const good = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="${pin.expectedSri.sha512}">`);
    expect(checkStylesheetIdentity(good, pin)).toEqual([]);
    const bad = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="sha512-wrong">`);
    expect(rules(checkStylesheetIdentity(bad, pin))).toContain('stylesheet-sri-mismatch');
  });

  // Same-algorithm multi-token (no stronger algo) including the pinned digest IS
  // accepted — the browser validates all sha256 tokens and accepts on any match.
  it('accepts a same-algorithm (sha256) multi-token integrity that includes the pinned digest', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const html = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="sha256-decoyAAAA ${pin.expectedHash}">`);
    expect(checkStylesheetIdentity(html, pin)).toEqual([]);
  });

  it('rejects an integrity with no recognized sha algorithm', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const html = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="md5-whatever">`);
    expect(rules(checkStylesheetIdentity(html, pin))).toContain('stylesheet-sri-mismatch');
  });

  // AUDIT-20260606-18 (claude-01 + codex-01; cross-model): the SRI algorithm
  // prefix is ASCII-case-insensitive per W3C SRI — an uppercase prefix on the
  // correct digest is a browser-honored pin and must be ACCEPTED.
  it('accepts an uppercase SRI algorithm prefix on the correct digest', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const upper = pin.expectedSri.sha384.replace(/^sha384-/, 'SHA384-');
    const html = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="${upper}">`);
    expect(checkStylesheetIdentity(html, pin)).toEqual([]);
  });

  // AUDIT-20260606-19 (claude-02): a spec-valid `?options` suffix is stripped by
  // the browser; a correct digest carrying options must be ACCEPTED.
  it('accepts a correct digest carrying a spec-valid ?options suffix', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const html = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="${pin.expectedSri.sha384}?foo=bar">`);
    expect(checkStylesheetIdentity(html, pin)).toEqual([]);
  });

  // AUDIT-20260606-21 (backlog TASK-2): the base64 PAYLOAD is case-sensitive —
  // the load-bearing invariant of normalizeSriToken's slice-at-first-dash shape
  // (only the algorithm prefix is lowercased). A case-mangled payload is a
  // genuinely-wrong digest and must be REJECTED in the suite's own voice, not
  // by luck of the fixture digest's mixed case.
  it('rejects a correct-algorithm token whose base64 payload case is mangled', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const payload = pin.expectedSri.sha384.replace(/^sha384-/, '');
    const mangled = payload.replace(/[a-zA-Z]/g, (c) =>
      c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
    );
    // Guard against vacuity: the swap must actually change the payload.
    expect(mangled).not.toBe(payload);
    const html = page(`<link rel="stylesheet" href="sketch-kit.css" integrity="sha384-${mangled}">`);
    expect(rules(checkStylesheetIdentity(html, pin))).toContain('stylesheet-sri-mismatch');
  });
});

describe('lintWireframe with stylesheetPin — inert-class invariant', () => {
  it('arbitrary class values are inert: they pass BECAUSE the sole CSS source is identity-pinned', () => {
    const dir = freshDir();
    const pin = buildSketchKitPin(dir);
    const html = page(
      `<link rel="stylesheet" href="sketch-kit.css">`,
      `<div class="totally-made-up arbitrary-inert-class">x</div>`,
    );
    const result = lintWireframe(html, { stylesheetPin: pin });
    expect(result.findings, JSON.stringify(result.findings)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('surfaces pin findings alongside axis-1 findings in one pass', () => {
    const dir = freshDir();
    rmSync(join(dir, 'sketch-kit.css')); // make the pin unresolvable
    const html = page(`<link rel="stylesheet" href="sketch-kit.css">`, `<div style="color:red">x</div>`);
    const r = lintWireframe(html, { stylesheetPin: buildSketchKitPin(dir) });
    expect(rules([...r.findings])).toEqual(expect.arrayContaining(['inline-style', 'stylesheet-unresolvable']));
  });

  it('without a pin, the lint is axis-1 only (filesystem-free, backward compatible)', () => {
    const html = page(`<link rel="stylesheet" href="sketch-kit.css">`);
    expect(lintWireframe(html).ok).toBe(true); // no pin → no identity check, no fs access
  });
});
