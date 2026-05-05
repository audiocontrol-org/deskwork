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
 * Two addressing modes (#191):
 *   - **Entry-id mode** (preferred): `{ site, entryId, ... }` — looks up
 *     the entry's sidecar, derives the scrapbook dir from the artifact's
 *     parent directory via `scrapbookDirForEntry`, mutates there. Same
 *     code path the read endpoints use; refactor-proof for projects whose
 *     feature-doc layout doesn't match the kebab-case slug template.
 *   - **Slug mode** (back-compat fallback): `{ site, slug, ... }` —
 *     legacy slug-template addressing (`<contentDir>/<slug>/scrapbook/`).
 *     Retained during a deprecation window so existing callers continue
 *     working. To be collapsed in #192.
 *
 * Companion modules (#191 split, to keep this file under the project's
 * 300–500 line cap):
 *   - `scrapbook-mutation-envelope.ts` — JSON / form envelope parsing,
 *     UUID validation, dir resolution.
 *   - `scrapbook-mutation-dispatch.ts` — per-mode dispatch helpers
 *     (entry-aware vs. slug-template), one per route verb.
 *
 * Design notes:
 *   - Path resolution + traversal protection runs through
 *     `@deskwork/core/scrapbook` helpers. Those throw on `..` sequences,
 *     absolute paths, and any filename that escapes the scrapbook dir;
 *     we surface those as 400.
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
import { classify, type ScrapbookItem } from '@deskwork/core/scrapbook';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StudioContext } from './api.ts';
import {
  checkFormEnvelope,
  checkJsonEnvelope,
  isEnvelopeError,
} from './scrapbook-mutation-envelope.ts';
import {
  createDispatch,
  deleteDispatch,
  renameInPlace,
  resolveCrossSectionPaths,
  saveDispatch,
  uploadDispatch,
} from './scrapbook-mutation-dispatch.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // Body (entry mode): { site, entryId, filename, body, secret? }
  // Body (slug mode):  { site, slug, filename, body, secret? }
  // Behavior: write `body` to <scrapbook-dir>/<filename>. Creates the
  // file if missing (delegates to create when absent so the operator's
  // first save lands rather than 404'ing).
  app.post('/save', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkJsonEnvelope(ctx, parsed.value);
    if (isEnvelopeError(env)) return c.json({ error: env.error }, env.status);

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
      item = await saveDispatch(ctx, env, filename, bodyText);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  // POST /api/dev/scrapbook/rename
  // Body (entry mode): { site, entryId, oldName, newName, secret?, toSecret? }
  // Body (slug mode):  { site, slug, oldName, newName, secret?, toSecret? }
  //
  // Two modes:
  //   - In-place rename: secret = source location (defaults to false);
  //     toSecret omitted (or equal to secret). The file is renamed
  //     inside the same section.
  //   - Cross-section move (#28): secret = source, toSecret = target
  //     section. When secret !== toSecret, the file is moved between
  //     `scrapbook/` and `scrapbook/secret/`. The studio's UI exposes
  //     this as "Mark secret" / "Mark public".
  //
  // 409 if the target newName already exists (in the destination
  // section). 404 if oldName is missing in the source section.
  app.post('/rename', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkJsonEnvelope(ctx, parsed.value);
    if (isEnvelopeError(env)) return c.json({ error: env.error }, env.status);

    const oldName = parsed.value.oldName;
    const newName = parsed.value.newName;
    if (typeof oldName !== 'string' || oldName.length === 0) {
      return c.json({ error: 'oldName is required' }, 400);
    }
    if (typeof newName !== 'string' || newName.length === 0) {
      return c.json({ error: 'newName is required' }, 400);
    }
    const toSecretRaw = parsed.value.toSecret;
    if (toSecretRaw !== undefined && typeof toSecretRaw !== 'boolean') {
      return c.json({ error: 'toSecret must be a boolean when provided' }, 400);
    }
    const toSecret = toSecretRaw === undefined ? env.secret : toSecretRaw;

    let item: ScrapbookItem;
    try {
      if (toSecret === env.secret) {
        item = await renameInPlace(ctx, env, oldName, newName);
      } else {
        // Cross-section move. Resolve src + dst absolute paths under the
        // right sub-roots and let the resolver enforce traversal guards.
        // Then physically rename across the two paths.
        const { srcAbs, dstAbs } = await resolveCrossSectionPaths(
          ctx,
          env,
          oldName,
          newName,
          toSecret,
        );
        if (!existsSync(srcAbs)) {
          return c.json({ error: `file not found: "${oldName}"` }, 404);
        }
        if (existsSync(dstAbs)) {
          return c.json({ error: `target name already exists: "${newName}"` }, 409);
        }
        // Ensure the destination directory exists (creates `secret/`
        // when promoting public → secret for the first time).
        mkdirSync(dirname(dstAbs), { recursive: true });
        renameSync(srcAbs, dstAbs);
        const st = statSync(dstAbs);
        // Build the response item the same shape the helper uses.
        item = {
          name: newName,
          kind: classify(newName),
          size: st.size,
          mtime: st.mtime.toISOString(),
        };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  // POST /api/dev/scrapbook/delete
  // Body (entry mode): { site, entryId, filename, secret? }
  // Body (slug mode):  { site, slug, filename, secret? }
  // Behavior: unlink the file. 404 if missing.
  app.post('/delete', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkJsonEnvelope(ctx, parsed.value);
    if (isEnvelopeError(env)) return c.json({ error: env.error }, env.status);

    const filename = parsed.value.filename;
    if (typeof filename !== 'string' || filename.length === 0) {
      return c.json({ error: 'filename is required' }, 400);
    }

    try {
      await deleteDispatch(ctx, env, filename);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ ok: true }, 200);
  });

  // POST /api/dev/scrapbook/create
  // Body (entry mode): { site, entryId, filename, body?, secret? }
  // Body (slug mode):  { site, slug, filename, body?, secret? }
  // Behavior: create a new markdown file. 409 if it already exists.
  app.post('/create', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
    const env = checkJsonEnvelope(ctx, parsed.value);
    if (isEnvelopeError(env)) return c.json({ error: env.error }, env.status);

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
      item = await createDispatch(ctx, env, filename, bodyText);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  // POST /api/dev/scrapbook/upload
  // Multipart body (entry mode): { site, entryId, file, secret? }
  // Multipart body (slug mode):  { site, slug, file, secret? }
  // Behavior: save the uploaded file (binary-safe) at the scrapbook dir,
  // or under `scrapbook/secret/` when the `secret` form field is the
  // literal string "true". 409 if it already exists — operator must
  // rename or delete first.
  app.post('/upload', async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'invalid multipart body' }, 400);
    }
    const env = checkFormEnvelope(ctx, form);
    if (isEnvelopeError(env)) return c.json({ error: env.error }, env.status);

    const file = form.get('file');
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
      item = await uploadDispatch(ctx, env, filename, buf);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: reason }, statusForError(reason));
    }
    return c.json({ item }, 200);
  });

  return app;
}
