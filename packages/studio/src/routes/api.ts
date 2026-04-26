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
import { renderMarkdownToHtml } from '@deskwork/core/review/render';
import type { DeskworkConfig } from '@deskwork/core/config';

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
