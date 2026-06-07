/**
 * plugins/stack-control/src/scope-discovery/promote-findings/slush-remaining.ts
 *
 * Vendored from dw-lifecycle (multi/migrate-audit-barrage) — stack-control's own
 * slush-pile mechanism; no dw-lifecycle dependency.
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
const SEVERITY_RE = /^Severity:\s*(\S+)/i;
const STATUS_OPEN_RE = /^Status:\s*open\b/i;
const TOP_HEADER_RE = /^##\s+/;
const ENTRY_HEADER_RE = /^###\s+/;
const CANONICAL_AUDIT_ID_RE = /\bAUDIT-\d{8}-\d+/;

export interface SlushFlip {
  /** Canonical AUDIT-id of the flipped finding. */
  readonly findingId: string;
  /** Full Finding-ID line value (may carry cross-model annotation). */
  readonly fullFindingId: string;
  /**
   * Severity as parsed from the audit-log entry (lowercased). May be
   * undefined when the entry's `Severity:` line couldn't be parsed.
   * For skipped HIGHs (this is `high` or `blocking`) the entry was
   * NOT modified.
   */
  readonly severity?: string;
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
  /**
   * Optional audit-log text used ONLY for the dampener DECISION (e.g. a
   * checkpoint-filtered view, AUDIT-20260607-05); flips still target
   * `auditLogText`. Defaults to `auditLogText` (back-compat). Lets the slush
   * gate on the SAME per-checkpoint convergence the spec-governance gate uses.
   */
  readonly decisionAuditLogText?: string;
  /**
   * Per Issue #380: scope the slush to the most-recent barrage section
   * (default) or every barrage section in the audit-log. Operator-
   * intent is "slush items in scope of THIS barrage," so the default
   * is `'latest'`. `'all'` is the legacy pre-#380 behavior, retained
   * for explicit override and as a guardrail-test surface for the
   * severity filter.
   */
  readonly scope?: 'latest' | 'all';
  /**
   * When set, restrict the FLIP to barrage sections whose run-dir basename ends
   * with `-<checkpoint>` — keeping the slush within one checkpoint's independent
   * loop (FR-011). Load-bearing for `scope: 'all'` at convergence: without it,
   * an all-scope slush would cross checkpoint boundaries and bin another
   * checkpoint's findings. With `scope: 'latest'` the most-recent section is
   * already this checkpoint's run, so the filter is a harmless refinement.
   */
  readonly flipCheckpoint?: string;
}

export interface SlushRemainingResult {
  readonly dampenerEngaged: boolean;
  readonly dampenerReason: string;
  /** Findings whose Status was flipped (MEDIUM/LOW/informational). */
  readonly flips: readonly SlushFlip[];
  /**
   * Findings whose Severity is `high` or `blocking` — NEVER slushed
   * per the SKILL.md invariant ("HIGHs are NEVER slushed"). The
   * audit-log entries for these stay `Status: open`; the CLI shim
   * surfaces them in the per-run summary so the operator sees that
   * a real-bug guardrail was preserved.
   */
  readonly skippedHighs: readonly SlushFlip[];
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
  /** The run-dir basename captured from the lift header (for checkpoint scoping). */
  readonly runDirBasename: string;
}

/**
 * Locate audit-barrage lift sections in the audit-log. The
 * audit-log is append-only with newest sections at the bottom, so
 * the last entry returned is the most-recent barrage. Per Issue
 * #380, the slush is scoped to ONLY the most-recent section by
 * default — operator-intent is "slush items in scope of THIS
 * barrage," not "wipe every prior barrage's findings."
 */
export function findBarrageSections(lines: ReadonlyArray<string>): RawSection[] {
  const headers: { headerIndex: number; runDirBasename: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = BARRAGE_HEADER_RE.exec(lines[i] ?? '');
    if (m !== null) headers.push({ headerIndex: i, runDirBasename: m[1] ?? '' });
  }
  return headers.map((h, idx) => {
    let endIndex = lines.length;
    for (let j = h.headerIndex + 1; j < lines.length; j += 1) {
      if (TOP_HEADER_RE.test(lines[j] ?? '')) {
        endIndex = j;
        break;
      }
    }
    const nextHeader = idx + 1 < headers.length ? headers[idx + 1]!.headerIndex : lines.length;
    if (nextHeader < endIndex) endIndex = nextHeader;
    return { headerIndex: h.headerIndex, endIndex, runDirBasename: h.runDirBasename };
  });
}

