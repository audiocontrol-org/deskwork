/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/slush-remaining.ts
 *
 * Phase 15 Task 7 — the "slush remaining" verb's pure-fn library.
 *
 * Operator directive (Phase 15 closeout, 2026-05-31):
 *   "We should address all of the auditors' findings, but when we've
 *    gone two consecutive audits with 0 high issues, we can bin the
 *    smaller items into the slush pile."
 *
 * This library mechanizes the slush. Inputs: the audit-log text +
 * the workplan text. Outputs: rewritten versions with all remaining
 * `Status: open` findings (within audit-barrage lift sections) flipped
 * to `Status: acknowledged-slush-pile-<YYYY-MM-DD>`, AND the matching
 * `(fix-finding-<canonical>)` workplan task blocks fully checked off.
 *
 * Refuses unless the dampener is engaged (per
 * `checkBarrageDampener` from the same directory) — slushing while
 * the audit still surfaces real bugs would erase signal. The
 * dampener is the structural gate; this verb is the action.
 *
 * Pure-fn: text → text. No fs. The CLI shim handles read/write.
 */

import { checkBarrageDampener } from './check-barrage-dampener.js';

const BARRAGE_HEADER_RE = /^##\s+\d{4}-\d{2}-\d{2}\s+—\s+audit-barrage\s+lift\s+\(([^)]+)\)/i;
const FINDING_ID_RE = /^Finding-ID:\s*(.+?)\s*$/i;
const STATUS_OPEN_RE = /^Status:\s*open\b/i;
const TOP_HEADER_RE = /^##\s+/;
const ENTRY_HEADER_RE = /^###\s+/;
const CANONICAL_AUDIT_ID_RE = /\bAUDIT-\d{8}-\d+/;

export interface SlushFlip {
  /** Canonical AUDIT-id of the flipped finding. */
  readonly findingId: string;
  /** Full Finding-ID line value (may carry cross-model annotation). */
  readonly fullFindingId: string;
  /** Whether the matching workplan task was found + flipped. */
  readonly workplanTaskFlipped: boolean;
}

export interface SlushRemainingArgs {
  readonly auditLogText: string;
  readonly workplanText: string;
  /** YYYY-MM-DD date for the `acknowledged-slush-pile-<date>` suffix. */
  readonly slushDate: string;
  /** Dampener threshold override; default 2 (matches the gate). */
  readonly threshold?: number;
}

export interface SlushRemainingResult {
  readonly dampenerEngaged: boolean;
  readonly dampenerReason: string;
  readonly flips: readonly SlushFlip[];
  readonly newAuditLogText: string;
  readonly newWorkplanText: string;
}

function canonicalAuditId(value: string): string {
  const m = CANONICAL_AUDIT_ID_RE.exec(value);
  return m !== null ? m[0] : value;
}

interface RawSection {
  readonly headerIndex: number;
  readonly endIndex: number;
}

function findBarrageSections(lines: ReadonlyArray<string>): RawSection[] {
  const headerIndices: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (BARRAGE_HEADER_RE.test(line)) headerIndices.push(i);
  }
  return headerIndices.map((headerIndex, idx) => {
    let endIndex = lines.length;
    for (let j = headerIndex + 1; j < lines.length; j += 1) {
      if (TOP_HEADER_RE.test(lines[j] ?? '')) {
        endIndex = j;
        break;
      }
    }
    const nextHeader = idx + 1 < headerIndices.length ? headerIndices[idx + 1]! : lines.length;
    if (nextHeader < endIndex) endIndex = nextHeader;
    return { headerIndex, endIndex };
  });
}

interface OpenFindingRef {
  readonly entryStart: number;
  readonly statusLineIndex: number;
  readonly findingId: string; // canonical
  readonly fullFindingId: string;
}

