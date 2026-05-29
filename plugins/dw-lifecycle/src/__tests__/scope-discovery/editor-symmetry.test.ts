/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/editor-symmetry.test.ts
 *
 * Adversarial vitest suite for the Phase 4 Family B `check-editor-
 * symmetry` CLI. Ported from the audiocontrol pilot's
 * `tools/scope-discovery/editor-symmetry.scenarios.ts` (+ harness in
 * `editor-symmetry.validate.ts`). The 10 core scenarios are consolidated
 * here as `it` blocks under one `describe` block; the gutted-stub
 * self-check is a sibling `describe` so it's clear which test gives the
 * harness teeth.
 *
 * Tracked-holdouts (AUDIT-06) scenarios live in
 * `editor-symmetry.tracked-holdouts.test.ts` — split to keep both files
 * under the 300-500 line cap.
 *
 * Subprocess invocation goes through the dw-lifecycle CLI dispatcher
 * (`cli.ts check-editor-symmetry ...`) — the same path adopters trigger
 * via the `dw-lifecycle check-editor-symmetry` subcommand. The fixture
 * passes `--module-root modules` so the canned source paths
 * `modules/<editor>/src/...` remain valid against the destination's
 * configurable-module-root layout.
 */

import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const EDITORS_TWO = ['roland-sxx0-editor', 'akai-s3k-editor'];
const EDITORS_THREE = ['roland-sxx0-editor', 'akai-s3k-editor', 'jv1080-editor'];

describe('check-editor-symmetry — core scenarios', () => {
  it('empty registry → exit 0; placeholder body emitted; no rows', async () => {
    const fixture = await makeFixture('empty', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.EMPTY_REGISTRY_YAML);
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      const hasPlaceholder =
        run.stdout.includes('matrix is empty') ||
        run.stdout.includes('No adopter-manifest entries');
      expect(
        hasPlaceholder,
        `stdout missing 'no manifests' placeholder; got: ${run.stdout}`,
      ).toBe(true);
      expect(run.stdout).toContain('registry empty');
    } finally {
      await cleanup(fixture);
    }
  });

  it('single-editor entry: roland adopts; akai cell is n/a', async () => {
    const fixture = await makeFixture('single-ok', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        payloads.IMPORTING_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      expect(run.stdout).toContain('✓ 1/1');
      // n/a cell for akai (manifest targets only roland).
      expect(run.stdout).toContain('| —');
    } finally {
      await cleanup(fixture);
    }
  });

  it('single-editor entry, 1 of 2 files adopts → ⚠ cell surfaces; exit 1', async () => {
    const fixture = await makeFixture('single-partial', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/AdoptEditor.tsx',
        payloads.IMPORTING_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/HoldoutEditor.tsx',
        payloads.HOLDOUT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('⚠ 1/2 (1 holdout)');
    } finally {
      await cleanup(fixture);
    }
  });

  it('multi-editor entry, all editors adopt → two ✓ cells; exit 0', async () => {
    const fixture = await makeFixture('multi-ok', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.MULTI_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchesPage.tsx',
        payloads.LIST_BANK_IMPORT_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/ProgramsPage.tsx',
        payloads.LIST_BANK_IMPORT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      const okCells = (run.stdout.match(/✓ 1\/1/g) ?? []).length;
      expect(
        okCells,
        `expected 2 '✓ 1/1' cells (one per editor); got ${okCells} in: ${run.stdout}`,
      ).toBe(2);
    } finally {
      await cleanup(fixture);
    }
  });

  it('multi-editor entry, N-1 adopt → adopting editor ✓; missing editor surfaces as ✗/⚠', async () => {
    const fixture = await makeFixture('multi-partial', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.MULTI_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchesPage.tsx',
        payloads.LIST_BANK_IMPORT_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/ProgramsPage.tsx',
        payloads.HOLDOUT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('✓ 1/1');
      const hasMissingOrPartial =
        run.stdout.includes('✗ 0/1') || run.stdout.includes('⚠');
      expect(
        hasMissingOrPartial,
        `expected ✗ or ⚠ cell for akai; got: ${run.stdout}`,
      ).toBe(true);
    } finally {
      await cleanup(fixture);
    }
  });

  it('targeted editor with zero glob-matched files → ✗ no matching files', async () => {
    const fixture = await makeFixture('multi-missing', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.MULTI_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchesPage.tsx',
        payloads.LIST_BANK_IMPORT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('✓ 1/1');
      expect(run.stdout).toContain('✗ no matching files');
    } finally {
      await cleanup(fixture);
    }
  });

  it('editors not in glob render as — (n/a); not as ✗', async () => {
    const fixture = await makeFixture('na', EDITORS_THREE);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/AnEditor.tsx',
        payloads.IMPORTING_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/jv1080-editor/src/Other.tsx',
        'export const x = 1;\n',
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      const dataRow = run.stdout
        .split('\n')
        .find((l) => l.includes('slide-drawer-promotion') && l.startsWith('|'));
      expect(dataRow, `data row not found in stdout: ${run.stdout}`).toBeDefined();
      const naCount = (dataRow?.match(/\| —/g) ?? []).length;
      expect(
        naCount,
        `expected 2 n/a cells in row; got ${naCount} in '${dataRow}'`,
      ).toBe(2);
    } finally {
      await cleanup(fixture);
    }
  });

  it('exception path counts toward expected; matrix shows ✓ 2/2; exit 0', async () => {
    const fixture = await makeFixture('except', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.WITH_EXCEPTION_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/SpecialEditor.tsx',
        payloads.HOLDOUT_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/CleanEditor.tsx',
        payloads.IMPORTING_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      expect(run.stdout).toContain('✓ 2/2');
    } finally {
      await cleanup(fixture);
    }
  });

  it('matrix renders as a syntactically valid GFM table (header + separator + data)', async () => {
    const fixture = await makeFixture('md', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.MULTI_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchesPage.tsx',
        payloads.LIST_BANK_IMPORT_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/ProgramsPage.tsx',
        payloads.LIST_BANK_IMPORT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      const lines = run.stdout.split('\n');
      const headerIdx = lines.findIndex((l) => l.startsWith('| Convention |'));
      expect(headerIdx, `markdown header row not found; got:\n${run.stdout}`).not.toBe(-1);
      const sepLine = lines[headerIdx + 1];
      expect(sepLine).toBeDefined();
      if (sepLine === undefined) return;
      expect(/^\|(?:\s*---\s*\|)+$/.test(sepLine)).toBe(true);
      const dataLine = lines[headerIdx + 2];
      expect(dataLine).toBeDefined();
      if (dataLine === undefined) return;
      expect(dataLine.startsWith('|')).toBe(true);
      const headerLine = lines[headerIdx];
      expect(headerLine).toBeDefined();
      if (headerLine === undefined) return;
      const headerCells = headerLine.split('|').length;
      const dataCells = dataLine.split('|').length;
      expect(
        headerCells,
        `header has ${headerCells} cells; data has ${dataCells}`,
      ).toBe(dataCells);
    } finally {
      await cleanup(fixture);
    }
  });

  it('--write produces artifact at --artifact path with rendered matrix', async () => {
    const fixture = await makeFixture('write', EDITORS_TWO);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/AnEditor.tsx',
        payloads.IMPORTING_SOURCE,
      );
      const artifactPath = 'editor-symmetry-test.md';
      const run = await runScanner(
        scannerArgs(fixture, ['--write', '--artifact', artifactPath, '--quiet']),
      );
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      const artifactBody = await readFile(join(fixture.scanRoot, artifactPath), 'utf8');
      // The artifact header was renamed from the pilot's "Cross-editor"
      // to the destination's "Cross-module" to drop the audiocontrol-
      // specific connotation (see editor-symmetry-report.ts intro).
      expect(
        artifactBody.startsWith('# Cross-module symmetry matrix') ||
          artifactBody.startsWith('# Cross-editor symmetry matrix'),
        `artifact missing expected header; got: ${artifactBody.slice(0, 100)}`,
      ).toBe(true);
      expect(artifactBody).toContain('✓ 1/1');
    } finally {
      await cleanup(fixture);
    }
  });
});

