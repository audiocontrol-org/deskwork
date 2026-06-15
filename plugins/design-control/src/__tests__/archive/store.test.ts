import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchiveEntry, loadArchiveEntry, writeArchiveEntry } from '@/archive/store';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dc-archive-'));
  dirs.push(dir);
  return dir;
}

describe('design archive primitive', () => {
  it('round-trips a decision with proposal, acceptance, implementation commit, rejection, and supersedes links', () => {
    const dir = freshDir();
    const entry = createArchiveEntry({
      surfaceId: 'content-browser',
      brief: 'Regroup the browser by lane',
      proposalWireframePath: 'wireframes/content-browser.html',
      acceptedWireframePath: 'wireframes/content-browser-accepted.html',
      implementationCommit: 'abc1234',
      rejectedRationale: 'Superseded by lane-first grouping',
      supersedes: {
        archivePath: 'archive/content-browser-v1.json',
        reason: 'Lane-first revision replaced the earlier proposal',
      },
    });
    const file = join(dir, 'content-browser.archive.json');
    writeArchiveEntry(file, entry);
    expect(loadArchiveEntry(file)).toEqual(entry);
  });

  it('writes readable JSON on disk for skill-generated archive flows', () => {
    const dir = freshDir();
    const file = join(dir, 'drawer.archive.json');
    writeArchiveEntry(
      file,
      createArchiveEntry({
        surfaceId: 'scrapbook-drawer',
        brief: 'Refine drawer structure',
        proposalWireframePath: 'wireframes/drawer.html',
      }),
    );
    expect(readFileSync(file, 'utf8')).toContain('"surfaceId": "scrapbook-drawer"');
    expect(readFileSync(file, 'utf8')).toContain('"proposal"');
  });

  it('fails loud on malformed archive JSON (never silent partial load)', () => {
    const dir = freshDir();
    const file = join(dir, 'bad.archive.json');
    writeArchiveEntry(
      file,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'ok',
        proposalWireframePath: 'wireframes/surface.html',
      }),
    );
    const broken = JSON.parse(readFileSync(file, 'utf8')) as { proposal?: { wireframePath?: string } };
    if (!broken.proposal) throw new Error('fixture invariant failed');
    delete broken.proposal.wireframePath;
    writeFileSync(file, JSON.stringify(broken, null, 2) + '\n');
    expect(() => loadArchiveEntry(file)).toThrow(/wireframePath|required/i);
  });
});