function findOpenFindingsInSections(
  lines: ReadonlyArray<string>,
  sections: ReadonlyArray<RawSection>,
): OpenFindingRef[] {
  const out: OpenFindingRef[] = [];
  for (const section of sections) {
    let i = section.headerIndex + 1;
    while (i < section.endIndex) {
      const line = lines[i] ?? '';
      if (!ENTRY_HEADER_RE.test(line)) {
        i += 1;
        continue;
      }
      // Walk this entry's field block.
      let statusLineIndex = -1;
      let fullFindingId: string | undefined;
      let j = i + 1;
      while (j < section.endIndex) {
        const inner = lines[j] ?? '';
        if (ENTRY_HEADER_RE.test(inner)) break;
        const fid = FINDING_ID_RE.exec(inner);
        if (fid !== null && fullFindingId === undefined) {
          fullFindingId = fid[1]!;
        }
        if (STATUS_OPEN_RE.test(inner) && statusLineIndex === -1) {
          statusLineIndex = j;
        }
        j += 1;
      }
      if (statusLineIndex !== -1 && fullFindingId !== undefined) {
        out.push({
          entryStart: i,
          statusLineIndex,
          findingId: canonicalAuditId(fullFindingId),
          fullFindingId,
        });
      }
      i = j;
    }
  }
  return out;
}

function flipWorkplanTaskBlock(
  workplanLines: string[],
  canonicalId: string,
): boolean {
  // Find the `### Task ... (fix-finding-<canonical>)` heading.
  const headingRe = new RegExp(
    `^###\\s+Task\\s+[^\\n]*?\\bfix-finding-${canonicalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'i',
  );
  let taskStart = -1;
  for (let i = 0; i < workplanLines.length; i += 1) {
    if (headingRe.test(workplanLines[i] ?? '')) {
      taskStart = i;
      break;
    }
  }
  if (taskStart === -1) return false;
  // Find the end of the task block.
  let taskEnd = workplanLines.length;
  for (let j = taskStart + 1; j < workplanLines.length; j += 1) {
    const ln = workplanLines[j] ?? '';
    if (ln.startsWith('### ') || ln.startsWith('## ')) {
      taskEnd = j;
      break;
    }
  }
  let touched = false;
  for (let k = taskStart; k < taskEnd; k += 1) {
    const ln = workplanLines[k] ?? '';
    if (ln.includes('- [ ]')) {
      workplanLines[k] = ln.replace(/- \[ \]/g, '- [x]');
      touched = true;
    }
  }
  return touched;
}

export function slushRemaining(args: SlushRemainingArgs): SlushRemainingResult {
  const dampener = checkBarrageDampener({
    auditLogText: args.auditLogText,
    threshold: args.threshold ?? 2,
  });
  if (!dampener.dampened) {
    return {
      dampenerEngaged: false,
      dampenerReason: dampener.reason,
      flips: [],
      newAuditLogText: args.auditLogText,
      newWorkplanText: args.workplanText,
    };
  }
  const auditLines = args.auditLogText.split(/\r?\n/);
  const workplanLines = args.workplanText.split(/\r?\n/);
  const sections = findBarrageSections(auditLines);
  const openFindings = findOpenFindingsInSections(auditLines, sections);
  const flips: SlushFlip[] = [];
  const newStatus = `acknowledged-slush-pile-${args.slushDate}`;
  for (const ref of openFindings) {
    // Flip the audit-log Status line.
    auditLines[ref.statusLineIndex] = (auditLines[ref.statusLineIndex] ?? '').replace(
      STATUS_OPEN_RE,
      `Status:     ${newStatus}`,
    );
    // Try to flip the matching workplan task block.
    const wpFlipped = flipWorkplanTaskBlock(workplanLines, ref.findingId);
    flips.push({
      findingId: ref.findingId,
      fullFindingId: ref.fullFindingId,
      workplanTaskFlipped: wpFlipped,
    });
  }
  return {
    dampenerEngaged: true,
    dampenerReason: dampener.reason,
    flips,
    newAuditLogText: auditLines.join('\n'),
    newWorkplanText: workplanLines.join('\n'),
  };
}
