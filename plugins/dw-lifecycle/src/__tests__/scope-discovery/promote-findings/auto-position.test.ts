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
    expect(pos.currentMaxMinorInPhase).toBe(3);
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
  it('assigns sequential <phase>.<max+1>, <max+2>, ...', () => {
    const factory = nextTaskNumberFactory({
      phaseHeading: '## Phase 15: x',
      insertAfterLine: 42,
      currentMaxMinorInPhase: 5,
      phaseNumber: 15,
    });
    expect(factory({}, 0)).toBe('15.6');
    expect(factory({}, 1)).toBe('15.7');
    expect(factory({}, 2)).toBe('15.8');
  });

  it('starts at <phase>.1 when the phase has no existing tasks', () => {
    const factory = nextTaskNumberFactory({
      phaseHeading: '## Phase 99: fresh',
      insertAfterLine: 100,
      currentMaxMinorInPhase: 0,
      phaseNumber: 99,
    });
    expect(factory({}, 0)).toBe('99.1');
  });
});
