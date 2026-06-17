// 025 US2 (T012) — the execute per-phase govern cadence (govern half). RED first.
//
// contracts/execute-cadence.md: at each tasks.md phase boundary `execute` runs
// govern --phase <id> as a non-discretionary post-condition; it REFUSES to start
// phase N+1 until phase N has a current checkpoint (FR-007); and a single phase whose
// payload exceeds the fleet envelope FAILS LOUD with boundary-too-large pointing at
// right-sizing (TASK-75) — never auto-split (FR-008/SC-006). The govern subprocess is
// injected so the cadence logic is exercised hermetically (no real barrage).

import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPriorPhasesGoverned,
  assertPhaseFitsFleet,
  governPhaseBoundary,
  type PhaseBoundaryContext,
} from '../../subcommands/execute-check.js';
import {
  makeUnskippableFixture,
  type UnskippableFixture,
} from '../fixtures/workflow/unskippable-fixtures.js';

let fixtures: UnskippableFixture[] = [];
function threePhase(): UnskippableFixture {
  const f = makeUnskippableFixture({
    slug: '025-cadence',
    phases: [
      { id: '1', files: [{ path: 'src/c/a.ts', content: 'export const a = 1;\n' }] },
      { id: '2', files: [{ path: 'src/c/b.ts', content: 'export const b = 2;\n' }] },
      { id: '3', files: [{ path: 'src/c/d.ts', content: 'export const d = 3;\n' }] },
    ],
  });
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function ctxFor(f: UnskippableFixture, envelopeBytes = 1_000_000): PhaseBoundaryContext {
  return {
    installationRoot: f.root,
    slug: f.slug,
    tasksPath: f.tasksPath,
    fleetEnvelopeBytes: envelopeBytes,
    averageBytesPerPath: 100,
  };
}

describe('execute per-phase govern cadence (contracts/execute-cadence.md)', () => {
  it('governs each phase in order; a current checkpoint exists after each before the next (SC-003)', () => {
    const f = threePhase();
    const ctx = ctxFor(f);
    // The injected govern runner stands in for `govern --phase <id>` writing the checkpoint.
    const runGovern = (phaseId: string): void => {
      f.checkpointPhase(phaseId);
    };
    for (const phaseId of ['1', '2', '3']) {
      governPhaseBoundary(ctx, phaseId, runGovern); // asserts prior current, fits, govern, verifies current
    }
    // After the cadence, all three checkpoints are current → the US1 gate would be met.
    expect(() => assertPriorPhasesGoverned(ctx, '3')).not.toThrow();
  });

  it('refuses to start phase 2 while phase 1 has no current checkpoint (FR-007)', () => {
    const f = threePhase();
    const ctx = ctxFor(f);
    expect(() => assertPriorPhasesGoverned(ctx, '2')).toThrow(/phase '1'/);
    // governing phase 2 directly (skipping 1) is refused before any govern fires.
    let governFired = false;
    expect(() =>
      governPhaseBoundary(ctx, '2', () => {
        governFired = true;
      }),
    ).toThrow(/phase '1'/);
    expect(governFired).toBe(false);
  });

  it('a single oversized phase FAILS LOUD with boundary-too-large pointing at TASK-75, no auto-split (FR-008/SC-006)', () => {
    const f = threePhase();
    // Force oversize: a tiny fleet envelope so even one path overflows.
    const ctx = ctxFor(f, 1);
    expect(() => assertPhaseFitsFleet(ctx, '1')).toThrow(/boundary-too-large/);
    expect(() => assertPhaseFitsFleet(ctx, '1')).toThrow(/TASK-75/);
    // and it must not silently scope down / auto-split: govern never fires.
    let governFired = false;
    expect(() =>
      governPhaseBoundary(ctx, '1', () => {
        governFired = true;
      }),
    ).toThrow(/boundary-too-large/);
    expect(governFired).toBe(false);
  });
});
