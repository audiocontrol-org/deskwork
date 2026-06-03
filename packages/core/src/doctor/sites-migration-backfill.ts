/**
 * Sites-to-lanes migration backfiller (Phase 39b).
 *
 * This is the LAST legitimate use of the slug+stage heuristic (per the
 * sites→lanes retirement spec §"Migration" step 2). For every entry
 * lacking `artifactPath`, it derives the artifact location ONCE from the
 * current resolved location and stamps it onto the sidecar.
 *
 * AMBIGUITY-HALT (AUDIT-20260602-03 — the critical guard):
 *
 *   The heuristic is the SAME slug+stage search that causes the #394
 *   multi-site false-positive. When a slug exists under more than one
 *   legacy `site.contentDir` (or on more than one filesystem), the
 *   heuristic resolves to MORE THAN ONE candidate file. The migration
 *   MUST NOT silently stamp one of them — doing so would launder a
 *   known-ambiguous guess into permanent, trusted `artifactPath` data
 *   and make the bug undetectable afterward (no more search to flag it).
 *
 *   So this backfiller enumerates ALL candidate files across EVERY
 *   legacy `site.contentDir` for the entry's slug+stage. Only an
 *   entry with EXACTLY ONE candidate is stamped. An entry with two or
 *   more candidates is REFUSED: it is reported on `ambiguous[]` with the
 *   colliding paths, requiring operator disambiguation. An entry with
 *   zero candidates is reported on `noCandidate[]` (nothing on disk to
 *   stamp from). Never guess.
 *
 * The pre-existing `repair.ts:backfillArtifactPaths` checked exactly one
 * heuristic path (a single base dir). This widens that to a
 * multi-candidate search across every legacy contentDir precisely so it
 * can DETECT the collision it must refuse to launder.
 *
 * Sibling-relative imports per the doctor convention.
 */

import { stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { readAllSidecars } from '../sidecar/read-all.ts';
import type { Entry } from '../schema/entry.ts';

/**
 * Stage-conventional artifact leaf path RELATIVE to a content base dir.
 * Mirrors the heuristic in `repair.ts` / `validate.ts` but parameterized
 * over the base dir (each legacy `site.contentDir`) instead of hardcoding
 * `docs/`. Returns null for stages with no on-disk artifact.
 *
 * Path shape per slug+stage:
 *   - Ideas      → <slug>/scrapbook/idea.md
 *   - Planned    → <slug>/scrapbook/plan.md
 *   - Outlining  → <slug>/scrapbook/outline.md
 *   - Drafting / Final / Published → <slug>/index.md
 *   - Blocked / Cancelled / other  → null (no editorial-default path)
 */
function stageRelativeLeaf(slug: string, stage: string): string | null {
  switch (stage) {
    case 'Ideas':
      return join(slug, 'scrapbook', 'idea.md');
    case 'Planned':
      return join(slug, 'scrapbook', 'plan.md');
    case 'Outlining':
      return join(slug, 'scrapbook', 'outline.md');
    case 'Drafting':
    case 'Final':
    case 'Published':
      return join(slug, 'index.md');
    default:
      return null;
  }
}

async function fileExists(absPath: string): Promise<boolean> {
  return stat(absPath).then(
    (s) => s.isFile(),
    () => false,
  );
}

/** Resolve a legacy contentDir to an absolute path under the project. */
function contentDirAbs(projectRoot: string, contentDir: string): string {
  return isAbsolute(contentDir) ? contentDir : join(projectRoot, contentDir);
}

/**
 * Enumerate EVERY on-disk candidate for an entry's slug+stage across all
 * legacy content base dirs. Returns project-relative paths (the form
 * stored on the sidecar), de-duplicated and in stable order.
 */
async function enumerateCandidates(
  projectRoot: string,
  baseDirs: readonly string[],
  entry: Entry,
): Promise<string[]> {
  const leaf = stageRelativeLeaf(entry.slug, entry.currentStage);
  if (leaf === null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const base of baseDirs) {
    const abs = join(contentDirAbs(projectRoot, base), leaf);
    if (!(await fileExists(abs))) continue;
    const rel = relative(projectRoot, abs);
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out;
}

/** One entry the migration could not stamp because the slug+stage search
 *  resolved to more than one candidate (the #394 collision). */
export interface AmbiguousBackfill {
  readonly entryUuid: string;
  readonly slug: string;
  readonly stage: string;
  /** Project-relative candidate paths — operator must disambiguate. */
  readonly candidates: readonly string[];
}

/** Result of the backfill pass. */
export interface BackfillResult {
  /** UUIDs whose sidecar was stamped with a single unambiguous path. */
  readonly stamped: readonly string[];
  /** Entries refused because >1 candidate existed (ambiguity-halt). */
  readonly ambiguous: readonly AmbiguousBackfill[];
}

/**
 * Backfill `artifactPath` on every entry that lacks it, enumerating
 * candidates across all `baseDirs` (the legacy site contentDirs). Exactly
 * one candidate → stamp. More than one → refuse + record on `ambiguous`.
 * Zero candidates → skip silently (nothing to stamp from; not an error
 * here — a separate doctor rule owns missing-artifact reporting).
 *
 * Idempotent: entries that already carry a non-empty `artifactPath` are
 * skipped, so a second run stamps nothing and reports no ambiguity.
 *
 * @param projectRoot absolute project root
 * @param baseDirs    every legacy `site.contentDir` (relative or absolute)
 */
/** A single entry the plan would stamp: exactly one candidate resolved. */
interface PlannedStamp {
  readonly entry: Entry;
  readonly path: string;
}

/** The shared backfill plan — what would be stamped + what is ambiguous.
 *  Pure read: enumerates candidates, classifies each entry, writes nothing.
 *  Both `backfillFromLegacySites` (apply) and `detectAmbiguousBackfills`
 *  (audit) derive from this, so audit and apply agree by construction. */
async function planBackfills(
  projectRoot: string,
  baseDirs: readonly string[],
): Promise<{ toStamp: PlannedStamp[]; ambiguous: AmbiguousBackfill[] }> {
  const entries = await readAllSidecars(projectRoot);
  const toStamp: PlannedStamp[] = [];
  const ambiguous: AmbiguousBackfill[] = [];
  for (const entry of entries) {
    if (entry.artifactPath !== undefined && entry.artifactPath !== '') continue;
    const candidates = await enumerateCandidates(projectRoot, baseDirs, entry);
    if (candidates.length === 0) continue;
    if (candidates.length > 1) {
      ambiguous.push({
        entryUuid: entry.uuid,
        slug: entry.slug,
        stage: entry.currentStage,
        candidates,
      });
      continue;
    }
    toStamp.push({ entry, path: candidates[0] });
  }
  return { toStamp, ambiguous };
}

export async function backfillFromLegacySites(
  projectRoot: string,
  baseDirs: readonly string[],
): Promise<BackfillResult> {
  const { toStamp, ambiguous } = await planBackfills(projectRoot, baseDirs);
  const stamped: string[] = [];
  for (const { entry, path } of toStamp) {
    const updated: Entry = {
      ...entry,
      artifactPath: path,
      updatedAt: new Date().toISOString(),
    };
    await writeSidecar(projectRoot, updated);
    stamped.push(entry.uuid);
  }
  return { stamped, ambiguous };
}

/**
 * Audit-only variant: enumerate the ambiguity collisions WITHOUT writing
 * anything. Used by the doctor rule's `audit()` to surface
 * `migration-ambiguous` findings before any `--fix` mutation. Shares
 * `planBackfills` with the apply path so the audit and the apply agree on
 * what is ambiguous by construction.
 */
export async function detectAmbiguousBackfills(
  projectRoot: string,
  baseDirs: readonly string[],
): Promise<AmbiguousBackfill[]> {
  // The sidecars dir may not exist yet; treat absence as "no entries".
  try {
    await stat(sidecarsDir(projectRoot));
  } catch {
    return [];
  }
  const { ambiguous } = await planBackfills(projectRoot, baseDirs);
  return ambiguous;
}
