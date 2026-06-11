import { describe, it, expect, afterEach } from 'vitest';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recordDerivation,
  loadProvenance,
  checkDerivedAcceptance,
  wireframeDroveImplementation,
  recordDrivingWireframe,
  verifyDrivingWireframe,
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

/** Write a lint-green-stand-in wireframe file into dir; returns its filename. */
function writeWireframe(dir: string, name = 'wireframe.html', html = draftHtml): string {
  writeFileSync(join(dir, name), html);
  return name;
}

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

describe('recordDerivation — all-or-nothing commit (no half-state when a write fails)', () => {
  it('leaves NEITHER a committed sidecar NOR a committed snapshot when the snapshot write fails', () => {
    const dir = freshDir();
    // Deterministic, portable second-write failure: a DIRECTORY planted at the
    // snapshot target path makes any attempt to place a file there (write or
    // rename-promote) throw on every platform.
    mkdirSync(join(dir, 'half.derived-snapshot.html'));

    expect(() =>
      recordDerivation({
        dir,
        surfaceId: 'half',
        derivedHtml: draftHtml,
        source: 'live surface',
        createdAt: new Date('2026-06-10T12:00:00Z'),
      }),
    ).toThrow();

    // No committed sidecar may survive the failed pairing — loadProvenance
    // must fail loud (absent sidecar), not return a record whose snapshot
    // does not exist.
    expect(existsSync(join(dir, 'half.provenance.json'))).toBe(false);
    expect(() => loadProvenance(dir, 'half')).toThrow(/no provenance sidecar/i);

    // The planted blocker is still the directory (no snapshot FILE was
    // committed over it), and no temp-suffixed staging debris lingers.
    expect(statSync(join(dir, 'half.derived-snapshot.html')).isDirectory()).toBe(true);
    expect(readdirSync(dir).filter((n) => n !== 'half.derived-snapshot.html')).toEqual([]);
  });

  it('happy path commits exactly the sidecar + snapshot pair, with no staging debris', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'clean',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(readdirSync(dir).sort()).toEqual([
      'clean.derived-snapshot.html',
      'clean.provenance.json',
    ]);
    expect(readFileSync(join(dir, 'clean.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
    const prov = loadProvenance(dir, 'clean');
    expect(prov.mode).toBe('derived');
    if (prov.mode !== 'derived') throw new Error('unreachable');
    expect(prov.derived.snapshotFile).toBe('clean.derived-snapshot.html');
    expect(prov.derived.source).toBe('live surface');
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
      wireframeFile: writeWireframe(dir),
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
  });
});

describe('surfaceId filename validation — path-traversal and separator rejection', () => {
  const hostileIds = ['../escape', '..', 'a/b', 'nested/../../etc', 'a\\b', 'space id', ''];

  it.each(hostileIds)('recordDrivingWireframe rejects %j with an error naming the constraint', (id) => {
    const dir = freshDir();
    expect(() =>
      recordDrivingWireframe({ dir, surfaceId: id, wireframeFile: writeWireframe(dir) }),
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
    const dir = freshDir();
    expect(() =>
      recordDrivingWireframe({ dir, surfaceId: '..', wireframeFile: writeWireframe(dir) }),
    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
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
      wireframeFile: writeWireframe(dir),
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
      wireframeFile: writeWireframe(dir),
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(wireframeDroveImplementation(derived)).toBe(false);
    expect(wireframeDroveImplementation(driving)).toBe(true);
  });
});

describe('recordDrivingWireframe — binds the wireframe artifact by filename + hash', () => {
  it('records driving.wireframeFile and a sha256 hex of the wireframe bytes', () => {
    const dir = freshDir();
    const wireframeFile = writeWireframe(dir, 'studio-content-browser.html');
    const prov = recordDrivingWireframe({
      dir,
      surfaceId: 'studio-content-browser',
      wireframeFile,
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(prov.mode).toBe('driving');
    if (prov.mode !== 'driving') throw new Error('unreachable');
    expect(prov.driving.wireframeFile).toBe('studio-content-browser.html');
    expect(prov.driving.wireframeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('round-trips the driving binding through loadProvenance (zod-validated)', () => {
    const dir = freshDir();
    recordDrivingWireframe({
      dir,
      surfaceId: 'wf-bound',
      wireframeFile: writeWireframe(dir, 'wf-bound.html'),
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    const prov = loadProvenance(dir, 'wf-bound');
    expect(prov.mode).toBe('driving');
    if (prov.mode !== 'driving') throw new Error('unreachable');
    expect(prov.driving.wireframeFile).toBe('wf-bound.html');
    expect(prov.driving.wireframeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails loud when the named wireframe file does not exist at record time', () => {
    const dir = freshDir();
    expect(() =>
      recordDrivingWireframe({ dir, surfaceId: 'ghost', wireframeFile: 'ghost.html' }),
    ).toThrow(/wireframe/i);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('overwrite refusal — an existing record can never be silently re-recorded', () => {
  it('refuses recordDrivingWireframe over an existing derived record (the laundering direction)', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'laundered',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    const wireframeFile = writeWireframe(dir, 'laundered.html');
    expect(() =>
      recordDrivingWireframe({ dir, surfaceId: 'laundered', wireframeFile }),
    ).toThrow(/laundered[\s\S]*derived[\s\S]*(remov|supersed)/i);
  });

  it('refuses recordDerivation over an existing driving record', () => {
    const dir = freshDir();
    recordDrivingWireframe({
      dir,
      surfaceId: 'flipped',
      wireframeFile: writeWireframe(dir, 'flipped.html'),
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(() =>
      recordDerivation({ dir, surfaceId: 'flipped', derivedHtml: draftHtml, source: 'live surface' }),
    ).toThrow(/flipped[\s\S]*driving[\s\S]*(remov|supersed)/i);
  });

  it('refuses a same-mode driving re-record', () => {
    const dir = freshDir();
    const wireframeFile = writeWireframe(dir, 'rerecord.html');
    recordDrivingWireframe({
      dir,
      surfaceId: 'rerecord',
      wireframeFile,
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(() =>
      recordDrivingWireframe({ dir, surfaceId: 'rerecord', wireframeFile }),
    ).toThrow(/rerecord[\s\S]*driving[\s\S]*(remov|supersed)/i);
  });

  it('refuses a same-mode derived re-record', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'rederive',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(() =>
      recordDerivation({
        dir,
        surfaceId: 'rederive',
        derivedHtml: draftHtml + '<!-- second derivation -->',
        source: 'another surface',
      }),
    ).toThrow(/rederive[\s\S]*derived[\s\S]*(remov|supersed)/i);
  });

  it('leaves the existing sidecar AND snapshot byte-identical after a refused overwrite', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'baseline',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    const sidecarBefore = readFileSync(join(dir, 'baseline.provenance.json'), 'utf8');
    const snapshotBefore = readFileSync(join(dir, 'baseline.derived-snapshot.html'), 'utf8');

    const wireframeFile = writeWireframe(dir, 'baseline.html');
    expect(() =>
      recordDrivingWireframe({ dir, surfaceId: 'baseline', wireframeFile }),
    ).toThrow();
    expect(() =>
      recordDerivation({
        dir,
        surfaceId: 'baseline',
        derivedHtml: draftHtml + '<!-- would replace the snapshot -->',
        source: 'second derivation',
      }),
    ).toThrow();

    expect(readFileSync(join(dir, 'baseline.provenance.json'), 'utf8')).toBe(sidecarBefore);
    expect(readFileSync(join(dir, 'baseline.derived-snapshot.html'), 'utf8')).toBe(snapshotBefore);
  });
});

describe('verifyDrivingWireframe — tamper-checks the bound artifact like checkDerivedAcceptance', () => {
  it('returns the provenance when the wireframe bytes still match the recorded hash', () => {
    const dir = freshDir();
    recordDrivingWireframe({
      dir,
      surfaceId: 'intact',
      wireframeFile: writeWireframe(dir, 'intact.html'),
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    const prov = verifyDrivingWireframe(dir, 'intact');
    expect(prov.mode).toBe('driving');
    expect(prov.surfaceId).toBe('intact');
  });

  it('throws when the wireframe bytes were replaced after recording (hash mismatch)', () => {
    const dir = freshDir();
    const wireframeFile = writeWireframe(dir, 'swapped.html');
    recordDrivingWireframe({
      dir,
      surfaceId: 'swapped',
      wireframeFile,
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    writeFileSync(join(dir, wireframeFile), draftHtml + '<!-- wholesale replacement -->');
    expect(() => verifyDrivingWireframe(dir, 'swapped')).toThrow(/hash|wireframe/i);
  });

  it('throws when the bound wireframe file has gone missing', () => {
    const dir = freshDir();
    const wireframeFile = writeWireframe(dir, 'vanished.html');
    recordDrivingWireframe({
      dir,
      surfaceId: 'vanished',
      wireframeFile,
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    rmSync(join(dir, wireframeFile));
    expect(() => verifyDrivingWireframe(dir, 'vanished')).toThrow(/wireframe/i);
  });

  it('throws on a derived record — a derived artifact never certifies the driving claim', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'reverse-engineered',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    expect(() => verifyDrivingWireframe(dir, 'reverse-engineered')).toThrow(/driving|derived/i);
  });
});
