// 033 T005 — the accepted-model-set capability constant (research D4).
//
// RED-first: the set is the SINGLE source of the host's subagent model vocabulary
// (capability, not vendor — Principle III). It must contain exactly the Claude Code
// subagent models, and the tier-map validator must consult it (proven indirectly via
// the config-loader rejecting an out-of-range value in tier-map.test.ts).

import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_MODELS,
  isAcceptedModel,
  ACCEPTED_MODELS_LABEL,
  MODEL_CAPABILITY_RANK,
  rankOf,
} from '../../execute/accepted-models.js';

describe('accepted-model set (033 T005)', () => {
  it('contains exactly the Claude Code subagent models', () => {
    expect([...ACCEPTED_MODELS].sort()).toEqual(['fable', 'haiku', 'opus', 'sonnet']);
  });

  it('isAcceptedModel accepts a member and rejects a non-member', () => {
    expect(isAcceptedModel('haiku')).toBe(true);
    expect(isAcceptedModel('opus')).toBe(true);
    expect(isAcceptedModel('gpt-9000')).toBe(false);
    expect(isAcceptedModel('')).toBe(false);
  });

  it('exposes a pipe-joined label for error messages', () => {
    expect(ACCEPTED_MODELS_LABEL).toBe('haiku|sonnet|opus|fable');
  });
});

describe('MODEL_CAPABILITY_RANK / rankOf (035 T002/T006, data-model.md D3)', () => {
  it('is a declared, capability-ascending ordering: haiku < sonnet < opus < fable', () => {
    expect(MODEL_CAPABILITY_RANK).toEqual(['haiku', 'sonnet', 'opus', 'fable']);
  });

  it('rankOf returns the 0-based index for each declared model', () => {
    expect(rankOf('haiku')).toBe(0);
    expect(rankOf('sonnet')).toBe(1);
    expect(rankOf('opus')).toBe(2);
    expect(rankOf('fable')).toBe(3);
  });

  it('rankOf is strictly ascending across the declared order', () => {
    expect(rankOf('haiku')).toBeLessThan(rankOf('sonnet'));
    expect(rankOf('sonnet')).toBeLessThan(rankOf('opus'));
    expect(rankOf('opus')).toBeLessThan(rankOf('fable'));
  });

  it('has exactly the same membership as ACCEPTED_MODELS (no drift)', () => {
    expect([...MODEL_CAPABILITY_RANK].sort()).toEqual([...ACCEPTED_MODELS].sort());
  });

  it('every member of ACCEPTED_MODELS has a rank (no gaps)', () => {
    for (const model of ACCEPTED_MODELS) {
      expect(typeof rankOf(model)).toBe('number');
      expect(Number.isInteger(rankOf(model))).toBe(true);
      expect(rankOf(model)).toBeGreaterThanOrEqual(0);
    }
  });

  it('rankOf throws a descriptive error for a non-accepted model (fail loud)', () => {
    expect(() => rankOf('gpt-9000')).toThrow(/gpt-9000/);
    expect(() => rankOf('')).toThrow();
  });
});
