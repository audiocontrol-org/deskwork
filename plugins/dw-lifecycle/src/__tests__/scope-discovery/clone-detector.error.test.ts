/**
 * Adversarial scenario: gutted-logic self-check.
 *
 * Ported from the audiocontrol pilot's `clone-detector.validate.ts`
 * (scenarioGuttedLogicSelfCheck). This is the critical Phase 1
 * acceptance signal — the test that proves the harness HAS TEETH.
 * Without it, scenarios 1-3 prove nothing because a detector that
 * always returns "0 NEW" would also pass them.
 *
 * Two complementary assertions:
 *
 *   (a) clone-free floor — fixtures large enough that jscpd produces
 *       a JSON report, but with no fragments duplicated across files,
 *       must yield 0 groups. (We can't use a truly-empty directory
 *       because jscpd refuses to write a report when given no input
 *       files — that surfaces as detector exit 2, a different error
 *       class than "hallucinated clones".)
 *
 *   (b) stub-against-the-harness — run the NEW-detection scenario's
 *       core assertion against a stubbed detector that always returns
 *       "0 NEW", and require that the assertion FAILS. If the
 *       assertion passes against the stub, the harness can't tell a
 *       real detector from a no-op.
 *
 * Verifying this test actually catches a gutted implementation:
 *   1. Temporarily replace checkClones in clone-detector.ts with
 *      `process.stdout.write('0 groups; 0 NEW; 0 DROPPED\\n'); process.exit(0);`
 *   2. Re-run this test file alone.
 *   3. The test MUST fail.
 *   4. Restore the original checkClones; the test passes again.
 */

import { describe, it, expect } from 'vitest';
import type { ScannerRun } from './util/run-scanner.js';
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

const NONCLONE_BODY = `type Greeter = { name: string };
export function fixtureGreet(g: Greeter): string {
  const stamp = new Date().toISOString();
  const headline = \`hello, \${g.name}!\`;
  const trailer = headline.toUpperCase();
  return \`[\${stamp}] \${trailer}\`;
}
`;

type RunDetectorFn = (args: readonly string[]) => Promise<ScannerRun>;

/**
 * Stub detector that simulates a gutted implementation: regardless
 * of input, returns the "0 groups; 0 NEW; 0 DROPPED" summary at exit
 * 0 — the failure mode where the detection logic has been commented
 * out and the gate silently green-lights every commit.
 */
function stubGuttedDetector(): RunDetectorFn {
  return async () => ({
    code: 0,
    stdout: '0 groups; 0 NEW; 0 DROPPED\n',
    stderr: '',
  });
}

/**
 * Reusable NEW-detection probe — mirrors the scenario in
 * `clone-detector.baseline.test.ts` but as a pass/fail predicate so
 * we can run it against both the real detector AND the gutted stub.
 * Returns true iff the probe successfully detected a NEW clone (the
 * real-detector contract); false iff the probe's expectations were
 * NOT met (which is what we WANT when running against the stub).
 */
async function probeNewDetection(
  label: string,
  detector: RunDetectorFn,
): Promise<boolean> {
  const fixture = await makeFixture(label);
  try {
    await fixture.writeFile('a.ts', CLONE_BODY_A);
    await fixture.writeFile('b.ts', CLONE_BODY_A);
    // Baseline capture always uses the real detector — the gut applies
    // to the compare-mode step below, which is the gate's decision.
    const first = await runDetector(detectorArgs(fixture));
    if (first.code !== 0) return false;

    await fixture.writeFile('c.ts', CLONE_BODY_B);
    await fixture.writeFile('d.ts', CLONE_BODY_B);
    const second = await detector(detectorArgs(fixture, { quiet: false }));
    if (second.code !== 1) return false;
    if (!second.stdout.includes('c.ts')) return false;
    if (!second.stdout.includes('d.ts')) return false;
    return true;
  } finally {
    await fixture.cleanup();
  }
}

describe('clone-detector — gutted-logic self-check', () => {
  it(
    'gutted-stub self-check rejects logic-free implementation (harness has teeth)',
    async () => {
      // (a) clone-free floor — non-duplicated source must yield 0 groups.
      const fixture = await makeFixture('gutted-floor');
      try {
        await fixture.writeFile('lonely-a.ts', CLONE_BODY_A);
        await fixture.writeFile('lonely-b.ts', NONCLONE_BODY);
        const cleanRun = await runDetector(detectorArgs(fixture));
        expect(
          cleanRun.code,
          `clone-free run should exit 0; stdout:\n${cleanRun.stdout}\nstderr:\n${cleanRun.stderr}`,
        ).toBe(0);
        expect(cleanRun.stdout).toMatch(/0 groups; 0 NEW; 0 DROPPED/);
      } finally {
        await fixture.cleanup();
      }

      // (b) The NEW-detection probe must REJECT a gutted stub. If it
      //     would accept the stub, the harness has no teeth.
      const stubAccepted = await probeNewDetection(
        'gutted-stub',
        stubGuttedDetector(),
      );
      expect(
        stubAccepted,
        'NEW-detection probe accepted a stub that always returns "0 NEW" — harness has no teeth',
      ).toBe(false);
    },
  );
});
