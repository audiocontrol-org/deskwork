// 030 T004 (RED first) — FR-021: every new on-disk artifact is schema-validated.
// Each entity validator MUST accept a valid fixture and reject a missing
// required field with a descriptive throw. Watched to FAIL while the validators
// are 'not implemented' stubs (Phase 2 T005 makes it pass).
//
// Tests live under src/__tests__/govern/ (the project's collected convention);
// the source modules keep the tasks.md paths under src/govern/.

import { describe, expect, it } from 'vitest';
import {
  validateChunk,
  validateChunkManifest,
  validateSplitClusterMarker,
  validateTouchedSet,
  validateSeamResult,
  validateWholeFeatureConvergenceRecord,
  type Chunk,
  type ChunkManifest,
  type SplitClusterMarker,
  type TouchedSet,
  type SeamResult,
  type WholeFeatureConvergenceRecord,
} from '../../govern/chunk-artifacts.js';

const validChunk: Chunk = { id: 'c1', files: ['a.ts'], splitCluster: false, renderedBytes: 100 };
const validManifest: ChunkManifest = { chunkId: 'c1', otherChunks: [{ id: 'c2', files: ['b.ts'] }] };
const validMarker: SplitClusterMarker = {
  clusterId: 'cl1',
  subChunkIds: ['c1', 'c2'],
  trimApplied: [{ category: 'lockfile', bytes: 50 }],
  coverageCaveat: 'within-cluster cross-sub-chunk coverage reduced; recovered via seam pass',
};
const validTouched: TouchedSet = { round: 1, chunkIds: ['c1'], sourceFixCommits: ['abc123'], newFiles: [] };
const validSeam: SeamResult = {
  boundaryPairs: [{ a: 'c1', b: 'c2' }],
  findings: [{ kind: 'removed-export', symbol: 'foo', consumedAcross: true, severity: 'HIGH' }],
  suppressedCompatible: 2,
};
const validRecord: WholeFeatureConvergenceRecord = {
  version: 1,
  mode: 'impl',
  item: 'multi:feature/x',
  governedShaBase: 'base000',
  headSha: 'head000',
  chunkIds: ['c1'],
  rounds: 1,
  liftedFindings: [],
  closedInLoopFindings: [],
  seamResult: validSeam,
  splitClusterRefs: [],
  outcome: 'converged',
  anchorRoot: '/root',
};

/** Return a shallow clone of an object with one key removed (for the missing-field case). */
function without<T extends object>(obj: T, key: keyof T): unknown {
  const clone: Record<string, unknown> = { ...obj };
  delete clone[key as string];
  return clone;
}

describe('030 T004 — chunk-artifacts schema validators (FR-021)', () => {
  it('validateChunk accepts a valid chunk and rejects a missing id', () => {
    expect(validateChunk(validChunk)).toEqual(validChunk);
    expect(() => validateChunk(without(validChunk, 'id'))).toThrow(/id/);
  });

  it('validateChunkManifest accepts a valid manifest and rejects a missing chunkId', () => {
    expect(validateChunkManifest(validManifest)).toEqual(validManifest);
    expect(() => validateChunkManifest(without(validManifest, 'chunkId'))).toThrow(/chunkId/);
  });

  it('validateSplitClusterMarker accepts a valid marker and rejects a missing coverageCaveat', () => {
    expect(validateSplitClusterMarker(validMarker)).toEqual(validMarker);
    expect(() => validateSplitClusterMarker(without(validMarker, 'coverageCaveat'))).toThrow(/coverageCaveat/);
  });

  it('validateTouchedSet accepts a valid set and rejects a missing round', () => {
    expect(validateTouchedSet(validTouched)).toEqual(validTouched);
    expect(() => validateTouchedSet(without(validTouched, 'round'))).toThrow(/round/);
  });

  it('validateSeamResult accepts a valid result and rejects a missing suppressedCompatible', () => {
    expect(validateSeamResult(validSeam)).toEqual(validSeam);
    expect(() => validateSeamResult(without(validSeam, 'suppressedCompatible'))).toThrow(/suppressedCompatible/);
  });

  it('validateWholeFeatureConvergenceRecord accepts a valid record and rejects a missing outcome', () => {
    expect(validateWholeFeatureConvergenceRecord(validRecord)).toEqual(validRecord);
    expect(() => validateWholeFeatureConvergenceRecord(without(validRecord, 'outcome'))).toThrow(/outcome/);
  });
});
