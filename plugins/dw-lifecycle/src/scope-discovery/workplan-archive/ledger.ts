/**
 * plugins/dw-lifecycle/src/scope-discovery/workplan-archive/ledger.ts
 *
 * Phase 26 — Workplan archive ledger format.
 *
 * Long-running features accumulate completed phases that bloat the
 * active workplan + slow down `/dw-lifecycle:pickup` + push fix-tasks
 * past the visible window. The 2026-06-03 manual archive (Phase 24
 * predecessor) moved 16 phases out of `workplan.md` into a sibling
 * `workplan-archive.md`, reducing the active workplan from 4477 → 1036
 * lines. The active workplan carries a `<!-- workplan-archive-ledger -->`
 * HTML comment near the top recording the archived ranges + the next
 * fix-task ID — the auto-positioner reads it to avoid renumbering
 * collisions with archived fix-task blocks.
 *
 * This module is the pure parser/serializer for that ledger annotation.
 * Round-trip-safe: parse → serialize → parse must be a fixed point.
 *
 * Ledger format (canonical example):
 *
 *   <!-- workplan-archive-ledger
 *   archived-phases: 1-5, 9-10, 13-14, 16-19, 21-23
 *   archived-fix-tasks: 5.1-5.123
 *   archive-file: workplan-archive.md
 *   next-fix-task-id: 5.124
 *   note: free-form, optional
 *   -->
 *
 * Range compaction rule: contiguous IDs collapse to `start-end`;
 * non-contiguous IDs are comma-separated. Mixed: `1-5, 9-10, 13`.
 * `none` is a legitimate value for `archived-fix-tasks` when no
 * fix-task IDs have been archived yet (e.g., the only-phase-headers
 * case).
 *
 * The `archived-fix-tasks` field uses dotted-decimal IDs (`5.1` =
 * "phase 5, fix-task 1"); the auto-positioner counts within a phase,
 * not across phases. `next-fix-task-id` is the smallest unused ID;
 * `promote-findings`'s auto-positioner picks the max of
 * `(ledger.next-fix-task-id, scan-of-workplan-max + 1)`.
 */

export interface IdRange {
  readonly start: string;
  /** When omitted, this is a singleton (start only). */
  readonly end?: string;
}

export interface Ledger {
  /** Phase ranges (integer-only IDs). Empty array = no archived phases. */
  readonly archivedPhases: ReadonlyArray<IdRange>;
  /**
   * Fix-task ranges. Each ID is dotted-decimal (`<phase>.<fix-task>`).
   * Empty array = no archived fix-tasks (serializer emits `none`).
   */
  readonly archivedFixTasks: ReadonlyArray<IdRange>;
  /** Path to the archive file relative to the workplan's dir. */
  readonly archiveFile: string;
  /** Smallest unused fix-task ID. Dotted-decimal. */
  readonly nextFixTaskId: string;
  /** Optional free-form note (single line). */
  readonly note?: string;
}

const LEDGER_OPEN_RE = /<!--\s*workplan-archive-ledger\s*\n/;
const LEDGER_CLOSE_RE = /\n-->/;

/**
 * Locate the ledger block in a workplan body. Returns null when no
 * ledger annotation is present (first-archive case — `archive-phases`
 * creates it).
 */
export function findLedger(body: string): { start: number; end: number; content: string } | null {
  const openMatch = LEDGER_OPEN_RE.exec(body);
  if (openMatch === null) return null;
  const afterOpen = openMatch.index + openMatch[0].length;
  const remainder = body.slice(afterOpen);
  const closeMatch = LEDGER_CLOSE_RE.exec(remainder);
  if (closeMatch === null) return null;
  const contentEnd = afterOpen + closeMatch.index;
  const blockEnd = contentEnd + closeMatch[0].length;
  return { start: openMatch.index, end: blockEnd, content: body.slice(afterOpen, contentEnd) };
}

/**
 * Parse an `IdRange` token like `1-5`, `7`, or `5.1-5.123`.
 * Throws on malformed input — caller's tests must cover the unhappy paths.
 */
