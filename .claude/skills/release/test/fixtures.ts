import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RigOptions {
  /** Branch name to check out in the local repo. Default: 'feature/test'. */
  readonly branch?: string;
  /** Initial main commit message. Default: 'init main'. */
  readonly initialMainMessage?: string;
}

export interface Rig {
  /** Absolute path of the tmp local repo (the test acts here). */
  readonly localPath: string;
  /** Absolute path of the tmp bare remote. */
  readonly remotePath: string;
  /** Run a shell command inside the local repo. */
  readonly sh: (cmd: string) => string;
  /** Cleanup — call from afterEach. */
  readonly cleanup: () => void;
}

/**
 * Build a rigged git environment:
 *   - bare remote at <tmp>/remote.git
 *   - local clone at <tmp>/local
 *   - one commit on `main`
 *   - feature branch checked out and tracking origin/<branch>
 *
 * Each helper test mutates the rig (commits, pushes, dirties) to set up
 * its specific scenario.
 */
export function createRig(opts: RigOptions = {}): Rig {
  const branch = opts.branch ?? 'feature/test';
  const initialMessage = opts.initialMainMessage ?? 'init main';
  const root = mkdtempSync(join(tmpdir(), 'release-skill-rig-'));
  const remotePath = join(root, 'remote.git');
  const localPath = join(root, 'local');

  // Bare remote.
  execSync(`git init --bare --initial-branch=main "${remotePath}"`, { stdio: 'pipe' });

  // Local repo + initial main commit.
  execSync(`git init --initial-branch=main "${localPath}"`, { stdio: 'pipe' });
  const sh = (cmd: string): string =>
    execSync(cmd, { cwd: localPath, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  sh(`git config user.email "rig@example.com"`);
  sh(`git config user.name "Rig User"`);
  writeFileSync(join(localPath, 'README.md'), '# rig\n');
  sh(`git add README.md`);
  sh(`git commit -m "${initialMessage}"`);
  sh(`git remote add origin "${remotePath}"`);
  sh(`git push -u origin main`);

  // Feature branch tracking remote.
  sh(`git checkout -b ${branch}`);
  sh(`git push -u origin ${branch}`);

  return {
    localPath,
    remotePath,
    sh,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
