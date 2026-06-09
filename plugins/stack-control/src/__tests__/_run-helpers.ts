// Shared test helpers (not a *.test.ts, so vitest does not collect it).
//
// resolveTsx walks up from the plugin root looking for node_modules/.bin/tsx,
// mirroring bin/stackctl's find_tsx — so the tests and the shim agree on where
// tsx lives whether npm hoisted it to the monorepo root OR nested it
// plugin-local (AUDIT-20260605-03). A hardcoded N-levels-up path breaks with an
// opaque ENOENT the moment npm nests the dep, which it demonstrably does for
// this workspace.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = resolve(here, '..', '..');
export const CLI = resolve(PLUGIN_ROOT, 'src', 'cli.ts');

export function resolveTsx(): string {
  let cur = PLUGIN_ROOT;
  for (;;) {
    const candidate = join(cur, 'node_modules', '.bin', 'tsx');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(
    `resolveTsx: could not locate node_modules/.bin/tsx by walking up from ${PLUGIN_ROOT}`,
  );
}

export function runCli(
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): SpawnSyncReturns<string> {
  return spawnSync(resolveTsx(), [CLI, ...args], {
    encoding: 'utf8',
    cwd: opts?.cwd,
    // Merge over the inherited env when provided (e.g. STACKCTL_BACKLOG_DIR);
    // undefined → spawnSync inherits process.env unchanged (existing callers).
    env: opts?.env ? { ...process.env, ...opts.env } : undefined,
  });
}
