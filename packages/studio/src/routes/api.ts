/**
 * API route handlers for the studio. Each route is a thin wrapper over a
 * `lib/review/handlers.ts` function — it parses the HTTP request, calls
 * the handler with `(projectRoot, config, body)`, and serializes the
 * `{status, body}` result as JSON.
 *
 * Mirrors the audiocontrol Astro routes byte-for-byte so the existing
 * client code (editorial-review-client.ts, editorial-studio-client.ts)
 * keeps working without changes.
 *
 * Phase 34 split contract: endpoints under `/entry/:entryId/*` are the
 * canonical longform surface and operate on entry UUIDs. Bare
 * workflow-keyed endpoints (`/annotate`, `/annotations`, `/decision`,
 * `/workflow`, `/version`, `/start-shortform`) remain for shortform
 * pending its own migration phase. The two surfaces do not interoperate
 * — workflow-keyed annotations are NOT visible from entry-keyed
 * endpoints, and vice versa.
 */

import { Hono, type Context } from 'hono';
import {
  handleAnnotate,
  handleListAnnotations,
  handleDecision,
  handleGetWorkflow,
  handleCreateVersion,
  handleStartLongform,
} from '@deskwork/core/review/handlers';
import { handleStartShortform } from '@deskwork/core/review/start-handlers';
import { renderMarkdownToHtml } from '@deskwork/core/review/render';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  mintEntryAnnotation,
} from '@deskwork/core/entry/annotations';
import { computeDiffSlice } from '@deskwork/core/entry/diff-slice';
import { readSidecar } from '@deskwork/core/sidecar';
import type { DeskworkConfig } from '@deskwork/core/config';
import type { OverrideResolver } from '@deskwork/core/overrides';
import type { DraftAnnotation } from '@deskwork/core/review/types';
import { relative, isAbsolute } from 'node:path';
import {
  parseEntryAnnotationBody,
  parseEditCommentFields,
} from './entry-annotation-body.ts';
import { writeEntryBody } from '../lib/entry-resolver.ts';
import {
  persistEntryScreenshot,
  persistOrphanScreenshot,
} from '../lib/screenshot-persistence.ts';
import {
  attachScreenshotToCommentServer,
  promoteOrphanToEntry,
} from '../lib/screenshot-attach.ts';
import {
  extractScreenshotUploadFile,
  mapScreenshotErrorToResponse,
} from './screenshot-upload-helper.ts';

/**
 * Mirrors the UUID regex enforced on entry creation and used by the
 * scrapbook-* and entry-keyed page routes (commit `14ffbe7`). Reject
 * malformed `entryId` / `commentId` before reaching the journal — both
 * are persisted in `<projectRoot>/.deskwork/...` paths and an
 * unvalidated id can probe arbitrary on-disk locations.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the `:entryId` param off the Hono context and validate it
 * against `UUID_RE`. Returns the validated id, or a fully-formed
 * `Response` the caller should return immediately when the id is
 * malformed. Centralises the validation step that every
 * `/entry/:entryId/*` route performs identically; using a single
 * shape (id OR Response) keeps the caller's check at one line per
 * route, which avoids the clone-detection gate flagging the older
 * tagged-union pattern's `if (idResult.kind === 'err') ...` boilerplate.
 */
function readValidEntryId(c: Context): { entryId: string } | Response {
  const entryId = c.req.param('entryId');
  if (!UUID_RE.test(entryId)) {
    return c.json({ error: `malformed entryId: ${entryId}` }, 400);
  }
  return { entryId };
}

/**
 * Same shape as `readValidEntryId` for the comment-keyed routes. The
 * caller already has a validated entryId at this point — this helper
 * adds the commentId validation as a paired step.
 */
function readValidCommentId(c: Context): { commentId: string } | Response {
  const commentId = c.req.param('commentId');
  if (!UUID_RE.test(commentId)) {
    return c.json({ error: `malformed commentId: ${commentId}` }, 400);
  }
  return { commentId };
}

/**
 * Read AND validate both `:entryId` and `:commentId` params off the
 * Hono context in one call. The comment-keyed routes (`PATCH /entry/
 * :entryId/comments/:commentId`, `DELETE /entry/:entryId/comments/
 * :commentId`) always validate them as a pair; collapsing into one
 * helper keeps the per-route preamble at three lines instead of six
 * and avoids tripping the clone-detection gate on the paired-validation
 * shape.
 */
