/**
 * Entry-aware CRUD primitives — operate on a pre-resolved scrapbook dir.
 *
 * The studio's mutation routes resolve the scrapbook directory via
 * `scrapbookDirForEntry` (entry-id driven; refactor-proof) and then call
 * these `*AtDir` helpers. Mirrors the listing-side `listScrapbookAtDir` /
 * `readScrapbookFileAtDir` primitives.
 *
 * Same security guards as the slug-shape helpers via
 * `scrapbookFilePathAtDir`: filename validation + path-traversal
 * containment.
 *
 * This is the public mutation surface post-#192. The slug-template
 * mutation primitives (`createScrapbookMarkdown`, `saveScrapbookFile`,
 * `renameScrapbookFile`, `deleteScrapbookFile`, `writeScrapbookUpload`)
 * were collapsed to private helpers in the same change — external
 * callers go through these `*AtDir` functions plus a dir resolved by
 * `scrapbookDirForEntry`.
 */

import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { scrapbookFilePathAtDir } from './paths.ts';
import { classify } from './validation.ts';
import type { ScrapbookItem, ScrapbookLocation } from './types.ts';

/**
 * Create a new markdown note inside an already-resolved scrapbook dir.
 * Mirrors the legacy `createScrapbookMarkdown` (now private) but takes
 * the dir directly.
 */
export function createScrapbookMarkdownAtDir(
  scrapbookDirAbs: string,
  filename: string,
  body: string,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  if (!filename.endsWith('.md')) {
    throw new Error(`create endpoint only accepts .md files: "${filename}"`);
  }
  const abs = scrapbookFilePathAtDir(scrapbookDirAbs, filename, opts);
  if (existsSync(abs)) {
    throw new Error(`file already exists: "${filename}"`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, 'utf-8');
  const st = statSync(abs);
  return {
    name: filename,
    kind: 'md',
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

/**
 * Overwrite an existing file's contents inside an already-resolved scrapbook
 * dir. Mirrors the legacy `saveScrapbookFile` (now private).
 */
export function saveScrapbookFileAtDir(
  scrapbookDirAbs: string,
  filename: string,
  body: string | Buffer,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const abs = scrapbookFilePathAtDir(scrapbookDirAbs, filename, opts);
  if (!existsSync(abs)) throw new Error(`file not found: "${filename}"`);
  writeFileSync(abs, body);
  const st = statSync(abs);
  return {
    name: filename,
    kind: classify(filename),
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

/**
 * Rename a file inside an already-resolved scrapbook dir. Mirrors the
 * legacy `renameScrapbookFile` (now private).
 */
export function renameScrapbookFileAtDir(
  scrapbookDirAbs: string,
  oldName: string,
  newName: string,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const oldAbs = scrapbookFilePathAtDir(scrapbookDirAbs, oldName, opts);
  const newAbs = scrapbookFilePathAtDir(scrapbookDirAbs, newName, opts);
  if (!existsSync(oldAbs)) throw new Error(`file not found: "${oldName}"`);
  if (existsSync(newAbs) && oldAbs !== newAbs) {
    throw new Error(`target name already exists: "${newName}"`);
  }
  renameSync(oldAbs, newAbs);
  const st = statSync(newAbs);
  return {
    name: newName,
    kind: classify(newName),
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

/**
 * Delete a file inside an already-resolved scrapbook dir. Mirrors the
 * legacy `deleteScrapbookFile` (now private).
 */
export function deleteScrapbookFileAtDir(
  scrapbookDirAbs: string,
  filename: string,
  opts: ScrapbookLocation = {},
): void {
  const abs = scrapbookFilePathAtDir(scrapbookDirAbs, filename, opts);
  if (!existsSync(abs)) throw new Error(`file not found: "${filename}"`);
  rmSync(abs);
}

/**
 * Write an uploaded file inside an already-resolved scrapbook dir.
 * Mirrors the legacy `writeScrapbookUpload` (now private).
 */
export function writeScrapbookUploadAtDir(
  scrapbookDirAbs: string,
  filename: string,
  content: Buffer,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const abs = scrapbookFilePathAtDir(scrapbookDirAbs, filename, opts);
  if (existsSync(abs)) {
    throw new Error(`file already exists: "${filename}" — rename first`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  const st = statSync(abs);
  return {
    name: filename,
    kind: classify(filename),
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}
