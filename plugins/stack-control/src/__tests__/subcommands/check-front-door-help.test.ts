// 028 US4 T104 — check-front-door C2b: every verb/sub-action emits working --help
// (exit 0 with usage), derived from the command tree (FR-031; contract C2b). A
// broken/missing --help → gap naming the verb.

import { describe, expect, it } from 'vitest';
import { checkFrontDoor, type CheckFrontDoorDeps } from '../../subcommands/check-front-door.js';

function regWith(operationId: string): CheckFrontDoorDeps['registry'] {
  return {
    id: 'test',
    operations: [
      {
        operationId,
        requiredSkill: 'roadmap',
        mediationClass: 'read-only',
        hasHelp: true,
        source: 'command-tree',
      },
    ],
  };
}

const BASE: Pick<CheckFrontDoorDeps, 'skillExists' | 'mediationRegistered' | 'verbsDocumentedBySkills' | 'liveVerbSubActions'> = {
  skillExists: () => true,
  mediationRegistered: () => true,
  verbsDocumentedBySkills: () => new Set(['roadmap/next']),
  liveVerbSubActions: () => new Set(['roadmap/next']),
};

describe('check-front-door C2b — working --help (028 T104)', () => {
  it('passes when --help is conformant for the op', () => {
    const result = checkFrontDoor({
      registry: regWith('roadmap/next'),
      helpProbe: () => true,
      ...BASE,
    });
    const helpGaps = result.gaps.filter((g) => g.startsWith('C2b'));
    expect(helpGaps).toEqual([]);
  });

  it('reports a gap NAMING the verb when --help is broken (exit non-zero / no usage)', () => {
    const result = checkFrontDoor({
      registry: regWith('roadmap/next'),
      helpProbe: () => false, // broken --help
      ...BASE,
    });
    expect(result.ok).toBe(false);
    const joined = result.gaps.join('\n');
    expect(joined).toMatch(/roadmap\/next/);
    expect(joined.toLowerCase()).toMatch(/help/);
  });
});
