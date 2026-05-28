// Pre-apply validation primitives shared between apply.ts and tests.
//
// Three concerns live here:
//   - parseApproval: turns the proposal file's `approval` string into a
//     structured ApprovalToken.
//   - readProposalFile + isProposalFile: JSON load + structural guard.
//   - gatherDisposition: per-item gate that classifies a row as present /
//     absent / half-filled. apply.ts walks the approved subset and throws
//     InvalidProposalFileError on the first half-filled or invalid-fields
//     row before any mutation runs.

import { readFileSync } from 'node:fs';
import { validateDisposition } from './dispositions.js';
import type {
  DispositionFields,
  DispositionKind,
  ProposalFile,
  ProposalItem,
} from './types.js';

export class InvalidProposalFileError extends Error {
  override name = 'InvalidProposalFileError';
}

export type ApprovalToken =
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'subset'; readonly indexes: readonly number[] };

export function parseApproval(
  raw: string | null,
  itemCount: number,
): ApprovalToken {
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

function isProposalItemShape(value: unknown): value is ProposalItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.lineNumber === 'number' &&
    typeof v.markerKey === 'string' &&
    typeof v.text === 'string' &&
    (v.containingTask === null || typeof v.containingTask === 'string') &&
    (v.parentPhase === null || typeof v.parentPhase === 'string')
  );
}

function isProposalFile(value: unknown): value is ProposalFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.generated_at !== 'string' ||
    typeof v.workplan_path !== 'string' ||
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

export function selectedIndexes(
  token: ApprovalToken,
  count: number,
): readonly number[] {
  if (token.kind === 'all') {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  if (token.kind === 'none') return [];
  return token.indexes;
}

export type GatheredDisposition =
  | {
      readonly kind: 'present';
      readonly disposition: DispositionKind;
      readonly fields: DispositionFields;
    }
  | { readonly kind: 'absent' }
  | { readonly kind: 'half-filled'; readonly error: string };

export function gatherDisposition(
  item: ProposalItem,
  oneBased: number,
): GatheredDisposition {
  const dispositionSet = item.disposition !== null;
  const fieldsSet = item.disposition_fields !== null;
  if (!dispositionSet && !fieldsSet) return { kind: 'absent' };
  if (dispositionSet && !fieldsSet) {
    return {
      kind: 'half-filled',
      error: `item ${oneBased} (line ${item.lineNumber}) has disposition '${item.disposition}' but disposition_fields is null — fill in disposition_fields before applying.`,
    };
  }
  if (!dispositionSet && fieldsSet) {
    return {
      kind: 'half-filled',
      error: `item ${oneBased} (line ${item.lineNumber}) has disposition_fields set but disposition is null — fill in disposition before applying.`,
    };
  }
  if (item.disposition === null || item.disposition_fields === null) {
    throw new Error(
      `internal invariant: item ${oneBased} disposition gather reached an impossible branch.`,
    );
  }
  return {
    kind: 'present',
    disposition: item.disposition,
    fields: item.disposition_fields,
  };
}

// All-or-nothing pre-validation gate. Walks every approved item; throws
// InvalidProposalFileError on the first half-filled or invalid-fields row.
// Items in 'absent' state are NOT a gate failure — they fall through to
// the per-row apply loop, which records the inline "no disposition" error
// for that row only.
export function validateAllApproved(
  items: readonly ProposalItem[],
  approvedSet: ReadonlySet<number>,
): void {
  for (let i = 0; i < items.length; i++) {
    const oneBased = i + 1;
    if (!approvedSet.has(oneBased)) continue;
    const item = items[i];
    if (item === undefined) continue;
    const gathered = gatherDisposition(item, oneBased);
    if (gathered.kind === 'absent') continue;
    if (gathered.kind === 'half-filled') {
      throw new InvalidProposalFileError(
        `Item ${oneBased} is half-filled: ${gathered.error}`,
      );
    }
    try {
      validateDisposition(gathered.disposition, gathered.fields);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InvalidProposalFileError(
        `Item ${oneBased} (line ${item.lineNumber}, disposition '${gathered.disposition}') has invalid disposition_fields: ${message}`,
      );
    }
  }
}
