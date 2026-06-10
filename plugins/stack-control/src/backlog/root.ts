// Shared resolution of the backlog root — the dir whose `backlog/` tree the
// `backlog` binary operates on. The `backlog` verb (capture/list/import) resolves
// via `ensureBacklogProject` (backlog.ts), which builds on the shared
// `resolveInstallationBacklog` derivation here; the `slush-findings` verb uses
// `backlogRoot()`. Both bottom out on the SAME store→root derivation, so they
// cannot silently diverge on where the pile lives.
//
// 009 T017: resolves through the installation config. The STACKCTL_BACKLOG_DIR
// seam wins (test seam / operator override); otherwise the enclosing
// installation's resolved backlog store determines the root — the root is the
// store dir's PARENT, because the `backlog` binary hardcodes the `backlog/`
// subdir under its cwd. Outside any installation with no seam, resolveInstallation
// fails loud directing to `stackctl setup` (no bundled fallback — Principle V / D8).

import { dirname } from 'node:path';
import { resolveInstallation } from '../config/installation.js';
import type { ResolvedPaths } from '../config/types.js';

/** The single derivation of "installation backlog store → root" for the non-seam
 * path. Resolves the enclosing installation ONCE and exposes the resolved backlog
 * store dir, the root (the store dir's parent, where the `backlog` binary runs),
 * and the full resolved-paths map (needed by `ensureBacklogProject` to scaffold a
 * missing store). Throws via resolveInstallation when outside any installation. */
export function resolveInstallationBacklog(): {
  storeDir: string;
  root: string;
  resolved: ResolvedPaths;
} {
  const inst = resolveInstallation(process.cwd());
  const storeDir = inst.resolved.backlog;
  return { storeDir, root: dirname(storeDir), resolved: inst.resolved };
}

export function backlogRoot(): string {
  const seam = process.env.STACKCTL_BACKLOG_DIR;
  if (seam !== undefined && seam !== '') return seam;
  return resolveInstallationBacklog().root;
}
