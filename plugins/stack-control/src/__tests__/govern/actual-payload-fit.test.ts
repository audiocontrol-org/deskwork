// specs/021-audit-protocol-friction-burndown — T013/T014 (US2).
//
// Actual payload fit against the active fleet envelope: once a phase's prompt is
// rendered, its MEASURED byte size is checked against the active fleet's envelope.
// A payload that fits returns `fits`; one that exceeds returns
// `boundary-too-large` and `assertBoundaryFits` throws so the govern path can map
// it to a terminal outcome. (The complementary PROSPECTIVE estimate lives in
// phase-boundary-sizing.test.ts; this file pins the ACTUAL-measurement half.)

import { describe, expect, it } from 'vitest';
import {
  measureBoundaryFit,
  assertBoundaryFits,
  BoundaryTooLargeError,
} from '../../govern/phase-boundary-sizing.js';

describe('actual payload fit against the fleet envelope (T013/T014)', () => {
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

  it('assertBoundaryFits returns the measurement when the payload fits', () => {
    expect(assertBoundaryFits('1', 80, 100).disposition).toBe('fits');
  });

  it('assertBoundaryFits throws BoundaryTooLargeError naming the overflow', () => {
    let err: unknown;
    try {
      assertBoundaryFits('phase-3', 4096, 1024);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BoundaryTooLargeError);
    expect((err as BoundaryTooLargeError).id).toBe('phase-3');
    expect((err as BoundaryTooLargeError).measuredPromptBytes).toBe(4096);
    expect((err as BoundaryTooLargeError).activeFleetEnvelopeBytes).toBe(1024);
    expect((err as Error).message).toMatch(/exceeding the active fleet envelope 1024/);
  });

  it('rejects non-positive-integer measurements (no silent zero/NaN fit)', () => {
    expect(() => measureBoundaryFit('1', 0, 100)).toThrow(/positive integer/);
    expect(() => measureBoundaryFit('1', 100, 0)).toThrow(/positive integer/);
    expect(() => measureBoundaryFit('1', 1.5, 100)).toThrow(/positive integer/);
  });
});
