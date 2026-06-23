// T019 (031 US2, RED-first) — the `roadmap resolves` verb wired into the CLI
// (mirrors edge-subactions-cli.test.ts). Records resolved backlog ids onto a
// node's PROSE `closes:` set without a hand-edit and without misusing the
// unit-edge machinery (which correctly refuses `closes`). Dry-run by default;
// `--apply` writes. `--add`/`--remove` each accept ONE OR MORE space-separated
// ids per contracts/roadmap-resolves.md. Neither flag → exit 1 (fail-loud).
// Unknown node → fail-loud. `add-edge <node> closes …` STILL refuses (prose).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { ROADMAP_OPTS, writeTempRoadmap } from '../../../tests/roadmap/helpers.js';

const NODE = ['## multi:feature/n', '- status: shipped'];

function closesOf(docPath: string, id: string): readonly string[] {
  return loadRoadmap(docPath, ROADMAP_OPTS).byId.get(id)!.closes;
}

describe('031 roadmap resolves (T019)', () => {
  it('--add multi-id dry-run prints before→after and writes NOTHING', () => {
    const doc = writeTempRoadmap(NODE);
    const before = readFileSync(doc, 'utf8');
    const r = runCli(['roadmap', 'resolves', 'multi:feature/n', '--add', 'TASK-7', 'TASK-8', '--doc', doc]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/closes:\s*\(none\)\s*->\s*TASK-7, TASK-8|closes:\s*\(none\)\s*→\s*TASK-7, TASK-8/);
    expect(readFileSync(doc, 'utf8')).toBe(before); // dry-run wrote nothing
  });

  it('--add --apply writes the closes set', () => {
    const doc = writeTempRoadmap(NODE);
    const r = runCli(['roadmap', 'resolves', 'multi:feature/n', '--add', 'TASK-7', 'TASK-8', '--doc', doc, '--apply']);
    expect(r.status, r.stderr).toBe(0);
    expect(closesOf(doc, 'multi:feature/n')).toEqual(['TASK-7', 'TASK-8']);
  });

  it('--remove --apply removes one id, leaving the rest', () => {
    const doc = writeTempRoadmap(['## multi:feature/n', '- status: shipped', '- closes: TASK-7, TASK-8']);
    const r = runCli(['roadmap', 'resolves', 'multi:feature/n', '--remove', 'TASK-7', '--doc', doc, '--apply']);
    expect(r.status, r.stderr).toBe(0);
    expect(closesOf(doc, 'multi:feature/n')).toEqual(['TASK-8']);
  });

  it('add-edge <node> closes … STILL refuses (prose field, not a unit edge) → exit 2', () => {
    const doc = writeTempRoadmap(NODE);
    const before = readFileSync(doc, 'utf8');
    const r = runCli(['roadmap', 'add-edge', 'multi:feature/n', '--field', 'closes', '--to', 'TASK-7', '--doc', doc, '--apply']);
    expect(r.status).toBe(2);
    expect(readFileSync(doc, 'utf8')).toBe(before);
  });

  it('neither --add nor --remove → exit 1 (fail-loud)', () => {
    const doc = writeTempRoadmap(NODE);
    const r = runCli(['roadmap', 'resolves', 'multi:feature/n', '--doc', doc]);
    expect(r.status).toBe(1);
  });

  it('unknown node → fail-loud (non-zero exit)', () => {
    const doc = writeTempRoadmap(NODE);
    const r = runCli(['roadmap', 'resolves', 'multi:feature/nope', '--add', 'TASK-7', '--doc', doc]);
    expect(r.status).not.toBe(0);
  });

  it('resolves has a working --help (exit 0 + usage body)', () => {
    const r = runCli(['roadmap', 'resolves', '--help']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Usage: stackctl roadmap');
  });
});
