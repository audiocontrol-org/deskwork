/**
 * Studio version surfacing (#111).
 *
 * Reads the studio's own package.json via `import.meta.url` so the
 * version is always whatever was published / built — no env-var
 * juggling, works for source-loaded plugin paths AND cache-installed
 * paths. Memoized: read once at module load, reuse across requests.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let memoized: string | undefined;

export function getStudioVersion(): string {
  if (memoized !== undefined) return memoized;
  // Source layout: packages/studio/dist/lib/version.js → ../.. = packages/studio/
  // tsx-from-source layout: packages/studio/src/lib/version.ts → ../.. = packages/studio/
  const here = fileURLToPath(import.meta.url);
  const pkgPath = resolve(dirname(here), '..', '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    memoized = pkg.version ?? 'unknown';
  } catch {
    memoized = 'unknown';
  }
  return memoized;
}
