/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts
 *
 * Phase 15 Task 4b — auto-position helpers for the implement-loop
 * audit-barrage hook.
 *
 * When the hook calls `promote-findings --auto`, no operator-filled
 * proposal file exists. The verb must compute three things on its
 * own:
 *
 *   1. **Where to insert** each new fix-finding task block in the
 *      workplan — derived from `computeAutoPosition(workplanText)`.
 *   2. **What task number to assign** each new block — derived from
 *      `nextTaskNumberFactory(workplanText, phaseHeading)`.
 *   3. **What disposition + fields to record** in each proposal item
 *      — always `promote-to-workplan` with the computed
 *      `{phaseHeading, insertAfterLine}` (Phase 13's existing apply
 *      flow consumes the proposal shape as-is).
 *
 * Auto-position policy: insert immediately BEFORE the first unchecked
 * `### Task X.Y: ...` heading in the workplan. Two consequences this
 * design honors:
 *
 *   - The Phase 15 Task 1 workplan-aware gate walks unchecked tasks
 *     in workplan order and inspects positions [0..N-1]. Inserting
 *     fix-tasks at the front means they BECOME positions [0..N-1]
 *     and the gate opens on next pickup.
 *   - When all existing tasks are checked, we fall back to the END
 *     of the LAST phase (so the new tasks slot into the most recent
 *     phase rather than appearing under stale "## Phase N" headings).
 *
 * Refuses cleanly when the workplan has zero `## Phase ...` headings
 * — this is a structural condition the operator must fix manually
 * (no phase means no valid anchor; we won't invent one).
 */

// Per AUDIT-20260530-02: accept the heading vocabulary
// `Phase | Milestone | Sprint` (the three terms PROJECT-MANAGEMENT.md
// sanctions). Pre-fix, only `Phase` matched, so adopter workplans
// using the other two sanctioned terms would hard-stop the
// unconditional implement-hook at the first auto-promote.
// Phase 22 Task 1 (#399 Friction 3): accept h2 OR h3 phase headings.
// Deskwork's own workplan uses `### Phase N` h3 throughout; its only
// `##` headings are structural (`## Workplan: …`, `## Extension: …`).
// Before the relaxation, promote-findings --auto aborted with "no
// parseable `## Phase N: ...` headings" immediately after a sync from
// such a workplan. h4+ stays excluded — those collide with task-heading
// conventions (`#### Task N.M: ...`).
const PHASE_HEADING_RE = /^#{2,3}\s+(?:Phase|Milestone|Sprint)\b/i;
const PHASE_NUMBER_RE = /^#{2,3}\s+(?:Phase|Milestone|Sprint)\s+(\d+)/i;
// Per AUDIT-20260530-12: accept the canonical renderer-output shape
// `### Task N.M (fix-finding-AUDIT-...): title` (and the cross-model
// variant with nested parens). Capture groups stay on the leading
// number tokens; the `(?:\s*\([^)]*(?:\([^)]*\)[^)]*)*\))?` chunk
// absorbs an optional one-level-nested parenthetical between the
// number and the colon. The twin regex in `tdd-enforcement.ts` was
// already updated under AUDIT-20260530-07; this fix closes the same
// gap on the auto-position side.
const TASK_HEADING_RE =
  /^###\s+Task\s+(\d+)(?:\.(\d+))?\s*(?:\([^)]*(?:\([^)]*\)[^)]*)*\))?\s*:/i;
const UNCHECKED_CHECKBOX_RE = /^- \[ \]/;

import { parseLedgerFromWorkplan } from '../workplan-archive/ledger.js';

export class AutoPositionError extends Error {
  override name = 'AutoPositionError';
}

export interface AutoPosition {
  /** Full `## Phase ...` / `## Milestone ...` / `## Sprint ...` heading line text (trimmed). */
  readonly phaseHeading: string;
  /**
   * 1-based "insert-after-this-line" anchor consumed by `insertTaskBlock`.
   * Splicing at this index puts the new block immediately AFTER the
   * named line — so the block appears just BEFORE the first unchecked
   * task (or at the end of the last phase if all tasks are checked).
   */
  readonly insertAfterLine: number;
  /**
   * Per AUDIT-20260530-03: the prevailing task-numbering convention
   * in the chosen phase. `flat` = tasks shaped `### Task N:` with no
   * minor segment (e.g. the scope-discovery workplan's `Task 1..6`
   * under `Phase 15`); `hierarchical` = tasks shaped `### Task X.Y:`
   * where X matches the phase number (e.g. fixture workplans with
   * `Task 15.1`, `Task 15.2` under `Phase 15`). Empty phase falls
   * back to `hierarchical`.
   */
  readonly convention: 'flat' | 'hierarchical';
  /**
   * Highest existing task number (whole int for flat, minor int for
   * hierarchical) in the chosen phase. `nextTaskNumberFactory` adds
   * `1 + idx` to this seed.
   */
  readonly currentMaxNumberInPhase: number;
  /** Major number parsed from `phaseHeading` (e.g. `15` from "## Phase 15: ..."). */
  readonly phaseNumber: number;
}

interface PhaseSpan {
  readonly heading: string;
  readonly phaseNumber: number;
  /** 1-based line of the `## Phase ...` heading. */
  readonly headingLine: number;
  /**
   * 1-based line of the LAST line that belongs to this phase. For
   * the last phase in the file this equals `lines.length`; for any
   * other phase it's the line right before the next phase heading.
   */
  readonly lastLine: number;
}

function collectPhases(lines: ReadonlyArray<string>): PhaseSpan[] {
  const phases: PhaseSpan[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!PHASE_HEADING_RE.test(line)) continue;
    const m = PHASE_NUMBER_RE.exec(line);
    if (m === null) continue;
    const phaseNumber = Number.parseInt(m[1] ?? '0', 10);
    // Phase 0 is valid (operator's preferred convention for the
    // audit-cleanup phase). Only NaN / negative phase numbers are
    // rejected.
    if (!Number.isFinite(phaseNumber) || phaseNumber < 0) continue;
    phases.push({
      heading: line.trim(),
      phaseNumber,
      headingLine: i + 1,
      lastLine: lines.length,
    });
  }
  // Fix each phase's lastLine to the line right before the next heading.
  for (let p = 0; p < phases.length - 1; p += 1) {
    const cur = phases[p]!;
    const nxt = phases[p + 1]!;
    phases[p] = { ...cur, lastLine: nxt.headingLine - 1 };
  }
  return phases;
}

