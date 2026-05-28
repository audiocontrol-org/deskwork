// apply: reads a filled-in proposal file, runs the all-or-nothing
// pre-validation gate, dispatches `gh issue create` for promote-to-issue
// rows, rewrites the workplan in place for both disposition kinds, and
// records per-item outcomes.
//
// Partial-success semantics: structural failures (malformed JSON, missing
// required fields, approved items whose disposition_fields are invalid)
// throw InvalidProposalFileError BEFORE any gh call or workplan write
// (via gate.ts). Once the gate clears, each item runs independently —
// a gh failure on row 3 does not abort rows 4..N. Workplan edits are
// accumulated in memory and written once at the end so a per-row
// workplan-edit error (drift detected) doesn't corrupt the file.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  buildDispatch,
  parseIssueNumberFromGhOutput,
} from './dispositions.js';
import {
  gatherDisposition,
  InvalidProposalFileError,
  parseApproval,
  readProposalFile,
  selectedIndexes,
  validateAllApproved,
} from './gate.js';
import type { ApprovalToken } from './gate.js';
import {
  appendBacklink,
  replaceWithWontfix,
  WorkplanDriftError,
} from './workplan-edit.js';
import type {
  InlineWontfixFields,
  ProposalFile,
  ProposalItem,
  ReadWorkplanFile,
  RunGh,
  WriteWorkplanFile,
} from './types.js';

export { InvalidProposalFileError, parseApproval, readProposalFile };
export type { ApprovalToken };

export interface ApplyArgs {
  readonly proposalPath: string;
  readonly runGh: RunGh;
  // Optional overrides for the workplan file readers/writers. Tests inject
  // in-memory shims; production defaults to node:fs.
  readonly readWorkplan?: ReadWorkplanFile;
  readonly writeWorkplan?: WriteWorkplanFile;
  // Optional repo override. When unset, the apply layer uses the `repo`
  // baked into the proposal file.
  readonly repo?: string;
}

