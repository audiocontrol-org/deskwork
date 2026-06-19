// 028 US2 T063/T064 (FR-018; contract B5). `roadmap close-related` and
// `backlog done` route through ONE closure mechanism (backend.close) — both drive
// a backlog item to the SAME terminal BACKLOG_DONE_STATUS. Drives the real CLI
// against a real installation (never mocked).

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

function rig() {
  const root = mkdtempSync(join(tmpdir(), 'shared-closure-'));
  dirs.push(root);
  mkdirSync(join(root, '.stack-control', 'backlog'), { recursive: true });
  writeFileSync(join(root, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  copyFileSync(COMMITTED_CONFIG, join(root, '.stack-control', 'backlog', 'config.yml'));
  const backend = createBacklogBackend({ cwd: join(root, '.stack-control') });
  const statusOf = (id: string): string | undefined => backend.list().find((i) => i.id === id)?.status;
  return { root, backend, statusOf };
}

describe('028 shared terminal-closure mechanism (B5)', () => {
  it('`backlog done` and `roadmap close-related` drive an item to the SAME Done status', () => {
    const r = rig();

    // (1) backlog done — direct closure (installation resolved via cwd).
    const viaDone = r.backend.create({ title: 'closed via done', labels: ['type:gap'] });
    const done = runCli(['backlog', 'done', viaDone, '--reason', 'finished', '--apply'], { cwd: r.root });
    expect(done.status, done.stderr).toBe(0);
    expect(r.statusOf(viaDone)).toBe(BACKLOG_DONE_STATUS);

    // (2) roadmap close-related — closure of a recorded resolved id.
    const viaRelated = r.backend.create({ title: 'closed via close-related', labels: ['type:gap'] });
    writeFileSync(
      join(r.root, 'ROADMAP.md'),
      `---\ndoc-grammar: roadmap\n---\n\n# Roadmap\n\n## multi:feature/x\n\n- status: shipped\n- closes: ${viaRelated}\n\nscope.\n`,
      'utf8',
    );
    const related = runCli(['roadmap', 'close-related', 'multi:feature/x', '--apply'], { cwd: r.root });
    expect(related.status, related.stderr).toBe(0);

    // Both paths reach the SAME terminal status — one closure mechanism.
    expect(r.statusOf(viaRelated)).toBe(BACKLOG_DONE_STATUS);
    expect(r.statusOf(viaRelated)).toBe(r.statusOf(viaDone));
  });
});
