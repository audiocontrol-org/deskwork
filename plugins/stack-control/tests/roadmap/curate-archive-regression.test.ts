// T055 (US6, 006) — the document-primitives curate/archive engines operate
// UNCHANGED on the new heading-keyed roadmap grammar (quickstart Scenario 6).
// A terminal-status item with no inbound edges archives cleanly; live items stay.

import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runCurate } from '../../src/document-model/curate-engine.js';
import { archivePathFor } from '../../src/document-model/document.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

function tmpRoadmap(): string {
  const dir = mkdtempSync(join(tmpdir(), 'curate-roadmap-'));
  const docPath = join(dir, 'ROADMAP.md');
  writeFileSync(
    docPath,
    [
      '---',
      'doc-grammar: roadmap',
      '---',
      '',
      '# roadmap',
      '',
      '## design:feature/done',
      '- status: shipped',
      'A completed item nothing depends on.',
      '',
      '## impl:feature/active',
      '- status: planned',
      'Still in progress.',
      '',
    ].join('\n'),
    'utf8',
  );
  return docPath;
}

describe('curate/archive on the heading-keyed roadmap (T055, Scenario 6)', () => {
  it('curate flags an unarchived terminal item', () => {
    const docPath = tmpRoadmap();
    const report = runCurate(docPath, { apply: false, ...ROADMAP_OPTS });
    expect(report.findings.some((f) => f.kind === 'unarchived-terminal')).toBe(true);
  });

  it('curate --apply archives the terminal item; live items remain; ledger written', () => {
    const docPath = tmpRoadmap();
    runCurate(docPath, { apply: true, ...ROADMAP_OPTS, now: '2026-06-08T00:00:00.000Z' });

    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('design:feature/done')).toBe(false); // archived out
    expect(model.byId.has('impl:feature/active')).toBe(true); // still live

    const archivePath = archivePathFor(docPath);
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(archivePath, 'utf8')).toContain('design:feature/done');
  });
});

// AUDIT-20260608-07 (HIGH): archiving a terminal-status item that is still a
// `depends-on`/`part-of` target of a LIVE item would leave a dangling reference
// in the live document, bricking every subsequent roadmap/curate/load. archive
// (and the curate compose path) MUST re-validate the post-cut live document
// BEFORE any write and refuse atomically (zero writes) when it would dangle.
describe('archive refuses to dangle a live edge (AUDIT-20260608-07)', () => {
  function tmpRoadmapWithLiveEdge(): string {
    return writeTempRoadmap([
      '## multi:feature/front-door',
      '- status: shipped',
      'A shipped dependency many live items still point at.',
      '',
      '## impl:feature/active',
      '- status: planned',
      '- depends-on: multi:feature/front-door',
      'Still in progress; depends on the shipped item.',
    ]);
  }

  it('runArchive --apply throws DocumentModelError and writes nothing', () => {
    const docPath = tmpRoadmapWithLiveEdge();
    const before = readFileSync(docPath, 'utf8');

    expect(() => runArchive(docPath, { apply: true, ...ROADMAP_OPTS, now: '2026-06-08T00:00:00.000Z' })).toThrow(
      DocumentModelError,
    );

    // Zero-write: both the live document AND the (never-created) archive file.
    expect(readFileSync(docPath, 'utf8')).toBe(before);
    expect(existsSync(archivePathFor(docPath))).toBe(false);
  });

  it('runCurate --apply throws DocumentModelError and leaves the document byte-for-byte unchanged', () => {
    const docPath = tmpRoadmapWithLiveEdge();
    const before = readFileSync(docPath, 'utf8');

    expect(() => runCurate(docPath, { apply: true, ...ROADMAP_OPTS, now: '2026-06-08T00:00:00.000Z' })).toThrow(
      DocumentModelError,
    );

    expect(readFileSync(docPath, 'utf8')).toBe(before);
    expect(existsSync(archivePathFor(docPath))).toBe(false);
  });
});
