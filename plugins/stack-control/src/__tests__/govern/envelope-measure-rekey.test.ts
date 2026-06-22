// 030 T008 (RED first) — research Tension 1+2: the rendered-payload
// byte-measurement primitive (the envelope currency) is rekeyed OFF the
// per-phase concept. It measures rendered bytes for a generic unit id (a chunk
// or seam id), returning that id as `.id` (not `.phaseId`), and its empty-id
// guard is phrased generically. Watched to FAIL while the primitive is still
// keyed on `phaseId` (Phase 2 T009 makes it pass).

import { describe, expect, it } from 'vitest';
import { estimateBoundary, measureBoundaryFit } from '../../govern/phase-boundary-sizing.js';

describe('030 T008 — envelope-measurement primitive rekeyed off phaseId', () => {
  it('measures rendered bytes for a chunk id, returning it as `.id`', () => {
    const m = measureBoundaryFit('chunk-7', 500, 1000);
    expect(m.id).toBe('chunk-7');
    expect(m.measuredPromptBytes).toBe(500);
    expect(m.disposition).toBe('fits');
  });

  it('measures a seam id payload over the envelope', () => {
    const m = measureBoundaryFit('seam-1', 2000, 1000);
    expect(m.id).toBe('seam-1');
    expect(m.disposition).toBe('boundary-too-large');
  });

  it('estimates for a chunk id, returning it as `.id`', () => {
    const e = estimateBoundary('chunk-7', ['a.ts', 'b.ts'], 100, 1000);
    expect(e.id).toBe('chunk-7');
    expect(e.estimatedPromptBytes).toBe(200);
  });

  it('rejects an empty id with a generic (non-phase) message', () => {
    expect(() => measureBoundaryFit('', 100, 100)).toThrow(/boundary id must be a non-empty string/);
  });
});
