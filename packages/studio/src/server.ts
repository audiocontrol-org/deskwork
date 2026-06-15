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
 *   - GET  /dev/editorial-review/entry/<uuid>   — per-entry review page
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
import { listenWithAutoIncrement, type ServeImpl } from './listen.ts';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '@deskwork/core/config';
import { listLaneConfigs } from '@deskwork/core/lanes';
import { readWorkflow } from '@deskwork/core/review/pipeline';
import { createApiRouter, type StudioContext } from './routes/api.ts';
import { serveScrapbookFile } from './routes/scrapbook-file.ts';
import { createScrapbookMutationsRouter } from './routes/scrapbook-mutations.ts';
import { buildClientAssets } from './build-client-assets.ts';
import { renderDashboard } from './pages/dashboard.ts';
import { renderShortformReviewPage } from './pages/shortform-review.ts';
import { renderEntryReviewPage } from './pages/entry-review.ts';
import { renderShortformPage } from './pages/shortform.ts';
import { renderHelpPage } from './pages/help.ts';
import { renderLanesPage } from './pages/lanes.ts';
import { renderPipelinesPage } from './pages/pipelines.ts';
import { renderScrapbookPage, ScrapbookPageError } from './pages/scrapbook.ts';
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
  /**
   * When true, skip Tailscale auto-detection even if it's running. Driven
   * ONLY by the `DESKWORK_STUDIO_NO_TAILSCALE=1` env var (non-interactive
   * escape hatch for smokes / CI). The `--no-tailscale` CLI flag is a
   * deprecated no-op and does NOT set this — see parseCliArgs.
   */
  noTailscale: boolean;
}

const DEFAULT_PORT = 47321;
const LOOPBACK = '127.0.0.1';

/**
 * Options for {@link parseCliArgs}. Injected so tests can drive the env-var
 * escape hatch and capture the deprecation notice deterministically; both
 * default to the live process.
 */
export interface ParseCliArgsOptions {
  env?: Record<string, string | undefined>;
  stderr?: (s: string) => void;
}

