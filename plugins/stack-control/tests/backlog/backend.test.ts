// T005 (RED-first, Foundational, 008) — the typed backlog adapter against the
// REAL `backlog` binary (testing rule: never mock the filesystem; exercise the
// adapter + real-backend boundary). Asserts Constitution Principle V (fail-loud):
// a missing binary and a non-zero backend exit both throw descriptive errors;
// and the happy-path create/list/exists contract the verb depends on.

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBacklogBackend, BacklogError } from '../../src/backlog/backend.js';
import { tmpBacklog } from './helpers.js';

describe('backlog backend adapter — fail-loud (T005, Principle V)', () => {
  it('a missing binary throws a descriptive error naming the dependency + remediation', () => {
    const backend = createBacklogBackend({
      cwd: tmpBacklog(),
      binaryPath: '/nonexistent/path/to/backlog',
    });
    let thrown: unknown;
    try {
      backend.create({ title: 'x', labels: ['agent-found', 'type:bug'] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BacklogError);
    expect((thrown as Error).message).toMatch(/backlog\.md/);
    expect((thrown as Error).message).toMatch(/install/i);
  });

  it('a non-zero backend exit surfaces stderr and throws (no silent no-op)', () => {
    // A dir with NO backlog/config.yml → the real binary exits non-zero.
    const noProject = mkdtempSync(join(tmpdir(), 'backlog-noproj-'));
    const backend = createBacklogBackend({ cwd: noProject });
    let thrown: unknown;
    try {
      backend.create({ title: 'x', labels: ['agent-found', 'type:bug'] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BacklogError);
    expect((thrown as Error).message).toMatch(/backlog/i);
  });
});

describe('backlog backend adapter — create/list/exists (T005)', () => {
  it('create returns the parsed new item id', () => {
    const backend = createBacklogBackend({ cwd: tmpBacklog() });
    const id = backend.create({
      title: 'doctor validate exceeds line cap',
      labels: ['agent-found', 'type:bug'],
      refs: ['gh-395'],
    });
    expect(id).toMatch(/^TASK-\d+$/);
  });

  it('list returns the created items with id, status, type (from the type: label), labels, refs', () => {
    const cwd = tmpBacklog();
    const backend = createBacklogBackend({ cwd });
    backend.create({ title: 'first item', labels: ['agent-found', 'type:bug'], refs: ['gh-1'] });
    backend.create({ title: 'second item', labels: ['agent-found', 'type:gap'] });

    const items = backend.list();
    expect(items).toHaveLength(2);

    const first = items.find((i) => i.refs.includes('gh-1'));
    expect(first).toBeDefined();
    expect(first!.id).toMatch(/^TASK-\d+$/);
    expect(first!.status).toBe('To Do');
    expect(first!.type).toBe('bug');
    expect(first!.labels).toContain('agent-found');

    const second = items.find((i) => i.type === 'gap');
    expect(second).toBeDefined();
    expect(second!.refs).toHaveLength(0);
  });

  it('exists(ref) reports presence (drives import idempotency)', () => {
    const backend = createBacklogBackend({ cwd: tmpBacklog() });
    backend.create({ title: 'has a ref', labels: ['agent-found', 'type:imported-issue'], refs: ['gh-395'] });
    expect(backend.exists('gh-395')).toBe(true);
    expect(backend.exists('gh-999')).toBe(false);
  });
});
