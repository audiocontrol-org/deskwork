// Disposition validators + gh argv builders for the promote-deferrals
// apply step.
//
// Mirrors the triage-issues/dispositions.ts shape (Phase 2). The library
// does NOT execute gh; it constructs the argv vector and the result
// string. The apply layer hands the vector to the runGh callback.
//
// Two disposition kinds:
//   - promote-to-issue: validates title (non-empty, ≤100 chars) + body
//     (≥40 chars). Builds `gh issue create` argv.
//   - inline-wontfix: validates reason via validateSubstantiveReason. The
//     apply layer drives the workplan-edit (not gh); buildDispatch returns
//     an empty argv for this kind because no subprocess fires.

import { validateSubstantiveReason } from './substantive-reason.js';
import type {
  DispositionFields,
  DispositionKind,
  InlineWontfixFields,
  PromoteToIssueFields,
} from './types.js';

const MAX_TITLE_LENGTH = 100;
const MIN_BODY_LENGTH = 40;

function isPromoteToIssueFields(
  fields: DispositionFields,
): fields is PromoteToIssueFields {
  const v = fields as { title?: unknown; body?: unknown };
  return typeof v.title === 'string' && typeof v.body === 'string';
}

function isInlineWontfixFields(
  fields: DispositionFields,
): fields is InlineWontfixFields {
  return typeof (fields as { reason?: unknown }).reason === 'string';
}

// Validates the disposition_fields shape matches the disposition kind.
// Throws with a per-field message. Called by apply.ts before mutating gh
// or the workplan, so a malformed proposal file fails loud rather than
// partially executing.
export function validateDisposition(
  kind: DispositionKind,
  fields: DispositionFields,
): void {
  switch (kind) {
    case 'promote-to-issue': {
      if (!isPromoteToIssueFields(fields)) {
        throw new Error(
          `disposition 'promote-to-issue' requires string 'title' and string 'body' fields.`,
        );
      }
      const titleTrimmed = fields.title.trim();
      if (titleTrimmed === '') {
        throw new Error(`disposition 'promote-to-issue' has empty 'title'.`);
      }
      if (titleTrimmed.length > MAX_TITLE_LENGTH) {
        throw new Error(
          `disposition 'promote-to-issue' 'title' is ${titleTrimmed.length} chars; maximum is ${MAX_TITLE_LENGTH}.`,
        );
      }
      const bodyTrimmed = fields.body.trim();
      if (bodyTrimmed.length < MIN_BODY_LENGTH) {
        throw new Error(
          `disposition 'promote-to-issue' 'body' is ${bodyTrimmed.length} chars; minimum is ${MIN_BODY_LENGTH} (embed the surrounding workplan context).`,
        );
      }
      return;
    }
    case 'inline-wontfix': {
      if (!isInlineWontfixFields(fields)) {
        throw new Error(
          `disposition 'inline-wontfix' requires string 'reason' field.`,
        );
      }
      const result = validateSubstantiveReason(fields.reason);
      if (!result.valid) {
        throw new Error(
          `disposition 'inline-wontfix' has invalid 'reason': ${result.reason ?? 'unknown failure'}`,
        );
      }
      return;
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown disposition kind: ${String(exhaustive)}`);
    }
  }
}

export interface BuiltDispatch {
  // The gh argv vector. For inline-wontfix this is empty (no subprocess fires).
  readonly args: readonly string[];
  // A short past-tense description for the post-apply summary line.
  readonly result: string;
  // Whether this disposition needs the runGh callback. inline-wontfix sets
  // false; promote-to-issue sets true. The apply layer reads this to decide
  // whether to invoke runGh.
  readonly invokeGh: boolean;
}

export interface BuildDispatchArgs {
  readonly kind: DispositionKind;
  readonly fields: DispositionFields;
  readonly repo: string;
}

export function buildDispatch(args: BuildDispatchArgs): BuiltDispatch {
  validateDisposition(args.kind, args.fields);
  switch (args.kind) {
    case 'promote-to-issue': {
      const f = args.fields as PromoteToIssueFields;
      return {
        args: [
          'issue',
          'create',
          '--repo',
          args.repo,
          '--title',
          f.title.trim(),
          '--body',
          f.body,
        ],
        result: 'created-issue',
        invokeGh: true,
      };
    }
    case 'inline-wontfix': {
      return {
        args: [],
        result: 'inline-wontfix',
        invokeGh: false,
      };
    }
    default: {
      const exhaustive: never = args.kind;
      throw new Error(`Unknown disposition kind: ${String(exhaustive)}`);
    }
  }
}

// Parses the issue number from `gh issue create`'s stdout. gh prints the
// new issue URL on a line by itself (e.g.
// `https://github.com/owner/repo/issues/123`); we trim and extract the
// trailing integer.
export function parseIssueNumberFromGhOutput(stdout: string): number {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    throw new Error(
      `gh issue create returned empty stdout; cannot extract new issue number.`,
    );
  }
  // gh may emit prelude lines on some versions; the URL is on its own line.
  const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const lastLine = lines[lines.length - 1];
  if (lastLine === undefined) {
    throw new Error(
      `gh issue create stdout had no non-empty lines; cannot extract new issue number.`,
    );
  }
  const match = /\/issues\/(\d+)\b/.exec(lastLine);
  if (!match) {
    throw new Error(
      `gh issue create stdout did not match the expected URL shape (last line was '${lastLine.slice(0, 120)}').`,
    );
  }
  const numberPart = match[1];
  if (numberPart === undefined) {
    throw new Error(
      `gh issue create stdout matched URL shape but issue number was missing.`,
    );
  }
  const n = Number.parseInt(numberPart, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `gh issue create returned non-positive issue number '${numberPart}'.`,
    );
  }
  return n;
}
