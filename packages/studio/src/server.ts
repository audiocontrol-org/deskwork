#!/usr/bin/env node
/**
 * @deskwork/studio — local web server for the editorial review surface.
 *
 * Usage:
 *   deskwork-studio [--project-root <path>] [--studio-port <n>]
 *
 * Defaults:
 *   --project-root  process.cwd()
 *   --studio-port   47422 (loopback-only; sidecar reverse-proxies)
 *
 * Phase 10c contract: the studio is upstream-only. Boot reads the
 * sidecar's discovery descriptor at `<projectRoot>/.deskwork/.bridge`,
 * binds a separate loopback-only port for `/dev/*` + `/static/*` +
 * `/api/dev/*`, writes its own `<projectRoot>/.deskwork/.studio`
 * descriptor so the sidecar can find the studio's port, and exits
 * with a clear error when the sidecar isn't running.
 *
 * The studio NO LONGER mounts `/api/chat/*` or `/mcp` — those live in
 * the sidecar. The studio's HTTP routes are: `/dev/*`, `/static/*`,
 * `/api/dev/*`, plus the legacy convenience `/` redirect.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { listenWithAutoIncrement, type ServeImpl } from './listen.ts';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '@deskwork/core/config';
import { readWorkflow } from '@deskwork/core/review/pipeline';
import { createApiRouter, type StudioContext } from './routes/api.ts';
import { serveScrapbookFile } from './routes/scrapbook-file.ts';
import { createScrapbookMutationsRouter } from './routes/scrapbook-mutations.ts';
import {
  writeStudioDescriptor,
  removeStudioDescriptor,
  studioDescriptorPath,
  type StudioDescriptor,
} from '@deskwork/bridge';
import { buildClientAssets } from './build-client-assets.ts';
import { renderChatPage } from './pages/chat.ts';
import { renderDashboard } from './pages/dashboard.ts';
import { renderShortformReviewPage } from './pages/shortform-review.ts';
import { renderEntryReviewPage } from './pages/entry-review.ts';
import { renderShortformPage } from './pages/shortform.ts';
import { renderHelpPage } from './pages/help.ts';
import { renderScrapbookPage } from './pages/scrapbook.ts';
import {
  renderContentTopLevel,
  renderContentProject,
} from './pages/content.ts';
import { renderStudioIndex } from './pages/index.ts';
import {
  contentIndexMiddleware,
  getRequestContentIndex,
} from './request-context.ts';
import { runTemplateOverride } from './lib/override-render.ts';
import { getStudioVersion } from './lib/version.ts';
import { createOverrideResolver } from '@deskwork/core/overrides';
import { discoverSidecar, SidecarDiscoveryError } from './sidecar-discovery.ts';
import { parseCliArgs } from './cli.ts';

export { parseCliArgs } from './cli.ts';

const LOOPBACK = '127.0.0.1';

/**
 * Resolve the plugin tree root (`plugins/deskwork-studio/`) at runtime.
 *
 * Three runtime layouts (Phase 23 source-shipped re-architecture):
 *   - Workspace: `packages/studio/src/server.ts`
 *   - Marketplace (legacy node_modules layout)
 *   - Marketplace (materialized vendor layout, Phase 23c)
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
    if (existsSync(resolve(candidate, 'public', 'src'))) return candidate;
  }
  throw new Error(
    `deskwork-studio: could not find plugin root. Tried:\n  ${candidates.join('\n  ')}`,
  );
}

function publicDir(): string {
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
 * (`<pluginRoot>/.runtime-cache/dist/`).
 */
function clientAssetsDir(): string {
  return resolve(pluginRoot(), '.runtime-cache', 'dist');
}

