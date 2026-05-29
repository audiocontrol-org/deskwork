// Apply step for /dw-lifecycle:archive-branch.
//
// After pre-flight passes (see preflight.ts), this module runs the
// preserve-then-delete sequence:
//   1. Create annotated tag (`git tag -a`).
//   2. Push tag to origin (unless --no-push / --local-only).
//   3. Delete local branch (`git branch -D`).
//   4. Delete remote branch (`git push origin --delete`) — unless
//      --no-push / --local-only. If the remote branch doesn't exist,
//      surface the failure as a non-fatal skip with a clear message.
//
// Mid-flight failures do NOT roll back: deleting a freshly-created tag is
// destructive in its own right, and operators decide recovery. The error
// carries the failed-command context so the operator can pick up.

import { runPreflight, buildTagName } from './preflight.js';
import type { RunGit } from '../debt-report/types.js';
import type {
  ArchiveBranchOptions,
  ArchiveResult,
  DryRunPlan,
  RunPush,
} from './types.js';

/**
 * The mid-flight stage at which apply failed. `'remote-delete'` is
 * intentionally absent — those failures are surfaced as
 * {@link ArchiveResult.remoteDeleteSkipped} (non-fatal by design): the
 * branch may have been local-only, and the work-preservation contract
 * holds without the remote ref being deleted.
 */
export class ArchiveBranchApplyError extends Error {
  readonly stage: 'tag-create' | 'tag-push' | 'branch-delete-local';
  readonly cause: Error;

  constructor(
    stage: ArchiveBranchApplyError['stage'],
    message: string,
    cause: Error,
  ) {
    super(message);
    this.name = 'ArchiveBranchApplyError';
    this.stage = stage;
    this.cause = cause;
  }
}

interface ApplyArgs {
  readonly opts: ArchiveBranchOptions;
  readonly runGit: RunGit;
  readonly runPush: RunPush;
}

interface PlanArgs {
  readonly opts: ArchiveBranchOptions;
  readonly runGit: RunGit;
}

interface PreparedArchive {
  readonly tagName: string;
  readonly tagMessage: string;
  readonly lastCommitSha: string;
  readonly lastCommitSubject: string;
}

/**
 * Shared setup phase for planArchive + applyArchive: build the tag name,
 * run pre-flight gates, build the tag message. Extracted so the two
 * entry points cannot drift on which gates run or how the tag is
 * constructed — they have identical validation semantics by construction.
 */
function prepareArchive(opts: ArchiveBranchOptions, runGit: RunGit): PreparedArchive {
  const tagName = buildTagName(opts.branch, opts.now);
  const meta = runPreflight({
    branch: opts.branch,
    tagName,
    force: opts.force,
    compareRef: opts.compareRef,
    runGit,
  });
  const tagMessage = buildTagMessage(opts, meta);
  return {
    tagName,
    tagMessage,
    lastCommitSha: meta.lastCommitSha,
    lastCommitSubject: meta.lastCommitSubject,
  };
}

/**
 * Build the command list for --dry-run mode WITHOUT mutating any state.
 * Runs the same pre-flight gates so the operator sees the same refusal
 * messages they'd see on a live run; if pre-flight fails the error
 * propagates up to the caller. Each command in the returned list is a
 * single git invocation rendered as a shell-quote-ish string for
 * operator readability — they are NOT executed.
 */
export function planArchive(args: PlanArgs): DryRunPlan {
  const { opts, runGit } = args;
  const prep = prepareArchive(opts, runGit);
  const { tagName, tagMessage } = prep;
  const commands: string[] = [];
  // The tag-message is rendered on its own section in the dry-run output
  // (see DryRunPlan.tagMessageLines). The command itself references the
  // message indirectly so a copy-paste from the dry-run output doesn't
  // collapse embedded newlines via JS string escaping.
  commands.push(
    `git tag -a ${tagName} ${opts.branch} -m <see "Tag message" below>`,
  );
  if (!opts.noPush) {
    commands.push(
      `git push origin refs/tags/${tagName}:refs/tags/${tagName}`,
    );
  }
  commands.push(`git branch -D ${opts.branch}`);
  if (!opts.noPush) {
    commands.push(`git push origin --delete ${opts.branch}`);
  }
  return {
    branch: opts.branch,
    tagName,
    commands,
    tagMessageLines: tagMessage.split('\n'),
    forceUsed: opts.force,
  };
}

