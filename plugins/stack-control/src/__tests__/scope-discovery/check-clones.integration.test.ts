// T019 — quickstart Scenario 1 end-to-end through the `stackctl check-clones`
// verb (plain-shell reachability, SC-009): spawn the CLI with cwd inside
// codebase A and assert the per-codebase contract holds across the process
// boundary (intra-A reported, zero A<->B, first-run writes the baseline).

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { runCli } from '../_run-helpers.js';

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

describe('stackctl check-clones (Scenario 1 end-to-end)', () => {
  it('scopes to codebase A, reports intra-A only, and writes the baseline', () => {
    fx = makeFixture();
    const a = fx.install('a');
    fx.install('b');
    fx.plantClone('a/src/one.ts', 'a/src/two.ts');
    fx.plantClone('a/src/shared.ts', 'b/src/shared.ts', 25);

    const res = runCli(['check-clones', '--json'], { cwd: a });

    // First run writes the baseline and exits 0.
    expect(res.status).toBe(0);
    expect(existsSync(join(a, '.stack-control', 'scope-discovery', 'clones.yaml'))).toBe(true);

    const payload = JSON.parse(res.stdout) as {
      groups: { members: string[] }[];
    };
    const members = payload.groups.flatMap((g) => g.members.map((m) => m.split(':')[0]));
    expect(members.some((p) => p.endsWith('a/src/one.ts'))).toBe(true);
    expect(members.some((p) => p.includes('/b/'))).toBe(false);
  }, 60_000);

  it('rejects an unknown flag with exit 2 (no flag silently ignored)', () => {
    fx = makeFixture();
    const a = fx.install('a');

    const res = runCli(['check-clones', '--bogus'], { cwd: a });
    expect(res.status).toBe(2);
  }, 60_000);
});
