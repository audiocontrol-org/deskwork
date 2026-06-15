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
  parsePhases,
  carriedExclusivelyCurrentFiles,
  carriedFilesForComposition,
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

// NOTE: the whole-feature `after_implement` composition is now EXCLUSION-based and
// lives in the govern command (specs/021 US1 true-composition); the old inclusion
// primitive `resolveComposingFeatureUnit` was removed (021 phase-2 audit). CLI
// composition behavior is covered by phase-checkpoints.test.ts.

describe('phase units record under the per-feature store (FR-008)', () => {
  it('a phase unit uses a per-phase section label', () => {
    const phaseUnit = resolvePhaseUnit({ tasksPath: TASKS, phaseId: '2', diffBase: 'HEAD' });
    expect(phaseUnit.auditLogSection).toBe('phase-2');
  });
});

describe('carriedExclusivelyCurrentFiles (US1 composition, 021 phase-7 HIGH)', () => {
  it('carries a file owned only by current phases', () => {
    expect(
      carriedExclusivelyCurrentFiles([
        { current: true, files: ['a.ts', 'b.ts'] },
        { current: false, files: ['c.ts'] },
      ]),
    ).toEqual(['a.ts', 'b.ts']);
  });

  it('does NOT carry a file shared by a current AND a non-current phase (no false-clean)', () => {
    // `shared.ts` belongs to a current phase AND a stale/missing phase — it must be
    // re-audited (excluded from the carry set), or the non-current phase's work on
    // it is silently hidden.
    expect(
      carriedExclusivelyCurrentFiles([
        { current: true, files: ['shared.ts', 'only-current.ts'] },
        { current: false, files: ['shared.ts', 'only-stale.ts'] },
      ]),
    ).toEqual(['only-current.ts']);
  });

  it('carries nothing when every phase is non-current', () => {
    expect(
      carriedExclusivelyCurrentFiles([{ current: false, files: ['a.ts'] }]),
    ).toEqual([]);
  });

  it('treats directory/file PREFIX overlap as shared ownership (021 after_implement HIGH)', () => {
    // A current phase owns the directory `src/`; a stale phase owns `src/foo.ts`
    // under it → `src/` must NOT be carried (it would exclude the stale file).
    expect(
      carriedExclusivelyCurrentFiles([
        { current: true, files: ['src/', 'docs/keep.md'] },
        { current: false, files: ['src/foo.ts'] },
      ]),
    ).toEqual(['docs/keep.md']);
    // Reverse direction: current owns the file, stale owns the ancestor dir.
    expect(
      carriedExclusivelyCurrentFiles([
        { current: true, files: ['src/a/b.ts'] },
        { current: false, files: ['src/a'] },
      ]),
    ).toEqual([]);
  });
});

describe('carriedFilesForComposition (TASK-129 — carry ACTUAL audited files, not declared dirs)', () => {
  it('carries a current phase\'s ACTUAL audited files, NOT its declared directory', () => {
    // US4 declares the directory `src/govern/` but actually audited only
    // `src/govern/protocol.ts` (its diff). A cross-cutting change to
    // `src/govern/payload.ts` is owned by no phase. Carrying the DECLARED directory
    // would exclude payload.ts from the whole-feature audit even though nothing
    // audited it (TASK-129 blind spot). Composing by the AUDITED file list carries
    // only protocol.ts; payload.ts stays in the diff and is re-audited.
    expect(
      carriedFilesForComposition([
        {
          state: 'current',
          declaredFiles: ['src/govern/'],
          auditedFiles: ['src/govern/protocol.ts'],
        },
      ]),
    ).toEqual(['src/govern/protocol.ts']);
  });

  it('carries NOTHING for a current phase with no recorded audited files (conservative re-audit / migration)', () => {
    // An old checkpoint written before TASK-129 has no auditedFiles. We cannot
    // prove what it audited, so it is re-audited (never carried) — the safe
    // direction. On the next govern run the checkpoint is rewritten WITH the field.
    expect(
      carriedFilesForComposition([{ state: 'current', declaredFiles: ['src/govern/'] }]),
    ).toEqual([]);
  });

  it('still refuses to carry a file shared with a non-current phase (021 phase-7 protection preserved)', () => {
    // Non-current phases contribute their DECLARED scope as a re-audit claim; a
    // current phase\'s audited file overlapping any non-current declared scope is
    // dropped so the non-current phase\'s unaudited work is not hidden.
    expect(
      carriedFilesForComposition([
        {
          state: 'current',
          declaredFiles: ['src/'],
          auditedFiles: ['src/shared.ts', 'src/only-current.ts'],
        },
        { state: 'stale', declaredFiles: ['src/shared.ts'] },
      ]),
    ).toEqual(['src/only-current.ts']);
  });
});
