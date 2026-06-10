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
  PromotePartialWriteError,
} from '../../src/backlog/promote.js';
import { BacklogError, type BacklogBackend, type EditSpec } from '../../src/backlog/backend.js';
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

// AUDIT-BARRAGE claude-01 ≡ codex-02 (cross-model): the per-item write loop is
// not transactional. A mid-batch backend.edit() failure cannot be made all-or-
// nothing through the shelled backlog.md CLI (D6 owns the format; there is no
// multi-task atomic edit). The honest contract: preflight is all-or-nothing;
// once writing begins, a backend failure is fail-loud AND must name exactly
// which ids were already written so the operator retries only the remainder
// (the idempotency guard makes that re-run safe).
describe('promote writer — mid-batch write failure is fail-loud + names written ids (AUDIT claude-01/codex-02)', () => {
  /** A backend that delegates to the real one but throws on edit(failId). */
  function failingOn(real: BacklogBackend, failId: string): BacklogBackend {
    return {
      create: (s) => real.create(s),
      list: () => real.list(),
      exists: (r) => real.exists(r),
      edit: (id: string, spec: EditSpec) => {
        if (id === failId) throw new BacklogError(`simulated backend failure on ${id}`);
        real.edit(id, spec);
      },
    };
  }

  it('surfaces PromotePartialWriteError naming the items already written when a later edit fails', () => {
    const cwd = tmpBacklog();
    const real = createBacklogBackend({ cwd });
    const a = real.create({ title: 'a', labels: ['agent-found', 'type:gap'] });
    const b = real.create({ title: 'b', labels: ['agent-found', 'type:gap'] });

    let thrown: unknown;
    try {
      promote({
        ids: [a, b],
        target: parseTarget('tasks:specs/008-backlog-surface'),
        apply: true,
        backend: failingOn(real, b), // a writes; b fails mid-loop
        cwd,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(PromotePartialWriteError);
    expect((thrown as PromotePartialWriteError).written).toEqual([a]); // a was committed
    expect((thrown as Error).message).toContain(a); // recovery: names what landed
    // a is genuinely promoted on disk; b is not — the real partial state, surfaced honestly
    expect(taskFileFor(cwd, a)).toMatch(/labels:[\s\S]*promoted/);
    expect(taskFileFor(cwd, b)).not.toMatch(/labels:[\s\S]*promoted/);
  });
});
