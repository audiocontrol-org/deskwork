/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.feature-flag.test.ts
 *
 * Phase 18 Task 2 — TDD-first tests for `check-clones --feature <slug>`.
 *
 * Refs #417.
 *
 * Cases:
 *   (a) `--feature hygiene` with a fixture-side scope-manifest pointing
 *       at one of two cloned files → the OTHER file's clone group is
 *       filtered out of the report. (Both files are clones; only the
 *       in-scope group surfaces.)
 *   (b) `--feature hygiene` flag accepted → no `unknown arg: --feature`
 *       error.
 *   (c) `--feature unknown-slug` (no feature dir) → exits 2 with
 *       FeatureNotFoundError on stderr.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { makeFixture, detectorArgs, runDetector } from './util/detector-harness.js';

/**
 * Two distinct cloned-pair bodies. Each clone-group needs ≥2 members,
 * so we plant 4 files total: 2 inside `in-scope/` (cloned pair) and
 * 2 inside `out-of-scope/` (a different cloned pair). With
 * `--feature hygiene` pointing the manifest at `in-scope/a.ts`, only
 * the in-scope group should surface in the report.
 */
const IN_SCOPE_BODY = `export function inScopeCalc(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

const OUT_SCOPE_BODY = `export function outScopeCalc(p: number, q: number): number {
  const total = p + q;
  const times = p * q;
  const minus = p - q;
  const ratio = q === 0 ? 0 : p / q;
  return total - times + minus - ratio;
}
`;

async function plantManifest(
  fixtureDir: string,
  slug: string,
  inScopeFiles: readonly string[],
): Promise<void> {
  const featureDir = join(fixtureDir, 'docs', '1.0', '001-IN-PROGRESS', slug);
  await mkdir(featureDir, { recursive: true });
  const entries = inScopeFiles
    .map(
      (file, idx) =>
        `    - id: scope-${idx}\n      file: ${file}\n      shape: holdout\n      replacement: fix\n      evidence:\n        registry_path: x.yaml\n        registry_id: scope-${idx}\n      status_provenance:\n        source_status: blessed\n        provenance_source: install-seed`,
    )
    .join('\n');
  const body = [
    'kind: code',
    `feature_slug: ${slug}`,
    'generated_by: curated',
    'generated_at: 2026-06-04T00:00:00.000Z',
    'scenarios:',
    '  - id: default',
    '    label: Default',
    '    description: stub',
    'reference_docs:',
    `  - path: docs/1.0/001-IN-PROGRESS/${slug}/prd.md`,
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

describe('check-clones --feature <slug>', () => {
  it('(b) --feature hygiene is accepted; no unknown-arg error', async () => {
    const fixture = await makeFixture('feature-flag-accept');
    try {
      await plantManifest(fixture.dir, 'hygiene', ['in-scope/a.ts']);
      await fixture.writeFile('in-scope/a.ts', IN_SCOPE_BODY);
      await fixture.writeFile('in-scope/b.ts', IN_SCOPE_BODY);
      const run = await runDetector(
        detectorArgs(fixture, { quiet: true }, ['--feature', 'hygiene']),
      );
      expect(run.stderr, `stderr should NOT mention 'unknown arg':\n${run.stderr}`).not.toMatch(
        /unknown arg/,
      );
      // First run writes the baseline; exit 0.
      expect(run.code, `exit code; stderr:\n${run.stderr}`).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('(a) --feature hygiene filters report to clone groups with ≥1 in-scope member', async () => {
    const fixture = await makeFixture('feature-flag-filter');
    try {
      await plantManifest(fixture.dir, 'hygiene', ['in-scope/a.ts']);
      // Plant two distinct clone-pairs.
      await fixture.writeFile('in-scope/a.ts', IN_SCOPE_BODY);
      await fixture.writeFile('in-scope/b.ts', IN_SCOPE_BODY);
      await fixture.writeFile('out-of-scope/a.ts', OUT_SCOPE_BODY);
      await fixture.writeFile('out-of-scope/b.ts', OUT_SCOPE_BODY);

      // Run 1: baseline-write captures BOTH groups (project-wide).
      const baselineRun = await runDetector(detectorArgs(fixture, { quiet: true }));
      expect(baselineRun.code, `baseline-write stderr:\n${baselineRun.stderr}`).toBe(0);

      // Run 2: compare-mode WITH --feature hygiene AND --json so the
      // member paths are present in machine-readable form. The
      // in-scope group should appear; the out-of-scope group should
      // NOT.
      const featureRun = await runDetector(
        detectorArgs(fixture, { quiet: true }, ['--feature', 'hygiene', '--json']),
      );
      expect(featureRun.code, `feature-filter stderr:\n${featureRun.stderr}`).toBe(0);
      const parsed: unknown = JSON.parse(featureRun.stdout);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('groups' in parsed) ||
        !Array.isArray((parsed as { groups: unknown }).groups)
      ) {
        throw new Error(`unexpected JSON shape:\n${featureRun.stdout}`);
      }
      const groups = (parsed as { groups: ReadonlyArray<{ members: readonly string[] }> }).groups;
      expect(groups).toHaveLength(1);
      const allMembers = groups.flatMap((g) => g.members);
      expect(allMembers.some((m) => m.includes('in-scope/a.ts'))).toBe(true);
      expect(allMembers.some((m) => m.includes('out-of-scope/a.ts'))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('(c) --feature unknown-slug exits 2 with FeatureNotFoundError on stderr', async () => {
    const fixture = await makeFixture('feature-flag-unknown');
    try {
      await fixture.writeFile('in-scope/a.ts', IN_SCOPE_BODY);
      await fixture.writeFile('in-scope/b.ts', IN_SCOPE_BODY);
      const run = await runDetector(
        detectorArgs(fixture, { quiet: true }, ['--feature', 'does-not-exist']),
      );
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/feature 'does-not-exist' not found/);
    } finally {
      await fixture.cleanup();
    }
  });
});
