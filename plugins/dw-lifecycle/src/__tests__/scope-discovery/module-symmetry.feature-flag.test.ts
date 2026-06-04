/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/module-symmetry.feature-flag.test.ts
 *
 * Phase 18 Task 5 — TDD-first tests for `check-module-symmetry --feature <slug>`.
 *
 * Refs #417.
 *
 * Cases:
 *   (a) `--feature hygiene` narrows the matrix to feature-touched modules.
 *   (b) no `--feature` flag preserves project-wide matrix (all modules
 *       under module-root surface).
 *   (c) `--feature` + `--root` together → exits 2 with actionable error.
 *   (d) `--feature unknown-slug` → exits 2 with FeatureNotFoundError.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  cleanup,
  makeFixture,
  payloads,
  scannerArgs,
  writeRegistry,
  writeSource,
  type Fixture,
} from './editor-symmetry.fixtures.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

const EDITORS = ['roland-sxx0-editor', 'akai-s3k-editor'];

const HOLDOUT_SOURCE = `export function PageStub() { return null; }\n`;

async function plantManifest(
  fixture: Fixture,
  inScopeFiles: readonly string[],
): Promise<void> {
  // Manifest lives at fixture.scanRoot/docs/<v>/<status>/<slug>/scope-manifest.yaml
  // — subprocess cwd = fixture.scanRoot so the resolver finds it.
  const featureDir = join(
    fixture.scanRoot,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    'hygiene',
  );
  await mkdir(featureDir, { recursive: true });
  const entries = inScopeFiles
    .map(
      (file, idx) =>
        `    - id: scope-${idx}\n      file: ${file}\n      shape: holdout\n      replacement: fix\n      evidence:\n        registry_path: x.yaml\n        registry_id: scope-${idx}\n      status_provenance:\n        source_status: blessed\n        provenance_source: install-seed`,
    )
    .join('\n');
  const body = [
    'kind: code',
    'feature_slug: hygiene',
    'generated_by: curated',
    'generated_at: 2026-06-04T00:00:00.000Z',
    'scenarios:',
    '  - id: default',
    '    label: Default',
    '    description: stub',
    'reference_docs:',
    '  - path: docs/1.0/001-IN-PROGRESS/hygiene/prd.md',
    '    role: prd',
    '    summary: PRD',
    'discovery_themes:',
    '  - hygiene',
    'modules: []',
    'regime_holdouts:',
    '  anti_patterns: []',
    '  adopter_manifests: []',
    '  module_symmetry:',
    entries,
    '  deprecations: []',
    '  meta:',
    `    total: ${inScopeFiles.length}`,
    '    by_source:',
    '      anti_patterns: 0',
    '      adopter_manifests: 0',
    `      module_symmetry: ${inScopeFiles.length}`,
    '      deprecations: 0',
    '',
  ].join('\n');
  await writeFile(join(featureDir, 'scope-manifest.yaml'), body, 'utf8');
}

describe('check-module-symmetry --feature <slug>', () => {
  it('(b) no --feature flag preserves project-wide matrix (both modules surface)', async () => {
    const fixture = await makeFixture('feat-noflag', EDITORS);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/FooEditor.tsx',
        HOLDOUT_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/BarEditor.tsx',
        HOLDOUT_SOURCE,
      );
      const args = scannerArgs(fixture);
      args[0] = 'check-module-symmetry';
      const run = await runScannerSubprocess(CLI_ENTRY, args);
      // Both modules in the matrix headline.
      expect(run.stdout).toContain('roland-sxx0-editor');
      expect(run.stdout).toContain('akai-s3k-editor');
    } finally {
      await cleanup(fixture);
    }
  });

  it('(a) --feature hygiene narrows matrix to feature-touched modules', async () => {
    const fixture = await makeFixture('feat-scoped', EDITORS);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/FooEditor.tsx',
        HOLDOUT_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/BarEditor.tsx',
        HOLDOUT_SOURCE,
      );
      // Scope-manifest points at a file inside roland-sxx0-editor ONLY.
      await plantManifest(fixture, [
        'modules/roland-sxx0-editor/src/FooEditor.tsx',
      ]);
      const argv = [
        'check-module-symmetry',
        '--registry',
        fixture.registryPath,
        '--module-root',
        'modules',
        '--feature',
        'hygiene',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, argv, {
        cwd: fixture.scanRoot,
      });
      expect(run.stdout).toContain('roland-sxx0-editor');
      expect(
        run.stdout,
        `akai-s3k-editor should be filtered out of the matrix:\n${run.stdout}`,
      ).not.toContain('akai-s3k-editor');
    } finally {
      await cleanup(fixture);
    }
  });

  it('(c) --feature + --root together → exits 2 with actionable error', async () => {
    const fixture = await makeFixture('feat-both', EDITORS);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      await plantManifest(fixture, ['modules/roland-sxx0-editor/src/x.tsx']);
      const argv = [
        'check-module-symmetry',
        '--registry',
        fixture.registryPath,
        '--root',
        fixture.scanRoot,
        '--module-root',
        'modules',
        '--feature',
        'hygiene',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, argv, {
        cwd: fixture.scanRoot,
      });
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/--feature.*--root.*mutually exclusive/);
    } finally {
      await cleanup(fixture);
    }
  });

  it('(d) --feature unknown-slug → exits 2 with FeatureNotFoundError', async () => {
    const fixture = await makeFixture('feat-unknown', EDITORS);
    try {
      await writeRegistry(fixture, payloads.SINGLE_EDITOR_REGISTRY);
      const argv = [
        'check-module-symmetry',
        '--registry',
        fixture.registryPath,
        '--module-root',
        'modules',
        '--feature',
        'does-not-exist',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, argv, {
        cwd: fixture.scanRoot,
      });
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/feature 'does-not-exist' not found/);
    } finally {
      await cleanup(fixture);
    }
  });
});
