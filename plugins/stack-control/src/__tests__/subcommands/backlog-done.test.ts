// 028 US2 T055 (RED-first) — `backlog done <id> --reason <r>` (contract B1,
// FR-010). The ONE terminal-closure mechanism: dry-run prints the would-close
// line; `--apply` routes through the backend closure (status → `Done` via
// backend.close); missing/empty `--reason` → exit 2; unknown id → exit 1.
// Drives the verb end-to-end against the REAL backlog binary on a tmp fixture
// (never mock the filesystem — .claude/rules/testing.md).

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { runCli, tmpBacklog } from '../../../tests/backlog/helpers.js';
import { BACKLOG_DONE_STATUS, createBacklogBackend } from '../../backlog/backend.js';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function fresh(): { root: string; id: string } {
  const root = tmpBacklog();
  dirs.push(root);
  const id = createBacklogBackend({ cwd: root }).create({ title: 'a closable item', labels: ['type:bug'] });
  return { root, id };
}

describe('028 B1 — backlog done dry-run (default)', () => {
  it('prints the would-close line and leaves status unchanged', () => {
    const { root, id } = fresh();
    const r = runCli(['backlog', 'done', id, '--reason', 'fixed in TASK-42'], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`backlog done: dry-run — would close ${id} (reason: fixed in TASK-42)`);
    expect(r.stdout).toContain('use --apply');
    // status untouched
    const item = createBacklogBackend({ cwd: root }).list().find((i) => i.id === id)!;
    expect(item.status).not.toBe(BACKLOG_DONE_STATUS);
  });
});

describe('028 B1 — backlog done --apply', () => {
  it('routes through the backend closure (status → Done) and prints closed line', () => {
    const { root, id } = fresh();
    const r = runCli(['backlog', 'done', id, '--reason', 'wontfix', '--apply'], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`backlog done: closed ${id} (reason: wontfix)`);
    const item = createBacklogBackend({ cwd: root }).list().find((i) => i.id === id)!;
    expect(item.status).toBe(BACKLOG_DONE_STATUS);
  });

  it('persists the closure reason to the task notes on disk (TASK-297)', () => {
    const { root, id } = fresh();
    const r = runCli(['backlog', 'done', id, '--reason', 'resolved by TASK-42', '--apply'], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(r.status).toBe(0);
    // The rationale is not just printed — it lands in the durable task file so a
    // future reader sees WHY the item was closed (TASK-297 regression guard).
    const notes = createBacklogBackend({ cwd: root }).readNotes(id);
    expect(notes).toContain('resolved by TASK-42');
  });
});

describe('028 B1 — backlog done usage + runtime exit codes', () => {
  it('missing <id> → exit 2', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const r = runCli(['backlog', 'done', '--reason', 'x'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(2);
  });

  it('missing --reason → exit 2', () => {
    const { root, id } = fresh();
    const r = runCli(['backlog', 'done', id], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(2);
  });

  it('empty --reason → exit 2', () => {
    const { root, id } = fresh();
    const r = runCli(['backlog', 'done', id, '--reason', ''], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(2);
  });

  it('unknown id → exit 1 (never a fabricated close)', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const r = runCli(['backlog', 'done', 'TASK-999999', '--reason', 'x', '--apply'], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(r.status).toBe(1);
  });
});
