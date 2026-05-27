import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import type { Entry } from '../schema/entry.ts';
import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
import {
  assertStageInTemplate,
  isOffPipelineStageInTemplate,
  preTerminalLinearStage,
  terminalLinearStage,
} from '../pipelines/helpers.ts';

interface PublishOptions {
  readonly uuid: string;
  /** ISO date string (YYYY-MM-DD). Defaults to today. */
  readonly date?: string;
  /**
   * Whether to verify the on-disk artifact exists before publishing.
   * Defaults to true. Pass false for entries (e.g. external-content
   * types) that don't ship a markdown file in the repo.
   */
  readonly requireArtifact?: boolean;
}

interface PublishResult {
  readonly entryId: string;
  /**
   * Per Phase 4 (graphical-entries) both stages are plain strings
   * echoing the lane template's vocabulary. For editorial:
   * `fromStage === 'Final'` and `toStage === 'Published'`. For
   * other templates (visual / blog-post / qa-plan) the values are
   * `<preTerminal>` and `<terminal>` of the bound template.
   */
  readonly fromStage: string;
  readonly toStage: string;
  readonly datePublished: string;
  readonly artifactPath?: string;
}

/**
 * Graduate an entry to its pipeline template's TERMINAL linear stage
 * (e.g. `Published` for editorial, `Shipped` for visual).
 *
 * Per Phase 4 (graphical-entries) the verb is lane-template-aware: it
 * advances from the pre-terminal stage (`linearStages[length - 2]`) to
 * the terminal stage (`linearStages[length - 1]`). For editorial that's
 * `Final` -> `Published`; for visual that's `Approved` -> `Shipped`.
 *
 * Refuses:
 *   - currentStage === terminal — already shipped.
 *   - off-pipeline stages — induct first.
 *   - currentStage !== pre-terminal — operator must `approve` through
 *     to the pre-terminal stage first; publish does not auto-skip
 *     prior stages.
 *
 * On success:
 *   - sidecar.currentStage advances to the terminal stage,
 *   - sidecar.datePublished is set,
 *   - a stage-transition journal event is appended,
 *   - calendar.md is regenerated to reflect the new state (#148).
 */
export async function publishEntry(
  projectRoot: string,
  opts: PublishOptions,
): Promise<PublishResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
  const from = sidecar.currentStage;

  assertStageInTemplate(template, from, 'publishEntry');

  const terminal = terminalLinearStage(template);
  if (from === terminal) {
    throw new Error(
      `Cannot publish: entry is already at terminal stage "${terminal}" of pipeline "${template.id}".`,
    );
  }
  if (isOffPipelineStageInTemplate(template, from)) {
    throw new Error(
      `Cannot publish: entry is ${from} (off-pipeline); induct it back into the pipeline first.`,
    );
  }
  const preTerminal = preTerminalLinearStage(template);
  if (preTerminal === null) {
    throw new Error(
      `Cannot publish: pipeline "${template.id}" has only one linear stage and ` +
        `no pre-terminal position exists. Add a pre-terminal stage to the template ` +
        `or use \`induct\` to bypass.`,
    );
  }
  if (from !== preTerminal) {
    throw new Error(
      `Cannot publish from stage ${from}. Approve through to ${preTerminal} first ` +
        `(${preTerminal} is the only valid pre-${terminal} state in pipeline "${template.id}").`,
    );
  }

  const requireArtifact = opts.requireArtifact ?? true;
  let artifactAbs: string | undefined;
  if (requireArtifact && sidecar.artifactPath !== undefined) {
    artifactAbs = join(projectRoot, sidecar.artifactPath);
    if (!existsSync(artifactAbs)) {
      throw new Error(
        `Cannot publish: artifact missing at ${sidecar.artifactPath}. ` +
          `Write the file before publishing.`,
      );
    }
  }

  const at = new Date().toISOString();
  const datePublished = opts.date ?? at.slice(0, 10);
  const datePublishedIso = `${datePublished}T00:00:00.000Z`;
  const updated: Entry = {
    ...sidecar,
    currentStage: terminal,
    datePublished: datePublishedIso,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to: terminal,
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return {
    entryId: sidecar.uuid,
    fromStage: from,
    toStage: terminal,
    datePublished: datePublishedIso,
    ...(artifactAbs !== undefined ? { artifactPath: artifactAbs } : {}),
  };
}
