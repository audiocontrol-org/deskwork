// T023 (031 US2, RED-first) — auto-back-link on `backlog done` (FR-011): closing
// a task that carries a parent-node ref to node N adds the task id into node N's
// PROSE `closes:` set (via the closes-mutation engine). A task with NO ref →
// closed, NO back-link, NO error (no-op). A ref to a NON-EXISTENT node →
// fail-loud. Auto-back-link is idempotent.
//
// Exercises the REAL CLI + REAL backlog binary + REAL installation resolution: a
// full installation fixture (`.stack-control/config.yaml` + `.stack-control/
// backlog/config.yml` store + `ROADMAP.md` at root) so the back-link resolves
// the roadmap doc through `resolved.roadmap`, NOT a faked path. Run from cwd =
// installation root with NO STACKCTL_BACKLOG_DIR seam (the seam can't carry a
// roadmap path) so installation resolution supplies BOTH stores.
// Fixtures on disk; never mock fs (.claude/rules/testing.md).

import { describe, expect, it } from 'vitest';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBacklogBackend, BACKLOG_DONE_STATUS } from '../backlog/backend.js';
import { setParentNode } from '../backlog/parent-node.js';
import { loadRoadmap } from '../roadmap/roadmap-model.js';
import { runCli } from './_run-helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, '..', '..');
const COMMITTED_BACKLOG_CONFIG = resolve(PLUGIN_ROOT, '.stack-control', 'backlog', 'config.yml');
const BUILTIN_GRAMMAR_DIR = resolve(PLUGIN_ROOT, 'grammars');
const ROADMAP_OPTS = { builtinGrammarDir: BUILTIN_GRAMMAR_DIR };

/** A full installation fixture: `.stack-control/config.yaml`, a backlog store at
 * `.stack-control/backlog`, and a `ROADMAP.md` at root with the given node lines.
 * Returns the installation root, its backlog cwd, and the roadmap doc path. */
function makeInstallation(nodeLines: readonly string[]): {
  root: string;
  backlogCwd: string;
  roadmap: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'autobacklink-'));
  const stackDir = join(root, '.stack-control');
  mkdirSync(join(stackDir, 'backlog'), { recursive: true });
  writeFileSync(join(stackDir, 'config.yaml'), 'version: 1\n', 'utf8');
  copyFileSync(COMMITTED_BACKLOG_CONFIG, join(stackDir, 'backlog', 'config.yml'));
  const roadmap = join(root, 'ROADMAP.md');
  const src = ['---', 'doc-grammar: roadmap', '---', '', '# roadmap', '', ...nodeLines, ''].join('\n');
  writeFileSync(roadmap, src, 'utf8');
  // The backlog binary runs with cwd = the store's parent (the `.stack-control` dir).
  return { root, backlogCwd: stackDir, roadmap };
}

function closesOf(roadmap: string, id: string): readonly string[] {
  return loadRoadmap(roadmap, ROADMAP_OPTS).byId.get(id)!.closes;
}

