// 026 T019 — RED tests for `capability list` (contracts/cli-verbs.md, US2). Discovery
// surfaces all 3 v1 capabilities with interface / mediated identities / policies, the
// `--json` shape, and is read from the SINGLE registry (FR-012 — discovery == API spec).

import { describe, expect, it } from 'vitest';
import { capability } from '../../subcommands/capability.js';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';

describe('capability list (026 T019)', () => {
  it('lists the 3 v1 capabilities with their interfaces (exit 0)', () => {
    const r = capability(['list']);
    expect(r.code).toBe(0);
    for (const id of ['backlog', 'spec-definition', 'spec-execution']) expect(r.stdout).toContain(id);
    expect(r.stdout).toContain('/stack-control:execute');
    expect(r.stdout).toContain('/stack-control:backlog');
  });

  it('surfaces mediated identities and policies', () => {
    const r = capability(['list']);
    expect(r.stdout).toContain('skill:speckit-implement');
    expect(r.stdout).toContain('cli:backlog');
    expect(r.stdout).toContain('per-phase governance');
  });

  it('--json emits the registry shape with all 3 capabilities', () => {
    const r = capability(['list', '--json']);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.id).toBe('stack-control-capabilities-v1');
    expect(parsed.capabilities.map((c: { id: string }) => c.id).sort()).toEqual([
      'backlog',
      'spec-definition',
      'spec-execution',
    ]);
    for (const cap of parsed.capabilities) {
      expect(cap.interface.length).toBeGreaterThan(0);
      expect(Array.isArray(cap.policies)).toBe(true);
      expect(cap.backendIdentities).toBeDefined();
    }
  });

  it('reads the SINGLE registry: --json equals CAPABILITY_REGISTRY verbatim (FR-012)', () => {
    expect(JSON.parse(capability(['list', '--json']).stdout)).toEqual(CAPABILITY_REGISTRY);
  });

  it('rejects an unknown subaction or flag (exit 2)', () => {
    expect(capability(['bogus']).code).toBe(2);
    expect(capability(['list', '--nope']).code).toBe(2);
    expect(capability([]).code).toBe(2);
  });

  // H6 — TASK-167/172: the verb's own usage surface must advertise BOTH subactions
  // (`list` AND the US3 `reconcile` backstop), so an agent doing unattended discovery
  // via the error output never concludes `list` is the only subaction.
  it('surfaces both subactions (list AND reconcile) on a bare or unknown invocation', () => {
    for (const args of [[], ['bogus']]) {
      const r = capability(args);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('list');
      expect(r.stderr).toContain('reconcile');
    }
  });

  // H6 — TASK-167: the literal subaction keyword must not be rendered as a single
  // angle-bracket placeholder (`<list>`), which reads as "supply a value here".
  it('does not render the literal `list` subaction as a placeholder', () => {
    expect(capability([]).stderr).not.toContain('<list>');
  });
});
