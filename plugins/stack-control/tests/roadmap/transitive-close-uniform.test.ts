// T012 (031 US1) RED — uniform terminal handling: a `cancelled`/`retired` member
// of the subtree has its recorded ids COLLECTED (with a status-reflecting reason)
// and the walk descends into its children (quickstart Scenario D, FR-007).

import { describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { buildCascadePlan } from '../../src/roadmap/transitive-close.js';
import { writeClosureRoadmap } from '../../src/__tests__/roadmap/closure-fixtures.js';
import { ROADMAP_OPTS } from './helpers.js';

describe('031 buildCascadePlan — uniform terminal handling of cancelled/retired', () => {
  it('collects a cancelled member ids with a status-reflecting reason and descends into its children', () => {
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: ['TASK-1'] },
      { id: 'impl:feature/cancelled', status: 'cancelled', partOf: ['multi:feature/root'], closes: ['TASK-6'] },
      // grandchild beneath the cancelled member — must still be walked.
      { id: 'impl:feature/gc', status: 'retired', partOf: ['impl:feature/cancelled'], closes: ['TASK-7'] },
    ]);
    const model = loadRoadmap(doc, ROADMAP_OPTS);
    const statusById = new Map([
      ['TASK-1', 'To-Do'],
      ['TASK-6', 'To-Do'],
      ['TASK-7', 'To-Do'],
    ]);

    const plan = buildCascadePlan(model, 'multi:feature/root', statusById);

    // The cancelled member's ids ARE collected, and the walk descended into the
    // retired grandchild (TASK-7 collected too).
    expect([...plan.closeIds].sort()).toEqual(['TASK-1', 'TASK-6', 'TASK-7']);
    expect(plan.skipped).toEqual([]);

    const cancelledNode = plan.nodes.find((n) => n.id === 'impl:feature/cancelled');
    expect(cancelledNode).toBeDefined();
    expect(cancelledNode?.status).toBe('cancelled');
    // The reason reflects the node's terminal status.
    expect(cancelledNode?.reason).toContain('cancelled');

    const retiredNode = plan.nodes.find((n) => n.id === 'impl:feature/gc');
    expect(retiredNode?.reason).toContain('retired');
  });
});
