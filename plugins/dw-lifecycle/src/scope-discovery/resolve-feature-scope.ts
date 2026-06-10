/**
 * plugins/dw-lifecycle/src/scope-discovery/resolve-feature-scope.ts
 *
 * Phase 18 — shared `--feature <slug>` narrowing source-of-truth.
 *
 * Hybrid resolver: prefer `docs/<v>/<status>/<slug>/scope-manifest.yaml`
 * regime_holdouts file paths when present; fall back to
 * `git diff --name-only <baseRef>...HEAD` when the manifest is absent.
 *
 * The six structural-check verbs (check-clones, check-anti-patterns,
 * check-adopters, check-module-symmetry, check-refactor-preconditions,
 * check-disposition-survivor) delegate their `--feature <slug>`
 * narrowing to this module so the manifest-vs-git-diff decision lives
 * in exactly one place.
 *
 * Refs #417.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveFeatureRoot } from './util/feature-root.js';
import { isPlainObject } from './util/typeguards.js';

export type FeatureScopeSource = 'scope-manifest' | 'git-diff';

export interface FeatureScope {
  readonly files: readonly string[];
  readonly source: FeatureScopeSource;
  readonly manifestPath: string | null;
}

export class FeatureNotFoundError extends Error {
  constructor(slug: string, searched: readonly string[]) {
    super(
      `feature '${slug}' not found under docs/<version>/001-IN-PROGRESS/${slug}/ ` +
        `(versions checked: ${searched.length === 0 ? '<none>' : searched.join(', ')})`,
    );
    this.name = 'FeatureNotFoundError';
  }
}

export interface ResolveFeatureScopeDeps {
  /**
   * Returns the list of repo-relative paths from
   * `git diff --name-only <baseRef>...HEAD` (or equivalent).
   * Tests inject a stub; production uses the runtime implementation
   * via the default below.
   */
  readonly gitDiffNameOnly: (
    repoRoot: string,
    baseRef: string,
    headRef: string,
  ) => Promise<readonly string[]>;
}

export interface ResolveFeatureScopeArgs {
  readonly slug: string;
  readonly repoRoot: string;
  readonly baseRef?: string;
  readonly headRef?: string;
  readonly deps?: Partial<ResolveFeatureScopeDeps>;
}

function defaultGitDiffNameOnly(
  repoRoot: string,
  baseRef: string,
  headRef: string,
): Promise<readonly string[]> {
  return new Promise((resolveP) => {
    try {
      const out = execFileSync('git', ['diff', '--name-only', `${baseRef}...${headRef}`], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      const lines = out.split('\n').filter((line) => line.trim().length > 0);
      resolveP(lines);
    } catch {
      resolveP([]);
    }
  });
}

function collectHoldoutFiles(manifest: unknown): string[] {
  if (!isPlainObject(manifest)) return [];
  const holdouts = manifest['regime_holdouts'];
  if (!isPlainObject(holdouts)) return [];
  const buckets: readonly string[] = [
    'anti_patterns',
    'adopter_manifests',
    'module_symmetry',
    'deprecations',
  ];
  const files: string[] = [];
  for (const bucket of buckets) {
    const entries = holdouts[bucket];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isPlainObject(entry)) continue;
      const file = entry['file'];
      if (typeof file === 'string' && file.length > 0) {
        files.push(file);
      }
    }
  }
  return [...new Set(files)];
}

export async function resolveFeatureScope(
  args: ResolveFeatureScopeArgs,
): Promise<FeatureScope> {
  const baseRef = args.baseRef ?? 'main';
  const headRef = args.headRef ?? 'HEAD';
  const gitDiffNameOnly = args.deps?.gitDiffNameOnly ?? defaultGitDiffNameOnly;

  const { root, versionsChecked } = await resolveFeatureRoot({
    repoRoot: args.repoRoot,
    slug: args.slug,
  });
  if (root === undefined) {
    throw new FeatureNotFoundError(args.slug, versionsChecked);
  }

  const manifestPath = join(root, 'scope-manifest.yaml');
  if (existsSync(manifestPath)) {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed: unknown = parseYaml(raw);
    const files = collectHoldoutFiles(parsed);
    return { files, source: 'scope-manifest', manifestPath };
  }

  const diffFiles = await gitDiffNameOnly(args.repoRoot, baseRef, headRef);
  return {
    files: [...diffFiles],
    source: 'git-diff',
    manifestPath: null,
  };
}
