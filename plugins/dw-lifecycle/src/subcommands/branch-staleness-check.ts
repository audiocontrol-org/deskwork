// Phase 28 Task 2 — CLI subcommand for the session-start branch-staleness
// advisory. Closes #422.
//
// Wraps the pure-fn at lifecycle-integration/branch-staleness.ts with
// `execFileSync('git', ...)` for the fetch + log-count operations.
// Reads `config.session.start.branchStalenessThreshold` from
// .dw-lifecycle/config.json when --threshold is absent; falls back to
// the verb default (5).
//
// Argv:
//   --threshold N      (optional; override config + verb default)
//   --no-fetch         (skip the `git fetch <remote> <branch>` call)
//   --json             (machine-readable output)
//   --remote <ref>     (e.g. 'origin/main'; default 'origin/main')
//
// Exit 0 always — advisory only; never refuses to start the session.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_RELATIVE_PATH, loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import {
  detectBranchStaleness,
  type BranchStalenessDeps,
} from '../lifecycle-integration/branch-staleness.js';

const DEFAULT_THRESHOLD = 5;
const DEFAULT_REMOTE_REF = 'origin/main';

export interface BranchStalenessCheckCliOptions {
  readonly threshold: number | null;
  readonly fetch: boolean;
  readonly json: boolean;
  readonly remoteRef: string;
}

export function parseBranchStalenessCheckArgs(
  args: readonly string[],
): BranchStalenessCheckCliOptions {
  let threshold: number | null = null;
  let fetch = true;
  let json = false;
  let remoteRef = DEFAULT_REMOTE_REF;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--threshold': {
        const next = args[++i];
        if (next === undefined) throw new Error('--threshold requires a value.');
        const parsed = parseInt(next, 10);
        if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== next.trim()) {
          throw new Error(`--threshold must be a non-negative integer; got '${next}'.`);
        }
        threshold = parsed;
        break;
      }
      case '--no-fetch':
        fetch = false;
        break;
      case '--json':
        json = true;
        break;
      case '--remote': {
        const next = args[++i];
        if (next === undefined) throw new Error('--remote requires a value.');
        if (!next.includes('/')) {
          throw new Error(
            `--remote must be of the form '<remote>/<branch>' (e.g. 'origin/main'); got '${next}'.`,
          );
        }
        remoteRef = next;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return { threshold, fetch, json, remoteRef };
}

function splitRemoteRef(remoteRef: string): { remote: string; branch: string } {
  const slashIdx = remoteRef.indexOf('/');
  // parser guarantees a '/' is present.
  return {
    remote: remoteRef.slice(0, slashIdx),
    branch: remoteRef.slice(slashIdx + 1),
  };
}

function resolveThreshold(cliThreshold: number | null, root: string): number {
  if (cliThreshold !== null) return cliThreshold;
  const configPath = join(root, CONFIG_RELATIVE_PATH);
  if (!existsSync(configPath)) return DEFAULT_THRESHOLD;
  try {
    const cfg = loadConfig(root);
    return cfg.session.start.branchStalenessThreshold ?? DEFAULT_THRESHOLD;
  } catch {
    // Malformed config — fall back to default rather than blocking the advisory.
    return DEFAULT_THRESHOLD;
  }
}

function currentBranch(root: string): string {
  return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function makeRealGitDeps(root: string): BranchStalenessDeps {
  return {
    gitFetch: (remote: string, branch: string): void => {
      execFileSync('git', ['fetch', remote, branch], {
        cwd: root,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    },
    gitLogCount: (branch: string, remoteRef: string): number => {
      const out = execFileSync(
        'git',
        ['rev-list', '--count', `${branch}..${remoteRef}`],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      return parseInt(out.trim(), 10);
    },
  };
}

export async function branchStalenessCheck(rawArgs: string[]): Promise<void> {
  const opts = parseBranchStalenessCheckArgs(rawArgs);
  const root = repoRoot();
  const threshold = resolveThreshold(opts.threshold, root);
  let branch: string;
  try {
    branch = currentBranch(root);
  } catch {
    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify({
          branch: null,
          remoteRef: opts.remoteRef,
          behind: null,
          threshold,
          nudgeRequired: false,
          error: 'detached-head-or-not-a-git-repo',
        })}\n`,
      );
    } else {
      process.stdout.write(
        `Branch staleness: skipped (detached HEAD or not a git repo).\n`,
      );
    }
    return;
  }
  const { remote, branch: upstreamBranch } = splitRemoteRef(opts.remoteRef);
  const deps = makeRealGitDeps(root);
  let snapshot;
  try {
    snapshot = detectBranchStaleness(
      {
        branch,
        upstreamRemote: remote,
        upstreamBranch,
        threshold,
        fetch: opts.fetch,
      },
      deps,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify({
          branch,
          remoteRef: opts.remoteRef,
          behind: null,
          threshold,
          nudgeRequired: false,
          error: message,
        })}\n`,
      );
    } else {
      process.stdout.write(
        `Branch staleness: skipped (${message}). Advisory only; continuing.\n`,
      );
    }
    return;
  }
  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({
        branch: snapshot.branch,
        remoteRef: snapshot.remoteRef,
        behind: snapshot.behind,
        threshold: snapshot.threshold,
        nudgeRequired: snapshot.nudgeRequired,
      })}\n`,
    );
    return;
  }
  process.stdout.write(
    `Branch staleness: ${snapshot.behind} commits behind ${snapshot.remoteRef} (threshold ${snapshot.threshold}).\n`,
  );
  if (snapshot.nudgeRequired) {
    process.stdout.write(
      `  Consider \`git merge ${snapshot.remoteRef}\` before picking up tasks. ` +
        `Stale-branch state was the root cause of the cont. 5 incident (3 commits re-implementing work already on main). ` +
        `Cf. https://github.com/audiocontrol-org/deskwork/issues/422 (this signal) + https://github.com/audiocontrol-org/deskwork/issues/413 (post-merge bookkeeping portfolio).\n`,
    );
  }
}
