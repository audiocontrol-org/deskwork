// Per-codebase clone-scoping boundary (010 T005) — the one new behavior on top
// of the dw-lifecycle scope-discovery port (R1 / FR-005..008).
//
// The dw-lifecycle clone-detector defaulted its scan root to `process.cwd()`
// (whole-repo). That is the defect this replaces: in a monorepo it reports
// cross-codebase duplication (e.g. audit-barrage vendored from dw-lifecycle into
// stack-control) as clones. Here the default scan boundary is the
// nearest-enclosing stack-control installation (009's `resolveInstallation`
// walk-up), and any NESTED child installation subtree is excluded so the
// parent's scan never reaches into a child codebase (009 FR-021 nearest-wins).
//
// Reuses ONE resolution model — 009's installation walk-up — so "what codebase
// am I in" has a single answer across every governed verb. No cwd fallback:
// resolution fails loud when no installation is found (FR-007, Principle V).

import { existsSync, readdirSync, type Dirent } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { resolveInstallation, CONFIG_REL_PATH } from '../config/installation.js';

/** The resolved single-codebase scope a clone run operates within. */
export interface CodebaseBoundary {
  /** Nearest-enclosing `.stack-control` installation root (or the --root override). */
  readonly installationRoot: string;
  /** Nested child-installation subtrees excluded from the scan (009 FR-021). */
  readonly excludedChildren: string[];
  /** The `--root` override when supplied; otherwise null (default = installationRoot). */
  readonly explicitOverride: string | null;
}

/** Directories never descended when scanning for nested child installations. */
const PRUNE_DIRS: ReadonlySet<string> = new Set([
  '.git',
  '.stack-control',
  'node_modules',
  '.runtime-cache',
  'dist',
]);

/**
 * Resolve the codebase boundary for a clone run.
 *
 * - `explicitRoot` set → that path is the scan root (operator-named via `--root`),
 *   recorded as `explicitOverride`. Nested children beneath it are still excluded.
 * - `explicitRoot` absent → walk up from `startDir` to the nearest installation
 *   (009). No installation → throws (no `process.cwd()` / whole-repo fallback).
 */
export function resolveCodebaseBoundary(opts: {
  readonly startDir: string;
  readonly explicitRoot?: string | null;
}): CodebaseBoundary {
  if (opts.explicitRoot !== undefined && opts.explicitRoot !== null) {
    const root = resolvePath(opts.explicitRoot);
    return {
      installationRoot: root,
      excludedChildren: findNestedInstallations(root),
      explicitOverride: root,
    };
  }

  // Default: nearest-enclosing installation. `resolveInstallation` throws
  // InstallationError('not-found') when none exists — fail loud, no fallback.
  const installation = resolveInstallation(opts.startDir);
  return {
    installationRoot: installation.root,
    excludedChildren: findNestedInstallations(installation.root),
    explicitOverride: null,
  };
}

/**
 * Find every NESTED child installation under `root` — strict descendants that
 * carry their own `.stack-control/config.yaml`. A child's whole subtree is
 * excluded, so we don't recurse past a found child (deeper nestings inside it
 * are already covered by excluding the child root).
 */
function findNestedInstallations(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — nothing to exclude beneath it
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (PRUNE_DIRS.has(entry.name)) continue;
      const childDir = join(dir, entry.name);
      if (existsSync(join(childDir, CONFIG_REL_PATH))) {
        found.push(childDir);
        continue; // child subtree wholly excluded — don't descend further
      }
      walk(childDir);
    }
  };
  walk(root);
  return found;
}
