import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * TASK-116 — test fixtures must be hermetic: a throwaway git repo created in a
 * tmpdir inherits the host's GLOBAL git config, including `commit.gpgsign=true`
 * (operator setup). In keyless CI there is no signing key, so any fixture that
 * commits without disabling signing fails with "failed to write commit object".
 *
 * The hermetic harness (`_setup-hermetic-git.ts`, wired via vitest setupFiles)
 * neutralizes the host global/system config for the whole test run, so this
 * test asserts the property behaviorally: a fresh repo can commit even when the
 * signing program is deliberately broken (the deterministic stand-in for
 * "keyless CI"). If signing were still required, the broken program would make
 * the commit fail.
 */
describe('hermetic git fixtures (TASK-116)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function freshRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hermetic-git-'));
    dirs.push(dir);
    const init = spawnSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf8' });
    expect(init.status).toBe(0);
    return dir;
  }

  it('a throwaway repo commits without a signing key (keyless-CI safe)', () => {
    const dir = freshRepo();
    // Do NOT disable gpgsign locally — rely on the hermetic harness. Force a
    // signing program that cannot exist; if signing were on, commit would fail.
    const res = spawnSync(
      'git',
      ['-C', dir, '-c', 'gpg.program=/nonexistent-signer', 'commit', '--allow-empty', '-q', '-m', 'seed'],
      { encoding: 'utf8' },
    );
    expect(res.stderr).not.toMatch(/failed to write commit object/);
    expect(res.status).toBe(0);
  });

  it('the hermetic harness reports commit.gpgsign=false for a fresh repo', () => {
    const dir = freshRepo();
    const res = spawnSync('git', ['-C', dir, 'config', '--get', 'commit.gpgsign'], { encoding: 'utf8' });
    expect(res.stdout.trim()).toBe('false');
  });
});
