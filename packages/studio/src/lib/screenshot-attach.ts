/**
 * Phase 8 Step 8.4.1 + 8.4.2 — server-side helpers for the screenshot
 * attach-to-comment workflow + the orphan / cross-entry promotion path.
 *
 * Two responsibilities, kept separate from `screenshot-persistence.ts`:
 *
 *   1. Bind a previously-persisted screenshot file to a comment's
 *      `attachments[]` field by appending an `edit-comment` journal
 *      event whose `attachments` is the FULL intended list (prior
 *      attachments + the new path). Full-replacement semantics match
 *      the schema's `EditCommentAnnotation.attachments` contract.
 *
 *   2. Promote an orphan-path screenshot (under
 *      `<projectRoot>/.deskwork/screenshots-orphan/<filename>`) to an
 *      entry-anchored path (under `<entryDir>/scrapbook/screenshots/`).
 *      The promotion is a move (atomic rename when on the same
 *      filesystem; fall back to copy+unlink otherwise). When the
 *      operator promotes from entry A to a comment on entry B (the
 *      Task 8.4.2 cross-entry case), the destination dir is entry B's
 *      scrapbook and a sidecar `<filename>.meta.json` lands next to
 *      the moved file naming the source entry. The sidecar is
 *      operator-visible context — the schema's `attachments[]` stays
 *      a plain `string[]` for the v1 surface; a follow-up schema
 *      delta could embed `sourceEntry` directly.
 *
 * The helpers do NOT decide the rendering of the attached screenshot
 * — that's the sidebar-render module's concern. Their contract is
 * journal-write + file-move only.
 */

import { existsSync } from 'node:fs';
import { mkdir, rename, copyFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { readSidecar } from '@deskwork/core/sidecar';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  mintEntryAnnotation,
} from '@deskwork/core/entry/annotations';
import type {
  CommentAnnotation,
  DraftAnnotation,
} from '@deskwork/core/review/types';
import {
  assertSafeScreenshotFilename,
  entryScreenshotsDir,
  orphanScreenshotsDir,
} from './screenshot-persistence.ts';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AttachResult {
  /**
   * The `edit-comment` annotation that was minted + appended. The
   * caller serialises this back to the client so the live sidebar
   * can fold it without re-fetching.
   */
  readonly annotation: DraftAnnotation;
  /**
   * The full attachments[] list AFTER the attach. Convenience field
   * for callers that want to update an in-memory cache directly.
   */
  readonly attachments: readonly string[];
}

export interface PromoteResult extends AttachResult {
  /** Absolute path the orphan file was moved to. */
  readonly writtenPath: string;
  /** Same path relative to the project root (or absolute if the
   *  resolved path lies outside the project — atypical). */
  readonly relativeWrittenPath: string;
  /**
   * Absolute path to the sidecar metadata file (`<filename>.meta.json`)
   * when one was written (cross-entry promotion case), or null when
   * the orphan came from the same entry context as the target
   * (sidecar is informational; no source-entry distinction to record).
   */
  readonly sidecarMetaPath: string | null;
}

/**
 * Look up a comment annotation by id in the FOLDED entry-keyed
 * annotation list. Returns the comment when found, null otherwise.
 * The fold path applies prior edit-comment events, so the returned
 * attachments[] reflects the latest committed state — which is
 * exactly what the attach flow needs to compose `[...prior, new]`.
 */
async function findCommentByIdFolded(
  projectRoot: string,
  entryId: string,
  commentId: string,
): Promise<CommentAnnotation | null> {
  const list = await listEntryAnnotations(projectRoot, entryId);
  for (const ann of list) {
    if (ann.type === 'comment' && ann.id === commentId) {
      return ann;
    }
  }
  return null;
}

/**
 * Append an `edit-comment` annotation that mutates the comment's
 * attachments[] to `[...prior, newRelativePath]`. The comment must
 * already exist in the entry's stream (the writer's commentId-
 * exists check will throw if not).
 *
 * `newRelativePath` is taken verbatim — callers are responsible for
 * passing the project-root-relative path the screenshot was
 * persisted at (matches the `relativeWrittenPath` shape returned by
 * `persistEntryScreenshot`).
 */
export async function attachScreenshotToCommentServer(
  projectRoot: string,
  entryId: string,
  commentId: string,
  newRelativePath: string,
): Promise<AttachResult> {
  if (!UUID_RE.test(entryId)) {
    throw new Error(`malformed entryId: ${entryId}`);
  }
  if (!UUID_RE.test(commentId)) {
    throw new Error(`malformed commentId: ${commentId}`);
  }
  if (typeof newRelativePath !== 'string' || newRelativePath.length === 0) {
    throw new Error('newRelativePath is required');
  }
  const comment = await findCommentByIdFolded(projectRoot, entryId, commentId);
  if (comment === null) {
    throw new Error(`unknown commentId ${commentId} on entry ${entryId}`);
  }
  const prior = comment.attachments ?? [];
  const next = [...prior, newRelativePath];
  const minted: DraftAnnotation = mintEntryAnnotation({
    type: 'edit-comment',
    workflowId: entryId,
    commentId,
    attachments: next,
  });
  await addEntryAnnotation(projectRoot, entryId, minted);
  return { annotation: minted, attachments: next };
}

