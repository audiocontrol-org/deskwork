/**
 * Read primitives — return file metadata + content as a Buffer.
 *
 * Three addressing modes match the listing/path module:
 *   - `readScrapbookFile` — slug-template (legacy public; uses the
 *     private `_scrapbookDirSlug` internally).
 *   - `readScrapbookFileAtDir` — already-resolved scrapbook dir.
 *   - `readScrapbookFileForEntry` — entry-aware via
 *     `scrapbookDirForEntry`; the binary endpoint
 *     `/api/dev/scrapbook-file?entryId=...` uses this so projects whose
 *     feature-doc layout doesn't match the kebab-case slug template
 *     can still serve scrapbook assets.
 *
 * Same security guards as the writes via `scrapbookFilePathAtDir`.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import type { DeskworkConfig } from '../config.ts';
import type { ContentIndex } from '../content-index.ts';
import {
  _scrapbookDirSlug,
  scrapbookDirForEntry,
  scrapbookFilePathAtDir,
} from './paths.ts';
import { classify } from './validation.ts';
import type { ScrapbookItemKind, ScrapbookLocation } from './types.ts';

interface ReadResult {
  name: string;
  kind: ScrapbookItemKind;
  size: number;
  mtime: string;
  content: Buffer;
}

export function readScrapbookFile(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  opts: ScrapbookLocation = {},
): ReadResult {
  return readScrapbookFileAtDir(
    _scrapbookDirSlug(projectRoot, config, site, slug),
    filename,
    opts,
  );
}

/**
 * Read a scrapbook file given the absolute scrapbook directory. Used
 * by callers that have already resolved the on-disk dir via
 * `scrapbookDirForEntry` (id-driven) or `scrapbookDirAtPath`
 * (fs-path-driven) and don't want to re-derive through the slug
 * template. Mirrors the listing-side primitive `listScrapbookAtDir`.
 *
 * Same security guards as `readScrapbookFile` (filename validation +
 * path-traversal containment) via `scrapbookFilePathAtDir`.
 */
export function readScrapbookFileAtDir(
  scrapbookDirAbs: string,
  filename: string,
  opts: ScrapbookLocation = {},
): ReadResult {
  const abs = scrapbookFilePathAtDir(scrapbookDirAbs, filename, opts);
  if (!existsSync(abs)) throw new Error(`not found: ${filename}`);
  const st = statSync(abs);
  if (!st.isFile()) throw new Error(`not a file: ${filename}`);
  const content = readFileSync(abs);
  return {
    name: filename,
    kind: classify(filename),
    size: st.size,
    mtime: st.mtime.toISOString(),
    content,
  };
}

/**
 * Read a scrapbook file for a tracked calendar entry. Mirrors
 * `listScrapbookForEntry` / `countScrapbookForEntry` — id-driven
 * resolution via `scrapbookDirForEntry`, slug fallback for pre-bound
 * entries. Used by the studio's `/api/dev/scrapbook-file?entryId=...`
 * variant so projects whose feature-doc layout doesn't match the
 * kebab-case slug template (e.g. `docs/<version>/<status>/<feature>/`)
 * can still serve scrapbook assets — `scrapbookDirAtPath`'s slug
 * validator would otherwise reject any path with dots or uppercase
 * segments.
 */
export function readScrapbookFileForEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  filename: string,
  opts: ScrapbookLocation = {},
  index?: ContentIndex,
): ReadResult {
  return readScrapbookFileAtDir(
    scrapbookDirForEntry(projectRoot, config, site, entry, index),
    filename,
    opts,
  );
}
