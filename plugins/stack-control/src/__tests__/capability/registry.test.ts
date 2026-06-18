// 026 T003 — RED tests for the capability registry invariants (the single
// declarative source, mirroring house-rules). Asserts: id uniqueness; no backend
// identity in two capabilities (per surface); non-empty interface + identity
// union; single-source non-drift (the decision consumer resolves exactly the set
// the discovery consumer lists); and the v1 contract contents (registry-schema.md).

import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_REGISTRY,
  findCapabilityByIdentity,
  listCapabilities,
  redirectFor,
  validateRegistry,
  type Capability,
  type CapabilityRegistry,
} from '../../capability/registry.js';

describe('capability registry — v1 invariants (026 T003)', () => {
  it('the v1 registry is internally consistent (no invariant violations)', () => {
    expect(validateRegistry(CAPABILITY_REGISTRY)).toEqual([]);
  });

  it('capability ids are unique', () => {
    const ids = CAPABILITY_REGISTRY.capabilities.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no skill identity appears in two capabilities', () => {
    const owner = new Map<string, string>();
    for (const cap of CAPABILITY_REGISTRY.capabilities) {
      for (const skill of cap.backendIdentities.skills) {
        expect(owner.has(skill), `skill '${skill}' shared with ${owner.get(skill)}`).toBe(false);
        owner.set(skill, cap.id);
      }
    }
  });

  it('no cli argv0 identity appears in two capabilities', () => {
    const owner = new Map<string, string>();
    for (const cap of CAPABILITY_REGISTRY.capabilities) {
      for (const argv0 of cap.backendIdentities.cliArgv0) {
        expect(owner.has(argv0), `argv0 '${argv0}' shared with ${owner.get(argv0)}`).toBe(false);
        owner.set(argv0, cap.id);
      }
    }
  });

  it('every capability has a non-empty interface and a non-empty identity union', () => {
    for (const cap of CAPABILITY_REGISTRY.capabilities) {
      expect(cap.interface.length, `${cap.id} interface`).toBeGreaterThan(0);
      const union = cap.backendIdentities.skills.length + cap.backendIdentities.cliArgv0.length;
      expect(union, `${cap.id} identity union`).toBeGreaterThan(0);
    }
  });

  it('validateRegistry flags a duplicate capability id', () => {
    const dup: CapabilityRegistry = {
      id: 'x',
      capabilities: [
        { id: 'a', interface: ['i'], backendIdentities: { skills: ['s1'], cliArgv0: [] }, policies: [] },
        { id: 'a', interface: ['i'], backendIdentities: { skills: ['s2'], cliArgv0: [] }, policies: [] },
      ],
    };
    expect(validateRegistry(dup)).not.toEqual([]);
  });

  it('validateRegistry flags a SKILL identity shared across capabilities', () => {
    const shared: CapabilityRegistry = {
      id: 'x',
      capabilities: [
        { id: 'a', interface: ['i'], backendIdentities: { skills: ['dup'], cliArgv0: [] }, policies: [] },
        { id: 'b', interface: ['i'], backendIdentities: { skills: ['dup'], cliArgv0: [] }, policies: [] },
      ],
    };
    expect(validateRegistry(shared)).not.toEqual([]);
  });

  // AUDIT-BARRAGE-claude-03 (LOW): the symmetric cli-identity collision branch needs
  // its own failing fixture (the two branches are copy-paste siblings).
  it('validateRegistry flags a CLI argv0 identity shared across capabilities', () => {
    const shared: CapabilityRegistry = {
      id: 'x',
      capabilities: [
        { id: 'a', interface: ['i'], backendIdentities: { skills: [], cliArgv0: ['dup'] }, policies: [] },
        { id: 'b', interface: ['i'], backendIdentities: { skills: [], cliArgv0: ['dup'] }, policies: [] },
      ],
    };
    const violations = validateRegistry(shared);
    expect(violations).not.toEqual([]);
    expect(violations.some((v) => v.includes('cli identity') && v.includes('dup'))).toBe(true);
  });

  it('validateRegistry flags an empty interface and an empty identity union', () => {
    const empty: CapabilityRegistry = {
      id: 'x',
      capabilities: [
        { id: 'a', interface: [], backendIdentities: { skills: [], cliArgv0: [] }, policies: [] },
      ],
    };
    expect(validateRegistry(empty).length).toBeGreaterThanOrEqual(1);
  });

  it('single-source non-drift: the decision consumer resolves exactly the set discovery lists', () => {
    // Discovery consumer (T020): enumerate every listed capability's identities.
    const listed = new Set<string>();
    for (const cap of listCapabilities(CAPABILITY_REGISTRY)) {
      for (const s of cap.backendIdentities.skills) listed.add(`skill:${s}`);
      for (const a of cap.backendIdentities.cliArgv0) listed.add(`bash:${a}`);
    }
    expect(listed.size).toBeGreaterThan(0);

    // Decision consumer (T010): every listed identity resolves to a capability...
    for (const qualified of listed) {
      const idx = qualified.indexOf(':');
      const surface = qualified.slice(0, idx) as 'bash' | 'skill';
      const identity = qualified.slice(idx + 1);
      expect(findCapabilityByIdentity(CAPABILITY_REGISTRY, surface, identity)).not.toBeNull();
    }
    // ...and resolves NOTHING outside the listed set (no drift the other way).
    expect(findCapabilityByIdentity(CAPABILITY_REGISTRY, 'bash', 'not-a-backend')).toBeNull();
    expect(findCapabilityByIdentity(CAPABILITY_REGISTRY, 'skill', 'not-a-backend')).toBeNull();
    // A skill identity must not resolve on the bash surface, and vice-versa.
    expect(findCapabilityByIdentity(CAPABILITY_REGISTRY, 'bash', 'speckit-implement')).toBeNull();
    expect(findCapabilityByIdentity(CAPABILITY_REGISTRY, 'skill', 'backlog')).toBeNull();
  });

  it('v1 registry contains exactly backlog, spec-definition, spec-execution', () => {
    expect(CAPABILITY_REGISTRY.capabilities.map((c) => c.id).sort()).toEqual([
      'backlog',
      'spec-definition',
      'spec-execution',
    ]);
  });

  it('v1 backend identities match registry-schema.md', () => {
    const byId = new Map(CAPABILITY_REGISTRY.capabilities.map((c) => [c.id, c]));
    expect(byId.get('backlog')?.backendIdentities.cliArgv0).toContain('backlog');
    expect(byId.get('spec-execution')?.backendIdentities.skills).toContain('speckit-implement');
    expect(byId.get('spec-definition')?.backendIdentities.skills).toEqual(
      expect.arrayContaining([
        'speckit-specify',
        'speckit-clarify',
        'speckit-plan',
        'speckit-checklist',
        'speckit-tasks',
        'speckit-analyze',
      ]),
    );
  });

  it('the front-door interfaces match the contract', () => {
    const byId = new Map(CAPABILITY_REGISTRY.capabilities.map((c) => [c.id, c]));
    expect(byId.get('backlog')?.interface).toContain('stack-control:backlog');
    expect(byId.get('spec-execution')?.interface).toContain('stack-control:execute');
    expect(byId.get('spec-definition')?.interface).toEqual(
      expect.arrayContaining(['stack-control:define', 'stack-control:extend']),
    );
  });
});

