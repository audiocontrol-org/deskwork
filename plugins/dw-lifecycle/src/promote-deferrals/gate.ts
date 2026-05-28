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

// Validate every declared field on ProposalItem rather than the 5-field
// subset the previous guard checked. A malformed item with missing
// `disposition_fields` / `applied` / `apply_error` / `result` / `sample`
// keys would otherwise pass the guard and then trip a TypeError deeper
// in the apply pipeline. Returns the per-field failure name so the
// caller can surface it via InvalidProposalFileError.
type ItemValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly missing: string };

function isNullOrType(value: unknown, kind: 'string' | 'number' | 'boolean' | 'object'): boolean {
  if (value === null) return true;
  if (kind === 'object') return typeof value === 'object' && !Array.isArray(value);
  return typeof value === kind;
}

function validateProposalItemShape(value: unknown): ItemValidationResult {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, missing: '(item is not an object)' };
  }
  const v = value as Record<string, unknown>;
  // Required scalar fields.
  if (typeof v.lineNumber !== 'number') return { ok: false, missing: 'lineNumber' };
  if (typeof v.markerKey !== 'string') return { ok: false, missing: 'markerKey' };
  if (typeof v.text !== 'string') return { ok: false, missing: 'text' };
  // Nullable-string fields. Each must EXIST as a key with the right shape.
  if (!isNullOrType(v.containingTask, 'string')) return { ok: false, missing: 'containingTask' };
  if (!isNullOrType(v.parentPhase, 'string')) return { ok: false, missing: 'parentPhase' };
  if (!('containingTaskLine' in v) || !isNullOrType(v.containingTaskLine, 'number')) {
    return { ok: false, missing: 'containingTaskLine' };
  }
  if (!('parentPhaseLine' in v) || !isNullOrType(v.parentPhaseLine, 'number')) {
    return { ok: false, missing: 'parentPhaseLine' };
  }
  // Disposition fields. Both halves are nullable but must exist as keys.
  if (!('disposition' in v) || !isNullOrType(v.disposition, 'string')) {
    return { ok: false, missing: 'disposition' };
  }
  if (!('disposition_fields' in v) || !isNullOrType(v.disposition_fields, 'object')) {
    return { ok: false, missing: 'disposition_fields' };
  }
  // Outcome fields populated by apply. Each must exist as a key.
  if (!('applied' in v) || !isNullOrType(v.applied, 'boolean')) {
    return { ok: false, missing: 'applied' };
  }
  if (!('apply_error' in v) || !isNullOrType(v.apply_error, 'string')) {
    return { ok: false, missing: 'apply_error' };
  }
  if (!('result' in v) || !isNullOrType(v.result, 'string')) {
    return { ok: false, missing: 'result' };
  }
  return { ok: true };
}


function isProposalFileTopLevel(value: unknown): value is { items: unknown[] } & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.generated_at === 'string' &&
    typeof v.workplan_path === 'string' &&
    typeof v.repo === 'string' &&
    Array.isArray(v.items)
  );
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
  if (!isProposalFileTopLevel(parsed)) {
    throw new InvalidProposalFileError(
      `${path} is not a valid proposal file (missing or malformed required fields).`,
    );
  }
  // Walk each item; surface the per-field failure name so the operator
  // can locate the malformed row. A row missing any declared field
  // (disposition / disposition_fields / applied / apply_error / result /
  // containingTaskLine / parentPhaseLine) aborts the gate with the
  // field name in the message — pre-Fix-4 the missing field would have
  // tripped a TypeError deeper in the apply pipeline.
  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i];
    const check = validateProposalItemShape(item);
    if (!check.ok) {
      throw new InvalidProposalFileError(
        `malformed item at index ${i}: missing field '${check.missing}'`,
      );
    }
  }
  return parsed as unknown as ProposalFile;
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