export interface ApplyOutcome {
  readonly itemIndex: number;
  readonly lineNumber: number;
  readonly applied: boolean;
  readonly result: string | null;
  readonly error: string | null;
  readonly skipped: boolean;
  // When the disposition was promote-to-issue and succeeded, the new GH
  // issue number captured from `gh issue create`. Null otherwise.
  readonly issueNumber: number | null;
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

interface RunOneArgs {
  readonly item: ProposalItem;
  readonly itemIndex: number;
  readonly repo: string;
  readonly runGh: RunGh;
  readonly workplanContent: string;
}

interface RunOneResult {
  readonly outcome: ApplyOutcome;
  readonly nextWorkplanContent: string;
}

function failedOutcome(args: RunOneArgs, error: string): RunOneResult {
  return {
    outcome: {
      itemIndex: args.itemIndex,
      lineNumber: args.item.lineNumber,
      applied: false,
      result: null,
      error,
      skipped: false,
      issueNumber: null,
    },
    nextWorkplanContent: args.workplanContent,
  };
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}

function runPromoteToIssue(
  args: RunOneArgs,
  ghArgs: readonly string[],
): RunOneResult {
  let stdout: string;
  try {
    stdout = args.runGh(ghArgs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failedOutcome(args, firstLine(message));
  }
  let newIssueNumber: number;
  try {
    newIssueNumber = parseIssueNumberFromGhOutput(stdout);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failedOutcome(
      args,
      `gh issue create succeeded but issue number could not be parsed: ${firstLine(message)}`,
    );
  }
  let nextContent: string;
  try {
    nextContent = appendBacklink({
      content: args.workplanContent,
      sample: { lineNumber: args.item.lineNumber, expectedText: args.item.text },
      issueNumber: newIssueNumber,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      outcome: {
        itemIndex: args.itemIndex,
        lineNumber: args.item.lineNumber,
        applied: false,
        result: null,
        error: `gh issue #${newIssueNumber} created but workplan edit failed: ${firstLine(message)}`,
        skipped: false,
        issueNumber: newIssueNumber,
      },
      nextWorkplanContent: args.workplanContent,
    };
  }
  return {
    outcome: {
      itemIndex: args.itemIndex,
      lineNumber: args.item.lineNumber,
      applied: true,
      result: `created-issue #${newIssueNumber}; appended back-link to workplan`,
      error: null,
      skipped: false,
      issueNumber: newIssueNumber,
    },
    nextWorkplanContent: nextContent,
  };
}

function runInlineWontfix(
  args: RunOneArgs,
  fields: InlineWontfixFields,
): RunOneResult {
  let nextContent: string;
  try {
    nextContent = replaceWithWontfix({
      content: args.workplanContent,
      sample: { lineNumber: args.item.lineNumber, expectedText: args.item.text },
      reason: fields.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof WorkplanDriftError) {
      return failedOutcome(args, `workplan drift: ${firstLine(message)}`);
    }
    return failedOutcome(args, firstLine(message));
  }
  return {
    outcome: {
      itemIndex: args.itemIndex,
      lineNumber: args.item.lineNumber,
      applied: true,
      result: `inline-wontfix; rewrote workplan line ${args.item.lineNumber}`,
      error: null,
      skipped: false,
      issueNumber: null,
    },
    nextWorkplanContent: nextContent,
  };
}

function runOne(args: RunOneArgs): RunOneResult {
  const gathered = gatherDisposition(args.item, args.itemIndex);
  if (gathered.kind === 'absent') {
    return failedOutcome(
      args,
      `item ${args.itemIndex} has no disposition — fill in disposition + disposition_fields before applying.`,
    );
  }
  if (gathered.kind === 'half-filled') {
    // Unreachable when reached via apply(): the pre-validation gate
    // catches half-filled items. Defensive surface for direct callers.
    return failedOutcome(args, gathered.error);
  }
  let dispatch;
  try {
    dispatch = buildDispatch({
      kind: gathered.disposition,
      fields: gathered.fields,
      repo: args.repo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failedOutcome(args, firstLine(message));
  }
  if (gathered.disposition === 'promote-to-issue') {
    return runPromoteToIssue(args, dispatch.args);
  }
  return runInlineWontfix(args, gathered.fields as InlineWontfixFields);
}

function updateItem(item: ProposalItem, outcome: ApplyOutcome): ProposalItem {
  return {
    ...item,
    applied: outcome.applied,
    apply_error: outcome.error,
    result: outcome.result,
  };
}

function defaultReadWorkplan(path: string): string {
  return readFileSync(path, 'utf8');
}

function defaultWriteWorkplan(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
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
  validateAllApproved(file.items, chosen);

  const readWorkplan = args.readWorkplan ?? defaultReadWorkplan;
  const writeWorkplan = args.writeWorkplan ?? defaultWriteWorkplan;
  let workplanContent = readWorkplan(file.workplan_path);

  const outcomes: ApplyOutcome[] = [];
  const updatedItems: ProposalItem[] = file.items.map((i) => ({ ...i }));

  // Record skipped rows up-front so the outcome list covers every item
  // by index. Approved rows then process in descending line order (the
  // in-place edits don't shift lines, but high-to-low matches the
  // convention used elsewhere and reduces surprise if the edit semantics
  // ever change).
  for (let i = 0; i < file.items.length; i++) {
    const oneBased = i + 1;
    if (chosen.has(oneBased)) continue;
    const item = file.items[i];
    if (item === undefined) continue;
    outcomes.push({
      itemIndex: oneBased,
      lineNumber: item.lineNumber,
      applied: false,
      result: null,
      error: null,
      skipped: true,
      issueNumber: null,
    });
  }
  const approvedDescending = Array.from(chosen).sort((a, b) => b - a);
  for (const oneBased of approvedDescending) {
    const item = file.items[oneBased - 1];
    if (item === undefined) continue;
    const result = runOne({
      item,
      itemIndex: oneBased,
      repo,
      runGh: args.runGh,
      workplanContent,
    });
    outcomes.push(result.outcome);
    workplanContent = result.nextWorkplanContent;
    updatedItems[oneBased - 1] = updateItem(item, result.outcome);
  }

  outcomes.sort((a, b) => a.itemIndex - b.itemIndex);
  writeWorkplan(file.workplan_path, workplanContent);
  const next: ProposalFile = { ...file, items: updatedItems };
  writeFileSync(args.proposalPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  const summary: ApplySummary = {
    applied: outcomes.filter((o) => o.applied).length,
    failed: outcomes.filter((o) => !o.applied && !o.skipped).length,
    skipped: outcomes.filter((o) => o.skipped).length,
  };
  return { outcomes, aborted: false, summary };
}

// Surfaced for tests that want to exercise the gate logic directly.
export function preValidateApproved(
  file: ProposalFile,
  token: ApprovalToken,
): void {
  const chosen = new Set(selectedIndexes(token, file.items.length));
  validateAllApproved(file.items, chosen);
}
