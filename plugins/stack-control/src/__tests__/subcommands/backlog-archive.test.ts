// 028 US2 T057 (RED-first) — `backlog archive <id>` (contract B2, FR-011).
// Preserve-not-delete: a terminal (`Done`) item is moved OUT of the live store
// while remaining READABLE (the project rule: "content databases preserve, they
// don't delete"). Non-terminal archive → exit 2; unknown id → exit 1; dry-run
// writes nothing. Drives the verb end-to-end against the REAL backlog binary on
// a tmp fixture (never mock the filesystem).

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, tmpBacklog } from '../../../tests/backlog/helpers.js';
import { createBacklogBackend } from '../../backlog/backend.js';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const LIVE = (root: string): string => join(root, 'backlog', 'tasks');
const ARCHIVE = (root: string): string => join(root, 'backlog', 'archive', 'tasks');

function liveFiles(root: string): string[] {
  return existsSync(LIVE(root)) ? readdirSync(LIVE(root)).filter((f) => f.endsWith('.md')) : [];
}
function archivedFiles(root: string): string[] {
  return existsSync(ARCHIVE(root)) ? readdirSync(ARCHIVE(root)).filter((f) => f.endsWith('.md')) : [];
}

/** A closed (terminal `Done`) item ready to archive. */
function doneItem(): { root: string; id: string } {
  const root = tmpBacklog();
  dirs.push(root);
  const backend = createBacklogBackend({ cwd: root });
  const id = backend.create({ title: 'finished work', labels: ['type:gap'] });
  backend.close(id);
  return { root, id };
}

describe('028 B2 — backlog archive dry-run (default)', () => {
  it('prints the would-archive line and leaves the live store untouched', () => {
    const { root, id } = doneItem();
    const before = liveFiles(root);
    const r = runCli(['backlog', 'archive', id], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`backlog archive: dry-run — would archive ${id}`);
    expect(r.stdout).toContain('use --apply');
    expect(liveFiles(root)).toEqual(before);
    expect(archivedFiles(root)).toEqual([]);
  });
});

describe('028 B2 — backlog archive --apply (preserve-not-delete)', () => {
  it('moves the Done item out of the live store while keeping it readable', () => {
    const { root, id } = doneItem();
    expect(liveFiles(root)).toHaveLength(1);

    const r = runCli(['backlog', 'archive', id, '--apply'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`backlog archive: archived ${id} (preserved)`);

    // Relocated OUT of the live store …
    expect(liveFiles(root)).toEqual([]);
    expect(createBacklogBackend({ cwd: root }).list().find((i) => i.id === id)).toBeUndefined();

    // … but PRESERVED: the record is still on disk AND still readable.
    const archived = archivedFiles(root);
    expect(archived).toHaveLength(1);
    const body = readFileSync(join(ARCHIVE(root), archived[0]!), 'utf8');
    expect(body).toContain(id);
    expect(body).toContain('finished work');
  });
});

describe('028 B2 — backlog archive usage + runtime exit codes', () => {
  it('archiving a non-terminal (not Done) item → exit 2', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const id = createBacklogBackend({ cwd: root }).create({ title: 'still open', labels: ['type:bug'] });
    const r = runCli(['backlog', 'archive', id, '--apply'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(2);
    // nothing relocated
    expect(liveFiles(root)).toHaveLength(1);
    expect(archivedFiles(root)).toEqual([]);
  });

  it('missing <id> → exit 2', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const r = runCli(['backlog', 'archive'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(2);
  });

  it('unknown id → exit 1 (never a silent no-op)', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const r = runCli(['backlog', 'archive', 'TASK-999999', '--apply'], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(r.status).toBe(1);
  });
});
