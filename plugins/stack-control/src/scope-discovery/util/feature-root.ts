/**
 * plugins/stack-control/src/scope-discovery/util/feature-root.ts
 *
 * Per AUDIT-20260530-15: the docs/<version>/001-IN-PROGRESS/<slug>/
 * walker used to live as two byte-for-byte identical copies — one in
 * workplan-aware-gate.ts (`findFeatureRoot`) and one in
 * audit-barrage-lift.ts (`resolveFeatureRoot`). AUDIT-06 (split-brain
 * determinism), AUDIT-08 (lex-greatest version pick), and AUDIT-12
 * (canonicalization gap) each had to patch both copies in lockstep.
 * Cross-model agreement on round 3 (claude×2 + codex×2) called this
 * structural: the next maintainer who improves one and forgets the
 * other re-introduces the divergence. Extracting one helper closes
 * the *class* of bug.
 *
 * The helper returns both the resolved feature root AND the list of
 * version directories that were considered. The gate's
 * FeatureRootNotFoundError uses the version list in its error
 * message; the lift just checks `root === undefined`.
 *
 * Lex-greatest sort (descending) is the AUDIT-06+AUDIT-08 contract:
 * with `docs/1.0/`, `docs/0.19.0/`, `docs/0.x/`, the walker picks
 * `1.0` — the active version, biasing AWAY from archived
 * directories. Lex compares strings character-by-character, so
 * `0.10.0` < `0.9.0` because `'1' < '9'`: a project that ships a
 * `0.10.0` alongside a `0.9.0` resolves to `0.9.0`. The regression
 * test `feature-root.test.ts > 'picks lex-greatest, NOT semver-
 * greatest, when they diverge'` pins this contract: lex is the
 * specification, not a placeholder. Changing the sort changes the
 * contract; both the implementation AND the regression test must
 * change in lockstep.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ResolveFeatureRootArgs {
  /**
   * Either the absolute path of the project's `docs/` directory
   * (`docsRoot`), OR the project's repo root (the helper joins
   * `docs/` for you when `repoRoot` is supplied). Pass exactly one.
   * Per AUDIT-20260531-05: pre-fix both callers independently
   * constructed `join(repoRoot, 'docs')` — same DRY-extraction
   * pattern AUDIT-20260530-15 closed for the walker logic itself.
   */
  readonly docsRoot?: string;
  readonly repoRoot?: string;
  /** The feature slug (the leaf dir name under `001-IN-PROGRESS`). */
  readonly slug: string;
}

export interface ResolveFeatureRootResult {
  /**
   * The absolute path of the resolved feature root
   * (`<docsRoot>/<version>/001-IN-PROGRESS/<slug>`), or `undefined`
   * when the slug doesn't exist under any version with a
   * `001-IN-PROGRESS` subdirectory.
   */
  readonly root: string | undefined;
  /**
   * Lex-descending list of version directories the walker
   * considered (those that have a `001-IN-PROGRESS` subdir). Useful
   * for the gate's not-found error message.
   */
  readonly versionsChecked: readonly string[];
}

export async function resolveFeatureRoot(
  args: ResolveFeatureRootArgs,
): Promise<ResolveFeatureRootResult> {
  // Per AUDIT-20260531-05: accept either `docsRoot` (the legacy
  // shape, kept for the workplan-aware-gate's pre-extracted path)
  // OR `repoRoot` (the helper does the `join(repoRoot, 'docs')`
  // itself). Both call sites previously constructed the docs path
  // independently — moving that one line into the helper means the
  // resolution logic AND the path construction live in one place.
  const docsRoot =
    args.docsRoot ?? (args.repoRoot !== undefined ? join(args.repoRoot, 'docs') : undefined);
  if (docsRoot === undefined) {
    throw new Error(
      'resolveFeatureRoot: one of `docsRoot` or `repoRoot` must be supplied.',
    );
  }
  if (!existsSync(docsRoot)) {
    return { root: undefined, versionsChecked: [] };
  }
  let topEntries: ReadonlyArray<string>;
  try {
    topEntries = [...(await readdir(docsRoot))].sort().reverse();
  } catch {
    return { root: undefined, versionsChecked: [] };
  }
  const versionsChecked: string[] = [];
  for (const version of topEntries) {
    const inProgress = join(docsRoot, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    versionsChecked.push(version);
    const featureDir = join(inProgress, args.slug);
    if (existsSync(featureDir)) {
      return { root: featureDir, versionsChecked };
    }
  }
  return { root: undefined, versionsChecked };
}