function readValidEntryAndCommentIds(
  c: Context,
): { entryId: string; commentId: string } | Response {
  const idResult = readValidEntryId(c);
  if (idResult instanceof Response) return idResult;
  const cidResult = readValidCommentId(c);
  if (cidResult instanceof Response) return cidResult;
  return { entryId: idResult.entryId, commentId: cidResult.commentId };
}

/**
 * Read the request body as a JSON object. Returns the parsed object,
 * or a fully-formed `Response` the caller should return immediately
 * when the parse fails (400 invalid JSON body) OR the parsed value
 * is not a plain object (400 expected JSON object body).
 *
 * Pulled up to a shared helper after the Phase 8 Step 8.4 routes
 * tripped the clone-detection gate on the let-body-try-catch-typeof
 * shape that previously lived inline at five+ call sites.
 */
/**
 * Map an annotation-write exception to an HTTP response. The append
 * path (`addEntryAnnotation` / `attachScreenshotToCommentServer`)
 * surfaces "unknown commentId ..." as 404 — every other error is
 * 500. Pulled up after the Phase 8 Step 8.4 attach route tripped
 * the clone-detection gate against the four+ existing catch-blocks
 * with this exact shape.
 */
function mapAnnotationWriteError(c: Context, err: unknown): Response {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('unknown commentId')) {
    return c.json({ error: msg }, 404);
  }
  return c.json({ error: msg }, 500);
}

async function readJsonObjectBody(
  c: Context,
): Promise<Record<string, unknown> | Response> {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return c.json({ error: 'expected JSON object body' }, 400);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Look up the entry's sidecar on disk; returns `null` on success.
 * Returns a fully-formed `Response` when the sidecar lookup fails —
 * 404 when the sidecar doesn't exist, 500 for anything else. Routes
 * that need to confirm the entry exists before proceeding compose
 * this helper at the top of the body so the shared 404 / 500
 * error-mapping logic isn't duplicated.
 */
async function lookupEntrySidecar(
  c: Context,
  projectRoot: string,
  entryId: string,
): Promise<Response | null> {
  try {
    await readSidecar(projectRoot, entryId);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith('sidecar not found') ? 404 : 500;
    return c.json({ error: `unknown entry: ${entryId}` }, status);
  }
}

/**
 * Narrow a `HandlerResult.body` (typed as `unknown`) to extract the
 * workflow id. Returns null when the shape doesn't match — phase 21c's
 * start-shortform route uses this to decide whether to augment the
 * response with a reviewUrl. Avoids `as`-casts on the body.
 */
function extractWorkflowId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const workflow = Reflect.get(body, 'workflow');
  if (typeof workflow !== 'object' || workflow === null) return null;
  const id = Reflect.get(workflow, 'id');
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Build a fresh response object that preserves every field from the
 * original handler body and adds `reviewUrl`. Iterates own keys via
 * `Object.entries` so the result is a plain `Record<string, unknown>`
 * rather than carrying the input's unknown-typed shape.
 */
function withReviewUrl(body: unknown, workflowId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof body === 'object' && body !== null) {
    for (const [k, v] of Object.entries(body)) {
      out[k] = v;
    }
  }
  out.reviewUrl = `/dev/editorial-review/${workflowId}`;
  return out;
}

export interface StudioContext {
  projectRoot: string;
  config: DeskworkConfig;
  /**
   * Clock injection point for tests. The dashboard / help pages render
   * a press-check date in the masthead; passing `now` lets tests stub a
   * deterministic value rather than asserting on `new Date()` output.
   * Defaults to "live" (a fresh `Date()` per render) in `createApp`.
   */
  now?: () => Date;
  /**
   * Phase 23f: per-project override resolver. Looks up
   * `<projectRoot>/.deskwork/{templates,prompts,doctor}/<name>.ts`.
   * Optional on the type so existing call sites that pre-date the
   * customization layer (and tests that only care about default
   * rendering) can omit it; `createApp` derives one from `projectRoot`
   * when not supplied. Production server boot constructs the resolver
   * once and threads it through.
   */
  resolver?: OverrideResolver;
}

