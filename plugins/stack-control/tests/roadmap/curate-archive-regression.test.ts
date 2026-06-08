// T055 (US6, 006) — the document-primitives curate/archive engines operate
// UNCHANGED on the new heading-keyed roadmap grammar (quickstart Scenario 6).
// A terminal-status item with no inbound edges archives cleanly; live items stay.

import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCurate } from '../../src/document-model/curate-engine.js';
import { archivePathFor } from '../../src/document-model/document.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { ROADMAP_OPTS } from './helpers.js';

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
