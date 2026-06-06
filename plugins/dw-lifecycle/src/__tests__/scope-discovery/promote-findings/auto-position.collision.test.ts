/**
 * Phase 29 Task 3 — bug-repro tests for #420.
 *
 * `promote-findings --auto` was observed assigning colliding task IDs in
 * deskwork-plugin's Phase 39 across two batches in one cont. 5 session
 * (2026-06-04). The collisions:
 *
 *   - Batch 1 numbered 39.15/.16/.17 over an existing 39.15
 *     (prior-session task AUDIT-20260603-48).
 *   - Batch 2 numbered 39.17/.18/.19 over batch 1's 39.17 (AUDIT-03).
 *
 * Root cause hypothesis per the issue: the auto-positioner derives its
 * next task number from a slice that doesn't include every relevant
 * `### Task <phase>.<n>` heading.
 *
 * These tests probe the realistic scan-failure shapes: prior-session
 * tasks with the fix-finding paren wrap, mixed conventions, archived
 * ranges in the ledger, and the cross-model nested-paren shape.
 */

import { describe, it, expect } from 'vitest';
import {
  collectAllTaskIds,
  computeAutoPosition,
  findDuplicateTaskHeadings,
  nextTaskNumberFactory,
} from '../../../scope-discovery/promote-findings/auto-position.js';

const PHASE39_WITH_PRIOR_FIX_TASK = [
  '# Workplan',
  '',
  '## Phase 39: current phase',
  '',
  '### Task 39.1: original impl task',
  '',
  '- [x] Step 1.',
  '',
  '### Task 39.14: another impl task',
  '',
  '- [x] Step 1.',
  '',
  '### Task 39.15 (fix-finding-AUDIT-20260603-48): prior-session fix-finding',
  '',
  '- [ ] Step 0: working-code invariant.',
  '- [ ] Step 1: bug-repro.',
  '',
].join('\n');

describe('#420 bug-repro: prior-session fix-finding task counted by auto-position scan', () => {
  it('plain dotted heading without paren: scanner finds Task 39.15', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: current phase',
      '',
      '### Task 39.15: plain task',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.phaseNumber).toBe(39);
    expect(pos.currentMaxNumberInPhase).toBe(15);
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('39.16');
  });

  it('fix-finding paren wrap: scanner finds Task 39.15 (fix-finding-AUDIT-...)', () => {
    const pos = computeAutoPosition(PHASE39_WITH_PRIOR_FIX_TASK);
    expect(pos.phaseNumber).toBe(39);
    expect(pos.currentMaxNumberInPhase).toBe(15);
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('39.16');
    expect(factory({}, 1)).toBe('39.17');
    expect(factory({}, 2)).toBe('39.18');
  });

  it('cross-model nested paren: scanner finds Task 39.15 (fix-finding-AUDIT-N (cross-model: ...))', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: current phase',
      '',
      '### Task 39.15 (fix-finding-AUDIT-20260603-48 (cross-model: claude-02 + codex-01 + gemini-03)): nested',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.currentMaxNumberInPhase).toBe(15);
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('39.16');
  });

  it('batch-2-after-batch-1 shape: existing 39.15+.16+.17 → next assigned >= 39.18', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: ...',
      '',
      '### Task 39.15 (fix-finding-AUDIT-20260603-48): prior task',
      '',
      '- [x] Step 0.',
      '',
      '### Task 39.16 (fix-finding-AUDIT-20260604-01): batch-1 task A',
      '',
      '- [x] Step 0.',
      '',
      '### Task 39.17 (fix-finding-AUDIT-20260604-02): batch-1 task B',
      '',
      '- [ ] Step 0.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.phaseNumber).toBe(39);
    expect(pos.currentMaxNumberInPhase).toBe(17);
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('39.18');
    expect(factory({}, 1)).toBe('39.19');
  });
});

