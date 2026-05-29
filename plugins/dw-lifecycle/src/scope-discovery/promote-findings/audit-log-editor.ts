/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/audit-log-editor.ts
 *
 * Flip audit-log entry `Status:` values from `open` to a new value
 * (e.g., `acknowledged-#NNN`, `informational`) in place.
 *
 * Behavior contract (per task brief):
 *
 *   - Read the audit-log ONCE.
 *   - For each flip:
 *     - Locate the `Finding-ID:` line matching `findingId`.
 *     - Locate the `Status:` line below it (scanning downward).
 *     - Drift check #1: the line at the located position MUST start
 *       with `Status:` (case-sensitive). Throw AuditLogEditError otherwise.
 *     - Drift check #2: the existing status MUST be `open`. Throw with
 *       a descriptive message otherwise (refuses to flip an already-
 *       flipped entry).
 *     - Replace ONLY the status value; preserve the `Status:` prefix +
 *       any leading whitespace verbatim.
 *   - All flips validated (and applied to the in-memory line array)
 *     all-or-nothing: any single failure throws BEFORE the wrapper's
 *     write step would fire.
 *   - Returns the new file content. Caller writes.
 *
 * Atomicity story: the in-memory line array is mutated as flips
 * succeed, but the function only returns the joined content when EVERY
 * flip has succeeded. A throw mid-loop discards the partially-mutated
 * lines; the read+write wrapper (`applyStatusFlips`) calls `write`
 * only on success. Tests inject in-memory shims; production uses the
 * fs seam through the subcommand.
 */

import type {
  ReadAuditLog,
  WriteAuditLog,
} from './types.js';

export class AuditLogEditError extends Error {
  override name = 'AuditLogEditError';
}

export interface StatusFlip {
  readonly findingId: string;
  readonly newStatus: string;
}

export interface FlipAuditLogStatusArgs {
  readonly auditLogPath: string;
  readonly flips: readonly StatusFlip[];
  readonly read: ReadAuditLog;
}

export interface FlipAuditLogStatusResult {
  readonly newContent: string;
}

const FINDING_ID_LINE_RE = /^Finding-ID:\s*(.+?)\s*$/;
// Capture the leading `Status:` token + the whitespace gap, separately
// from the status value. The preserved prefix is `Status:` PLUS the
// gap; replacing only the value preserves the formatting verbatim.
const STATUS_LINE_RE = /^(Status:\s*)(.*?)\s*$/;

function findFindingIdLine(
  lines: readonly string[],
  findingId: string,
): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = FINDING_ID_LINE_RE.exec(line);
    if (match === null) continue;
    if (match[1] === findingId) return i;
  }
  return null;
}

// Field-line shape `<FieldName>: <value>`. Matches the audit-log-parser's
// FIELD_LINE_RE so the field-block boundary detection here stays in sync
// with how the parser sees entries.
const FIELD_LINE_RE = /^([A-Za-z][A-Za-z0-9 -]+):\s*(.*)$/;

// Locate the `Status:` line within the SAME entry block as the
// Finding-ID line. Scan downward from the line after the Finding-ID
// line; restrict to the FIELD BLOCK (consecutive field-shaped lines).
// Stop at the next `### ` / `## ` heading (entry/section boundary),
// blank line (field block ends), or non-field-shaped line (body prose
// begins). This prevents body prose that happens to start with
// `Status:` (e.g., quoted example output, before/after sidecar values)
// from being mistaken for the entry's canonical Status field.
function findStatusLineForEntry(
  lines: readonly string[],
  findingIdLineIdx: number,
): { lineIdx: number; line: string } | null {
  for (let i = findingIdLineIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.startsWith('### ') || line.startsWith('## ')) return null;
    if (line.trim() === '') return null;
    if (!FIELD_LINE_RE.test(line)) return null;
    if (line.startsWith('Status:')) return { lineIdx: i, line };
  }
  return null;
}

export async function flipAuditLogStatus(
  args: FlipAuditLogStatusArgs,
): Promise<FlipAuditLogStatusResult> {
  const content = await args.read(args.auditLogPath);
  const lines = content.split('\n');
  const out = [...lines];

  for (const flip of args.flips) {
    const findingIdLine = findFindingIdLine(out, flip.findingId);
    if (findingIdLine === null) {
      throw new AuditLogEditError(
        `Finding-ID '${flip.findingId}' not found in audit-log at ${args.auditLogPath}.`,
      );
    }
    const located = findStatusLineForEntry(out, findingIdLine);
    if (located === null) {
      throw new AuditLogEditError(
        `Status: line not found for Finding-ID '${flip.findingId}' (audit-log drifted; entry on line ${findingIdLine + 1} has no Status: line in its block).`,
      );
    }
    // Drift check #1 is already covered by the regex below — if the
    // line doesn't match the `Status:` shape we throw. Drift check #2
    // verifies the value is currently `open`.
    const statusMatch = STATUS_LINE_RE.exec(located.line);
    if (statusMatch === null) {
      throw new AuditLogEditError(
        `Status line at line ${located.lineIdx + 1} does not parse for Finding-ID '${flip.findingId}'; refusing to flip.`,
      );
    }
    const currentValue = statusMatch[2] ?? '';
    if (currentValue !== 'open') {
      throw new AuditLogEditError(
        `Finding-ID '${flip.findingId}' has Status '${currentValue}' (not 'open'); refusing to flip an already-dispositioned finding.`,
      );
    }
    const prefix = statusMatch[1] ?? 'Status: ';
    out[located.lineIdx] = `${prefix}${flip.newStatus}`;
  }

  return { newContent: out.join('\n') };
}

export interface ApplyStatusFlipsArgs extends FlipAuditLogStatusArgs {
  readonly write: WriteAuditLog;
}

export async function applyStatusFlips(args: ApplyStatusFlipsArgs): Promise<void> {
  const { newContent } = await flipAuditLogStatus(args);
  await args.write(args.auditLogPath, newContent);
}
