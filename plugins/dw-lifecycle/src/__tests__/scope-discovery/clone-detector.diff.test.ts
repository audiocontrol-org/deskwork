/**
 * Adversarial scenario: DROPPED-clone acceptance.
 *
 * Ported from the audiocontrol pilot's `clone-detector.validate.ts`
 * (scenarioDroppedClone). Captures a baseline with one clone, then
 * refactors away one member, and asserts the detector exits 0 and
 * reports `1 DROPPED` — baseline shrinkage is a feature, not a
 * regression. Companion to the NEW-detection scenario in
 * `clone-detector.baseline.test.ts`; together they pin down the
 * "diff" semantics the gate publishes via the `Baseline diff:` line.
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

describe('clone-detector — DROPPED clone acceptance', () => {
  it('drops one clone member after baseline; detector exits 0 and reports "1 DROPPED"', async () => {
    const fixture = await makeFixture('dropped');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY_A);
      await fixture.writeFile('b.ts', CLONE_BODY_A);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      // Refactor: remove one of the cloned files. The remaining file no
      // longer has a pair — the group becomes DROPPED with 0 NEW.
      await fixture.removeFile('b.ts');
      const second = await runDetector(detectorArgs(fixture));
      expect(
        second.code,
        `expected exit 0; stdout:\n${second.stdout}\nstderr:\n${second.stderr}`,
      ).toBe(0);
      expect(second.stdout).toMatch(/1 DROPPED/);
    } finally {
      await fixture.cleanup();
    }
  });
});
