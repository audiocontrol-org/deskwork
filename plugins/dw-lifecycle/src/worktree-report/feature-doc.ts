// Filesystem probes for feature-doc location + orphan-directory detection.
//
// Convention: docs/<version>/{001-IN-PROGRESS,003-COMPLETE}/<slug>/.
// Branch shape `feature/<slug>` → look for <slug>.

import { join } from 'node:path';
import type { FeatureDocLocation } from './types.js';

export function detectFeatureDoc(
  projectRoot: string,
  branch: string | null,
  statDir: (path: string) => boolean,
  readDir: (path: string) => readonly string[],
): FeatureDocLocation {
  if (branch === null) return { location: 'none' };
  const slugCandidate = branch.startsWith('feature/')
    ? branch.slice('feature/'.length)
    : branch;
  const docsRoot = join(projectRoot, 'docs');
  if (!statDir(docsRoot)) return { location: 'none' };
  let versions: readonly string[];
  try {
    versions = readDir(docsRoot);
  } catch {
    return { location: 'none' };
  }
  for (const version of versions) {
    const inProgressDir = join(docsRoot, version, '001-IN-PROGRESS', slugCandidate);
    if (statDir(inProgressDir)) {
      return { location: 'in-progress', slug: slugCandidate, targetVersion: version };
    }
    const completeDir = join(docsRoot, version, '003-COMPLETE', slugCandidate);
    if (statDir(completeDir)) {
      return { location: 'complete', slug: slugCandidate, targetVersion: version };
    }
  }
  return { location: 'none' };
}

export function findOrphanDirs(
  worktreeBase: string,
  registeredPaths: ReadonlySet<string>,
  readDir: (path: string) => readonly string[],
  statDir: (path: string) => boolean,
  /**
   * Predicate: does the path's `.git` look like an orphaned-worktree
   * pointer? A linked worktree's `.git` is a FILE (gitdir: pointer
   * into `.git/worktrees/<name>` of the main repo). A standalone git
   * repo's `.git` is a DIRECTORY. We want to flag the former when
   * its pointed-to admin dir is gone (manually-deleted worktree
   * admin, leaving the path stranded on disk).
   *
   * A simpler heuristic the scan layer hands in (when available):
   * `.git` exists as a file at the path AND `.git/HEAD` does NOT
   * exist (HEAD lives in the admin dir, so if it's missing the
   * worktree admin is gone). Sibling project-repos (where `.git` is
   * a directory) fail the first part of the heuristic.
   */
  isOrphanedWorktreePath: (path: string) => boolean = () => false,
): string[] {
  if (worktreeBase.length === 0 || !statDir(worktreeBase)) return [];
  let children: readonly string[];
  try {
    children = readDir(worktreeBase);
  } catch {
    return [];
  }
  const orphans: string[] = [];
  for (const child of children) {
    const full = join(worktreeBase, child);
    if (!statDir(full)) continue;
    if (registeredPaths.has(full)) continue;
    if (child.startsWith('.')) continue;
    if (!isOrphanedWorktreePath(full)) continue;
    orphans.push(full);
  }
  return orphans;
}
