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
import { approveEntryStage } from '@deskwork/core/entry/approve';
import { blockEntry } from '@deskwork/core/entry/block';
import { cancelEntry } from '@deskwork/core/entry/cancel';
import { inductEntry } from '@deskwork/core/entry/induct';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  mintEntryAnnotation,
} from '@deskwork/core/entry/annotations';
import { readSidecar } from '@deskwork/core/sidecar';
import { iterateEntry } from '@deskwork/core/iterate';
import type { Stage } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import type { OverrideResolver } from '@deskwork/core/overrides';
import type { DraftAnnotation } from '@deskwork/core/review/types';
import { parseEntryAnnotationBody } from './entry-annotation-body.ts';

const VALID_STAGES = new Set<Stage>([
  'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published',
]);

function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && VALID_STAGES.has(value as Stage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  // Phase 30 entry-stage actions (#146).
  // POST /api/dev/editorial-review/entry/:entryId/approve  → Ideas → Planned, etc.
  // POST /api/dev/editorial-review/entry/:entryId/block    → currentStage → Blocked
  // POST /api/dev/editorial-review/entry/:entryId/cancel   → currentStage → Cancelled
  // POST /api/dev/editorial-review/entry/:entryId/induct   → teleport to body.targetStage

  app.post('/entry/:entryId/approve', async (c) => {
    const entryId = c.req.param('entryId');
    try {
      const r = await approveEntryStage(ctx.projectRoot, { uuid: entryId });
      return c.json(r);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/entry/:entryId/block', async (c) => {
    const entryId = c.req.param('entryId');
    let body: { reason?: string } = {};
    try {
      const parsed = await c.req.json().catch(() => ({}));
      if (parsed && typeof parsed === 'object' && typeof (parsed as { reason?: unknown }).reason === 'string') {
        body = { reason: (parsed as { reason: string }).reason };
      }
    } catch {
      // body optional
    }
    try {
      const r = await blockEntry(ctx.projectRoot, { uuid: entryId, ...body });
      return c.json(r);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/entry/:entryId/cancel', async (c) => {
    const entryId = c.req.param('entryId');
    let body: { reason?: string } = {};
    try {
      const parsed = await c.req.json().catch(() => ({}));
      if (parsed && typeof parsed === 'object' && typeof (parsed as { reason?: unknown }).reason === 'string') {
        body = { reason: (parsed as { reason: string }).reason };
      }
    } catch {
      // body optional
    }
    try {
      const r = await cancelEntry(ctx.projectRoot, { uuid: entryId, ...body });
      return c.json(r);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/entry/:entryId/induct', async (c) => {
    const entryId = c.req.param('entryId');
    let parsed: unknown;
    try {
      parsed = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    if (!parsed || typeof parsed !== 'object') {
      return c.json({ error: 'expected JSON object body' }, 400);
    }
    const targetStage = (parsed as { targetStage?: unknown }).targetStage;
    if (!isStage(targetStage)) {
      return c.json({ error: 'targetStage must be one of Ideas|Planned|Outlining|Drafting|Final|Published' }, 400);
    }
    try {
      const r = await inductEntry(ctx.projectRoot, { uuid: entryId, targetStage });
      return c.json(r);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

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
    await addEntryAnnotation(ctx.projectRoot, entryId, minted);
    return c.json({ annotation: minted });
  });

  // GET /api/dev/editorial-review/entry/:entryId/annotations
  app.get('/entry/:entryId/annotations', async (c) => {
    const entryId = c.req.param('entryId');
    const annotations = await listEntryAnnotations(ctx.projectRoot, entryId);
    return c.json({ annotations });
  });

  // POST /api/dev/editorial-review/entry/:entryId/decision
  // Accepts the stage-changing decisions only: approve, block, cancel.
  // Other decision values are explicitly rejected with 400 — see
  // https://github.com/audiocontrol-org/deskwork/issues/171 (Phase 34a
  // umbrella) for the contract scope.
  app.post('/entry/:entryId/decision', async (c) => {
    const entryId = c.req.param('entryId');
    let parsed: unknown;
    try {
      parsed = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    if (!isRecord(parsed)) {
      return c.json({ error: 'expected JSON object body' }, 400);
    }
    const decision = parsed.decision;
    if (typeof decision !== 'string') {
      return c.json({ error: "decision is required (one of 'approve' | 'block' | 'cancel')" }, 400);
    }
    const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;
    try {
      switch (decision) {
        case 'approve': {
          const r = await approveEntryStage(ctx.projectRoot, { uuid: entryId });
          return c.json(r);
        }
        case 'block': {
          const r = await blockEntry(ctx.projectRoot, {
            uuid: entryId,
            ...(reason !== undefined ? { reason } : {}),
          });
          return c.json(r);
        }
        case 'cancel': {
          const r = await cancelEntry(ctx.projectRoot, {
            uuid: entryId,
            ...(reason !== undefined ? { reason } : {}),
          });
          return c.json(r);
        }
        default:
          return c.json(
            { error: `decision '${decision}' is not supported on this endpoint (valid: approve | block | cancel)` },
            400,
          );
      }
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/dev/editorial-review/entry/:entryId/version
  // Records a new iteration of the on-disk artifact for the entry's
  // current stage. Returns the IterateResult shape directly.
  app.post('/entry/:entryId/version', async (c) => {
    const entryId = c.req.param('entryId');
    try {
      const r = await iterateEntry(ctx.projectRoot, { uuid: entryId });
      return c.json(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.startsWith('sidecar not found') ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });

  return app;
}
