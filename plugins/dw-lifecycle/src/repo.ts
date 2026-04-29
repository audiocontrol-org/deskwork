import { execSync } from 'node:child_process';
import { basename } from 'node:path';

export function repoRoot(cwd: string = process.cwd()): string {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not inside a git repository.');
  }
}

export function repoBasename(cwd: string = process.cwd()): string {
  return basename(repoRoot(cwd));
}

export function currentBranch(cwd: string = process.cwd()): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
}

export function expandWorktreeName(template: string, slug: string, cwd: string = process.cwd()): string {
  return template.replace('<repo>', repoBasename(cwd)).replace('<slug>', slug);
}
