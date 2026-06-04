/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/module-symmetry.alias.test.ts
 *
 * Phase 25 Task 5: the CLI subcommand was renamed from
 * `check-editor-symmetry` to `check-module-symmetry`. The legacy name
 * is preserved as a deprecated alias for one release cycle so adopter
 * muscle memory / pre-commit hook invocations still work; the alias
 * emits a deprecation warning to stderr pointing at the new name and
 * its removal version.
 *
 * Mirrors the `check-clones.alias.test.ts` symmetry pattern from Phase
 * 6 Task 2 — both subcommand names dispatch to the same scanner; this
 * test pins both halves of the contract:
 *
 *   1. `check-module-symmetry` is wired in the dispatcher and works
 *      end-to-end against a registry-empty fixture (exit 0 +
 *      stdout shape).
 *   2. `check-editor-symmetry` STILL works end-to-end (alias path)
 *      AND emits the deprecation warning to stderr naming the new
 *      verb + a removal-version pointer.
 *
 * The CLI dispatch path uses the same scanner; this file tests the
 * dispatcher wiring + deprecation-warning shim added in Phase 25 Task
 * 5, not the scanner logic itself (covered by editor-symmetry.test.ts
 * which already runs the canonical scanner).
 */

import { describe, it, expect } from 'vitest';
import {
  cleanup,
  makeFixture,
  payloads,
  runScanner,
  scannerArgs,
  writeRegistry,
} from './editor-symmetry.fixtures.js';

const EDITORS_TWO = ['roland-sxx0-editor', 'akai-s3k-editor'];

describe('check-module-symmetry / check-editor-symmetry — alias symmetry', () => {
  it('check-module-symmetry runs end-to-end against an empty registry (exit 0)', async () => {
    const fixture = await makeFixture('canonical-empty', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.EMPTY_REGISTRY_YAML);
      const args = scannerArgs(fixture);
      // Override the subcommand from `check-editor-symmetry` → canonical name.
      args[0] = 'check-module-symmetry';
      const run = await runScanner(args);
      expect(
        run.code,
        `check-module-symmetry should exit 0; stdout=${run.stdout}; stderr=${run.stderr}`,
      ).toBe(0);
      expect(run.stdout).toContain('registry empty');
    } finally {
      await cleanup(fixture);
    }
  });

  it('check-editor-symmetry alias still works AND emits deprecation warning to stderr', async () => {
    const fixture = await makeFixture('alias-empty', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.EMPTY_REGISTRY_YAML);
      const run = await runScanner(scannerArgs(fixture)); // uses 'check-editor-symmetry'
      expect(
        run.code,
        `check-editor-symmetry alias should exit 0; stdout=${run.stdout}; stderr=${run.stderr}`,
      ).toBe(0);
      expect(run.stdout).toContain('registry empty');
      expect(
        run.stderr,
        `alias should emit deprecation warning to stderr; got: ${JSON.stringify(run.stderr)}`,
      ).toMatch(/deprecated/i);
      expect(
        run.stderr,
        `deprecation warning must name the new verb`,
      ).toMatch(/check-module-symmetry/);
      // Removal-version pointer keeps the alias's lifetime auditable.
      expect(
        run.stderr,
        `deprecation warning must cite a removal version`,
      ).toMatch(/v\d+\.\d+\.\d+/);
    } finally {
      await cleanup(fixture);
    }
  });

  it('canonical and alias produce identical exit codes + stdout shape on the same fixture', async () => {
    const fixture = await makeFixture('alias-symmetry-stdout', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.EMPTY_REGISTRY_YAML);
      const aliasRun = await runScanner(scannerArgs(fixture));
      const canonicalArgs = scannerArgs(fixture);
      canonicalArgs[0] = 'check-module-symmetry';
      const canonicalRun = await runScanner(canonicalArgs);
      expect(canonicalRun.code).toBe(aliasRun.code);
      expect(canonicalRun.stdout).toBe(aliasRun.stdout);
      // Canonical does NOT emit the deprecation warning.
      expect(canonicalRun.stderr).not.toMatch(/deprecated/i);
    } finally {
      await cleanup(fixture);
    }
  });
});
