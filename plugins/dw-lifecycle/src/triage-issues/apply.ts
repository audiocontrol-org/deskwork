import { readFileSync, writeFileSync } from 'node:fs';
import { buildDispatch } from './dispositions.js';
import type {
  DispositionFields,
  DispositionKind,
  ProposalFile,
  ProposalItem,
  RunGh,
} from './types.js';

// `apply` reads a proposal JSON file, gates on the `approval` token, and
// dispatches one gh mutation per approved row. Partial success: each
// outcome is recorded inline; no rollback. The file is overwritten with
// the post-apply state so the operator can re-read it (or re-run apply
// against the unchanged rows after fixing the failures).

export interface ApplyArgs {
  readonly proposalPath: string;
  readonly runGh: RunGh;
  // Optional repo override. When unset, the apply layer uses the `repo`
  // baked into the proposal file (the propose step records the repo there
  // at the time of fetch, so re-running apply on the same file targets the
  // same repository even if the operator's cwd has changed).
  readonly repo?: string;
}

export interface ApplyOutcome {
  readonly itemIndex: number;
  readonly issueNumber: number;
  readonly applied: boolean;
  readonly result: string | null;
  readonly error: string | null;
  readonly skipped: boolean;
}

export interface ApplyResult {
  readonly outcomes: readonly ApplyOutcome[];
  readonly aborted: boolean;
  readonly summary: ApplySummary;
}

export interface ApplySummary {
  readonly applied: number;
  readonly failed: number;
  readonly skipped: number;
}

// 1-based index list parser. Accepts `y`, `n`, or a comma-separated list of
// positive integers. Whitespace-tolerant. The index list selects WHICH items
// to apply; `y` selects all items that have a disposition; `n` aborts.
export type ApprovalToken =
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'subset'; readonly indexes: readonly number[] };

export function parseApproval(raw: string | null, itemCount: number): ApprovalToken {
  if (raw === null) {
    throw new Error(
      `approval field is null — operator has not approved the proposal. Set "approval" to "y", "n", or a 1-based comma-separated index list (e.g. "1,3,5").`,
    );
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      `approval field is empty — set to "y", "n", or a 1-based comma-separated index list.`,
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
        `approval token contained non-integer entry '${part}' — expected y, n, or 1-based comma-separated integers.`,
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
      `approval token parsed to an empty subset — use "n" to abort or list at least one index.`,
    );
  }
  return { kind: 'subset', indexes };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isProposalItemShape(value: unknown): value is ProposalItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.number === 'number' &&
    typeof v.title === 'string' &&
    typeof v.url === 'string' &&
    typeof v.age_days === 'number' &&
    (v.comment_age_days === null || typeof v.comment_age_days === 'number') &&
    isStringArray(v.labels) &&
    typeof v.body_excerpt === 'string'
  );
}

function isProposalFile(value: unknown): value is ProposalFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.generated_at !== 'string' ||
    typeof v.bucket !== 'string' ||
    typeof v.query !== 'string' ||
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
    throw new Error(`Could not parse ${path} as JSON: ${message}`);
  }
  if (!isProposalFile(parsed)) {
    throw new Error(
      `${path} is not a valid proposal file (missing or malformed required fields).`,
    );
  }
  return parsed;
}

function selectedIndexes(token: ApprovalToken, itemCount: number): readonly number[] {
  if (token.kind === 'all') {
    return Array.from({ length: itemCount }, (_, i) => i + 1);
  }
  if (token.kind === 'none') return [];
  return token.indexes;
}

function gatherDisposition(item: ProposalItem): {
  readonly kind: DispositionKind;
  readonly fields: DispositionFields;
} | null {
  if (item.disposition === null || item.disposition_fields === null) return null;
  return { kind: item.disposition, fields: item.disposition_fields };
}

interface RunOneArgs {
  readonly item: ProposalItem;
  readonly itemIndex: number;
  readonly repo: string;
  readonly runGh: RunGh;
}

function runOne(args: RunOneArgs): ApplyOutcome {
  const dispatchInputs = gatherDisposition(args.item);
  if (dispatchInputs === null) {
    return {
      itemIndex: args.itemIndex,
      issueNumber: args.item.number,
      applied: false,
      result: null,
      error: `item #${args.item.number} has no disposition — fill in disposition + disposition_fields before applying.`,
      skipped: false,
    };
  }
  try {
    const dispatch = buildDispatch({
      issueNumber: args.item.number,
      kind: dispatchInputs.kind,
      fields: dispatchInputs.fields,
      repo: args.repo,
    });
    args.runGh(dispatch.args);
    return {
      itemIndex: args.itemIndex,
      issueNumber: args.item.number,
      applied: true,
      result: dispatch.result,
      error: null,
      skipped: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Capture only the first line — gh failures can be verbose, and the
    // post-apply summary is one line per failure.
    const firstLine = message.split('\n')[0] ?? message;
    return {
      itemIndex: args.itemIndex,
      issueNumber: args.item.number,
      applied: false,
      result: null,
      error: firstLine,
      skipped: false,
    };
  }
}

function updateItem(item: ProposalItem, outcome: ApplyOutcome): ProposalItem {
  return {
    ...item,
    applied: outcome.applied,
    apply_error: outcome.error,
    result: outcome.result,
  };
}

export function apply(args: ApplyArgs): ApplyResult {
  const file = readProposalFile(args.proposalPath);
  const repo = args.repo ?? file.repo;
  const token = parseApproval(file.approval, file.items.length);

  if (token.kind === 'none') {
    return {
      outcomes: [],
      aborted: true,
      summary: { applied: 0, failed: 0, skipped: file.items.length },
    };
  }

  const chosen = new Set(selectedIndexes(token, file.items.length));
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
    const outcome = runOne({ item, itemIndex: oneBased, repo, runGh: args.runGh });
    outcomes.push(outcome);
    if (outcome.skipped) return item;
    return updateItem(item, outcome);
  });

  // Write the post-apply state back to disk so the file reflects what
  // landed. The propose step's audit trail is preserved (generated_at,
  // bucket, query, repo, approval) and the per-item applied/result/error
  // fields are now populated.
  const next: ProposalFile = { ...file, items: updatedItems };
  writeFileSync(args.proposalPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  const summary: ApplySummary = {
    applied: outcomes.filter((o) => o.applied).length,
    failed: outcomes.filter((o) => !o.applied && !o.skipped).length,
    skipped: outcomes.filter((o) => o.skipped).length,
  };

  return { outcomes, aborted: false, summary };
}
