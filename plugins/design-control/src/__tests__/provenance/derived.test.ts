import { describe, it, expect, afterEach } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
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
      createdAt: new Date('2026-06-10T12:00:00Z'),
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
      createdAt: new Date('2026-06-10T12:00:00Z'),
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

  it('throws, naming BOTH ids, when the sidecar inner surfaceId does not match the requested one', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'surface-alpha',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    // Simulate a sidecar copied/renamed to another surface's filename: beta has
    // no record of its own, but alpha's sidecar now sits at beta's path.
    copyFileSync(
      join(dir, 'surface-alpha.provenance.json'),
      join(dir, 'surface-beta.provenance.json'),
    );
    expect(() => loadProvenance(dir, 'surface-beta')).toThrow(
      /surface-beta[\s\S]*surface-alpha|surface-alpha[\s\S]*surface-beta/,
    );
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
      createdAt: new Date('2026-06-10T12:00:00Z'),
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
      createdAt: new Date('2026-06-10T12:00:00Z'),
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
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
  });

  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
    const dir = freshDir();
    recordDrivingWireframe({
      dir,
      surfaceId: 'fresh',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
  });
});

describe('surfaceId filename validation — path-traversal and separator rejection', () => {
  const hostileIds = ['../escape', '..', 'a/b', 'nested/../../etc', 'a\\b', 'space id', ''];

  it.each(hostileIds)('recordDrivingWireframe rejects %j with an error naming the constraint', (id) => {
    expect(() =>
      recordDrivingWireframe({ dir: freshDir(), surfaceId: id }),
    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
  });

  it.each(hostileIds)('recordDerivation rejects %j without writing any file', (id) => {
    const dir = freshDir();
    expect(() =>
      recordDerivation({ dir, surfaceId: id, derivedHtml: draftHtml, source: 'live surface' }),
    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
    expect(readdirSync(dir)).toEqual([]);
  });

  it.each(hostileIds)('loadProvenance rejects %j before touching the filesystem', (id) => {
    expect(() => loadProvenance(freshDir(), id)).toThrow(/portable-filename|\^\[a-z0-9\]/i);
  });

  it('rejects a bare ".." specifically — the pattern requires an alphanumeric first character', () => {
    // /^[a-z0-9][a-z0-9._-]*$/i cannot match '..' because '.' fails the [a-z0-9] start anchor.
    expect(() => recordDrivingWireframe({ dir: freshDir(), surfaceId: '..' })).toThrow(
      /portable-filename|\^\[a-z0-9\]/i,
    );
  });

  it('the zod schema rejects a sidecar whose stored surfaceId is non-portable (load-side defense)', () => {
    const dir = freshDir();
    const hostile = {
      version: 1,
      surfaceId: '../escape',
      mode: 'driving',
      createdAt: '2026-06-10T12:00:00.000Z',
    };
    writeFileSync(join(dir, 'planted.provenance.json'), JSON.stringify(hostile));
    expect(() => loadProvenance(dir, 'planted')).toThrow();
  });

  it('still accepts a normal kebab-case id (and dots/underscores after the first char)', () => {
    const dir = freshDir();
    recordDrivingWireframe({
      dir,
      surfaceId: 'studio-content_browser.v2',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(loadProvenance(dir, 'studio-content_browser.v2').surfaceId).toBe(
      'studio-content_browser.v2',
    );
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
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    const driving = recordDrivingWireframe({
      dir,
      surfaceId: 'w',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(wireframeDroveImplementation(derived)).toBe(false);
    expect(wireframeDroveImplementation(driving)).toBe(true);
  });
});