export function parseCliArgs(argv: string[], opts: ParseCliArgsOptions = {}): CliArgs {
  const env = opts.env ?? process.env;
  const stderr = opts.stderr ?? ((s: string) => process.stderr.write(s));
  let projectRoot = process.cwd();
  let port = DEFAULT_PORT;
  let portExplicit = false;
  let hostOverride: string | null = null;
  let noTailscaleFlagSeen = false;
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
      // Deprecated no-op. The flag stranded operators who were off-keyboard
      // (it forced loopback-only). The studio now ALWAYS auto-detects
      // Tailscale; the only way to force loopback-only is the env-var escape
      // hatch below, which is non-interactive by construction (smokes / CI).
      noTailscaleFlagSeen = true;
    } else if (a === '--help' || a === '-h') {
      usage(null);
    } else {
      usage(`unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    usage(`invalid port: ${port}`);
  }
  // DESKWORK_STUDIO_NO_TAILSCALE truthiness — normalized (case-insensitive,
  // trimmed) and tolerant of the common spellings. This is the ONLY way to
  // force loopback-only on a no-auth server (AUDIT-20260602-01/-04), so a
  // fat-fingered value must not silently fail open onto the tailnet.
  const rawEnv = env.DESKWORK_STUDIO_NO_TAILSCALE;
  const normEnv = rawEnv?.toLowerCase().trim();
  const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
  const FALSY = new Set(['', '0', 'false', 'no', 'off']);
  const noTailscale = normEnv !== undefined && TRUTHY.has(normEnv);
  if (normEnv !== undefined && !TRUTHY.has(normEnv) && !FALSY.has(normEnv)) {
    stderr(
      `deskwork-studio: DESKWORK_STUDIO_NO_TAILSCALE is set to '${rawEnv}', which ` +
        'is not a recognized truthy value (use 1/true/yes/on). Treating as unset — ' +
        'the studio WILL auto-detect Tailscale and may be reachable on your tailnet.\n',
    );
  }
  if (noTailscaleFlagSeen) {
    // Per AUDIT-20260602-06: split the deprecation notice into two branches.
    // When loopback-only is ALREADY in effect (via the env-var escape hatch),
    // the "will be reachable on the tailnet" claim is factually wrong; we
    // acknowledge the deprecation without making a false exposure claim.
    // When loopback-only is NOT in effect, the full exposure warning fires.
    if (noTailscale) {
      stderr(
        'deskwork-studio: --no-tailscale is deprecated and now a NO-OP. ' +
          'Loopback-only is active via DESKWORK_STUDIO_NO_TAILSCALE — the flag is redundant ' +
          'and can be removed.\n',
      );
    } else {
      // The flag is a no-op (it used to force loopback-only and stranded
      // off-keyboard operators). Warn loudly that the protection it once gave is
      // gone — the no-auth studio now binds to the tailnet by default.
      stderr(
        'deskwork-studio: --no-tailscale is deprecated and now a NO-OP. The studio ' +
          'auto-detects Tailscale and (having no authentication) will be reachable ' +
          'by every peer on your tailnet. If you passed --no-tailscale to keep it ' +
          'loopback-only, that no longer works: set DESKWORK_STUDIO_NO_TAILSCALE=1 ' +
          '(or use --host 127.0.0.1) to restore loopback-only binding.\n',
      );
    }
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
  out.write('Usage: deskwork-studio [--project-root <path>] [--port <n>] [--host <addr>]\n');
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
  out.write('  -h, --help                  show this message\n');
  out.write('\n');
  out.write('  (--no-tailscale is a deprecated no-op; for non-interactive loopback-only,\n');
  out.write('   set DESKWORK_STUDIO_NO_TAILSCALE=1 in the environment instead.)\n');
  out.write('\n');
  out.write('Default networking policy: bind to 127.0.0.1 (loopback) AND, if Tailscale is\n');
  out.write('running on this machine, the local Tailscale interface(s). Tailscale peers can\n');
  out.write("then reach the studio at the magic-DNS hostname (e.g. '<machine>.<tailnet>.ts.net').\n");
  process.exit(error ? 2 : 0);
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
    // Phase 5 Task 5.1: thread the request URL so the dashboard can
    // honour `?focus=<csv>` server-side.
    return c.html(await renderDashboard(ctx, getIndex, c.req.url));
  });
  app.get('/dev/editorial-help', async (c) => {
    const overridden = await runTemplateOverride(ctx, 'help', [ctx]);
    if (overridden !== null) return c.html(overridden);
    return c.html(renderHelpPage(ctx));
  });
  // Phase 6 Task 6.3: studio lane-management page. Server-renders
  // the lane registry + a copy-builder New Lane form + per-row
  // Edit / Archive / Restore / Purge clipboard buttons. The page
  // never mutates sidecar state — every button copies an equivalent
  // /deskwork:lane <verb> slash command per THESIS Consequence 2.
  app.get('/dev/lanes', async (c) => c.html(await renderLanesPage(ctx)));
  app.get('/dev/lanes/', async (c) => c.html(await renderLanesPage(ctx)));
  // Phase 6 Task 6.4: studio pipeline-editor page. Server-renders
  // the pipeline registry (plugin presets + project overrides) with
  // a copy-builder New form, per-row View / Edit / Delete affordances
  // (Edit surfaces the five mutually-exclusive update operations as
  // collapsed sub-forms), and an error banner + inline error rows
  // when any override JSON fails to load. Per THESIS Consequence 2
  // no button mutates server state — every action copies an
  // equivalent /deskwork:pipeline <verb> slash command to the
  // clipboard.
  app.get('/dev/pipelines', async (c) => c.html(await renderPipelinesPage(ctx)));
  app.get('/dev/pipelines/', async (c) => c.html(await renderPipelinesPage(ctx)));
  app.get('/dev/editorial-review-shortform', (c) =>
    c.html(renderShortformPage(ctx)),
  );
  // Entry-uuid keyed review surface. The handler renders the
  // press-check chrome backed by sidecars + history journal. Registered
  // before the bare-UUID route so the literal "entry" path segment
  // matches first.
  app.get(
    '/dev/editorial-review/entry/:entryId{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}',
    async (c) => {
      const entryId = c.req.param('entryId');
      const getIndex = (s: string) => getRequestContentIndex(c, ctx, s);
      const result = await renderEntryReviewPage(
        ctx,
        entryId,
        {
          version: c.req.query('v') ?? null,
          stage: c.req.query('stage') ?? null,
          members: c.req.query('members') ?? null,
        },
        getIndex,
      );
      return c.html(result.html, result.status);
    },
  );
  // Bare-UUID review URL. Phase 34a (#171): the legacy longform/outline
  // halves of `pages/review.ts` were retired. This route now serves
  // shortform's workflow-keyed surface (operator-confirmed deferral —
  // shortform stays workflow-keyed until its own migration phase) and
  // 301-redirects every other UUID to the canonical entry-keyed
  // `/dev/editorial-review/entry/<uuid>`.
  //
  // The redirect is a backwards-compat shim for in-flight bookmarks +
  // any link emitter not yet updated; it has its own retirement issue
  // filed alongside the shortform-migration phase.
  app.get(
    '/dev/editorial-review/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}',
    async (c) => {
      const id = c.req.param('id');
      const wf = readWorkflow(ctx.projectRoot, ctx.config, id);
      // Only shortform workflow records render via the slim
      // shortform-review surface. Legacy longform/outline workflows
      // and missing-workflow uuids both redirect to the canonical
      // entry-keyed URL.
      if (wf !== null && wf.contentKind === 'shortform') {
        const overridden = await runTemplateOverride(ctx, 'review', [
          ctx,
          id,
          { version: c.req.query('v') ?? null },
        ]);
        if (overridden !== null) return c.html(overridden);
        return c.html(
          await renderShortformReviewPage(ctx, id, {
            version: c.req.query('v') ?? null,
          }),
        );
      }
      const queryIdx = c.req.url.indexOf('?');
      const search = queryIdx >= 0 ? c.req.url.slice(queryIdx) : '';
      return c.redirect(`/dev/editorial-review/entry/${id}${search}`, 301);
    },
  );
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
    // #205: when the request carries `?entryId=<uuid>`, resolve the
    // listing via `scrapbookDirForEntry` (matching the entry-aware
    // mutation API). Slug-template addressing remains the fallback for
    // legacy callers and ad-hoc paths.
    const entryId = c.req.query('entryId');
    const overridden = await runTemplateOverride(ctx, 'scrapbook', [
      ctx,
      site,
      path,
    ]);
    if (overridden !== null) return c.html(overridden);
    try {
      const html = await renderScrapbookPage(
        ctx,
        site,
        path,
        entryId !== undefined && entryId.length > 0 ? { entryId } : {},
      );
      return c.html(html);
    } catch (e) {
      if (e instanceof ScrapbookPageError) {
        return c.json({ error: e.message }, e.status);
      }
      throw e;
    }
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

  // Document root — serves top-level project files (DESKWORK-STATE-MACHINE.md,
  // THESIS.md, README.md, DESIGN-STANDARDS.md, etc.) so the studio's URL
  // namespace mirrors the project filesystem layout. Registered LAST so
  // every more-specific route (`/dev/*`, `/api/*`, `/static/*`, the `/`
  // redirect) matches first; only unmatched paths fall through to a
  // filesystem lookup against the project root. Symlinks in `public/`
  // didn't survive serveStatic's resolution (operator-reported 2026-05-09);
  // serving the project root directly removes the need for symlinks at all.
  app.use(
    '*',
    serveStatic({
      root: ctx.projectRoot,
    }),
  );

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
  //   --host <addr>                   → bind ONLY to that address (operator override)
  //   DESKWORK_STUDIO_NO_TAILSCALE=1  → loopback only (non-interactive escape hatch)
  //   default                         → loopback + auto-detected Tailscale (if running)
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

  // Dev mode: build a Vite-wrapped serveImpl that constructs an
  // http.Server per address with Vite's connect-style middleware
  // chained in front of Hono. Then route through the same
  // `listenWithAutoIncrement` + `bindAddresses` + `printBanner` path
  // as production — only the in-process esbuild step is skipped on
  // DESKWORK_DEV=1 (the conditional above main()'s networking
  // section). Pre-fix #165, dev mode hardcoded loopback-only and
  // emitted a custom banner; operators off-keyboard couldn't reach
  // the dev studio via Tailscale magic-DNS even though the
  // production-mode binary served them well.
  let serveImpl: ServeImpl = serve;
  if (devMode) {
    const { createServer: createViteServer } = await import('vite');
    const { getRequestListener } = await import('@hono/node-server');
    const http = await import('node:http');
    const net = await import('node:net');
    const { join } = await import('node:path');

    // Vite's HMR WebSocket needs its own port. Default is 24678. When
    // multiple worktrees run dev studios simultaneously, the second
    // worktree's Vite cannot bind 24678 — it silently fails to spin
    // up an HMR WS server, and the browser ends up trying to connect
    // to whatever process IS on 24678 (the OTHER worktree's Vite).
    // The handshake fails with HTTP 426; the Vite client falls back
    // to "polling for restart" mode which page-reloads several times
    // per second. That presents to the operator as "pathologically
    // refreshing as fast as possible." Walk forward to find a free
    // port so each concurrent worktree gets its own HMR slot.
    const findFreePort = async (base: number, max: number): Promise<number> => {
      for (let p = base; p <= max; p += 1) {
        const free = await new Promise<boolean>((resolve) => {
          const probe = net.createServer();
          probe.once('error', () => resolve(false));
          probe.once('listening', () => {
            probe.close(() => resolve(true));
          });
          // Bind to all interfaces (dual-stack IPv4+IPv6) so the probe
          // matches what Vite actually does. A previous version of this
          // helper bound 127.0.0.1 only and got false-positives when
          // another worktree's Vite was on IPv6 wildcard (*:24678) —
          // the IPv4 probe succeeded, then Vite's actual bind failed.
          probe.listen(p);
        });
        if (free) return p;
      }
      throw new Error(
        `deskwork-studio: no free HMR port in [${base}, ${max}]. ` +
          `Another worktree's dev studio is likely holding the range.`,
      );
    };
    const hmrPort = await findFreePort(24678, 24777);

    const viteRoot = join(pluginRoot(), 'public');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        // Pin the HMR WS to the port we just verified free. Without
        // this, Vite uses its default 24678 and silently loses to
        // any other worktree that grabbed it first.
        hmr: { port: hmrPort },
      },
      appType: 'custom',
      root: viteRoot,
    });

    const honoListener = getRequestListener(app.fetch);
    const viteServeImpl: ServeImpl = (options, listening) => {
      const httpServer = http.createServer((req, res) => {
        vite.middlewares(req, res, () => {
          honoListener(req, res);
        });
      });
      httpServer.listen(options.port, options.hostname, () => {
        listening({ port: options.port, address: options.hostname });
      });
      return httpServer;
    };
    serveImpl = viteServeImpl;
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
      serveImpl,
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
    // Phase 39c (sites→lanes retirement): the boot banner reports the
    // project's LANES (the unit deskwork operates on), not the retired
    // `config.sites` keyspace. `config` is unused for the banner now but
    // is still read above for the studio context.
    laneIds: listLaneConfigs(projectRoot),
    tailscale,
    port: result.port,
    override: hostOverride,
    autoIncrementedFrom: result.autoIncremented ? port : null,
  });
}

interface BannerInput {
  readonly urls: readonly string[];
  readonly projectRoot: string;
  readonly laneIds: readonly string[];
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
  process.stdout.write(`  lanes:   ${b.laneIds.join(', ') || '(none yet)'}\n`);
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
