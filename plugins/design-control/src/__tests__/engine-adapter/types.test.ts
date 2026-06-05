import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLAUDE_ADAPTER_ID,
  isConfidence,
  assertConfidence,
  FAILURE_MODES,
} from '@/engine-adapter';

describe('DEFAULT_CLAUDE_ADAPTER_ID', () => {
  it('is the frontend-design cross-plugin dependency', () => {
    expect(DEFAULT_CLAUDE_ADAPTER_ID).toBe('frontend-design');
  });
});

describe('confidence validator', () => {
  it('accepts 0, 0.5, and 1', () => {
    expect(isConfidence(0)).toBe(true);
    expect(isConfidence(0.5)).toBe(true);
    expect(isConfidence(1)).toBe(true);
  });

  it('rejects -0.1, 1.1, and NaN', () => {
    expect(isConfidence(-0.1)).toBe(false);
    expect(isConfidence(1.1)).toBe(false);
    expect(isConfidence(Number.NaN)).toBe(false);
  });

  it('assertConfidence throws on out-of-range values', () => {
    expect(() => assertConfidence(1.1)).toThrow();
    expect(() => assertConfidence(-0.1)).toThrow();
    expect(() => assertConfidence(Number.NaN)).toThrow();
  });

  it('assertConfidence returns the value for valid confidence', () => {
    expect(assertConfidence(0.42)).toBe(0.42);
  });
});

describe('FAILURE_MODES', () => {
  it('includes engine-absent as a defined failure mode', () => {
    expect(FAILURE_MODES).toContain('engine-absent');
  });
});
