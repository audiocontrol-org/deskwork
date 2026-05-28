import type {
  CloseWontfixFields,
  DispositionFields,
  DispositionKind,
  DuplicateFields,
  LabelFields,
  LeaveWithCommentFields,
} from './types.js';

// Each disposition shape maps to a gh argv vector + a short human-readable
// `result` string. The library does NOT execute gh here; it only constructs
// the argv vector + the result string. The apply layer (apply.ts) is what
// hands the vector to the runGh callback.

export interface BuiltDispatch {
  // The gh argv vector. The `repo` argument is appended by the caller via
  // `--repo <owner/repo>` (kept out of this module so the per-disposition
  // logic stays focused on the action shape).
  readonly args: readonly string[];
  // A short past-tense description for the post-apply summary line.
  readonly result: string;
}

function ensureNonEmpty(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `disposition field '${field}' must be a non-empty string.`,
    );
  }
  return value;
}

function isCloseWontfixFields(fields: DispositionFields): fields is CloseWontfixFields {
  return (
    typeof (fields as { reason?: unknown }).reason === 'string' &&
    (fields as { reason: string }).reason.trim() !== ''
  );
}

function isLabelFields(fields: DispositionFields): fields is LabelFields {
  const v = fields as { labels?: unknown };
  if (!Array.isArray(v.labels) || v.labels.length === 0) return false;
  return v.labels.every((l: unknown) => typeof l === 'string' && l.trim() !== '');
}

function isDuplicateFields(fields: DispositionFields): fields is DuplicateFields {
  const v = fields as { dup_of?: unknown; reason?: unknown };
  return (
    typeof v.dup_of === 'number' &&
    Number.isInteger(v.dup_of) &&
    v.dup_of > 0 &&
    typeof v.reason === 'string' &&
    v.reason.trim() !== ''
  );
}

function isLeaveWithCommentFields(
  fields: DispositionFields,
): fields is LeaveWithCommentFields {
  return (
    typeof (fields as { comment?: unknown }).comment === 'string' &&
    (fields as { comment: string }).comment.trim() !== ''
  );
}

// Validates the disposition_fields shape matches the disposition kind. Throws
// with a per-field message identifying the missing or malformed property.
// Called by apply.ts before mutating gh, so a malformed proposal file fails
// loud rather than partially executing.
export function validateDisposition(
  kind: DispositionKind,
  fields: DispositionFields,
): void {
  switch (kind) {
    case 'close-wontfix':
      if (!isCloseWontfixFields(fields)) {
        ensureNonEmpty('reason', (fields as { reason?: unknown }).reason);
      }
      return;
    case 'label':
      if (!isLabelFields(fields)) {
        throw new Error(
          `disposition 'label' requires non-empty 'labels' array of strings.`,
        );
      }
      return;
    case 'duplicate':
      if (!isDuplicateFields(fields)) {
        const v = fields as { dup_of?: unknown; reason?: unknown };
        if (typeof v.dup_of !== 'number' || !Number.isInteger(v.dup_of) || v.dup_of <= 0) {
          throw new Error(
            `disposition 'duplicate' requires positive integer 'dup_of'.`,
          );
        }
        ensureNonEmpty('reason', v.reason);
      }
      return;
    case 'leave-with-comment':
      if (!isLeaveWithCommentFields(fields)) {
        ensureNonEmpty('comment', (fields as { comment?: unknown }).comment);
      }
      return;
    default: {
      // Exhaustiveness check — TypeScript will flag any new DispositionKind
      // that doesn't appear in the switch above.
      const exhaustive: never = kind;
      throw new Error(`Unknown disposition kind: ${String(exhaustive)}`);
    }
  }
}

export interface BuildDispatchArgs {
  readonly issueNumber: number;
  readonly kind: DispositionKind;
  readonly fields: DispositionFields;
  readonly repo: string;
}

export function buildDispatch(args: BuildDispatchArgs): BuiltDispatch {
  validateDisposition(args.kind, args.fields);
  const repoArgs = ['--repo', args.repo];
  switch (args.kind) {
    case 'close-wontfix': {
      const f = args.fields as CloseWontfixFields;
      return {
        args: [
          'issue',
          'close',
          String(args.issueNumber),
          ...repoArgs,
          '--reason',
          'not planned',
          '--comment',
          f.reason,
        ],
        result: `closed-wontfix #${args.issueNumber}`,
      };
    }
    case 'label': {
      const f = args.fields as LabelFields;
      const labelArgs: string[] = [];
      for (const label of f.labels) {
        labelArgs.push('--add-label', label);
      }
      return {
        args: [
          'issue',
          'edit',
          String(args.issueNumber),
          ...repoArgs,
          ...labelArgs,
        ],
        result: `labeled #${args.issueNumber} (${f.labels.join(', ')})`,
      };
    }
    case 'duplicate': {
      const f = args.fields as DuplicateFields;
      const commentBody = `Closing as duplicate of #${f.dup_of}. ${f.reason}`;
      return {
        args: [
          'issue',
          'close',
          String(args.issueNumber),
          ...repoArgs,
          '--reason',
          'not planned',
          '--comment',
          commentBody,
        ],
        result: `closed-duplicate #${args.issueNumber} (of #${f.dup_of})`,
      };
    }
    case 'leave-with-comment': {
      const f = args.fields as LeaveWithCommentFields;
      return {
        args: [
          'issue',
          'comment',
          String(args.issueNumber),
          ...repoArgs,
          '--body',
          f.comment,
        ],
        result: `commented #${args.issueNumber}`,
      };
    }
    default: {
      const exhaustive: never = args.kind;
      throw new Error(`Unknown disposition kind: ${String(exhaustive)}`);
    }
  }
}
