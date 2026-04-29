// src/__tests__/workplan.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkplan, markStepDone } from '../workplan.js';

const fixture = readFileSync(join(__dirname, 'fixtures/workplan-sample.md'), 'utf8');

describe('workplan', () => {
  it('parses tasks and steps', () => {
    const wp = parseWorkplan(fixture);
    expect(wp.tasks).toHaveLength(3);
    expect(wp.tasks[0].title).toBe('Task 1: First thing');
    expect(wp.tasks[0].steps[0]).toEqual({ done: false, text: 'Step 1: do thing' });
    expect(wp.tasks[1].steps[0]).toEqual({ done: true, text: 'Step 1: already done' });
  });

  it('marks a step done idempotently', () => {
    const out1 = markStepDone(fixture, { task: 'Task 1: First thing', step: 'Step 1: do thing' });
    const out2 = markStepDone(out1, { task: 'Task 1: First thing', step: 'Step 1: do thing' });
    expect(out1).toBe(out2);
    const wp = parseWorkplan(out1);
    expect(wp.tasks[0].steps[0].done).toBe(true);
  });

  it('preserves untouched content byte-identical', () => {
    const out = markStepDone(fixture, { task: 'Task 1: First thing', step: 'Step 1: do thing' });
    const diff = out.split('\n').filter((line, i) => line !== fixture.split('\n')[i]);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toContain('[x] Step 1: do thing');
  });

  it('parses bold step text without asterisks', () => {
    const wp = parseWorkplan(fixture);
    const boldTask = wp.tasks[2];
    expect(boldTask.title).toBe('Task 3: Bold steps');
    expect(boldTask.steps[0]).toEqual({ done: false, text: 'Step 1: bold thing' });
    expect(boldTask.steps[1]).toEqual({ done: true, text: 'Step 2: bold done' });
  });

  it('marks bold step idempotently', () => {
    const out1 = markStepDone(fixture, {
      task: 'Task 3: Bold steps',
      step: 'Step 1: bold thing',
    });
    const out2 = markStepDone(out1, {
      task: 'Task 3: Bold steps',
      step: 'Step 1: bold thing',
    });
    expect(out1).toBe(out2);
    const wp = parseWorkplan(out1);
    expect(wp.tasks[2].steps[0].done).toBe(true);
  });

  it('preserves bold formatting on rewrite', () => {
    const out = markStepDone(fixture, {
      task: 'Task 3: Bold steps',
      step: 'Step 1: bold thing',
    });
    const fixtureLines = fixture.split('\n');
    const outLines = out.split('\n');
    const diff = outLines.filter((line, i) => line !== fixtureLines[i]);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toBe('- [x] **Step 1: bold thing**');
  });

  it('throws when task is missing', () => {
    expect(() =>
      markStepDone(fixture, { task: 'NoSuchTask', step: 'Step 1: do thing' }),
    ).toThrow(/Task not found in workplan: NoSuchTask/);
  });

  it('throws when step is missing in existing task', () => {
    expect(() =>
      markStepDone(fixture, { task: 'Task 1: First thing', step: 'NoSuchStep' }),
    ).toThrow(/Step not found in task "Task 1: First thing": NoSuchStep/);
  });
});
