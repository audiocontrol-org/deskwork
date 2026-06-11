// T004a (RED-first, Foundational, 012) — the backend `edit()` mutation path
// (resolves analyze finding A1, D6). The backend had only create/list/exists;
// promote needs an ADDITIVE label + notes write that preserves existing labels,
// refs, and body (FR-013). Exercised against the REAL `backlog` binary on a tmp
// store (testing rule: never mock the filesystem).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from './helpers.js';

function readTaskFile(cwd: string, id: string): string {
  const tasksDir = join(cwd, 'backlog', 'tasks');
  const file = readdirSync(tasksDir).find((f) => f.startsWith(`task-${id.replace('TASK-', '')} -`));
  if (file === undefined) throw new Error(`no task file for ${id} in ${tasksDir}`);
  return readFileSync(join(tasksDir, file), 'utf8');
}

describe('backlog backend edit() — additive, field-preserving (T004a, D6/A1)', () => {
  it('adds a label and appends a notes line, preserving existing labels/refs', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({
      title: 'an imported finding',
      labels: ['agent-found', 'type:gap'],
      refs: ['gh-7'],
    });

    backend.edit(id, { addLabel: 'promoted', appendNotes: '- **Promoted-to:** spec:specs/012-x' });

    const after = readTaskFile(cwd, id);
    // additive label — the new one is present AND the originals survive
    expect(after).toMatch(/labels:[\s\S]*agent-found/);
    expect(after).toMatch(/labels:[\s\S]*type:gap/);
    expect(after).toMatch(/labels:[\s\S]*promoted/);
    // refs preserved (FR-013)
    expect(after).toMatch(/references:[\s\S]*gh-7/);
    // the linkage line landed in the body verbatim, greppable on `Promoted-to:`
    expect(after).toContain('**Promoted-to:** spec:specs/012-x');

    // and the projection sees the new label without losing the others
    const item = backend.list().find((i) => i.id === id);
    expect(item).toBeDefined();
    expect(item!.labels).toEqual(expect.arrayContaining(['agent-found', 'type:gap', 'promoted']));
    expect(item!.refs).toContain('gh-7');
  });

  it('a non-existent id fails loud (BacklogError via non-zero backend exit)', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    expect(() => backend.edit('TASK-999', { addLabel: 'promoted' })).toThrow();
  });
});
