import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './_run-helpers.js';

// VR-2 / R5 isolation guard (T028): the governance extension was rehomed OUT of
// dw-lifecycle into stack-control (T018, git mv). There must be NO inbound
// coupling left — no file under dw-lifecycle's runtime dirs may reference the
// moved extension (`deskwork-governance`) or a `spec-kit/` path. This guards the
// move stayed clean across future edits; a re-introduced reference fails the
// suite, not a code review. (Surfaces the isolation invariant as a falsifiable
// test rather than a one-shot grep.)
describe('dw-lifecycle isolation from the rehomed governance extension (T028 / VR-2)', () => {
  const repoRoot = join(PLUGIN_ROOT, '..', '..');
  // T028's scoped runtime dirs: dw-lifecycle must not reach into the moved tree.
  const RUNTIME_DIRS = ['src', 'bin', 'commands', 'skills'].map((d) =>
    join('plugins', 'dw-lifecycle', d),
  );

  it('has no inbound reference to the moved extension or any spec-kit/ path', () => {
    const present = RUNTIME_DIRS.filter((d) => existsSync(join(repoRoot, d)));
    expect(present.length).toBeGreaterThan(0); // the dirs we mean to guard exist

    // grep -rn over the present dirs; exit 1 == no match (the success case).
    const r = spawnSync(
      'grep',
      ['-rnE', 'deskwork-governance|spec-kit/', ...present],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    // grep: 0 = matches found (FAIL), 1 = no match (PASS), >=2 = error.
    if (r.status === 0) {
      throw new Error(
        `dw-lifecycle still references the rehomed extension:\n${r.stdout}`,
      );
    }
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
  });

  it('the old governance source path no longer exists under dw-lifecycle', () => {
    expect(
      existsSync(join(repoRoot, 'plugins', 'dw-lifecycle', 'spec-kit', 'deskwork-governance')),
    ).toBe(false);
  });

  // specs/015-audit-protocol-convergence — T035 (FR-012, succession isolation):
  // this feature's convergence work lives ENTIRELY in stack-control; the
  // dw-lifecycle barrage copy is not touched. A git-diff-against-a-base check is
  // brittle (a stale base SHA fails to resolve in a fresh clone — the
  // refactor-preconditions lesson), so the durable form is: dw-lifecycle's
  // runtime must never reference any of this feature's NEW stack-control modules.
  // A re-introduced reference (coupling) fails this test, not a code review.
  it('dw-lifecycle does not reference any 015 convergence module (FR-012 isolation)', () => {
    const present = RUNTIME_DIRS.filter((d) => existsSync(join(repoRoot, d)));
    expect(present.length).toBeGreaterThan(0);
    const NEW_015_MODULES = [
      'cluster-severity',
      'adjudicate-findings',
      'convergence-loop',
      'convergence-types',
    ].join('|');
    const r = spawnSync('grep', ['-rnE', NEW_015_MODULES, ...present], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (r.status === 0) {
      throw new Error(`dw-lifecycle references a stack-control 015 module:\n${r.stdout}`);
    }
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
  });
});
