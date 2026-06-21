import { describe, expect, it } from 'vitest';
import { estimateBoundary, measureBoundaryFit } from '../../govern/phase-boundary-sizing.js';

describe('phase boundary sizing records', () => {
  it('records a prospective estimate against the active fleet envelope', () => {
    const estimate = estimateBoundary('2', ['src/a.ts', 'src/b.ts'], 2048, 8192);
    expect(estimate.estimatedPromptBytes).toBe(4096);
    expect(estimate.fitsActiveFleet).toBe(true);
    expect(estimate.estimateBasis).toContain('2 path(s)');
  });

  it('marks an oversized actual payload as boundary-too-large', () => {
    const measurement = measureBoundaryFit('2', 12000, 8192);
    expect(measurement.disposition).toBe('boundary-too-large');
  });

  it('fails loud on invalid byte counts and empty ids', () => {
    expect(() => estimateBoundary('', ['src/a.ts'], 2048, 8192)).toThrow(/boundary id must be a non-empty string/);
    expect(() => estimateBoundary('2', ['src/a.ts'], -1, 8192)).toThrow(/averageBytesPerPath must be a positive integer/);
    expect(() => measureBoundaryFit('2', Number.NaN, 8192)).toThrow(/measuredPromptBytes must be a positive integer/);
    expect(() => measureBoundaryFit('2', 4096, 0)).toThrow(/activeFleetEnvelopeBytes must be a positive integer/);
  });
});
