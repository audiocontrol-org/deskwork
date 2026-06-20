// 028 US3 (AUDIT-BARRAGE-codex-01 / claude-01) — RED: FR-050 read-only exemption holds on
// the LIVE production decision paths, not just in the pure-helper unit test.
//
// The read-only exemption was dead code until `mediate-check` and `intercept` DERIVED the
// op's mediation class (via `mediationClassForIdentity`) and passed it to `decideMediation`.
// These tests drive the two live decision surfaces with an installation present and NO
// marker — exactly the case the prior coverage gap missed:
//   * `backlog list`  (read-only sub-action) → PERMIT  (exit 0 / verdict permit)
//   * `backlog done …` / `backlog capture …` (mutating) → REFUSE (exit 1 / verdict refuse)

import { describe, expect, it } from 'vitest';
import { interceptDecision } from '../../capability/intercept.js';
import { mediateCheck, type MediateCheckDeps } from '../../subcommands/mediate-check.js';

const installedNoMarker: MediateCheckDeps = {
  resolveInstalled: () => true,
  resolveActive: () => new Set<string>(),
};

describe('FR-050 read-only exemption — mediate-check live path (028 US3)', () => {
  it('PERMITS `backlog list` inside an installation with NO marker (exit 0, no refusal)', () => {
    const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], installedNoMarker);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('--json: `backlog list` no-marker permit emits a permit verdict', () => {
    const r = mediateCheck(
      ['--surface', 'bash', '--identity', 'backlog list', '--session', 's', '--json'],
      installedNoMarker,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).verdict).toBe('permit');
  });

  it('STILL REFUSES `backlog done TASK-1 --reason x` (mutating) with NO marker (exit 1)', () => {
    const r = mediateCheck(
      ['--surface', 'bash', '--identity', 'backlog done TASK-1 --reason x', '--session', 's'],
      installedNoMarker,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('/stack-control:backlog');
  });

  it('STILL REFUSES `backlog capture --type bug` (mutating) with NO marker (exit 1)', () => {
    const r = mediateCheck(
      ['--surface', 'bash', '--identity', 'backlog capture --type bug', '--session', 's'],
      installedNoMarker,
    );
    expect(r.code).toBe(1);
  });

  it('a skill backend (speckit-implement) is NOT read-only-exempt → refuses with NO marker', () => {
    const r = mediateCheck(['--surface', 'skill', '--identity', 'speckit-implement', '--session', 's'], installedNoMarker);
    expect(r.code).toBe(1);
  });

  it('PERMITS `backlog list` even when the marker read would THROW (corrupt marker; codex-01 r3)', () => {
    // A read-only op must NOT read the marker at all — a corrupt marker can't fail-close a
    // read-only inspection command. resolveActive throwing proves it is never called.
    const corruptMarker: MediateCheckDeps = {
      resolveInstalled: () => true,
      resolveActive: () => {
        throw new Error('corrupt marker');
      },
    };
    const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], corruptMarker);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });
});

describe('FR-050 read-only exemption — interceptDecision live path (028 US3)', () => {
  const installed = { resolveActive: () => new Set<string>(), resolveInstalled: () => true };

  it('PERMITS a read-only `backlog list` Bash call with NO marker (verdict permit)', () => {
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog list' }, session_id: 's', cwd: '/x' },
      installed,
    );
    expect(d.verdict).toBe('permit');
  });

  it('STILL REFUSES a mutating `backlog done …` Bash call with NO marker (verdict refuse)', () => {
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog done TASK-1 --reason x' }, session_id: 's', cwd: '/x' },
      installed,
    );
    expect(d.verdict).toBe('refuse');
    expect(d.capability).toBe('backlog');
  });

  it('STILL REFUSES a mutating `backlog capture …` Bash call with NO marker', () => {
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog capture --type bug' }, session_id: 's', cwd: '/x' },
      installed,
    );
    expect(d.verdict).toBe('refuse');
  });

  it('STILL REFUSES a raw speckit-implement Skill call (skill backends are not read-only)', () => {
    const d = interceptDecision(
      { tool_name: 'Skill', tool_input: { skill: 'speckit-implement' }, session_id: 's', cwd: '/x' },
      installed,
    );
    expect(d.verdict).toBe('refuse');
  });
});