/**
 * Run the preserve-then-delete sequence. Returns a result summary; the
 * subcommand layer formats the operator-visible output.
 */
export function applyArchive(args: ApplyArgs): ArchiveResult {
  const { opts, runGit, runPush } = args;
  const prep = prepareArchive(opts, runGit);
  const { tagName, tagMessage } = prep;

  // Step 1: create annotated tag.
  try {
    runGit(['tag', '-a', tagName, opts.branch, '-m', tagMessage]);
  } catch (err) {
    throw new ArchiveBranchApplyError(
      'tag-create',
      `Failed to create annotated tag ${tagName}: ${errMessage(err)}`,
      asError(err),
    );
  }

  // Step 2: push tag (skipped on --no-push).
  let tagPushed = false;
  if (!opts.noPush) {
    try {
      runPush([
        'push',
        'origin',
        `refs/tags/${tagName}:refs/tags/${tagName}`,
      ]);
      tagPushed = true;
    } catch (err) {
      throw new ArchiveBranchApplyError(
        'tag-push',
        `Failed to push tag ${tagName} to origin: ${errMessage(err)}. The local tag was created; re-push with: git push origin refs/tags/${tagName}. Or pass --no-push for local-only archiving.`,
        asError(err),
      );
    }
  }

  // Step 3: delete local branch. At this point the tag preserves the
  // work, so it's safe to force-delete.
  try {
    runGit(['branch', '-D', opts.branch]);
  } catch (err) {
    throw new ArchiveBranchApplyError(
      'branch-delete-local',
      `Failed to delete local branch ${opts.branch}: ${errMessage(err)}. The tag ${tagName} was created${tagPushed ? ' and pushed' : ''}; re-run with --no-push once the local-delete obstacle is resolved.`,
      asError(err),
    );
  }

  // Step 4: delete remote branch. Non-existence is surfaced as a
  // non-fatal skip — the branch may have been local-only.
  let remoteBranchDeleted = false;
  let remoteDeleteSkipped = false;
  let remoteDeleteSkipReason: string | null = null;
  if (!opts.noPush) {
    try {
      runPush(['push', 'origin', '--delete', opts.branch]);
      remoteBranchDeleted = true;
    } catch (err) {
      const msg = errMessage(err);
      remoteDeleteSkipped = true;
      remoteDeleteSkipReason = isRemoteRefMissingMessage(msg)
        ? `remote branch did not exist; skipped`
        : `remote delete failed: ${msg}`;
    }
  }

  return {
    branch: opts.branch,
    tagName,
    lastCommitSha: prep.lastCommitSha,
    lastCommitSubject: prep.lastCommitSubject,
    tagPushed,
    remoteBranchDeleted,
    remoteDeleteSkipped,
    remoteDeleteSkipReason,
  };
}

function buildTagMessage(
  opts: ArchiveBranchOptions,
  meta: { readonly lastCommitSha: string; readonly lastCommitSubject: string },
): string {
  const lines = [
    opts.rationale,
    '',
    `Source branch: ${opts.branch}`,
    `Last commit: ${meta.lastCommitSha} ${meta.lastCommitSubject}`,
    `Archive date: ${formatIsoDate(opts.now)}`,
  ];
  return lines.join('\n');
}

function formatIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Recognize the "remote ref does not exist" failure mode from a push
 * error message. Git's exact text varies across versions but the two
 * substrings below cover every git release in current adopter use.
 */
function isRemoteRefMissingMessage(msg: string): boolean {
  return (
    msg.includes('remote ref does not exist') ||
    msg.includes("unable to delete '") ||
    msg.includes('unable to push to unqualified destination')
  );
}
