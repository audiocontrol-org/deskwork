// CLI subcommand: dw-lifecycle dismantle-worktrees <propose|apply>.

import {
  propose,
  apply,
  ProposalOutputExistsError,
  ApplyValidationError,
} from '../dismantle-worktrees/index.js';
import { DismantleWorktreesPreflightError } from '../dismantle-worktrees/preflight.js';
import { repoRoot } from '../repo.js';
import { parsePositiveInt } from './lib/parse-flag-value.js';
import { runGitStdout } from './lib/process-probes.js';
import { buildWorktreeReportOptions } from './lib/build-worktree-opts.js';

const runGit = runGitStdout;

interface ProposeFlags {
  daysThreshold: number;
  thresholdCount: number;
  worktreeBase?: string;
  allowExternal: boolean;
  output?: string;
  force: boolean;
}

function parseProposeArgs(args: string[]): ProposeFlags {
  const opts: ProposeFlags = {
    daysThreshold: 30,
    thresholdCount: 3,
    allowExternal: false,
    force: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--days') opts.daysThreshold = parsePositiveInt('--days', args[++i]);
    else if (arg === '--threshold-count') opts.thresholdCount = parsePositiveInt('--threshold-count', args[++i]);
    else if (arg === '--worktree-base') opts.worktreeBase = args[++i];
    else if (arg === '--allow-external') opts.allowExternal = true;
    else if (arg === '--output') opts.output = args[++i];
    else if (arg === '--force') opts.force = true;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  return opts;
}

interface ApplyFlags {
  proposal?: string;
  allowDirty: boolean;
  forceDiscard: boolean;
  acceptDivergence: boolean;
  allowExternal: boolean;
  reason?: string;
}

function parseApplyArgs(args: string[]): ApplyFlags {
  const opts: ApplyFlags = {
    allowDirty: false,
    forceDiscard: false,
    acceptDivergence: false,
    allowExternal: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--proposal') opts.proposal = args[++i];
    else if (arg === '--allow-dirty') opts.allowDirty = true;
    else if (arg === '--force-discard') opts.forceDiscard = true;
    else if (arg === '--accept-divergence') opts.acceptDivergence = true;
    else if (arg === '--allow-external') opts.allowExternal = true;
    else if (arg === '--reason') opts.reason = args[++i];
    else throw new Error(`Unknown flag: ${arg}`);
  }
  return opts;
}

async function runPropose(args: string[]): Promise<void> {
  let opts: ProposeFlags;
  try { opts = parseProposeArgs(args); } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`dismantle-worktrees propose: ${msg}\n`);
    process.exit(2);
    return;
  }
  const projectRoot = repoRoot();
  try {
    const result = propose({
      opts: buildWorktreeReportOptions({
        projectRoot,
        daysThreshold: opts.daysThreshold,
        thresholdCount: opts.thresholdCount,
        ...(opts.worktreeBase !== undefined ? { worktreeBase: opts.worktreeBase } : {}),
        allowExternal: opts.allowExternal,
      }),
      ...(opts.output !== undefined ? { outputPath: opts.output } : {}),
      force: opts.force,
    });
    process.stderr.write(`Proposal written: ${result.outputPath}\n`);
    process.stderr.write(`Items: ${result.itemCount}\n\n`);
    process.stdout.write(result.markdownTable);
    process.stderr.write(
      `\nNext: edit each entry's "decision" field in the JSON file ` +
      `(dismantle / archive-then-dismantle / prune-orphan / skip), then run:\n` +
      `  dw-lifecycle dismantle-worktrees apply --proposal ${result.outputPath}\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ProposalOutputExistsError) {
      process.stderr.write(`dismantle-worktrees propose: ${msg}\n`);
      process.exit(2);
      return;
    }
    process.stderr.write(`dismantle-worktrees propose: ${msg}\n`);
    process.exit(1);
  }
}

async function runApply(args: string[]): Promise<void> {
  let opts: ApplyFlags;
  try { opts = parseApplyArgs(args); } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`dismantle-worktrees apply: ${msg}\n`);
    process.exit(2);
    return;
  }
  if (opts.proposal === undefined || opts.proposal.length === 0) {
    process.stderr.write('dismantle-worktrees apply: --proposal <path> required.\n');
    process.exit(2);
    return;
  }
  try {
    const result = apply({
      proposalPath: opts.proposal,
      runGit,
      defaultOpts: {
        allowDirty: opts.allowDirty,
        forceDiscard: opts.forceDiscard,
        acceptDivergence: opts.acceptDivergence,
        allowExternal: opts.allowExternal,
        ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
      },
    });
    process.stdout.write(
      `Applied ${result.applied.length}, skipped ${result.skipped.length}, failed ${result.failed.length}.\n\n`,
    );
    for (const r of result.applied) {
      const tag = r.tagCreated ? ` (tag: ${r.tagCreated})` : '';
      process.stdout.write(`  applied: ${r.path} [${r.decision}]${tag}\n`);
    }
    for (const r of result.skipped) {
      process.stdout.write(`  skipped: ${r.path}\n`);
    }
    for (const r of result.failed) {
      process.stdout.write(`  failed:  ${r.path} — ${r.error}\n`);
    }
    if (result.failed.length > 0) process.exit(1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ApplyValidationError) {
      process.stderr.write(`dismantle-worktrees apply: ${msg}\n`);
      process.exit(2);
      return;
    }
    if (err instanceof DismantleWorktreesPreflightError) {
      process.stderr.write(`dismantle-worktrees apply: ${msg}\n`);
      process.exit(2);
      return;
    }
    process.stderr.write(`dismantle-worktrees apply: ${msg}\n`);
    process.exit(1);
  }
}

export async function dismantleWorktrees(args: string[]): Promise<void> {
  const verb = args[0];
  const rest = args.slice(1);
  if (verb === 'propose') {
    await runPropose(rest);
    return;
  }
  if (verb === 'apply') {
    await runApply(rest);
    return;
  }
  if (verb === '--help' || verb === '-h' || verb === undefined) {
    process.stdout.write(`Usage: dw-lifecycle dismantle-worktrees <propose|apply> [flags]

Batched proposal + apply for worktree dismantle. Sibling of
:triage-issues + :promote-deferrals.

Verbs:
  propose                 Scan + write a proposal JSON; operator fills decisions.
  apply --proposal <path> Read decisions; dispatch per-worktree.

Propose flags:
  --days N                Staleness window (default 30).
  --threshold-count N     Signals needed for stale (default 3).
  --worktree-base <path>  Override auto-detect.
  --allow-external        Include worktrees outside the base path.
  --output <path>         Proposal output path (default under .dw-lifecycle/).
  --force                 Overwrite existing proposal file.

Apply flags:
  --proposal <path>       Required. Path to the proposal JSON.
  --allow-dirty           Allow dismantling worktrees with uncommitted work.
  --force-discard         Allow discarding local-only commits.
  --accept-divergence     Allow dismantling force-pushed branches.
  --allow-external        Allow dismantling external-path worktrees.
  --reason "<text>"       Required when --allow-dirty or --force-discard set.
`);
    return;
  }
  process.stderr.write(`dismantle-worktrees: unknown verb '${verb}'. Use 'propose' or 'apply'.\n`);
  process.exit(2);
}
