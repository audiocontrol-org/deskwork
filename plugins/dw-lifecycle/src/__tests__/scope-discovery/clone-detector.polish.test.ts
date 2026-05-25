/**
 * Adversarial scenarios for the `--diff` and `--refresh-baseline`
 * output polish.
 *
 * Ported from the audiocontrol pilot's
 * `clone-detector.polish-scenarios.ts`. Two scenarios:
 *
 *   1. `--diff` flag: prints ONLY NEW + DROPPED groups (subset of the
 *      default output) plus the summary line — must NOT include the
 *      default-mode `Detected N clone group(s)` or `Baseline diff:`
 *      headlines.
 *   2. `--refresh-baseline` always trails with a single-line
 *      `summary: N dropped, M new (net X)` line, including when
 *      nothing has changed (the operator-facing grep handle is
 *      invariant).
 */

import { describe, it, expect } from 'vitest';
import { makeFixture, detectorArgs, runDetector } from './util/detector-harness.js';

const CLONE_BODY_A = `export function polishCalc(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

const CLONE_BODY_B = `export function polishSummarise(a: number, b: number): number {
  const total = a + b;
  const scaled = a * b;
  const delta = a - b;
  const ratio = b === 0 ? 0 : a / b;
  return total + scaled + delta + ratio;
}
`;

describe('clone-detector — --diff output is a strict subset', () => {
  it('prints NEW group members + summary; omits default-mode headlines', async () => {
    const fixture = await makeFixture('polish-diff');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY_A);
      await fixture.writeFile('b.ts', CLONE_BODY_A);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      await fixture.writeFile('c.ts', CLONE_BODY_B);
      await fixture.writeFile('d.ts', CLONE_BODY_B);
      const diffRun = await runDetector(detectorArgs(fixture, {}, ['--diff']));
      expect(
        diffRun.code,
        `expected exit 1 with NEW group; stdout:\n${diffRun.stdout}`,
      ).toBe(1);

      // The NEW section names the planted files...
      expect(diffRun.stdout).toContain('c.ts');
      expect(diffRun.stdout).toContain('d.ts');
      // ...includes the summary line in the expected shape...
      expect(diffRun.stdout).toMatch(/summary: \d+ dropped, \d+ new \(net [+-]?\d+\)/);
      // ...and does NOT include default-mode headline phrases.
      expect(diffRun.stdout).not.toContain('Detected ');
      expect(diffRun.stdout).not.toContain('Baseline diff:');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('clone-detector — --refresh-baseline always emits summary line', () => {
  it('emits "summary: N dropped, M new (net X)" on a clean tree', async () => {
    const fixture = await makeFixture('polish-refresh');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY_A);
      await fixture.writeFile('b.ts', CLONE_BODY_A);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      const refresh = await runDetector(
        detectorArgs(fixture, {}, ['--refresh-baseline']),
      );
      expect(
        refresh.code,
        `expected exit 0; stdout:\n${refresh.stdout}\nstderr:\n${refresh.stderr}`,
      ).toBe(0);
      expect(refresh.stdout).toMatch(/summary: 0 dropped, 0 new \(net \+0\)/);
    } finally {
      await fixture.cleanup();
    }
  });
});
