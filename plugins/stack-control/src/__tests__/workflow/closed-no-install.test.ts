// T035 (031 US4, RED-first) — SC-005: an installation with NO release/install
// configuration takes an item from `shipped` to `closed` with NOTHING blocking it
// (FR-017/FR-018, quickstart Scenario H). This is the END-TO-END pair to
// `install-agnostic.test.ts`'s STRUCTURAL assertion: there is no install config,
// no release step, no publish-dependent task — and `roadmap advance --to closed
// --apply` still reaches `closed` and exits 0.
//
// Mirrors the full-installation fixture from `backlog-autobacklink.test.ts`: a
// `.stack-control/config.yaml` + a backlog store + a `ROADMAP.md` at root, with
// NO release/install configuration anywhere. Drives the REAL CLI from cwd = the
// installation root. Fixtures on disk; never mock fs (.claude/rules/testing.md).

import { describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBacklogBackend } from '../../backlog/backend.js';
import { runCli } from '../_run-helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, '..', '..', '..');
const COMMITTED_BACKLOG_CONFIG = resolve(PLUGIN_ROOT, '.stack-control', 'backlog', 'config.yml');

/** A full installation fixture with NO release/install configuration: just
 * `.stack-control/config.yaml`, a backlog store, and a `ROADMAP.md`. */
function makeInstallationNoRelease(nodeLines: readonly string[]): {
  root: string;
  backlogCwd: string;
  roadmap: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'closed-no-install-'));
  const stackDir = join(root, '.stack-control');
  mkdirSync(join(stackDir, 'backlog'), { recursive: true });
  // config.yaml carries NO release/publish/install block — only the version.
  writeFileSync(join(stackDir, 'config.yaml'), 'version: 1\n', 'utf8');
  copyFileSync(COMMITTED_BACKLOG_CONFIG, join(stackDir, 'backlog', 'config.yml'));
  const roadmap = join(root, 'ROADMAP.md');
  const src = ['---', 'doc-grammar: roadmap', '---', '', '# roadmap', '', ...nodeLines, ''].join('\n');
  writeFileSync(roadmap, src, 'utf8');
  return { root, backlogCwd: stackDir, roadmap };
}

/** The recorded roadmap status of a node, read from the on-disk doc. */
function roadmapStatusOf(doc: string, id: string): string | null {
  const lines = readFileSync(doc, 'utf8').split('\n');
  const head = lines.findIndex((l) => l.trim() === `## ${id}`);
  if (head < 0) return null;
  for (let i = head + 1; i < lines.length; i++) {
    if (lines[i]!.trim().startsWith('## ')) break;
    const m = /^\s*-\s+status\s*:\s*(\S+)/.exec(lines[i]!);
    if (m !== null) return m[1]!;
  }
  return null;
}

describe('031 closed reachable with NO install/release step (T035, SC-005; 032 validated marker)', () => {
  it('a shipped+validated item advances to closed with no install/release machinery — exit 0, status closed', () => {
    // 032 FR-014: close is gated on the operator-confirm `validated:` marker — a BARE
    // confirm, NOT an install/release step. The no-install-MACHINERY invariant holds:
    // no release config, no publish-dependent task — just the recorded confirm marker.
    const inst = makeInstallationNoRelease(['## multi:feature/done', '- status: shipped', '- validated: 2026-06-23']);
    // Sanity: this installation has a backlog store but no release config.
    expect(createBacklogBackend({ cwd: inst.backlogCwd }).list()).toEqual([]);

    const r = runCli(
      ['roadmap', 'advance', 'multi:feature/done', '--to', 'closed', '--apply'],
      { cwd: inst.root },
    );

    expect(r.status, r.stderr).toBe(0);
    expect(roadmapStatusOf(inst.roadmap, 'multi:feature/done')).toBe('closed');
  });

  it('closing an item whose closes: ids are all present succeeds with no release step', () => {
    // A terminal item recording one resolved backlog id, no release config: the
    // cascade closes the id and the item reaches closed — install-agnostic.
    const inst = makeInstallationNoRelease([
      '## multi:feature/withids',
      '- status: shipped',
      '- validated: 2026-06-23',
      '- closes: PLACEHOLDER',
    ]);
    const backend = createBacklogBackend({ cwd: inst.backlogCwd });
    const id = backend.create({ title: 'resolved work', labels: ['agent-found', 'type:gap'] });
    // Record the real id on the node's closes: set.
    writeFileSync(
      inst.roadmap,
      readFileSync(inst.roadmap, 'utf8').replace('PLACEHOLDER', id),
      'utf8',
    );

    const r = runCli(
      ['roadmap', 'advance', 'multi:feature/withids', '--to', 'closed', '--apply'],
      { cwd: inst.root },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(roadmapStatusOf(inst.roadmap, 'multi:feature/withids')).toBe('closed');
  });
});
