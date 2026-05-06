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

import { Hono } from 'hono';
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
    try {
      await readSidecar(ctx.projectRoot, entryId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.startsWith('sidecar not found') ? 404 : 500;
      return c.json({ error: `unknown entry: ${entryId}` }, status);
    }
    const minted: DraftAnnotation = mintEntryAnnotation(parsed.draft);
    try {
      await addEntryAnnotation(ctx.projectRoot, entryId, minted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // edit-comment / delete-comment writes that reference an unknown
      // commentId surface here as a 404; everything else is a 500.
      if (msg.includes('unknown commentId')) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 500);
    }
    return c.json({ annotation: minted });
  });

  // GET /api/dev/editorial-review/entry/:entryId/annotations
  app.get('/entry/:entryId/annotations', async (c) => {
    const entryId = c.req.param('entryId');
    const annotations = await listEntryAnnotations(ctx.projectRoot, entryId);
    return c.json({ annotations });
  });

  // Phase 35 (issue #199) — append-only edit + delete journal for
  // marginalia comments. PATCH appends an `edit-comment` annotation;
  // DELETE appends a `delete-comment` annotation. Both fold into the
  // active-comment view returned by the GET above; the original
  // `comment` annotation is preserved on disk as audit trail.

  // PATCH /api/dev/editorial-review/entry/:entryId/comments/:commentId
  app.patch('/entry/:entryId/comments/:commentId', async (c) => {
    const entryId = c.req.param('entryId');
    const commentId = c.req.param('commentId');
    if (!UUID_RE.test(entryId)) {
      return c.json({ error: `malformed entryId: ${entryId}` }, 400);
    }
    if (!UUID_RE.test(commentId)) {
      return c.json({ error: `malformed commentId: ${commentId}` }, 400);
    }
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
    try {
      await readSidecar(ctx.projectRoot, entryId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.startsWith('sidecar not found') ? 404 : 500;
      return c.json({ error: `unknown entry: ${entryId}` }, status);
    }
    const minted: DraftAnnotation = mintEntryAnnotation({
      type: 'edit-comment',
      workflowId: entryId,
      commentId,
      ...(parsed.fields.text !== undefined ? { text: parsed.fields.text } : {}),
      ...(parsed.fields.range !== undefined ? { range: parsed.fields.range } : {}),
      ...(parsed.fields.category !== undefined ? { category: parsed.fields.category } : {}),
      ...(parsed.fields.anchor !== undefined ? { anchor: parsed.fields.anchor } : {}),
    });
    try {
      await addEntryAnnotation(ctx.projectRoot, entryId, minted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unknown commentId')) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 500);
    }
    return c.json({ annotation: minted });
  });

  // DELETE /api/dev/editorial-review/entry/:entryId/comments/:commentId
  app.delete('/entry/:entryId/comments/:commentId', async (c) => {
    const entryId = c.req.param('entryId');
    const commentId = c.req.param('commentId');
    if (!UUID_RE.test(entryId)) {
      return c.json({ error: `malformed entryId: ${entryId}` }, 400);
    }
    if (!UUID_RE.test(commentId)) {
      return c.json({ error: `malformed commentId: ${commentId}` }, 400);
    }
    try {
      await readSidecar(ctx.projectRoot, entryId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.startsWith('sidecar not found') ? 404 : 500;
      return c.json({ error: `unknown entry: ${entryId}` }, status);
    }
    const minted: DraftAnnotation = mintEntryAnnotation({
      type: 'delete-comment',
      workflowId: entryId,
      commentId,
    });
    try {
      await addEntryAnnotation(ctx.projectRoot, entryId, minted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unknown commentId')) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 500);
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
    const entryId = c.req.param('entryId');
    if (!UUID_RE.test(entryId)) {
      return c.json({ error: `malformed entryId: ${entryId}` }, 400);
    }
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return c.json(
        { error: 'expected content-type: application/json' },
        400,
      );
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    if (typeof body !== 'object' || body === null) {
      return c.json({ error: 'expected JSON object body' }, 400);
    }
    const markdown = Reflect.get(body, 'markdown');
    if (typeof markdown !== 'string') {
      return c.json({ error: 'markdown (string) is required' }, 400);
    }
    try {
      await readSidecar(ctx.projectRoot, entryId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.startsWith('sidecar not found') ? 404 : 500;
      return c.json({ error: `unknown entry: ${entryId}` }, status);
    }
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