interface OpenFindingRef {
  readonly entryStart: number;
  readonly statusLineIndex: number;
  readonly findingId: string; // canonical
  readonly fullFindingId: string;
  /** Lowercased Severity value; undefined if the entry has no parseable Severity line. */
  readonly severity: string | undefined;
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
      // Walk this entry's field block, capturing severity in
      // addition to status + finding-id (per Issue #380 — HIGHs
      // are never slushed).
      let statusLineIndex = -1;
      let fullFindingId: string | undefined;
      let severity: string | undefined;
      let j = i + 1;
      while (j < section.endIndex) {
        const inner = lines[j] ?? '';
        if (ENTRY_HEADER_RE.test(inner)) break;
        const fid = FINDING_ID_RE.exec(inner);
        if (fid !== null && fullFindingId === undefined) {
          fullFindingId = fid[1]!;
        }
        const sev = SEVERITY_RE.exec(inner);
        if (sev !== null && severity === undefined) {
          severity = sev[1]!.toLowerCase();
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
          severity,
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
    auditLogText: args.decisionAuditLogText ?? args.auditLogText,
    threshold: args.threshold ?? 2,
  });
  if (!dampener.dampened) {
    return {
      dampenerEngaged: false,
      dampenerReason: dampener.reason,
      flips: [],
      skippedHighs: [],
      newAuditLogText: args.auditLogText,
      newWorkplanText: args.workplanText,
    };
  }
  const auditLines = args.auditLogText.split(/\r?\n/);
  const workplanLines = args.workplanText.split(/\r?\n/);
  const allSections = findBarrageSections(auditLines);
  // Per Issue #380: scope to ONLY the most-recent barrage lift
  // section (default) — operator-intent is "slush items in scope of
  // THIS barrage." Older sections' findings are out-of-scope for
  // this dampener engagement; if they need slushing they'll re-
  // surface in a future barrage. Caller can opt into legacy
  // all-section walking via `scope: 'all'`.
  //
  // AUDIT-20260607-47: the CONVERGENCE slush (protocol call site) uses
  // `scope: 'all'` so that an EARLIER 0-HIGH run's still-open MED/LOW — which
  // were never slushed when that run fired (the dampener was not yet engaged
  // then) — are binned too. "Slush any remaining" is then literally true: 0
  // open MEDIUM anywhere in the checkpoint at graduation. `flipCheckpoint`
  // keeps that all-scope flip from crossing checkpoint boundaries (FR-011).
  const scope: 'latest' | 'all' = args.scope ?? 'latest';
  const checkpointScoped =
    args.flipCheckpoint !== undefined
      ? allSections.filter((s) => s.runDirBasename.endsWith(`-${args.flipCheckpoint!}`))
      : allSections;
  const scopedSections =
    scope === 'all'
      ? checkpointScoped
      : checkpointScoped.length > 0
        ? [checkpointScoped[checkpointScoped.length - 1]!]
        : [];
  const openFindings = findOpenFindingsInSections(auditLines, scopedSections);
  const flips: SlushFlip[] = [];
  const skippedHighs: SlushFlip[] = [];
  const newStatus = `acknowledged-slush-pile-${args.slushDate}`;
  for (const ref of openFindings) {
    // Per Issue #380: HIGHs (high + blocking) are NEVER slushed.
    // Per SKILL.md: "any future barrage that surfaces a HIGH+
    // finding resets the dampener counter, and the next hook fire
    // surfaces it as new next-work." Leave the audit-log entry
    // untouched; report it in skippedHighs.
    const isHighPlus = ref.severity === 'high' || ref.severity === 'blocking';
    if (isHighPlus) {
      skippedHighs.push({
        findingId: ref.findingId,
        fullFindingId: ref.fullFindingId,
        severity: ref.severity,
        workplanTaskFlipped: false,
      });
      continue;
    }
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
      severity: ref.severity,
      workplanTaskFlipped: wpFlipped,
    });
  }
  return {
    dampenerEngaged: true,
    dampenerReason: dampener.reason,
    flips,
    skippedHighs,
    newAuditLogText: auditLines.join('\n'),
    newWorkplanText: workplanLines.join('\n'),
  };
}

const STATUS_SLUSH_RE = /^Status:(\s*)acknowledged-slush-pile-\S+/i;

export interface BurnDownResult {
  /** Findings re-opened (slush-pile → open). */
  readonly reopened: readonly { readonly findingId: string; readonly fullFindingId: string }[];
  readonly newAuditLogText: string;
}

/**
 * Burn down the slush pile: re-open findings previously flipped to
 * `acknowledged-slush-pile-<date>` so they re-enter triage. The inverse of the
 * slush action — "go back through the slush pile and burn it down" (operator).
 * Scope defaults to `'all'` (the whole pile) since burn-down is a deliberate
 * cross-section action, not scoped to one barrage.
 */
export function burnDownSlush(args: {
  readonly auditLogText: string;
  readonly scope?: 'latest' | 'all';
}): BurnDownResult {
  const lines = args.auditLogText.split(/\r?\n/);
  const allSections = findBarrageSections(lines);
  const scope: 'latest' | 'all' = args.scope ?? 'all';
  const scoped =
    scope === 'all'
      ? allSections
      : allSections.length > 0
        ? [allSections[allSections.length - 1]!]
        : [];
  const reopened: { findingId: string; fullFindingId: string }[] = [];
  for (const section of scoped) {
    let i = section.headerIndex + 1;
    while (i < section.endIndex) {
      const line = lines[i] ?? '';
      if (!ENTRY_HEADER_RE.test(line)) {
        i += 1;
        continue;
      }
      let fullFindingId: string | undefined;
      let j = i + 1;
      for (; j < section.endIndex; j += 1) {
        const inner = lines[j] ?? '';
        if (ENTRY_HEADER_RE.test(inner)) break;
        const fid = FINDING_ID_RE.exec(inner);
        if (fid !== null && fullFindingId === undefined) fullFindingId = fid[1]!;
        if (STATUS_SLUSH_RE.test(inner)) {
          lines[j] = inner.replace(STATUS_SLUSH_RE, 'Status:$1open');
          reopened.push({
            findingId: canonicalAuditId(fullFindingId ?? ''),
            fullFindingId: fullFindingId ?? '',
          });
        }
      }
      i = j;
    }
  }
  return { reopened, newAuditLogText: lines.join('\n') };
}
