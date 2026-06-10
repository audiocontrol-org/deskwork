// The managed working-file set as a typed constant (009) — the single source of
// truth for "which keys an installation scaffolds + resolves", config-first
// (scaffold order: config creates .stack-control before the rest). Sharing this
// list across resolve-paths (collision iteration) and scaffold (write order)
// avoids a duplicated key-list and lets us iterate WorkingFileKey without an
// `as` cast.

import type { WorkingFileKey } from './types.js';

export const WORKING_FILE_KEYS: readonly WorkingFileKey[] = [
  'config',
  'roadmap',
  'inbox',
  'backlog',
  'auditLog',
];
