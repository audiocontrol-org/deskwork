// 025 US4 (T019 + T023) — the speckit wrapper refusal/redirect map + defense-in-depth.
// RED first.
//
// Corrected mechanism (operator decision 2026-06-16): the refusal is a PORTABLE map
// (skill-identity → front door, never vendor identity) exposed via stackctl + the
// cross-vendor command adapters; it does NOT inject into the adopter's Claude-only
// .claude/skills/speckit-*. A direct backend invocation is refused + redirected; a
// front-door-marked invocation is NOT refused (no false positive). The US1 per-phase
// graduate gate is the real teeth: even an evaded raw path cannot graduate (FR-014).

import { afterEach, describe, expect, it } from 'vitest';
import {
  WRAPPED_SKILLS,
  isWrappedSkill,
  frontDoorsFor,
  evaluateRefusal,
} from '../../speckit-wrapper/refusal.js';
import { composeConvergedImpl } from '../../govern/compose-convergence.js';
import {
  makeUnskippableFixture,
  type UnskippableFixture,
} from '../fixtures/workflow/unskippable-fixtures.js';

let fixtures: UnskippableFixture[] = [];
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

describe('speckit wrapper refusal map (contracts/speckit-wrapper.md, FR-012)', () => {
  it('recognizes exactly the four wrapped backend skills (skill identity, not vendor)', () => {
    expect([...WRAPPED_SKILLS]).toEqual([
      'speckit-specify',
      'speckit-plan',
      'speckit-tasks',
      'speckit-implement',
    ]);
    expect(isWrappedSkill('speckit-implement')).toBe(true);
    expect(isWrappedSkill('stack-control:execute')).toBe(false);
    expect(isWrappedSkill('speckit-analyze')).toBe(false); // not wrapped
  });

  it('redirects implement → execute, and specify/plan/tasks → define/extend', () => {
    expect(frontDoorsFor('speckit-implement')).toEqual(['stack-control:execute']);
    for (const authoring of ['speckit-specify', 'speckit-plan', 'speckit-tasks'] as const) {
      expect(frontDoorsFor(authoring)).toEqual(['stack-control:define', 'stack-control:extend']);
    }
  });

  it('a DIRECT invocation is refused and names its front door (FR-012)', () => {
    const v = evaluateRefusal('speckit-implement', false);
    expect(v.refused).toBe(true);
    expect(v.frontDoors).toEqual(['stack-control:execute']);
    expect(v.message).toMatch(/stack-control:execute/);
    expect(v.message).toMatch(/speckit-implement/);
  });

  it('a FRONT-DOOR invocation is NOT refused — no false positive (US4 scenario)', () => {
    for (const skill of WRAPPED_SKILLS) {
      expect(evaluateRefusal(skill, true).refused).toBe(false);
    }
  });
});

describe('US4 defense-in-depth: an evaded raw implement cannot graduate (FR-014, T023)', () => {
  it('a feature implemented raw (no per-phase checkpoints) fails the US1 composed gate', () => {
    const f = makeUnskippableFixture({
      slug: '025-evaded',
      phases: [
        { id: '1', files: [{ path: 'src/e/a.ts', content: 'export const a = 1;\n' }] },
        { id: '2', files: [{ path: 'src/e/b.ts', content: 'export const b = 2;\n' }] },
      ],
    });
    fixtures.push(f);
    // No checkpointPhase() calls — the raw path skipped per-phase govern.
    expect(composeConvergedImpl(f.root, f.slug, f.tasksPath)).toBe(false);
    // Even after the FIRST phase, the second is missing → still cannot graduate.
    f.checkpointPhase('1');
    expect(composeConvergedImpl(f.root, f.slug, f.tasksPath)).toBe(false);
  });
});
