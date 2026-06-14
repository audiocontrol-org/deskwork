// specs/021-audit-protocol-friction-burndown — T010 (US1).
//
// The whole-feature `after_implement` unit COMPOSES from already-converged phase
// checkpoints instead of erasing them: a phase whose code is unchanged since its
// unit-audit converged is CARRIED (excluded from the re-audit); a phase that is
// changed-since, or has no recorded convergence (cross-cutting / never-audited
// code), is RE-AUDITED. This is the mechanical teeth behind "per-phase govern is
// not thrown away by the final pass".

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveComposingFeatureUnit } from '../../govern/incremental-audit.js';

const TASKS = [
  '## Phase 1: Setup',
  '- [ ] T001 edit `src/p1.ts`',
  '',
  '## Phase 2: Core',
  '- [ ] T002 edit `src/p2.ts`',
  '',
  '## Phase 3: Polish',
  '- [ ] T003 edit `src/p3.ts`',
  '',
].join('\n');

function withTasks(run: (tasksPath: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'phase-composition-'));
  try {
    const tasksPath = join(root, 'tasks.md');
    writeFileSync(tasksPath, TASKS, 'utf8');
    run(tasksPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('whole-feature govern composes from phase checkpoints (T010/US1)', () => {
  it('carries converged-and-unchanged phases, re-audits changed and never-converged ones', () => {
    withTasks((tasksPath) => {
      const unit = resolveComposingFeatureUnit({
        tasksPath,
        diffBase: 'HEAD~1',
        phases: [
          { phaseId: '1', converged: true, changed: false }, // carried (excluded)
          { phaseId: '2', converged: true, changed: true }, // changed since → re-audited
          // phase 3 has NO status → never converged → re-audited
        ],
      });
      expect(unit.granularity).toBe('feature');
      expect(unit.auditLogSection).toBe('after_implement');
      expect(unit.diffScope.base).toBe('HEAD~1');
      // p1 carried out; p2 (changed) + p3 (never-converged) re-audited.
      expect(unit.diffScope.files).not.toContain('src/p1.ts');
      expect(unit.diffScope.files).toContain('src/p2.ts');
      expect(unit.diffScope.files).toContain('src/p3.ts');
    });
  });

  it('carries ALL phases when every one converged and is unchanged (minimal re-audit)', () => {
    withTasks((tasksPath) => {
      const unit = resolveComposingFeatureUnit({
        tasksPath,
        diffBase: 'HEAD~1',
        phases: [
          { phaseId: '1', converged: true, changed: false },
          { phaseId: '2', converged: true, changed: false },
          { phaseId: '3', converged: true, changed: false },
        ],
      });
      expect(unit.diffScope.files).toEqual([]);
    });
  });

  it('re-audits every phase when none has a recorded convergence (no checkpoints yet)', () => {
    withTasks((tasksPath) => {
      const unit = resolveComposingFeatureUnit({ tasksPath, diffBase: 'HEAD~1', phases: [] });
      expect(unit.diffScope.files).toEqual(['src/p1.ts', 'src/p2.ts', 'src/p3.ts']);
    });
  });
});