function findPhaseContainingLine(phases: ReadonlyArray<PhaseSpan>, line: number): PhaseSpan | undefined {
  return phases.find((p) => line >= p.headingLine && line <= p.lastLine);
}

interface TaskHeadingRef {
  readonly line: number;
  readonly major: number;
  readonly minor: number;
}

function collectTaskHeadings(lines: ReadonlyArray<string>): TaskHeadingRef[] {
  const refs: TaskHeadingRef[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const m = TASK_HEADING_RE.exec(line);
    if (m === null) continue;
    const major = Number.parseInt(m[1] ?? '0', 10);
    const minor = Number.parseInt(m[2] ?? '0', 10);
    // Phase 0 valid → Task 0.X major valid. Reject only NaN /
    // negative.
    if (!Number.isFinite(major) || major < 0) continue;
    refs.push({ line: i + 1, major, minor });
  }
  return refs;
}

function taskHasUncheckedCheckbox(
  lines: ReadonlyArray<string>,
  taskHeadingLine: number,
  taskHeadings: ReadonlyArray<TaskHeadingRef>,
): boolean {
  const next = taskHeadings.find((t) => t.line > taskHeadingLine);
  const endLine = next?.line ?? lines.length + 1;
  for (let li = taskHeadingLine; li < endLine; li += 1) {
    const line = lines[li - 1] ?? '';
    if (UNCHECKED_CHECKBOX_RE.test(line.trim())) return true;
  }
  return false;
}

