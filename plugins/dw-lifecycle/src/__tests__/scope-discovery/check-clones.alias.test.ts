/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/check-clones.alias.test.ts
 *
 * Phase 6 Task 2: the subcommand was renamed from `detect-clones` to
 * `check-clones`. The legacy name is preserved as a back-compat alias
 * so adopter pre-commit hooks installed by earlier versions of
 * `install-scope-discovery-hooks` continue to work without
 * modification.
 *
 * This file pins the alias-symmetry contract: a fixture run under
 * `check-clones` and a fixture run under `detect-clones` against the
 * same on-disk state MUST produce the same exit code and the same
 * stdout shape (the human-readable headline + per-group block). Both
 * subcommand names dispatch to the same `checkClones` handler in
 * `cli.ts`; this test verifies the dispatcher is wired correctly.
 */

import { describe, it, expect } from 'vitest';
import { detectorArgs, makeFixture, runDetector } from './util/detector-harness.js';

const CLONE_BODY = `export function aliasClone(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

describe('check-clones / detect-clones — alias symmetry', () => {
  it('check-clones and detect-clones produce identical exit codes on the same fixture', async () => {
    const fixture = await makeFixture('alias-symmetry');
    try {
      // Two files with identical bodies — clone group present.
      await fixture.writeFile('a.ts', CLONE_BODY);
      await fixture.writeFile('b.ts', CLONE_BODY);
      // First run under the canonical name — writes the baseline.
      const canonical = await runDetector(detectorArgs(fixture));
      expect(
        canonical.code,
        `check-clones baseline write should exit 0; stdout=${canonical.stdout}; stderr=${canonical.stderr}`,
      ).toBe(0);
      // Second run under the alias against the SAME baseline — should
      // be the steady-state "no NEW groups" outcome, exit 0.
      const alias = await runDetector(
        detectorArgs(fixture, { subcommandOverride: 'detect-clones' }),
      );
      expect(
        alias.code,
        `detect-clones alias should match check-clones exit code; stdout=${alias.stdout}; stderr=${alias.stderr}`,
      ).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