export interface PromoteOptions {
  /**
   * UUID of the entry the orphan ORIGINATED from, if known. When this
   * differs from the destination entry, the helper writes a
   * `<filename>.meta.json` sidecar next to the moved file naming
   * the source entry — operator-visible context for the cross-entry
   * case (Task 8.4.2). When this matches the destination entry or
   * is omitted, no sidecar is written.
   */
  readonly sourceEntry?: string;
}

/**
 * Move an orphan-path screenshot to an entry-anchored path AND
 * append an `edit-comment` annotation binding it to the named
 * comment's attachments[].
 *
 * The move is `rename` when possible; falls back to copy+unlink for
 * cross-filesystem cases (atypical — orphan and entry scrapbook live
 * under the same project root). Refuses to overwrite an existing
 * file at the destination.
 *
 * `options.sourceEntry` records the originating entry when set AND
 * different from `entryId` (the cross-entry case). The sidecar
 * `<filename>.meta.json` carries `{ sourceEntry: '<uuid>' }` so the
 * provenance is preserved without a schema delta.
 */
export async function promoteOrphanToEntry(
  projectRoot: string,
  filename: string,
  entryId: string,
  commentId: string,
  options: PromoteOptions = {},
): Promise<PromoteResult> {
  if (!UUID_RE.test(entryId)) {
    throw new Error(`malformed entryId: ${entryId}`);
  }
  if (!UUID_RE.test(commentId)) {
    throw new Error(`malformed commentId: ${commentId}`);
  }
  assertSafeScreenshotFilename(filename);
  if (options.sourceEntry !== undefined && !UUID_RE.test(options.sourceEntry)) {
    throw new Error(`malformed sourceEntry: ${options.sourceEntry}`);
  }
  const orphanPath = join(orphanScreenshotsDir(projectRoot), filename);
  if (!existsSync(orphanPath)) {
    throw new Error(`orphan screenshot not found at ${orphanPath}`);
  }
  const entry = await readSidecar(projectRoot, entryId);
  const destDir = entryScreenshotsDir(projectRoot, entry);
  const writtenPath = join(destDir, filename);
  if (existsSync(writtenPath)) {
    throw new Error(`screenshot already exists at ${writtenPath}`);
  }
  // AUDIT-20260602-01 — validate the comment exists BEFORE moving the
  // file. Unknown commentId is a 404 path the route maps explicitly;
  // if we move the orphan first, the operator's screenshot is consumed
  // out of the orphan dir and on retry the route now returns "orphan
  // screenshot not found" — unrecoverable. Every 4xx-shaped precondition
  // (sidecar lookup, commentId existence, dest collision) is checked
  // before any destructive side-effect.
  const comment = await findCommentByIdFolded(projectRoot, entryId, commentId);
  if (comment === null) {
    throw new Error(`unknown commentId ${commentId} on entry ${entryId}`);
  }
  await mkdir(destDir, { recursive: true });
  await moveFile(orphanPath, writtenPath);
  const rel = relative(projectRoot, writtenPath);
  const relativeWrittenPath =
    rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
      ? rel
      : writtenPath;
  // Cross-entry sidecar — record source only when distinct from
  // destination. Mirrors the Task 8.4.2 sidecar shape spec'd in the
  // workplan prose: `<filename>.meta.json` carries
  // `{ sourceEntry: '<uuid>' }`.
  let sidecarMetaPath: string | null = null;
  if (
    options.sourceEntry !== undefined &&
    options.sourceEntry !== entryId
  ) {
    sidecarMetaPath = `${writtenPath}.meta.json`;
    if (existsSync(sidecarMetaPath)) {
      throw new Error(
        `screenshot sidecar metadata already exists at ${sidecarMetaPath}`,
      );
    }
    await writeFile(
      sidecarMetaPath,
      JSON.stringify({ sourceEntry: options.sourceEntry }, null, 2) + '\n',
      'utf-8',
    );
  }
  const attached = await attachScreenshotToCommentServer(
    projectRoot,
    entryId,
    commentId,
    relativeWrittenPath,
  );
  return {
    ...attached,
    writtenPath,
    relativeWrittenPath,
    sidecarMetaPath,
  };
}

async function moveFile(src: string, dest: string): Promise<void> {
  const destDir = dirname(dest);
  await mkdir(destDir, { recursive: true });
  try {
    await rename(src, dest);
    return;
  } catch (err) {
    // EXDEV (cross-device link) — fall back to copy + unlink.
    const code =
      err instanceof Error && 'code' in err
        ? Reflect.get(err, 'code')
        : undefined;
    if (code !== 'EXDEV') throw err;
    await copyFile(src, dest);
    await unlink(src);
  }
}
