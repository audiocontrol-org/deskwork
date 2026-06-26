// 028 US4 T099 — buildFrontedOperationsRegistry derivation (FR-030/051; contract R1/R2).
//
// The fronted-operations registry is the derived ground truth check-front-door
// quantifies over. It composes TWO existing sources:
//   1. the command surface (command-tree entries — one per fronted verb/sub-action)
//   2. CAPABILITY_REGISTRY (skill-declaration entries — one per capability interface
//      that fronts in-session /speckit-* ops, e.g. spec-definition / spec-execution).
//
// The load-bearing invariant (FR-030): the registry is BUILT on every call from
// these sources, never stored. Mutating the command tree (adding a verb that has a
// matching skill) changes the built registry with NO manifest edit.

import { describe, expect, it } from 'vitest';
import { buildCommandSurface, type CommandDescriptor, type MountedVerb } from '../../cli-help/command-surface.js';
import { buildFrontedOperationsRegistry } from '../../capability/fronted-operations.js';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';

describe('buildFrontedOperationsRegistry — derivation (028 T099; R1/R2)', () => {
  it('returns a registry with a stable id and a non-empty operations list', () => {
    const reg = buildFrontedOperationsRegistry();
    expect(reg.id.length).toBeGreaterThan(0);
    expect(reg.operations.length).toBeGreaterThan(0);
  });

  it('derives one command-tree entry per fronted verb/sub-action (operationId = verb or verb/sub)', () => {
    const reg = buildFrontedOperationsRegistry();
    const commandTree = reg.operations.filter((o) => o.source === 'command-tree');
    // Every command-tree entry's operationId is either a bare verb or a verb/sub.
    for (const op of commandTree) {
      expect(op.operationId.length).toBeGreaterThan(0);
      expect(op.requiredSkill.length, `${op.operationId} has empty requiredSkill`).toBeGreaterThan(0);
      expect(op.source).toBe('command-tree');
    }
    // `roadmap` (a fronted verb whose skill exists) contributes its sub-actions.
    const roadmapNext = commandTree.find((o) => o.operationId === 'roadmap/next');
    expect(roadmapNext, 'roadmap/next command-tree entry').toBeDefined();
    expect(roadmapNext?.requiredSkill).toBe('roadmap');
  });

  it('command-tree mediationClass is COPIED from the descriptor (not re-derived)', () => {
    const reg = buildFrontedOperationsRegistry();
    const roadmapAdd = reg.operations.find((o) => o.operationId === 'roadmap/add');
    const roadmapNext = reg.operations.find((o) => o.operationId === 'roadmap/next');
    expect(roadmapAdd?.mediationClass).toBe('mutating');
    expect(roadmapNext?.mediationClass).toBe('read-only');
  });

  it('derives one skill-declaration entry per CAPABILITY_REGISTRY capability (operationId = capability id, mutating)', () => {
    const reg = buildFrontedOperationsRegistry();
    const declared = reg.operations.filter((o) => o.source === 'skill-declaration');
    const declaredIds = new Set(declared.map((o) => o.operationId));
    for (const cap of CAPABILITY_REGISTRY.capabilities) {
      expect(declaredIds.has(cap.id), `capability '${cap.id}' has no skill-declaration entry`).toBe(true);
    }
    // spec-execution fronts in-session /speckit-implement via /stack-control:execute.
    const specExec = declared.find((o) => o.operationId === 'spec-execution');
    expect(specExec).toBeDefined();
    expect(specExec?.mediationClass).toBe('mutating');
    expect(specExec?.requiredSkill).toBe('execute');
  });

  it('every entry has a hasHelp boolean', () => {
    const reg = buildFrontedOperationsRegistry();
    for (const op of reg.operations) {
      expect(typeof op.hasHelp).toBe('boolean');
    }
  });

  it('isFrontedBackend is derived from CAPABILITY_REGISTRY backend identities, not requiredSkill (028 codex-02/claude-01)', () => {
    const reg = buildFrontedOperationsRegistry();
    // backlog IS a cliArgv0 backend identity → its mutating ops are fronted backends.
    const backlogCapture = reg.operations.find((o) => o.operationId === 'backlog/capture');
    expect(backlogCapture?.isFrontedBackend, 'backlog is a registered backend').toBe(true);
    // roadmap / inbox are first-class verbs (no capability claims them as backends) →
    // NOT fronted backends, so C2c mediation is N/A for them.
    const roadmapAdd = reg.operations.find((o) => o.operationId === 'roadmap/add');
    expect(roadmapAdd?.isFrontedBackend, 'roadmap/add is a first-class non-backend verb').toBe(false);
    const inboxCapture = reg.operations.find((o) => o.operationId === 'inbox/capture');
    expect(inboxCapture?.isFrontedBackend, 'inbox/capture is a first-class non-backend verb').toBe(false);
    // skill-declaration capability entries are fronted backends.
    const specExec = reg.operations.find((o) => o.operationId === 'spec-execution');
    expect(specExec?.isFrontedBackend, 'capability entries are fronted backends').toBe(true);
  });

  it('is BUILT not stored — mutating the command tree changes the built registry with no manifest edit (FR-030)', () => {
    // Inject a fixture verb that has a matching skill (`roadmap` reused as the
    // skill name) so the resolver finds a requiredSkill; the new verb must appear
    // in the rebuilt registry WITHOUT any manifest/file edit.
    const liveSurface = buildCommandSurface();
    const fixtureVerb: CommandDescriptor = {
      verb: 'roadmap-fixture-xyz',
      description: 'a synthetic fixture verb',
      subActions: [],
      flags: [],
      mediationClass: 'read-only',
      deprecatedAliasOf: null,
      selfHandlesHelp: false,
    };
    const before = buildFrontedOperationsRegistry({ surface: liveSurface });
    const after = buildFrontedOperationsRegistry({
      surface: [...liveSurface, fixtureVerb],
      // resolve the fixture verb's required skill to an existing skill name.
      requiredSkillFor: (verb: string): string | null => (verb === 'roadmap-fixture-xyz' ? 'roadmap' : null),
    });
    const beforeIds = new Set(before.operations.map((o) => o.operationId));
    const afterIds = new Set(after.operations.map((o) => o.operationId));
    expect(beforeIds.has('roadmap-fixture-xyz')).toBe(false);
    expect(afterIds.has('roadmap-fixture-xyz')).toBe(true);
  });

  it('RETAINS a fronted verb\'s ops (with its convention requiredSkill) even when the skill file is ABSENT — so C2a can report the deleted skill (028 codex-01)', () => {
    // The fronted, skill-requiring op set must be STABLE: independent of whether the
    // skill file currently exists. Simulate `skills/roadmap/SKILL.md` deleted by a
    // resolver that finds NO skill on disk for any verb — the registry must STILL
    // include roadmap's ops bound to their convention requiredSkill ('roadmap'), so
    // C2a sees an op to check and reports the absence (rather than silently shrinking).
    const reg = buildFrontedOperationsRegistry({
      // Default-convention resolver but pretend NOTHING is on disk: a fronted verb
      // still resolves to its convention skill name; only declared-internal verbs are null.
      requiredSkillFor: (verb: string): string | null =>
        verb === 'version' || verb === 'govern' || verb === 'mediate-check' || verb === 'intercept'
          ? null
          : verb,
    });
    const roadmapOps = reg.operations.filter((o) => o.operationId.startsWith('roadmap/'));
    expect(roadmapOps.length, 'roadmap ops retained even with skill file absent').toBeGreaterThan(0);
    for (const op of roadmapOps) expect(op.requiredSkill).toBe('roadmap');
  });

  it('does NOT include a declared-internal/no-skill verb as a fronted op (version/govern/mediate-check must not become C2a gaps) (028 codex-01)', () => {
    // The LIVE registry: internal operator/CLI verbs (no front-door skill by design)
    // must be EXCLUDED — they must never surface as a missing-skill C2a gap.
    const reg = buildFrontedOperationsRegistry();
    const ids = new Set(reg.operations.map((o) => o.operationId.split('/')[0]));
    for (const internal of ['version', 'govern', 'mediate-check', 'intercept', 'audit-barrage']) {
      expect(ids.has(internal), `internal verb '${internal}' must NOT be a fronted op`).toBe(false);
    }
  });

  it('the live MountedVerb shape is importable (type-only smoke)', () => {
    // Compile-time guard that the registry depends on the same MountedVerb contract.
    const noop = (m: readonly MountedVerb[]): number => m.length;
    expect(typeof noop).toBe('function');
  });
});
