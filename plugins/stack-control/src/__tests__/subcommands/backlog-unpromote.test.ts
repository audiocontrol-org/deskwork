// 028 US2 T059 (RED-first) — `backlog unpromote <id>` (contract B3, FR-012).
// The inverse of `promote`: removes the promotion linkage `promote` recorded
// (the `promoted` label + the `Promoted-to:` notes line). An item with no
// promotion linkage → exit 2 (nothing to unpromote); unknown id → exit 1;
// dry-run writes nothing. Drives the verb end-to-end against the REAL backlog
// binary on a tmp fixture (never mock the filesystem).

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, tmpBacklog } from '../../../tests/backlog/helpers.js';
import { createBacklogBackend } from '../../backlog/backend.js';
import { parseTarget } from '../../backlog/promote-targets.js';
import { promote } from '../../backlog/promote.js';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function taskFileFor(root: string, id: string): string {
  const dir = join(root, 'backlog', 'tasks');
  const n = id.replace('TASK-', '');
  const file = readdirSync(dir).find((f) => f.startsWith(`task-${n} -`))!;
  return readFileSync(join(dir, file), 'utf8');
}

/** A promoted item ready to unpromote. */
function promotedItem(): { root: string; id: string } {
  const root = tmpBacklog();
  dirs.push(root);
  const backend = createBacklogBackend({ cwd: root });
  const id = backend.create({ title: 'a promoted gap', labels: ['agent-found', 'type:gap'] });
  promote({ ids: [id], target: parseTarget('spec:specs/012-x'), apply: true, backend, cwd: root });
  return { root, id };
}

describe('028 B3 — backlog unpromote dry-run (default)', () => {
  it('prints the would-remove line and leaves the linkage in place', () => {
    const { root, id } = promotedItem();
    const r = runCli(['backlog', 'unpromote', id], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`backlog unpromote: dry-run — would remove promotion linkage on ${id}`);
    expect(r.stdout).toContain('use --apply');
    // linkage still present
    const file = taskFileFor(root, id);
    // Word-bounded so a future label merely CONTAINING "promoted" can't satisfy it
    // (AUDIT-BARRAGE-claude-08).
    expect(file).toMatch(/labels:[\s\S]*\bpromoted\b/);
    expect(file).toContain('**Promoted-to:**');
  });
});

describe('028 B3 — backlog unpromote --apply (inverse of promote)', () => {
  it('removes the promoted label AND the Promoted-to linkage line', () => {
    const { root, id } = promotedItem();
    const r = runCli(['backlog', 'unpromote', id, '--apply'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`backlog unpromote: removed promotion linkage on ${id}`);

    const file = taskFileFor(root, id);
    expect(file).not.toMatch(/labels:[\s\S]*\bpromoted\b/);
    expect(file).not.toContain('**Promoted-to:**');
    // other labels preserved
    expect(file).toMatch(/labels:[\s\S]*agent-found/);
    expect(file).toMatch(/labels:[\s\S]*type:gap/);
  });

  it('does NOT erase notes when the item has the promoted label but no Promoted-to line', () => {
    // Data-loss regression (AUDIT-BARRAGE-claude-01, HIGH): a label-only item
    // (promoted label + other notes, NO Promoted-to: line) must keep its notes —
    // unpromote must NOT write `--notes ''` and wipe them.
    const root = tmpBacklog();
    dirs.push(root);
    const backend = createBacklogBackend({ cwd: root });
    const id = backend.create({ title: 'label-only promoted', labels: ['agent-found', 'type:gap'] });
    backend.edit(id, { addLabel: 'promoted' });
    backend.edit(id, { appendNotes: 'IMPORTANT operator note that must survive' });
    const r = runCli(['backlog', 'unpromote', id, '--apply'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(0);
    const file = taskFileFor(root, id);
    expect(file).not.toMatch(/labels:[\s\S]*\bpromoted\b/); // label removed
    expect(file).toContain('IMPORTANT operator note that must survive'); // notes NOT erased
  });
});

describe('028 B3 — backlog unpromote usage + runtime exit codes', () => {
  it('an item with no promotion linkage → exit 2 (nothing to unpromote)', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const id = createBacklogBackend({ cwd: root }).create({
      title: 'never promoted',
      labels: ['agent-found', 'type:bug'],
    });
    const r = runCli(['backlog', 'unpromote', id, '--apply'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(2);
  });

  it('missing <id> → exit 2', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const r = runCli(['backlog', 'unpromote'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(2);
  });

  it('unknown id → exit 1 (never a fabricated removal)', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const r = runCli(['backlog', 'unpromote', 'TASK-999999', '--apply'], {
      env: { STACKCTL_BACKLOG_DIR: root },
    });
    expect(r.status).toBe(1);
  });
});
