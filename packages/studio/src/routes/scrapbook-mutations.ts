/**
 * Mutation endpoints for the standalone scrapbook viewer
 * (`/dev/scrapbook/<site>/<path>`). Five POST endpoints — save, rename,
 * delete, create, upload — that the client at
 * `plugins/deskwork-studio/public/src/scrapbook-client.ts` calls when
 * the operator edits a slip, renames it, deletes it, drafts a new note,
 * or drops a file onto the page.
 *
 * Phase 13 ported the client chrome but never landed these routes;
 * Phase 16d retrofitted only the read path. v0.4.1 closes the gap
 * (issue #21).
 *
 * Design notes:
 *   - Path resolution + traversal protection runs through
 *     `@deskwork/core/scrapbook` helpers (`scrapbookFilePath` etc.).
 *     Those throw on `..` sequences, absolute paths, and any filename
 *     that escapes the scrapbook dir; we surface those as 400.
 *   - The client speaks `{ site, slug, filename, body }` for save/create,
 *     `{ site, slug, oldName, newName }` for rename, `{ site, slug,
 *     filename }` for delete, multipart `{ site, slug, file }` for
 *     upload. Endpoints accept those exact field names.
 *   - We never log file contents on save / upload (privacy). Logging
 *     filename + slug is fine but kept silent here — the studio's
 *     console is the operator's, not a server log.
 *   - Errors from the core helpers carry text like `"file not found:
 *     <name>"`, `"file already exists: <name>"`, or `"resolved path
 *     escapes scrapbook dir"`. We map those onto the right HTTP code
 *     so the client UI can flash a useful message.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  createScrapbookMarkdown,
  deleteScrapbookFile,
  renameScrapbookFile,
  saveScrapbookFile,
  writeScrapbookUpload,
  type ScrapbookItem,
} from '@deskwork/core/scrapbook';
import { existsSync } from 'node:fs';
import { scrapbookFilePath } from '@deskwork/core/scrapbook';
import type { StudioContext } from './api.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedPayload {
  site: string;
  slug: string;
}

/**
 * Validate the common `{ site, slug }` envelope. Returns a typed object
 * or a 400/404 Response that the caller propagates directly. The site
 * existence check is here so every mutation 404s on unknown sites the
 * same way the read endpoint does.
 */
function checkEnvelope(
  ctx: StudioContext,
  body: Record<string, unknown>,
): ParsedPayload | { error: string; status: 400 | 404 } {
  const site = body.site;
  const slug = body.slug;
  if (typeof site !== 'string' || site.length === 0) {
    return { error: 'site is required', status: 400 };
  }
  if (typeof slug !== 'string' || slug.length === 0) {
    return { error: 'slug is required', status: 400 };
  }
  if (!(site in ctx.config.sites)) {
    return { error: `unknown site: ${site}`, status: 404 };
  }
  return { site, slug };
}

/**
 * Map a core-helper error message onto the right HTTP status. The core
 * helpers throw plain `Error` with descriptive text; we keep the text
 * in the response body so the client can surface it.
 */
function statusForError(message: string): 400 | 404 | 409 {
  if (/already exists/i.test(message)) return 409;
  if (/not found/i.test(message)) return 404;
  // Slug, filename, traversal, and missing-arg errors are all 400.
  return 400;
}

interface JsonOk<T> {
  ok: true;
  value: T;
}
interface JsonErr {
  ok: false;
  status: 400;
  error: string;
}

function isJsonObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function readJson(
  c: Context,
): Promise<JsonOk<Record<string, unknown>> | JsonErr> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON body' };
  }
  if (!isJsonObject(raw)) {
    return { ok: false, status: 400, error: 'body must be a JSON object' };
  }
  return { ok: true, value: raw };
}

// ---------------------------------------------------------------------------
// Route module
// ---------------------------------------------------------------------------

