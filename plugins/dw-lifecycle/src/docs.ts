// src/docs.ts
import { join } from 'node:path';
import type { Config } from './config.types.js';

export type Stage = 'inProgress' | 'waiting' | 'complete';

export interface ResolveOpts {
  stage: Stage;
  targetVersion?: string;
}

export function resolveFeatureDir(
  cfg: Config,
  projectRoot: string,
  slug: string,
  opts: ResolveOpts
): string {
  const stageDir = cfg.docs.statusDirs[opts.stage];
  const segments = [projectRoot, cfg.docs.root];
  if (cfg.docs.byVersion) {
    segments.push(opts.targetVersion ?? cfg.docs.defaultTargetVersion);
  }
  segments.push(stageDir, slug);
  return join(...segments);
}

export function resolveFeaturePath(
  cfg: Config,
  projectRoot: string,
  slug: string,
  file: string,
  opts: ResolveOpts
): string {
  return join(resolveFeatureDir(cfg, projectRoot, slug, opts), file);
}
