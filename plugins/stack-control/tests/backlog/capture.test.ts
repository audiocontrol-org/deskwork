// T011 (RED-first, US1, 008) — one-move capture via the verb + the REAL binary.
// Asserts the MVP contract: capture stamps type+label+ref and applies NO
// priority/triage (capture ≠ scope, FR-003); bad input is refused fail-loud with
// nothing written; ROADMAP.md and pre-existing items are left byte-identical
// (FR-004/FR-006).

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from './helpers.js';

function runCapture(args: string[], dir: string) {
  return runCli(['backlog', 'capture', ...args], { env: { STACKCTL_BACKLOG_DIR: dir } });
}
function tasksOf(dir: string): string[] {
  return readdirSync(join(dir, 'backlog', 'tasks')).filter((f) => f.endsWith('.md'));
}

describe('stackctl backlog capture (US1, T011)', () => {
  it('capture with --type + --ref → exit 0, item present with type/label/ref', () => {
    const dir = tmpBacklog();
    const ref = 'https://github.com/audiocontrol-org/deskwork/issues/395';
    const r = runCapture(['doctor validate exceeds line cap', '--type', 'bug', '--ref', ref], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/TASK-\d+/);

    const items = createBacklogBackend({ cwd: dir }).list();
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe('bug');
    expect(items[0]!.labels).toContain('agent-found');
    expect(items[0]!.refs).toContain(ref);
  });

  it('a plain capture applies NO priority/triage (capture ≠ scope, FR-003)', () => {
    const dir = tmpBacklog();
    runCapture(['something found mid-task', '--type', 'gap'], dir);
    const file = tasksOf(dir)[0]!;
    const fm = readFileSync(join(dir, 'backlog', 'tasks', file), 'utf8');
    expect(fm).not.toMatch(/^priority:/im);
  });

  it('empty title → exit 2, nothing written', () => {
    const dir = tmpBacklog();
    const r = runCapture(['', '--type', 'bug'], dir);
    expect(r.status).toBe(2);
    expect(createBacklogBackend({ cwd: dir }).list()).toHaveLength(0);
  });

  it('invalid --type → exit 2, nothing written', () => {
    const dir = tmpBacklog();
    const r = runCapture(['x', '--type', 'nonsense'], dir);
    expect(r.status).toBe(2);
    expect(createBacklogBackend({ cwd: dir }).list()).toHaveLength(0);
  });

  it('ROADMAP.md is left byte-for-byte unchanged (FR-004)', () => {
    const dir = tmpBacklog();
    const roadmap = join(dir, 'ROADMAP.md');
    writeFileSync(roadmap, '# Roadmap\n\ncurated sentinel\n');
    const before = readFileSync(roadmap, 'utf8');
    expect(runCapture(['x', '--type', 'bug'], dir).status).toBe(0);
    expect(readFileSync(roadmap, 'utf8')).toBe(before);
  });

  it('capturing a 2nd item leaves the 1st byte-identical (FR-006)', () => {
    const dir = tmpBacklog();
    expect(runCapture(['first thread', '--type', 'bug', '--ref', 'gh-1'], dir).status).toBe(0);
    const tasksDir = join(dir, 'backlog', 'tasks');
    const firstFile = tasksOf(dir)[0]!;
    const firstBefore = readFileSync(join(tasksDir, firstFile), 'utf8');
    expect(runCapture(['second thread', '--type', 'gap'], dir).status).toBe(0);
    expect(readFileSync(join(tasksDir, firstFile), 'utf8')).toBe(firstBefore);
  });
});