function parseRange(token: string): IdRange {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    throw new Error('empty range token');
  }
  const hyphenIdx = trimmed.indexOf('-');
  if (hyphenIdx === -1) {
    return { start: trimmed };
  }
  const start = trimmed.slice(0, hyphenIdx).trim();
  const end = trimmed.slice(hyphenIdx + 1).trim();
  if (start.length === 0 || end.length === 0) {
    throw new Error(`malformed range: "${token}"`);
  }
  return { start, end };
}

/** Parse a comma-separated range list. Accepts `none` as the empty list. */
function parseRangeList(value: string): ReadonlyArray<IdRange> {
  const trimmed = value.trim();
  if (trimmed === 'none' || trimmed.length === 0) return [];
  return trimmed.split(',').map((tok) => parseRange(tok));
}

function serializeRange(range: IdRange): string {
  return range.end === undefined ? range.start : `${range.start}-${range.end}`;
}

function serializeRangeList(ranges: ReadonlyArray<IdRange>): string {
  if (ranges.length === 0) return 'none';
  return ranges.map(serializeRange).join(', ');
}

/**
 * Parse a ledger block's inner content (the part between the open and
 * close markers).
 */
export function parseLedgerContent(content: string): Ledger {
  const lines = content.split('\n');
  const fields = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      throw new Error(`malformed ledger line (no colon): "${line}"`);
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    fields.set(key, value);
  }
  const archivedPhasesRaw = fields.get('archived-phases');
  const archivedFixTasksRaw = fields.get('archived-fix-tasks');
  const archiveFile = fields.get('archive-file');
  const nextFixTaskId = fields.get('next-fix-task-id');
  if (archivedPhasesRaw === undefined) {
    throw new Error('ledger missing required field: archived-phases');
  }
  if (archivedFixTasksRaw === undefined) {
    throw new Error('ledger missing required field: archived-fix-tasks');
  }
  if (archiveFile === undefined) {
    throw new Error('ledger missing required field: archive-file');
  }
  if (nextFixTaskId === undefined) {
    throw new Error('ledger missing required field: next-fix-task-id');
  }
  const ledger: Ledger = {
    archivedPhases: parseRangeList(archivedPhasesRaw),
    archivedFixTasks: parseRangeList(archivedFixTasksRaw),
    archiveFile,
    nextFixTaskId,
    ...(fields.has('note') ? { note: fields.get('note') } : {}),
  };
  return ledger;
}

/**
 * Serialize a `Ledger` to its on-disk inner-content form (suitable for
 * wrapping in the `<!-- workplan-archive-ledger ... -->` block).
 */
export function serializeLedger(ledger: Ledger): string {
  const lines = [
    `archived-phases: ${serializeRangeList(ledger.archivedPhases)}`,
    `archived-fix-tasks: ${serializeRangeList(ledger.archivedFixTasks)}`,
    `archive-file: ${ledger.archiveFile}`,
    `next-fix-task-id: ${ledger.nextFixTaskId}`,
  ];
  if (ledger.note !== undefined) {
    lines.push(`note: ${ledger.note}`);
  }
  return lines.join('\n');
}

/**
 * Wrap serialized content in the canonical `<!-- workplan-archive-ledger ... -->`
 * HTML comment frame.
 */
export function wrapLedgerBlock(content: string): string {
  return `<!-- workplan-archive-ledger\n${content}\n-->`;
}

/**
 * Convenience: parse a ledger block from a full workplan body. Returns
 * null when no ledger is present. Throws when a ledger block exists but
 * is malformed (the workplan-archive-ledger-coherence doctor rule
 * catches this proactively).
 */
export function parseLedgerFromWorkplan(body: string): Ledger | null {
  const located = findLedger(body);
  if (located === null) return null;
  return parseLedgerContent(located.content);
}

/**
 * Range-arithmetic helpers used by `promote-findings`'s auto-positioner
 * + `archive-phases`'s ledger update.
 */

