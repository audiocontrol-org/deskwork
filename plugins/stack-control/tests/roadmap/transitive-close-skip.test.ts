// T011 (031 US1) RED — skip-and-report: a non-terminal (in-flight) child is
// listed in `skipped`, its recorded ids are EXCLUDED from closeIds, and the walk
// still descends into its children (quickstart Scenario C, FR-007a).

import { describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { buildCascadePlan } from '../../src/roadmap/transitive-close.js';
import { writeClosureRoadmap } from '../../src/__tests__/roadmap/closure-fixtures.js';
import { ROADMAP_OPTS } from './helpers.js';

describe('031 buildCascadePlan — skip-and-report non-terminal child', () => {
  it('lists the in-flight child in skipped, excludes its ids, descends into its children', () => {
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: ['TASK-4'] },
      // child-A terminal — its ids close.
      { id: 'impl:feature/a', status: 'shipped', partOf: ['multi:feature/root'], closes: ['TASK-40'] },
      // child-B in-flight — skipped, TASK-5 NOT collected; but its terminal
      // grandchild still gets walked + collected.
      { id: 'impl:feature/b', status: 'in-flight', partOf: ['multi:feature/root'], closes: ['TASK-5'] },
      { id: 'impl:feature/g', status: 'shipped', partOf: ['impl:feature/b'], closes: ['TASK-6'] },
    ]);
    const model = loadRoadmap(doc, ROADMAP_OPTS);
    const statusById = new Map([
      ['TASK-4', 'To-Do'],
      ['TASK-40', 'To-Do'],
      ['TASK-5', 'To-Do'],
      ['TASK-6', 'To-Do'],
    ]);

    const plan = buildCascadePlan(model, 'multi:feature/root', statusById);

    // The in-flight child is reported as skipped with its status.
    expect(plan.skipped).toEqual([{ id: 'impl:feature/b', status: 'in-flight' }]);
    // Its own id is NOT closed.
    expect(plan.closeIds).not.toContain('TASK-5');
    // The walk continued PAST the in-flight child into its terminal grandchild.
    expect(plan.closeIds).toContain('TASK-6');
    expect([...plan.closeIds].sort()).toEqual(['TASK-4', 'TASK-40', 'TASK-6']);
    // The skipped node is not a closure node.
    expect(plan.nodes.map((n) => n.id)).not.toContain('impl:feature/b');
  });
});
