// Per-codebase registry + scan-root resolution shared by the registry-driven
// check verbs (010 / US4): check-anti-patterns, check-adopters,
// check-module-symmetry, check-deprecations.
//
// The dw-lifecycle originals each defaulted their registry to a literal
// `.dw-lifecycle/scope-discovery/<name>.yaml` relative to `process.cwd()`, and
// scanned from a literal `.`/`src` cwd-relative root. That is the seam this
// module generalizes: when no `--registry`/`--root` override is supplied, the
// default is resolved PER-CODEBASE against the nearest-enclosing stack-control
// installation (009's walk-up via `resolveCodebaseBoundary`), so each verb
// scans the codebase it is run inside — never the whole repo, never a stale
// `.dw-lifecycle` path. Resolution fails loud (no cwd / whole-repo fallback)
// when `startDir` is not inside an installation. The override still wins and is
// resolved relative to the installation root (matching the clone verb's
// `--baseline` contract).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveCodebaseBoundary } from './codebase-boundary.js';

/** Per-codebase scope-discovery config directory, relative to the installation root. */
export const SCOPE_DISCOVERY_REL = '.stack-control/scope-discovery';

export interface ResolvedScope {
  /** Absolute installation root the scan is scoped to. */
  readonly installationRoot: string;
  /** Absolute path to the resolved registry/artifact file. */
  readonly registryPath: string;
  /** Absolute scan root (== installationRoot unless `--root` overrides it). */
  readonly scanRoot: string;
  /** Whether the resolved registry file exists on disk right now. */
  readonly registryExists: boolean;
  /** True when no `--registry` override was supplied (the default path is in use). */
  readonly registryIsDefault: boolean;
}

/**
 * Resolve the absolute registry path + scan root for a registry-driven check.
 *
 * - `registryOverride` (from `--registry`) wins, resolved relative to the
 *   installation root.
 * - `rootOverride` (from `--root`) sets BOTH the scan boundary and the scan
 *   root verbatim (recorded as `explicitOverride` by the boundary resolver).
 * - With neither override, the registry defaults to
 *   `<installationRoot>/.stack-control/scope-discovery/<defaultRegistryName>`
 *   and the scan root to `installationRoot`.
 *
 * `startDir` is the cwd the verb was invoked from (injectable for tests).
 */
export function resolveCheckScope(opts: {
  readonly startDir: string;
  readonly defaultRegistryName: string;
  readonly registryOverride?: string | null;
  readonly rootOverride?: string | null;
}): ResolvedScope {
  const boundary = resolveCodebaseBoundary({
    startDir: opts.startDir,
    explicitRoot: opts.rootOverride ?? null,
  });
  const defaultRel = `${SCOPE_DISCOVERY_REL}/${opts.defaultRegistryName}`;
  const registryIsDefault =
    opts.registryOverride === undefined || opts.registryOverride === null;
  const registryPath = resolve(
    boundary.installationRoot,
    opts.registryOverride ?? defaultRel,
  );
  return {
    installationRoot: boundary.installationRoot,
    registryPath,
    scanRoot: boundary.installationRoot,
    registryExists: existsSync(registryPath),
    registryIsDefault,
  };
}
