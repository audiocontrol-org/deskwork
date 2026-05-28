// Subcommand layer for /dw-lifecycle:session-end's hygiene capture step.
//
// Reads the active feature's slug from argv, walks the session's commits +
// the workplan + the gh-author-this-session issue list, and prints the
// markdown block. The SKILL.md appends the printed block to the journal
// entry via `dw-lifecycle journal-append --file <entry.md>` after operator
// review.
//
// Argv:
//   --slug <feature-slug>       (required)
//   --target-version <vN.N>     (defaults to config.docs.defaultTargetVersion)
//   --session-start-sha <sha>   (optional; falls back to last 10 commits)

import { execFileSync } from 'node:child_process';
import { loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import { captureSessionEndHygiene } from '../lifecycle-integration/session-end-hygiene.js';

export interface SessionEndHygieneCliOptions {
  readonly slug: string;
  readonly targetVersion: string | null;
  readonly sessionStartSha: string | null;
}

export function parseSessionEndHygieneArgs(
  args: readonly string[],
): SessionEndHygieneCliOptions {
  let slug: string | undefined;
  let targetVersion: string | null = null;
  let sessionStartSha: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--slug': {
        const next = args[++i];
        if (next === undefined) throw new Error('--slug requires a value.');
        slug = next;
        break;
      }
      case '--target-version': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--target-version requires a value.');
        }
        targetVersion = next;
        break;
      }
      case '--session-start-sha': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--session-start-sha requires a value.');
        }
        sessionStartSha = next;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (slug === undefined) {
    throw new Error('--slug is required.');
  }
  return { slug, targetVersion, sessionStartSha };
}

function defaultRunGit(args: readonly string[]): string {
  return execFileSync('git', [...args], { encoding: 'utf8' });
}

function defaultRunGh(args: readonly string[]): string {
  return execFileSync('gh', [...args], { encoding: 'utf8' });
}

export async function sessionEndHygiene(rawArgs: string[]): Promise<void> {
  const opts = parseSessionEndHygieneArgs(rawArgs);
  const root = repoRoot();
  const cfg = loadConfig(root);
  const targetVersion = opts.targetVersion ?? cfg.docs.defaultTargetVersion;
  const report = captureSessionEndHygiene({
    projectRoot: root,
    featureSlug: opts.slug,
    targetVersion,
    inProgressDirName: cfg.docs.statusDirs.inProgress,
    sessionStartSha: opts.sessionStartSha,
    runGit: defaultRunGit,
    runGh: defaultRunGh,
    now: new Date(),
  });
  process.stdout.write(report.markdownBlock);
  process.stdout.write('\n');
}
