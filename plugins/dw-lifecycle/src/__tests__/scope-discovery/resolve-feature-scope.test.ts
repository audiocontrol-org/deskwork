/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/resolve-feature-scope.test.ts
 *
 * Phase 18 Task 1 — TDD-first tests for the shared `resolveFeatureScope`
 * helper. The helper is the single source of truth for the
 * manifest-vs-git-diff decision that the six Phase 18 structural-check
 * verbs delegate their `--feature <slug>` narrowing to.
 *
 * Refs #417.
 *
 * Four cases:
 *   (a) manifest-present       → returns regime_holdouts paths,
 *                                 source: 'scope-manifest'.
 *   (b) manifest-absent + diff → returns `git diff --name-only` paths,
 *                                 source: 'git-diff'.
 *   (c) feature-dir-not-found  → throws FeatureNotFoundError.
 *   (d) manifest-absent + diff-empty → returns [], source: 'git-diff'.
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveFeatureScope,
  FeatureNotFoundError,
} from '../../scope-discovery/resolve-feature-scope.js';

interface Fixture {
  readonly repoRoot: string;
  readonly cleanup: () => Promise<void>;
}

async function makeRepo(): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), 'resolve-feature-scope-'));
  return {
    repoRoot: dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function writeManifest(
  repoRoot: string,
  slug: string,
  body: string,
): Promise<string> {
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', slug);
  await mkdir(featureDir, { recursive: true });
  const path = join(featureDir, 'scope-manifest.yaml');
  await writeFile(path, body, 'utf8');
  return path;
}

async function mkFeatureDirOnly(repoRoot: string, slug: string): Promise<void> {
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', slug);
  await mkdir(featureDir, { recursive: true });
}

const MANIFEST_WITH_HOLDOUTS = [
  'kind: code',
  'feature_slug: hygiene',
  'generated_by: curated',
  'generated_at: 2026-06-04T00:00:00.000Z',
  'scenarios:',
  '  - id: default',
  '    label: Default state',
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
  '    - id: foo',
  '      file: plugins/dw-lifecycle/src/scope-discovery/check-clones.ts',
  '      shape: ap-shape',
  '      replacement: ap-fix',
  '      evidence:',
  '        registry_path: anti-patterns.yaml',
  '        registry_id: foo',
  '      status_provenance:',
  '        source_status: blessed',
  '        provenance_source: install-seed',
  '  adopter_manifests:',
  '    - id: bar',
  '      file: plugins/dw-lifecycle/src/scope-discovery/check-adopters.ts',
  '      shape: am-shape',
  '      replacement: am-fix',
  '      evidence:',
  '        registry_path: adopter-manifests.yaml',
  '        registry_id: bar',
  '      status_provenance:',
  '        source_status: blessed',
  '        provenance_source: install-seed',
  '  module_symmetry: []',
  '  deprecations: []',
  '  meta:',
  '    total: 2',
  '    by_source:',
  '      anti_patterns: 1',
  '      adopter_manifests: 1',
  '      module_symmetry: 0',
  '      deprecations: 0',
  '',
].join('\n');

describe('resolveFeatureScope', () => {
  it('(a) manifest-present: returns regime_holdouts file paths with source=scope-manifest', async () => {
    const fixture = await makeRepo();
    try {
      const manifestPath = await writeManifest(
        fixture.repoRoot,
        'hygiene',
        MANIFEST_WITH_HOLDOUTS,
      );
      const result = await resolveFeatureScope({
        slug: 'hygiene',
        repoRoot: fixture.repoRoot,
        deps: {
          gitDiffNameOnly: async () => {
            throw new Error('git-diff should not be called when manifest is present');
          },
        },
      });
      expect(result.source).toBe('scope-manifest');
      expect(result.manifestPath).toBe(manifestPath);
      expect(result.files).toEqual(
        expect.arrayContaining([
          'plugins/dw-lifecycle/src/scope-discovery/check-clones.ts',
          'plugins/dw-lifecycle/src/scope-discovery/check-adopters.ts',
        ]),
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('(b) manifest-absent: runs git-diff and returns its paths with source=git-diff', async () => {
    const fixture = await makeRepo();
    try {
      await mkFeatureDirOnly(fixture.repoRoot, 'hygiene');
      const result = await resolveFeatureScope({
        slug: 'hygiene',
        repoRoot: fixture.repoRoot,
        deps: {
          gitDiffNameOnly: async () => [
            'plugins/dw-lifecycle/src/scope-discovery/check-clones.ts',
            'docs/1.0/001-IN-PROGRESS/hygiene/workplan.md',
          ],
        },
      });
      expect(result.source).toBe('git-diff');
      expect(result.manifestPath).toBeNull();
      expect(result.files).toEqual([
        'plugins/dw-lifecycle/src/scope-discovery/check-clones.ts',
        'docs/1.0/001-IN-PROGRESS/hygiene/workplan.md',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('(c) feature-dir-not-found: throws FeatureNotFoundError naming the slug', async () => {
    const fixture = await makeRepo();
    try {
      await expect(
        resolveFeatureScope({
          slug: 'does-not-exist',
          repoRoot: fixture.repoRoot,
          deps: {
            gitDiffNameOnly: async () => [],
          },
        }),
      ).rejects.toThrow(FeatureNotFoundError);
    } finally {
      await fixture.cleanup();
    }
  });

  it('(d) manifest-absent + git-diff-empty: returns [] with source=git-diff', async () => {
    const fixture = await makeRepo();
    try {
      await mkFeatureDirOnly(fixture.repoRoot, 'hygiene');
      const result = await resolveFeatureScope({
        slug: 'hygiene',
        repoRoot: fixture.repoRoot,
        deps: {
          gitDiffNameOnly: async () => [],
        },
      });
      expect(result.source).toBe('git-diff');
      expect(result.files).toEqual([]);
      expect(result.manifestPath).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });
});
