// The SCAFFOLDED managed working-file set as a typed constant (009) — the keys
// `setup` writes, in config-first order (config creates .stack-control before the
// rest). Drives scaffold write-order (scaffold.ts MANAGED_KEYS). NOT every
// resolvable key: session-skills' journal/toolingFeedback/cloneScope are resolved
// (resolve-paths) but NOT scaffolded — they are operation-products session-end
// creates lazily, and cloneScope is a scope pointer (a dir), nothing to scaffold
// (see types.ts § managed set). The collision check iterates the resolved object
// itself, so those keys are still validated without being scaffolded.

import type { ScaffoldedKey } from './types.js';

export const WORKING_FILE_KEYS: readonly ScaffoldedKey[] = [
  'config',
  'roadmap',
  'inbox',
  'backlog',
  'auditLog',
];
