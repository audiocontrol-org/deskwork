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
    orphans.push(full);
  }
  return orphans;
}
