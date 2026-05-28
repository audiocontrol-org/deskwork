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

export type { RunGit } from '../debt-report/types.js';

// `runPush` is a separate callback because push operations target a remote
// and tests need to simulate network failures independently of the
// in-process git invocations covered by RunGit. Returns push command
// stdout; throws on non-zero exit (matching execFileSync semantics).
export type RunPush = (args: readonly string[]) => string;

export interface ArchiveBranchOptions {
  readonly branch: string;
  readonly rationale: string;
  readonly noPush: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
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
}
