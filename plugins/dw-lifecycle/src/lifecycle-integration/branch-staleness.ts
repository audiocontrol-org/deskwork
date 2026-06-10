// Phase 28 Task 1 — pure-fn library for session-start branch-staleness
// detection.
//
// Closes #422. Pre-merge early-warning surface that lets the operator
// notice a long-stale feature branch at session boot instead of
// re-implementing work already on main. Distinct cure-shape from #413
// (the post-merge bookkeeping portfolio); the two cures compose.
//
// Pure function over a DI bag (gitFetch + gitLogCount). The CLI verb
// (subcommands/branch-staleness-check.ts) supplies the
// `execFileSync('git', ...)` wrappers; tests supply mocks or a
// real-git fixture's local `git rev-list --count` invocation. The
// helper itself stays git-implementation-free.
//
// Boundary contract: `behind <= threshold` → no nudge (inclusive).
// `behind > threshold` → nudge. Threshold value comes from the caller
// (CLI flag or config); the helper has no default of its own.

export interface BranchStalenessSnapshot {
  readonly branch: string;
  readonly remoteRef: string;
  readonly behind: number;
  readonly threshold: number;
  readonly nudgeRequired: boolean;
}

export interface BranchStalenessDeps {
  readonly gitFetch: (remote: string, branch: string) => void;
  readonly gitLogCount: (branch: string, remoteRef: string) => number;
}

export interface DetectBranchStalenessArgs {
  readonly branch: string;
  readonly upstreamRemote: string;
  readonly upstreamBranch: string;
  readonly threshold: number;
  readonly fetch: boolean;
}

export function detectBranchStaleness(
  args: DetectBranchStalenessArgs,
  deps: BranchStalenessDeps,
): BranchStalenessSnapshot {
  const { branch, upstreamRemote, upstreamBranch, threshold, fetch } = args;
  const remoteRef = upstreamRemote === '' ? upstreamBranch : `${upstreamRemote}/${upstreamBranch}`;
  if (fetch) {
    deps.gitFetch(upstreamRemote, upstreamBranch);
  }
  const behind = deps.gitLogCount(branch, remoteRef);
  return {
    branch,
    remoteRef,
    behind,
    threshold,
    nudgeRequired: behind > threshold,
  };
}
