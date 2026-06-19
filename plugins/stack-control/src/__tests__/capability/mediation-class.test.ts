// 028 US3 (AUDIT-BARRAGE-codex-01 / claude-01) — RED: the live mediation-class
// derivation that wires FR-050's read-only exemption into the production callers.
//
// `decideMediation` accepts a `mediationClass`, but neither live caller (mediate-check,
// intercept) derived it — so a read-only fronted op (`backlog list`) was refused like a
// mutating one. `mediationClassForIdentity` derives the class from the command surface so
// both callers, and these tests, share one tested source. The contract:
//   * bash identity whose fronted backend's sub-action is declared read-only → 'read-only'
//   * bash identity whose sub-action is declared mutating → 'mutating'
//   * skill identity → 'mutating' (a write path must never silently inherit read-only)
//   * unresolved sub-action (unknown / missing) → 'mutating' (fail safe)

import { describe, expect, it } from 'vitest';
import { mediationClassForIdentity } from '../../capability/mediation-class.js';

describe('mediationClassForIdentity (028 US3 — live FR-050 wiring)', () => {
  it('derives read-only for a read-only sub-action (`backlog list`)', () => {
    expect(mediationClassForIdentity('bash', 'backlog list')).toBe('read-only');
  });

  it('derives mutating for a mutating sub-action (`backlog done TASK-1 --reason x`)', () => {
    expect(mediationClassForIdentity('bash', 'backlog done TASK-1 --reason x')).toBe('mutating');
  });

  it('derives mutating for `backlog capture --type bug`', () => {
    expect(mediationClassForIdentity('bash', 'backlog capture --type bug')).toBe('mutating');
  });

  it('defaults to mutating for a skill backend (speckit-implement)', () => {
    expect(mediationClassForIdentity('skill', 'speckit-implement')).toBe('mutating');
  });

  it('defaults to mutating when the sub-action token is missing (`backlog` alone)', () => {
    expect(mediationClassForIdentity('bash', 'backlog')).toBe('mutating');
  });

  it('defaults to mutating for an unknown sub-action (`backlog frobnicate`)', () => {
    expect(mediationClassForIdentity('bash', 'backlog frobnicate')).toBe('mutating');
  });

  it('defaults to mutating for a non-backend identity (the class is moot but must be safe)', () => {
    expect(mediationClassForIdentity('bash', 'ls -la')).toBe('mutating');
  });

  it('resolves the sub-action even when the backend is not the first simple command', () => {
    // argv-of-every-command parsing: `cd /x && backlog list` still surfaces `backlog list`.
    expect(mediationClassForIdentity('bash', 'cd /x && backlog list')).toBe('read-only');
  });
});
