// Apply layer for /dw-lifecycle:complete-parent-closure.
//
// Reads a filled-in proposal file, gates on the `approval` token, runs the
// all-or-nothing pre-validation gate, and dispatches one gh mutation per
// approved row. Partial success per-item; no rollback. Mirrors the
// triage-issues batched-proposal pattern.

import { readFileSync, writeFileSync } from 'node:fs';
import type {
  ChildIssueRef,
  DispositionKind,
  ProposalFile,
  ProposalItem,
  RunGh,
} from './types.js';

export class InvalidProposalFileError extends Error {
  override name = 'InvalidProposalFileError';
}

export interface ApplyArgs {
  readonly proposalPath: string;
  readonly runGh: RunGh;
  // Optional repo override. When unset, the apply layer uses the `repo`
  // baked into the proposal file.
  readonly repo?: string;
  // Per-row warning sink. Default: stderr. Tests inject a recorder.
  readonly warn?: (line: string) => void;
}

export interface ApplyOutcome {
  readonly itemIndex: number;
  readonly issueNumber: number;
  readonly applied: boolean;
  readonly result: string | null;
  readonly error: string | null;
  readonly skipped: boolean;
}

export interface ApplySummary {
  readonly applied: number;
  readonly failed: number;
  readonly skipped: number;
}

export interface ApplyResult {
  readonly outcomes: readonly ApplyOutcome[];
  readonly aborted: boolean;
  readonly summary: ApplySummary;
}

export type ApprovalToken =
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'subset'; readonly indexes: readonly number[] };

// Parses the operator's approval token. Mirrors the triage-issues parser.
// Centralising rejected here (instead of importing) keeps the apply layer
// shippable independently of triage-issues' library boundaries.
export function parseApproval(raw: string | null, itemCount: number): ApprovalToken {
  if (raw === null) {
    throw new Error(
      `approval field is null -- operator has not approved the proposal. Set "approval" to "y", "n", or a 1-based comma-separated index list (e.g. "1,3,5").`,
    );
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      `approval field is empty -- set to "y", "n", or a 1-based comma-separated index list.`,
    );
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'y' || lower === 'yes') return { kind: 'all' };
  if (lower === 'n' || lower === 'no') return { kind: 'none' };
  const parts = trimmed.split(',').map((p) => p.trim());
  const indexes: number[] = [];
  for (const part of parts) {
    if (part === '') continue;
    if (!/^\d+$/.test(part)) {
      throw new Error(
        `approval token contained non-integer entry '${part}' -- expected y, n, or 1-based comma-separated integers.`,
      );
    }
    const n = Number.parseInt(part, 10);
    if (n < 1 || n > itemCount) {
      throw new Error(
        `approval token index ${n} is out of range (proposal has ${itemCount} items; indexes are 1-based).`,
      );
    }
    indexes.push(n);
  }
  if (indexes.length === 0) {
    throw new Error(
      `approval token parsed to an empty subset -- use "n" to abort or list at least one index.`,
    );
  }
  return { kind: 'subset', indexes };
}

// --- validation ------------------------------------------------------------

const VALID_DISPOSITIONS: ReadonlySet<DispositionKind> = new Set([
  'close-all-children-closed',
  'close-with-open-children',
  'skip',
  'leave-open',
]);

const VALID_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  'close-all-children-closed',
  'close-with-open-children',
  'skip-already-closed',
  'skip-not-this-feature',
]);

function isChildIssueRef(value: unknown): value is ChildIssueRef {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.number === 'number' &&
    typeof v.state === 'string' &&
    (v.title === null || typeof v.title === 'string')
  );
}

function isProposalItemShape(value: unknown): value is ProposalItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.number !== 'number' ||
    typeof v.title !== 'string' ||
    typeof v.url !== 'string' ||
    typeof v.state !== 'string' ||
    !Array.isArray(v.child_issues) ||
    typeof v.classification !== 'string'
  ) {
    return false;
  }
  for (const child of v.child_issues) {
    if (!isChildIssueRef(child)) return false;
  }
  if (!VALID_CLASSIFICATIONS.has(v.classification as string)) return false;
  return true;
}

