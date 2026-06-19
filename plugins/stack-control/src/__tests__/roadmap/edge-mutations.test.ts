// T065 (RED-first, US2, 028) — roadmap.addEdge / removeEdge: mutate a typed edge
// field (depends-on / part-of / …), re-validate the WHOLE graph (no cycle, no
// dangling target, no duplicate edge), and zero-write on any violation. Dry-run
// unless apply (FR-014; contract RM1).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { addEdge, removeEdge } from '../../roadmap/edge-mutations.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { DocumentModelError } from '../../document-model/types.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('roadmap.addEdge (T065)', () => {
  it('adds a depends-on edge and re-validates (--apply)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
    ]);
    addEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/a', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.dependsOn).toEqual(['design:feature/a']);
  });

  it('appends to an existing edge line, preserving prior targets', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## design:feature/b',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    addEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/b', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.dependsOn).toEqual([
      'design:feature/a',
      'design:feature/b',
    ]);
  });

  it('adds a part-of edge (multi-parent grouping)', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/parent',
      '- status: planned',
      '',
      '## impl:feature/x',
      '- status: planned',
    ]);
    addEdge(docPath, 'impl:feature/x', 'part-of', 'multi:feature/parent', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.partOf).toEqual(['multi:feature/parent']);
  });

  it('dry-run (apply=false) writes nothing but returns the candidate', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
    ]);
    const before = readFileSync(docPath, 'utf8');
    const result = addEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/a', ROADMAP_OPTS, false);
    expect(result.applied).toBe(false);
    expect(result.source).toContain('depends-on: design:feature/a');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('zero-write on a dangling target (unknown <to>)', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: planned']);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      addEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/ghost', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('zero-write on a cycle', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/a',
      '- status: planned',
      '- depends-on: impl:feature/b',
      '',
      '## impl:feature/b',
      '- status: planned',
    ]);
    const before = readFileSync(docPath, 'utf8');
    // b → a would close the cycle a → b → a.
    expect(() =>
      addEdge(docPath, 'impl:feature/b', 'depends-on', 'impl:feature/a', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses a duplicate edge (same target already present) zero-write', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      addEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/a', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an unknown source node', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: planned']);
    expect(() =>
      addEdge(docPath, 'impl:feature/ghost', 'depends-on', 'impl:feature/x', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
  });
});

describe('roadmap.removeEdge (T065)', () => {
  it('removes a single target, leaving the others', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## design:feature/b',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a, design:feature/b',
    ]);
    removeEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/a', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.dependsOn).toEqual(['design:feature/b']);
  });

  it('removes the last target, dropping the edge entirely', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    removeEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/a', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.dependsOn).toEqual([]);
  });

  it('refuses removing an edge that is not present (exit-2-class)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
    ]);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      removeEdge(docPath, 'impl:feature/x', 'depends-on', 'design:feature/a', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an unknown source node', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: planned']);
    expect(() =>
      removeEdge(docPath, 'impl:feature/ghost', 'depends-on', 'impl:feature/x', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
  });
});