/**
 * Compute the auto-position anchor for inserting new fix-finding task
 * blocks. Throws `AutoPositionError` if the workplan has no parseable
 * phase headings.
 *
 * Per Phase 26 Task 4 (AUDIT-86): when the workplan carries a
 * `<!-- workplan-archive-ledger -->` annotation with a `next-fix-task-id`
 * field matching the chosen phase, the computed `currentMaxNumberInPhase`
 * is `max(scan-of-workplan, ledger.next-fix-task-id - 1)` so the next
 * fix-task ID can't collide with an archived range.
 */
export function computeAutoPosition(workplanText: string): AutoPosition {
  const lines = workplanText.split('\n');
  const phases = collectPhases(lines);
  if (phases.length === 0) {
    throw new AutoPositionError(
      'workplan has no parseable `## Phase N: ...` / `### Phase N: ...` / `## Milestone N: ...` / `### Milestone N: ...` / `## Sprint N: ...` / `### Sprint N: ...` headings; auto-position requires at least one such heading (h2 OR h3) as an insertion anchor. Add one of the three sanctioned vocabularies (Phase/Milestone/Sprint, per PROJECT-MANAGEMENT.md) or use --task-number with the propose/apply flow.',
    );
  }
  const taskHeadings = collectTaskHeadings(lines);
  const firstUnchecked = taskHeadings.find((t) =>
    taskHasUncheckedCheckbox(lines, t.line, taskHeadings),
  );

  let anchorLine: number;
  let phaseSpan: PhaseSpan;
  if (firstUnchecked !== undefined) {
    const containing = findPhaseContainingLine(phases, firstUnchecked.line);
    if (containing === undefined) {
      throw new AutoPositionError(
        `first unchecked task (line ${firstUnchecked.line}) is not inside any phase. Workplan structure is malformed.`,
      );
    }
    phaseSpan = containing;
    anchorLine = Math.max(firstUnchecked.line - 1, phaseSpan.headingLine);
  } else {
    phaseSpan = phases[phases.length - 1]!;
    anchorLine = phaseSpan.lastLine;
  }

  // Per AUDIT-20260530-03: detect the prevailing task-numbering
  // convention WITHIN the chosen phase. A task `### Task N:` with no
  // minor parses as major=N/minor=0 — these are "flat" tasks. Tasks
  // `### Task X.Y:` with explicit minor are "hierarchical". When the
  // phase contains ≥1 hierarchical task whose major equals the
  // phase number, hierarchical wins; otherwise the convention is
  // flat. Empty phase defaults to hierarchical (`<phase>.1`).
  const tasksInPhase = taskHeadings.filter(
    (t) => t.line >= phaseSpan.headingLine && t.line <= phaseSpan.lastLine,
  );
  let convention: 'flat' | 'hierarchical' = 'hierarchical';
  let currentMaxNumberInPhase = 0;
  const hierarchicalTasks = tasksInPhase.filter(
    (t) => t.minor > 0 && t.major === phaseSpan.phaseNumber,
  );
  if (hierarchicalTasks.length > 0) {
    convention = 'hierarchical';
    for (const t of hierarchicalTasks) {
      if (t.minor > currentMaxNumberInPhase) currentMaxNumberInPhase = t.minor;
    }
  } else if (tasksInPhase.length > 0) {
    convention = 'flat';
    for (const t of tasksInPhase) {
      if (t.major > currentMaxNumberInPhase) currentMaxNumberInPhase = t.major;
    }
  }

  // Phase 26 Task 4 (AUDIT-86): if the workplan carries a ledger with
  // `next-fix-task-id` matching the chosen phase, use the ledger's
  // recorded next-ID as a floor for `currentMaxNumberInPhase`. The
  // ledger captures the highest fix-task ID ever allocated in this
  // phase (including ones now archived); the auto-positioner picks
  // `max(scan, ledger.next-fix-task-id - 1)` so new fix-tasks can't
  // collide with archived ranges.
  try {
    const ledger = parseLedgerFromWorkplan(workplanText);
    if (ledger !== null) {
      const ledgerNextId = ledger.nextFixTaskId;
      const dotIdx = ledgerNextId.indexOf('.');
      if (dotIdx !== -1) {
        const ledgerPhase = Number(ledgerNextId.slice(0, dotIdx));
        const ledgerMinor = Number(ledgerNextId.slice(dotIdx + 1));
        if (
          Number.isFinite(ledgerPhase) &&
          Number.isFinite(ledgerMinor) &&
          ledgerPhase === phaseSpan.phaseNumber &&
          convention === 'hierarchical' &&
          ledgerMinor - 1 > currentMaxNumberInPhase
        ) {
          currentMaxNumberInPhase = ledgerMinor - 1;
        }
      }
    }
  } catch {
    // Malformed ledger: ignore + fall through to scan-only behavior.
    // The workplan-archive-ledger-coherence doctor rule (Phase 26 Task 5)
    // surfaces the malformed state separately.
  }

  return {
    phaseHeading: phaseSpan.heading,
    insertAfterLine: anchorLine,
    convention,
    currentMaxNumberInPhase,
    phaseNumber: phaseSpan.phaseNumber,
  };
}

