/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/detect-clones.gate-mode.test.ts
 *
 * Phase 6 acceptance criterion: `--gate-mode` flag on check-* commands
 * exits non-zero on violations.
 *
 * For `detect-clones`, gate-mode behavior is the EXISTING default (the
 * pre-commit-hook contract — exit 1 on NEW groups, 0 otherwise, 2 on
 * I/O). The `--gate-mode` flag is accepted for symmetry with the other
 * check-* subcommands; it is a no-op in effect.
 *
 * This file pins that no-op contract: with the flag and without, the
 * exit code is the same.
 */

import { describe, it, expect } from 'vitest';
import { detectorArgs, makeFixture, runDetector } from './util/detector-harness.js';

const CLONE_BODY = `export function gateModeAlpha(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

const CLONE_BODY_B = `export function gateModeBeta(a: number, b: number): number {
  const total = a + b;
  const scaled = a * b;
  const delta = a - b;
  const ratio = b === 0 ? 0 : a / b;
  return total + scaled + delta + ratio;
}
`;

describe('detect-clones — --gate-mode flag (symmetry no-op)', () => {
  it('NEW group present: exit 1 with --gate-mode (matches existing default)', async () => {
    const fixture = await makeFixture('gate-mode-with-flag');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY);
      await fixture.writeFile('b.ts', CLONE_BODY);
      // Establish baseline.
      const baseline = await runDetector(detectorArgs(fixture));
      expect(baseline.code).toBe(0);
      // Add a NEW group.
      await fixture.writeFile('c.ts', CLONE_BODY_B);
      await fixture.writeFile('d.ts', CLONE_BODY_B);
      const withFlag = await runDetector(detectorArgs(fixture, {}, ['--gate-mode']));
      expect(
        withFlag.code,
        `--gate-mode should exit 1 on NEW groups; stdout=${withFlag.stdout}; stderr=${withFlag.stderr}`,
      ).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it('NEW group present: exit 1 without --gate-mode (existing default)', async () => {
    const fixture = await makeFixture('gate-mode-without-flag');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY);
      await fixture.writeFile('b.ts', CLONE_BODY);
      const baseline = await runDetector(detectorArgs(fixture));
      expect(baseline.code).toBe(0);
      await fixture.writeFile('c.ts', CLONE_BODY_B);
      await fixture.writeFile('d.ts', CLONE_BODY_B);
      const withoutFlag = await runDetector(detectorArgs(fixture));
      expect(
        withoutFlag.code,
        `default behavior should exit 1 on NEW groups; stdout=${withoutFlag.stdout}; stderr=${withoutFlag.stderr}`,
      ).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });
});