export function createApp(ctx: StudioContext): Hono {
  const app = new Hono();

  app.use('*', contentIndexMiddleware());

  // API routes
  app.route('/api/dev/editorial-review', createApiRouter(ctx));

  // Bridge mode: when the operator's studio is wired into a sidecar
  // (set by production boot when sidecar discovery succeeds), the
  // chat-page renderer is mounted. The chat panel JS uses relative
  // URLs that resolve to the sidecar's canonical port via the
  // sidecar's reverse-proxy — see Phase 10a §7.
  if (ctx.bridge !== undefined) {
    app.get('/dev/chat', (c) => c.html(renderChatPage(ctx)));
  }

  app.get('/api/dev/version', (c) => c.json({ version: getStudioVersion() }));

  app.get('/dev/editorial-review', (c) => c.redirect('/dev/editorial-studio'));
  app.get('/dev/editorial-review/', (c) => c.redirect('/dev/editorial-studio'));

  // Page routes
  app.get('/dev', async (c) => c.html(await renderStudioIndex(ctx)));
  app.get('/dev/', async (c) => c.html(await renderStudioIndex(ctx)));
  app.get('/dev/editorial-studio', async (c) => {
    const getIndex = (site: string) => getRequestContentIndex(c, ctx, site);
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
        },
        getIndex,
      );
      return c.html(result.html, result.status);
    },
  );
  app.get(
    '/dev/editorial-review/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}',
    async (c) => {
      const id = c.req.param('id');
      const wf = readWorkflow(ctx.projectRoot, ctx.config, id);
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

  app.get('/api/dev/scrapbook-file', (c) => serveScrapbookFile(c, ctx));

  app.route('/api/dev/scrapbook', createScrapbookMutationsRouter(ctx));

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

  app.get('/', (c) => c.redirect('/dev/'));

  return app;
}

async function main(): Promise<void> {
  const { projectRoot, studioPort, studioPortExplicit } =
    parseCliArgs(process.argv.slice(2));

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Could not load config: ${reason}\n`);
    process.exit(1);
  }

  // Phase 10c: discover the long-lived bridge sidecar before binding.
  // The studio depends on the sidecar; the studio refuses to boot if
  // the sidecar isn't running, is unresponsive, or its descriptor is
  // stale. Cases (a)–(e) per design 10a §5.
  let bridgeDescriptor;
  try {
    bridgeDescriptor = await discoverSidecar(projectRoot);
  } catch (err) {
    if (err instanceof SidecarDiscoveryError) {
      process.stderr.write(`deskwork-studio: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const devMode = process.env.DESKWORK_DEV === '1';

  if (!devMode) {
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

  const resolver = createOverrideResolver(projectRoot);
  const ctx: StudioContext = {
    projectRoot,
    config,
    resolver,
    // Phase 10c: bridge marker. The sidecar owns the chat surface;
    // the marker only gates the chat-page route + chat-panel
    // affordances on entry-review pages.
    bridge: {},
  };
  const app = createApp(ctx);

  // Phase 10c: studio binds loopback-only. The sidecar is the
  // Tailscale-reachable surface; the studio is upstream-only.
  const bindAddresses: string[] = [LOOPBACK];

  let serveImpl: ServeImpl = serve;
  if (devMode) {
    const { createServer: createViteServer } = await import('vite');
    const { getRequestListener } = await import('@hono/node-server');
    const http = await import('node:http');
    const { join } = await import('node:path');

    const viteRoot = join(pluginRoot(), 'public');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  let result;
  try {
    result = await listenWithAutoIncrement(
      {
        fetch: app.fetch,
        port: studioPort,
        addresses: bindAddresses,
        explicitPort: studioPortExplicit,
      },
      serveImpl,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`deskwork-studio: ${reason}\n`);
    process.exit(1);
  }

  // Write the studio descriptor AFTER successful bind. The sidecar's
  // reverse-proxy reads this to learn the studio's port; reads happen
  // per-request, so a fresh studio process simply overwrites the
  // descriptor and the next proxy hop picks up the new port.
  const descriptor: StudioDescriptor = {
    port: result.port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    version: getStudioVersion(),
  };
  try {
    await writeStudioDescriptor(projectRoot, descriptor);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `deskwork-studio: failed to write descriptor at ${studioDescriptorPath(projectRoot)}: ${reason}\n`,
    );
    process.exit(1);
  }

  registerCleanupHandlers(projectRoot);

  printBanner({
    studioPort: result.port,
    sidecarPort: bridgeDescriptor.port,
    projectRoot,
    siteSlugs: Object.keys(config.sites),
    autoIncrementedFrom: result.autoIncremented ? studioPort : null,
  });
}

interface BannerInput {
  readonly studioPort: number;
  readonly sidecarPort: number;
  readonly projectRoot: string;
  readonly siteSlugs: readonly string[];
  readonly autoIncrementedFrom: number | null;
}

function printBanner(b: BannerInput): void {
  process.stdout.write('deskwork-studio listening on:\n');
  process.stdout.write(
    `  http://127.0.0.1:${b.studioPort}/    (loopback-only; reverse-proxied through sidecar)\n`,
  );
  process.stdout.write(
    `  Sidecar canonical URL: http://127.0.0.1:${b.sidecarPort}/    (this is the URL adopters open)\n`,
  );
  process.stdout.write(`  project: ${b.projectRoot}\n`);
  process.stdout.write(`  sites:   ${b.siteSlugs.join(', ')}\n`);
  if (b.autoIncrementedFrom !== null) {
    process.stdout.write(
      `  note: studio-port ${b.autoIncrementedFrom} was in use; using ${b.studioPort} instead\n`,
    );
  }
}

let cleanupRegistered = false;

function registerCleanupHandlers(projectRoot: string): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  let removing = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (removing) return;
    removing = true;
    void removeStudioDescriptor(projectRoot).finally(() => {
      const code = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 0;
      process.exit(code);
    });
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

// Only run when invoked directly, not when imported from tests.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
