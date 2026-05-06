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
 * Resolution order (T1 + non-index.md fallback):
 *   1. If the sidecar carries an `artifactPath`:
 *      a. Prefer `<dirname(artifactPath)>/index.md` IF it exists on disk
 *         (T1's index.md-canonical case).
 *      b. Otherwise fall back to `artifactPath` itself. Supports
 *         shared-directory layouts (multiple entries per directory,
 *         each addressed by its own filename) — e.g. deskwork's own
 *         feature-doc layout where prd.md / workplan.md / README.md
 *         share a directory.
 *   2. No artifactPath: try `<contentDir>/<slug>/index.md` (pre-#140
 *      entries that the doctor migration hasn't processed yet).
 *
 * Pre-T1 the resolver routed by stage (Ideas → idea.md, Planned →
 * plan.md, Outlining → outline.md, Drafting/Final/Published →
 * index.md). That routing has been retired — see Issue #222.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readSidecar } from '@deskwork/core/sidecar';
import { getContentDir } from '@deskwork/core/config';
import type { Entry } from '@deskwork/core/schema/entry';

interface ResolveResult {
  entry: Entry;
  artifactBody: string;
  artifactPath: string;
}

function resolveIndexPath(projectRoot: string, entry: Entry): string {
  if (entry.artifactPath) {
    const absArtifact = join(projectRoot, entry.artifactPath);
    // Strip the scrapbook segment for legacy `<dir>/scrapbook/<file>.md`
    // shapes; otherwise dirname(absArtifact) IS the doc dir.
    const dir =
      basename(dirname(absArtifact)) === 'scrapbook'
        ? dirname(dirname(absArtifact))
        : dirname(absArtifact);
    const indexPath = join(dir, 'index.md');
    // T1's index.md-canonical preference: only if it actually exists.
    // Otherwise fall back to artifactPath (shared-directory layouts).
    if (existsSync(indexPath)) return indexPath;
    return absArtifact;
  }
  const contentDir = getContentDir(projectRoot);
  return join(contentDir, entry.slug, 'index.md');
}

export async function resolveEntry(projectRoot: string, uuid: string): Promise<ResolveResult> {
  const entry = await readSidecar(projectRoot, uuid);
  const artifactPath = resolveIndexPath(projectRoot, entry);
  const artifactBody = await readFile(artifactPath, 'utf8');
  return { entry, artifactBody, artifactPath };
}
