// 025 Phase 2 (Foundational) — phase enumeration derives the phase set from
// tasks.md headers and FAILS LOUD (FR-004) when a phase has no authoritative
// file list or when zero phases are derivable. RED first (T003 + T005).
//
// The enumeration is the shared substrate the US1 graduate gate and the US2
// execute cadence both read; it must refuse to scope a partial/empty payload
// rather than let an empty phase masquerade as governed.

import { describe, expect, it } from 'vitest';
import { enumeratePhases } from '../../workflow/phase-enumeration.js';
import { WorkflowError } from '../../workflow/workflow-types.js';

const THREE_PHASES = [
  '# Tasks',
  '',
  '## Phase 1: Setup',
  '',
  '- [ ] T001 touch `src/feat/a.ts`',
  '- [ ] T002 touch `src/feat/b.ts`',
  '',
  '## Phase 2: Foundational',
  '',
  '- [ ] T003 edit `src/feat/c.ts`',
  '',
  '## Phase 3: MVP',
  '',
  '- [ ] T004 edit `src/feat/d.ts`',
  '',
].join('\n');

describe('enumeratePhases (FR-004)', () => {
  it('derives the phase set + per-phase file lists from tasks.md headers', () => {
    const phases = enumeratePhases(THREE_PHASES);
    expect(phases.map((p) => p.phaseId)).toEqual(['1', '2', '3']);
    expect(phases[0]!.files).toEqual(['src/feat/a.ts', 'src/feat/b.ts']);
    expect(phases[1]!.files).toEqual(['src/feat/c.ts']);
    expect(phases[2]!.files).toEqual(['src/feat/d.ts']);
  });

  it('FAILS LOUD naming the phase when a phase has no authoritative file list', () => {
    const tasks = [
      '# Tasks',
      '',
      '## Phase 1: Setup',
      '',
      '- [ ] T001 touch `src/feat/a.ts`',
      '',
      '## Phase 2: No files here',
      '',
      '- [ ] T002 think hard about the design',
      '',
    ].join('\n');
    expect(() => enumeratePhases(tasks)).toThrow(WorkflowError);
    expect(() => enumeratePhases(tasks)).toThrow(/phase '2'/);
  });

  it('FATALs (not trivially met) when zero phases are derivable', () => {
    const tasks = ['# Tasks', '', '- [ ] T001 a task with no phase header', ''].join('\n');
    expect(() => enumeratePhases(tasks)).toThrow(WorkflowError);
    expect(() => enumeratePhases(tasks)).toThrow(/no .*phase/i);
  });
});
