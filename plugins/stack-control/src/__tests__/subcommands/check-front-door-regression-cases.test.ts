// 028 US4 T108/T109 — the three FR-033 regression cases, each proven to go RED through
// check-front-door end-to-end against a FIXTURE surface (contract C3; SC-006):
//   1. a deleted skill           → C2a gap naming the missing skill
//   2. a broken --help           → C2b gap naming the verb
//   3. an unfronted mutating verb → C2c (+ C2d) gap naming the unfronted verb
//
// Fixture-injection: a hand-built registry + deps simulate the injected defect, so the
// regression is reproducible without mutating the real surface on disk.

import { describe, expect, it } from 'vitest';
import { checkFrontDoor, type CheckFrontDoorDeps, type CheckRegistry } from '../../subcommands/check-front-door.js';

/** A conformant baseline: one read-only op + one mutating op, both fronted + documented. */
function conformantRegistry(): CheckRegistry {
  return {
    id: 'fixture',
    operations: [
      {
        operationId: 'demo/list',
        requiredSkill: 'demo',
        mediationClass: 'read-only',
        hasHelp: true,
        source: 'command-tree',
      },
      {
        operationId: 'demo/write',
        requiredSkill: 'demo',
        mediationClass: 'mutating',
        hasHelp: true,
        source: 'command-tree',
      },
    ],
  };
}

const ALL_OPS = new Set(['demo/list', 'demo/write']);

/** All four assertion seams pass — the conformant baseline. */
function passingDeps(registry: CheckRegistry): CheckFrontDoorDeps {
  return {
    registry,
    skillExists: () => true,
    helpProbe: () => true,
    mediationRegistered: () => true,
    verbsDocumentedBySkills: () => new Set(ALL_OPS),
    liveVerbSubActions: () => new Set(ALL_OPS),
  };
}

describe('check-front-door — the three FR-033 regression cases (028 T108/T109; C3/SC-006)', () => {
  it('baseline conformant fixture exits OK (so each case isolates ONE defect)', () => {
    expect(checkFrontDoor(passingDeps(conformantRegistry())).ok).toBe(true);
  });

  it('CASE 1 — deleted skill: C2a gap naming the missing skill, exit non-zero', () => {
    const deps: CheckFrontDoorDeps = {
      ...passingDeps(conformantRegistry()),
      skillExists: (name) => name !== 'demo', // skills/demo/SKILL.md deleted
    };
    const result = checkFrontDoor(deps);
    expect(result.ok).toBe(false);
    const c2a = result.gaps.filter((g) => g.startsWith('C2a'));
    expect(c2a.length).toBeGreaterThan(0);
    expect(c2a.join('\n')).toMatch(/demo/);
  });

  it('CASE 2 — broken --help: C2b gap naming the verb, exit non-zero', () => {
    const deps: CheckFrontDoorDeps = {
      ...passingDeps(conformantRegistry()),
      helpProbe: (op) => op.operationId !== 'demo/write', // demo/write --help broken
    };
    const result = checkFrontDoor(deps);
    expect(result.ok).toBe(false);
    const c2b = result.gaps.filter((g) => g.startsWith('C2b'));
    expect(c2b.length).toBeGreaterThan(0);
    expect(c2b.join('\n')).toMatch(/demo\/write/);
  });

  it('CASE 3 — unfronted mutating verb: C2c + C2d gaps naming the verb, exit non-zero', () => {
    // Add a NEW mutating op `demo/danger` that has NO mediation registration AND is
    // documented by no skill (the unfronted-verb shape).
    const registry: CheckRegistry = {
      id: 'fixture',
      operations: [
        ...conformantRegistry().operations,
        {
          operationId: 'demo/danger',
          requiredSkill: 'demo',
          mediationClass: 'mutating',
          hasHelp: true,
          source: 'command-tree',
        },
      ],
    };
    const live = new Set(['demo/list', 'demo/write', 'demo/danger']);
    const deps: CheckFrontDoorDeps = {
      registry,
      skillExists: () => true,
      helpProbe: () => true,
      // demo/danger is NOT mediation-registered.
      mediationRegistered: (op) => op.operationId !== 'demo/danger',
      // demo/danger is documented by no skill.
      verbsDocumentedBySkills: () => new Set(['demo/list', 'demo/write']),
      liveVerbSubActions: () => live,
    };
    const result = checkFrontDoor(deps);
    expect(result.ok).toBe(false);
    const c2c = result.gaps.filter((g) => g.startsWith('C2c'));
    const c2d = result.gaps.filter((g) => g.startsWith('C2d'));
    expect(c2c.join('\n'), 'C2c names the unfronted mutating verb').toMatch(/demo\/danger/);
    expect(c2d.join('\n'), 'C2d names the undocumented verb').toMatch(/demo\/danger/);
  });
});
