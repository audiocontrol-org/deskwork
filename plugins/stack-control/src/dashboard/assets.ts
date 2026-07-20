// Dashboard static-asset access. Zero-build: the client is authored as plain
// files under ./assets and read at request time. stack-control runs via tsx over
// `src/`, so these ship as part of `src/` and are readable in a real install (no
// dist-copy step needed). Resolution is relative to THIS module's URL.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The named assets the dashboard serves — an EXACT allowlist. */
export type DashboardAssetName = 'index.html' | 'app.js' | 'styles.css';

const CONTENT_TYPES: Readonly<Record<DashboardAssetName, string>> = {
  'index.html': 'text/html; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
};

export function contentTypeFor(name: DashboardAssetName): string {
  return CONTENT_TYPES[name];
}

/** Read a named dashboard asset from ./assets. Throws if the file is missing —
 * a missing asset is a packaging defect, surfaced loud, never a silent fallback. */
export function readDashboardAsset(name: DashboardAssetName): string {
  const path = fileURLToPath(new URL(`./assets/${name}`, import.meta.url));
  return readFileSync(path, 'utf8');
}
