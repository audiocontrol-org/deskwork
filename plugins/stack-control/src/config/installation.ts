// Installation resolution (009 T007) — upward-walk from a start directory to the
// nearest ancestor containing `.stack-control/config.yaml`. Nearest-wins on
// nesting; stop at the filesystem root; fail loud (code 'not-found') when none is
// found, directing the operator to `stackctl setup`. Surface-agnostic (FR-026):
// `startDir` is a plain directory (CLI cwd today, a client-supplied root later),
// never a host-specific handle.

import { existsSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { loadInstallationConfig } from './config-loader.js';
import { resolvePaths } from './resolve-paths.js';
import { InstallationError } from './errors.js';
import type { Installation } from './types.js';

/** The config marker, relative to an installation root. Its presence marks the root. */
export const CONFIG_REL_PATH = join('.stack-control', 'config.yaml');

/** Absolute path to a candidate installation's config, given its root. */
export function configPathFor(root: string): string {
  return join(root, CONFIG_REL_PATH);
}

/**
 * Walk up from `startDir` to the nearest directory whose `.stack-control/
 * config.yaml` exists; load + validate it; resolve every working-file path.
 * No match → InstallationError('not-found').
 */
export function resolveInstallation(startDir: string): Installation {
  const start = resolvePath(startDir);
  let dir = start;
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    const configPath = configPathFor(dir);
    if (existsSync(configPath)) {
      const config = loadInstallationConfig(configPath);
      const resolved = resolvePaths(dir, config);
      return { root: dir, configPath, config, resolved };
    }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  throw new InstallationError(
    'not-found',
    `no stack-control installation found from ${start} ` +
      `(no .stack-control/config.yaml at or above it) — run \`stackctl setup\``,
  );
}

/** Find an enclosing installation, or null when none exists (non-throwing probe). */
export function findInstallation(startDir: string): Installation | null {
  try {
    return resolveInstallation(startDir);
  } catch (err) {
    if (err instanceof InstallationError && err.code === 'not-found') return null;
    throw err;
  }
}
