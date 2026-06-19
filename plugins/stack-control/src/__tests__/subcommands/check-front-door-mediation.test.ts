// 028 US4 T105 — check-front-door C2c: every MUTATING op is mediation-registered
// (FR-031/050; contract C2c). A read-only op is conformant WITHOUT a registration;
// a mutating op with no registration → gap.

import { describe, expect, it } from 'vitest';
import { checkFrontDoor, type CheckFrontDoorDeps, type CheckRegistry } from '../../subcommands/check-front-door.js';

function regWith(op: CheckRegistry['operations'][number]): CheckRegistry {
  return { id: 'test', operations: [op] };
}

const BASE: Pick<CheckFrontDoorDeps, 'skillExists' | 'helpProbe' | 'verbsDocumentedBySkills' | 'liveVerbSubActions'> = {
  skillExists: () => true,
  helpProbe: () => true,
  verbsDocumentedBySkills: () => new Set(['backlog/capture', 'backlog/list']),
  liveVerbSubActions: () => new Set(['backlog/capture', 'backlog/list']),
};

describe('check-front-door C2c — mutating ops mediation-registered (028 T105)', () => {
  it('a read-only op is conformant WITHOUT a mediation registration', () => {
    const result = checkFrontDoor({
      registry: regWith({
        operationId: 'backlog/list',
        requiredSkill: 'backlog',
        mediationClass: 'read-only',
        hasHelp: true,
        source: 'command-tree',
      }),
      mediationRegistered: () => false, // not registered — but read-only is exempt
      ...BASE,
    });
    const medGaps = result.gaps.filter((g) => g.startsWith('C2c'));
    expect(medGaps).toEqual([]);
  });

  it('a mutating op WITH a registration passes', () => {
    const result = checkFrontDoor({
      registry: regWith({
        operationId: 'backlog/capture',
        requiredSkill: 'backlog',
        mediationClass: 'mutating',
        hasHelp: true,
        source: 'command-tree',
      }),
      mediationRegistered: () => true,
      ...BASE,
    });
    const medGaps = result.gaps.filter((g) => g.startsWith('C2c'));
    expect(medGaps).toEqual([]);
  });

  it('a mutating op WITHOUT a registration → gap naming the op', () => {
    const result = checkFrontDoor({
      registry: regWith({
        operationId: 'backlog/capture',
        requiredSkill: 'backlog',
        mediationClass: 'mutating',
        hasHelp: true,
        source: 'command-tree',
      }),
      mediationRegistered: () => false,
      ...BASE,
    });
    expect(result.ok).toBe(false);
    const joined = result.gaps.join('\n');
    expect(joined).toMatch(/backlog\/capture/);
    expect(joined.toLowerCase()).toMatch(/mediat/);
  });
});
