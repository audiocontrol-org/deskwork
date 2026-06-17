// 025 AUDIT codex-01 / claude-02 (HIGH) regression — the per-phase checkpoint namespace
// is single-sourced through featureCheckpointKey so the writer (govern) and the reader
// (the US1 graduate gate) can never address different checkpoint directories. RED first
// (before the fix the gate keyed on a raw basename and govern on resolveFeatureSlug).

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { featureCheckpointKey } from '../../govern/phase-checkpoint-status.js';
import {
  computeScopeFingerprint,
  phaseCheckpointSection,
  writePhaseCheckpoint,
} from '../../govern/checkpoint-state.js';
import { evaluateCriterion, type GateContext } from '../../workflow/gate-eval.js';
import type { Criterion } from '../../workflow/workflow-types.js';
import {
  makeUnskippableFixture,
  type UnskippableFixture,
} from '../fixtures/workflow/unskippable-fixtures.js';

let fixtures: UnskippableFixture[] = [];
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

const CRITERION: Criterion = { kind: 'all-phase-checkpoints-current', target: 'impl' };

describe('canonical checkpoint key (AUDIT codex-01/claude-02)', () => {
  it('is the spec-dir basename, branch-independent', () => {
    expect(featureCheckpointKey('/x/specs/025-foo')).toBe('025-foo');
    expect(featureCheckpointKey('/x/specs/025-foo/')).toBe('025-foo');
    expect(featureCheckpointKey('025-foo')).toBe('025-foo');
  });

  it('the gate reads the checkpoint key derived from the spec dir, not an arbitrary slug', () => {
    const f = makeUnskippableFixture({
      slug: '025-keytest',
      node: { identifier: 'multi:feature/x', status: 'in-flight' },
      phases: [{ id: '1', files: [{ path: 'src/k/a.ts', content: 'export const a = 1;\n' }] }],
    });
    fixtures.push(f);
    const specDirPath = join(f.root, f.specDirRel);
    const ctx: GateContext = {
      installationRoot: f.root,
      item: 'multi:feature/x',
      designPointer: null,
      specPointer: f.specDirRel,
      analyzeClean: true,
      designApproved: true,
      designRecordPath: null,
      specDirPath,
      implRecordConverged: false,
      specRecordConverged: false,
      advanceTreeClean: true,
    };

    // A checkpoint written under a DIVERGENT slug (as a branch-keyed govern would) is NOT
    // seen by the gate — proving the gate keys on the canonical spec-dir identity.
    const governedPaths = ['src/k/a.ts'];
    const fp = computeScopeFingerprint(f.root, governedPaths);
    writePhaseCheckpoint(f.root, {
      version: 1,
      featureSlug: 'wrong-branch-slug',
      phaseId: '1',
      checkpoint: phaseCheckpointSection('1'),
      auditLogSection: phaseCheckpointSection('1'),
      scopeFingerprint: fp,
      passedAt: '2026-06-16T00:00:00.000Z',
      governedPaths,
    });
    expect(evaluateCriterion(CRITERION, ctx)).toBe(false); // divergent key → still unmet

    // Written under the CANONICAL key (what featureCheckpointKey(specDir) yields) → met.
    writePhaseCheckpoint(f.root, {
      version: 1,
      featureSlug: featureCheckpointKey(specDirPath),
      phaseId: '1',
      checkpoint: phaseCheckpointSection('1'),
      auditLogSection: phaseCheckpointSection('1'),
      scopeFingerprint: fp,
      passedAt: '2026-06-16T00:00:00.000Z',
      governedPaths,
    });
    expect(evaluateCriterion(CRITERION, ctx)).toBe(true);
    // And the canonical key IS the fixture slug (spec-dir basename).
    expect(featureCheckpointKey(specDirPath)).toBe(f.slug);
  });
});