/** Numeric compare for dotted-decimal IDs. Returns < 0, 0, > 0. */
export function compareIds(a: string, b: string): number {
  const aParts = a.split('.').map((p) => Number(p));
  const bParts = b.split('.').map((p) => Number(p));
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const ai = aParts[i] ?? 0;
    const bi = bParts[i] ?? 0;
    if (Number.isNaN(ai) || Number.isNaN(bi)) {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

/**
 * Test whether a given ID falls within any of the ranges.
 * Used by `promote-findings`'s next-ID computation to detect collisions
 * with archived IDs.
 */
export function isIdInRanges(id: string, ranges: ReadonlyArray<IdRange>): boolean {
  for (const range of ranges) {
    if (range.end === undefined) {
      if (compareIds(id, range.start) === 0) return true;
    } else {
      if (compareIds(id, range.start) >= 0 && compareIds(id, range.end) <= 0) return true;
    }
  }
  return false;
}

/**
 * Increment a dotted-decimal ID by 1 on its last component.
 * `5.10` → `5.11`; `11.3` → `11.4`; `7` → `8`. Throws on non-numeric components.
 * Used by `archive-phases` to compute the next-fix-task-id after merging
 * newly-archived IDs into the ledger.
 */
export function incrementId(id: string): string {
  const parts = id.split('.');
  if (parts.length === 0) throw new Error(`empty id: "${id}"`);
  const lastRaw = parts[parts.length - 1];
  if (lastRaw === undefined) throw new Error(`empty last component in "${id}"`);
  const last = Number(lastRaw);
  if (!Number.isFinite(last)) throw new Error(`non-numeric last component in "${id}"`);
  return [...parts.slice(0, -1), String(last + 1)].join('.');
}

/**
 * Expand a range list into individual ID strings. `[{start:'5.1',end:'5.3'}]`
 * yields `['5.1','5.2','5.3']`. Singletons (no `end`) yield the start verbatim.
 * Multi-component IDs (`5.1-5.3`) expand on the LAST component only — the
 * `<phase>` prefix is preserved; the `<fix-task>` integer iterates from start
 * to end inclusive.
 *
 * Per AUDIT-20260603-92: this function is reached from `mergeFixTaskIds` with
 * `existing` ranges sourced from a previous ledger parsed off disk. The
 * `parseRange` parser admits any `start-end` pair, including operator-edited
 * cross-phase shapes (`5.10-6.3`), mismatched-dotted-length shapes (`5.1-5`),
 * and non-numeric endpoints. Throwing on those would abort `archivePhases`
 * mid-operation. Instead this function falls back to a singleton-pair
 * representation: cross-phase / odd ranges contribute the start AND end IDs
 * verbatim (no iteration of the middle), so a malformed input is preserved
 * in the merged output instead of crashing the call chain. The doctor rule
 * `workplan-archive-ledger-coherence` is the operator-facing surface for
 * notifying about the malformed input — it calls `classifyFixTaskRange`
 * (this module) on every `archivedFixTasks` range and emits a warning
 * naming each non-`well-formed` shape (per AUDIT-20260604-02; the original
 * claim was false until the doctor rule was extended to walk fix-task
 * ranges).
 */
function expandRange(range: IdRange): string[] {
  if (range.end === undefined) return [range.start];
  const startParts = range.start.split('.');
  const endParts = range.end.split('.');
  if (startParts.length !== endParts.length) {
    return [range.start, range.end];
  }
  for (let i = 0; i < startParts.length - 1; i += 1) {
    if (startParts[i] !== endParts[i]) {
      return [range.start, range.end];
    }
  }
  const prefix = startParts.slice(0, -1);
  const startLast = Number(startParts[startParts.length - 1]);
  const endLast = Number(endParts[endParts.length - 1]);
  if (!Number.isFinite(startLast) || !Number.isFinite(endLast)) {
    return [range.start, range.end];
  }
  const out: string[] = [];
  for (let i = startLast; i <= endLast; i += 1) {
    out.push([...prefix, String(i)].join('.'));
  }
  return out;
}

/**
 * Merge an existing range list with a collection of new dotted-decimal IDs,
 * recompacting contiguous-within-same-phase IDs into ranges. Used by
 * `archive-phases` to fold newly-archived fix-task IDs (synthesized from
 * `### Task N` headings under `## Phase M`) into the ledger's archived-fix-tasks
 * field.
 *
 * Compaction rule: two IDs are contiguous when they share an identical
 * dotted prefix AND their last-components differ by exactly 1. `5.3, 5.4`
 * compact to `5.3-5.4`; `5.3, 6.1` stay separate.
 */
export function mergeFixTaskIds(
  existing: ReadonlyArray<IdRange>,
  newIds: ReadonlyArray<string>,
): ReadonlyArray<IdRange> {
  const flat: string[] = [];
  for (const r of existing) {
    for (const id of expandRange(r)) flat.push(id);
  }
  for (const id of newIds) flat.push(id);
  const dedup = Array.from(new Set(flat));
  dedup.sort(compareIds);
  if (dedup.length === 0) return [];
  const compacted: IdRange[] = [];
  let runStart: string = dedup[0]!;
  let runEnd: string = dedup[0]!;
  for (let i = 1; i < dedup.length; i += 1) {
    const id = dedup[i]!;
    // Per AUDIT-20260603-92: `incrementId` throws on non-numeric IDs (e.g.
    // operator-edited `5.x`). Treat the throw as "not contiguous" so the
    // malformed ID becomes its own singleton in the output instead of
    // crashing the caller. Doctor-rule surfaces the malformed-ledger.
    let expectedNext: string | null;
    try {
      expectedNext = incrementId(runEnd);
    } catch {
      expectedNext = null;
    }
    if (expectedNext !== null && id === expectedNext) {
      runEnd = id;
    } else {
      compacted.push(runStart === runEnd ? { start: runStart } : { start: runStart, end: runEnd });
      runStart = id;
      runEnd = id;
    }
  }
  compacted.push(runStart === runEnd ? { start: runStart } : { start: runStart, end: runEnd });
  return compacted;
}

/**
 * Per AUDIT-20260604-02: companion classifier to `expandRange`'s
 * tolerance. Classifies a fix-task range as `well-formed` or names
 * which malformed shape it has. The `workplan-archive-ledger-coherence`
 * doctor rule calls this on every `archivedFixTasks` range and emits
 * a warning per non-well-formed shape — so an operator sees the
 * malformed-input notification that `expandRange`'s singleton-pair
 * fallback would otherwise swallow silently. The three malformed
 * shapes match `expandRange`'s fallback triggers exactly:
 *
 *   - cross-phase: start prefix differs from end prefix
 *     (`5.10-6.3` → cross-phase).
 *   - mismatched-dotted: start and end have different dot-component
 *     counts (`5.1-5` → mismatched-dotted).
 *   - non-numeric: at least one endpoint's last component is not
 *     a finite number (`5.x-5.y` → non-numeric).
 *
 * Singletons (no `end`) are always well-formed; non-numeric singletons
 * surface as a separate `non-numeric` classification.
 */
export type FixTaskRangeShape =
  | 'well-formed'
  | 'cross-phase'
  | 'mismatched-dotted'
  | 'non-numeric';

export function classifyFixTaskRange(range: IdRange): FixTaskRangeShape {
  if (range.end === undefined) {
    const singleParts = range.start.split('.');
    const lastRaw = singleParts[singleParts.length - 1];
    if (lastRaw === undefined || !Number.isFinite(Number(lastRaw))) return 'non-numeric';
    return 'well-formed';
  }
  const startParts = range.start.split('.');
  const endParts = range.end.split('.');
  if (startParts.length !== endParts.length) return 'mismatched-dotted';
  for (let i = 0; i < startParts.length - 1; i += 1) {
    if (startParts[i] !== endParts[i]) return 'cross-phase';
  }
  const startLast = Number(startParts[startParts.length - 1]);
  const endLast = Number(endParts[endParts.length - 1]);
  if (!Number.isFinite(startLast) || !Number.isFinite(endLast)) return 'non-numeric';
  return 'well-formed';
}

/**
 * Find the largest ID across a range list using `compareIds` semantics.
 * Returns null when the list is empty. Singleton ranges contribute their
 * `start`; closed ranges contribute their `end`.
 */
export function findMaxId(ranges: ReadonlyArray<IdRange>): string | null {
  let max: string | null = null;
  for (const r of ranges) {
    const candidate = r.end ?? r.start;
    if (max === null || compareIds(candidate, max) > 0) max = candidate;
  }
  return max;
}