export function createScrapbookMutationsRouter(ctx: StudioContext): Hono {
  const app = new Hono();

  // POST /api/dev/scrapbook/save
  // Body: { site, slug, filename, body }
  // Behavior: write `body` to <contentDir>/<slug>/scrapbook/<filename>.
  // Creates the file if missing (delegates to create when absent so the
  // operator's first save lands rather than 404'ing).
  app.post('/save', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkEnvelope(ctx, parsed.value);
    if ('error' in env) return c.json({ error: env.error }, env.status);

    const filename = parsed.value.filename;
    const bodyText = parsed.value.body;
    if (typeof filename !== 'string' || filename.length === 0) {
      return c.json({ error: 'filename is required' }, 400);
    }
    if (typeof bodyText !== 'string') {
      return c.json({ error: 'body must be a string' }, 400);
    }

    let item: ScrapbookItem;
    try {
      // Resolve to test for existence. If absent, create-then-return.
      const abs = scrapbookFilePath(
        ctx.projectRoot,
        ctx.config,
        env.site,
        env.slug,
        filename,
      );
      if (!existsSync(abs)) {
        // Only `.md` files can be created by the create helper, but
        // save's contract is "write whatever was sent". For non-md
        // files that don't yet exist, fall through to upload semantics.
        if (filename.endsWith('.md')) {
          item = createScrapbookMarkdown(
            ctx.projectRoot,
            ctx.config,
            env.site,
            env.slug,
            filename,
            bodyText,
          );
        } else {
          item = writeScrapbookUpload(
            ctx.projectRoot,
            ctx.config,
            env.site,
            env.slug,
            filename,
            Buffer.from(bodyText, 'utf-8'),
          );
        }
      } else {
        item = saveScrapbookFile(
          ctx.projectRoot,
          ctx.config,
          env.site,
          env.slug,
          filename,
          bodyText,
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  // POST /api/dev/scrapbook/rename
  // Body: { site, slug, oldName, newName }
  // Behavior: rename oldName -> newName in the same scrapbook dir.
  // 409 if newName already exists.
  app.post('/rename', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkEnvelope(ctx, parsed.value);
    if ('error' in env) return c.json({ error: env.error }, env.status);

    const oldName = parsed.value.oldName;
    const newName = parsed.value.newName;
    if (typeof oldName !== 'string' || oldName.length === 0) {
      return c.json({ error: 'oldName is required' }, 400);
    }
    if (typeof newName !== 'string' || newName.length === 0) {
      return c.json({ error: 'newName is required' }, 400);
    }

    let item: ScrapbookItem;
    try {
      item = renameScrapbookFile(
        ctx.projectRoot,
        ctx.config,
        env.site,
        env.slug,
        oldName,
        newName,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  // POST /api/dev/scrapbook/delete
  // Body: { site, slug, filename }
  // Behavior: unlink the file. 404 if missing.
  app.post('/delete', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkEnvelope(ctx, parsed.value);
    if ('error' in env) return c.json({ error: env.error }, env.status);

    const filename = parsed.value.filename;
    if (typeof filename !== 'string' || filename.length === 0) {
      return c.json({ error: 'filename is required' }, 400);
    }

    try {
      deleteScrapbookFile(
        ctx.projectRoot,
        ctx.config,
        env.site,
        env.slug,
        filename,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ ok: true }, 200);
  });

  // POST /api/dev/scrapbook/create
  // Body: { site, slug, filename, body? }
  // Behavior: create a new markdown file. 409 if it already exists.
  app.post('/create', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkEnvelope(ctx, parsed.value);
    if ('error' in env) return c.json({ error: env.error }, env.status);

    const filename = parsed.value.filename;
    const bodyText = parsed.value.body ?? '';
    if (typeof filename !== 'string' || filename.length === 0) {
      return c.json({ error: 'filename is required' }, 400);
    }
    if (typeof bodyText !== 'string') {
      return c.json({ error: 'body must be a string' }, 400);
    }

    let item: ScrapbookItem;
    try {
      item = createScrapbookMarkdown(
        ctx.projectRoot,
        ctx.config,
        env.site,
        env.slug,
        filename,
        bodyText,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  // POST /api/dev/scrapbook/upload
  // Multipart body: { site, slug, file }
  // Behavior: save the uploaded file (binary-safe) at
  // <contentDir>/<slug>/scrapbook/<file.name>. 409 if it already
  // exists — operator must rename or delete first.
  app.post('/upload', async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'invalid multipart body' }, 400);
    }
    const site = form.get('site');
    const slug = form.get('slug');
    const file = form.get('file');
    if (typeof site !== 'string' || site.length === 0) {
      return c.json({ error: 'site is required' }, 400);
    }
    if (typeof slug !== 'string' || slug.length === 0) {
      return c.json({ error: 'slug is required' }, 400);
    }
    if (!(site in ctx.config.sites)) {
      return c.json({ error: `unknown site: ${site}` }, 404);
    }
    if (!(file instanceof File)) {
      return c.json({ error: 'file is required (multipart)' }, 400);
    }
    const filename = file.name;
    if (typeof filename !== 'string' || filename.length === 0) {
      return c.json({ error: 'uploaded file has no name' }, 400);
    }

    let item: ScrapbookItem;
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      item = writeScrapbookUpload(
        ctx.projectRoot,
        ctx.config,
        site,
        slug,
        filename,
        buf,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  return app;
}
