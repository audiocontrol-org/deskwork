// Subcommand layer for the /dw-lifecycle:complete pre-merge TBD gate.
//
// Runs the bare-TBD scanner; refuses on any bare TBD with no `[debt: #NNN]`
// back-link AND no inline `(wontfix: <reason>)` clause. Accepts
// `--skip-tbd-gate --reason "<text>"` to override, validated through the
// substantive-reason validator.
//
// On a successful pass, prints `OK` to stdout and exits 0. The SKILL.md
// proceeds with the doc-move + ROADMAP + gh-close steps. On a refusal,
// prints the bare-TBD locations to stderr and exits 2. On an invalid
// override reason, prints the validator's rejection to stderr and exits 2.
//
// Argv:
//   --workplan <path>                    (required; absolute or repo-relative)
//   --slug <feature-slug>                (required; for journaling)
//   --skip-tbd-gate                      (optional; gate-override flag)
//   --reason "<text>"                    (required when --skip-tbd-gate is set)
//   --journal-override-file <path>       (optional; if set + override used,
//                                         the override entry markdown is
//                                         written to this path so the SKILL
//                                         can append it via journal-append)

import { isAbsolute, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { repoRoot } from '../repo.js';
import {
  CompleteGateInvalidOverrideError,
  CompleteGateRefusedError,
  formatOverrideJournalEntry,
  runCompleteGate,
} from '../lifecycle-integration/complete-tbd-gate.js';
import { runGitStdout } from './lib/process-probes.js';
import { autoDetectWorktreeBase, parsePorcelain } from '../worktree-report/scan.js';

export interface CompleteGateCliOptions {
  readonly workplan: string;
  readonly slug: string;
  readonly skipTbdGate: boolean;
  readonly overrideReason: string | null;
  readonly journalOverrideFile: string | null;
}

export function parseCompleteGateArgs(
  args: readonly string[],
): CompleteGateCliOptions {
  let workplan: string | undefined;
  let slug: string | undefined;
  let skipTbdGate = false;
  let overrideReason: string | null = null;
  let journalOverrideFile: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--workplan': {
        const next = args[++i];
        if (next === undefined) throw new Error('--workplan requires a value.');
        workplan = next;
        break;
      }
      case '--slug': {
        const next = args[++i];
        if (next === undefined) throw new Error('--slug requires a value.');
        slug = next;
        break;
      }
      case '--skip-tbd-gate':
        skipTbdGate = true;
        break;
      case '--reason': {
        const next = args[++i];
        if (next === undefined) throw new Error('--reason requires a value.');
        overrideReason = next;
        break;
      }
      case '--journal-override-file': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--journal-override-file requires a value.');
        }
        journalOverrideFile = next;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (workplan === undefined) {
    throw new Error('--workplan is required.');
  }
  if (slug === undefined) {
    throw new Error('--slug is required.');
  }
  return {
    workplan,
    slug,
    skipTbdGate,
    overrideReason,
    journalOverrideFile,
  };
}

// Compose the dismantle hint shown after a clean gate pass. Resolves the
// worktree-base via `git worktree list --porcelain` so the suggested
// invocation lines up with the operator's actual layout. Returns null when
// the worktree-base cannot be resolved (e.g. running outside a git repo
// during tests, or in a fresh clone with only the main worktree) — silent
// skip rather than a noisy guess.
function formatDismantleHint(_root: string): string | null {
  let porcelain;
  try {
    porcelain = parsePorcelain(runGitStdout(['worktree', 'list', '--porcelain']));
  } catch {
    return null;
  }
  if (porcelain.length === 0) return null;
  const base = autoDetectWorktreeBase(porcelain);
  if (base.length === 0) return null;
  const lines: string[] = [];
  lines.push('Post-merge hint: this worktree becomes dismantleable once the PR merges.');
  lines.push(`  dw-lifecycle dismantle-worktrees propose --worktree-base ${base}`);
  lines.push('surfaces it (and any sibling stale worktrees) in a single batched proposal.');
  return lines.join('\n');
}

export async function completeGate(rawArgs: string[]): Promise<void> {
  const opts = parseCompleteGateArgs(rawArgs);
  const root = repoRoot();
  const workplanPath = isAbsolute(opts.workplan)
    ? opts.workplan
    : resolve(root, opts.workplan);
  try {
    const result = runCompleteGate({
      workplanPath,
      skipTbdGate: opts.skipTbdGate,
      overrideReason: opts.overrideReason,
    });
    if (result.overrideUsed && opts.journalOverrideFile !== null) {
      const entry = formatOverrideJournalEntry({
        slug: opts.slug,
        workplanPath,
        reason: result.overrideReason ?? '',
        bareTbds: result.bareTbds,
      });
      writeFileSync(opts.journalOverrideFile, entry, 'utf8');
    }
    process.stdout.write('OK\n');
    // Post-gate dismantle hint. The complete-gate is the natural shipping
    // waypoint where the operator graduates the feature; this is the
    // moment to remind them the worktree itself is the fourth structural-
    // closure stream (per `.claude/rules/agent-discipline.md` § "Closure
    // is a structural step"). The hint is informational — never blocking.
    // The session-end-hygiene block surfaces the same observation at every
    // session boundary, so this is a duplicate-but-strictly-better cue at
    // the most expensive miss point (the operator about to merge a feature).
    const hint = formatDismantleHint(root);
    if (hint !== null) {
      process.stdout.write('\n');
      process.stdout.write(hint);
      process.stdout.write('\n');
    }
  } catch (err) {
    if (err instanceof CompleteGateRefusedError) {
      process.stderr.write(err.message);
      process.stderr.write('\n');
      process.exit(2);
    }
    if (err instanceof CompleteGateInvalidOverrideError) {
      process.stderr.write(err.message);
      process.stderr.write('\n');
      process.exit(2);
    }
    throw err;
  }
}
