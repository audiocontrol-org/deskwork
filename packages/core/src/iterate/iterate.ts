import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { readJournalEvents } from '../journal/read.ts';
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

const STAGE_ARTIFACT_PATH: Record<Stage, ((slug: string, contentDir: string) => string) | null> = {
  Ideas: (slug, contentDir) => join(contentDir, slug, 'scrapbook', 'idea.md'),
  Planned: (slug, contentDir) => join(contentDir, slug, 'scrapbook', 'plan.md'),
  Outlining: (slug, contentDir) => join(contentDir, slug, 'scrapbook', 'outline.md'),
  Drafting: (slug, contentDir) => join(contentDir, slug, 'index.md'),
  Final: (slug, contentDir) => join(contentDir, slug, 'index.md'),
  Published: null,
  Blocked: null,
  Cancelled: null,
};

export async function iterateEntry(projectRoot: string, opts: IterateOptions): Promise<IterateResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);

  if (sidecar.currentStage === 'Published') {
    throw new Error('Cannot iterate: Published entries are frozen.');
  }
  if (sidecar.currentStage === 'Blocked' || sidecar.currentStage === 'Cancelled') {
    throw new Error(`Cannot iterate: entry is ${sidecar.currentStage}; induct it back into the pipeline first.`);
  }

  // #140: prefer the explicit artifactPath on the sidecar when present.
  // Fall back to the slug+stage heuristic for entries without one.
  let artifactPath: string;
  if (sidecar.artifactPath) {
    artifactPath = join(projectRoot, sidecar.artifactPath);
  } else {
    const pathFn = STAGE_ARTIFACT_PATH[sidecar.currentStage];
    if (!pathFn) {
      throw new Error(`Cannot iterate at stage ${sidecar.currentStage}: no artifact path defined.`);
    }
    const contentDir = getContentDir(projectRoot);
    artifactPath = pathFn(sidecar.slug, contentDir);
  }
  const markdown = await readFile(artifactPath, 'utf8');

  // Guard: refuse to iterate when on-disk content matches the most recent
  // iteration journal entry for this stage. Prevents no-op revision bumps
  // (the operator forgot to actually edit the file).
  const events = await readJournalEvents(projectRoot, { entryId: sidecar.uuid });
  const lastIteration = events
    .filter((e) => e.kind === 'iteration' && e.stage === sidecar.currentStage)
    .at(-1);
  if (lastIteration && lastIteration.kind === 'iteration' && lastIteration.markdown === markdown) {
    throw new Error(
      `Cannot iterate: ${artifactPath} content is unchanged since iteration v${lastIteration.version}. ` +
        'Edit the file before iterating.',
    );
  }

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
