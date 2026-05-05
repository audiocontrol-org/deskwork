/**
 * Mutation-envelope parsing for the studio scrapbook routes.
 *
 * Lives next to `scrapbook-mutations.ts`; extracted (#191) to keep the
 * route file under the project's 300–500 line cap. The single
 * responsibility is:
 *
 *   1. Validate the request envelope (`site`, `entryId | slug`, `secret?`).
 *   2. Validate `entryId` against the UUID regex BEFORE filesystem access
 *      (the scrapbook-file route's same pattern, landed in v0.15.0
 *      commit `14ffbe7`).
 *   3. Resolve the absolute scrapbook directory for whichever addressing
 *      mode the request used (entry-aware via `scrapbookDirForEntry`, or
 *      legacy slug-template via `scrapbookDir`).
 *
 * The envelope is a discriminated union (`mode: 'entry' | 'slug'`); call
 * sites narrow without `as` casts.
 */

import {
  scrapbookDir,
  scrapbookDirForEntry,
} from '@deskwork/core/scrapbook';
import { readSidecar } from '@deskwork/core/sidecar';
import type { StudioContext } from './api.ts';

// ---------------------------------------------------------------------------
// UUID validation
// ---------------------------------------------------------------------------

/**
 * Mirrors the UUID regex enforced on entry creation and used by the
 * scrapbook-file route. Rejects malformed `entryId` before it reaches
 * the filesystem — `readSidecar` composes its path as
 * `<projectRoot>/.deskwork/entries/<entryId>.json`, and `node:path`'s
 * join collapses `..` segments, so an unvalidated `entryId` could probe
 * arbitrary on-disk locations.
 */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Envelope types
// ---------------------------------------------------------------------------

/**
 * Successfully-parsed mutation envelope.
 *
 * Exactly one of `mode === 'entry'` or `mode === 'slug'` is set per
 * request — the discriminant tells the dispatch which addressing mode to
 * use without `as` casts at the call site.
 */
export type ParsedEnvelope =
  | {
      mode: 'entry';
      site: string;
      entryId: string;
      secret: boolean;
    }
  | {
      mode: 'slug';
      site: string;
      slug: string;
      secret: boolean;
    };

export interface EnvelopeError {
  error: string;
  status: 400 | 404;
}

export function isEnvelopeError(
  v: ParsedEnvelope | EnvelopeError,
): v is EnvelopeError {
  return 'error' in v;
}

// ---------------------------------------------------------------------------
// JSON envelope check
// ---------------------------------------------------------------------------

/**
 * Validate the common `{ site, entryId? | slug?, secret? }` envelope for
 * JSON-body routes. Returns a typed object or an `EnvelopeError` that
 * the caller propagates directly. The site existence check is here so
 * every mutation 404s on unknown sites the same way the read endpoint
 * does.
 *
 * `entryId` is preferred when both are present. UUID validation runs
 * BEFORE filesystem access for the same reason as the scrapbook-file
 * route — see the UUID_RE comment above.
 */
export function checkJsonEnvelope(
  ctx: StudioContext,
  body: Record<string, unknown>,
): ParsedEnvelope | EnvelopeError {
  const site = body.site;
  if (typeof site !== 'string' || site.length === 0) {
    return { error: 'site is required', status: 400 };
  }
  if (!(site in ctx.config.sites)) {
    return { error: `unknown site: ${site}`, status: 404 };
  }
  const secretRaw = body.secret;
  if (secretRaw !== undefined && typeof secretRaw !== 'boolean') {
    return { error: 'secret must be a boolean when provided', status: 400 };
  }
  const secret = secretRaw === true;

  const entryId = body.entryId;
  if (entryId !== undefined) {
    if (typeof entryId !== 'string' || entryId.length === 0) {
      return {
        error: 'entryId must be a non-empty string when provided',
        status: 400,
      };
    }
    if (!UUID_RE.test(entryId)) {
      return { error: 'invalid entryId', status: 400 };
    }
    return { mode: 'entry', site, entryId, secret };
  }

  // Back-compat slug-template fallback. To be removed in #192 once all
  // callers send entryId.
  const slug = body.slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    return { error: 'entryId or slug is required', status: 400 };
  }
  return { mode: 'slug', site, slug, secret };
}

// ---------------------------------------------------------------------------
// Multipart envelope check
// ---------------------------------------------------------------------------

/**
 * Same shape as `checkJsonEnvelope` but reads from a `FormData` instance.
 * Used by the upload route, which speaks multipart for binary file
 * payloads. The semantics match — `entryId` preferred, `slug` is the
 * deprecation-window fallback, UUID validation up-front.
 *
 * Note: the multipart `secret` field arrives as the literal string
 * `"true"` (form fields are always strings); we normalize it here so
 * the rest of the pipeline doesn't have to special-case form-vs-json.
 */
export function checkFormEnvelope(
  ctx: StudioContext,
  form: FormData,
): ParsedEnvelope | EnvelopeError {
  const site = form.get('site');
  if (typeof site !== 'string' || site.length === 0) {
    return { error: 'site is required', status: 400 };
  }
  if (!(site in ctx.config.sites)) {
    return { error: `unknown site: ${site}`, status: 404 };
  }
  const secretField = form.get('secret');
  const secret = typeof secretField === 'string' && secretField === 'true';

  const entryIdField = form.get('entryId');
  if (typeof entryIdField === 'string' && entryIdField.length > 0) {
    if (!UUID_RE.test(entryIdField)) {
      return { error: 'invalid entryId', status: 400 };
    }
    return { mode: 'entry', site, entryId: entryIdField, secret };
  }

  const slug = form.get('slug');
  if (typeof slug !== 'string' || slug.length === 0) {
    return { error: 'entryId or slug is required', status: 400 };
  }
  return { mode: 'slug', site, slug, secret };
}

// ---------------------------------------------------------------------------
// Directory resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute scrapbook directory for a parsed envelope. Entry-
 * id mode looks up the sidecar and uses `scrapbookDirForEntry`; slug
 * mode falls back to the legacy slug-template path.
 *
 * Throws on lookup / resolution failure; the caller maps the error
 * message onto the right HTTP status via `statusForError`.
 */
export async function resolveScrapbookDir(
  ctx: StudioContext,
  env: ParsedEnvelope,
): Promise<string> {
  if (env.mode === 'entry') {
    const entry = await readSidecar(ctx.projectRoot, env.entryId);
    return scrapbookDirForEntry(
      ctx.projectRoot,
      ctx.config,
      env.site,
      { id: entry.uuid, slug: entry.slug },
    );
  }
  return scrapbookDir(ctx.projectRoot, ctx.config, env.site, env.slug);
}
