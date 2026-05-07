/**
 * Bridge package version, surfaced via the discovery descriptor.
 *
 * Reads `@deskwork/bridge`'s own `package.json` via `import.meta.url`
 * so the value is always whatever was published / built. Memoized — the
 * descriptor write happens once per sidecar boot, but tests may call
 * this repeatedly.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let memoized: string | undefined;

export function getBridgeVersion(): string {
  if (memoized !== undefined) return memoized;
  // Source layout: packages/bridge/src/version.ts → ../.. = packages/bridge/
  // Built layout:  packages/bridge/dist/version.js → ../..  = packages/bridge/
  const here = fileURLToPath(import.meta.url);
  const pkgPath = resolve(dirname(here), '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      version?: string;
    };
    memoized = pkg.version ?? 'unknown';
  } catch {
    memoized = 'unknown';
  }
  return memoized;
}
