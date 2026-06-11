import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWireframeProvenance } from '@/provenance/cli';
import { loadProvenance, recordDerivation, recordDrivingWireframe } from '@/provenance/derived';
import type { CliIo } from '@/authoring/lint-file';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-cli-'));
  dirs.push(dir);
  return dir;
}

const draftHtml =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
  '<body class="sk sk-theme-grayscale"><h1>Entry list</h1></body></html>';

function capture(): { out: string[]; err: string[]; io: CliIo } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
}

describe('runWireframeProvenance — record-driving', () => {
  it('exits 0 and writes the driving sidecar for an on-disk wireframe', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'surface-a.html'), draftHtml);
    const { io, out } = capture();
    expect(runWireframeProvenance(['record-driving', dir, 'surface-a', 'surface-a.html'], io)).toBe(0);
    const prov = loadProvenance(dir, 'surface-a');
    expect(prov.mode).toBe('driving');
    expect(out.join('\n')).toMatch(/driving/i);
  });

  it('exits 1 with a descriptive error when the wireframe file is missing', () => {
    const dir = freshDir();
    const { io, err } = capture();
    expect(runWireframeProvenance(['record-driving', dir, 'ghost', 'ghost.html'], io)).toBe(1);
    expect(err.join('\n')).toMatch(/does not exist/i);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('exits 1 on the append-once refusal (existing sidecar, any mode)', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'taken.html'), draftHtml);
    recordDerivation({ dir, surfaceId: 'taken', derivedHtml: draftHtml, source: 'live surface' });
    const { io, err } = capture();
    expect(runWireframeProvenance(['record-driving', dir, 'taken', 'taken.html'], io)).toBe(1);
    expect(err.join('\n')).toMatch(/append-once/i);
  });

  it('exits 1 on a non-portable surfaceId, naming the constraint', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'w.html'), draftHtml);
    const { io, err } = capture();
    expect(runWireframeProvenance(['record-driving', dir, '../escape', 'w.html'], io)).toBe(1);
    expect(err.join('\n')).toMatch(/portable-filename/i);
  });
});

describe('runWireframeProvenance — record-derived', () => {
  it('exits 0, reading the draft from --from and committing snapshot + sidecar', () => {
    const dir = freshDir();
    const draftFile = join(freshDir(), 'draft.html');
    writeFileSync(draftFile, draftHtml);
    const { io, out } = capture();
    expect(
      runWireframeProvenance(
        ['record-derived', dir, 'surface-d', 'route /dev/studio', '--from', draftFile],
        io,
      ),
    ).toBe(0);
    const prov = loadProvenance(dir, 'surface-d');
    expect(prov.mode).toBe('derived');
    if (prov.mode !== 'derived') throw new Error('unreachable');
    expect(prov.derived.source).toBe('route /dev/studio');
    expect(readFileSync(join(dir, 'surface-d.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
    expect(out.join('\n')).toMatch(/derived/i);
  });

  it('exits 1 with a descriptive error when the --from draft file cannot be read', () => {
    const dir = freshDir();
    const { io, err } = capture();
    expect(
      runWireframeProvenance(
        ['record-derived', dir, 'surface-d', 'live surface', '--from', join(dir, 'nope.html')],
        io,
      ),
    ).toBe(1);
    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('exits 1 on the append-once refusal over an existing record', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'existing.html'), draftHtml);
    recordDrivingWireframe({ dir, surfaceId: 'existing', wireframeFile: 'existing.html' });
    const draftFile = join(freshDir(), 'draft.html');
    writeFileSync(draftFile, draftHtml);
    const { io, err } = capture();
    expect(
      runWireframeProvenance(
        ['record-derived', dir, 'existing', 'live surface', '--from', draftFile],
        io,
      ),
    ).toBe(1);
    expect(err.join('\n')).toMatch(/append-once/i);
  });

  it('exits 2 with usage when the --from flag is misspelled or missing', () => {
    const dir = freshDir();
    const a = capture();
    expect(
      runWireframeProvenance(['record-derived', dir, 's', 'src', '--form', 'x.html'], a.io),
    ).toBe(2);
    expect(a.err.join('\n')).toMatch(/usage/i);
    const b = capture();
    expect(runWireframeProvenance(['record-derived', dir, 's', 'src'], b.io)).toBe(2);
    expect(b.err.join('\n')).toMatch(/usage/i);
  });
});

describe('runWireframeProvenance — check-acceptance', () => {
  it('exits 0 when the accepted artifact carries a non-empty edit against the snapshot', () => {
    const dir = freshDir();
    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
    const accepted = join(freshDir(), 'accepted.html');
    writeFileSync(accepted, draftHtml.replace('Entry list', 'Entry list, regrouped'));
    const { io, out } = capture();
    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(0);
    expect(out.join('\n')).toMatch(/ok|accept/i);
  });

  it('exits 1 with the derived-unedited finding on stderr for a byte-identical artifact', () => {
    const dir = freshDir();
    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
    const accepted = join(freshDir(), 'accepted.html');
    writeFileSync(accepted, draftHtml);
    const { io, err } = capture();
    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(1);
    expect(err.join('\n')).toMatch(/derived-unedited/);
  });

  it('exits 1 with a descriptive error on a tampered baseline (hash mismatch throws)', () => {
    const dir = freshDir();
    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
    const accepted = join(freshDir(), 'accepted.html');
    writeFileSync(accepted, draftHtml + '<edit>');
    const { io, err } = capture();
    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(1);
    expect(err.join('\n')).toMatch(/hash|baseline|derivation/i);
  });

  it('exits 1 with a descriptive error when the accepted-artifact file cannot be read', () => {
    const dir = freshDir();
    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
    const { io, err } = capture();
    expect(
      runWireframeProvenance(['check-acceptance', dir, 's1', join(dir, 'absent.html')], io),
    ).toBe(1);
    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
  });

  it('exits 0 for a driving record (the gate is mode-scoped)', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'w.html'), draftHtml);
    recordDrivingWireframe({ dir, surfaceId: 'fresh', wireframeFile: 'w.html' });
    const accepted = join(freshDir(), 'accepted.html');
    writeFileSync(accepted, draftHtml);
    const { io } = capture();
    expect(runWireframeProvenance(['check-acceptance', dir, 'fresh', accepted], io)).toBe(0);
  });
});

