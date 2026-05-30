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
const PHASE_HEADING_RE = /^##\s+(?:Phase|Milestone|Sprint)\b/i;
const PHASE_NUMBER_RE = /^##\s+(?:Phase|Milestone|Sprint)\s+(\d+)/i;
const TASK_HEADING_RE = /^###\s+Task\s+(\d+)(?:\.(\d+))?\s*:/i;
const UNCHECKED_CHECKBOX_RE = /^- \[ \]/;

export class AutoPositionError extends Error {
  override name = 'AutoPositionError';
}

export interface AutoPosition {
  /** Full `## Phase ...` heading line text (trimmed). */
  readonly phaseHeading: string;
  /**
   * 1-based "insert-after-this-line" anchor consumed by `insertTaskBlock`.
   * Splicing at this index puts the new block immediately AFTER the
   * named line — so the block appears just BEFORE the first unchecked
   * task (or at the end of the last phase if all tasks are checked).
   */
  readonly insertAfterLine: number;
  /**
   * Highest existing task minor number for the chosen phase. The
   * task-number factory uses this to assign sequential `X.(M+1)`,
   * `X.(M+2)`, ... values to new fix-finding tasks.
   */
  readonly currentMaxMinorInPhase: number;
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
    if (!Number.isFinite(phaseNumber) || phaseNumber <= 0) continue;
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
    if (!Number.isFinite(major) || major <= 0) continue;
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
 */
export function computeAutoPosition(workplanText: string): AutoPosition {
  const lines = workplanText.split('\n');
  const phases = collectPhases(lines);
  if (phases.length === 0) {
    throw new AutoPositionError(
      'workplan has no parseable `## Phase N: ...` / `## Milestone N: ...` / `## Sprint N: ...` headings; auto-position requires at least one such heading as an insertion anchor. Add one of the three (PROJECT-MANAGEMENT.md-sanctioned) or use --task-number with the propose/apply flow.',
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

  let currentMaxMinorInPhase = 0;
  for (const t of taskHeadings) {
    if (t.major !== phaseSpan.phaseNumber) continue;
    if (t.minor > currentMaxMinorInPhase) currentMaxMinorInPhase = t.minor;
  }

  return {
    phaseHeading: phaseSpan.heading,
    insertAfterLine: anchorLine,
    currentMaxMinorInPhase,
    phaseNumber: phaseSpan.phaseNumber,
  };
}

/**
 * Build the task-number callback the existing `applyProposal` flow
 * expects. Each new fix-finding task gets `<phase>.<currentMax + 1 + idx>`,
 * so the numbering doesn't collide with any pre-existing task in the
 * phase.
 */
export function nextTaskNumberFactory(
  position: AutoPosition,
): (item: unknown, idx: number) => string {
  return (_item, idx) =>
    `${position.phaseNumber}.${position.currentMaxMinorInPhase + 1 + idx}`;
}
