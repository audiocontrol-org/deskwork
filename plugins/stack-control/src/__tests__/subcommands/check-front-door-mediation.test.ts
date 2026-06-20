// 028 US4 T105 — check-front-door C2c: every MUTATING op is mediation-registered
// (FR-031/050; contract C2c). A read-only op is conformant WITHOUT a registration;
// a mutating op with no registration → gap.

import { describe, expect, it } from 'vitest';
import {
  checkFrontDoor,
  mediationRegisteredAgainst,
  type CheckFrontDoorDeps,
  type CheckRegistry,
} from '../../subcommands/check-front-door.js';
import { buildFrontedOperationsRegistry } from '../../capability/fronted-operations.js';
import { CAPABILITY_REGISTRY, type CapabilityRegistry } from '../../capability/registry.js';
import type { FrontedOperation } from '../../capability/fronted-operations.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// 028 US4 (codex-02 / claude-01 HIGH) — the LIVE C2c predicate is non-vacuous.
//
// The prior `liveMediationRegistered` returned `op.requiredSkill.length > 0` for every
// command-tree op — tautologically true (a command-tree entry ALWAYS has a non-empty
// requiredSkill by registry construction), so C2c could never flag a mutating verb. The
// fix makes C2c read a REAL signal: `isFrontedBackend` (derived from CAPABILITY_REGISTRY
// backend identities) + a registry lookup. These tests pin that the predicate now
// genuinely DISCRIMINATES — it must FAIL for a named-but-unregistered backend and PASS
// for a first-class non-backend verb (mediation N/A).

/** A capability registry that NAMES a `backlog` backend identity (so a `backlog/*`
 *  op is a fronted backend) but with a DIFFERENT cliArgv0 spelling — modelling a verb
 *  that is declared a backend but is NOT actually covered/registered under its own name. */
function registryNamingButNotCovering(): CapabilityRegistry {
  return {
    id: 'fixture-uncovered',
    capabilities: [
      {
        id: 'demo-backend',
        interface: ['stack-control:demo'],
        // claims a DIFFERENT argv0 than the op's verb — so the op's own verb is NOT
        // findable as a covered backend identity.
        backendIdentities: { skills: [], cliArgv0: ['some-other-binary'] },
        policies: [],
      },
    ],
  };
}

function ctOp(overrides: Partial<FrontedOperation>): FrontedOperation {
  return {
    operationId: 'backlog/capture',
    requiredSkill: 'backlog',
    mediationClass: 'mutating',
    hasHelp: true,
    source: 'command-tree',
    isFrontedBackend: false,
    ...overrides,
  };
}

describe('check-front-door C2c — liveMediationRegistered is NON-VACUOUS (028 codex-02/claude-01)', () => {
  it('FAILS for a mutating op that IS a named backend identity but is NOT covered/registered', () => {
    // The op declares itself a fronted backend (isFrontedBackend true) — its verb is
    // `backlog`, but the fixture registry only covers `some-other-binary`, so the
    // verb is NOT findable. C2c MUST flag it (no longer tautologically true).
    const predicate = mediationRegisteredAgainst(registryNamingButNotCovering());
    const op = ctOp({ operationId: 'backlog/capture', isFrontedBackend: true });
    expect(predicate(op)).toBe(false);

    // …and end-to-end through checkFrontDoor it produces a C2c gap naming the op.
    const result = checkFrontDoor({
      registry: { id: 'test', operations: [op] },
      mediationRegistered: predicate,
      ...BASE,
    });
    const c2c = result.gaps.filter((g) => g.startsWith('C2c'));
    expect(c2c.join('\n')).toMatch(/backlog\/capture/);
  });

  it('PASSES for a first-class NON-backend mutating verb (roadmap-style) — mediation N/A', () => {
    // A roadmap-style mutating op: no capability claims its verb as a backend identity,
    // so isFrontedBackend is false → it is a first-class stackctl verb, mediation N/A.
    const predicate = mediationRegisteredAgainst(CAPABILITY_REGISTRY);
    const op = ctOp({ operationId: 'roadmap/add', requiredSkill: 'roadmap', isFrontedBackend: false });
    expect(predicate(op)).toBe(true);
  });

  it('PASSES for a mutating op that IS a covered fronted backend (backlog/capture)', () => {
    // backlog IS in CAPABILITY_REGISTRY cliArgv0 backend identities → genuinely covered.
    const predicate = mediationRegisteredAgainst(CAPABILITY_REGISTRY);
    const op = ctOp({ operationId: 'backlog/capture', isFrontedBackend: true });
    expect(predicate(op)).toBe(true);
  });

  it('predicate DISCRIMINATES on the LIVE registry — at least one false and one true case exist', () => {
    // Proof of non-vacuity against the real built registry: among mutating command-tree
    // ops there is BOTH a fronted-backend class (backlog) AND a first-class class
    // (roadmap/inbox), and the live predicate would FLAG a hypothetical named-but-
    // uncovered backend. If every op were trivially true the check would be vacuous.
    const reg = buildFrontedOperationsRegistry();
    const mutating = reg.operations.filter(
      (o) => o.mediationClass === 'mutating' && o.source === 'command-tree',
    );
    const backends = mutating.filter((o) => o.isFrontedBackend);
    const firstClass = mutating.filter((o) => !o.isFrontedBackend);
    expect(backends.length, 'at least one fronted-backend mutating op').toBeGreaterThan(0);
    expect(firstClass.length, 'at least one first-class non-backend mutating op').toBeGreaterThan(0);

    // The discriminating proof: a named backend with NO covering registry entry FAILS.
    const predicate = mediationRegisteredAgainst({ id: 'empty', capabilities: [] });
    const someBackend = backends[0];
    expect(someBackend).toBeDefined();
    if (someBackend !== undefined) expect(predicate(someBackend)).toBe(false);
  });
});