// AUDIT-BARRAGE-claude-06 (LOW): redirectFor is the operator/agent-facing refusal
// message (the actual UX of mediation) — cover the derived form, multi-interface
// joining, and the explicit-override branch.
describe('redirectFor — the refusal message (026 P2 audit LOW)', () => {
  it('derives a message naming each front door with a leading slash', () => {
    const cap = CAPABILITY_REGISTRY.capabilities.find((c) => c.id === 'spec-execution')!;
    const msg = redirectFor(cap);
    expect(msg).toContain('/stack-control:execute');
  });

  it('joins multiple interfaces with " or "', () => {
    const cap = CAPABILITY_REGISTRY.capabilities.find((c) => c.id === 'spec-definition')!;
    const msg = redirectFor(cap);
    expect(msg).toContain('/stack-control:define or /stack-control:extend');
  });

  it('returns an explicit redirect verbatim when present', () => {
    const cap: Capability = {
      id: 'x',
      interface: ['stack-control:x'],
      backendIdentities: { skills: ['sx'], cliArgv0: [] },
      policies: [],
      redirect: 'CUSTOM MESSAGE — use the x interface.',
    };
    expect(redirectFor(cap)).toBe('CUSTOM MESSAGE — use the x interface.');
  });

  // AUDIT-BARRAGE-claude-02 (LOW): fail loud on a malformed (empty-interface) capability
  // rather than emitting a dangling "Use  instead" message.
  it('throws on an empty interface (fail-loud)', () => {
    const bad: Capability = {
      id: 'x',
      interface: [],
      backendIdentities: { skills: ['sx'], cliArgv0: [] },
      policies: [],
    };
    expect(() => redirectFor(bad)).toThrow();
  });
});

// AUDIT-BARRAGE-claude-02 (LOW): front doors are 1:1 with capabilities — two
// capabilities must not share an interface (would yield an ambiguous redirect).
describe('validateRegistry — interface uniqueness (026 P2 audit LOW)', () => {
  it('flags two capabilities sharing a front-door interface', () => {
    const dup: CapabilityRegistry = {
      id: 'x',
      capabilities: [
        { id: 'a', interface: ['stack-control:same'], backendIdentities: { skills: ['s1'], cliArgv0: [] }, policies: [] },
        { id: 'b', interface: ['stack-control:same'], backendIdentities: { skills: ['s2'], cliArgv0: [] }, policies: [] },
      ],
    };
    const violations = validateRegistry(dup);
    expect(violations.some((v) => v.includes('interface') && v.includes('stack-control:same'))).toBe(true);
  });
});
