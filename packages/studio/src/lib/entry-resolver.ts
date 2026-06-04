/**
 * Resolve an entry uuid to its sidecar + on-disk artifact body. Studio
 * handlers use this when they need both metadata (from the sidecar) and
 * the live document content (from the markdown artifact on disk).
 *
 * Issue #222 (Option B + hybrid refinement) — `index.md` is always
 * "the document under review" for index.md-canonical entries. The
 * studio renders `index.md` regardless of `currentStage`. Per-stage
 * scrapbook files are frozen snapshots produced by `approveEntryStage`.
 *
 * Resolution (Phase 39d — sites→lanes retirement; STORED PATH ONLY):
 *   The sidecar's `artifactPath` is authoritative. There is NO
 *   `<contentDir>/<slug>/index.md` fallback — per the spec
 *   §"Resolution" and the project's "no fallbacks — throw" rule, an
 *   entry without a stored path THROWS a descriptive error pointing the
 *   operator at `deskwork doctor --fix` (the migration backfiller owns
 *   stamping it). Given a stored path, the resolver prefers
 *   `<dirname(artifactPath)>/index.md` when it exists on disk (T1's
 *   index.md-canonical case) and otherwise reads `artifactPath` itself
 *   (shared-directory layouts — e.g. deskwork's own feature-doc layout
 *   where prd.md / workplan.md / README.md share a directory). That is a
 *   read-side refinement OF a stored path, not a guess for an absent one.
 *
 * Pre-T1 the resolver routed by stage (Ideas → idea.md, Planned →
 * plan.md, Outlining → outline.md, Drafting/Final/Published →
 * index.md). That routing has been retired — see Issue #222.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readSidecar } from '@deskwork/core/sidecar';
import { resolveArtifactPathOrThrow } from '@deskwork/core/entry/resolve-artifact';
import type { Entry } from '@deskwork/core/schema/entry';

interface ResolveResult {
  entry: Entry;
  artifactBody: string;
  artifactPath: string;
}

/**
 * Resolve the canonical document path for an entry. Used by both the
 * read path (`resolveEntry`) and the write path (the Save route's
 * `writeEntryBody`) so both surfaces address the same file.
 *
 * Exported so the Save route (#174) can resolve the write target with
 * the SAME rules the read path uses; duplicating the resolution
 * silently couples the surfaces to two different code paths and lets
 * them drift.
 */
export function resolveIndexPath(projectRoot: string, entry: Entry): string {
  // Phase 39c-2b(a): the resolve-stored-path + throw-on-absent + index.md
  // refinement now lives in the shared core helper so the CLI verbs
  // (publish / iterate longform) resolve identically — see
  // `@deskwork/core/entry/resolve-artifact#resolveArtifactPathOrThrow`.
  return resolveArtifactPathOrThrow(entry, projectRoot);
}

export async function resolveEntry(projectRoot: string, uuid: string): Promise<ResolveResult> {
  const entry = await readSidecar(projectRoot, uuid);
  const artifactPath = resolveIndexPath(projectRoot, entry);
  const artifactBody = await readFile(artifactPath, 'utf8');
  return { entry, artifactBody, artifactPath };
}

/**
 * Atomically write `markdown` to the entry's canonical document path.
 *
 * Implements the Save semantics from issue #174 — the studio is the
 * dumb file-write surface for in-browser edits. State-machine work
 * (versioning, journal records, in-review flips) belongs to
 * `/deskwork:iterate`, NOT to this function. Save and Iterate are
 * orthogonal: an operator can Save many times before pinning a version.
 *
 * Atomic-write pattern (write-tmp + rename) mirrors `writeSidecar` and
 * the snapshot helper. PID is embedded in the tmp filename so two
 * concurrent writers don't clobber each other's tmp state.
 *
 * Returns the absolute path written so the caller can surface it to
 * the operator (the Save route uses this for the response body).
 */
export async function writeEntryBody(
  projectRoot: string,
  uuid: string,
  markdown: string,
): Promise<{ writtenPath: string }> {
  const entry = await readSidecar(projectRoot, uuid);
  const writtenPath = resolveIndexPath(projectRoot, entry);
  await mkdir(dirname(writtenPath), { recursive: true });
  const tmpPath = `${writtenPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, markdown);
  await rename(tmpPath, writtenPath);
  return { writtenPath };
}
