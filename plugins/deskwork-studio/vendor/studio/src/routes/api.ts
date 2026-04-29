/**
 * API route handlers for the studio. Each route is a thin wrapper over a
 * `lib/review/handlers.ts` function — it parses the HTTP request, calls
 * the handler with `(projectRoot, config, body)`, and serializes the
 * `{status, body}` result as JSON.
 *
 * Mirrors the audiocontrol Astro routes byte-for-byte so the existing
 * client code (editorial-review-client.ts, editorial-studio-client.ts)
 * keeps working without changes.
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
import type { DeskworkConfig } from '@deskwork/core/config';
import type { OverrideResolver } from '@deskwork/core/overrides';

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

  return app;
}
