// 028 US4 T103 — check-front-door C2a: every registered op has its required skill
// present (FR-031; contract C2a; SC-006). A deleted skills/<name>/SKILL.md that a
// registered op requires → gap naming the missing skill.

import { describe, expect, it } from 'vitest';
import { checkFrontDoor, type CheckFrontDoorDeps } from '../../subcommands/check-front-door.js';
import {
  buildFrontedOperationsRegistry,
  conventionRequiredSkillFor,
} from '../../capability/fronted-operations.js';

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

  it('the DEFAULT requiredSkill resolver binds by CONVENTION, NOT by file existence (028 codex-01): a fronted verb resolves to its convention skill regardless of disk; only declared-internal verbs are null', () => {
    // The stable fronted set is the load-bearing fix: `conventionRequiredSkillFor`
    // (the production default) does NOT consult the filesystem. A fronted verb always
    // resolves to its convention skill name (verb → skills/<verb>/SKILL.md); only a
    // declared-internal operator/CLI verb is null. This is what keeps a deleted skill's
    // ops in the registry so C2a can report the absence (rather than dropping the verb).
    expect(conventionRequiredSkillFor('roadmap')).toBe('roadmap');
    expect(conventionRequiredSkillFor('backlog')).toBe('backlog');
    // declared-internal verbs (no front-door skill by design) are null → excluded.
    expect(conventionRequiredSkillFor('version')).toBeNull();
    expect(conventionRequiredSkillFor('govern')).toBeNull();
    expect(conventionRequiredSkillFor('mediate-check')).toBeNull();
  });

  it('the LIVE registry catches a deleted skill via C2a (028 codex-01): roadmap\'s ops stay registered (stable set), so denying its skill in skillExists yields a C2a gap', () => {
    // Drive the LIVE command surface + DEFAULT convention resolver (no injection). The
    // registry MUST retain roadmap's ops bound to 'roadmap' independent of the file. We
    // then simulate the deletion at the C2a check seam (skillExists denies 'roadmap') —
    // the deterministic, race-free equivalent of removing the file — and require a gap.
    const registry = buildFrontedOperationsRegistry();
    const roadmapOps = registry.operations.filter((o) => o.requiredSkill === 'roadmap');
    expect(roadmapOps.length, 'live registry retains roadmap ops bound to skill roadmap').toBeGreaterThan(0);

    const result = checkFrontDoor({
      registry,
      skillExists: (name) => name !== 'roadmap', // skills/roadmap/SKILL.md "deleted"
      ...ALL_PASS,
    });
    const c2aGaps = result.gaps.filter((g) => g.startsWith('C2a'));
    expect(result.ok).toBe(false);
    expect(c2aGaps.length, 'a deleted skill must produce a C2a gap, not a shrunk checked count').toBeGreaterThan(0);
    expect(c2aGaps.join('\n')).toMatch(/roadmap/);
  });
});
