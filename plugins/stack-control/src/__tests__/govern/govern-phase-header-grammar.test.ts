// specs/021-audit-protocol-friction-burndown — T021/T022 (US4), backlog TASK-71.
//
// RED→GREEN: `--phase` must resolve a tasks.md phase whose header uses a separator
// OTHER than a colon (dash, em-dash/en-dash) or no separator at all. The original
// grammar (`^##\s+Phase\s+([^:\n]+?)\s*:`) required a literal colon, so a
// dash-form or bare `## Phase N` header was invisible to per-phase govern and the
// phase silently could not be selected.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePhases, resolvePhaseUnit } from '../../govern/incremental-audit.js';

describe('phase header grammar (US4 / TASK-71)', () => {
  it('parses phase ids across colon, dash, em-dash, and bare headers', () => {
    const tasks = [
      '# Tasks',
      '',
      '## Phase 1: Setup',
      '- [ ] T001 touch `src/a.ts`',
      '',
      '## Phase 2 - Foundational',
      '- [ ] T002 touch `src/b.ts`',
      '',
      '## Phase 3 — User Story 1',
      '- [ ] T003 touch `src/c.ts`',
      '',
      '## Phase 4',
      '- [ ] T004 touch `src/d.ts`',
      '',
      '## Phase 5: User Story 3 (Priority: P1)',
      '- [ ] T005 touch `src/e.ts`',
      '',
    ].join('\n');
    const phases = parsePhases(tasks);
    expect(phases.map((p) => p.phaseId)).toEqual(['1', '2', '3', '4', '5']);
    // Each phase still extracts only its own backticked file path.
    expect(phases.find((p) => p.phaseId === '2')?.files).toEqual(['src/b.ts']);
    expect(phases.find((p) => p.phaseId === '4')?.files).toEqual(['src/d.ts']);
    // A colon appearing inside the TITLE (after the id) must not split the id.
    expect(phases.find((p) => p.phaseId === '5')?.files).toEqual(['src/e.ts']);
  });

  it('resolvePhaseUnit selects a dash-form phase the colon grammar could not see', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-grammar-'));
    try {
      const tasksPath = join(root, 'tasks.md');
      writeFileSync(
        tasksPath,
        ['## Phase 2 - Foundational', '- [ ] T010 edit `src/govern/protocol.ts`', ''].join('\n'),
        'utf8',
      );
      const unit = resolvePhaseUnit({ tasksPath, phaseId: '2', diffBase: 'HEAD~1' });
      expect(unit.granularity).toBe('phase');
      expect(unit.phaseId).toBe('2');
      expect(unit.diffScope.files).toEqual(['src/govern/protocol.ts']);
      expect(unit.auditLogSection).toBe('phase-2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat a titled non-numeric `## Phase` line as a numbered phase', () => {
    // A digit-led id is required so a stray "## Phase notes" prose header is not
    // mistaken for a selectable phase.
    const phases = parsePhases(['## Phase notes', '- [ ] x `src/z.ts`', ''].join('\n'));
    expect(phases).toHaveLength(0);
  });
});
