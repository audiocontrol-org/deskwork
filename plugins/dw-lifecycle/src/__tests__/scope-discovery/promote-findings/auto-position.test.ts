/**
 * Phase 15 Task 4b — tests for the auto-position helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAutoPosition,
  nextTaskNumberFactory,
  AutoPositionError,
} from '../../../scope-discovery/promote-findings/auto-position.js';

const WORKPLAN_WITH_UNCHECKED_IN_PHASE_15 = [
  '# Workplan',
  '',
  '## Phase 14: earlier phase',
  '',
  '### Task 14.1: done thing',
  '',
  '- [x] Step 1 done.',
  '',
  '## Phase 15: current phase',
  '',
  '### Task 15.1: completed work',
  '',
  '- [x] Step 1 done.',
  '- [x] Step 2 done.',
  '',
  '### Task 15.2: next work',
  '',
  '- [ ] Step 1 pending.',
  '- [ ] Step 2 pending.',
  '',
  '### Task 15.3: future work',
  '',
  '- [ ] Step 1 pending.',
  '',
].join('\n');

const ALL_CHECKED_WORKPLAN = [
  '# Workplan',
  '',
  '## Phase 14: only phase',
  '',
  '### Task 14.1: done thing',
  '',
  '- [x] Step 1 done.',
  '',
  '### Task 14.2: also done',
  '',
  '- [x] Step 1 done.',
  '',
].join('\n');

const NO_PHASE_WORKPLAN = [
  '# Workplan',
  '',
  'Some prose, no phase heading at all.',
  '',
].join('\n');

const MULTI_PHASE_UNCHECKED_FIRST_IN_PHASE_14 = [
  '# Workplan',
  '',
  '## Phase 14: earlier',
  '',
  '### Task 14.1: pending',
  '',
  '- [ ] Step 1.',
  '',
  '## Phase 15: later',
  '',
  '### Task 15.1: also pending',
  '',
  '- [ ] Step 1.',
  '',
].join('\n');

describe('computeAutoPosition', () => {
  it('anchors immediately before the first unchecked task heading', () => {
    const pos = computeAutoPosition(WORKPLAN_WITH_UNCHECKED_IN_PHASE_15);
    expect(pos.phaseNumber).toBe(15);
    expect(pos.phaseHeading).toBe('## Phase 15: current phase');
    // First unchecked task heading is "### Task 15.2:" — confirm
    // insertAfterLine is the line right before it.
    const lines = WORKPLAN_WITH_UNCHECKED_IN_PHASE_15.split('\n');
    const taskLine = lines.findIndex((l) => l.includes('### Task 15.2:')) + 1;
    expect(pos.insertAfterLine).toBe(taskLine - 1);
  });

  it('reports the highest existing minor number for the chosen phase', () => {
    const pos = computeAutoPosition(WORKPLAN_WITH_UNCHECKED_IN_PHASE_15);
    expect(pos.currentMaxNumberInPhase).toBe(3);
  });

  it('falls back to end of LAST phase when no unchecked tasks remain', () => {
    const pos = computeAutoPosition(ALL_CHECKED_WORKPLAN);
    expect(pos.phaseNumber).toBe(14);
    expect(pos.phaseHeading).toBe('## Phase 14: only phase');
    const lines = ALL_CHECKED_WORKPLAN.split('\n');
    expect(pos.insertAfterLine).toBe(lines.length);
  });

  it('throws AutoPositionError when no phase headings exist', () => {
    expect(() => computeAutoPosition(NO_PHASE_WORKPLAN)).toThrow(AutoPositionError);
  });

  it('picks the FIRST unchecked task even when it is in an earlier phase', () => {
    const pos = computeAutoPosition(MULTI_PHASE_UNCHECKED_FIRST_IN_PHASE_14);
    expect(pos.phaseNumber).toBe(14);
    expect(pos.phaseHeading).toBe('## Phase 14: earlier');
  });

  it('handles a workplan whose first task is unchecked (anchor inside phase)', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 10: first',
      '',
      '### Task 10.1: pending',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.phaseNumber).toBe(10);
    const lines = wp.split('\n');
    const taskLine = lines.findIndex((l) => l.includes('### Task 10.1:')) + 1;
    // Anchor is taskLine - 1, but must be >= phase heading line.
    expect(pos.insertAfterLine).toBeGreaterThanOrEqual(
      lines.findIndex((l) => l.includes('## Phase 10:')) + 1,
    );
    expect(pos.insertAfterLine).toBeLessThan(taskLine);
  });
});

describe('nextTaskNumberFactory', () => {
  it('assigns sequential <phase>.<max+1>, <max+2>, ... in hierarchical convention', () => {
    const factory = nextTaskNumberFactory({
      phaseHeading: '## Phase 15: x',
      insertAfterLine: 42,
      convention: 'hierarchical',
      currentMaxNumberInPhase: 5,
      phaseNumber: 15,
    });
    expect(factory({}, 0)).toBe('15.6');
    expect(factory({}, 1)).toBe('15.7');
    expect(factory({}, 2)).toBe('15.8');
  });

  it('starts at <phase>.1 when the phase has no existing tasks (hierarchical default)', () => {
    const factory = nextTaskNumberFactory({
      phaseHeading: '## Phase 99: fresh',
      insertAfterLine: 100,
      convention: 'hierarchical',
      currentMaxNumberInPhase: 0,
      phaseNumber: 99,
    });
    expect(factory({}, 0)).toBe('99.1');
  });
});

/**
 * AUDIT-20260530-02 regression: pre-fix, `PHASE_HEADING_RE` only
 * matched `## Phase N` literally. Adopter workplans using `## Milestone N`
 * or `## Sprint N` (PROJECT-MANAGEMENT.md sanctions all three terms)
 * threw `AutoPositionError`, which `promote-findings --auto` maps to
 * exit 2 — a STOP-the-loop event per the unconditional implement-hook
 * contract. The fix: accept any of the three sanctioned heading words.
 */
