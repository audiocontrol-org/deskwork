#!/usr/bin/env tsx
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
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '@deskwork/core/config';
import { readCalendar } from '@deskwork/core/calendar';
import { resolveCalendarPath } from '@deskwork/core/paths';
import { createApiRouter, type StudioContext } from './routes/api.ts';
import { serveScrapbookFile } from './routes/scrapbook-file.ts';
import { createScrapbookMutationsRouter } from './routes/scrapbook-mutations.ts';
import { renderDashboard } from './pages/dashboard.ts';
import { renderReviewPage, type ReviewLookup } from './pages/review.ts';
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

interface CliArgs {
  projectRoot: string;
  port: number;
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
    } else if (a.startsWith('--port=')) {
      port = parseInt(a.slice('--port='.length), 10);
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

function publicDir(): string {
  // Two runtime layouts share this resolver:
  //   - Bundle: plugins/deskwork-studio/bundle/server.mjs → ../public
  //   - Source: packages/studio/src/server.ts → repo-relative
  //     plugins/deskwork-studio/public (the assets moved into the
  //     plugin tree so marketplace install ships them).
  // Both candidates resolve to the same absolute path on a real
  // checkout; the dev fallback only matters when running source via tsx.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', 'public'),
    resolve(here, '..', '..', '..', 'plugins', 'deskwork-studio', 'public'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `deskwork-studio: could not find public/ assets. Tried:\n  ${candidates.join('\n  ')}`,
  );
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

  // Page routes
  app.get('/dev', (c) => c.html(renderStudioIndex(ctx)));
  app.get('/dev/', (c) => c.html(renderStudioIndex(ctx)));
  app.get('/dev/editorial-studio', (c) => {
    const getIndex = (site: string) => getRequestContentIndex(c, ctx, site);
    return c.html(renderDashboard(ctx, getIndex));
  });
  app.get('/dev/editorial-help', (c) => c.html(renderHelpPage(ctx)));
  app.get('/dev/editorial-review-shortform', (c) =>
    c.html(renderShortformPage(ctx, c.req.query('focus') ?? null)),
  );
  // Phase 19d: id-based canonical review URL. Strict UUID-shape regex
  // matched FIRST so it wins over the legacy `:slug{.+}` route below.
  // Hono evaluates routes in registration order; first match wins.
  app.get(
    '/dev/editorial-review/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}',
    async (c) => {
      const id = c.req.param('id');
      const siteParam = c.req.query('site') ?? ctx.config.defaultSite;
      const lookup = resolveEntryById(ctx, siteParam, id);
      const getIndex = (s: string) => getRequestContentIndex(c, ctx, s);
      if (lookup === null) {
        return c.html(
          await renderReviewPage(
            ctx,
            { kind: 'id', entryId: id, slug: id },
            {
              site: c.req.query('site') ?? null,
              version: c.req.query('v') ?? null,
              kind: c.req.query('kind') ?? null,
            },
            getIndex,
          ),
        );
      }
      return c.html(
        await renderReviewPage(
          ctx,
          lookup,
          {
            site: c.req.query('site') ?? null,
            version: c.req.query('v') ?? null,
            kind: c.req.query('kind') ?? null,
          },
          getIndex,
        ),
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
    return c.html(
      await renderReviewPage(
        ctx,
        lookup,
        {
          site: c.req.query('site') ?? null,
          version: c.req.query('v') ?? null,
          kind: c.req.query('kind') ?? null,
        },
        getIndex,
      ),
    );
  });
  // Wildcard path — `:site` is a single segment, the trailing path
  // captures arbitrarily-deep hierarchical addresses (e.g.
  // `the-outbound/characters/strivers`). Hono's `:path{.+}` regex
  // matcher swallows everything after the site segment.
  app.get('/dev/scrapbook/:site/:path{.+}', (c) =>
    c.html(
      renderScrapbookPage(
        ctx,
        c.req.param('site'),
        decodeURIComponent(c.req.param('path')),
      ),
    ),
  );

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
  app.get('/dev/content', (c) => {
    const getIndex = (site: string) => getRequestContentIndex(c, ctx, site);
    return c.html(renderContentTopLevel(ctx, getIndex));
  });
  app.get('/dev/content/:site', (c) => {
    const getIndex = (site: string) => getRequestContentIndex(c, ctx, site);
    return c.html(renderContentTopLevel(ctx, getIndex));
  });
  app.get('/dev/content/:site/:project{.+}', async (c) => {
    const site = c.req.param('site');
    const project = decodeURIComponent(c.req.param('project'));
    const node = c.req.query('node') ?? null;
    const getIndex = (s: string) => getRequestContentIndex(c, ctx, s);
    const r = await renderContentProject(ctx, site, project, node, getIndex);
    return c.html(r.html, r.status as never);
  });

  // Static assets — UI client JS, CSS, etc.
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
  const { projectRoot, port, hostOverride, noTailscale } = parseCliArgs(
    process.argv.slice(2),
  );

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Could not load config: ${reason}\n`);
    process.exit(1);
  }

  const ctx: StudioContext = { projectRoot, config };
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

  // Open a listener per address, in order, blocking briefly between so
  // the banner stays grouped. Each `serve()` call returns its own
  // server handle and runs independently — Node keeps the process
  // alive as long as at least one is active.
  const reachableUrls: string[] = [];
  for (const addr of bindAddresses) {
    serve({ fetch: app.fetch, port, hostname: addr }, () => {
      reachableUrls.push(`http://${addr === LOOPBACK ? 'localhost' : addr}:${port}/`);
      // When the last listener attaches, print the consolidated banner.
      if (reachableUrls.length === bindAddresses.length) {
        printBanner({
          urls: reachableUrls,
          projectRoot,
          siteSlugs: Object.keys(config.sites),
          tailscale,
          port,
          override: hostOverride,
        });
      }
    });
  }
}

interface BannerInput {
  readonly urls: readonly string[];
  readonly projectRoot: string;
  readonly siteSlugs: readonly string[];
  readonly tailscale: TailscaleInfo | null;
  readonly port: number;
  readonly override: string | null;
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
  // Loud warning when bound beyond loopback + Tailscale tailnet.
  // Tailscale interfaces (100.64.0.0/10) are considered trusted; an
  // explicit --host other than loopback is not.
  const exposed = b.override !== null && b.override !== LOOPBACK;
  if (exposed) {
    process.stdout.write(
      `  ⚠ bound to ${b.override}. Studio has no authentication —\n` +
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
