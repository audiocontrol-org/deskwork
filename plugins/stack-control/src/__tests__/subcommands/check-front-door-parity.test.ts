// 028 US4 T106 — check-front-door C2d: skill↔verb parity, BOTH directions (FR-031;
// contract C2d). A skill documenting a verb the tree lacks (skill → verb), OR a verb
// no skill documents (verb → skill) → gap naming the gap. A deprecated alias is not
// a gap.

import { describe, expect, it } from 'vitest';
import { checkFrontDoor, type CheckFrontDoorDeps, type CheckRegistry } from '../../subcommands/check-front-door.js';

const REG: CheckRegistry = {
  id: 'test',
  operations: [
    {
      operationId: 'roadmap/next',
      requiredSkill: 'roadmap',
      mediationClass: 'read-only',
      hasHelp: true,
      source: 'command-tree',
      isFrontedBackend: false,
    },
  ],
};

const BASE: Pick<CheckFrontDoorDeps, 'skillExists' | 'helpProbe' | 'mediationRegistered'> = {
  skillExists: () => true,
  helpProbe: () => true,
  mediationRegistered: () => true,
};

describe('check-front-door C2d — skill↔verb parity both directions (028 T106)', () => {
  it('passes when each registered verb is documented and each documented verb exists', () => {
    const result = checkFrontDoor({
      registry: REG,
      verbsDocumentedBySkills: () => new Set(['roadmap/next']),
      liveVerbSubActions: () => new Set(['roadmap/next']),
      ...BASE,
    });
    const parityGaps = result.gaps.filter((g) => g.startsWith('C2d'));
    expect(parityGaps).toEqual([]);
  });

  it('verb → skill: a registered verb no skill documents → gap', () => {
    const result = checkFrontDoor({
      registry: REG,
      verbsDocumentedBySkills: () => new Set<string>(), // roadmap/next documented by nobody
      liveVerbSubActions: () => new Set(['roadmap/next']),
      ...BASE,
    });
    expect(result.ok).toBe(false);
    expect(result.gaps.join('\n')).toMatch(/roadmap\/next/);
  });

  it('skill → verb: a skill documenting a verb the tree lacks → gap naming the phantom verb', () => {
    const result = checkFrontDoor({
      registry: REG,
      // a skill documents `roadmap/phantom` which is not in the live tree.
      verbsDocumentedBySkills: () => new Set(['roadmap/next', 'roadmap/phantom']),
      liveVerbSubActions: () => new Set(['roadmap/next']),
      ...BASE,
    });
    expect(result.ok).toBe(false);
    expect(result.gaps.join('\n')).toMatch(/roadmap\/phantom/);
  });
});