/**
 * Build the task-number callback the existing `applyProposal` flow
 * expects. Per AUDIT-20260530-03, the rendered number matches the
 * phase's prevailing convention:
 *
 *   - `flat` → `${currentMax + 1 + idx}` (continues the phase's flat
 *     `Task 1, Task 2, …` sequence).
 *   - `hierarchical` → `${phaseNumber}.${currentMax + 1 + idx}` (the
 *     pre-AUDIT-03 behavior, retained for workplans whose phases use
 *     `Task <phase>.<minor>` numbering).
 *
 * Either way, the numbering doesn't collide with existing tasks in
 * the phase.
 *
 * Post-#420: optional `takenIds` set (built via `collectAllTaskIds`)
 * defends against scan/phase-span gaps the per-phase scanner can miss
 * (e.g. tasks misplaced under another phase's heading). The factory
 * forward-walks from `currentMax + 1` and skips any ID already taken.
 * Without `takenIds` the legacy max+1+idx behavior is preserved.
 */
export function nextTaskNumberFactory(
  position: AutoPosition,
  takenIds?: ReadonlySet<string>,
): (item: unknown, idx: number) => string {
  const renderId = (minor: number): string => {
    return position.convention === 'flat'
      ? `${minor}`
      : `${position.phaseNumber}.${minor}`;
  };
  if (takenIds === undefined || takenIds.size === 0) {
    return (_item, idx) => renderId(position.currentMaxNumberInPhase + 1 + idx);
  }
  const issued: string[] = [];
  let cursor = position.currentMaxNumberInPhase;
  return (_item, idx) => {
    if (idx < issued.length) return issued[idx]!;
    while (issued.length <= idx) {
      cursor += 1;
      const candidate = renderId(cursor);
      if (!takenIds.has(candidate) && !issued.includes(candidate)) {
        issued.push(candidate);
      }
    }
    return issued[idx]!;
  };
}

/**
 * Collect every `### Task X.Y` (or `### Task N`) ID present in the
 * workplan, plus every range listed in the archive ledger's
 * `archived-fix-tasks` field. Returns a set keyed by the rendered ID
 * form (`"39.15"` or `"5"`).
 *
 * Post-#420 defensive scan: union of (live workplan headings) +
 * (archive ledger ranges). The per-phase scanner in `computeAutoPosition`
 * filters by phase-span line range, so a heading misplaced under
 * another phase's section is invisible to it; this set is global and
 * catches every heading the canonical regex recognizes.
 *
 * Post-AUDIT-20260606-04: ranges with mixed dotted/flat endpoints or
 * cross-prefix dotted endpoints (`39.10-40.2`) match neither expansion
 * branch and were previously silently skipped — leaving those archived
 * IDs absent from the set and re-issuable by the very forward-walk
 * that depends on the set being complete. The `warn` sink (when
 * supplied) now surfaces each dropped range so the operator sees the
 * gap; the silent-drop is preserved as the default behavior for
 * call-sites that don't pass `warn`.
 */
