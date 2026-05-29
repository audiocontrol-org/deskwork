/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-editor.ts
 *
 * Apply rendered task blocks to a workplan.md atomically.
 *
 * Two entry points:
 *
 *   - `insertTaskBlock(opts)` — pure-over-input: reads the workplan
 *     via the injected ReadWorkplan seam, runs all validations, returns
 *     the new file content. The caller decides when to write.
 *
 *   - `applyTaskBlocks(opts)` — convenience wrapper: insertTaskBlock +
 *     a WriteWorkplan call. Write only fires when validation passes.
 *
 * Atomicity story:
 *
 *   - The workplan is READ once at the start.
 *   - All insertions are validated against the read snapshot BEFORE any
 *     line gets touched (phase exists, anchor in-range, anchor sits
 *     inside the named phase). Any failure throws WorkplanInsertionError
 *     and NO mutation happens.
 *   - Once every insertion validates, the editor sorts them DESC by
 *     `insertAfterLine`. Processing high-to-low means inserts don't
 *     shift line numbers earlier insertions depend on.
 *   - The new content is the in-memory line array joined with `\n`.
 *
 * Drift on `phaseHeading` is the operator's responsibility: the
 * proposal file captured the heading at propose-time; if the workplan
 * has been re-edited between propose and apply such that the heading
 * doesn't appear verbatim, the validator surfaces the mismatch with a
 * specific error message naming both expected and actual.
 */

import type {
  ReadWorkplan,
  WorkplanInsertion,
  WriteWorkplan,
} from './types.js';

export class WorkplanInsertionError extends Error {
  override name = 'WorkplanInsertionError';
}

export interface InsertTaskBlockArgs {
  readonly workplanPath: string;
  readonly insertions: readonly WorkplanInsertion[];
  readonly read: ReadWorkplan;
}

export interface InsertTaskBlockResult {
  readonly newContent: string;
}

const PHASE_HEADING_RE = /^##\s+Phase\b/i;

interface PhaseLocation {
  /** 1-based line number of the `## Phase ...` heading. */
  readonly headingLine: number;
  /** 1-based line number of the LAST line in the phase (last line before the next `## Phase ...` heading OR EOF). */
  readonly lastLine: number;
}

function findPhaseByHeading(
  lines: readonly string[],
  phaseHeading: string,
): PhaseLocation | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim() !== phaseHeading.trim()) continue;
    // Walk forward to find the next phase heading (or EOF).
    let last = lines.length; // 1-based EOF (line count)
    for (let j = i + 1; j < lines.length; j += 1) {
      const inner = lines[j];
      if (inner === undefined) continue;
      if (PHASE_HEADING_RE.test(inner)) {
        last = j; // 1-based last line of this phase = the line right before the next heading
        break;
      }
    }
    return { headingLine: i + 1, lastLine: last };
  }
  return null;
}

function validateOne(
  lines: readonly string[],
  insertion: WorkplanInsertion,
): void {
  const phase = findPhaseByHeading(lines, insertion.phaseHeading);
  if (phase === null) {
    throw new WorkplanInsertionError(
      `phase heading not found in workplan: '${insertion.phaseHeading}' (finding ${insertion.findingId}).`,
    );
  }
  if (insertion.insertAfterLine < 1 || insertion.insertAfterLine > lines.length) {
    throw new WorkplanInsertionError(
      `insertAfterLine ${insertion.insertAfterLine} is out of range (workplan has ${lines.length} lines; finding ${insertion.findingId}).`,
    );
  }
  if (
    insertion.insertAfterLine < phase.headingLine ||
    insertion.insertAfterLine > phase.lastLine
  ) {
    throw new WorkplanInsertionError(
      `insertAfterLine ${insertion.insertAfterLine} does not sit inside phase '${insertion.phaseHeading}' (phase spans lines ${phase.headingLine}..${phase.lastLine}; finding ${insertion.findingId}).`,
    );
  }
}

export async function insertTaskBlock(
  args: InsertTaskBlockArgs,
): Promise<InsertTaskBlockResult> {
  const content = await args.read(args.workplanPath);
  const lines = content.split('\n');

  // Validate every insertion BEFORE mutating anything.
  for (const insertion of args.insertions) {
    validateOne(lines, insertion);
  }

  // Sort descending by insertAfterLine so later-line inserts don't
  // shift the anchors of earlier-line inserts.
  const sorted = [...args.insertions].sort(
    (a, b) => b.insertAfterLine - a.insertAfterLine,
  );

  const out = [...lines];
  for (const insertion of sorted) {
    const idx = insertion.insertAfterLine; // splice insertion AFTER the line means at the 0-based index `insertion.insertAfterLine`
    const blockLines = `\n${insertion.taskBlock}\n`.split('\n');
    out.splice(idx, 0, ...blockLines);
  }

  return { newContent: out.join('\n') };
}

export interface ApplyTaskBlocksArgs extends InsertTaskBlockArgs {
  readonly write: WriteWorkplan;
}

export async function applyTaskBlocks(
  args: ApplyTaskBlocksArgs,
): Promise<void> {
  const { newContent } = await insertTaskBlock(args);
  await args.write(args.workplanPath, newContent);
}
