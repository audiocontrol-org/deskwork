// src/__tests__/workplan.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkplan, markStepDone } from '../workplan.js';

const fixture = readFileSync(join(__dirname, 'fixtures/workplan-sample.md'), 'utf8');

describe('workplan', () => {
  it('parses tasks and steps', () => {
    const wp = parseWorkplan(fixture);
    expect(wp.tasks).toHaveLength(2);
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
});
