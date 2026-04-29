/**
 * Read-only binary endpoint for scrapbook files.
 *
 * `GET /api/dev/scrapbook-file?site=<slug>&path=<scrapbook path>&name=<filename>[&secret=1]`
 *
 * Returns the raw bytes of a single scrapbook file with a sensible
 * Content-Type header. Read-only — no write/rename/delete here. The
 * shared scrapbook-item renderer uses this for image thumbnails,
 * PDF iframes, and download links on the review-drawer + content-view
 * surfaces.
 *
 * Validation runs through `@deskwork/core/scrapbook`'s own
 * `assertSlug` / `assertFilename` (via `readScrapbookFile`), so path
 * traversal attempts are caught at the core boundary, not here.
 */

import type { Context } from 'hono';
import { extname } from 'node:path';
import { readScrapbookFile } from '@deskwork/core/scrapbook';
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
  const name = c.req.query('name');
  const secret = c.req.query('secret') === '1';

  if (!site || !path || !name) {
    return c.json(
      { error: 'site, path, and name query params are required' },
      400,
    );
  }
  if (!(site in ctx.config.sites)) {
    return c.json({ error: `unknown site: ${site}` }, 404);
  }

  let result;
  try {
    result = readScrapbookFile(ctx.projectRoot, ctx.config, site, path, name, {
      secret,
    });
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