describe('031 backlog done auto-back-link (T023)', () => {
  it('done of a task with a parent-node ref adds its id to the node closes: set', () => {
    const inst = makeInstallation(['## multi:feature/n', '- status: shipped']);
    const backend = createBacklogBackend({ cwd: inst.backlogCwd });
    const id = backend.create({ title: 'fix the thing', labels: ['agent-found', 'type:gap'] });
    setParentNode(backend, id, 'multi:feature/n');

    const r = runCli(['backlog', 'done', id, '--apply', '--reason', 'fixed'], { cwd: inst.root });
    expect(r.status, r.stderr).toBe(0);
    // The task is closed.
    expect(backend.list().find((i) => i.id === id)!.status).toBe(BACKLOG_DONE_STATUS);
    // AND node N's closes: now contains the task id (auto-back-link).
    expect(closesOf(inst.roadmap, 'multi:feature/n')).toContain(id);
  });

  it('done of a task with NO parent-node ref → closed, no back-link, no error', () => {
    const inst = makeInstallation(['## multi:feature/n', '- status: shipped']);
    const backend = createBacklogBackend({ cwd: inst.backlogCwd });
    const id = backend.create({ title: 'no ref', labels: ['agent-found', 'type:gap'] });

    const r = runCli(['backlog', 'done', id, '--apply', '--reason', 'fixed'], { cwd: inst.root });
    expect(r.status, r.stderr).toBe(0);
    expect(backend.list().find((i) => i.id === id)!.status).toBe(BACKLOG_DONE_STATUS);
    // No node gained the id (the node's closes is empty).
    expect(closesOf(inst.roadmap, 'multi:feature/n')).not.toContain(id);
  });

  it('a ref to a NON-EXISTENT node → fail-loud (non-zero exit)', () => {
    const inst = makeInstallation(['## multi:feature/n', '- status: shipped']);
    const backend = createBacklogBackend({ cwd: inst.backlogCwd });
    const id = backend.create({ title: 'bad ref', labels: ['agent-found', 'type:gap'] });
    setParentNode(backend, id, 'multi:feature/does-not-exist');

    const r = runCli(['backlog', 'done', id, '--apply', '--reason', 'fixed'], { cwd: inst.root });
    expect(r.status).not.toBe(0);
  });

  it('a bad parent-node ref fails BEFORE closing the task — no Done-but-unlinked (AUDIT-20260623-04)', () => {
    const inst = makeInstallation(['## multi:feature/n', '- status: shipped']);
    const backend = createBacklogBackend({ cwd: inst.backlogCwd });
    const id = backend.create({ title: 'atomic close', labels: ['agent-found', 'type:gap'] });
    setParentNode(backend, id, 'multi:feature/does-not-exist');

    const r = runCli(['backlog', 'done', id, '--apply', '--reason', 'fixed'], { cwd: inst.root });
    expect(r.status).not.toBe(0);
    // The back-link is preflighted BEFORE the backlog mutation, so a failure leaves
    // the task un-closed (NOT 'Done' with a missing link) — the operator fixes the
    // ref and retries against a clean state.
    expect(backend.list().find((i) => i.id === id)!.status).not.toBe(BACKLOG_DONE_STATUS);
  });

  it('auto-back-link is idempotent (an already-present id is a no-op, exit 0)', () => {
    const inst = makeInstallation(['## multi:feature/n', '- status: shipped', '- closes: PLACEHOLDER']);
    const backend = createBacklogBackend({ cwd: inst.backlogCwd });
    const id = backend.create({ title: 'idem', labels: ['agent-found', 'type:gap'] });
    setParentNode(backend, id, 'multi:feature/n');

    // First close adds the id.
    const r1 = runCli(['backlog', 'done', id, '--apply', '--reason', 'fixed'], { cwd: inst.root });
    expect(r1.status, r1.stderr).toBe(0);
    expect(closesOf(inst.roadmap, 'multi:feature/n')).toContain(id);
    // Re-running done (already Done) still exits 0; the id is not duplicated.
    const r2 = runCli(['backlog', 'done', id, '--apply', '--reason', 'again'], { cwd: inst.root });
    expect(r2.status, r2.stderr).toBe(0);
    const closes = closesOf(inst.roadmap, 'multi:feature/n');
    expect(closes.filter((c) => c === id).length).toBe(1);
  });

  it('an unwritable roadmap fails done BEFORE the task is closed — no Done-but-unlinked (AUDIT-20260623-09)', () => {
    const inst = makeInstallation(['## multi:feature/n', '- status: shipped']);
    const backend = createBacklogBackend({ cwd: inst.backlogCwd });
    const id = backend.create({ title: 'write-fail', labels: ['agent-found', 'type:gap'] });
    setParentNode(backend, id, 'multi:feature/n'); // node EXISTS — preflight would pass; the WRITE is what fails
    // The roadmap lives at <root>/ROADMAP.md; making <root> unwritable blocks the
    // atomic temp+rename closes: write while leaving the deeper backlog store writable.
    chmodSync(inst.root, 0o555);
    try {
      const r = runCli(['backlog', 'done', id, '--apply', '--reason', 'fixed'], { cwd: inst.root });
      expect(r.status).not.toBe(0);
      // The back-link (roadmap write) happens BEFORE the close, so a write failure
      // leaves the task NOT closed — never Done-but-unlinked.
      expect(backend.list().find((i) => i.id === id)!.status).not.toBe(BACKLOG_DONE_STATUS);
    } finally {
      chmodSync(inst.root, 0o755);
    }
  });
});
