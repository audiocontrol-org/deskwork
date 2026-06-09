// Shared resolution of the backlog root — the dir whose `backlog/` tree the
// `backlog` binary operates on. Used by the `backlog` verb (capture/list/import)
// and the rewired `slush-findings` verb so both agree on where the pile lives.
// Defaults to the plugin-bundled root (the in-repo dogfood, mirroring inbox/
// roadmap defaulting to the bundled doc); `STACKCTL_BACKLOG_DIR` overrides it —
// the test seam, and the adopter override until project-relative discovery lands.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function backlogRoot(): string {
  return process.env.STACKCTL_BACKLOG_DIR ?? resolve(here, '..', '..');
}
