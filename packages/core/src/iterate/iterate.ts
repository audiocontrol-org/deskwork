import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { getContentDir } from '../config.ts';
import type { Entry, Stage } from '../schema/entry.ts';

interface IterateOptions {
  uuid: string;
  // Future: --dispositions <path>
}

interface IterateResult {
  entryId: string;
  stage: Stage;
  version: number;
  reviewState: 'in-review';
}

/**
 * Resolve the entry's "document under review" path. Per Issue #222 /
 * Option B + hybrid refinement, longform + outline iterate target a
 * single canonical file regardless of stage.
 *
 * Resolution order (T1 + non-index.md fallback):
 *   1. If the sidecar carries `artifactPath`:
 *      a. Prefer `<dirname(artifactPath)>/index.md` IF that file exists
 *         (T1's index.md-canonical case).
 *      b. Otherwise fall back to `artifactPath` itself. Supports
 *         shared-directory layouts (multiple entries per directory,
 *         each addressed by its own filename).
 *   2. No artifactPath: try `<contentDir>/<slug>/index.md` (legacy
 *      shape, pre-#140 entries the doctor migration hasn't processed).
 */
function resolveIndexPath(projectRoot: string, sidecar: Entry): string {
  if (sidecar.artifactPath) {
    const absArtifact = join(projectRoot, sidecar.artifactPath);
    // Strip the scrapbook segment for legacy `<dir>/scrapbook/<file>.md`
    // shapes; otherwise dirname(absArtifact) IS the doc dir.
    const dir =
      basename(dirname(absArtifact)) === 'scrapbook'
        ? dirname(dirname(absArtifact))
        : dirname(absArtifact);
    const indexPath = join(dir, 'index.md');
    if (existsSync(indexPath)) return indexPath;
    return absArtifact;
  }
  const contentDir = getContentDir(projectRoot);
  return join(contentDir, sidecar.slug, 'index.md');
}

export async function iterateEntry(projectRoot: string, opts: IterateOptions): Promise<IterateResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);

  if (sidecar.currentStage === 'Published') {
    throw new Error('Cannot iterate: Published entries are frozen.');
  }
  if (sidecar.currentStage === 'Blocked' || sidecar.currentStage === 'Cancelled') {
    throw new Error(`Cannot iterate: entry is ${sidecar.currentStage}; induct it back into the pipeline first.`);
  }

  // Issue #222 — single document evolves; always read/write index.md.
  // Per-stage files (idea.md / plan.md / outline.md) are scrapbook
  // snapshots produced by approve, not iterate's read target.
  const artifactPath = resolveIndexPath(projectRoot, sidecar);
  const markdown = await readFile(artifactPath, 'utf8');

  // Iteration is the operator's explicit "pin a new version" decision;
  // the core helper records what was asked, not what the helper thinks
  // counts as "real change." A real iteration can be motivated by
  // marginalia, scrapbook additions, decisions captured outside the
  // file body, or any reason the operator hasn't communicated to the
  // system. Gating on a content-diff check earlier here put a hard
  // error in front of the operator's review-surface Iterate button
  // when they had added marginalia but not edited the file body.
  // Removed (#188-followup): the orchestrating skill (`/deskwork:iterate`)
  // is the right place to decide whether the file needs editing first.

  const priorVersion = sidecar.iterationByStage[sidecar.currentStage] ?? 0;
  const newVersion = priorVersion + 1;

  const at = new Date().toISOString();

  // Emit journal event first; doctor reconciles drift if we crash mid-operation
  await appendJournalEvent(projectRoot, {
    kind: 'iteration',
    at,
    entryId: sidecar.uuid,
    stage: sidecar.currentStage,
    version: newVersion,
    markdown,
  });

  // Update sidecar
  const updated: Entry = {
    ...sidecar,
    iterationByStage: { ...sidecar.iterationByStage, [sidecar.currentStage]: newVersion },
    reviewState: 'in-review',
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);

  // Emit review-state-change if state actually changed
  if (sidecar.reviewState !== 'in-review') {
    await appendJournalEvent(projectRoot, {
      kind: 'review-state-change',
      at,
      entryId: sidecar.uuid,
      stage: sidecar.currentStage,
      from: sidecar.reviewState ?? null,
      to: 'in-review',
    });
  }

  return {
    entryId: sidecar.uuid,
    stage: sidecar.currentStage,
    version: newVersion,
    reviewState: 'in-review',
  };
}
