// Per-key path resolution (009 T008) — pure function over (root, config).
// Precedence per WorkingFileKey: per-file override > base_dir + conventional
// name (internal stores) > audience-split default (human docs at root). Then
// within-root containment + cross-key collision checks (FR-024). The config
// marker is fixed at `<root>/.stack-control/config.yaml` regardless of base_dir
// (that is how resolveInstallation finds the root).

import { isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import { InstallationError } from './errors.js';
import type { InstallationConfig, ResolvedPaths } from './types.js';

/** Fixed config-marker dir — not affected by base_dir. */
const MARKER_DIR = '.stack-control';
const DEFAULT_BASE_DIR = '.stack-control';

export function resolvePaths(root: string, config: InstallationConfig): ResolvedPaths {
  const paths = config.paths ?? {};
  const baseAbs = within(root, config.baseDir ?? DEFAULT_BASE_DIR, 'base_dir');

  const resolved: ResolvedPaths = {
    config: join(root, MARKER_DIR, 'config.yaml'),
    roadmap: resolveKey(root, paths.roadmap, join(root, 'ROADMAP.md'), 'roadmap'),
    inbox: resolveKey(root, paths.inbox, join(root, 'DESIGN-INBOX.md'), 'inbox'),
    backlog: resolveKey(root, paths.backlog, join(baseAbs, 'backlog'), 'backlog'),
    auditLog: resolveKey(root, paths.auditLog, join(baseAbs, 'audit-log.md'), 'auditLog'),
    // session-skills (011): human docs at root; clone scope defaults to the
    // whole installation subtree (the root dir itself).
    journal: resolveKey(root, paths.journal, join(root, 'DEVELOPMENT-NOTES.md'), 'journal'),
    toolingFeedback: resolveKey(
      root,
      paths.toolingFeedback,
      join(root, 'tooling-feedback.md'),
      'toolingFeedback',
    ),
    cloneScope: resolveKey(root, paths.cloneScope, root, 'cloneScope'),
  };

  assertNoCollision(resolved);
  return resolved;
}

function resolveKey(
  root: string,
  override: string | undefined,
  fallback: string,
  label: string,
): string {
  if (override === undefined) return fallback;
  return within(root, override, label);
}

/** Resolve `p` (relative-to-root or absolute) and assert it stays within `root`. */
function within(root: string, p: string, label: string): string {
  const abs = isAbsolute(p) ? p : resolvePath(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new InstallationError(
      'escape',
      `stackctl config: '${label}' (${p}) escapes the installation root ${root} (FR-024)`,
    );
  }
  return abs;
}

function assertNoCollision(resolved: ResolvedPaths): void {
  const seen = new Map<string, string>();
  // Iterate the resolved object itself (not the SCAFFOLDED key set) so every
  // resolvable key — including the resolve-only session-skills keys — is
  // collision-checked, while only the scaffolded set drives setup's write order.
  for (const [key, p] of Object.entries(resolved)) {
    const prior = seen.get(p);
    if (prior !== undefined) {
      throw new InstallationError(
        'collision',
        `stackctl config: keys '${key}' and '${prior}' both resolve to ${p} (FR-024)`,
      );
    }
    seen.set(p, key);
  }
}
