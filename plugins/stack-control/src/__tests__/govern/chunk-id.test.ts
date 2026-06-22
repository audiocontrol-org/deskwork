// 030 T006 (RED first) — FR-004 / R3: a chunk id is a stable hash of the sorted
// file-path SET, identical across two runs over the same governedSha..HEAD
// endpoints (i.e. the same changed-file set). Watched to FAIL while
// computeChunkId is a 'not implemented' stub (Phase 2 T007 makes it pass).

import { describe, expect, it } from 'vitest';
import { computeChunkId } from '../../govern/cluster-payload/chunk-id.js';

describe('030 T006 — deterministic chunk id (FR-004, R3)', () => {
  it('is order-independent (hash of the sorted file set)', () => {
    expect(computeChunkId(['src/b.ts', 'src/a.ts'])).toBe(computeChunkId(['src/a.ts', 'src/b.ts']));
  });

  it('is identical across two runs over the same file set (deterministic)', () => {
    const files = ['src/govern/protocol.ts', 'src/govern/end-govern-pipeline.ts'];
    expect(computeChunkId(files)).toBe(computeChunkId(files));
  });

  it('has set semantics — duplicate paths do not change the id', () => {
    expect(computeChunkId(['src/a.ts', 'src/a.ts'])).toBe(computeChunkId(['src/a.ts']));
  });

  it('differs for different file sets', () => {
    expect(computeChunkId(['src/a.ts'])).not.toBe(computeChunkId(['src/b.ts']));
  });

  it('returns a non-empty lowercase-hex hash string', () => {
    expect(computeChunkId(['src/a.ts'])).toMatch(/^[0-9a-f]+$/);
  });
});
