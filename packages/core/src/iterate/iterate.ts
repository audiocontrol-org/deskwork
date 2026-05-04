import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
