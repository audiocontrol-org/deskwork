/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/adopter-manifests.feature-flag.test.ts
 *
 * Phase 18 Task 4 — TDD-first tests for `check-adopters --feature <slug>`.
 *
 * Refs #417.
 *
 * Cases:
 *   (a) `--feature hygiene` narrows the holdout check to feature-scope
 *       files only (out-of-scope holdouts don't surface).
 *   (b) no `--feature` flag preserves project-wide behavior.
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
  writeRegistry,
  writeSource,
  type Fixture,
} from './adopter-manifests.fixtures.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

const REGISTRY_YAML = `adopter_manifests:
  - id: list-bank-promotion
    introduced_in: deadbeef
    from: '@/components/ListBank'
    expected_adopters_glob:
      - '**/*Page.tsx'
    message: |
      Use the shared ListBank widget.
`;

const HOLDOUT_SOURCE = `export function PageStub() { return null; }\n`;

async function plantManifest(
  fixture: Fixture,
  inScopeFiles: readonly string[],
): Promise<void> {
  const featureDir = join(fixture.dir, 'docs', '1.0', '001-IN-PROGRESS', 'hygiene');
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
    '  adopter_manifests:',
    entries,
    '  module_symmetry: []',
    '  deprecations: []',
    '  meta:',
    `    total: ${inScopeFiles.length}`,
    '    by_source:',
    '      anti_patterns: 0',
    `      adopter_manifests: ${inScopeFiles.length}`,
    '      module_symmetry: 0',
    '      deprecations: 0',
    '',
  ].join('\n');
  await writeFile(join(featureDir, 'scope-manifest.yaml'), body, 'utf8');
}

describe('check-adopters --feature <slug>', () => {
  it('(b) no --feature flag preserves project-wide scan (both holdouts flagged)', async () => {
    const fixture = await makeFixture('feat-noflag');
    try {
      await writeRegistry(fixture, REGISTRY_YAML);
      await writeSource(fixture, 'in-scope/PostPage.tsx', HOLDOUT_SOURCE);
      await writeSource(fixture, 'out-of-scope/OtherPage.tsx', HOLDOUT_SOURCE);
      const argv = [
        'check-adopters',
        '--registry',
        fixture.registryPath,
        '--root',
        fixture.scanRoot,
        '--gate-mode',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, argv);
      expect(run.code, `stderr=${run.stderr}; stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('in-scope/PostPage.tsx');
      expect(run.stdout).toContain('out-of-scope/OtherPage.tsx');
    } finally {
      await cleanup(fixture);
    }
  });

  it('(a) --feature hygiene narrows holdout check to feature-scope', async () => {
    const fixture = await makeFixture('feat-scoped');
    try {
      await writeRegistry(fixture, REGISTRY_YAML);
      await writeSource(fixture, 'in-scope/PostPage.tsx', HOLDOUT_SOURCE);
      await writeSource(fixture, 'out-of-scope/OtherPage.tsx', HOLDOUT_SOURCE);
      // Sources are under fixture.scanRoot which is fixture.dir + '/src'.
      // The manifest path is relative to fixture.dir.
      await plantManifest(fixture, ['src/in-scope/PostPage.tsx']);
      const argv = [
        'check-adopters',
        '--registry',
        fixture.registryPath,
        '--gate-mode',
        '--feature',
        'hygiene',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, argv, { cwd: fixture.dir });
      expect(run.code, `stderr=${run.stderr}; stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('in-scope/PostPage.tsx');
      expect(run.stdout, `out-of-scope should be filtered out:\n${run.stdout}`).not.toContain(
        'out-of-scope/OtherPage.tsx',
      );
    } finally {
      await cleanup(fixture);
    }
  });

  it('(c) --feature + --root together → exits 2 with actionable error', async () => {
    const fixture = await makeFixture('feat-both');
    try {
      await writeRegistry(fixture, REGISTRY_YAML);
      await plantManifest(fixture, ['src/in-scope/X.tsx']);
      const argv = [
        'check-adopters',
        '--registry',
        fixture.registryPath,
        '--root',
        fixture.scanRoot,
        '--feature',
        'hygiene',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, argv, { cwd: fixture.dir });
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/--feature.*--root.*mutually exclusive/);
    } finally {
      await cleanup(fixture);
    }
  });

  it('(d) --feature unknown-slug → exits 2 with FeatureNotFoundError', async () => {
    const fixture = await makeFixture('feat-unknown');
    try {
      await writeRegistry(fixture, REGISTRY_YAML);
      const argv = [
        'check-adopters',
        '--registry',
        fixture.registryPath,
        '--feature',
        'does-not-exist',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, argv, { cwd: fixture.dir });
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/feature 'does-not-exist' not found/);
    } finally {
      await cleanup(fixture);
    }
  });
});
