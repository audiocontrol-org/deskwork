/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/anti-patterns.feature-flag.test.ts
 *
 * Phase 18 Task 3 — TDD-first tests for `check-anti-patterns --feature <slug>`.
 *
 * Refs #417.
 *
 * Cases:
 *   (a) `--feature hygiene` narrows the scan to feature-scope files
 *       only (anti-pattern hits in out-of-scope files don't surface).
 *   (b) no `--feature` flag preserves project-wide scan (both files
 *       surface).
 *   (c) `--feature` + `--root` together → exits 2 with actionable error
 *       (mutually exclusive scoping).
 *   (d) `--feature unknown-slug` → exits 2 with FeatureNotFoundError.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  makeAntiPatternsFixture,
  runAntiPatterns,
  type AntiPatternsFixture,
} from './util/anti-patterns-harness.js';
import { runScannerSubprocess } from './util/run-scanner.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

const REGISTRY_YAML = `anti_patterns:
  - id: legacy-thing
    added_in: deadbeef
    primitive: NewThing
    from: '@/components/NewThing'
    shape_regex: 'legacyThing\\('
    message: |
      Replace legacyThing(...) with NewThing.
`;

const MATCH_SOURCE = `export function callIt() {
  legacyThing(42);
}
`;

async function plantHygieneManifest(
  fixture: AntiPatternsFixture,
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
    '  anti_patterns:',
    entries,
    '  adopter_manifests: []',
    '  module_symmetry: []',
    '  deprecations: []',
    '  meta:',
    `    total: ${inScopeFiles.length}`,
    '    by_source:',
    `      anti_patterns: ${inScopeFiles.length}`,
    '      adopter_manifests: 0',
    '      module_symmetry: 0',
    '      deprecations: 0',
    '',
  ].join('\n');
  await writeFile(join(featureDir, 'scope-manifest.yaml'), body, 'utf8');
}

describe('check-anti-patterns --feature <slug>', () => {
  it('(b) no --feature flag preserves project-wide scan (both files flagged)', async () => {
    const fixture = await makeAntiPatternsFixture('feat-noflag');
    try {
      await fixture.writeRegistry(REGISTRY_YAML);
      await fixture.writeSource('in-scope/x.ts', MATCH_SOURCE);
      await fixture.writeSource('out-of-scope/y.ts', MATCH_SOURCE);
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(1); // gate-mode + findings
      expect(run.stdout).toContain('in-scope/x.ts');
      expect(run.stdout).toContain('out-of-scope/y.ts');
    } finally {
      await fixture.cleanup();
    }
  });

  it('(a) --feature hygiene narrows scan to feature-scope files', async () => {
    const fixture = await makeAntiPatternsFixture('feat-scoped');
    try {
      await fixture.writeRegistry(REGISTRY_YAML);
      await fixture.writeSource('in-scope/x.ts', MATCH_SOURCE);
      await fixture.writeSource('out-of-scope/y.ts', MATCH_SOURCE);
      // Manifest path is relative to fixture.dir; the in-scope source
      // lives under fixture.dir/src/in-scope/x.ts.
      await plantHygieneManifest(fixture, ['src/in-scope/x.ts']);
      // Use the harness's runAntiPatterns which passes --gate-mode +
      // --root <scanRoot> + --registry. Add --feature hygiene; the
      // implementation should ignore --root when --feature narrows
      // (or error per case c — see below). For this test, leave only
      // --feature in the extra so the impl can pick its semantics.
      const args = [
        'check-anti-patterns',
        '--registry',
        fixture.registryPath,
        '--gate-mode',
        '--feature',
        'hygiene',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, args, { cwd: fixture.dir });
      expect(run.code, `stderr=${run.stderr}; stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('in-scope/x.ts');
      expect(run.stdout, `out-of-scope should be filtered out:\n${run.stdout}`).not.toContain(
        'out-of-scope/y.ts',
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('(c) --feature + --root together → exits 2 with actionable error', async () => {
    const fixture = await makeAntiPatternsFixture('feat-both');
    try {
      await fixture.writeRegistry(REGISTRY_YAML);
      await plantHygieneManifest(fixture, ['src/x.ts']);
      const run = await runAntiPatterns(fixture, ['--feature', 'hygiene']);
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/--feature.*--root.*mutually exclusive/);
    } finally {
      await fixture.cleanup();
    }
  });

  it('(d) --feature unknown-slug → exits 2 with FeatureNotFoundError', async () => {
    const fixture = await makeAntiPatternsFixture('feat-unknown');
    try {
      await fixture.writeRegistry(REGISTRY_YAML);
      const args = [
        'check-anti-patterns',
        '--registry',
        fixture.registryPath,
        '--feature',
        'does-not-exist',
      ];
      const run = await runScannerSubprocess(CLI_ENTRY, args, { cwd: fixture.dir });
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/feature 'does-not-exist' not found/);
    } finally {
      await fixture.cleanup();
    }
  });
});