describe('runWireframeProvenance — verify-driving', () => {
  it('exits 0 when the bound wireframe still matches the recorded hash', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'intact.html'), draftHtml);
    recordDrivingWireframe({ dir, surfaceId: 'intact', wireframeFile: 'intact.html' });
    const { io, out } = capture();
    expect(runWireframeProvenance(['verify-driving', dir, 'intact'], io)).toBe(0);
    expect(out.join('\n')).toMatch(/verified/i);
  });

  it('exits 1 with a descriptive error on a hash mismatch (artifact replaced after recording)', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'swapped.html'), draftHtml);
    recordDrivingWireframe({ dir, surfaceId: 'swapped', wireframeFile: 'swapped.html' });
    writeFileSync(join(dir, 'swapped.html'), draftHtml + '<!-- replaced -->');
    const { io, err } = capture();
    expect(runWireframeProvenance(['verify-driving', dir, 'swapped'], io)).toBe(1);
    expect(err.join('\n')).toMatch(/hash|modified|replaced/i);
  });

  it('exits 1 when the surface has no provenance sidecar', () => {
    const { io, err } = capture();
    expect(runWireframeProvenance(['verify-driving', freshDir(), 'absent'], io)).toBe(1);
    expect(err.join('\n')).toMatch(/no provenance sidecar/i);
  });

  it('exits 1 on a derived record (mode mismatch — derived never certifies the claim)', () => {
    const dir = freshDir();
    recordDerivation({ dir, surfaceId: 'rev', derivedHtml: draftHtml, source: 'live surface' });
    const { io, err } = capture();
    expect(runWireframeProvenance(['verify-driving', dir, 'rev'], io)).toBe(1);
    expect(err.join('\n')).toMatch(/derived/i);
  });
});

describe('runWireframeProvenance — usage errors', () => {
  it('exits 2 with usage on an unknown subcommand', () => {
    const { io, err } = capture();
    expect(runWireframeProvenance(['frobnicate', 'a', 'b'], io)).toBe(2);
    expect(err.join('\n')).toMatch(/usage/i);
  });

  it('exits 2 with usage when no subcommand is given', () => {
    const { io, err } = capture();
    expect(runWireframeProvenance([], io)).toBe(2);
    expect(err.join('\n')).toMatch(/usage/i);
  });

  it.each([
    [['record-driving', 'dir', 'id']],
    [['record-driving', 'dir', 'id', 'f.html', 'extra']],
    [['check-acceptance', 'dir', 'id']],
    [['verify-driving', 'dir']],
    [['verify-driving', 'dir', 'id', 'extra']],
  ])('exits 2 with usage on wrong arity: %j', (argv) => {
    const { io, err } = capture();
    expect(runWireframeProvenance(argv, io)).toBe(2);
    expect(err.join('\n')).toMatch(/usage/i);
  });
});
