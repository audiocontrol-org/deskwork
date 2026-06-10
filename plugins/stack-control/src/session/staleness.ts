// 011 T028 — branch-staleness advisory (research D3). Resolves the base
// (upstream-else-default-branch via git.ts), compares ahead/behind, and returns
// an advisory signal that NEVER blocks the session: behind → surface a count;
// level/ahead → current; base undeterminable or comparison impossible (detached
// HEAD) → a clean skip with a reason (FR-016/FR-017). A named skip, never a
// fabricated "you're current" (Principle V).

import { aheadBehind, resolveBase } from './git.js';

export type StalenessSignal =
  | { readonly kind: 'behind'; readonly base: string; readonly behindCount: number }
  | { readonly kind: 'current' }
  | { readonly kind: 'skipped'; readonly reason: string };

export function checkStaleness(cwd: string): StalenessSignal {
  const base = resolveBase(cwd);
  if (base.kind === 'undeterminable') {
    return { kind: 'skipped', reason: base.reason };
  }
  let ab;
  try {
    ab = aheadBehind(cwd, base.base);
  } catch {
    return { kind: 'skipped', reason: `cannot compare against ${base.base} (detached HEAD or missing ref)` };
  }
  if (ab.behind > 0) {
    return { kind: 'behind', base: base.base, behindCount: ab.behind };
  }
  return { kind: 'current' };
}
