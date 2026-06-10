// T006 RED — the generalized jscpd runner. dw-lifecycle's runner assumed a
// repo-root `.jscpd.json` + `process.cwd()`; the port is parameterized by an
// explicit boundary root + ignore-list (no repo-root assumption), so a
// per-codebase scan never reaches outside its installation. Pins:
//   - runner scopes jscpd to a given root, parses the JSON report → CloneGroup[]
//   - an ignore entry excludes a subtree from the scan
//   - an engine failure surfaces as a thrown error (verb maps to exit 2)

import { describe, it, expect, afterEach } from 'vitest';
import { join, resolve as resolvePath } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { detectClonesViaJscpd } from '../../scope-discovery/jscpd-runner.js';

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

describe('detectClonesViaJscpd', () => {
  it('finds an intra-root clone scoped to the given root', async () => {
    fx = makeFixture();
    const a = fx.install('a');
    fx.plantClone('a/src/one.ts', 'a/src/two.ts');

    const groups = await detectClonesViaJscpd({ root: a, ignore: [] });

    expect(groups.length).toBe(1);
    const members = groups[0].members.map((m) => m.split(':')[0]);
    expect(members.some((p) => p.endsWith('one.ts'))).toBe(true);
    expect(members.some((p) => p.endsWith('two.ts'))).toBe(true);
  }, 60_000);

  it('excludes an ignored subtree from the scan', async () => {
    fx = makeFixture();
    const a = fx.install('a');
    const child = fx.install('a/child');
    // Clone spans the parent and the nested child.
    fx.plantClone('a/src/parent.ts', 'a/child/src/nested.ts');

    const groups = await detectClonesViaJscpd({
      root: a,
      ignore: [resolvePath(child)],
    });

    // With the child excluded, the cross-boundary duplicate is not reported.
    const allMembers = groups.flatMap((g) => g.members.map((m) => m.split(':')[0]));
    expect(allMembers.some((p) => p.includes('/child/'))).toBe(false);
  }, 60_000);

  it('throws when the scan engine cannot produce a report', async () => {
    fx = makeFixture();
    const missing = join(fx.root, 'does-not-exist');

    await expect(detectClonesViaJscpd({ root: missing, ignore: [] })).rejects.toThrow();
  }, 60_000);
});
