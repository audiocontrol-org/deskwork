/**
 * plugins/stack-control/src/scope-discovery/util/git-toplevel.ts
 *
 * Per AUDIT-20260611-04: one diff introduced FOUR private
 * `spawnSync('git', ['-C', <base>, 'rev-parse', '--show-toplevel'])`
 * derivations with divergent post-processing:
 *
 *   1. config/installation.ts (legacy half-installation notice) —
 *      realpath-compared toplevel vs installation root.
 *   2. scope-discovery/util/feature-root.ts (`deriveDistinctGitToplevel`)
 *      — same realpath-compare-distinct semantics.
 *   3. subcommands/govern.ts (`currentToplevel`) — NO realpath
 *      comparison; the caller compared `top !== installationRoot` by
 *      raw string, missing macOS /var vs /private/var aliasing, so a
 *      symlinked spelling of the installation root made resolveSpecPath
 *      read the same CLAUDE.md twice via two "distinct" bases.
 *   4. govern/payload-implement.ts (`assembleCrossTreeFeatureArm`) —
 *      raw derivation, with its own realpath fallback for the
 *      relative() computation.
 *
 * This module is the one shared derivation. `deriveGitToplevel` is the
 * raw form (null on git failure / empty output); `deriveDistinctGitToplevel`
 * additionally returns null when the toplevel and the base are the SAME
 * directory under realpath comparison (realpath failure → null), i.e. when
 * there is no separate outer layer to consult. The toplevel is always an
 * EXTERNAL anchor read from git's own marker, never accepted as a
 * parameter (specs/installation-isolation FR-004).
 *
 * Import direction: this util module imports only node builtins — it
 * MUST NOT import from src/config/ (installation.ts is a consumer; a
 * config import here would create a cycle).
 */

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

/**
 * Derive the git toplevel enclosing `base` from git's own marker.
 * Returns null when `base` is not inside a git work tree (non-zero
 * exit, no stdout, or empty output). Note: git prints the
 * symlink-RESOLVED toplevel (macOS /var → /private/var), which may
 * differ in spelling from `base` even when they are the same directory.
 */
export function deriveGitToplevel(base: string): string | null {
  const r = spawnSync('git', ['-C', base, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || typeof r.stdout !== 'string') return null;
  const toplevel = r.stdout.trim();
  return toplevel.length > 0 ? toplevel : null;
}

/**
 * Like `deriveGitToplevel`, but null also when the toplevel IS `base`
 * (no separate outer layer to consult). The comparison is
 * realpath-aware — a symlinked spelling of the same directory is the
 * SAME directory — and a realpath failure on either side returns null
 * (cannot prove distinctness → treat as not distinct).
 */
export function deriveDistinctGitToplevel(base: string): string | null {
  const toplevel = deriveGitToplevel(base);
  if (toplevel === null) return null;
  try {
    if (realpathSync(toplevel) === realpathSync(base)) return null;
  } catch {
    return null;
  }
  return toplevel;
}
