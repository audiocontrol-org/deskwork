#!/usr/bin/env node
/**
 * @deskwork/studio — local web server for the editorial review surface.
 *
 * Usage:
 *   deskwork-studio [--project-root <path>] [--port <n>] [--host <addr>]
 *
 * Defaults:
 *   --project-root  process.cwd()
 *   --port          47321  (avoids the Astro dev server's default 4321)
 *   --host          127.0.0.1 (loopback only — see security note in main())
 *
 * The server reads .deskwork/config.json from the project root, then
 * exposes:
 *   - GET  /dev/editorial-studio                — dashboard
 *   - GET  /dev/editorial-review/<slug>         — per-post review page
 *   - GET  /dev/editorial-review-shortform      — shortform review
 *   - POST /api/dev/editorial-review/*          — 6 mutation endpoints
 *   - GET  /api/dev/editorial-review/*          — 2 read endpoints
 *   - GET  /static/*                            — UI assets (HTML/CSS/JS)
 *
 * The handlers live in @deskwork/core/review/handlers and produce
 * exactly the JSON shapes audiocontrol's Astro routes used to produce.
 * The browser-side client code (ported from
 * audiocontrol/src/shared/editorial-*) speaks to those endpoints
 * unchanged.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { listenWithAutoIncrement } from './listen.ts';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '@deskwork/core/config';
import { readCalendar } from '@deskwork/core/calendar';
import { resolveCalendarPath } from '@deskwork/core/paths';
import { readWorkflow } from '@deskwork/core/review/pipeline';
import { createApiRouter, type StudioContext } from './routes/api.ts';
import { serveScrapbookFile } from './routes/scrapbook-file.ts';
import { createScrapbookMutationsRouter } from './routes/scrapbook-mutations.ts';
import { buildClientAssets } from './build-client-assets.ts';
import { renderDashboard } from './pages/dashboard.ts';
import { renderReviewPage, type ReviewLookup } from './pages/review.ts';
import { renderEntryReviewPage } from './pages/entry-review.ts';
import { renderShortformPage } from './pages/shortform.ts';
import { renderHelpPage } from './pages/help.ts';
import { renderScrapbookPage } from './pages/scrapbook.ts';
import {
  renderContentTopLevel,
  renderContentProject,
} from './pages/content.ts';
import { renderStudioIndex } from './pages/index.ts';
import { detectTailscale, type TailscaleInfo } from './tailscale.ts';
import {
  contentIndexMiddleware,
  getRequestContentIndex,
} from './request-context.ts';
import { runTemplateOverride } from './lib/override-render.ts';
import { getStudioVersion } from './lib/version.ts';
import { createOverrideResolver } from '@deskwork/core/overrides';

interface CliArgs {
  projectRoot: string;
  port: number;
  /**
   * True when the operator passed `--port` (or `-p`). When true, the
   * listener refuses to auto-increment on EADDRINUSE — the operator
   * asked for a specific port, so failure is surfaced loudly.
   */
  portExplicit: boolean;
  /**
   * Bind address explicitly requested by the operator via --host.
   * `null` means "use the default policy" — bind to loopback AND any
   * detected Tailscale interface (unless `--no-tailscale` was passed,
   * in which case loopback only).
   */
  hostOverride: string | null;
  /** When true, skip Tailscale auto-detection even if it's running. */
  noTailscale: boolean;
}

const DEFAULT_PORT = 47321;
const LOOPBACK = '127.0.0.1';

