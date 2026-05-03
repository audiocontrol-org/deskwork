import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import type { Entry, Stage } from '../schema/entry.ts';

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
  readonly fromStage: Stage;
  readonly toStage: 'Published';
  readonly datePublished: string;
  readonly artifactPath?: string;
}

/**
 * Mark an entry as Published.
 *
 * Refuses:
 *   - currentStage !== 'Final' (Final is the only valid pre-Published
 *     state under the entry-centric model — operators must `approve`
 *     through Drafting → Final first),
 *   - Published (already terminal),
 *   - Blocked / Cancelled (induct into the pipeline first).
 *
 * On success:
 *   - sidecar.currentStage advances to 'Published',
 *   - sidecar.datePublished is set,
 *   - a stage-transition journal event is appended,
 *   - calendar.md is regenerated to reflect the new state (#148).
 */
export async function publishEntry(
  projectRoot: string,
  opts: PublishOptions,
): Promise<PublishResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const from = sidecar.currentStage;
  if (from === 'Published') {
    throw new Error('Cannot publish: entry is already Published.');
  }
  if (from === 'Blocked' || from === 'Cancelled') {
    throw new Error(
      `Cannot publish: entry is ${from}; induct it back into the pipeline first.`,
    );
  }
  if (from !== 'Final') {
    throw new Error(
      `Cannot publish from stage ${from}. Approve through to Final first ` +
        `(Final is the only valid pre-Published state).`,
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
    currentStage: 'Published',
    datePublished: datePublishedIso,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to: 'Published',
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return {
    entryId: sidecar.uuid,
    fromStage: from,
    toStage: 'Published',
    datePublished: datePublishedIso,
    ...(artifactAbs !== undefined ? { artifactPath: artifactAbs } : {}),
  };
}
