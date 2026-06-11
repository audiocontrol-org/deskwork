// Installation resolution (009 T007) — upward-walk from a start directory to the
// nearest ancestor containing `.stack-control/config.yaml`. Nearest-wins on
// nesting; stop at the filesystem root; fail loud (code 'not-found') when none is
// found, directing the operator to `stackctl setup`. Surface-agnostic (FR-026):
// `startDir` is a plain directory (CLI cwd today, a client-supplied root later),
// never a host-specific handle.

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { loadInstallationConfig } from './config-loader.js';
import { resolvePaths } from './resolve-paths.js';
import { InstallationError } from './errors.js';
import type { Installation } from './types.js';

/** The config marker, relative to an installation root. Its presence marks the root. */
export const CONFIG_REL_PATH = join('.stack-control', 'config.yaml');

// --- Legacy half-installation notice (specs/installation-isolation US5/R6) ---
//
// When the resolved installation's root differs from the derived git
// toplevel AND the toplevel carries a `.stack-control/` WITHOUT the
// config.yaml marker, that outer state is LEGACY DEBRIS created by the
// retired repo-root-keyed write paths — it would otherwise silently
// bitrot (or worse, keep being read) while new state lands in the
// installation. The notice fires HERE, in the one resolver every verb
// path bottoms out on (resolveCodebaseBoundary, the backlog root seam,
// govern's entry, the session verbs), at most once per process
// invocation. It never fires when no legacy state exists (no cry-wolf),
// and the advice is non-destructive: it never names an existing tuned
// file as an overwrite target (the audit-protocol-reliability
// AUDIT-09/-15 lesson).

let legacyNoticeFired = false;
let noticeVerb = 'stackctl';

/** The `<verb>:` prefix the notice carries (set by the CLI dispatcher). */
export function setInstallationNoticeVerb(verb: string): void {
  noticeVerb = verb;
}

function maybeEmitLegacyHalfInstallationNotice(installationRoot: string): void {
  if (legacyNoticeFired) return;
  const r = spawnSync('git', ['-C', installationRoot, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || typeof r.stdout !== 'string') return;
  const toplevel = r.stdout.trim();
  if (toplevel.length === 0) return;
  try {
    if (realpathSync(toplevel) === realpathSync(installationRoot)) return;
  } catch {
    return;
  }
  const legacyDir = join(toplevel, '.stack-control');
  if (!existsSync(legacyDir)) return;
  // A marker-CARRYING outer .stack-control is a real (outer) installation
  // under the 009 nearest-wins model — not debris.
  if (existsSync(join(legacyDir, 'config.yaml'))) return;
  legacyNoticeFired = true;
  process.stderr.write(
    `${noticeVerb}: WARNING — legacy stack-control state present and IGNORED at ${legacyDir} (no config.yaml marker)\n`,
  );
  process.stderr.write(
    `${noticeVerb}: reading/writing under ${join(installationRoot, '.stack-control')}\n`,
  );
  process.stderr.write(
    `${noticeVerb}: migrate by moving the legacy files into the installation (advice never overwrites existing tuned files; review each)\n`,
  );
}

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
      maybeEmitLegacyHalfInstallationNotice(dir);
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
