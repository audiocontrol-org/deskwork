// 033 T005 — the accepted-model-set capability constant (research D4).
//
// RED-first: the set is the SINGLE source of the host's subagent model vocabulary
// (capability, not vendor — Principle III). It must contain exactly the Claude Code
// subagent models, and the tier-map validator must consult it (proven indirectly via
// the config-loader rejecting an out-of-range value in tier-map.test.ts).

import { describe, it, expect } from 'vitest';
import { ACCEPTED_MODELS, isAcceptedModel, ACCEPTED_MODELS_LABEL } from '../../execute/accepted-models.js';

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