describe('computeAutoPosition — sanctioned heading vocabulary (AUDIT-20260530-02)', () => {
  it('accepts `## Milestone N: ...` headings', () => {
    const wp = [
      '# Workplan',
      '',
      '## Milestone 3: current',
      '',
      '### Task 3.1: pending',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.phaseNumber).toBe(3);
    expect(pos.phaseHeading).toBe('## Milestone 3: current');
  });

  it('accepts `## Sprint N: ...` headings', () => {
    const wp = [
      '# Workplan',
      '',
      '## Sprint 2: current',
      '',
      '### Task 2.1: pending',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.phaseNumber).toBe(2);
    expect(pos.phaseHeading).toBe('## Sprint 2: current');
  });

  it('still rejects workplans with no Phase/Milestone/Sprint heading at all', () => {
    const wp = [
      '# Workplan',
      '',
      '## Section 1: not a phase',
      '',
      '### Task 1: pending',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    expect(() => computeAutoPosition(wp)).toThrow(/Phase|Milestone|Sprint/i);
  });
});

/**
 * AUDIT-20260530-03 regression: pre-fix, `nextTaskNumberFactory`
 * always emitted `<phase>.<minor>`. On the actual scope-discovery
 * workplan (which uses flat `Task 1:`, `Task 2:` numbering under
 * `## Phase 15`), the auto-promote produced incoherent `Task 15.1`
 * interleaved with `Task 1..6`. The helper should detect the
 * prevailing task-numbering convention in the chosen phase and match
 * it.
 */
describe('computeAutoPosition + nextTaskNumberFactory — convention detection (AUDIT-20260530-03)', () => {
  it('detects flat convention when tasks in the phase use `Task N:` (no minor)', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 15: current',
      '',
      '### Task 1: First',
      '',
      '- [x] Step 1.',
      '',
      '### Task 2: Second',
      '',
      '- [x] Step 1.',
      '',
      '### Task 3: Third (pending)',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.convention).toBe('flat');
    const factory = nextTaskNumberFactory(pos);
    // Highest existing flat number in the phase is 3; next fix-tasks
    // are Task 4, Task 5, ... — NOT Task 15.1.
    expect(factory({}, 0)).toBe('4');
    expect(factory({}, 1)).toBe('5');
  });

  it('detects hierarchical convention when tasks use `Task <phase>.<minor>:`', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 15: current',
      '',
      '### Task 15.1: First',
      '',
      '- [x] Step 1.',
      '',
      '### Task 15.2: Second (pending)',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.convention).toBe('hierarchical');
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('15.3');
    expect(factory({}, 1)).toBe('15.4');
  });

  it('accepts `## Phase 0:` (audit-cleanup convention — operator preferred shape)', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 0: audit cleanup',
      '',
      '### Task 0.1: pre-existing fix-task',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.phaseNumber).toBe(0);
    expect(pos.phaseHeading).toBe('## Phase 0: audit cleanup');
    const factory = nextTaskNumberFactory(pos);
    // Phase 0 with hierarchical convention (Task 0.1 exists) → next is 0.2.
    expect(factory({}, 0)).toBe('0.2');
  });

  it('falls back to hierarchical when the phase has no existing tasks', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 99: fresh',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.convention).toBe('hierarchical');
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('99.1');
  });
});

