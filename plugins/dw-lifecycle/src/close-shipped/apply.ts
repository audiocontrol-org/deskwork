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
  EvidenceSource,
  IssueReferenceGroup,
  MergedIssueEvidence,
  ProvenanceEntry,
  RunGh,
} from './types.js';

export interface ApplyArgs {
  readonly merged: readonly MergedIssueEvidence[];
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

// Shared header + install-instructions footer used by both comment-body
// renderers. Centralizes the verification-rule prose so the two body
// shapes don't drift.
function headerLines(toTag: string): readonly string[] {
  return [
    `Shipped in ${toTag}. Please verify against an installed release before closing this issue.`,
    '',
  ];
}

function installFooterLines(toTag: string): readonly string[] {
  return [
    'Install / repro instructions (per the project rule "Issue closure requires verification in a formally-installed release"):',
    `1. Install / upgrade to ${toTag}.`,
    '2. Reproduce the original issue.',
    '3. If the fix holds, close with a brief note.',
    '4. If not, comment with the surviving symptom.',
  ];
}

export function buildCommentBody(args: {
  readonly toTag: string;
  readonly group: IssueReferenceGroup;
}): string {
  const { toTag, group } = args;
  const lines: string[] = [];
  for (const line of headerLines(toTag)) lines.push(line);
  lines.push('Source commits in this release:');
  for (const commit of group.commits) {
    lines.push(`- ${commit.sha}: ${commit.subject}`);
  }
  lines.push('');
  for (const line of installFooterLines(toTag)) lines.push(line);
  return lines.join('\n');
}

// Build the multi-source evidence-trail comment body. Cites every
// source that flagged the issue, with the per-source provenance entries
// rendered as bullets under a `By source` heading. Adds an orphan-source
// warning when the merger detected mutually-exclusive SHAs across
// sources.
export function buildEvidenceCommentBody(args: {
  readonly toTag: string;
  readonly evidence: MergedIssueEvidence;
}): string {
  const { toTag, evidence } = args;
  const lines: string[] = [];
  for (const line of headerLines(toTag)) lines.push(line);
  lines.push('Evidence trail:');
  const bySource = groupProvenanceBySource(evidence.provenance);
  for (const source of evidence.sources) {
    const entries = bySource.get(source) ?? [];
    if (entries.length === 0) continue;
    const summary = entries
      .map((entry) => renderProvenanceLine(entry))
      .join('; ');
    lines.push(`- ${source}: ${summary}`);
  }
  if (evidence.orphanSource && evidence.orphanReason !== null) {
    lines.push('');
    lines.push(
      `Note: orphan-source warning — ${evidence.orphanReason} The agent did not auto-resolve; verify which fix actually landed.`,
    );
  }
  lines.push('');
  for (const line of installFooterLines(toTag)) lines.push(line);
  return lines.join('\n');
}

function groupProvenanceBySource(
  provenance: readonly ProvenanceEntry[],
): ReadonlyMap<EvidenceSource, readonly ProvenanceEntry[]> {
  const out = new Map<EvidenceSource, ProvenanceEntry[]>();
  for (const entry of provenance) {
    let bucket = out.get(entry.source);
    if (bucket === undefined) {
      bucket = [];
      out.set(entry.source, bucket);
    }
    bucket.push(entry);
  }
  return out;
}

function renderProvenanceLine(entry: ProvenanceEntry): string {
  const parts: string[] = [];
  if (entry.path !== null && entry.path !== '') parts.push(entry.path);
  if (entry.detail !== null && entry.detail !== '') parts.push(entry.detail);
  if (parts.length === 0 && entry.sha !== null) parts.push(entry.sha);
  return parts.join(' — ');
}

interface ApplyOneArgs {
  readonly evidence: MergedIssueEvidence;
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
      String(args.evidence.issue),
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
      String(args.evidence.issue),
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
      String(args.evidence.issue),
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
      issue: args.evidence.issue,
      applied: false,
      action: 'failed-state-check',
      error: stateOrError,
    };
  }
  if (stateOrError.state === 'CLOSED') {
    return {
      issue: args.evidence.issue,
      applied: false,
      action: 'skipped-already-closed',
      error: null,
    };
  }
  if (stateOrError.labels.includes(args.label)) {
    return {
      issue: args.evidence.issue,
      applied: false,
      action: 'skipped-already-labeled',
      error: null,
    };
  }
  const body = buildEvidenceCommentBody({
    toTag: args.toTag,
    evidence: args.evidence,
  });
  const commentError = postComment(args, body);
  const labelError = addLabel(args);
  return decideOutcome(args.evidence.issue, commentError, labelError);
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
  for (const evidence of args.merged) {
    const outcome = applyOne({
      evidence,
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
