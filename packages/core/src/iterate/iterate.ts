import { readFile } from 'node:fs/promises';
import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { resolveArtifactPathOrThrow } from '../entry/resolve-artifact.ts';
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
 * Resolution (Phase 39d — sites→lanes retirement; STORED PATH ONLY):
 *   The sidecar's `artifactPath` is authoritative. There is NO
 *   `<contentDir>/<slug>/index.md` fallback — per the spec §"Resolution"
 *   and the project's "no fallbacks — throw" rule, an entry without a
 *   stored path resolves to a descriptive THROW pointing the operator at
 *   `deskwork doctor --fix` (the migration backfiller, 39b, owns
 *   stamping it). Guessing a phantom path is exactly the location-as-key
 *   disease this retirement removes.
 *
 *   Given a stored path, this still prefers `<dirname>/index.md` when it
 *   exists on disk (T1's index.md-canonical case) and otherwise reads the
 *   stored path itself (shared-directory layouts, e.g. deskwork's own
 *   prd.md / workplan.md / README.md sharing a directory). That is a
 *   read-side refinement OF a stored path, not a guess for an absent one.
 *
 * Phase 39c-2b(a): the resolve + throw-on-absent + index.md refinement is
 * the shared `resolveArtifactPathOrThrow` core helper — this thin wrapper
 * keeps the call-site name local while the logic (and its throw message)
 * lives in one place shared with the CLI verbs and the studio.
 */
function resolveIndexPath(projectRoot: string, sidecar: Entry): string {
  return resolveArtifactPathOrThrow(sidecar, projectRoot);
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
