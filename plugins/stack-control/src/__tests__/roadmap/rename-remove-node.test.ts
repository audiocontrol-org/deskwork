// T069 (RED-first, US2, 028) — roadmap.renameNode repoints ALL dependents (every
// edge targeting the old id now targets the new id) and re-validates; roadmap.
// removeNode is EDGE-AWARE: a node still targeted by depends-on/part-of is NOT
// silently dangled — removeNode REFUSES loud (never leaves a dangling edge)
// (FR-014/017; contract RM1).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renameNode, removeNode } from '../../roadmap/edge-mutations.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { DocumentModelError } from '../../document-model/types.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('roadmap.renameNode (T069)', () => {
  it('renames the node and repoints every dependent edge', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
      '',
      '## multi:feature/d',
      '- status: planned',
      '- part-of: design:feature/a',
    ]);
    renameNode(docPath, 'design:feature/a', 'design:feature/renamed', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('design:feature/a')).toBe(false);
    expect(model.byId.has('design:feature/renamed')).toBe(true);
    expect(model.byId.get('impl:feature/x')!.dependsOn).toEqual(['design:feature/renamed']);
    expect(model.byId.get('multi:feature/d')!.partOf).toEqual(['design:feature/renamed']);
  });

  it('refuses a rename to an already-existing id (duplicate) zero-write', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/a',
      '- status: planned',
      '',
      '## impl:feature/b',
      '- status: planned',
    ]);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      renameNode(docPath, 'impl:feature/a', 'impl:feature/b', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an unknown source node', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: planned']);
    expect(() =>
      renameNode(docPath, 'impl:feature/ghost', 'impl:feature/new', ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
  });
});

describe('roadmap.removeNode (T069 — edge-aware)', () => {
  it('removes an unreferenced node (--apply)', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
    ]);
    removeNode(docPath, 'impl:feature/x', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:feature/x')).toBe(false);
    expect(model.byId.has('impl:feature/a')).toBe(true);
  });

  it('REFUSES loud (never dangles) a node still targeted by depends-on', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    const before = readFileSync(docPath, 'utf8');
    expect(() => removeNode(docPath, 'design:feature/a', ROADMAP_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('REFUSES loud a node still targeted by part-of', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/parent',
      '- status: planned',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- part-of: multi:feature/parent',
    ]);
    const before = readFileSync(docPath, 'utf8');
    expect(() => removeNode(docPath, 'multi:feature/parent', ROADMAP_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an unknown node', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: planned']);
    expect(() => removeNode(docPath, 'impl:feature/ghost', ROADMAP_OPTS, true)).toThrow(
      DocumentModelError,
    );
  });

  it('dry-run on a removable node writes nothing', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
    ]);
    const before = readFileSync(docPath, 'utf8');
    const result = removeNode(docPath, 'impl:feature/x', ROADMAP_OPTS, false);
    expect(result.applied).toBe(false);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