function isProposalFile(value: unknown): value is ProposalFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.generated_at !== 'string' ||
    typeof v.feature_slug !== 'string' ||
    typeof v.parent_issue !== 'number' ||
    typeof v.feature_complete_sha !== 'string' ||
    typeof v.repo !== 'string' ||
    !Array.isArray(v.items)
  ) {
    return false;
  }
  for (const item of v.items) {
    if (!isProposalItemShape(item)) return false;
  }
  return true;
}

export function readProposalFile(path: string): ProposalFile {
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new InvalidProposalFileError(
      `Could not parse ${path} as JSON: ${message}`,
    );
  }
  if (!isProposalFile(parsed)) {
    throw new InvalidProposalFileError(
      `${path} is not a valid proposal file (missing or malformed required fields).`,
    );
  }
  return parsed;
}

// Per-item gate. Returns the error text if the item fails validation; null
// when the item is approval-ready OR when no disposition is set (the latter
// is a per-row inline error, not a structural failure).
function validateApprovedItem(
  item: ProposalItem,
  oneBased: number,
): string | null {
  if (item.disposition === null) {
    // Treat as approval-ready but the runOne path will record the per-row
    // "no disposition" error inline. NOT a structural failure -- mirrors
    // the triage-issues "absent" branch.
    return null;
  }
  if (!VALID_DISPOSITIONS.has(item.disposition)) {
    return `Item ${oneBased} (issue #${item.number}) has unknown disposition '${item.disposition}'. Expected one of: ${Array.from(VALID_DISPOSITIONS).join(', ')}.`;
  }
  // close-* dispositions require a non-empty closure_comment.
  if (
    item.disposition === 'close-all-children-closed' ||
    item.disposition === 'close-with-open-children'
  ) {
    if (
      typeof item.closure_comment !== 'string' ||
      item.closure_comment.trim() === ''
    ) {
      return `Item ${oneBased} (issue #${item.number}, disposition '${item.disposition}') requires a non-empty closure_comment.`;
    }
  }
  return null;
}

// --- dispatch --------------------------------------------------------------

interface RunOneArgs {
  readonly item: ProposalItem;
  readonly itemIndex: number;
  readonly repo: string;
  readonly runGh: RunGh;
  readonly warn: (line: string) => void;
}