export function createApiRouter(ctx: StudioContext): Hono {
  const app = new Hono();

  // POST /api/dev/editorial-review/annotate
  app.post('/annotate', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const r = handleAnnotate(ctx.projectRoot, ctx.config, body);
    return c.json(r.body, r.status as never);
  });

  // GET /api/dev/editorial-review/annotations?workflowId=...&version=...
  app.get('/annotations', (c) => {
    const r = handleListAnnotations(ctx.projectRoot, ctx.config, {
      workflowId: c.req.query('workflowId') ?? null,
      version: c.req.query('version') ?? null,
    });
    return c.json(r.body, r.status as never);
  });

  // POST /api/dev/editorial-review/decision
  app.post('/decision', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const r = handleDecision(ctx.projectRoot, ctx.config, body);
    return c.json(r.body, r.status as never);
  });

  // GET /api/dev/editorial-review/workflow?id=... or ?site=...&slug=...&...
  app.get('/workflow', (c) => {
    const r = handleGetWorkflow(ctx.projectRoot, ctx.config, {
      id: c.req.query('id') ?? null,
      site: c.req.query('site') ?? null,
      slug: c.req.query('slug') ?? null,
      contentKind: c.req.query('contentKind') ?? null,
      platform: c.req.query('platform') ?? null,
      channel: c.req.query('channel') ?? null,
    });
    return c.json(r.body, r.status as never);
  });

  // POST /api/dev/editorial-review/version
  app.post('/version', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const r = handleCreateVersion(ctx.projectRoot, ctx.config, body);
    return c.json(r.body, r.status as never);
  });

  // POST /api/dev/editorial-review/start-longform
  app.post('/start-longform', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const r = handleStartLongform(ctx.projectRoot, ctx.config, body);
    return c.json(r.body, r.status as never);
  });

  // POST /api/dev/editorial-review/start-shortform
  //
  // Phase 21c: Mirrors start-longform but for shortform workflows.
  // Augments the handler's success body with a `reviewUrl` so the
  // dashboard's matrix-cell start button can fetch + redirect in one
  // round-trip. The handler scaffolds the disk file (frontmatter +
  // initial body) when missing and is idempotent on
  // (entryId|site+slug, contentKind, platform, channel).
  app.post('/start-shortform', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const r = handleStartShortform(ctx.projectRoot, ctx.config, body);
    const workflowId = extractWorkflowId(r.body);
    if (r.status === 200 && workflowId !== null) {
      const augmented = withReviewUrl(r.body, workflowId);
      return c.json(augmented, 200);
    }
    return c.json(r.body, r.status as never);
  });

  // POST /api/dev/editorial-review/render
  //
  // Replaces the upstream client-side dynamic import of
  // `scripts/lib/editorial-review/render.js`. The preview pane in
  // `editorial-review-client.ts` POSTs the markdown source here and
  // gets HTML back. Centralising the render keeps the unified pipeline
  // (remark-parse + remark-strip-first-h1 + remark-image-figure +
  // remark-rehype + rehype-stringify) on the server, where it already
  // runs for the initial review-page render — one source of truth.
  app.post('/render', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'expected JSON object body' }, 400);
    }
    const markdown = (body as { markdown?: unknown }).markdown;
    if (typeof markdown !== 'string') {
      return c.json({ error: 'markdown (string) is required' }, 400);
    }
    try {
      const html = await renderMarkdownToHtml(markdown);
      return c.json({ html });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: `render failed: ${reason}` }, 500);
    }
  });

  // Phase 30 entry-stage action endpoints (approve / block / cancel / induct)
  // were retired in #189: those mutations belong to skills, not to the
  // studio's API surface. The studio's review-surface buttons now
  // copy `/deskwork:<verb> <slug>` to the operator's clipboard via
  // `copyOrShowFallback`; the operator pastes into Claude Code where
  // the skill runs. See THESIS.md Consequence 2.

  // Phase 34a entry-keyed longform endpoints (#170 / #171).
  // These nest under the same `/entry/:entryId/` prefix as the stage
  // actions above; together they form the canonical longform surface.

  // POST /api/dev/editorial-review/entry/:entryId/annotate
  app.post('/entry/:entryId/annotate', async (c) => {
    const entryId = c.req.param('entryId');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const parsed = parseEntryAnnotationBody(body);
    if (parsed.kind === 'err') {
      return c.json({ error: parsed.message }, parsed.status);
    }
    const sidecarErr = await lookupEntrySidecar(c, ctx.projectRoot, entryId);
    if (sidecarErr !== null) return sidecarErr;
    const minted: DraftAnnotation = mintEntryAnnotation(parsed.draft);
    try {
      await addEntryAnnotation(ctx.projectRoot, entryId, minted);
    } catch (err) {
      // edit-comment / delete-comment writes that reference an unknown
      // commentId surface as 404 via mapAnnotationWriteError; everything
      // else is a 500.
      return mapAnnotationWriteError(c, err);
    }
    return c.json({ annotation: minted });
  });

  // GET /api/dev/editorial-review/entry/:entryId/annotations
  app.get('/entry/:entryId/annotations', async (c) => {
    const entryId = c.req.param('entryId');
    const annotations = await listEntryAnnotations(ctx.projectRoot, entryId);
    return c.json({ annotations });
  });

  // GET /api/dev/editorial-review/entry/:entryId/diff-slice?commentId=<id>&revision=<n>
  //
  // Phase 8 Step 8.6.2 — per-comment inline diff-slicing for the
  // "addressed" badge expansion. Returns the subset of unified-diff
  // hunks between iteration revisions N-1 and N that intersect the
  // comment's anchor region, paired with the disposition `reason`
  // (Step 8.1.2). The client renders the reason as a header line and
  // the hunks as a side-by-side mini-diff inline under the badge.
  //
  // Status codes:
  //   400 — malformed entryId / commentId; missing or non-numeric
  //         revision; revision < 1.
  //   404 — entry not found; OR commentId does not resolve to a
  //         comment on the entry; OR no `address` annotation with
  //         disposition `addressed` exists for the comment + revision
  //         pair (computeDiffSlice returns null in both cases).
  //   200 — `{ reason, hunks: Hunk[], notes?: string }`. Empty
  //         `hunks` + present `notes` surfaces the operator-readable
  //         explanation (first iteration, spatial-anchor limitation,
  //         etc.); empty `hunks` without `notes` is the "addressed
  //         without local diff" case (Step 8.6.4 fallback).
  app.get('/entry/:entryId/diff-slice', async (c) => {
    const idResult = readValidEntryId(c);
    if (idResult instanceof Response) return idResult;
    const { entryId } = idResult;
    const commentId = c.req.query('commentId') ?? '';
    if (!UUID_RE.test(commentId)) {
      return c.json({ error: `malformed commentId: ${commentId}` }, 400);
    }
    const revRaw = c.req.query('revision') ?? '';
    const revision = Number.parseInt(revRaw, 10);
    if (!Number.isFinite(revision) || revision < 1 || String(revision) !== revRaw) {
      return c.json(
        { error: `revision query parameter must be a positive integer (got ${JSON.stringify(revRaw)})` },
        400,
      );
    }
    const sidecarErr = await lookupEntrySidecar(c, ctx.projectRoot, entryId);
    if (sidecarErr !== null) return sidecarErr;
    const slice = await computeDiffSlice(ctx.projectRoot, entryId, commentId, revision);
    if (slice === null) {
      return c.json(
        { error: `no addressed annotation for commentId=${commentId} on revision=${revision}` },
        404,
      );
    }
    return c.json({
      reason: slice.reason,
      hunks: slice.hunks,
      ...(slice.notes !== undefined ? { notes: slice.notes } : {}),
    });
  });

  // Phase 35 (issue #199) — append-only edit + delete journal for
  // marginalia comments. PATCH appends an `edit-comment` annotation;
  // DELETE appends a `delete-comment` annotation. Both fold into the
  // active-comment view returned by the GET above; the original
  // `comment` annotation is preserved on disk as audit trail.

  // POST /api/dev/editorial-review/entry/:entryId/screenshot
  //
  // Phase 8 Step 8.3.3 — entry-anchored screenshot persistence. The
  // client (post-capture, via `captureElementToPng` from
  // `entry-review/screenshot-capture.ts`) POSTs the PNG bytes as a
  // multipart `file` field; the route writes them under
  // `<entryDir>/scrapbook/screenshots/<filename>` where `<filename>`
  // follows the PRD convention (`<commentId>-<ISO-timestamp>.png`).
  //
  // Status codes:
  //   400 — malformed entryId; missing / malformed `file` field;
  //         filename fails the safe-name regex.
  //   404 — entry sidecar not found.
  //   409 — a file already exists at the target path (filename
  //         collisions indicate a client bug — see the PRD convention).
  //   200 — `{ writtenPath, relativeWrittenPath }`.
  //
  // Binding the screenshot to a comment (the `attachments[]` field)
  // is Task 8.4's concern; this route lands the raw write path only.
  app.post('/entry/:entryId/screenshot', async (c) => {
    const idResult = readValidEntryId(c);
    if (idResult instanceof Response) return idResult;
    const { entryId } = idResult;
    const extracted = await extractScreenshotUploadFile(c);
    if (extracted.kind === 'err') {
      return c.json({ error: extracted.message }, extracted.status);
    }
    try {
      const result = await persistEntryScreenshot(
        ctx.projectRoot,
        entryId,
        extracted.filename,
        extracted.bytes,
      );
      return c.json(
        {
          writtenPath: result.writtenPath,
          relativeWrittenPath: result.relativeWrittenPath,
        },
        200,
      );
    } catch (err) {
      const mapped = mapScreenshotErrorToResponse(err, { entryId });
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  // POST /api/dev/editorial-review/screenshots/orphan
  //
  // Phase 8 Step 8.3.3 — orphan-path screenshot persistence (the
  // capture-then-attach flow). Writes bytes to
  // `<projectRoot>/.deskwork/screenshots-orphan/<filename>`. The file
  // is moved to an entry-anchored path when Task 8.4's attach flow
  // binds it to a comment.
  //
  // Status codes mirror the entry-anchored route (no 404 — there is
  // no entry to look up).
  app.post('/screenshots/orphan', async (c) => {
    const extracted = await extractScreenshotUploadFile(c);
    if (extracted.kind === 'err') {
      return c.json({ error: extracted.message }, extracted.status);
    }
    try {
      const result = await persistOrphanScreenshot(
        ctx.projectRoot,
        extracted.filename,
        extracted.bytes,
      );
      return c.json(
        {
          writtenPath: result.writtenPath,
          relativeWrittenPath: result.relativeWrittenPath,
        },
        200,
      );
    } catch (err) {
      const mapped = mapScreenshotErrorToResponse(err);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  // POST /api/dev/editorial-review/entry/:entryId/comment/:commentId/attach
  //
  // Phase 8 Step 8.4.1 — bind a previously-persisted screenshot path
  // to an existing comment's `attachments[]` field. Request body:
  // JSON object with `{ relativePath: string }` — the project-root-
  // relative path the screenshot was persisted at (matches the
  // `relativeWrittenPath` field returned by the Step 8.3.3
  // entry-screenshot endpoint).
  //
  // The server reads the comment's current attachments via the
  // folded annotation list, composes `[...prior, relativePath]`,
  // mints an `edit-comment` annotation carrying the full intended
  // list, and appends it to the journal. Returns the minted
  // annotation + the post-attach attachments[] so the client can
  // patch its in-memory cache without re-fetching.
  //
  // Status codes:
  //   400 — malformed entryId / commentId; missing or non-string
  //         relativePath; empty relativePath.
  //   404 — unknown entry sidecar; OR commentId not present in the
  //         entry's stream.
  //   200 — `{ annotation, attachments }`.
  app.post('/entry/:entryId/comment/:commentId/attach', async (c) => {
    const idsResult = readValidEntryAndCommentIds(c);
    if (idsResult instanceof Response) return idsResult;
    const { entryId, commentId } = idsResult;
    const body = await readJsonObjectBody(c);
    if (body instanceof Response) return body;
    const relativePath = Reflect.get(body, 'relativePath');
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      return c.json(
        { error: 'relativePath (non-empty string) is required' },
        400,
      );
    }
    const sidecarErr = await lookupEntrySidecar(c, ctx.projectRoot, entryId);
    if (sidecarErr !== null) return sidecarErr;
    try {
      const result = await attachScreenshotToCommentServer(
        ctx.projectRoot,
        entryId,
        commentId,
        relativePath,
      );
      return c.json(
        {
          annotation: result.annotation,
          attachments: result.attachments,
        },
        200,
      );
    } catch (err) {
      return mapAnnotationWriteError(c, err);
    }
  });

  // POST /api/dev/editorial-review/screenshots/orphan/:filename/promote-to-entry/:entryId/comment/:commentId
  //
  // Phase 8 Step 8.4.1 + 8.4.2 — move an orphan-path screenshot to
  // an entry-anchored path AND attach it to the named comment. Request
  // body is OPTIONAL JSON `{ sourceEntry?: string }`: when present and
  // different from `:entryId`, a `<filename>.meta.json` sidecar lands
  // next to the moved file naming the source entry (the cross-entry
  // case).
  //
  // Status codes:
  //   400 — malformed entryId / commentId / filename / sourceEntry.
  //   404 — entry sidecar not found; OR commentId not in entry stream;
  //         OR orphan file not present.
  //   409 — file already exists at the destination path.
  //   200 — `{ annotation, attachments, writtenPath, relativeWrittenPath, sidecarMetaPath }`.
  app.post(
    '/screenshots/orphan/:filename/promote-to-entry/:entryId/comment/:commentId',
    async (c) => {
      const filename = c.req.param('filename');
      const idsResult = readValidEntryAndCommentIds(c);
      if (idsResult instanceof Response) return idsResult;
      const { entryId, commentId } = idsResult;
      let body: unknown = {};
      // Body is optional. Only attempt JSON parse when content-type
      // hints at it — a bare POST without a body is the in-entry
      // (non-cross-entry) common case.
      const contentType = c.req.header('content-type') ?? '';
      if (contentType.toLowerCase().includes('application/json')) {
        try {
          body = await c.req.json();
        } catch {
          return c.json({ error: 'invalid JSON body' }, 400);
        }
        if (typeof body !== 'object' || body === null) {
          return c.json({ error: 'expected JSON object body' }, 400);
        }
      }
      const sourceRaw = Reflect.get(body, 'sourceEntry');
      const sourceEntry =
        typeof sourceRaw === 'string' && sourceRaw.length > 0
          ? sourceRaw
          : undefined;
      try {
        const result = await promoteOrphanToEntry(
          ctx.projectRoot,
          filename,
          entryId,
          commentId,
          sourceEntry !== undefined ? { sourceEntry } : {},
        );
        return c.json(
          {
            annotation: result.annotation,
            attachments: result.attachments,
            writtenPath: result.writtenPath,
            relativeWrittenPath: result.relativeWrittenPath,
            sidecarMetaPath: result.sidecarMetaPath,
          },
          200,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('malformed ')) {
          return c.json({ error: msg }, 400);
        }
        if (msg.startsWith('screenshot filename') || msg === 'screenshot filename is required') {
          return c.json({ error: msg }, 400);
        }
        if (msg.startsWith('orphan screenshot not found')) {
          return c.json({ error: msg }, 404);
        }
        if (msg.startsWith('sidecar not found')) {
          return c.json({ error: `unknown entry: ${entryId}` }, 404);
        }
        if (msg.includes('unknown commentId')) {
          return c.json({ error: msg }, 404);
        }
        if (msg.startsWith('screenshot already exists at ')) {
          return c.json({ error: msg }, 409);
        }
        if (msg.startsWith('screenshot sidecar metadata already exists at ')) {
          return c.json({ error: msg }, 409);
        }
        return c.json({ error: msg }, 500);
      }
    },
  );

  // PATCH /api/dev/editorial-review/entry/:entryId/comments/:commentId
  app.patch('/entry/:entryId/comments/:commentId', async (c) => {
    const idsResult = readValidEntryAndCommentIds(c);
    if (idsResult instanceof Response) return idsResult;
    const { entryId, commentId } = idsResult;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const parsed = parseEditCommentFields(body);
    if (parsed.kind === 'err') {
      return c.json({ error: parsed.message }, parsed.status);
    }
    const sidecarErr = await lookupEntrySidecar(c, ctx.projectRoot, entryId);
    if (sidecarErr !== null) return sidecarErr;
    const minted: DraftAnnotation = mintEntryAnnotation({
      type: 'edit-comment',
      workflowId: entryId,
      commentId,
      ...(parsed.fields.text !== undefined ? { text: parsed.fields.text } : {}),
      ...(parsed.fields.range !== undefined ? { range: parsed.fields.range } : {}),
      ...(parsed.fields.category !== undefined ? { category: parsed.fields.category } : {}),
      ...(parsed.fields.anchor !== undefined ? { anchor: parsed.fields.anchor } : {}),
      ...(parsed.fields.attachments !== undefined
        ? { attachments: parsed.fields.attachments }
        : {}),
    });
    try {
      await addEntryAnnotation(ctx.projectRoot, entryId, minted);
    } catch (err) {
      return mapAnnotationWriteError(c, err);
    }
    return c.json({ annotation: minted });
  });

  // DELETE /api/dev/editorial-review/entry/:entryId/comments/:commentId
  app.delete('/entry/:entryId/comments/:commentId', async (c) => {
    const idsResult = readValidEntryAndCommentIds(c);
    if (idsResult instanceof Response) return idsResult;
    const { entryId, commentId } = idsResult;
    const sidecarErr = await lookupEntrySidecar(c, ctx.projectRoot, entryId);
    if (sidecarErr !== null) return sidecarErr;
    const minted: DraftAnnotation = mintEntryAnnotation({
      type: 'delete-comment',
      workflowId: entryId,
      commentId,
    });
    try {
      await addEntryAnnotation(ctx.projectRoot, entryId, minted);
    } catch (err) {
      return mapAnnotationWriteError(c, err);
    }
    return c.json({ annotation: minted });
  });

  // PUT /api/dev/editorial-review/entry/:entryId/body
  //
  // Issue #174 — Save = dumb file write to the entry's canonical
  // document path. NO version bump, NO journal record, NO state-machine
  // mutation. State-machine work (pinning a version, flipping
  // in-review) stays with `/deskwork:iterate`; Save and Iterate are
  // orthogonal. Per THESIS.md Consequence 2, file-body mutation is the
  // ONE mutation the studio is allowed to perform on the operator's
  // content tree.
  //
  // The write target resolves through the SAME `resolveIndexPath`
  // helper the read path uses (`packages/studio/src/lib/entry-resolver.ts`)
  // so Save addresses exactly the file the editor is showing.
  app.put('/entry/:entryId/body', async (c) => {
    const idResult = readValidEntryId(c);
    if (idResult instanceof Response) return idResult;
    const { entryId } = idResult;
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return c.json(
        { error: 'expected content-type: application/json' },
        400,
      );
    }
    const body = await readJsonObjectBody(c);
    if (body instanceof Response) return body;
    const markdown = Reflect.get(body, 'markdown');
    if (typeof markdown !== 'string') {
      return c.json({ error: 'markdown (string) is required' }, 400);
    }
    const sidecarErr = await lookupEntrySidecar(c, ctx.projectRoot, entryId);
    if (sidecarErr !== null) return sidecarErr;
    try {
      const result = await writeEntryBody(ctx.projectRoot, entryId, markdown);
      // Surface the path relative to the project root when possible so
      // the response doesn't leak absolute filesystem paths to the
      // browser. Falls back to the absolute path for entries whose
      // canonical document lives outside the project root (atypical).
      const rel = relative(ctx.projectRoot, result.writtenPath);
      const writtenPath =
        rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
          ? rel
          : result.writtenPath;
      return c.json({ ok: true, writtenPath });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: `write failed: ${reason}` }, 500);
    }
  });

  // The entry-keyed `/entry/:entryId/decision` and `/entry/:entryId/version`
  // endpoints were retired alongside the verb endpoints above (#189). The
  // studio's review-surface Approve / Iterate buttons now copy
  // `/deskwork:approve <slug>` / `/deskwork:iterate <slug>` to the
  // clipboard. State-machine mutation belongs to the skill.

  return app;
}
