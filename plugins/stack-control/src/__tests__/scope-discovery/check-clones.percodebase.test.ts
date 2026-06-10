// T014 RED — per-codebase clone detection (US1 founding boundary proof). Pins
// FR-005/006/008 + SC-001: a default run scopes to the enclosing installation,
// reports intra-codebase duplication, and reports ZERO cross-codebase matches.
// `--root` (explicitRoot) is honored.

import { describe, it, expect, afterEach } from 'vitest';
import { resolve as resolvePath } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { detectCodebaseClones } from '../../scope-discovery/clone-detector.js';

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

describe('detectCodebaseClones (per-codebase scoping)', () => {
  it('reports an intra-codebase clone and ZERO cross-codebase matches by default', async () => {
    fx = makeFixture();
    const a = fx.install('a');
    fx.install('b');
    // Intra-A duplicate (should be reported).
    fx.plantClone('a/src/one.ts', 'a/src/two.ts');
    // Cross-codebase A<->B duplicate (must NOT be reported when scanning A).
    fx.plantClone('a/src/shared.ts', 'b/src/shared.ts', 25);

    const result = await detectCodebaseClones({ startDir: a });

    expect(result.boundary.installationRoot).toBe(resolvePath(a));
    const memberPaths = result.groups.flatMap((g) => g.members.map((m) => m.split(':')[0]));
    // No member resolves into codebase B.
    expect(memberPaths.some((p) => p.includes(`${resolvePath(fx!.root)}/b/`))).toBe(false);
    // The intra-A duplicate IS reported.
    expect(memberPaths.some((p) => p.endsWith('a/src/one.ts'))).toBe(true);
    expect(memberPaths.some((p) => p.endsWith('a/src/two.ts'))).toBe(true);
  }, 60_000);

  it('honors an explicit --root override', async () => {
    fx = makeFixture();
    fx.install('a');
    const b = fx.install('b');
    fx.plantClone('b/src/x.ts', 'b/src/y.ts');

    const result = await detectCodebaseClones({ startDir: fx.root, explicitRoot: b });

    expect(result.boundary.installationRoot).toBe(resolvePath(b));
    expect(result.boundary.explicitOverride).toBe(resolvePath(b));
    expect(result.groups.length).toBe(1);
  }, 60_000);
});
