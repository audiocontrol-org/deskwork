// gh-pr-state — cross-references branch names against PR state via `gh`.
//
// One `gh pr list --state all` per scan; client-side filter by headRefName.
// Cheaper than one query per branch and matches debt-report's gh-issues
// scanner pattern.

import type { RunGh } from '../debt-report/types.js';
import type { PrState } from './types.js';

export interface GhPr {
  readonly number: number;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
  readonly headRefName: string;
}

export function gatherPrStates(runGh: RunGh, branches: readonly string[]): Map<string, GhPr> {
  const byBranch = new Map<string, GhPr>();
  if (branches.length === 0) return byBranch;
  let raw: string;
  try {
    raw = runGh([
      'pr', 'list',
      '--state', 'all',
      '--limit', '500',
      '--json', 'number,state,headRefName',
    ]);
  } catch {
    return byBranch;
  }
  let parsed: GhPr[];
  try {
    parsed = JSON.parse(raw) as GhPr[];
  } catch {
    return byBranch;
  }
  for (const pr of parsed) {
    if (!byBranch.has(pr.headRefName)) {
      byBranch.set(pr.headRefName, pr);
    }
  }
  return byBranch;
}

export function prStateFor(gh: GhPr | undefined): PrState {
  if (gh === undefined) return 'no-pr';
  if (gh.state === 'OPEN') return 'open';
  if (gh.state === 'MERGED') return 'merged';
  if (gh.state === 'CLOSED') return 'closed';
  return 'unknown';
}
