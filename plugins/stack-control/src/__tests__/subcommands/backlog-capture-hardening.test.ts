// 028 US2 T061 (RED-first) — `backlog capture` hardening (contract B4, FR-013):
//   1. Filename safety: a title past the OS filename limit captures CLEANLY
//      (no ENAMETOOLONG) — the on-disk filename is derived slugify+truncate
//      within OS limits, while the full title is preserved (TASK-299).
//   2. Dedupe by --ref: a repeat --ref reports the existing id and creates NO
//      duplicate (TASK-38), via backend.exists(ref).
// Drives the verb end-to-end against the REAL backlog binary on a tmp fixture.

import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, tmpBacklog } from '../../../tests/backlog/helpers.js';
import { createBacklogBackend } from '../../backlog/backend.js';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function tasksOf(root: string): string[] {
  return readdirSync(join(root, 'backlog', 'tasks')).filter((f) => f.endsWith('.md'));
}
function tmp(): string {
  const root = tmpBacklog();
  dirs.push(root);
  return root;
}

describe('028 B4 — capture filename safety (TASK-299: no ENAMETOOLONG)', () => {
  it('a title past the OS filename limit captures cleanly, full title preserved', () => {
    const root = tmp();
    const longTitle = 'This is an extremely long captured title '.repeat(20).trim(); // ~820 chars
    const r = runCli(['backlog', 'capture', longTitle, '--type', 'bug'], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/backlog capture: TASK-\d+/);

    // The on-disk filename is within the OS limit (255 bytes is the common cap).
    const files = tasksOf(root);
    expect(files).toHaveLength(1);
    expect(Buffer.byteLength(files[0]!, 'utf8')).toBeLessThanOrEqual(255);

    // The full title is preserved on the captured item (not lost to truncation).
    const item = createBacklogBackend({ cwd: root }).list()[0]!;
    expect(item.title).toBe(longTitle);
  });
});

describe('028 B4 — capture dedupe by --ref (TASK-38)', () => {
  it('a repeat --ref reports the existing id and creates no duplicate', () => {
    const root = tmp();
    const ref = 'https://github.com/audiocontrol-org/deskwork/issues/395';

    const first = runCli(['backlog', 'capture', 'first capture', '--type', 'bug', '--ref', ref], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(first.status).toBe(0);
    const id = /TASK-\d+/.exec(first.stdout)![0];
    expect(tasksOf(root)).toHaveLength(1);

    const second = runCli(['backlog', 'capture', 'second capture (same ref)', '--type', 'gap', '--ref', ref], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(second.status).toBe(0);
    // Reports the existing id; no duplicate created.
    expect(second.stdout).toContain(id);
    expect(second.stdout).toContain('already captured for ref');
    expect(tasksOf(root)).toHaveLength(1);
  });

  it('a capture WITHOUT --ref is never deduped (distinct items)', () => {
    const root = tmp();
    expect(runCli(['backlog', 'capture', 'one', '--type', 'bug'], { env: { STACKCTL_BACKLOG_DIR: root } }).status).toBe(0);
    expect(runCli(['backlog', 'capture', 'two', '--type', 'gap'], { env: { STACKCTL_BACKLOG_DIR: root } }).status).toBe(0);
    expect(tasksOf(root)).toHaveLength(2);
  });
});
