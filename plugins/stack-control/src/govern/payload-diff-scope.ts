// 030 — committed-diff scoping (the FR-023 inclusion-based successor to the
// deleted exclusion-based composition plumbing). Scopes the governedSha..HEAD
// committed diff (the changed file set + per-file diff text) and folds untracked
// working-tree files into scope, producing a non-empty diffScope.files for a real
// committed-diff feature. Implemented in Phase 3 (T021).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The scoped diff: the changed file set + per-file diff text over governedSha..HEAD. */
export interface DiffScope {
  readonly base: string;
  readonly head: string;
  readonly files: readonly string[];
  readonly fileDiffs: ReadonlyMap<string, string>;
}

function git(root: string, args: readonly string[]): string {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    const detail = typeof r.stderr === 'string' ? r.stderr.trim() : (r.error?.message ?? 'unknown error');
    throw new Error(`govern: git ${args.join(' ')} failed in ${root}: ${detail}`);
  }
  return typeof r.stdout === 'string' ? r.stdout : '';
}

function lines(out: string): string[] {
  return out.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Scope the committed base..HEAD diff (plus untracked-fold) into an inclusion-based DiffScope. */
export function scopeCommittedDiff(installationRoot: string, base: string, head: string): DiffScope {
  const fileDiffs = new Map<string, string>();
  const files: string[] = [];

  for (const f of lines(git(installationRoot, ['diff', '--name-only', base, head]))) {
    fileDiffs.set(f, git(installationRoot, ['diff', base, head, '--', f]));
    files.push(f);
  }

  // Untracked-fold: working-tree files not yet committed are rendered as added-line diffs.
  for (const f of lines(git(installationRoot, ['ls-files', '--others', '--exclude-standard']))) {
    if (fileDiffs.has(f)) continue;
    const content = readFileSync(join(installationRoot, f), 'utf8');
    fileDiffs.set(f, content.split('\n').map((l) => `+${l}`).join('\n'));
    files.push(f);
  }

  return { base, head, files: files.sort(), fileDiffs };
}
