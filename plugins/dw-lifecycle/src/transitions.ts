import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveFeatureDir, type Stage } from './docs.js';
import type { Config } from './config.types.js';
import { updateFrontmatter } from './frontmatter.js';

export interface TransitionOpts {
  from: Stage;
  to: Stage;
  targetVersion: string;
  fromTargetVersion?: string;
}

function candidateSourceVersions(cfg: Config, destinationVersion: string): string[] {
  const versions = new Set<string>();
  versions.add(destinationVersion);
  versions.add(cfg.docs.defaultTargetVersion);
  for (const version of cfg.docs.knownVersions) {
    versions.add(version);
  }
  return Array.from(versions);
}

function resolveExistingFromDir(
  cfg: Config,
  projectRoot: string,
  slug: string,
  opts: TransitionOpts
): { path: string; version: string } | undefined {
  const preferredVersions = opts.fromTargetVersion
    ? [opts.fromTargetVersion]
    : candidateSourceVersions(cfg, opts.targetVersion);

  for (const version of preferredVersions) {
    const candidate = resolveFeatureDir(cfg, projectRoot, slug, {
      stage: opts.from,
      targetVersion: version,
    });
    if (existsSync(candidate)) {
      return { path: candidate, version };
    }
  }

  return undefined;
}

function updateTargetVersionFrontmatter(featureDir: string, targetVersion: string): void {
  for (const filename of ['README.md', 'prd.md', 'workplan.md']) {
    const filePath = join(featureDir, filename);
    if (!existsSync(filePath)) {
      continue;
    }
    const source = readFileSync(filePath, 'utf8');
    writeFileSync(filePath, updateFrontmatter(source, { targetVersion }), 'utf8');
  }
}

export function transitionFeature(
  cfg: Config,
  projectRoot: string,
  slug: string,
  opts: TransitionOpts
): void {
  const resolvedSource = resolveExistingFromDir(cfg, projectRoot, slug, opts);
  const toDir = resolveFeatureDir(cfg, projectRoot, slug, { stage: opts.to, targetVersion: opts.targetVersion });

  if (resolvedSource) {
    mkdirSync(dirname(toDir), { recursive: true });
    renameSync(resolvedSource.path, toDir);
    if (resolvedSource.version !== opts.targetVersion) {
      updateTargetVersionFrontmatter(toDir, opts.targetVersion);
    }
    return;
  }

  if (existsSync(toDir)) {
    // Idempotent: already at destination
    return;
  }

  throw new Error(
    `Feature "${slug}" not found in stage ${opts.from} for version ${opts.fromTargetVersion ?? opts.targetVersion} or at destination ${toDir}`
  );
}
