// T021 (031 US2, RED-first) — a backlog task's OPTIONAL parent-node ref: the
// roadmap node a task belongs to. Settable + readable via the backend's notes
// (a greppable linkage line mirroring the `**Promoted-to:**` precedent); absent
// ⇒ no ref (null). Exercises the REAL `backlog` binary against an isolated tmp
// project (fixtures on disk; never mock fs — .claude/rules/testing.md).

import { describe, expect, it } from 'vitest';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { readParentNode, setParentNode } from '../../src/backlog/parent-node.js';
import { tmpBacklog } from './helpers.js';

describe('031 backlog parent-node ref (T021)', () => {
  it('a freshly-created task has no parent-node ref (null)', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({ title: 'no ref', labels: ['agent-found', 'type:gap'] });
    expect(readParentNode(backend, id)).toBeNull();
  });

  it('setParentNode records a ref readable via readParentNode', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({ title: 'with ref', labels: ['agent-found', 'type:gap'] });
    setParentNode(backend, id, 'multi:feature/n');
    expect(readParentNode(backend, id)).toBe('multi:feature/n');
  });

  it('the linkage line carries the greppable Node: token in the task notes', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({ title: 'grep', labels: ['agent-found', 'type:gap'] });
    setParentNode(backend, id, 'impl:feature/x');
    expect(backend.readNotes(id)).toContain('Node:');
    expect(backend.readNotes(id)).toContain('impl:feature/x');
  });

  it('setting a ref preserves pre-existing notes (additive, like the promote linkage)', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    const id = backend.create({ title: 'preserve', labels: ['agent-found', 'type:gap'] });
    backend.edit(id, { appendNotes: 'an earlier note' });
    setParentNode(backend, id, 'design:feature/a');
    const notes = backend.readNotes(id);
    expect(notes).toContain('an earlier note');
    expect(readParentNode(backend, id)).toBe('design:feature/a');
  });
});
