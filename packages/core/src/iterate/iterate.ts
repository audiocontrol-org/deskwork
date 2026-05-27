import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { getContentDir } from '../config.ts';
import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
import {
  assertStageInTemplate,
  isLockedStageInTemplate,
  isOffPipelineStageInTemplate,
  terminalLinearStage,
} from '../pipelines/helpers.ts';
import type { Entry } from '../schema/entry.ts';

interface IterateOptions {
  uuid: string;
  // Future: --dispositions <path>
}

interface IterateResult {
  entryId: string;
  /**
   * Per Phase 3 (graphical-entries) the sidecar's currentStage is now a
   * plain string. `stage` echoes the sidecar value untouched.
   */
  stage: string;
  version: number;
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

/**
 * Iterate an entry: read the document under review, append an
 * `iteration` journal event with the captured markdown, and bump the
 * per-stage iteration counter on the sidecar.
 *
 * Per Phase 4 (graphical-entries) iterate is lane-template-aware:
 *
 *   - Terminal linear stages (e.g. `Published`, `Shipped`) refuse —
 *     terminal content is frozen.
 *   - Off-pipeline stages (e.g. `Blocked`, `Cancelled`, `Archived`)
 *     refuse — induct first.
 *   - Locked stages (e.g. `Final`, `Approved`, `Edited`, `Reviewed`)
 *     refuse — pre-publication review-freeze; iterate would silently
 *     un-freeze content that should stay immutable until publish.
 *   - Unknown stages surface the template's allowed list.
 */
export async function iterateEntry(projectRoot: string, opts: IterateOptions): Promise<IterateResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
  const stage = sidecar.currentStage;

  assertStageInTemplate(template, stage, 'iterateEntry');

  const terminal = terminalLinearStage(template);
  if (stage === terminal) {
    throw new Error(
      `Cannot iterate: entry is at terminal stage "${stage}" of pipeline "${template.id}"; ` +
        `terminal-stage content is frozen.`,
    );
  }
  if (isOffPipelineStageInTemplate(template, stage)) {
    throw new Error(
      `Cannot iterate: entry is ${stage} (off-pipeline); induct it back into the pipeline first.`,
    );
  }
  if (isLockedStageInTemplate(template, stage)) {
    throw new Error(
      `Cannot iterate: entry is at locked stage "${stage}" of pipeline "${template.id}"; ` +
        `the locked stage is the pre-publication review-freeze. Use \`induct\` to return ` +
        `the entry to an earlier linear stage if further iteration is needed.`,
    );
  }

  // Issue #222 — single document evolves; always read/write index.md.
  // Per-stage files (idea.md / plan.md / outline.md) are scrapbook
  // snapshots produced by approve, not iterate's read target.
  const artifactPath = resolveIndexPath(projectRoot, sidecar);
  const markdown = await readFile(artifactPath, 'utf8');

  const priorVersion = sidecar.iterationByStage[stage] ?? 0;
  const newVersion = priorVersion + 1;

  const at = new Date().toISOString();

  // Emit journal event first; doctor reconciles drift if we crash mid-operation
  await appendJournalEvent(projectRoot, {
    kind: 'iteration',
    at,
    entryId: sidecar.uuid,
    stage,
    version: newVersion,
    markdown,
  });

  // Update sidecar. Per DESKWORK-STATE-MACHINE.md (Commandment III),
  // `reviewState` is RETIRED — the schema field is gone. zod's
  // non-strict read drops vestigial keys from legacy on-disk sidecars
  // automatically, so no destructure is needed here.
  const updated: Entry = {
    ...sidecar,
    iterationByStage: { ...sidecar.iterationByStage, [stage]: newVersion },
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);

  return {
    entryId: sidecar.uuid,
    stage,
    version: newVersion,
  };
}
