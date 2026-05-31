/**
 * plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts
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
 * directories. Not semver-correct (`0.10.0` < `0.9.0` in lex order),
 * but a workable default until semver-aware sort lands.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ResolveFeatureRootArgs {
  /** The absolute path of the project's `docs/` directory. */
  readonly docsRoot: string;
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
  if (!existsSync(args.docsRoot)) {
    return { root: undefined, versionsChecked: [] };
  }
  let topEntries: ReadonlyArray<string>;
  try {
    topEntries = [...(await readdir(args.docsRoot))].sort().reverse();
  } catch {
    return { root: undefined, versionsChecked: [] };
  }
  const versionsChecked: string[] = [];
  for (const version of topEntries) {
    const inProgress = join(args.docsRoot, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    versionsChecked.push(version);
    const featureDir = join(inProgress, args.slug);
    if (existsSync(featureDir)) {
      return { root: featureDir, versionsChecked };
    }
  }
  return { root: undefined, versionsChecked };
}
