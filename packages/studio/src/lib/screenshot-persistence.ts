/**
 * Phase 8 Step 8.3.3 — server-side persistence for screenshots captured
 * via the entry-keyed press-check surface.
 *
 * Two paths per the PRD (Phase 8 § Screenshot attachment):
 *
 *   1. Entry-anchored: `<entryDir>/scrapbook/screenshots/<filename>.png`
 *      Used when the operator captures with a comment context (e.g.
 *      clicks "screenshot for this comment" on an existing comment).
 *      The capture binds to a specific commentId at save time.
 *      Filename convention: `<commentId>-<ISO-timestamp>.png`.
 *
 *   2. Orphan: `<projectRoot>/.deskwork/screenshots-orphan/<filename>.png`
 *      Used when the operator captures without a comment context. The
 *      capture is later attached to a comment via Task 8.4's workflow;
 *      attachment moves the file from the orphan path to the
 *      entry-anchored path. Filename convention:
 *      `<ISO-timestamp>-<hash>.png`.
 *
 * Both helpers:
 *   - Validate the filename against a tight regex (no slashes, no `..`,
 *     `.png` extension, no leading dot) — defense in depth against a
 *     malformed client supplying a path-traversal name.
 *   - Refuse to overwrite an existing file (409-shape on the route).
 *     The PRD's filename convention guarantees uniqueness via the
 *     ISO-timestamp + hash / commentId; collisions indicate either a
 *     client bug OR a deliberate clobber attempt.
 *   - mkdir -p the target directory so the first write into a fresh
 *     entry / orphan dir succeeds.
 *   - Atomic write (tmp + rename) mirrors writeEntryBody so a kill
 *     mid-write leaves either no file or the complete file.
 *   - Return the absolute path written for the route's response body.
 *
 * The helpers do NOT touch the entry's `attachments[]` annotation
 * field — that binding happens in Task 8.4. Step 8.3.3 lands the
 * raw write path only.
 */

import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { resolveIndexPath } from './entry-resolver.ts';

/**
 * Tight filename regex. Permits:
 *   - UUID-prefixed entry-anchored form (`<uuid>-<timestamp>.png`).
 *   - Orphan timestamp+hash form (`<timestamp>-<hash>.png`).
 *
 * Rejects:
 *   - Path separators (`/`, `\`).
 *   - Parent-dir hops (`..`).
 *   - Leading dot.
 *   - Non-png extension.
 *   - Empty strings.
 *
 * The two valid forms share a regex shape: 1+ non-separator chars
 * ending in `.png`, with at least one hyphen separating the prefix
 * from the timestamp / hash.
 */
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]+\.png$/;

export interface PersistResult {
  /** Absolute path the bytes were written to. */
  readonly writtenPath: string;
  /** Path relative to the project root (for the route response body). */
  readonly relativeWrittenPath: string;
}

/**
 * Throws a descriptive error when `filename` doesn't satisfy the safe
 * filename regex above. Returns void on success. Separated so route
 * handlers can return a 400 with the exact reason rather than a
 * blanket "invalid filename".
 */
export function assertSafeScreenshotFilename(filename: string): void {
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new Error('screenshot filename is required');
  }
  if (filename.length > 200) {
    throw new Error(`screenshot filename too long (>200 chars): ${filename.length}`);
  }
  if (!FILENAME_RE.test(filename)) {
    throw new Error(
      `screenshot filename must match ${FILENAME_RE} (got ${JSON.stringify(filename)})`,
    );
  }
  // Belt-and-braces against regex bypass via overlapping classes:
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error(
      `screenshot filename contains forbidden characters: ${JSON.stringify(filename)}`,
    );
  }
}

/**
 * Resolve the entry's scrapbook-screenshots directory:
 * `<entryDir>/scrapbook/screenshots/`. Mirrors `resolveIndexPath`'s
 * semantics — for an entry with an `artifactPath` whose dir name is
 * NOT `scrapbook`, the screenshots dir is sibling to the artifact;
 * for the legacy `<dir>/scrapbook/<file>.md` shape, the screenshots
 * dir is `<dir>/scrapbook/screenshots/`.
 */
export function entryScreenshotsDir(projectRoot: string, entry: Entry): string {
  // Re-use the same logic resolveIndexPath uses to find the entry's
  // canonical directory, then append `scrapbook/screenshots/`.
  const indexPath = resolveIndexPath(projectRoot, entry);
  const dir = dirname(indexPath);
  // If `dir` already ends in `scrapbook`, place screenshots under
  // it directly (legacy layout). Otherwise the screenshots dir is the
  // entry dir's `scrapbook/screenshots/` child.
  if (basename(dir) === 'scrapbook') {
    return join(dir, 'screenshots');
  }
  return join(dir, 'scrapbook', 'screenshots');
}

