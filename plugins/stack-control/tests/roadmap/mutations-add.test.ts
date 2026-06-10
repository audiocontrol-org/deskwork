// T023 (RED-first, US2, 006) — mutations.add: one-move emergent capture with
// --part-of + --depends-on; the whole graph re-validates before any write; a
// dangling target ⇒ zero-write (document byte-for-byte unchanged). R7.

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { add } from '../../src/roadmap/mutations.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mut-add-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('mutations.add (T023)', () => {
  it('captures a fix item with part-of + depends-on in one move (--apply)', () => {
    const docPath = tmpCopy('chain');
    add(
      docPath,
      {
        identifier: 'impl:fix/escaped-pipe',
        scope: 'found mid-build',
        dependsOn: ['design:feature/a'],
        partOf: 'impl:feature/b',
      },
      ROADMAP_OPTS,
      true,
    );
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    const item = model.byId.get('impl:fix/escaped-pipe')!;
    expect(item.kind).toBe('fix');
    expect(item.phase).toBe('impl');
    expect(item.status).toBe('planned');
    expect(item.dependsOn).toEqual(['design:feature/a']);
    expect(item.partOf).toBe('impl:feature/b');
    expect(item.scope).toContain('found mid-build');
  });

  it('refuses a dangling depends-on atomically — zero write, document unchanged', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      add(docPath, { identifier: 'impl:fix/y', dependsOn: ['design:feature/ghost'] }, ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses a duplicate identifier atomically', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(() => add(docPath, { identifier: 'impl:feature/b' }, ROADMAP_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('dry-run (apply=false) returns the candidate source but writes nothing', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const result = add(docPath, { identifier: 'impl:gap/z' }, ROADMAP_OPTS, false);
    expect(result.applied).toBe(false);
    expect(result.source).toContain('## impl:gap/z');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
