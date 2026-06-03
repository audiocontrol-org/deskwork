/**
 * Stored-path-only entry artifact resolution (Phase 39a — additive).
 *
 * Per the sites→lanes retirement (`docs/superpowers/specs/2026-06-02-
 * sites-to-lanes-retirement-design.md` §"Resolution"), location is a
 * property of the ENTRY: `entry.artifactPath` is authoritative. This
 * helper is the stored-path-only resolver — it consults ONLY the stored
 * path and NEVER the legacy slug+stage heuristic.
 *
 * Phase sequencing (39a is ADD-ONLY):
 *   - 39a (here): introduce the function. It coexists with the existing
 *     `?? heuristic` resolution in `doctor/validate.ts`; no caller is
 *     flipped to use it yet.
 *   - 39d: flips the existing resolvers to stored-path-only and makes a
 *     missing `artifactPath` THROW. This helper deliberately returns
 *     `null` (not a throw) for the absent case — throwing is 39d's job.
 */

import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Entry } from '../schema/entry.ts';

/**
 * Resolve an entry's on-disk artifact path from its STORED `artifactPath`
 * only.
 *
 * @param sidecar    the entry sidecar (the SSOT — see Phase 30)
 * @param projectRoot absolute project root the relative path resolves against
 * @returns `join(projectRoot, sidecar.artifactPath)` when `artifactPath`
 *          is present; `null` when it is absent.
 *
 * This function NEVER consults the slug+stage heuristic and NEVER throws.
 * A missing `artifactPath` yields `null` here; the throw-on-missing
 * contract that makes the field authoritative-in-practice lands in 39d.
 */
export function resolveStoredArtifactPath(
  sidecar: Entry,
  projectRoot: string,
): string | null {
  if (sidecar.artifactPath === undefined) {
    return null;
  }
  return join(projectRoot, sidecar.artifactPath);
}

/**
 * Read-side refinement of an already-resolved STORED artifact path to the
 * canonical "document under review" file (Issue #222 / T1).
 *
 * Both the core iterate verb and the studio entry-resolver address the
 * same document, so this refinement is shared (it was duplicated in
 * `iterate.ts` and `entry-resolver.ts` until Phase 39d factored it here).
 *
 *   - For a legacy `<dir>/scrapbook/<file>.md` shape, the doc dir is the
 *     parent of `scrapbook/`; otherwise it is the artifact's own dir.
 *   - Prefer `<docDir>/index.md` IFF it exists on disk (the index.md-
 *     canonical case). Otherwise read the artifact path itself — supports
 *     shared-directory layouts (multiple entries per directory, each
 *     addressed by its own filename, e.g. prd.md / workplan.md / README.md).
 *
 * This refines a path the caller already resolved from the stored
 * `artifactPath`; it is NOT a guess for an absent path. The caller is
 * responsible for the throw-on-absent contract before calling this.
 *
 * @param absArtifact absolute artifact path (from `resolveStoredArtifactPath`)
 * @returns the absolute canonical document path to read/write
 */
export function refineToIndexDoc(absArtifact: string): string {
  const dir =
    basename(dirname(absArtifact)) === 'scrapbook'
      ? dirname(dirname(absArtifact))
      : dirname(absArtifact);
  const indexPath = join(dir, 'index.md');
  if (existsSync(indexPath)) return indexPath;
  return absArtifact;
}
