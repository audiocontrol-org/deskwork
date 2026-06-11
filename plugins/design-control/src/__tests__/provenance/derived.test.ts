import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recordDerivation,
  loadProvenance,
  checkDerivedAcceptance,
  wireframeDroveImplementation,
  recordDrivingWireframe,
} from '@/provenance/derived';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-'));
  dirs.push(dir);
  return dir;
}

const draftHtml =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
  '<body class="sk sk-theme-grayscale"><h1>Derived from live surface</h1></body></html>';

describe('recordDerivation', () => {
  it('writes the auto-derived snapshot AND the provenance sidecar at derivation time', () => {
    const dir = freshDir();
    const prov = recordDerivation({
      dir,
      surfaceId: 'studio-content-browser',
      derivedHtml: draftHtml,
      source: 'http://localhost:4321/dev/editorial-studio',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(prov.mode).toBe('derived');
    const names = readdirSync(dir);
    expect(names).toContain('studio-content-browser.derived-snapshot.html');
    expect(names).toContain('studio-content-browser.provenance.json');
    expect(readFileSync(join(dir, 'studio-content-browser.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
  });

  it('round-trips through loadProvenance (zod-validated)', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'scrapbook-drawer',
      derivedHtml: draftHtml,
      source: 'route /dev/scrapbook',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    const prov = loadProvenance(dir, 'scrapbook-drawer');
    expect(prov.surfaceId).toBe('scrapbook-drawer');
    expect(prov.mode).toBe('derived');
    if (prov.mode !== 'derived') throw new Error('unreachable');
    expect(prov.derived.source).toBe('route /dev/scrapbook');
    expect(prov.derived.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('loadProvenance fail-loud paths', () => {
  it('throws a descriptive error when the sidecar is missing', () => {
    expect(() => loadProvenance(freshDir(), 'nope')).toThrow(/provenance/i);
  });

  it('throws on a malformed sidecar (no silent fallback)', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'bad.provenance.json'), '{"mode":"derived"}');
    expect(() => loadProvenance(dir, 'bad')).toThrow();
  });
});

describe('checkDerivedAcceptance — acceptance requires a recorded operator edit', () => {
  it('rejects a byte-identical accepted artifact (state transition alone is not an edit)', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 's1',
      derivedHtml: draftHtml,
      source: 'live surface',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    const result = checkDerivedAcceptance(dir, 's1', draftHtml);
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('derived-unedited');
  });

  it('accepts once the operator edit produces a non-empty diff against the stored snapshot', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 's1',
      derivedHtml: draftHtml,
      source: 'live surface',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    const edited = draftHtml.replace('Derived from live surface', 'Entry list, regrouped by lane');
    expect(checkDerivedAcceptance(dir, 's1', edited).ok).toBe(true);
  });

  it('fails loud when the stored snapshot was tampered after recording (hash mismatch)', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 's1',
      derivedHtml: draftHtml,
      source: 'live surface',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
  });

  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
    const dir = freshDir();
    recordDrivingWireframe({
      dir,
      surfaceId: 'fresh',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
  });
});

describe('wireframeDroveImplementation', () => {
  it('is true for a driving wireframe and FALSE for a derived one (even an accepted one)', () => {
    const dir = freshDir();
    const derived = recordDerivation({
      dir,
      surfaceId: 'd',
      derivedHtml: draftHtml,
      source: 'live surface',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    const driving = recordDrivingWireframe({
      dir,
      surfaceId: 'w',
      derivedAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(wireframeDroveImplementation(derived)).toBe(false);
    expect(wireframeDroveImplementation(driving)).toBe(true);
  });
});
