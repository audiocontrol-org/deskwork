// 023 T003 — `roadmap close-related <item>` end-to-end: terminal-gated, closes
// EXACTLY the recorded closes:/ref: ids via the real backlog backend, dry-run by
// default, fail-loud per id, idempotent. Drives the CLI against a real installation
// (roadmap + real backlog store) — never mocked.

import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';
import { createBacklogBackend, BACKLOG_DONE_STATUS } from '../../backlog/backend.js';
import { COMMITTED_CONFIG } from '../../../tests/backlog/helpers.js';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

interface Rig {
  readonly root: string;
  readonly backend: ReturnType<typeof createBacklogBackend>;
  statusOf(id: string): string | undefined;
}

/** A fresh installation: .stack-control/config.yaml + a real backlog store. */
function rig(): Rig {
  const root = mkdtempSync(join(tmpdir(), 'close-rel-'));
  dirs.push(root);
  mkdirSync(join(root, '.stack-control', 'backlog'), { recursive: true });
  writeFileSync(join(root, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  copyFileSync(COMMITTED_CONFIG, join(root, '.stack-control', 'backlog', 'config.yml'));
  const backend = createBacklogBackend({ cwd: join(root, '.stack-control') });
  return {
    root,
    backend,
    statusOf: (id) => backend.list().find((i) => i.id === id)?.status,
  };
}

function writeRoadmap(root: string, nodes: string): void {
  writeFileSync(join(root, 'ROADMAP.md'), `---\ndoc-grammar: roadmap\n---\n\n# Roadmap\n\n${nodes}`, 'utf8');
}

describe('023 roadmap close-related', () => {
  it('--apply closes exactly the recorded closes: ∪ ref: ids, and is idempotent', () => {
    const r = rig();
    const a = r.backend.create({ title: 'resolved A', labels: ['type:gap'] });
    const b = r.backend.create({ title: 'resolved B', labels: ['type:gap'] });
    const c = r.backend.create({ title: 'originating C', labels: ['type:gap'] });
    const bystander = r.backend.create({ title: 'unrelated', labels: ['type:gap'] });
    writeRoadmap(
      r.root,
      `## multi:feature/x\n\n- status: shipped\n- closes: ${a}, ${b}\n- ref: ${c}\n\nscope.\n`,
    );

    const apply = runCli(['roadmap', 'close-related', 'multi:feature/x', '--apply'], { cwd: r.root });
    expect(apply.status).toBe(0);
    expect(r.statusOf(a)).toBe(BACKLOG_DONE_STATUS);
    expect(r.statusOf(b)).toBe(BACKLOG_DONE_STATUS);
    expect(r.statusOf(c)).toBe(BACKLOG_DONE_STATUS); // the ref: id too
    expect(r.statusOf(bystander)).not.toBe(BACKLOG_DONE_STATUS); // never touched

    // Idempotent — re-running closes nothing new, reports already-closed.
    const again = runCli(['roadmap', 'close-related', 'multi:feature/x', '--apply'], { cwd: r.root });
    expect(again.status).toBe(0);
    expect(again.stdout).toMatch(/already closed/);
  });

  it('dry-run lists the would-close ids and writes nothing', () => {
    const r = rig();
    const a = r.backend.create({ title: 'A', labels: ['type:gap'] });
    writeRoadmap(r.root, `## multi:feature/x\n\n- status: shipped\n- closes: ${a}\n\nscope.\n`);
    const dry = runCli(['roadmap', 'close-related', 'multi:feature/x'], { cwd: r.root });
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/dry-run/);
    expect(dry.stdout).toContain(a);
    expect(r.statusOf(a)).not.toBe(BACKLOG_DONE_STATUS); // unchanged
  });

  it('refuses loud on a non-terminal item (FR-002)', () => {
    const r = rig();
    const a = r.backend.create({ title: 'A', labels: ['type:gap'] });
    writeRoadmap(r.root, `## multi:feature/x\n\n- status: planned\n- closes: ${a}\n\nscope.\n`);
    const res = runCli(['roadmap', 'close-related', 'multi:feature/x', '--apply'], { cwd: r.root });
    expect(res.status).toBe(2);
    expect(`${res.stderr}`).toMatch(/not a terminal status/);
    expect(r.statusOf(a)).not.toBe(BACKLOG_DONE_STATUS); // nothing closed
  });

  it('fails loud on an unknown recorded id, closing nothing (FR-006 — no fabricated success)', () => {
    const r = rig();
    const a = r.backend.create({ title: 'real', labels: ['type:gap'] });
    writeRoadmap(r.root, `## multi:feature/x\n\n- status: shipped\n- closes: ${a}, TASK-999999\n\nscope.\n`);
    const res = runCli(['roadmap', 'close-related', 'multi:feature/x', '--apply'], { cwd: r.root });
    expect(res.status).toBe(1);
    expect(`${res.stderr}`).toMatch(/unknown backlog id/);
    expect(r.statusOf(a)).not.toBe(BACKLOG_DONE_STATUS); // pre-flight refusal — nothing closed
  });

  it('reports nothing to close when no closes:/ref: is recorded', () => {
    const r = rig();
    writeRoadmap(r.root, `## multi:feature/x\n\n- status: shipped\n\nscope.\n`);
    const res = runCli(['roadmap', 'close-related', 'multi:feature/x', '--apply'], { cwd: r.root });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/no recorded resolved items/);
  });
});