export function collectAllTaskIds(
  workplanText: string,
  warn?: (message: string) => void,
): Set<string> {
  const lines = workplanText.split('\n');
  const ids = new Set<string>();
  for (const line of lines) {
    const m = TASK_HEADING_RE.exec(line);
    if (m === null) continue;
    const major = m[1] ?? '';
    const minor = m[2];
    if (minor !== undefined && minor.length > 0) {
      ids.add(`${major}.${minor}`);
    } else {
      ids.add(major);
    }
  }
  try {
    const ledger = parseLedgerFromWorkplan(workplanText);
    if (ledger !== null && ledger.archivedFixTasks !== undefined) {
      for (const range of ledger.archivedFixTasks) {
        const startStr = String(range.start);
        if (range.end === undefined) {
          ids.add(startStr);
          continue;
        }
        const endStr = String(range.end);
        // Both `5.1-5.123` (dotted) and `1-5` (flat) shapes; handle both.
        const dotStart = startStr.indexOf('.');
        const dotEnd = endStr.indexOf('.');
        if (dotStart !== -1 && dotEnd !== -1) {
          const prefix = startStr.slice(0, dotStart);
          const endPrefix = endStr.slice(0, dotEnd);
          if (prefix !== endPrefix) {
            warn?.(
              `collectAllTaskIds: dropped cross-prefix dotted ledger range ${startStr}-${endStr}; archived IDs in this range may be re-issued`,
            );
            continue;
          }
          const lo = Number(startStr.slice(dotStart + 1));
          const hi = Number(endStr.slice(dotEnd + 1));
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
            warn?.(
              `collectAllTaskIds: dropped non-numeric dotted ledger range ${startStr}-${endStr}`,
            );
            continue;
          }
          for (let m = lo; m <= hi; m += 1) ids.add(`${prefix}.${m}`);
        } else if (dotStart === -1 && dotEnd === -1) {
          const lo = Number(startStr);
          const hi = Number(endStr);
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
            warn?.(
              `collectAllTaskIds: dropped non-numeric flat ledger range ${startStr}-${endStr}`,
            );
            continue;
          }
          for (let n = lo; n <= hi; n += 1) ids.add(`${n}`);
        } else {
          warn?.(
            `collectAllTaskIds: dropped mixed dotted/flat ledger range ${startStr}-${endStr}; archived IDs in this range may be re-issued`,
          );
        }
      }
    }
  } catch {
    // Malformed ledger — fall through; the live-heading set still applies.
  }
  return ids;
}

/**
 * Post-write defense (Phase 29 / #420): walk the resulting workplan
 * and surface every `### Task X.Y` ID that appears more than once.
 * `applyProposal` calls this after writing and fails loud when the
 * result is non-empty so an operator notices the duplicate before it
 * compounds.
 */
export function findDuplicateTaskHeadings(workplanText: string): string[] {
  const lines = workplanText.split('\n');
  const seen = new Map<string, number>();
  const dups = new Set<string>();
  for (const line of lines) {
    const m = TASK_HEADING_RE.exec(line);
    if (m === null) continue;
    const major = m[1] ?? '';
    const minor = m[2];
    const id =
      minor !== undefined && minor.length > 0 ? `${major}.${minor}` : major;
    const prior = seen.get(id);
    if (prior === undefined) {
      seen.set(id, 1);
    } else {
      seen.set(id, prior + 1);
      dups.add(id);
    }
  }
  return Array.from(dups).sort();
}
