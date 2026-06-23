// T006 (RED-first, Foundational, 031) — childrenOf(model, parentId) is the
// reverse `part-of` edge (items whose partOf includes the parent), mirroring
// blocks() for depends-on (FR-006). It is the cascade's sole traversal
// primitive. A multi-parent child appears under EACH of its parents; an unknown
// parent id fails loud; a childless parent yields [].

import { describe, it, expect } from 'vitest';
import { childrenOf } from '../../src/roadmap/graph.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { writeTempRoadmap, ROADMAP_OPTS } from './helpers.js';

const ids = (items: readonly { identifier: string }[]) => items.map((i) => i.identifier).sort();

describe('childrenOf (T006, FR-006)', () => {
  it('returns the items whose part-of includes the parent', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/parent',
      '- status: shipped',
      '## impl:feature/child-a',
      '- status: shipped',
      '- part-of: multi:feature/parent',
      '## impl:feature/child-b',
      '- status: shipped',
      '- part-of: multi:feature/parent',
    ]);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(ids(childrenOf(model, 'multi:feature/parent'))).toEqual([
      'impl:feature/child-a',
      'impl:feature/child-b',
    ]);
  });

  it('a multi-parent child appears under each of its parents', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/p1',
      '- status: shipped',
      '## multi:feature/p2',
      '- status: shipped',
      '## impl:feature/shared',
      '- status: shipped',
      '- part-of: multi:feature/p1, multi:feature/p2',
    ]);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(ids(childrenOf(model, 'multi:feature/p1'))).toEqual(['impl:feature/shared']);
    expect(ids(childrenOf(model, 'multi:feature/p2'))).toEqual(['impl:feature/shared']);
  });

  it('returns [] for a parent with no children', () => {
    const docPath = writeTempRoadmap(['## multi:feature/lonely', '- status: shipped']);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(childrenOf(model, 'multi:feature/lonely')).toEqual([]);
  });

  it('throws fail-loud for an unknown parent id', () => {
    const docPath = writeTempRoadmap(['## multi:feature/known', '- status: shipped']);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(() => childrenOf(model, 'multi:feature/nope')).toThrow(/nope/);
  });
});
