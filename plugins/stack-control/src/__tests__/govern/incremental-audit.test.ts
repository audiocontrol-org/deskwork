// specs/015-audit-protocol-convergence — T023 (RED): per-phase audit-unit
// resolution (FR-007/008 / D6). contracts/incremental-audit.md.
//
//   - resolvePhaseUnit: diff-scope is ONE phase's files only (not the whole
//     feature) — SC-006.
//   - resolveComposingFeatureUnit: excludes a converged-AND-unchanged phase's
//     files; includes a changed phase's files (FR-008 composition).
//   - a phase unit and the feature unit both record under the SAME per-feature
//     audit-log store (FR-008) — the boundary changes the payload, not the store.

import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePhaseUnit,
  resolveComposingFeatureUnit,
  parsePhases,
} from '../../govern/incremental-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TASKS = join(HERE, '..', 'fixtures', 'convergence', 'multi-phase-feature', 'tasks.md');

describe('resolvePhaseUnit (per-phase diff scope, SC-006)', () => {
  it('scopes the diff to ONE phase\'s files, not the whole feature', () => {
    const unit = resolvePhaseUnit({ tasksPath: TASKS, phaseId: '2', diffBase: 'HEAD~4' });
    expect(unit.granularity).toBe('phase');
    expect(unit.phaseId).toBe('2');
    // Phase 2's files only.
    expect(unit.diffScope.files).toContain('plugins/stack-control/src/fixture/alpha-resolver.ts');
    expect(unit.diffScope.files).toContain('plugins/stack-control/src/fixture/alpha-resolver.test.ts');
    // NOT phase 1's or phase 3's files.
    expect(unit.diffScope.files).not.toContain('plugins/stack-control/src/fixture/alpha-setup.ts');
    expect(unit.diffScope.files).not.toContain('plugins/stack-control/src/fixture/beta-resolver.ts');
    expect(unit.diffScope.base).toBe('HEAD~4');
  });

  it('throws on an unknown phase id (fail loud, not a silent empty scope)', () => {
    expect(() => resolvePhaseUnit({ tasksPath: TASKS, phaseId: '99', diffBase: 'HEAD' })).toThrow(
      /phase '99' not found/,
    );
  });

  it('parsePhases finds every phase with its files', () => {
    const phases = parsePhases(
      '## Phase 1: A\n\n- T in `src/a.ts`\n\n## Phase 2: B\n\n- T in `src/b.ts`\n',
    );
    expect(phases.map((p) => p.phaseId)).toEqual(['1', '2']);
    expect(phases[0]!.files).toEqual(['src/a.ts']);
    expect(phases[1]!.files).toEqual(['src/b.ts']);
  });

  it('parsePhases preserves directory scopes named in backticks', () => {
    const phases = parsePhases(
      '## Phase 1: A\n\n- T in `plugins/stack-control/src/govern/`\n',
    );
    expect(phases[0]!.files).toEqual(['plugins/stack-control/src/govern']);
  });
});

describe('resolveComposingFeatureUnit (FR-008 composition)', () => {
  it('excludes a converged-and-unchanged phase, includes a changed phase', () => {
    const unit = resolveComposingFeatureUnit({
      tasksPath: TASKS,
      diffBase: 'HEAD~6',
      phases: [
        { phaseId: '1', converged: true, changed: false }, // carried → excluded
        { phaseId: '2', converged: true, changed: true }, // changed → included
        { phaseId: '3', converged: false, changed: false }, // never-converged → included
      ],
    });
    expect(unit.granularity).toBe('feature');
    expect(unit.phaseId).toBeUndefined();
    // Phase 1 carried (converged + unchanged) → its files excluded.
    expect(unit.diffScope.files).not.toContain('plugins/stack-control/src/fixture/alpha-setup.ts');
    // Phase 2 changed → included.
    expect(unit.diffScope.files).toContain('plugins/stack-control/src/fixture/alpha-resolver.ts');
    // Phase 3 never converged (cross-cutting) → included.
    expect(unit.diffScope.files).toContain('plugins/stack-control/src/fixture/beta-resolver.ts');
  });
});

describe('phase + feature units record under the same per-feature store (FR-008)', () => {
  it('a phase unit uses a per-phase section label; the feature unit uses after_implement', () => {
    const phaseUnit = resolvePhaseUnit({ tasksPath: TASKS, phaseId: '2', diffBase: 'HEAD' });
    const featureUnit = resolveComposingFeatureUnit({ tasksPath: TASKS, diffBase: 'HEAD', phases: [] });
    // Distinct sections (the gate scopes per-checkpoint), but both are sections
    // of the ONE per-feature audit-log the lift always writes to.
    expect(phaseUnit.auditLogSection).toBe('phase-2');
    expect(featureUnit.auditLogSection).toBe('after_implement');
  });
});
