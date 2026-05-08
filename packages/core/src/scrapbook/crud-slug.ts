/**
 * INTERNAL — slug-template CRUD primitives.
 *
 * These were the public mutation surface pre-#192 but are now private:
 * external callers go through the entry-aware `*AtDir` family in
 * `crud-at-dir.ts` after resolving the dir via `scrapbookDirForEntry`
 * (or `scrapbookDirAtPath`). This module is the implementation home
 * for the legacy slug-template path and is re-used inside the scrapbook
 * module family — `seed.ts` calls these helpers to seed a slug-keyed
 * README at plan time.
 *
 * NOT re-exported from the barrel (`packages/core/src/scrapbook.ts`).
 *
 * Same security guards as the entry-aware `*AtDir` family — filename
 * validation + path-traversal containment via the underlying
 * `scrapbookFilePathAtDir`.
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
import type { DeskworkConfig } from '../config.ts';
import { _scrapbookFilePathSlug } from './paths.ts';
import { classify } from './validation.ts';
import type { ScrapbookItem, ScrapbookLocation } from './types.ts';

/**
 * INTERNAL — create a new markdown note in the slug-template scrapbook.
 * Used by `seed.ts`. Refuses to overwrite existing files.
 */
export function _createScrapbookMarkdownSlug(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  body: string,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  if (!filename.endsWith('.md')) {
    throw new Error(`create endpoint only accepts .md files: "${filename}"`);
  }
  const abs = _scrapbookFilePathSlug(projectRoot, config, site, slug, filename, opts);
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

/** INTERNAL — overwrite an existing file's contents (slug-template). */
export function _saveScrapbookFileSlug(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  body: string | Buffer,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const abs = _scrapbookFilePathSlug(projectRoot, config, site, slug, filename, opts);
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

/** INTERNAL — rename a file (slug-template). */
export function _renameScrapbookFileSlug(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  oldName: string,
  newName: string,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const oldAbs = _scrapbookFilePathSlug(projectRoot, config, site, slug, oldName, opts);
  const newAbs = _scrapbookFilePathSlug(projectRoot, config, site, slug, newName, opts);
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

/** INTERNAL — delete a file (slug-template). */
export function _deleteScrapbookFileSlug(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  opts: ScrapbookLocation = {},
): void {
  const abs = _scrapbookFilePathSlug(projectRoot, config, site, slug, filename, opts);
  if (!existsSync(abs)) throw new Error(`file not found: "${filename}"`);
  rmSync(abs);
}

/** INTERNAL — write an uploaded file (slug-template). */
export function _writeScrapbookUploadSlug(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  content: Buffer,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const abs = _scrapbookFilePathSlug(projectRoot, config, site, slug, filename, opts);
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