describe('check-editor-symmetry — gutted-stub self-check', () => {
  it('gutted stub returns all-✓ matrix; the real assertion (expects ✗ + exit 1) would reject it', async () => {
    // Plants a stub that always emits a ✓ matrix (no ✗ "no matching
    // files" cell). The real assertion for the
    // "targeted editor with zero glob-matched files" scenario expects
    // exit 1 AND `'✗ no matching files'` in stdout — so when the
    // canned stub runs against that source layout, we observe the
    // stub's output is the SHAPE the real assertion would reject.
    // That's the teeth check.
    const fixture = await makeFixture('gutted', EDITORS_TWO);
    const stubDir = await mkdtemp(join(tmpdir(), 'editor-symmetry-stub-'));
    const stubPath = join(stubDir, 'stub.ts');
    try {
      await writeFile(
        stubPath,
        "process.stdout.write('| Convention | roland-sxx0-editor | akai-s3k-editor |\\n');\n" +
          "process.stdout.write('| --- | --- | --- |\\n');\n" +
          "process.stdout.write('| shared-list-bank | ✓ 1/1 | ✓ 1/1 |\\n');\n" +
          'process.exit(0);\n',
        'utf8',
      );
      await writeRegistry(fixture, payloads.MULTI_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchesPage.tsx',
        payloads.LIST_BANK_IMPORT_SOURCE,
      );
      const run = await runScanner(scannerArgs(fixture), stubPath);
      // Defensive: if the stub somehow lined up with the failing
      // assertion's contract, the gutted self-check has no signal.
      expect(
        run.code === 1 && run.stdout.includes('✗ no matching files'),
        'stub matched the assertion exactly; gutted self-check has no signal',
      ).toBe(false);
      // Expected: stub exits 0 with an all-✓ matrix.
      expect(run.code).toBe(0);
      expect(run.stdout.includes('✗ no matching files')).toBe(false);
    } finally {
      await cleanup(fixture);
      await rm(stubDir, { recursive: true, force: true });
    }
  });
});
