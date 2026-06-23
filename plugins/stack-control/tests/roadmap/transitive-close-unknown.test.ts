// T013 (031 US1) RED — a recorded `closes:` id absent from the backlog surfaces
// in `unknownIds` (the FR-006 fail-loud signal), and applyCascade REFUSES (throws
// BacklogError) when unknownIds is non-empty — no partial close. An in-memory
// fake backend captures the close calls so we can assert nothing was closed.

import { describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { applyCascade, buildCascadePlan } from '../../src/roadmap/transitive-close.js';
import { BacklogError, type BacklogBackend } from '../../src/backlog/backend.js';
import { writeClosureRoadmap } from '../../src/__tests__/roadmap/closure-fixtures.js';
import { ROADMAP_OPTS } from './helpers.js';

/** A minimal in-memory backend recording only the close calls the cascade makes. */
function recordingBackend(): { backend: BacklogBackend; closed: Array<{ id: string; reason: string }> } {
  const closed: Array<{ id: string; reason: string }> = [];
  const backend: BacklogBackend = {
    create: () => {
      throw new Error('not used');
    },
    list: () => [],
    exists: () => false,
    edit: () => undefined,
    close: (id, reason) => {
      closed.push({ id, reason });
    },
    archive: () => undefined,
    readNotes: () => '',
  };
  return { backend, closed };
}

describe('031 buildCascadePlan + applyCascade — unknown id fail-loud', () => {
  it('surfaces a recorded id absent from the backlog in unknownIds', () => {
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: ['TASK-1', 'TASK-999999'] },
    ]);
    const model = loadRoadmap(doc, ROADMAP_OPTS);
    const statusById = new Map([['TASK-1', 'To-Do']]); // TASK-999999 absent

    const plan = buildCascadePlan(model, 'multi:feature/root', statusById);

    expect(plan.unknownIds).toEqual(['TASK-999999']);
  });

  it('applyCascade refuses (throws) when unknownIds is non-empty — closes nothing', () => {
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: ['TASK-1', 'TASK-999999'] },
    ]);
    const model = loadRoadmap(doc, ROADMAP_OPTS);
    const statusById = new Map([['TASK-1', 'To-Do']]);
    const plan = buildCascadePlan(model, 'multi:feature/root', statusById);
    const { backend, closed } = recordingBackend();

    expect(() => applyCascade(plan, backend)).toThrow(BacklogError);
    expect(closed).toEqual([]); // no partial close
  });
});
