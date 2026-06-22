// specs/021-audit-protocol-friction-burndown — T013/T014 (US2).
//
// Actual payload fit against the active fleet envelope: once a phase's prompt is
// rendered, its MEASURED byte size is checked against the active fleet's envelope.
// A payload that fits returns `fits`; one that exceeds returns
// `boundary-too-large` and `assertBoundaryFits` throws so the govern path can map
// it to a terminal outcome. (The complementary PROSPECTIVE estimate lives in
// phase-boundary-sizing.test.ts; this file pins the ACTUAL-measurement half.)

import { describe, expect, it } from 'vitest';
import { measureBoundaryFit } from '../../govern/phase-boundary-sizing.js';

// 030 US2 (T028/T035): assertBoundaryFits + BoundaryTooLargeError are DELETED — the
// chunked bin-packer AVOIDS the over-envelope condition. The measurement primitive
// survives; only the FATAL-throwing wrapper is gone.

describe('actual payload fit against the fleet envelope', () => {
  it('a payload at or under the envelope fits', () => {
    expect(measureBoundaryFit('1', 100, 100).disposition).toBe('fits');
    expect(measureBoundaryFit('1', 50, 100).disposition).toBe('fits');
    const m = measureBoundaryFit('2', 50, 100);
    expect(m).toEqual({
      version: 1,
      id: '2',
      measuredPromptBytes: 50,
      activeFleetEnvelopeBytes: 100,
      disposition: 'fits',
    });
  });

  it('a payload over the envelope is boundary-too-large', () => {
    expect(measureBoundaryFit('1', 101, 100).disposition).toBe('boundary-too-large');
  });

  it('rejects non-positive-integer measurements (no silent zero/NaN fit)', () => {
    expect(() => measureBoundaryFit('1', 0, 100)).toThrow(/positive integer/);
    expect(() => measureBoundaryFit('1', 100, 0)).toThrow(/positive integer/);
    expect(() => measureBoundaryFit('1', 1.5, 100)).toThrow(/positive integer/);
  });
});
