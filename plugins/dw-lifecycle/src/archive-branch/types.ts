// Types for /dw-lifecycle:archive-branch — preserve-work-then-delete pattern
// for parked branches.
//
// The skill creates an annotated tag (`archived/<branch>-<YYYY-MM-DD>`) that
// preserves the branch tip + a rationale message, then deletes the branch
// from local + remote. Pre-flight checks refuse on dirty/checked-out state
// or pre-existing tag.
//
// Process-boundary callbacks (RunGit, RunPush) make the orchestration
// unit-testable against a fixture git repo without forking network
// operations. The same shape as debt-report/types.ts RunGit (which this
// module imports from to avoid duplicating the signature).

import type { RunGit } from '../debt-report/types.js';

export type { RunGit } from '../debt-report/types.js';

/**
 * Alias for {@link RunGit}. The runtime shape is identical to RunGit; the
 * separate type exists solely so tests can inject a distinct stub for push
 * operations (e.g. to simulate network failures on tag-push or remote-delete
 * while leaving the in-process git invocations unaffected). The production
 * factories collapse both onto the same implementation so env settings like
 * `LC_ALL=C` can't drift between local and push commands.
 */
export type RunPush = RunGit;

export interface ArchiveBranchOptions {
  readonly branch: string;
  readonly rationale: string;
  readonly noPush: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly compareRef: string;
  readonly now: Date;
}

export interface PreflightContext extends ArchiveBranchOptions {
  readonly tagName: string;
  readonly runGit: import('../debt-report/types.js').RunGit;
}

export interface ArchiveContext extends PreflightContext {
  readonly runPush: RunPush;
}

export interface ArchiveResult {
  readonly branch: string;
  readonly tagName: string;
  readonly lastCommitSha: string;
  readonly lastCommitSubject: string;
  readonly tagPushed: boolean;
  readonly remoteBranchDeleted: boolean;
  readonly remoteDeleteSkipped: boolean;
  readonly remoteDeleteSkipReason: string | null;
}

export interface DryRunPlan {
  readonly branch: string;
  readonly tagName: string;
  readonly commands: readonly string[];
  /** Tag-message lines (rendered separately from the command list so
   * embedded newlines don't get JS-escaped into shell-incompatible
   * `\n` sequences inside the `git tag -a ... -m <message>` command). */
  readonly tagMessageLines: readonly string[];
  /** True when --force was passed (novelty gate skipped). Surfaced in the
   * dry-run output so operators see the gate-bypass explicitly. */
  readonly forceUsed: boolean;
}