function runOne(args: RunOneArgs): ApplyOutcome {
  const { item, itemIndex, repo, runGh, warn } = args;
  if (item.disposition === null) {
    return {
      itemIndex,
      issueNumber: item.number,
      applied: false,
      result: null,
      error: `item #${item.number} has no disposition -- fill in disposition + closure_comment before applying.`,
      skipped: false,
    };
  }
  if (item.disposition === 'skip') {
    return {
      itemIndex,
      issueNumber: item.number,
      applied: false,
      result: 'skipped per operator',
      error: null,
      skipped: false,
    };
  }
  if (item.disposition === 'leave-open') {
    return {
      itemIndex,
      issueNumber: item.number,
      applied: false,
      result: 'left open per operator',
      error: null,
      skipped: false,
    };
  }
  // close-* path: dispatch `gh issue close` with the closure_comment.
  if (
    item.disposition === 'close-all-children-closed' ||
    item.disposition === 'close-with-open-children'
  ) {
    const comment = item.closure_comment ?? '';
    if (item.disposition === 'close-with-open-children') {
      const openChildren = item.child_issues.filter((c) => c.state === 'OPEN');
      if (openChildren.length > 0) {
        const list = openChildren.map((c) => `#${c.number}`).join(', ');
        warn(
          `warning: closing #${item.number} while ${openChildren.length} child issue(s) remain open: ${list}`,
        );
      }
    }
    try {
      runGh([
        'issue',
        'close',
        String(item.number),
        '--repo',
        repo,
        '--comment',
        comment,
      ]);
      return {
        itemIndex,
        issueNumber: item.number,
        applied: true,
        result: `closed parent #${item.number}`,
        error: null,
        skipped: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const firstLine = message.split('\n')[0] ?? message;
      return {
        itemIndex,
        issueNumber: item.number,
        applied: false,
        result: null,
        error: firstLine,
        skipped: false,
      };
    }
  }
  // Exhaustiveness check. This branch is type-level unreachable: every
  // DispositionKind member is handled above. Throwing (rather than
  // returning a soft per-row error) enforces the contract at runtime --
  // if a new DispositionKind member is added without updating runOne,
  // the apply layer crashes structurally instead of silently degrading
  // every approved row to a per-row failure.
  const exhaustive: never = item.disposition;
  throw new Error(
    `unreachable: runOne disposition switch was not exhaustive -- DispositionKind member added without updating runOne (got: ${String(exhaustive)})`,
  );
}

function updateItem(item: ProposalItem, outcome: ApplyOutcome): ProposalItem {
  return {
    ...item,
    applied: outcome.applied,
    apply_error: outcome.error,
    result: outcome.result,
  };
}

function selectedIndexes(
  token: ApprovalToken,
  itemCount: number,
): readonly number[] {
  if (token.kind === 'all') {
    return Array.from({ length: itemCount }, (_, i) => i + 1);
  }
  if (token.kind === 'none') return [];
  return token.indexes;
}

export function apply(args: ApplyArgs): ApplyResult {
  const file = readProposalFile(args.proposalPath);
  const repo = args.repo ?? file.repo;
  const token = parseApproval(file.approval, file.items.length);
  const warn =
    args.warn ??
    ((line: string): void => {
      process.stderr.write(`${line}\n`);
    });

  if (token.kind === 'none') {
    return {
      outcomes: [],
      aborted: true,
      summary: { applied: 0, failed: 0, skipped: file.items.length },
    };
  }

  const chosen = new Set(selectedIndexes(token, file.items.length));

  // All-or-nothing pre-validation gate.
  for (let i = 0; i < file.items.length; i++) {
    const oneBased = i + 1;
    if (!chosen.has(oneBased)) continue;
    const item = file.items[i];
    if (item === undefined) continue;
    const error = validateApprovedItem(item, oneBased);
    if (error !== null) {
      throw new InvalidProposalFileError(error);
    }
  }

  const outcomes: ApplyOutcome[] = [];
  const updatedItems: ProposalItem[] = file.items.map((item, i) => {
    const oneBased = i + 1;
    if (!chosen.has(oneBased)) {
      outcomes.push({
        itemIndex: oneBased,
        issueNumber: item.number,
        applied: false,
        result: null,
        error: null,
        skipped: true,
      });
      return item;
    }
    const outcome = runOne({
      item,
      itemIndex: oneBased,
      repo,
      runGh: args.runGh,
      warn,
    });
    outcomes.push(outcome);
    if (outcome.skipped) return item;
    return updateItem(item, outcome);
  });

  const next: ProposalFile = { ...file, items: updatedItems };
  writeFileSync(args.proposalPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  // The summary's `applied` count is the number of rows that successfully
  // landed a gh mutation -- close-* dispositions only. `skip` and
  // `leave-open` dispositions count as attempted-but-not-failed (recorded
  // in `result` with a sentinel string); they don't inflate `applied`.
  const closeApplied = outcomes.filter(
    (o) => o.applied,
  ).length;
  // A row is `failed` when it was approved, has a disposition we tried to
  // run, but the runner returned a non-null error. Items with no
  // disposition surface as a per-row inline error -- count those too so
  // the operator sees the total in the summary line.
  const failed = outcomes.filter((o) => !o.applied && !o.skipped && o.error !== null).length;
  const summary: ApplySummary = {
    applied: closeApplied,
    failed,
    skipped: outcomes.filter((o) => o.skipped).length,
  };

  return { outcomes, aborted: false, summary };
}
