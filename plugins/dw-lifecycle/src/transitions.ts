import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveFeatureDir, type Stage } from './docs.js';
import type { Config } from './config.types.js';

export interface TransitionOpts {
  from: Stage;
  to: Stage;
  targetVersion: string;
}

export function transitionFeature(
  cfg: Config,
  projectRoot: string,
  slug: string,
  opts: TransitionOpts
): void {
  const fromDir = resolveFeatureDir(cfg, projectRoot, slug, { stage: opts.from, targetVersion: opts.targetVersion });
  const toDir = resolveFeatureDir(cfg, projectRoot, slug, { stage: opts.to, targetVersion: opts.targetVersion });

  if (existsSync(fromDir)) {
    mkdirSync(dirname(toDir), { recursive: true });
    renameSync(fromDir, toDir);
    return;
  }

  if (existsSync(toDir)) {
    // Idempotent: already at destination
    return;
  }

  throw new Error(`Feature "${slug}" not found at ${fromDir} or ${toDir}`);
}
