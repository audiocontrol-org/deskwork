// 033 T009 — the tasks.md `[tier:]` parser (data-model TieredTask).
//
// RED-first: pure syntactic extraction of {id, tierLabel, body, done, lineNumber}
// from real tasks.md lines; ignores [P]/[USn]/phase-headers/non-checkbox prose;
// collects ALL parse errors (dup id, missing id, missing body, empty [tier:]) with
// no first-error abort (FR-006).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTieredTasks } from '../../execute/tasks-tier-parser.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('tasks-tier-parser (033 T009)', () => {
  it('extracts id, tierLabel, body, done; ignores [P]/[USn] tags in the body', () => {
    const md = '- [ ] T001 [P] [US1] [tier:fast] RED test: parser extracts the tag — in src/x.ts\n';
    const { tasks, errors } = parseTieredTasks(md);
    expect(errors).toEqual([]);
    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t?.id).toBe('T001');
    expect(t?.tierLabel).toBe('fast');
    expect(t?.done).toBe(false);
    expect(t?.lineNumber).toBe(1);
    expect(t?.body).toBe('RED test: parser extracts the tag — in src/x.ts');
  });

  it('marks a [x]/[X] checkbox as done and leaves an untiered task tierLabel undefined', () => {
    const md = ['- [x] T010 [US1] An already-complete task — in src/y.ts', '- [ ] T011 A task with no tier tag — in src/z.ts'].join('\n');
    const { tasks, errors } = parseTieredTasks(md);
    expect(errors).toEqual([]);
    expect(tasks[0]?.done).toBe(true);
    expect(tasks[0]?.tierLabel).toBe(undefined);
    expect(tasks[1]?.tierLabel).toBe(undefined);
    expect(tasks[1]?.done).toBe(false);
  });

  it('ignores phase headers, format bullets, and other non-task-checkbox lines', () => {
    const md = [
      '# Tasks: fixture',
      '## Phase 1: Setup',
      '- **[P]**: parallelizable',
      'Some prose line.',
      '- [ ] T001 [tier:fast] Real task — in src/a.ts',
      '**Checkpoint**: done.',
    ].join('\n');
    const { tasks, errors } = parseTieredTasks(md);
    expect(errors).toEqual([]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('T001');
  });

  it('collects parse errors together (dup id, missing id, missing body, empty [tier:])', () => {
    const md = [
      '- [ ] T001 [tier:fast] ok — in src/a.ts',
      '- [ ] T001 [tier:fast] duplicate id — in src/b.ts',
      '- [ ] [tier:fast] checkbox with no T-id',
      '- [ ] T003 [P] [tier:fast]',
      '- [ ] T004 [tier:] empty tier tag — in src/d.ts',
    ].join('\n');
    const { errors } = parseTieredTasks(md);
    const joined = errors.map((e) => e.message).join('\n');
    expect(joined).toMatch(/duplicate/i);
    expect(joined).toMatch(/missing id|no.*id/i);
    expect(joined).toMatch(/T003.*body|missing body/i);
    expect(joined).toMatch(/empty.*tier|T004/i);
    // No first-error abort — every distinct error surfaces.
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it('excludes an empty-[tier:] task from tasks[] and reports it exactly once (AUDIT-20260629-01)', () => {
    // A malformed `[tier:]` declaration is a parse error; the task must be EXCLUDED from
    // tasks[] (like missing-id/missing-body) so resolution does not ALSO emit a no-tier
    // error for the same task — one problem, one error.
    const md = '- [ ] T004 [tier:] empty tier tag — in src/d.ts\n';
    const { tasks, errors } = parseTieredTasks(md);
    expect(tasks.find((t) => t.id === 'T004')).toBeUndefined();
    const t004 = errors.filter((e) => e.message.includes('T004'));
    expect(t004).toHaveLength(1);
    expect(t004[0]?.category).toBe('empty-tier');
  });

  it('parses the canonical valid fixture (3 tasks, correct tiers + done flags)', () => {
    const md = readFileSync(join(FIXTURES, 'valid-tasks.md'), 'utf8');
    const { tasks, errors } = parseTieredTasks(md);
    expect(errors).toEqual([]);
    expect(tasks.map((t) => [t.id, t.tierLabel, t.done])).toEqual([
      ['T001', 'fast', false],
      ['T002', 'balanced', false],
      ['T003', 'powerful', true],
    ]);
  });
});
