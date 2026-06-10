// Shared resolution of the backlog root — the dir whose `backlog/` tree the
// `backlog` binary operates on. Used by the `backlog` verb (capture/list/import)
// and the rewired `slush-findings` verb so both agree on where the pile lives.
//
// 009 T017: resolves through the installation config. The STACKCTL_BACKLOG_DIR
// seam wins (test seam / operator override); otherwise the enclosing
// installation's resolved backlog store determines the root — the root is the
// store dir's PARENT, because the `backlog` binary hardcodes the `backlog/`
// subdir under its cwd. Outside any installation with no seam, resolveInstallation
// fails loud directing to `stackctl setup` (no bundled fallback — Principle V / D8).

import { dirname } from 'node:path';
import { resolveInstallation } from '../config/installation.js';

export function backlogRoot(): string {
  const seam = process.env.STACKCTL_BACKLOG_DIR;
  if (seam !== undefined && seam !== '') return seam;
  const inst = resolveInstallation(process.cwd());
  return dirname(inst.resolved.backlog);
}