/**
 * Orphan-screenshots directory: `<projectRoot>/.deskwork/screenshots-orphan/`.
 */
export function orphanScreenshotsDir(projectRoot: string): string {
  return join(projectRoot, '.deskwork', 'screenshots-orphan');
}

/**
 * AUDIT-20260602-02 — Validate that a client-supplied attachment
 * `relativePath` resolves to a file directly under the entry's
 * scrapbook-screenshots dir, with a filename that satisfies
 * `assertSafeScreenshotFilename`.
 *
 * Throws a descriptive error on mismatch — the attach route maps the
 * throw to a 400. The check is the same security boundary the
 * persistence layer enforces at write time; this helper extends it to
 * the attach surface so a client can't bypass the persistence regex
 * by attaching an arbitrary path string after the fact.
 *
 * The route's documented contract:
 *   - relativePath must be project-root-relative (no absolute path).
 *   - relativePath must not contain `..` segments.
 *   - relativePath, resolved against projectRoot, must equal
 *     `<entryScreenshotsDir>/<filename>` exactly.
 *   - `<filename>` (the basename) must pass the persistence-layer
 *     filename regex.
 */
export function assertSafeAttachmentRelativePath(
  projectRoot: string,
  entry: Entry,
  relativePath: string,
): void {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('relativePath (non-empty string) is required');
  }
  if (isAbsolute(relativePath)) {
    throw new Error(
      `relativePath must be project-root-relative (got absolute: ${JSON.stringify(relativePath)})`,
    );
  }
  if (relativePath.includes('..')) {
    throw new Error(
      `relativePath must not contain '..' segments (got ${JSON.stringify(relativePath)})`,
    );
  }
  const expectedDir = entryScreenshotsDir(projectRoot, entry);
  const resolved = resolve(projectRoot, relativePath);
  const resolvedDir = dirname(resolved);
  if (resolvedDir !== expectedDir) {
    throw new Error(
      `relativePath must resolve under ${expectedDir} (got ${JSON.stringify(relativePath)} resolving to ${resolvedDir})`,
    );
  }
  // The basename portion must satisfy the same regex the persistence
  // layer enforces at write time — sharing one boundary between
  // persist + attach.
  assertSafeScreenshotFilename(basename(resolved));
}

/**
 * Persist `bytes` to the entry's scrapbook-screenshots dir under
 * `filename`. Looks up the entry's sidecar to resolve the dir; refuses
 * to overwrite an existing file; returns the absolute + relative paths.
 *
 * Throws on:
 *   - Unknown entry (sidecar not found): error message starts with
 *     `sidecar not found` — route handler maps to 404.
 *   - Filename validation failure: routed to 400 with the assertion
 *     message verbatim.
 *   - Existing target: throws `screenshot already exists at <path>` —
 *     routed to 409.
 */
export async function persistEntryScreenshot(
  projectRoot: string,
  entryUuid: string,
  filename: string,
  bytes: Uint8Array,
): Promise<PersistResult> {
  assertSafeScreenshotFilename(filename);
  const entry = await readSidecar(projectRoot, entryUuid);
  const dir = entryScreenshotsDir(projectRoot, entry);
  return writeScreenshotBytes(projectRoot, dir, filename, bytes);
}

/**
 * Persist `bytes` to the project's orphan-screenshots dir under
 * `filename`. Same contract as `persistEntryScreenshot` minus the
 * sidecar lookup.
 */
export async function persistOrphanScreenshot(
  projectRoot: string,
  filename: string,
  bytes: Uint8Array,
): Promise<PersistResult> {
  assertSafeScreenshotFilename(filename);
  const dir = orphanScreenshotsDir(projectRoot);
  return writeScreenshotBytes(projectRoot, dir, filename, bytes);
}

async function writeScreenshotBytes(
  projectRoot: string,
  dir: string,
  filename: string,
  bytes: Uint8Array,
): Promise<PersistResult> {
  await mkdir(dir, { recursive: true });
  const writtenPath = join(dir, filename);
  if (existsSync(writtenPath)) {
    throw new Error(`screenshot already exists at ${writtenPath}`);
  }
  const tmpPath = `${writtenPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, bytes);
  await rename(tmpPath, writtenPath);
  const rel = relative(projectRoot, writtenPath);
  const relativeWrittenPath =
    rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
      ? rel
      : writtenPath;
  return { writtenPath, relativeWrittenPath };
}
