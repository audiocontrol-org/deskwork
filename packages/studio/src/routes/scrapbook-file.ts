/**
 * Read-only binary endpoint for scrapbook files.
 *
 * Two addressing modes:
 *
 *   `GET /api/dev/scrapbook-file?site=<slug>&path=<scrapbook path>&name=<filename>[&secret=1]`
 *     — slug-shape addressing. `path` is the directory under `contentDir`
 *     whose `scrapbook/` subdir holds the file. Validated through
 *     `assertSlug` (kebab-case-only); rejects paths with dots / uppercase
 *     / non-slug characters.
 *
 *   `GET /api/dev/scrapbook-file?site=<slug>&entryId=<uuid>&name=<filename>[&secret=1]`
 *     — entry-id addressing. The route reads the entry's sidecar to find
 *     its on-disk artifactPath, derives the scrapbook dir from the
 *     artifact's parent directory, and serves the file. No slug-shape
 *     validation — works for projects whose feature-doc layout doesn't
 *     match the kebab-case slug template (e.g. `docs/<version>/<status>/<feature>/`).
 *
 * Both modes return the raw bytes of a single scrapbook file with a
 * sensible Content-Type header. Filename + path-traversal guards apply
 * in both modes (via `assertFilename` + the containment check in
 * `scrapbookFilePathAtDir`).
 */

import type { Context } from 'hono';
import { extname } from 'node:path';
import {
  readScrapbookFile,
  readScrapbookFileForEntry,
} from '@deskwork/core/scrapbook';
import { readSidecar } from '@deskwork/core/sidecar';
import type { StudioContext } from './api.ts';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/jsonl; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
};

function contentTypeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export async function serveScrapbookFile(
  c: Context,
  ctx: StudioContext,
): Promise<Response> {
  const site = c.req.query('site');
  const path = c.req.query('path');
  const entryId = c.req.query('entryId');
  const name = c.req.query('name');
  const secret = c.req.query('secret') === '1';

  if (!site || !name) {
    return c.json(
      { error: 'site and name query params are required' },
      400,
    );
  }
  if (!path && !entryId) {
    return c.json(
      { error: 'either path or entryId query param is required' },
      400,
    );
  }
  if (!(site in ctx.config.sites)) {
    return c.json({ error: `unknown site: ${site}` }, 404);
  }
  // Reject malformed entryId before it reaches the filesystem. `readSidecar`
  // composes the path as `<projectRoot>/.deskwork/entries/<entryId>.json` —
  // `node:path`'s join collapses `..` segments, so an unvalidated entryId
  // can probe arbitrary on-disk locations even though no data is leaked
  // (ENOENT becomes 404). Match the UUID schema enforced on entry creation.
  if (entryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryId)) {
    return c.json({ error: 'invalid entryId' }, 400);
  }

  let result;
  try {
    if (entryId) {
      // Entry-id mode: resolve the scrapbook dir via the entry's sidecar.
      // Bypasses slug-shape validation so projects with non-kebab-case
      // content layouts (dots, uppercase, etc.) can still serve assets.
      const entry = await readSidecar(ctx.projectRoot, entryId);
      result = readScrapbookFileForEntry(
        ctx.projectRoot,
        ctx.config,
        site,
        { id: entry.uuid, slug: entry.slug },
        name,
        { secret },
      );
    } else {
      // Slug-shape mode: backwards-compatible with existing scrapbook-viewer
      // callers. `path!` is non-null here because the early-return covered
      // the both-missing case.
      result = readScrapbookFile(ctx.projectRoot, ctx.config, site, path!, name, {
        secret,
      });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // The core helper throws on invalid slug / invalid filename / file
    // not found / path traversal. Treat all of them as 404 from the
    // operator's perspective — the read-only endpoint shouldn't
    // distinguish "doesn't exist" from "off-limits".
    return c.json({ error: reason }, 404);
  }

  // Hono's c.body() expects a BodyInit. Node Buffers are typed as
  // `Uint8Array<ArrayBufferLike>` but Hono's overload demands
  // `Uint8Array<ArrayBuffer>` — copy into a fresh buffer to satisfy
  // the type without bypassing typing. Scrapbook files are small
  // (the operator put them there by hand) so the copy cost is fine.
  const src = result.content;
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return c.body(copy, 200, {
    'Content-Type': contentTypeFor(result.name),
    'Content-Length': String(result.size),
    'Cache-Control': 'private, max-age=10',
  });
}
