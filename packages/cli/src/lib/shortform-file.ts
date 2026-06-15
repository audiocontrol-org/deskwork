/**
 * Shared shortform-file resolution for the CLI verbs (Phase 39c-2b(a)).
 *
 * `approve --kind shortform` and `iterate --kind shortform` both resolve
 * an existing shortform draft the same way: the path is COMPOSED from the
 * parent entry's stored `artifactPath` directory (spec AUDIT-35), loaded
 * from the workflow's `entryId`. Factored here so the entryId-guard +
 * sidecar-load + compose lives in one place; each caller keeps its own
 * existence check (the not-found messages differ per verb).
 */

import { readSidecar } from '@deskwork/core/sidecar';
import { composeShortformDraftPath } from '@deskwork/core/entry/shortform-path';
import type { Platform } from '@deskwork/core/types';

/**
 * Compose the shortform draft path for a workflow from its parent entry's
 * stored artifactPath dir. Throws (Error) on a missing entryId binding or
 * a missing/invalid parent sidecar — the caller maps it to a CLI failure.
 * Existence on disk is the caller's concern.
 */
export async function composeShortformFileForWorkflow(
  projectRoot: string,
  workflow: { entryId?: string; slug: string },
  platform: Platform,
  channel: string | undefined,
): Promise<string> {
  if (workflow.entryId === undefined || workflow.entryId === '') {
    throw new Error(
      `Cannot resolve shortform file for slug "${workflow.slug}": the workflow has no ` +
        `entryId binding. Run \`deskwork doctor --fix\` to bind the entry, then retry.`,
    );
  }
  const parent = await readSidecar(projectRoot, workflow.entryId);
  return composeShortformDraftPath(parent, projectRoot, platform, channel);
}
