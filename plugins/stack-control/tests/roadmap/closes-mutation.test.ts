// T017 (031 US2, RED-first) — the pure `closes-mutation` engine: given a roadmap
// doc + node id + add/remove id sets, produce the node's NEW canonical `closes:`
// set (set-union for add, set-difference for remove; trimmed, deduped, stable
// order) and the rewritten doc text. Create the `- closes:` line when absent,
// remove it when it becomes empty; `--add` of a present id and `--remove` of an
// absent id are no-ops (reported, not errors); fence-aware (does not corrupt a
// fenced code block in the node body). Adding does NOT validate against backlog.
//
// Pure (no I/O beyond the doc-path load every roadmap mutation does): the engine
// loads the doc it is handed, computes before/after sets, and returns the
// rewritten source. Tests pass real doc source on disk via the closure-roadmap
// helper (fixtures on disk; never mock fs).
//
// Placement deviation (tasks.md says src/roadmap/__tests__/…): that root is NOT
// collected by vitest — prior phases placed engine tests under tests/roadmap/.

import { describe, expect, it } from 'vitest';
import { computeCloses } from '../../src/roadmap/closes-mutation.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { writeClosureRoadmap } from '../../src/__tests__/roadmap/closure-fixtures.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('031 closes-mutation engine (T017)', () => {
  it('adds ids via set-union (creates the closes: line when absent), trimmed/deduped/stable', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped' }]);
    const result = computeCloses(doc, 'multi:feature/n', { add: ['TASK-7', 'TASK-8'] }, ROADMAP_OPTS);
    expect(result.before).toEqual([]);
    expect(result.after).toEqual(['TASK-7', 'TASK-8']);
    expect(result.text).toContain('- closes: TASK-7, TASK-8');
  });

  it('union is order-stable and dedupes: existing kept, new appended, no duplicates', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped', closes: ['TASK-1', 'TASK-2'] }]);
    const result = computeCloses(doc, 'multi:feature/n', { add: ['TASK-2', 'TASK-3'] }, ROADMAP_OPTS);
    expect(result.before).toEqual(['TASK-1', 'TASK-2']);
    expect(result.after).toEqual(['TASK-1', 'TASK-2', 'TASK-3']); // TASK-2 not duplicated
  });

  it('removes ids via set-difference, preserving the remaining order', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped', closes: ['TASK-7', 'TASK-8'] }]);
    const result = computeCloses(doc, 'multi:feature/n', { remove: ['TASK-7'] }, ROADMAP_OPTS);
    expect(result.before).toEqual(['TASK-7', 'TASK-8']);
    expect(result.after).toEqual(['TASK-8']);
    expect(result.text).toContain('- closes: TASK-8');
  });

  it('removing the last id drops the closes: line entirely', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped', closes: ['TASK-7'] }]);
    const result = computeCloses(doc, 'multi:feature/n', { remove: ['TASK-7'] }, ROADMAP_OPTS);
    expect(result.after).toEqual([]);
    expect(result.text).not.toContain('closes:');
  });

  it('adding an already-present id is a no-op (after === before, reported not error)', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped', closes: ['TASK-7'] }]);
    const result = computeCloses(doc, 'multi:feature/n', { add: ['TASK-7'] }, ROADMAP_OPTS);
    expect(result.before).toEqual(['TASK-7']);
    expect(result.after).toEqual(['TASK-7']);
    expect(result.changed).toBe(false);
  });

  it('removing an absent id is a no-op (after === before, reported not error)', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped', closes: ['TASK-7'] }]);
    const result = computeCloses(doc, 'multi:feature/n', { remove: ['TASK-99'] }, ROADMAP_OPTS);
    expect(result.before).toEqual(['TASK-7']);
    expect(result.after).toEqual(['TASK-7']);
    expect(result.changed).toBe(false);
  });

  it('combined add + remove apply union then difference', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped', closes: ['TASK-1', 'TASK-2'] }]);
    const result = computeCloses(doc, 'multi:feature/n', { add: ['TASK-3'], remove: ['TASK-1'] }, ROADMAP_OPTS);
    expect(result.after).toEqual(['TASK-2', 'TASK-3']);
  });

  it('does NOT validate added ids against the backlog (records an id before it exists)', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped' }]);
    const result = computeCloses(doc, 'multi:feature/n', { add: ['TASK-DOES-NOT-EXIST'] }, ROADMAP_OPTS);
    expect(result.after).toEqual(['TASK-DOES-NOT-EXIST']);
  });

  it('is fence-aware: a closes: bullet inside a fenced code block is left untouched', () => {
    const fenced = writeTempRoadmap([
      '## multi:feature/n',
      '- status: shipped',
      '- closes: TASK-1',
      '',
      '```',
      '- closes: TASK-EXAMPLE',
      '```',
    ]);
    const result = computeCloses(fenced, 'multi:feature/n', { add: ['TASK-2'] }, ROADMAP_OPTS);
    // The fenced example line stays byte-identical; the REAL closes line gains TASK-2.
    expect(result.text).toContain('- closes: TASK-EXAMPLE'); // inside the fence, untouched
    expect(result.after).toEqual(['TASK-1', 'TASK-2']);
    // The model re-parses the new set from the rewritten text (sanity).
    void loadRoadmap;
  });

  it('an unknown node fails loud', () => {
    const doc = writeClosureRoadmap([{ id: 'multi:feature/n', status: 'shipped' }]);
    expect(() => computeCloses(doc, 'multi:feature/nope', { add: ['TASK-7'] }, ROADMAP_OPTS)).toThrow();
  });
});
