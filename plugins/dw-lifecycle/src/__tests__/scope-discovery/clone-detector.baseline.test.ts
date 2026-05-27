/**
 * Adversarial scenario: NEW-clone detection.
 *
 * Ported from the audiocontrol pilot's `clone-detector.validate.ts`
 * (scenarioNewClone). Plants a NEW clone group beyond a captured
 * baseline and asserts the detector exits 1 and names the planted
 * files in stdout. The membership assertion (c.ts + d.ts) is what
 * gives the harness teeth — a gutted "always 0 NEW" detector would
 * fail it. See `clone-detector.error.test.ts` for the explicit
 * gutted-stub self-check that pairs with this scenario.
 *
 * Subprocess invocation goes through the plugin CLI dispatcher
 * (`cli.ts check-clones ...`) — same path adopters trigger via the
 * `dw-lifecycle check-clones` subcommand (or the legacy `detect-clones`
 * alias). The detector library (clone-detector.ts) is intentionally not
 * a standalone entry point.
 *
 * Each fixture is self-contained: subprocess cwd is set to the
 * fixture directory, a per-fixture `.jscpd.json` is staged there, and
 * the jscpd report lands under `<fixture>/reports/duplication/` so
 * the test files can in principle run in parallel without colliding
 * on the shared report path.
 */

import { describe, it, expect } from 'vitest';
import { makeFixture, detectorArgs, runDetector } from './util/detector-harness.js';

const CLONE_BODY_A = `export function fixtureCalc(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

const CLONE_BODY_B = `export function fixtureSummarise(a: number, b: number): number {
  const total = a + b;
  const scaled = a * b;
  const delta = a - b;
  const ratio = b === 0 ? 0 : a / b;
  return total + scaled + delta + ratio;
}
`;

describe('clone-detector — NEW clone detection', () => {
  it('plants a NEW clone beyond the baseline; detector exits 1 and names the files', async () => {
    const fixture = await makeFixture('new');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY_A);
      await fixture.writeFile('b.ts', CLONE_BODY_A);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      await fixture.writeFile('c.ts', CLONE_BODY_B);
      await fixture.writeFile('d.ts', CLONE_BODY_B);
      const second = await runDetector(detectorArgs(fixture, { quiet: false }));
      expect(
        second.code,
        `expected exit 1; stdout:\n${second.stdout}\nstderr:\n${second.stderr}`,
      ).toBe(1);
      expect(second.stdout).toContain('c.ts');
      expect(second.stdout).toContain('d.ts');
    } finally {
      await fixture.cleanup();
    }
  });
});
