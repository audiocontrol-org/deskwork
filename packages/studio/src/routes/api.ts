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
import type { DeskworkConfig } from '@deskwork/core/config';

export interface StudioContext {
  projectRoot: string;
  config: DeskworkConfig;
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

  return app;
}
