// T005/T007 (RED-first, Foundational, 012) — the record-only promote writer.
// Against the REAL backlog store on a tmp fixture (never mock the filesystem).
// Asserts: apply records the `promoted` label + a `Promoted-to:` linkage line
// and PRESERVES existing labels/refs/body (FR-013); dry-run writes nothing
// (contract tests 1, 2); and the idempotency guard refuses an already-promoted
// item with zero write (contract test 7, FR-006).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { parseTarget } from '../../src/backlog/promote-targets.js';
import {
  promote,
  PromoteAlreadyPromotedError,
  PromoteItemMissingError,
} from '../../src/backlog/promote.js';
import { tmpBacklog } from './helpers.js';

function snapshotTasks(cwd: string): string {
  const dir = join(cwd, 'backlog', 'tasks');
  return readdirSync(dir)
    .sort()
    .map((f) => `${f}::${readFileSync(join(dir, f), 'utf8')}`)
    .join('\n');
}

function taskFileFor(cwd: string, id: string): string {
  const dir = join(cwd, 'backlog', 'tasks');
  const n = id.replace('TASK-', '');
  const file = readdirSync(dir).find((f) => f.startsWith(`task-${n} -`))!;
  return readFileSync(join(dir, file), 'utf8');
}

describe('promote writer — apply records linkage, preserves fields (T005, contract 2)', () => {
  it('adds the promoted label + Promoted-to bullet and preserves labels/refs', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({
      title: 'a found gap',
      labels: ['agent-found', 'type:gap'],
      refs: ['gh-7'],
    });

    const res = promote({
      ids: [id],
      target: parseTarget('spec:specs/012-backlog-promotion-seam'),
      apply: true,
      backend,
      cwd,
    });

    expect(res.applied).toBe(true);
    expect(res.recorded).toEqual([id]);

    const file = taskFileFor(cwd, id);
    expect(file).toMatch(/labels:[\s\S]*promoted/);
    expect(file).toMatch(/labels:[\s\S]*agent-found/); // preserved (FR-013)
    expect(file).toMatch(/labels:[\s\S]*type:gap/); // preserved
    expect(file).toMatch(/references:[\s\S]*gh-7/); // preserved
    expect(file).toContain('**Promoted-to:** spec:specs/012-backlog-promotion-seam');
  });
});

describe('promote writer — dry-run writes nothing (T005, contract 1)', () => {
  it('reports the intended linkage but leaves the store byte-identical', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({ title: 'a found bug', labels: ['agent-found', 'type:bug'] });

    const before = snapshotTasks(cwd);
    const res = promote({
      ids: [id],
      target: parseTarget('roadmap:impl:feature/execution-engine'),
      apply: false,
      backend,
      cwd,
    });

    expect(res.applied).toBe(false);
    expect(res.recorded).toEqual([id]);
    expect(res.targetRef).toBe('roadmap:impl:feature/execution-engine');
    expect(snapshotTasks(cwd)).toBe(before);
  });
});

describe('promote writer — fail-loud + idempotency guard (T007, contract 3/7)', () => {
  it('a non-existent item throws PromoteItemMissingError with zero write', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    backend.create({ title: 'present', labels: ['agent-found', 'type:gap'] });
    const before = snapshotTasks(cwd);

    expect(() =>
      promote({
        ids: ['TASK-999'],
        target: parseTarget('spec:specs/012-x'),
        apply: true,
        backend,
        cwd,
      }),
    ).toThrow(PromoteItemMissingError);
    expect(snapshotTasks(cwd)).toBe(before);
  });

  it('re-promoting an already-promoted item is refused with zero write (FR-006)', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({ title: 'item', labels: ['agent-found', 'type:gap'] });
    promote({ ids: [id], target: parseTarget('spec:specs/012-x'), apply: true, backend, cwd });

    const afterFirst = snapshotTasks(cwd);
    expect(() =>
      promote({ ids: [id], target: parseTarget('roadmap:design:gap/other'), apply: true, backend, cwd }),
    ).toThrow(PromoteAlreadyPromotedError);
    expect(snapshotTasks(cwd)).toBe(afterFirst); // the second promote wrote nothing
  });
});