/**
 * AUDIT-20260530-12 regression: `auto-position.ts` had its own
 * `TASK_HEADING_RE = /^###\s+Task\s+(\d+)(?:\.(\d+))?\s*:/i` that
 * `computeAutoPosition` used for both first-unchecked detection and
 * current-task-number calculation. The AUDIT-20260530-07 fix updated
 * the TWIN regex in tdd-enforcement.ts but left auto-position behind.
 * Repeated `promote-findings --auto` runs against a workplan with
 * previously-inserted fix-tasks (renderer shape: `### Task N (fix-
 * finding-AUDIT-...): title`) would skip past them and reuse stale
 * task numbers — the EXACT cause of round-2's auto-promote landing
 * at the same Phase 5 anchor as round 1.
 */
describe('computeAutoPosition — renderer-shaped fix-task headings (AUDIT-20260530-12)', () => {
  it('recognizes renderer-shaped fix-task headings in the chosen phase', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 15: current',
      '',
      '### Task 15.1: original',
      '',
      '- [x] step done',
      '',
      '### Task 15.2 (fix-finding-AUDIT-20260601-01): renderer-shape fix-task already present',
      '',
      '- [ ] Step 1',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    // Hierarchical convention with the highest minor being 2 (from
    // the renderer-shape task) — pre-fix this returned 1 because the
    // regex didn't match the renderer-shape heading.
    expect(pos.convention).toBe('hierarchical');
    expect(pos.currentMaxNumberInPhase).toBe(2);
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('15.3');
  });

  it('recognizes the cross-model variant `### Task N.M (fix-finding-AUDIT-... (claude-X; cross-model)): title`', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 15: current',
      '',
      '### Task 15.3 (fix-finding-AUDIT-20260601-05 (claude-06 + codex-02; cross-model)): cross-model fix',
      '',
      '- [ ] Step 1',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.convention).toBe('hierarchical');
    expect(pos.currentMaxNumberInPhase).toBe(3);
  });

  it('anchors BEFORE a renderer-shaped unchecked task (not past it)', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 15: current',
      '',
      '### Task 15.1 (fix-finding-AUDIT-20260601-01): first',
      '',
      '- [ ] Step 1 pending',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    const lines = wp.split('\n');
    const taskLine = lines.findIndex((l) => l.includes('### Task 15.1')) + 1;
    // Anchor is right BEFORE the task heading (insertAfterLine =
    // taskLine - 1, but clamped to >= phase heading).
    expect(pos.insertAfterLine).toBeLessThan(taskLine);
  });
});
