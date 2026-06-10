// Shared per-codebase baseline-path resolution (010). The dw-lifecycle verbs
// each defaulted the clones baseline to `.dw-lifecycle/scope-discovery/clones.yaml`
// relative to `process.cwd()`. In stack-control the baseline is PER-CODEBASE:
// it lives under the resolved nearest-enclosing installation root, so every
// disposition/refresh/check verb agrees on "which codebase's baseline" the same
// way the detector does. One resolver, one answer (R1/R5).

import { resolve } from 'node:path';
import { resolveCodebaseBoundary } from './codebase-boundary.js';

/** Per-codebase baseline, relative to the resolved installation root. */
export const DEFAULT_BASELINE_REL = '.stack-control/scope-discovery/clones.yaml';

/**
 * Resolve the absolute clones-baseline path for the codebase enclosing
 * `startDir`. An explicit `override` (from `--baseline`) wins and is resolved
 * relative to the installation root. Fails loud (no cwd fallback) when no
 * installation encloses `startDir`.
 */
export function resolveBaselinePath(opts: {
  readonly startDir: string;
  readonly override?: string | null;
  readonly explicitRoot?: string | null;
}): string {
  const boundary = resolveCodebaseBoundary({
    startDir: opts.startDir,
    explicitRoot: opts.explicitRoot ?? null,
  });
  return resolve(boundary.installationRoot, opts.override ?? DEFAULT_BASELINE_REL);
}
