// 028 US4 T103 — check-front-door C2a: every registered op has its required skill
// present (FR-031; contract C2a; SC-006). A deleted skills/<name>/SKILL.md that a
// registered op requires → gap naming the missing skill.

import { describe, expect, it } from 'vitest';
import { checkFrontDoor, type CheckFrontDoorDeps } from '../../subcommands/check-front-door.js';
import { buildFrontedOperationsRegistry } from '../../capability/fronted-operations.js';

/** A registry with a single op whose required skill we control via skillExists. */
function regWith(requiredSkill: string): CheckFrontDoorDeps['registry'] {
  return {
    id: 'test',
    operations: [
      {
        operationId: 'roadmap/next',
        requiredSkill,
        mediationClass: 'read-only',
        hasHelp: true,
        source: 'command-tree',
        isFrontedBackend: false,
      },
    ],
  };
}

const ALL_PASS: Pick<CheckFrontDoorDeps, 'helpProbe' | 'mediationRegistered' | 'verbsDocumentedBySkills' | 'liveVerbSubActions'> = {
  helpProbe: () => true,
  mediationRegistered: () => true,
  verbsDocumentedBySkills: () => new Set(['roadmap/next']),
  liveVerbSubActions: () => new Set(['roadmap/next']),
};

describe('check-front-door C2a — skill exists (028 T103)', () => {
  it('passes when every registered op\'s skill is present', () => {
    const result = checkFrontDoor({
      registry: regWith('roadmap'),
      skillExists: (name) => name === 'roadmap',
      ...ALL_PASS,
    });
    expect(result.gaps).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reports a gap NAMING the missing skill when a required skill is deleted', () => {
    const result = checkFrontDoor({
      registry: regWith('roadmap'),
      skillExists: () => false, // skills/roadmap/SKILL.md deleted
      ...ALL_PASS,
    });
    expect(result.ok).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
    const joined = result.gaps.join('\n');
    expect(joined).toMatch(/roadmap/);
    expect(joined.toLowerCase()).toMatch(/skill/);
  });

  it('the live registry passes C2a (every fronted op\'s skill exists on disk)', () => {
    const result = checkFrontDoor({
      registry: buildFrontedOperationsRegistry(),
      ...ALL_PASS,
      // use the real on-disk skill check
    });
    const c2aGaps = result.gaps.filter((g) => g.startsWith('C2a'));
    expect(c2aGaps, c2aGaps.join('\n')).toEqual([]);
  });
});
