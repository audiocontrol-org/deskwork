/**
 * Resolve an entry uuid to its sidecar + on-disk artifact body. Studio
 * handlers use this when they need both metadata (from the sidecar) and
 * the live document content (from the markdown artifact on disk).
 *
 * The artifact path depends on stage: scrapbook docs (idea/plan/outline)
 * for early stages, the canonical `index.md` for Drafting / Final /
 * Published. Off-pipeline stages (Blocked / Cancelled) carry their
 * priorStage so the resolver can locate the artifact even when the
 * entry is paused.
 *
 * Pipeline-redesign Task 33 — Phase 6 entry resolver.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSidecar } from '@deskwork/core/sidecar';
import type { Entry, Stage } from '@deskwork/core/schema/entry';

interface ResolveResult {
  entry: Entry;
  artifactBody: string;
  artifactPath: string;
}

const STAGE_ARTIFACT: Record<Stage, ((slug: string, contentDir: string) => string) | null> = {
  Ideas: (s, d) => join(d, s, 'scrapbook', 'idea.md'),
  Planned: (s, d) => join(d, s, 'scrapbook', 'plan.md'),
  Outlining: (s, d) => join(d, s, 'scrapbook', 'outline.md'),
  Drafting: (s, d) => join(d, s, 'index.md'),
  Final: (s, d) => join(d, s, 'index.md'),
  Published: (s, d) => join(d, s, 'index.md'),
  Blocked: null,
  Cancelled: null,
};

export async function resolveEntry(projectRoot: string, uuid: string): Promise<ResolveResult> {
  const entry = await readSidecar(projectRoot, uuid);
  // TODO(pipeline-redesign Phase 6+): read content dir from .deskwork/config.json.
  // Until config plumbing lands, default to `docs/` (matches every test fixture
  // and the canonical layout in the redesign spec).
  const contentDir = join(projectRoot, 'docs');
  const stage = entry.priorStage ?? entry.currentStage;
  const pathFn = STAGE_ARTIFACT[stage];
  if (pathFn === null) {
    throw new Error(`No artifact path for stage ${stage}`);
  }
  const artifactPath = pathFn(entry.slug, contentDir);
  const artifactBody = await readFile(artifactPath, 'utf8');
  return { entry, artifactBody, artifactPath };
}
