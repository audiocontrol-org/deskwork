// T028 (RED-first, US4, 006) — blocks(x) (items that declare depends-on: x) and
// derived order (topological over depends-on, tie-broken by the phase relation
// then identifier via compareUnits) — FR-013/FR-008.

import { describe, it, expect } from 'vitest';
import { blocks, order } from '../../src/roadmap/graph.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

const ids = (items: readonly { identifier: string }[]) => items.map((i) => i.identifier);

describe('blocks (T028, FR-013)', () => {
  it('chain: blocks(a) is [b]; blocks(c) is empty', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    expect(ids(blocks(model, 'design:feature/a'))).toEqual(['impl:feature/b']);
    expect(ids(blocks(model, 'impl:feature/c'))).toEqual([]);
  });

  it('diamond: blocks(a) is both arms; blocks(b) is the join', () => {
    const model = loadRoadmap(fixturePath('diamond'), ROADMAP_OPTS);
    expect(ids(blocks(model, 'design:feature/a')).sort()).toEqual([
      'impl:feature/b',
      'impl:feature/c',
    ]);
    expect(ids(blocks(model, 'impl:feature/b'))).toEqual(['multi:feature/d']);
  });
});

describe('order (T028, FR-008)', () => {
  it('chain: dependency-respecting topological order', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    expect(ids(order(model))).toEqual(['design:feature/a', 'impl:feature/b', 'impl:feature/c']);
  });

  it('diamond: phase relation + identifier tiebreak within a topological layer', () => {
    const model = loadRoadmap(fixturePath('diamond'), ROADMAP_OPTS);
    expect(ids(order(model))).toEqual([
      'design:feature/a',
      'impl:feature/b',
      'impl:feature/c',
      'multi:feature/d',
    ]);
  });
});
