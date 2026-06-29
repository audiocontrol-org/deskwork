// 033 T011 — tier resolution happy path (data-model TierResolution).
//
// RED-first: the pure resolve(label?, map, accepted) → ResolvedModel | TierError, and
// the collect-all resolveTasks entry point, on a fully-valid plan (the error branches
// are exercised at the verb boundary in Phase 4 / resolve-tiers.test.ts).

import { describe, it, expect } from 'vitest';
import { resolveTier, resolveTasks } from '../../execute/tier-resolution.js';
import { ACCEPTED_MODELS } from '../../execute/accepted-models.js';
import type { TieredTask } from '../../execute/tasks-tier-parser.js';

const MAP = { fast: 'haiku', balanced: 'sonnet', powerful: 'opus' } as const;

function task(id: string, tierLabel: string | undefined): TieredTask {
  return { id, tierLabel, body: `body ${id}`, done: false, lineNumber: 1 };
}

describe('resolveTier happy path (033 T011)', () => {
  it('resolves a declared label to its mapped model when the model is accepted', () => {
    const out = resolveTier('T001', 'fast', MAP, ACCEPTED_MODELS);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.model).toBe('haiku');
  });
});

describe('resolveTasks happy path (033 T011)', () => {
  it('resolves every task to {id, tierLabel, model} with model === map[label] and no errors', () => {
    const tasks = [task('T001', 'fast'), task('T002', 'powerful')];
    const { resolved, errors } = resolveTasks(tasks, MAP, ACCEPTED_MODELS);
    expect(errors).toEqual([]);
    expect(resolved).toEqual([
      { id: 'T001', tierLabel: 'fast', model: 'haiku' },
      { id: 'T002', tierLabel: 'powerful', model: 'opus' },
    ]);
  });

  it('skips already-done tasks from resolution? no — done tasks still resolve (informs ledger)', () => {
    const done: TieredTask = { id: 'T003', tierLabel: 'balanced', body: 'b', done: true, lineNumber: 1 };
    const { resolved, errors } = resolveTasks([done], MAP, ACCEPTED_MODELS);
    expect(errors).toEqual([]);
    expect(resolved).toEqual([{ id: 'T003', tierLabel: 'balanced', model: 'sonnet' }]);
  });
});