describe('#420 bug-repro: archived ranges from a NON-current phase do not floor a current-phase scan', () => {
  it('ledger archive of Phase 5 does not pollute Phase 39 scan', () => {
    const wp = [
      '# Workplan',
      '',
      '<!-- workplan-archive-ledger',
      'archived-phases: 5',
      'archived-fix-tasks: 5.1-5.123',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 5.124',
      '-->',
      '',
      '## Phase 39: current phase',
      '',
      '### Task 39.5: real task',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    expect(pos.phaseNumber).toBe(39);
    expect(pos.currentMaxNumberInPhase).toBe(5);
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('39.6');
  });

  it('ledger next-fix-task-id 39.20 floors a Phase 39 scan that found 39.5', () => {
    const wp = [
      '# Workplan',
      '',
      '<!-- workplan-archive-ledger',
      'archived-phases: ',
      'archived-fix-tasks: 39.10-39.19',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 39.20',
      '-->',
      '',
      '## Phase 39: current phase',
      '',
      '### Task 39.5: live task (low number; archive covers higher range)',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    // Per AUDIT-86: ledger's nextFixTaskId floors the max so archived
    // ranges aren't re-issued. max(scan=5, ledger=19) = 19; next = 20.
    expect(pos.currentMaxNumberInPhase).toBe(19);
    const factory = nextTaskNumberFactory(pos);
    expect(factory({}, 0)).toBe('39.20');
  });
});

describe('#420 collectAllTaskIds — global scan beyond per-phase span', () => {
  it('collects task IDs across multiple phases regardless of span placement', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: current',
      '',
      '### Task 39.5: in-phase',
      '',
      '- [ ] Step 1.',
      '',
      '## Phase 40: next phase',
      '',
      '### Task 39.15: misplaced under wrong phase heading',
      '',
      '- [x] Step 1.',
      '',
      '### Task 40.1: legitimate next-phase task',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const ids = collectAllTaskIds(wp);
    expect(ids.has('39.5')).toBe(true);
    expect(ids.has('39.15')).toBe(true);
    expect(ids.has('40.1')).toBe(true);
  });

  it('expands archived-fix-tasks ledger ranges into the ID set', () => {
    const wp = [
      '# Workplan',
      '',
      '<!-- workplan-archive-ledger',
      'archived-phases: 5',
      'archived-fix-tasks: 5.1-5.3, 8.7',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 5.4',
      '-->',
      '',
      '## Phase 39: current',
      '',
      '### Task 39.1: in-phase',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const ids = collectAllTaskIds(wp);
    expect(ids.has('5.1')).toBe(true);
    expect(ids.has('5.2')).toBe(true);
    expect(ids.has('5.3')).toBe(true);
    expect(ids.has('8.7')).toBe(true);
    expect(ids.has('39.1')).toBe(true);
  });
});

describe('#420 nextTaskNumberFactory — takenIds forward-walk avoids collisions', () => {
  it('seeks past a misplaced 39.15 even when per-phase scan max is 5', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: current',
      '',
      '### Task 39.5: in-phase',
      '',
      '- [ ] Step 1.',
      '',
      '## Phase 40: next',
      '',
      '### Task 39.15: misplaced',
      '',
      '- [x] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    // Per-phase scan: max = 5.
    expect(pos.currentMaxNumberInPhase).toBe(5);

    // Without takenIds (legacy): factory yields 39.6, 39.7, ... but a
    // batch large enough to hit 39.15 collides.
    const noTakenFactory = nextTaskNumberFactory(pos);
    expect(noTakenFactory({}, 9)).toBe('39.15'); // legacy COLLIDES with misplaced.

    // With takenIds: factory skips 39.15.
    const ids = collectAllTaskIds(wp);
    const takenFactory = nextTaskNumberFactory(pos, ids);
    const issued = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => takenFactory({}, i));
    expect(issued).not.toContain('39.15');
    expect(issued[0]).toBe('39.6');
    // After 39.6..39.14 (nine), the next free is 39.16 (39.15 taken).
    expect(issued[9]).toBe('39.16');
  });

  it('takenIds also skips an archived ledger range', () => {
    const wp = [
      '# Workplan',
      '',
      '<!-- workplan-archive-ledger',
      'archived-phases: 5',
      'archived-fix-tasks: 39.6-39.8',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 39.9',
      '-->',
      '',
      '## Phase 39: current',
      '',
      '### Task 39.5: in-phase',
      '',
      '- [ ] Step 1.',
      '',
    ].join('\n');
    const pos = computeAutoPosition(wp);
    // Ledger floors max to 8 (= next - 1).
    expect(pos.currentMaxNumberInPhase).toBe(8);
    const ids = collectAllTaskIds(wp);
    const takenFactory = nextTaskNumberFactory(pos, ids);
    expect(takenFactory({}, 0)).toBe('39.9');
  });
});

describe('#420 findDuplicateTaskHeadings — post-write assertion', () => {
  it('returns empty when no duplicate headings exist', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: ...',
      '',
      '### Task 39.1: ...',
      '',
      '### Task 39.2: ...',
      '',
      '### Task 39.3 (fix-finding-AUDIT-X): ...',
      '',
    ].join('\n');
    expect(findDuplicateTaskHeadings(wp)).toEqual([]);
  });

  it('reports the duplicate ID exactly once when one collision exists', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: ...',
      '',
      '### Task 39.15: ORIGINAL',
      '',
      '### Task 39.15 (fix-finding-AUDIT-Y): DUPLICATE',
      '',
    ].join('\n');
    expect(findDuplicateTaskHeadings(wp)).toEqual(['39.15']);
  });

  it('reports multiple duplicate IDs sorted', () => {
    const wp = [
      '# Workplan',
      '',
      '## Phase 39: ...',
      '',
      '### Task 39.15: ORIGINAL',
      '### Task 39.17: ORIGINAL',
      '### Task 39.15 (fix-finding-X): DUP 1',
      '### Task 39.17 (fix-finding-Y): DUP 2',
      '',
    ].join('\n');
    expect(findDuplicateTaskHeadings(wp)).toEqual(['39.15', '39.17']);
  });
});
