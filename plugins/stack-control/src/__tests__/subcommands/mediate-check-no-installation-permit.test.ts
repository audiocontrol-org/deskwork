// 028 T079 (US3) — RED: no-installation short-circuit-to-permit (FR-020; contract T1; SC-004).
//
// Mediation fires ONLY inside a stack-control installation. With NO enclosing
// installation (`findInstallation` → null), `mediateCheck` must PERMIT (exit 0) an
// adopter's own backend identity — short-circuiting BEFORE `decideMediation` runs.
// This makes the `stackctl setup` redirect always satisfiable (a refusal implies an
// installation exists). A dedicated `resolveInstalled` seam reports whether an
// enclosing installation exists, so the verb distinguishes "no installation" (→ permit)
// from "installation exists, nothing bracketed" (→ refuse).

import { describe, expect, it } from 'vitest';
import { mediateCheck, type MediateCheckDeps } from '../../subcommands/mediate-check.js';

const noInstallation: MediateCheckDeps = {
  resolveInstalled: () => false,
  resolveActive: () => new Set<string>(),
};

const installedNoMarker: MediateCheckDeps = {
  resolveInstalled: () => true,
  resolveActive: () => new Set<string>(),
};

describe('mediate-check no-installation short-circuit (028 T079)', () => {
  it('permits a raw backend (bash) with NO installation → exit 0 (FR-020, SC-004)', () => {
    const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], noInstallation);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe(''); // no refusal line
  });

  it('permits a raw backend (skill) with NO installation → exit 0', () => {
    const r = mediateCheck(['--surface', 'skill', '--identity', 'speckit-implement', '--session', 's'], noInstallation);
    expect(r.code).toBe(0);
  });

  it('STILL refuses the same backend when an installation exists with no marker (no over-permit)', () => {
    const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], installedNoMarker);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('/stack-control:backlog');
  });

  it('does NOT resolve the marker when there is no installation (short-circuit before decideMediation)', () => {
    let resolvedActive = false;
    mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], {
      resolveInstalled: () => false,
      resolveActive: () => {
        resolvedActive = true;
        return new Set<string>();
      },
    });
    expect(resolvedActive).toBe(false);
  });

  it('--json: a no-installation permit emits a permit verdict on stdout', () => {
    const r = mediateCheck(
      ['--surface', 'bash', '--identity', 'backlog list', '--session', 's', '--json'],
      noInstallation,
    );
    expect(r.code).toBe(0);
    const decision = JSON.parse(r.stdout);
    expect(decision.verdict).toBe('permit');
  });
});
