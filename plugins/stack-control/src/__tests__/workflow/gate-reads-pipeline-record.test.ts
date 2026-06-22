// 030 US9 T070 (FR-025, SC-008): the governing→shipped gate's impl signal
// (implRecordConverged) reads the pipeline's WholeFeatureConvergenceRecord
// (outcome === 'converged'); the divergent implement-mode GovernConvergenceRecord
// read path is gone.
//
// RED now: buildItemContext computes implRecordConverged via isModeConverged('impl')
// → readGovernConvergenceRecord, which validates the OLD record shape and cannot read
// the whole-feature record written at the same impl path (it throws on the missing
// scopeFingerprint). After T083 the impl read switches to readWholeFeatureConvergence-
// Record and keys on outcome.

import { afterEach, describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { buildItemContext } from '../../workflow/workflow-context.js';
import { convergenceKeyFor } from '../../workflow/identity.js';
import {
  writeWholeFeatureConvergenceRecord,
  type WholeFeatureConvergenceRecord,
} from '../../govern/chunk-artifacts.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(): WorkflowFixture {
  const f = makeWorkflowFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function wholeRecord(item: string, root: string): WholeFeatureConvergenceRecord {
  return {
    version: 1,
    mode: 'impl',
    item,
    governedShaBase: 'base0',
    headSha: 'head0',
    chunkIds: ['c1'],
    rounds: 1,
    liftedFindings: [],
    closedInLoopFindings: [],
    seamResult: { boundaryPairs: [], findings: [], suppressedCompatible: 0 },
    splitClusterRefs: [],
    outcome: 'converged',
    anchorRoot: root,
  };
}

describe('030 T070 — the impl gate reads the whole-feature convergence record (FR-025)', () => {
  it('a converged WholeFeatureConvergenceRecord makes implRecordConverged true', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/010-x' }]);
    const item = loadRoadmap(f.roadmapPath, f.opts).byId.get('multi:feature/a')!;
    writeWholeFeatureConvergenceRecord(f.root, wholeRecord(convergenceKeyFor(item), f.root));
    expect(buildItemContext(f.root, item).inputs.implRecordConverged).toBe(true);
  });

  it('a non-converged whole-feature record (override-eligible) keeps implRecordConverged false', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/010-x' }]);
    const item = loadRoadmap(f.roadmapPath, f.opts).byId.get('multi:feature/a')!;
    writeWholeFeatureConvergenceRecord(f.root, {
      ...wholeRecord(convergenceKeyFor(item), f.root),
      outcome: 'override-eligible',
    });
    expect(buildItemContext(f.root, item).inputs.implRecordConverged).toBe(false);
  });
});
