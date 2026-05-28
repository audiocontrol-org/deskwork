// Apply layer for /dw-lifecycle:close-shipped.
//
// For each grouped issue reference, the apply layer:
//   1. Checks the issue's current state via `gh issue view`. If closed,
//      skips with `skipped-already-closed`.
//   2. Checks whether the issue already has the target label. If so,
//      skips with `skipped-already-labeled`.
//   3. Posts a verification-request comment via `gh issue comment`.
//   4. Adds the target label via `gh issue edit --add-label`.
//
// Per-issue partial success: each step records its own outcome. A failure
// at step 3 or 4 surfaces in the outcome but does not abort the remaining
// issues. The skill NEVER closes the issue -- closure is operator-driven
// per the project's "Issue closure requires verification in a formally-
// installed release" rule.

import type {
  ApplyOutcomeKind,
  CloseShippedOutcome,
  IssueReferenceGroup,
  RunGh,
} from './types.js';

export interface ApplyArgs {
  readonly groups: readonly IssueReferenceGroup[];
  readonly toTag: string;
  readonly repo: string;
  readonly label: string;
  readonly dryRun: boolean;
  readonly runGh: RunGh;
}

interface IssueState {
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly labels: readonly string[];
}

interface RawIssueView {
  readonly state?: unknown;
  readonly labels?: unknown;
}

function parseIssueView(raw: string): IssueState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'UNKNOWN', labels: [] };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { state: 'UNKNOWN', labels: [] };
  }
  const view = parsed as RawIssueView;
  const stateRaw = typeof view.state === 'string' ? view.state.toUpperCase() : '';
  const state: IssueState['state'] =
    stateRaw === 'OPEN' || stateRaw === 'CLOSED' ? stateRaw : 'UNKNOWN';
  const labels: string[] = [];
  if (Array.isArray(view.labels)) {
    for (const entry of view.labels) {
      if (typeof entry === 'object' && entry !== null) {
        const nameRaw = (entry as { name?: unknown }).name;
        if (typeof nameRaw === 'string' && nameRaw !== '') {
          labels.push(nameRaw);
        }
      } else if (typeof entry === 'string' && entry !== '') {
        labels.push(entry);
      }
    }
  }
  return { state, labels };
}

export function buildCommentBody(args: {
  readonly toTag: string;
  readonly group: IssueReferenceGroup;
}): string {
  const { toTag, group } = args;
  const lines: string[] = [];
  lines.push(
    `Shipped in ${toTag}. Please verify against an installed release before closing this issue.`,
  );
  lines.push('');
  lines.push('Source commits in this release:');
  for (const commit of group.commits) {
    lines.push(`- ${commit.sha}: ${commit.subject}`);
  }
  lines.push('');
  lines.push(
    'Install / repro instructions (per the project rule "Issue closure requires verification in a formally-installed release"):',
  );
  lines.push(`1. Install / upgrade to ${toTag}.`);
  lines.push('2. Reproduce the original issue.');
  lines.push('3. If the fix holds, close with a brief note.');
  lines.push('4. If not, comment with the surviving symptom.');
  return lines.join('\n');
}

interface ApplyOneArgs {
  readonly group: IssueReferenceGroup;
  readonly toTag: string;
  readonly repo: string;
  readonly label: string;
  readonly runGh: RunGh;
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}

function viewIssue(args: ApplyOneArgs): IssueState | string {
  try {
    const raw = args.runGh([
      'issue',
      'view',
      String(args.group.issue),
      '--repo',
      args.repo,
      '--json',
      'state,labels',
    ]);
    return parseIssueView(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return firstLine(msg);
  }
}

function postComment(args: ApplyOneArgs, body: string): string | null {
  try {
    args.runGh([
      'issue',
      'comment',
      String(args.group.issue),
      '--repo',
      args.repo,
      '--body',
      body,
    ]);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return firstLine(msg);
  }
}

function addLabel(args: ApplyOneArgs): string | null {
  try {
    args.runGh([
      'issue',
      'edit',
      String(args.group.issue),
      '--repo',
      args.repo,
      '--add-label',
      args.label,
    ]);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return firstLine(msg);
  }
}

function applyOne(args: ApplyOneArgs): CloseShippedOutcome {
  const stateOrError = viewIssue(args);
  if (typeof stateOrError === 'string') {
    return {
      issue: args.group.issue,
      applied: false,
      action: 'failed-state-check',
      error: stateOrError,
    };
  }
  if (stateOrError.state === 'CLOSED') {
    return {
      issue: args.group.issue,
      applied: false,
      action: 'skipped-already-closed',
      error: null,
    };
  }
  if (stateOrError.labels.includes(args.label)) {
    return {
      issue: args.group.issue,
      applied: false,
      action: 'skipped-already-labeled',
      error: null,
    };
  }
  const body = buildCommentBody({ toTag: args.toTag, group: args.group });
  const commentError = postComment(args, body);
  const labelError = addLabel(args);
  return decideOutcome(args.group.issue, commentError, labelError);
}

function decideOutcome(
  issue: number,
  commentError: string | null,
  labelError: string | null,
): CloseShippedOutcome {
  if (commentError === null && labelError === null) {
    return {
      issue,
      applied: true,
      action: 'labeled-and-commented',
      error: null,
    };
  }
  if (commentError === null && labelError !== null) {
    return {
      issue,
      applied: true,
      action: 'comment-only',
      error: `label add failed: ${labelError}`,
    };
  }
  if (commentError !== null && labelError === null) {
    return {
      issue,
      applied: true,
      action: 'label-only',
      error: `comment post failed: ${commentError}`,
    };
  }
  return {
    issue,
    applied: false,
    action: 'failed-comment',
    error: `comment failed: ${commentError}; label failed: ${labelError}`,
  };
}

export interface ApplyResult {
  readonly outcomes: readonly CloseShippedOutcome[];
}

export function applyAll(args: ApplyArgs): ApplyResult {
  const outcomes: CloseShippedOutcome[] = [];
  for (const group of args.groups) {
    const outcome = applyOne({
      group,
      toTag: args.toTag,
      repo: args.repo,
      label: args.label,
      runGh: args.runGh,
    });
    outcomes.push(outcome);
  }
  return { outcomes };
}

// Exposed for unit tests so they can validate per-outcome decision logic
// in isolation from the gh callback.
export const __testing = {
  parseIssueView,
  decideOutcome,
} as const;

// Re-export for external callers that need the action-kind union.
export type { ApplyOutcomeKind };
