// T010 (031 US1) RED — buildCascadePlan walks the part-of subtree, collects each
// terminal node's recorded closes ids, and dedups a multi-parent (diamond) node
// via the visited-Set so it is processed exactly once (quickstart Scenario B,
// FR-001/FR-002). Fixtures on disk; never mock the filesystem.

import { describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { buildCascadePlan } from '../../src/roadmap/transitive-close.js';
import { writeClosureRoadmap } from '../../src/__tests__/roadmap/closure-fixtures.js';
import { ROADMAP_OPTS } from './helpers.js';

describe('031 buildCascadePlan — subtree walk + multi-parent dedup', () => {
  it('collects terminal nodes closes ids across the part-of subtree', () => {
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: ['TASK-1', 'TASK-2'] },
      { id: 'impl:feature/child', status: 'shipped', partOf: ['multi:feature/root'], closes: ['TASK-3'] },
    ]);
    const model = loadRoadmap(doc, ROADMAP_OPTS);
    const statusById = new Map([
      ['TASK-1', 'To-Do'],
      ['TASK-2', 'To-Do'],
      ['TASK-3', 'To-Do'],
    ]);

    const plan = buildCascadePlan(model, 'multi:feature/root', statusById);

    expect(plan.root).toBe('multi:feature/root');
    expect([...plan.closeIds].sort()).toEqual(['TASK-1', 'TASK-2', 'TASK-3']);
    expect(plan.nodes.map((n) => n.id).sort()).toEqual(['impl:feature/child', 'multi:feature/root']);
    expect(plan.skipped).toEqual([]);
    expect(plan.unknownIds).toEqual([]);
    expect(plan.alreadyClosed).toEqual([]);
  });

  it('visits a diamond (multi-parent) node exactly once — no double-count', () => {
    // root → {a, b}; shared N is part-of BOTH a and b, reachable by two paths.
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: ['TASK-1'] },
      { id: 'impl:feature/a', status: 'shipped', partOf: ['multi:feature/root'] },
      { id: 'impl:feature/b', status: 'shipped', partOf: ['multi:feature/root'] },
      { id: 'impl:feature/n', status: 'shipped', partOf: ['impl:feature/a', 'impl:feature/b'], closes: ['TASK-9'] },
    ]);
    const model = loadRoadmap(doc, ROADMAP_OPTS);
    const statusById = new Map([
      ['TASK-1', 'To-Do'],
      ['TASK-9', 'To-Do'],
    ]);

    const plan = buildCascadePlan(model, 'multi:feature/root', statusById);

    // N appears exactly once among the nodes.
    expect(plan.nodes.filter((n) => n.id === 'impl:feature/n')).toHaveLength(1);
    // TASK-9 appears exactly once in closeIds.
    expect(plan.closeIds.filter((id) => id === 'TASK-9')).toHaveLength(1);
    expect([...plan.closeIds].sort()).toEqual(['TASK-1', 'TASK-9']);
  });
});
