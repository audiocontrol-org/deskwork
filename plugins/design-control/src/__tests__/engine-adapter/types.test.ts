import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLAUDE_ADAPTER_ID,
  isConfidence,
  assertConfidence,
  FAILURE_MODES,
  ENGINE_METHODS,
} from '@/engine-adapter';
import { EngineAdapterRequestSchema } from '@/engine-adapter';

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

describe('ENGINE_METHODS — single-sourced method vocabulary', () => {
  it('has exactly the three method members', () => {
    expect([...ENGINE_METHODS]).toEqual([
      'author-wireframe',
      'translate-design-language',
      'referee-screenshot',
    ]);
    expect(ENGINE_METHODS).toHaveLength(3);
  });

  it('the request zod enum accepts each declared method', () => {
    for (const method of ENGINE_METHODS) {
      const parsed = EngineAdapterRequestSchema.safeParse({
        method,
        manifestId: 'm',
        payload: {},
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('the request zod enum rejects a non-member method', () => {
    const parsed = EngineAdapterRequestSchema.safeParse({
      method: 'not-an-engine-method',
      manifestId: 'm',
      payload: {},
    });
    expect(parsed.success).toBe(false);
  });
});
