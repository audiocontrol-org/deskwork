import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RigOptions {
  readonly branch?: string;
  readonly initialMainMessage?: string;
}

export interface Rig {
  readonly localPath: string;
  readonly remotePath: string;
  readonly sh: (cmd: string) => string;
  readonly cleanup: () => void;
}

export function createReleaseRig(opts: RigOptions = {}): Rig {
  const branch = opts.branch ?? 'feature/test';
  const initialMessage = opts.initialMainMessage ?? 'init main';
  const root = mkdtempSync(join(tmpdir(), 'release-skill-rig-'));
  const remotePath = join(root, 'remote.git');
  const localPath = join(root, 'local');

  execSync(`git init --bare --initial-branch=main "${remotePath}"`, { stdio: 'pipe' });
  execSync(`git init --initial-branch=main "${localPath}"`, { stdio: 'pipe' });
  const sh = (cmd: string): string =>
    execSync(cmd, { cwd: localPath, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  sh(`git config user.email "rig@example.com"`);
  sh(`git config user.name "Rig User"`);
  sh(`git config commit.gpgsign false`);
  sh(`git config tag.gpgsign false`);
  writeFileSync(join(localPath, 'README.md'), '# rig\n');
  sh(`git add README.md`);
  sh(`git commit -m "${initialMessage}"`);
  sh(`git remote add origin "${remotePath}"`);
  sh(`git push -u origin main`);
  sh(`git checkout -b ${branch}`);
  sh(`git push -u origin ${branch}`);

  return {
    localPath,
    remotePath,
    sh,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
