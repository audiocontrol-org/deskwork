import { describe, it, expect, afterEach } from 'vitest';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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

describe('wireframeFile filename validation — path-traversal and separator rejection (AUDIT-20260611-10)', () => {
  const hostileFiles = ['../outside.html', 'sub/file.html', 'a\\b.html', '..', ''];

  it.each(hostileFiles)(
    'recordDrivingWireframe rejects wireframeFile %j with an error naming the constraint, writing nothing',
    (wireframeFile) => {
      const dir = freshDir();
      expect(() =>
        recordDrivingWireframe({ dir, surfaceId: 'victim', wireframeFile }),
      ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
      expect(readdirSync(dir)).toEqual([]);
    },
  );

  it('verifyDrivingWireframe rejects a planted sidecar whose stored wireframeFile carries a traversal path (zod-side defense)', () => {
    // Make the traversal REAL: an artifact exists OUTSIDE the provenance dir
    // with a matching hash, so without the schema defense verification would
    // succeed against a file the operator never placed in the wireframes dir.
    const parent = freshDir();
    const dir = join(parent, 'prov');
    mkdirSync(dir);
    const outsideHtml = '<!DOCTYPE html><html><body>outside</body></html>';
    writeFileSync(join(parent, 'outside.html'), outsideHtml);
    const planted = {
      version: 1,
      surfaceId: 'planted',
      mode: 'driving',
      createdAt: '2026-06-10T12:00:00.000Z',
      driving: {
        wireframeFile: '../outside.html',
        wireframeSha256: createHash('sha256').update(outsideHtml).digest('hex'),
      },
    };
    writeFileSync(join(dir, 'planted.provenance.json'), JSON.stringify(planted));
    expect(() => verifyDrivingWireframe(dir, 'planted')).toThrow(/portable-filename|wireframeFile/i);
  });

  it('the zod schema rejects a planted derived sidecar whose stored snapshotFile carries a traversal path', () => {
    const dir = freshDir();
    const planted = {
      version: 1,
      surfaceId: 'planted-derived',
      mode: 'derived',
      createdAt: '2026-06-10T12:00:00.000Z',
      derived: {
        snapshotFile: '../outside.html',
        snapshotSha256: 'a'.repeat(64),
        source: 'live surface',
      },
    };
    writeFileSync(join(dir, 'planted-derived.provenance.json'), JSON.stringify(planted));
    expect(() => loadProvenance(dir, 'planted-derived')).toThrow();
  });

  it('still records + verifies a normal dir-relative filename like "my-surface.html"', () => {
    const dir = freshDir();
    recordDrivingWireframe({
      dir,
      surfaceId: 'my-surface',
      wireframeFile: writeWireframe(dir, 'my-surface.html'),
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    const prov = verifyDrivingWireframe(dir, 'my-surface');
    expect(prov.mode).toBe('driving');
    if (prov.mode !== 'driving') throw new Error('unreachable');
    expect(prov.driving.wireframeFile).toBe('my-surface.html');
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

describe('lingering-snapshot guard — append-once covers BOTH final targets (AUDIT-20260611-11)', () => {
  it('refuses re-derivation when only the sidecar was removed (snapshot lingers), naming the snapshot and the remedy', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'historic',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    // The documented recovery path, followed partially: the operator removes
    // the RECORD (sidecar) but leaves the historical snapshot on disk.
    rmSync(join(dir, 'historic.provenance.json'));
    const snapshotBefore = readFileSync(join(dir, 'historic.derived-snapshot.html'), 'utf8');

    expect(() =>
      recordDerivation({
        dir,
        surfaceId: 'historic',
        derivedHtml: draftHtml + '<!-- a DIFFERENT second derivation -->',
        source: 'another derivation',
      }),
    ).toThrow(/historic\.derived-snapshot\.html[\s\S]*(remove|move)/i);

    // The original baseline bytes must be untouched by the refusal — no
    // silent overwrite, no staging debris.
    expect(readFileSync(join(dir, 'historic.derived-snapshot.html'), 'utf8')).toBe(snapshotBefore);
    expect(readdirSync(dir)).toEqual(['historic.derived-snapshot.html']);
  });

  it('checkDerivedAcceptance tamper-recovery message instructs removing the snapshot too (no contradiction with the refusal)', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'tampered',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    writeFileSync(join(dir, 'tampered.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
    // The remedy must name BOTH artifacts — "remove the record, then re-derive"
    // alone walks the operator straight into the lingering-snapshot refusal.
    expect(() => checkDerivedAcceptance(dir, 'tampered', 'whatever')).toThrow(
      /record[\s\S]*snapshot[\s\S]*re-derive/i,
    );
  });

  it('records cleanly once BOTH the sidecar and the snapshot are removed (the full documented recovery)', () => {
    const dir = freshDir();
    recordDerivation({
      dir,
      surfaceId: 'recovered',
      derivedHtml: draftHtml,
      source: 'live surface',
      createdAt: new Date('2026-06-10T12:00:00Z'),
    });
    rmSync(join(dir, 'recovered.provenance.json'));
    rmSync(join(dir, 'recovered.derived-snapshot.html'));

    const second = draftHtml + '<!-- second derivation -->';
    recordDerivation({
      dir,
      surfaceId: 'recovered',
      derivedHtml: second,
      source: 'second derivation',
      createdAt: new Date('2026-06-10T13:00:00Z'),
    });
    expect(readFileSync(join(dir, 'recovered.derived-snapshot.html'), 'utf8')).toBe(second);
    const prov = loadProvenance(dir, 'recovered');
    expect(prov.mode).toBe('derived');
    if (prov.mode !== 'derived') throw new Error('unreachable');
    expect(prov.derived.source).toBe('second derivation');
  });
});

describe('append-once is atomic at the write primitive — TOCTOU hardening (AUDIT-20260611-12)', () => {
  // The lost-race interleaving itself (a sidecar appearing between the
  // existsSync pre-check and the write) cannot be produced in synchronous
  // single-threaded test code. A DANGLING SYMLINK planted at the sidecar path
  // is the deterministic stand-in for it: existsSync follows symlinks and
  // reports false — the pre-check is blind to the occupant — but the atomic
  // primitives the fix mandates refuse it with EEXIST (open with
  // O_CREAT|O_EXCL, i.e. the 'wx' flag, fails on a symlink regardless of
  // where it points; linkSync never clobbers an existing destination). The
  // pre-fix primitives both "succeed": a default-'w' write follows the link
  // and commits bytes through it; renameSync silently replaces the occupant.
  // So these tests fail on the check-then-act implementation and pass only
  // when the write itself is no-clobber — pinning the atomicity property at
  // the only seam sync tests can reach. The true concurrent-recorder case is
  // verified by code inspection (see the doc comments on writeProvenance and
  // the sidecar promote in recordDerivation).

  it('recordDrivingWireframe refuses — committing nothing through the occupant — when the sidecar path is occupied but invisible to the pre-check', () => {
    const dir = freshDir();
    const wireframeFile = writeWireframe(dir, 'raced.html');
    symlinkSync(join(dir, 'elsewhere.json'), join(dir, 'raced.provenance.json'));
    // Sanity: the pre-check's own probe cannot see the occupant.
    expect(existsSync(join(dir, 'raced.provenance.json'))).toBe(false);

    expect(() =>
      recordDrivingWireframe({ dir, surfaceId: 'raced', wireframeFile }),
    ).toThrow();

    // The 'w'-flag failure mode: the write follows the symlink and commits a
    // live record at its target. Neither may happen with the atomic write.
    expect(existsSync(join(dir, 'elsewhere.json'))).toBe(false);
    expect(() => loadProvenance(dir, 'raced')).toThrow();
    expect(lstatSync(join(dir, 'raced.provenance.json')).isSymbolicLink()).toBe(true);
  });

  it('recordDerivation refuses at the sidecar commit point, rolling back the promoted snapshot and leaving no staged debris', () => {
    const dir = freshDir();
    symlinkSync(join(dir, 'elsewhere.json'), join(dir, 'raced-d.provenance.json'));
    expect(existsSync(join(dir, 'raced-d.provenance.json'))).toBe(false);

    expect(() =>
      recordDerivation({
        dir,
        surfaceId: 'raced-d',
        derivedHtml: draftHtml,
        source: 'live surface',
      }),
    ).toThrow();

    // The renameSync failure mode: the promote replaces the occupant with the
    // staged sidecar and the record commits. With the no-clobber promote the
    // occupant is untouched, the already-promoted snapshot is rolled back
    // (linkSync's no-clobber semantics guarantee this call created it), and
    // no temp-suffixed staging debris lingers.
    expect(lstatSync(join(dir, 'raced-d.provenance.json')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(dir, 'raced-d.derived-snapshot.html'))).toBe(false);
    expect(existsSync(join(dir, 'elsewhere.json'))).toBe(false);
    expect(readdirSync(dir)).toEqual(['raced-d.provenance.json']);
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
