// T039 (RED-first, US3, 006) — mutations.reclassify renames an identifier
// (phase/kind change) AND rewrites every referencing edge atomically; a rename
// that invalidates the graph (duplicate target) is zero-write (FR-001a/FR-010).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reclassify } from '../../src/roadmap/mutations.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('mutations.reclassify (T039)', () => {
  it('renames the item and rewrites every referencing edge', () => {
    const docPath = writeTempRoadmap([
      '## impl:gap/y',
      '- status: planned',
      '',
      '## multi:feature/d',
      '- status: planned',
      '- depends-on: impl:gap/y',
      '- part-of: impl:gap/y',
    ]);
    reclassify(docPath, 'impl:gap/y', 'impl:feature/y', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:gap/y')).toBe(false);
    expect(model.byId.get('impl:feature/y')!.kind).toBe('feature');
    const d = model.byId.get('multi:feature/d')!;
    expect(d.dependsOn).toEqual(['impl:feature/y']);
    expect(d.partOf).toEqual(['impl:feature/y']);
  });

  it('renaming onto an existing identifier is zero-write', () => {
    const docPath = writeTempRoadmap([
      '## impl:gap/y',
      '- status: planned',
      '',
      '## multi:feature/d',
      '- status: planned',
    ]);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      reclassify(docPath, 'impl:gap/y', 'multi:feature/d', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('fails loud on an unknown source identifier', () => {
    const docPath = writeTempRoadmap(['## impl:gap/y', '- status: planned']);
    expect(() =>
      reclassify(docPath, 'impl:gap/ghost', 'impl:feature/y', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
  });
});
