/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/editor-symmetry.tracked-holdouts.test.ts
 *
 * Adversarial vitest scenarios for the AUDIT-06 fix in the editor-
 * symmetry matrix layer. Ported from the audiocontrol pilot's
 * `tools/scope-discovery/editor-symmetry.tracked-holdouts-scenarios.ts`.
 *
 * The matrix used to mask known deferred holdouts — they were either
 * silently subtracted (when listed as `exceptions:`) or surfaced as
 * `⚠`/`✗` blocking cells. AUDIT-06 introduced a third cell state,
 * `tracked`, rendered with the `⏳ A/E (T tracked)` glyph. Cells with
 * only tracked-holdouts pass the gate; cells with real holdouts (plus
 * or minus tracked) still render as `⚠`/`✗`.
 *
 * Lives in a sibling file to `editor-symmetry.test.ts` to keep both
 * files under the 300-500 line cap. Reuses the shared fixture helpers
 * from `editor-symmetry.fixtures.ts`.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import {
  cleanup,
  makeFixture,
  payloads,
  runScanner,
  scannerArgs,
  writeRegistry,
  writeSource,
} from './editor-symmetry.fixtures.js';

const EDITORS_AKAI_ONLY = ['akai-s3k-editor'];

describe('check-editor-symmetry — AUDIT-06 tracked-holdouts', () => {
  it('tracked-holdout-only cell renders as ⏳ 0/1 (1 tracked); gate exits 0', async () => {
    // Manifest entry with one tracked-holdout in `akai-s3k-editor`;
    // no regular holdouts. Matrix MUST render `⏳ 0/1 (1 tracked)`
    // for the akai cell — NOT `✓` (would mask the deferral) and NOT
    // `⚠`/`✗` (those reserve for real holdouts).
    const fixture = await makeFixture('tracked-hourglass', EDITORS_AKAI_ONLY);
    try {
      await writeRegistry(fixture, payloads.TRACKED_HOLDOUT_REGISTRY);
      // DeferredEditor.tsx matches the glob AND is the manifest's
      // tracked-holdout.
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditor.tsx',
        payloads.HOLDOUT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      expect(
        run.stdout.includes('⏳ 0/1 (1 tracked)'),
        `expected '⏳ 0/1 (1 tracked)' cell; got: ${run.stdout}`,
      ).toBe(true);
      // The data row (NOT the legend) must NOT carry a ✓ glyph.
      const dataRow = run.stdout
        .split('\n')
        .find((l) => l.includes('slide-drawer-promotion') && l.startsWith('|'));
      expect(dataRow, `data row not found; stdout=${run.stdout}`).toBeDefined();
      expect(
        dataRow?.includes('✓ 1/1'),
        `tracked-holdout cell must NOT render as ✓ in the data row; got: ${dataRow}`,
      ).toBe(false);
    } finally {
      await cleanup(fixture);
    }
  });

  it('real holdouts dominate tracked-holdouts: cell renders ⚠, not ⏳; exit 1', async () => {
    // Tracked-holdouts + real holdouts in the same cell. Real
    // holdouts dominate: the cell MUST render as `⚠`, not `⏳`. The
    // gate MUST exit 1.
    const fixture = await makeFixture('tracked-vs-real', EDITORS_AKAI_ONLY);
    try {
      await writeRegistry(fixture, payloads.TRACKED_HOLDOUT_MIXED_REGISTRY);
      // Tracked-holdout file (registered in the manifest).
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditor.tsx',
        payloads.HOLDOUT_SOURCE,
      );
      // Real holdout: matches glob, no canonical import, not tracked.
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/RealHoldoutEditor.tsx',
        payloads.HOLDOUT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('⚠ 0/2 (1 holdout)');
      // The legend always documents the ⏳ glyph, so we can't grep
      // stdout wholesale. Instead inspect the matrix's data row only.
      const dataRow = run.stdout
        .split('\n')
        .find((l) => l.includes('slide-drawer-promotion') && l.startsWith('|'));
      expect(dataRow, `data row not found; stdout=${run.stdout}`).toBeDefined();
      expect(
        dataRow?.includes('⏳'),
        `cell must NOT render as ⏳ when a real holdout is present; got data row: ${dataRow}`,
      ).toBe(false);
    } finally {
      await cleanup(fixture);
    }
  });
});

describe('check-editor-symmetry — AUDIT-06 gutted-stub self-check', () => {
  it('gutted stub returns all-✓ matrix; the real assertion (expects ⏳, rejects ✓) would reject it', async () => {
    // Plants a scanner stub that emits an all-✓ matrix even though
    // tracked-holdouts should produce a ⏳ cell. The hourglass
    // assertion above expects exit 0 AND '⏳ 0/1 (1 tracked)' AND
    // absence of '✓ 1/1' in the data row. The stub returns exit 0
    // with '✓ 1/1' — so the assertion's tracked-glyph check fails
    // AND the no-false-✓ check fails. That's the teeth.
    const fixture = await makeFixture('gutted-tracked', EDITORS_AKAI_ONLY);
    const stubDir = await mkdtemp(join(tmpdir(), 'editor-symmetry-tracked-stub-'));
    const stubPath = join(stubDir, 'stub.ts');
    try {
      await writeFile(
        stubPath,
        "process.stdout.write('| Convention | akai-s3k-editor |\\n');\n" +
          "process.stdout.write('| --- | --- |\\n');\n" +
          "process.stdout.write('| slide-drawer-promotion | ✓ 1/1 |\\n');\n" +
          'process.exit(0);\n',
        'utf8',
      );
      await writeRegistry(fixture, payloads.TRACKED_HOLDOUT_REGISTRY);
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditor.tsx',
        payloads.HOLDOUT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture), stubPath);
      // If the stub somehow produced the hourglass cell, the
      // gutted-stub self-check has no signal.
      expect(
        run.stdout.includes('⏳ 0/1 (1 tracked)'),
        'stub somehow produced the hourglass cell; gutted self-check has no signal',
      ).toBe(false);
      // Expected: stub exits 0 with an all-✓ matrix.
      expect(run.code).toBe(0);
      expect(run.stdout).toContain('✓ 1/1');
    } finally {
      await cleanup(fixture);
      await rm(stubDir, { recursive: true, force: true });
    }
  });
});
