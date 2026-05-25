/**
 * Cross-cutting validator coordinator for the adopter-manifests
 * adversarial harness (Phase 2 Family C). Ported from the audiocontrol
 * pilot's `adopter-manifests.validate.ts` and reduced to the gutted-
 * stub self-check that the pilot's harness used as its teeth.
 *
 * The per-bucket scenario suites (core / tracked-holdouts / from-list /
 * summary-ordering) live in sibling vitest files and each runs as part
 * of the normal `npm test`. This file documents the single cross-
 * cutting probe the pilot's `validate.ts` added on top of the suite
 * union: plant a stub that always exits 0, run the same holdout-
 * detected probe the core scenarios use against the stub, and assert
 * the stub is REJECTED (exit code != 1). If the probe ever accepts the
 * stub, the entire suite has no teeth — every "passes" in the other
 * three test files would be the same shape against a no-op scanner.
 *
 * The gutted-stub pattern mirrors the Phase 2 Task 1 anti-patterns
 * core test's `stubGuttedScanner()` design: the stub is an actual file
 * on disk that the harness's `runScanner(argv, entry)` invokes with
 * `entry` overridden to the stub path. No `check-adopters` argv prefix
 * is injected for stub invocations (per the fixtures contract).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SOURCE_PAYLOADS,
  args,
  cleanup,
  makeFixture,
  runScanner,
  writeRegistry,
  writeSource,
} from './adopter-manifests.fixtures.js';

const HOLDOUT_DETECT_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/{roland-sxx0,akai-s3k}-editor/src/**/*Editor*.tsx'
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer.
`;

/**
 * Reusable holdout-detected probe — mirrors the core scenarios'
 * `holdout-detected-exits-one` assertion. Returns true iff the probe
 * asserts the real scanner's contract (exit 1, stdout names the
 * manifest id + canonical from + flagged file). Returns false iff any
 * assertion failed — which is what we WANT against a gutted stub.
 */
async function probeHoldoutDetected(
  label: string,
  scannerEntry: string | undefined,
): Promise<boolean> {
  const fixture = await makeFixture(label);
  try {
    await writeRegistry(fixture, HOLDOUT_DETECT_REGISTRY);
    await writeSource(
      fixture,
      'modules/roland-sxx0-editor/src/PatchEditor.tsx',
      SOURCE_PAYLOADS.HOLDOUT,
    );
    const run = await runScanner(args(fixture), scannerEntry);
    if (run.code !== 1) return false;
    if (!run.stdout.includes('PatchEditor.tsx')) return false;
    if (!run.stdout.includes('@/components/SlideDrawer')) return false;
    if (!run.stdout.includes('slide-drawer-promotion')) return false;
    return true;
  } finally {
    await cleanup(fixture);
  }
}

describe('adopter-manifests — gutted-stub self-check', () => {
  let stubDir = '';
  let stubPath = '';

  beforeAll(async () => {
    stubDir = await mkdtemp(join(tmpdir(), 'dw-adopter-manifests-stub-'));
    stubPath = join(stubDir, 'stub.ts');
    // The stub mimics the pilot's gutted scanner: regardless of input,
    // exit 0 with no output. A no-op scanner that "passes" everything.
    await writeFile(stubPath, 'process.exit(0);\n', 'utf8');
  });

  afterAll(async () => {
    if (stubDir.length > 0) {
      await rm(stubDir, { recursive: true, force: true });
    }
  });

  it('gutted-stub self-check rejects no-op scanner (harness has teeth)', async () => {
    // Sanity: the probe accepts the real scanner (default entry =
    // plugin CLI dispatcher). If this side fails, the probe is broken
    // independently of the stub's behavior.
    const realAccepted = await probeHoldoutDetected('real', undefined);
    expect(
      realAccepted,
      'holdout-detected probe should accept the real scanner; if false, probe is broken',
    ).toBe(true);

    // Teeth: the probe MUST reject the gutted stub. If it would accept
    // the stub (which always returns exit 0 with empty stdout), the
    // entire Family C harness can't distinguish a real scanner from a
    // no-op.
    const stubAccepted = await probeHoldoutDetected('stub', stubPath);
    expect(
      stubAccepted,
      'holdout-detected probe accepted a stub that exits 0 with empty stdout — harness has no teeth',
    ).toBe(false);
  });
});