export function parseCliArgs(argv: string[]): CliArgs {
  let projectRoot = process.cwd();
  let port = DEFAULT_PORT;
  let portExplicit = false;
  let hostOverride: string | null = null;
  let noTailscale = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project-root' || a === '-r') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      projectRoot = next;
    } else if (a.startsWith('--project-root=')) {
      projectRoot = a.slice('--project-root='.length);
    } else if (a === '--port' || a === '-p') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      port = parseInt(next, 10);
      portExplicit = true;
    } else if (a.startsWith('--port=')) {
      port = parseInt(a.slice('--port='.length), 10);
      portExplicit = true;
    } else if (a === '--host' || a === '-H') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      hostOverride = next;
    } else if (a.startsWith('--host=')) {
      hostOverride = a.slice('--host='.length);
    } else if (a === '--no-tailscale') {
      noTailscale = true;
    } else if (a === '--help' || a === '-h') {
      usage(null);
    } else {
      usage(`unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    usage(`invalid port: ${port}`);
  }
  return {
    projectRoot: isAbsolute(projectRoot) ? projectRoot : resolve(process.cwd(), projectRoot),
    port,
    portExplicit,
    hostOverride,
    noTailscale,
  };
}

function usage(error: string | null): never {
  const out = error ? process.stderr : process.stdout;
  if (error) out.write(`error: ${error}\n\n`);
  out.write('Usage: deskwork-studio [--project-root <path>] [--port <n>] [--host <addr>] [--no-tailscale]\n');
  out.write('\n');
  out.write('Options:\n');
  out.write('  -r, --project-root <path>   project root containing .deskwork/config.json\n');
  out.write('                              (default: cwd)\n');
  out.write(`  -p, --port <n>              listen on this port (default: ${DEFAULT_PORT})\n`);
  out.write('  -H, --host <addr>           bind address. When set, the studio binds ONLY to\n');
  out.write('                              this address — overrides Tailscale auto-detection.\n');
  out.write('                              Use 0.0.0.0 to expose on every interface (LAN +\n');
  out.write('                              Tailscale + Wi-Fi). Studio has no auth; only do this\n');
  out.write('                              on trusted networks.\n');
  out.write('      --no-tailscale          skip Tailscale auto-detection (loopback only)\n');
  out.write('  -h, --help                  show this message\n');
  out.write('\n');
  out.write('Default networking policy: bind to 127.0.0.1 (loopback) AND, if Tailscale is\n');
  out.write('running on this machine, the local Tailscale interface(s). Tailscale peers can\n');
  out.write("then reach the studio at the magic-DNS hostname (e.g. '<machine>.<tailnet>.ts.net').\n");
  process.exit(error ? 2 : 0);
}

/**
 * Resolve a UUID `id` against the calendar for `site` and return a
 * `ReviewLookup` carrying both the id and the entry's display slug.
 * Returns null when the id doesn't match any calendar entry — the
 * caller then renders a "no galley to review" error page.
 */
function resolveEntryById(
  ctx: StudioContext,
  site: string,
  id: string,
): ReviewLookup | null {
  if (!(site in ctx.config.sites)) return null;
  try {
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    if (!existsSync(calendarPath)) return null;
    const cal = readCalendar(calendarPath);
    const entry = cal.entries.find((e) => e.id === id);
    if (!entry || entry.id === undefined) return null;
    return { kind: 'id', entryId: entry.id, slug: entry.slug };
  } catch {
    return null;
  }
}

/**
 * Resolve a slug to either:
 *   - `{ kind: 'id', entryId, slug }` when the entry has a stable id
 *     stamped — caller 302-redirects to the canonical id URL.
 *   - `{ kind: 'slug', slug }` when the entry exists but has no id
 *     (pre-doctor migration state) — caller renders directly.
 *   - `null` when no entry matches the slug — caller renders 404.
 *   - `'unknown-site'` when the site param isn't configured.
 */
function resolveEntryBySlug(
  ctx: StudioContext,
  site: string,
  slug: string,
): ReviewLookup | null | 'unknown-site' {
  if (!(site in ctx.config.sites)) return 'unknown-site';
  try {
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    if (!existsSync(calendarPath)) return null;
    const cal = readCalendar(calendarPath);
    const entry = cal.entries.find((e) => e.slug === slug);
    if (!entry) return null;
    if (entry.id) return { kind: 'id', entryId: entry.id, slug: entry.slug };
    return { kind: 'slug', slug: entry.slug };
  } catch {
    return null;
  }
}

/**
 * Build the canonical id-based redirect URL while preserving the
 * original request's query string (site, version, kind, etc.). The
 * input URL is the absolute request URL (Hono's `c.req.url`); we
 * extract just the search portion and graft it onto the new path.
 */
function buildReviewRedirectUrl(entryId: string, requestUrl: string): string {
  let search = '';
  try {
    const u = new URL(requestUrl);
    search = u.search;
  } catch {
    search = '';
  }
  return `/dev/editorial-review/${entryId}${search}`;
}

/**
 * Resolve the plugin tree root (`plugins/deskwork-studio/`) at runtime.
 *
 * Three runtime layouts (Phase 23 source-shipped re-architecture):
 *   - Workspace: `packages/studio/src/server.ts` (run via the workspace
 *     bin symlink) → plugin root is `<HERE>/../../../plugins/deskwork-studio`.
 *   - Marketplace (legacy node_modules layout): `<pluginRoot>/node_modules/
 *     @deskwork/studio/src/server.ts` → plugin root is `<HERE>/../../../..`.
 *   - Marketplace (materialized vendor layout, Phase 23c): npm symlinks
 *     `node_modules/@deskwork/studio` → `vendor/studio`, so `import.meta.url`
 *     resolves through the symlink to `<pluginRoot>/vendor/studio/src/server.ts`
 *     → plugin root is `<HERE>/../../..`. Surfaced by the Phase 23g
 *     `scripts/smoke-marketplace.sh` smoke test, which boots the studio
 *     against an extracted+materialized tree and asserts every route 200s.
 *
 * All candidates are tried; whichever has a `public/src/` directory
 * adjacent wins. `public/src/` ships in the plugin tree only.
 */
function pluginRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', '..', '..', 'plugins', 'deskwork-studio'),
    resolve(here, '..', '..', '..', '..'),
    resolve(here, '..', '..', '..'),
  ];
  for (const candidate of candidates) {
    // Use the plugin's marker file (public/src exists in both layouts)
    // to avoid grabbing an unrelated parent dir.
    if (existsSync(resolve(candidate, 'public', 'src'))) return candidate;
  }
  throw new Error(
    `deskwork-studio: could not find plugin root. Tried:\n  ${candidates.join('\n  ')}`,
  );
}

function publicDir(): string {
  // CSS, source modules, and any other static assets live under
  // `<pluginRoot>/public/`. Compiled client JS does NOT live here in
  // the runtime-built path (Phase 23e) — see clientAssetsDir().
  const root = resolve(pluginRoot(), 'public');
  if (!existsSync(root)) {
    throw new Error(
      `deskwork-studio: could not find public/ assets at ${root}`,
    );
  }
  return root;
}

/**
 * Path to runtime-built client modules
 * (`<pluginRoot>/.runtime-cache/dist/`). Phase 23e builds into this dir
 * during boot; the `/static/dist/*` mount serves from it.
 */
function clientAssetsDir(): string {
  return resolve(pluginRoot(), '.runtime-cache', 'dist');
}

export function createApp(ctx: StudioContext): Hono {
  const app = new Hono();

  // Per-request content-index memoization. Mounted before page routes
  // so every renderer in a single request shares one index per site.
  // The middleware just attaches an empty cache; renderers populate it
  // lazily via `getRequestContentIndex(c, ctx, site)`.
  app.use('*', contentIndexMiddleware());

  // API routes
  app.route('/api/dev/editorial-review', createApiRouter(ctx));

  // #111: version endpoint so adopters / scripts can verify which studio
  // build is actually running. Surfaced in the dashboard masthead too.
  app.get('/api/dev/version', (c) => c.json({ version: getStudioVersion() }));

  // #144: bare `/dev/editorial-review` (no UUID, no slug) redirects to
  // the dashboard. The Index page promised a meaningful default; the
  // dashboard IS the canonical entry point for picking which entry to
  // review.
  app.get('/dev/editorial-review', (c) => c.redirect('/dev/editorial-studio'));
  app.get('/dev/editorial-review/', (c) => c.redirect('/dev/editorial-studio'));

  // Page routes
  app.get('/dev', async (c) => c.html(await renderStudioIndex(ctx)));
  app.get('/dev/', async (c) => c.html(await renderStudioIndex(ctx)));
  app.get('/dev/editorial-studio', async (c) => {
    const getIndex = (site: string) => getRequestContentIndex(c, ctx, site);
    // Phase 23f: per-project override check. The override module's
    // `default` is called with the same args the built-in renderer
    // expects: (ctx, getIndex). When no override exists, we fall
    // through to the built-in dashboard.
    const overridden = await runTemplateOverride(ctx, 'dashboard', [
      ctx,
      getIndex,
    ]);
    if (overridden !== null) return c.html(overridden);
    return c.html(await renderDashboard(ctx, getIndex));
  });
  app.get('/dev/editorial-help', async (c) => {
    const overridden = await runTemplateOverride(ctx, 'help', [ctx]);
    if (overridden !== null) return c.html(overridden);
    return c.html(renderHelpPage(ctx));
  });
  app.get('/dev/editorial-review-shortform', (c) =>
    c.html(renderShortformPage(ctx)),
  );
  // Pipeline-redesign Task 35: entry-uuid keyed review surface. The
  // path `/dev/editorial-review/entry/<uuid>` distinguishes this sibling
  // route from the legacy workflow-uuid + calendar-entry routes below.
  // The handler resolves the uuid to a sidecar via `resolveEntry()` and
  // renders the eight-stage entry view with stage-aware affordances.
  // Registered FIRST so the literal "entry" segment is matched before
  // the slug catch-all below has a chance to swallow it.
  app.get(
    '/dev/editorial-review/entry/:entryId{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}',
    async (c) => {
      const entryId = c.req.param('entryId');
      const getIndex = (s: string) => getRequestContentIndex(c, ctx, s);
      const result = await renderEntryReviewPage(
        ctx,
        entryId,
        { version: c.req.query('v') ?? null },
        getIndex,
      );
      return c.html(result.html, result.status);
    },
  );
  // Phase 19d: id-based canonical review URL. Strict UUID-shape regex
  // matched FIRST so it wins over the legacy `:slug{.+}` route below.
  // Hono evaluates routes in registration order; first match wins.
  //
  // DEPRECATED (pipeline-redesign Task 35): this route is workflow-uuid
  // + calendar-entry keyed; the entry-centric replacement lives at
  // `/dev/editorial-review/entry/<uuid>` (registered above). Both
  // coexist during the migration window; this route is removed once
  // every dashboard surface and operator skill points at the entry
  // route.
  //
  // Phase 21c added a workflow-id branch: the dashboard's shortform
  // matrix (and any other surface that knows a workflow id) deep-links
  // straight to a workflow record. We try workflow-id resolution first
  // because workflow journals are smaller than the calendar; entry-id
  // is the existing canonical longform/outline path and stays the
  // fallback when the id doesn't match a workflow.
  app.get(
    '/dev/editorial-review/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}',
    async (c) => {
      const id = c.req.param('id');
      const siteParam = c.req.query('site') ?? ctx.config.defaultSite;
      const getIndex = (s: string) => getRequestContentIndex(c, ctx, s);
      const reviewQuery = {
        site: c.req.query('site') ?? null,
        version: c.req.query('v') ?? null,
        kind: c.req.query('kind') ?? null,
      };

      // The entry-review-first short-circuit added by #146 was a regression:
      // it routed every dashboard click (every row links here per #110) to
      // the minimal entry-review surface, which is a stage-controller, not a
      // press-check review surface. Operators lost margin-note authoring,
      // rendered preview, and the decision strip. Restore the status quo
      // ante: fall straight through to the workflow / entry-id resolution
      // paths (renderReviewPage) so the dashboard's UUID links land on the
      // working review surface. The minimal entry-review surface remains
      // reachable via the explicit `/dev/editorial-review/entry/<uuid>`
      // route registered above.

      // 1. Workflow-id branch — phase 21c.
      const wf = readWorkflow(ctx.projectRoot, ctx.config, id);
      if (wf !== null) {
        const lookup: ReviewLookup = { kind: 'workflow', workflowId: id };
        const overridden = await runTemplateOverride(ctx, 'review', [
          ctx,
          lookup,
          reviewQuery,
          getIndex,
        ]);
        if (overridden !== null) return c.html(overridden);
        return c.html(
          await renderReviewPage(ctx, lookup, reviewQuery, getIndex),
        );
      }

      // 2. Entry-id branch — the legacy canonical longform/outline URL.
      const lookup = resolveEntryById(ctx, siteParam, id);
      const effectiveLookup: ReviewLookup =
        lookup ?? { kind: 'id', entryId: id, slug: id };
      const overridden = await runTemplateOverride(ctx, 'review', [
        ctx,
        effectiveLookup,
        reviewQuery,
        getIndex,
      ]);
      if (overridden !== null) return c.html(overridden);
      return c.html(
        await renderReviewPage(ctx, effectiveLookup, reviewQuery, getIndex),
      );
    },
  );
  // Legacy slug route. `:slug{.+}` captures hierarchical slugs
  // (`/`-separated kebab-case segments). Resolution order:
  //   1. Calendar entry exists with id → 302-redirect to canonical id URL.
  //   2. Calendar entry exists without id (pre-doctor) → render via
  //      legacy slug-keyed workflow join (no redirect).
  //   3. No calendar entry → fall through to slug-keyed render anyway:
  //      a workflow may exist independently (test fixtures, ad-hoc
  //      drafts not on the calendar). The renderer's renderError path
  //      handles "no workflow either" with a 200 explainer page.
  // Only reachable when the path doesn't match the UUID route above.
  app.get('/dev/editorial-review/:slug{.+}', async (c) => {
    const slug = decodeURIComponent(c.req.param('slug'));
    const siteParam = c.req.query('site') ?? ctx.config.defaultSite;
    const found = resolveEntryBySlug(ctx, siteParam, slug);
    if (found === 'unknown-site') {
      return c.notFound();
    }
    if (found !== null && found.kind === 'id') {
      const url = buildReviewRedirectUrl(found.entryId, c.req.url);
      return c.redirect(url, 302);
    }
    // `found === null` (no calendar entry) OR `kind: 'slug'` (entry
    // present, no id). Both render through the slug-keyed legacy path.
    const lookup: ReviewLookup =
      found !== null ? found : { kind: 'slug', slug };
    const getIndex = (s: string) => getRequestContentIndex(c, ctx, s);
    const reviewQuery = {
      site: c.req.query('site') ?? null,
      version: c.req.query('v') ?? null,
      kind: c.req.query('kind') ?? null,
    };
    const overridden = await runTemplateOverride(ctx, 'review', [
      ctx,
      lookup,
      reviewQuery,
      getIndex,
    ]);
    if (overridden !== null) return c.html(overridden);
    return c.html(
      await renderReviewPage(ctx, lookup, reviewQuery, getIndex),
    );
  });
  // Wildcard path — `:site` is a single segment, the trailing path
  // captures arbitrarily-deep hierarchical addresses (e.g.
  // `the-outbound/characters/strivers`). Hono's `:path{.+}` regex
  // matcher swallows everything after the site segment.
  // #143: bare `/dev/scrapbook/<site>` (no path segment) is reachable
  // from the Index page copy ("address directly") but had no route. The
  // intended discovery path for scrapbook is the Content view's
  // per-node drawer, so redirect to the site's content tree.
  app.get('/dev/scrapbook/:site', (c) =>
    c.redirect(`/dev/content/${c.req.param('site')}`),
  );
  app.get('/dev/scrapbook/:site/', (c) =>
    c.redirect(`/dev/content/${c.req.param('site')}`),
  );

  app.get('/dev/scrapbook/:site/:path{.+}', async (c) => {
    const site = c.req.param('site');
    const path = decodeURIComponent(c.req.param('path'));
    const overridden = await runTemplateOverride(ctx, 'scrapbook', [
      ctx,
      site,
      path,
    ]);
    if (overridden !== null) return c.html(overridden);
    return c.html(renderScrapbookPage(ctx, site, path));
  });

  // Read-only binary endpoint for scrapbook files. Used by the
  // shared scrapbook-item renderer (`components/scrapbook-item.ts`)
  // to source image thumbnails, PDF iframes, and download fallbacks.
  // The standalone scrapbook viewer also uses this for previews; its
  // mutation endpoints (save/rename/delete/create/upload) hang off
  // `/api/dev/scrapbook/*` below.
  app.get('/api/dev/scrapbook-file', (c) => serveScrapbookFile(c, ctx));

  // Mutation endpoints for the standalone scrapbook viewer. The
  // client (`plugins/deskwork-studio/public/src/scrapbook-client.ts`)
  // POSTs to /save, /rename, /delete, /create, /upload. All path
  // resolution + traversal protection is delegated to
  // `@deskwork/core/scrapbook` helpers — see issue #21 for the
  // full contract.
  app.route('/api/dev/scrapbook', createScrapbookMutationsRouter(ctx));

  // Bird's-eye content view (Phase 16d). Three routes:
  //   GET /dev/content                     — top-level (sites + projects)
  //   GET /dev/content/:site               — same shape filtered to one site
  //   GET /dev/content/:site/:project{.+}  — drilldown for one project
  // The `?node=<slug>` query param toggles the detail panel.
  app.get('/dev/content', async (c) => {
    const getIndex = (site: string) => getRequestContentIndex(c, ctx, site);
    const overridden = await runTemplateOverride(ctx, 'content', [
      ctx,
      getIndex,
    ]);
    if (overridden !== null) return c.html(overridden);
    return c.html(renderContentTopLevel(ctx, getIndex));
  });
  app.get('/dev/content/:site', async (c) => {
    const getIndex = (site: string) => getRequestContentIndex(c, ctx, site);
    const overridden = await runTemplateOverride(ctx, 'content', [
      ctx,
      getIndex,
    ]);
    if (overridden !== null) return c.html(overridden);
    return c.html(renderContentTopLevel(ctx, getIndex));
  });
  app.get('/dev/content/:site/:project{.+}', async (c) => {
    const site = c.req.param('site');
    const project = decodeURIComponent(c.req.param('project'));
    const node = c.req.query('node') ?? null;
    const getIndex = (s: string) => getRequestContentIndex(c, ctx, s);
    const overridden = await runTemplateOverride(ctx, 'content-project', [
      ctx,
      site,
      project,
      node,
      getIndex,
    ]);
    if (overridden !== null) return c.html(overridden);
    const r = await renderContentProject(ctx, site, project, node, getIndex);
    return c.html(r.html, r.status as never);
  });

  // Static assets — UI client JS, CSS, etc.
  //
  // Phase 23e: client modules are esbuild-built at server boot into
  // <pluginRoot>/.runtime-cache/dist/. The more-specific `/static/dist/*`
  // mount is registered FIRST so it wins over the catchall below for JS
  // requests; CSS and other files stay served from `public/`. URL surface
  // is unchanged — page renderers still emit /static/dist/<name>.js and
  // /static/css/<file>.css.
  app.use(
    '/static/dist/*',
    serveStatic({
      root: clientAssetsDir(),
      rewriteRequestPath: (path) => path.replace(/^\/static\/dist/, ''),
    }),
  );
  app.use(
    '/static/*',
    serveStatic({
      root: publicDir(),
      rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
    }),
  );

  // Convenience root redirect to the studio index.
  app.get('/', (c) => c.redirect('/dev/'));

  return app;
}

async function main(): Promise<void> {
  const { projectRoot, port, portExplicit, hostOverride, noTailscale } =
    parseCliArgs(process.argv.slice(2));

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Could not load config: ${reason}\n`);
    process.exit(1);
  }

  // Dev mode (DESKWORK_DEV=1): skip the in-process esbuild step. The
  // Vite middleware mounted later serves the TS source from
  // <pluginRoot>/public/src/ directly, with HMR. See the dev-mode branch
  // further down for the Vite + http.Server wiring.
  const devMode = process.env.DESKWORK_DEV === '1';

  if (!devMode) {
    // Phase 23e: build client modules from source into the runtime cache
    // BEFORE wiring routes (the `/static/dist/*` mount records its root
    // at registration time and warns when the path doesn't exist yet).
    // Failures abort startup — serving stale or missing JS would silently
    // break the UI.
    try {
      const summary = await buildClientAssets({ pluginRoot: pluginRoot() });
      process.stdout.write(
        `deskwork-studio: built ${summary.entriesBuilt} client assets ` +
          `(${summary.entriesCached} cached) -> ${summary.outDir}\n`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      process.stderr.write(`deskwork-studio: client asset build failed: ${reason}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(
      'deskwork-studio: dev mode (DESKWORK_DEV=1) — Vite middleware enabled, esbuild step skipped\n',
    );
  }

  // Phase 23f: build the override resolver once at boot so every page
  // request reuses the same instance. The resolver itself is cheap, but
  // threading it through `ctx` makes the dependency explicit.
  const resolver = createOverrideResolver(projectRoot);
  const ctx: StudioContext = { projectRoot, config, resolver };
  const app = createApp(ctx);

  // Networking policy:
  //   --host <addr>          → bind ONLY to that address (operator override)
  //   --no-tailscale         → loopback only
  //   default                → loopback + auto-detected Tailscale (if running)
  //
  // The studio is dev-only with no auth. Loopback is always safe.
  // Tailscale's tailnet is treated as a trusted network — peers on the
  // same tailnet are usually devices the operator owns. LAN/Wi-Fi
  // exposure stays opt-in via `--host 0.0.0.0`.
  let tailscale: TailscaleInfo | null = null;
  let bindAddresses: string[];
  if (hostOverride !== null) {
    bindAddresses = [hostOverride];
  } else if (noTailscale) {
    bindAddresses = [LOOPBACK];
  } else {
    tailscale = detectTailscale();
    bindAddresses = tailscale === null ? [LOOPBACK] : [LOOPBACK, ...tailscale.ipv4];
  }

  // Dev mode: spin up Vite middleware in front of the Hono fetch handler.
  // We run a plain http.Server (not @hono/node-server's serve()) so we
  // can chain Vite's connect-style middleware before Hono. Auto-increment
  // + Tailscale binding are skipped in dev — the dev server is for local
  // iteration only.
  if (devMode) {
    const { createServer: createViteServer } = await import('vite');
    const { getRequestListener } = await import('@hono/node-server');
    const http = await import('node:http');
    const { join } = await import('node:path');

    // Vite root is the plugin's public/ dir; client TS lives at public/src/.
    // clientScriptTag emits /src/<name>.ts which maps to public/src/<name>.ts
    // under this root.
    const viteRoot = join(pluginRoot(), 'public');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
      root: viteRoot,
    });

    const honoListener = getRequestListener(app.fetch);
    const httpServer = http.createServer((req, res) => {
      vite.middlewares(req, res, () => {
        // Vite didn't handle — pass to Hono.
        honoListener(req, res);
      });
    });

    httpServer.listen(port, LOOPBACK, () => {
      process.stdout.write(
        `deskwork-studio: dev listening on http://localhost:${port}/\n`,
      );
      process.stdout.write(`  vite root: ${viteRoot}\n`);
      process.stdout.write(`  project:   ${projectRoot}\n`);
      process.stdout.write(`  sites:     ${Object.keys(config.sites).join(', ')}\n`);
    });
    return;
  }

  // Issue #43: bind every address with EADDRINUSE handling.
  //   - default port: walk forward through a small range on conflict.
  //   - --port explicit: fail fast with a clear error.
  let result;
  try {
    result = await listenWithAutoIncrement(
      {
        fetch: app.fetch,
        port,
        addresses: bindAddresses,
        explicitPort: portExplicit,
      },
      serve,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`deskwork-studio: ${reason}\n`);
    process.exit(1);
  }

  const reachableUrls: string[] = [];
  for (const addr of bindAddresses) {
    reachableUrls.push(
      `http://${addr === LOOPBACK ? 'localhost' : addr}:${result.port}/`,
    );
  }
  printBanner({
    urls: reachableUrls,
    projectRoot,
    siteSlugs: Object.keys(config.sites),
    tailscale,
    port: result.port,
    override: hostOverride,
    autoIncrementedFrom: result.autoIncremented ? port : null,
  });
}

interface BannerInput {
  readonly urls: readonly string[];
  readonly projectRoot: string;
  readonly siteSlugs: readonly string[];
  readonly tailscale: TailscaleInfo | null;
  readonly port: number;
  readonly override: string | null;
  /**
   * The port the operator originally requested when EADDRINUSE forced
   * the listener to walk forward. `null` means the chosen port equals
   * the requested port (no auto-increment happened).
   */
  readonly autoIncrementedFrom: number | null;
}

function printBanner(b: BannerInput): void {
  process.stdout.write('deskwork-studio listening on:\n');
  for (const url of b.urls) {
    process.stdout.write(`  ${url}\n`);
  }
  if (b.tailscale && b.tailscale.magicDnsName) {
    process.stdout.write(
      `  http://${b.tailscale.magicDnsName}:${b.port}/    (Tailscale magic-DNS)\n`,
    );
  }
  process.stdout.write(`  project: ${b.projectRoot}\n`);
  process.stdout.write(`  sites:   ${b.siteSlugs.join(', ')}\n`);
  if (b.autoIncrementedFrom !== null) {
    // Issue #43: surface the auto-increment so the operator isn't
    // confused when the URL doesn't match the documented default.
    process.stdout.write(
      `  note: port ${b.autoIncrementedFrom} was in use; using ${b.port} instead\n`,
    );
  }
  // Loud warning when bound beyond loopback + Tailscale tailnet.
  // Tailscale interfaces (100.64.0.0/10) are considered trusted; an
  // explicit --host other than loopback is not.
  const exposed = b.override !== null && b.override !== LOOPBACK;
  if (exposed) {
    process.stdout.write(
      `  warning: bound to ${b.override}. Studio has no authentication —\n` +
        '    only run this on a trusted network (Tailscale, VPN, etc.).\n',
    );
  }
}

// Only run when invoked directly, not when imported from tests. Resolve
// argv[1] to an absolute path before comparing to import.meta.url, since the
// shell may invoke us through a symlink (npm's node_modules/.bin/...).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
