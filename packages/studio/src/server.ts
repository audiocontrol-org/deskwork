#!/usr/bin/env tsx
/**
 * @deskwork/studio — local web server for the editorial review surface.
 *
 * Usage:
 *   deskwork-studio [--project-root <path>] [--port <n>]
 *
 * Defaults:
 *   --project-root  process.cwd()
 *   --port          4321
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
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '@deskwork/core/config';
import { createApiRouter, type StudioContext } from './routes/api.ts';
import { renderDashboard } from './pages/dashboard.ts';
import { renderReviewPage } from './pages/review.ts';
import { renderShortformPage } from './pages/shortform.ts';
import { renderHelpPage } from './pages/help.ts';
import { renderScrapbookPage } from './pages/scrapbook.ts';

interface CliArgs {
  projectRoot: string;
  port: number;
}

function parseCliArgs(argv: string[]): CliArgs {
  let projectRoot = process.cwd();
  let port = 4321;
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
  };
}

function usage(error: string | null): never {
  const out = error ? process.stderr : process.stdout;
  if (error) out.write(`error: ${error}\n\n`);
  out.write('Usage: deskwork-studio [--project-root <path>] [--port <n>]\n');
  out.write('\n');
  out.write('Options:\n');
  out.write('  -r, --project-root <path>   project root containing .deskwork/config.json\n');
  out.write('                              (default: cwd)\n');
  out.write('  -p, --port <n>              listen on this port (default: 4321)\n');
  out.write('  -h, --help                  show this message\n');
  process.exit(error ? 2 : 0);
}

function publicDir(): string {
  // Resolve `public/` relative to this module so the server finds the UI
  // assets regardless of where it's invoked from.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'public');
}

export function createApp(ctx: StudioContext): Hono {
  const app = new Hono();

  // API routes
  app.route('/api/dev/editorial-review', createApiRouter(ctx));

  // Page routes
  app.get('/dev/editorial-studio', (c) => c.html(renderDashboard(ctx)));
  app.get('/dev/editorial-help', (c) => c.html(renderHelpPage(ctx)));
  app.get('/dev/editorial-review-shortform', (c) =>
    c.html(renderShortformPage(ctx, c.req.query('focus') ?? null)),
  );
  app.get('/dev/editorial-review/:slug', async (c) =>
    c.html(
      await renderReviewPage(ctx, c.req.param('slug'), {
        site: c.req.query('site') ?? null,
        version: c.req.query('v') ?? null,
        kind: c.req.query('kind') ?? null,
      }),
    ),
  );
  app.get('/dev/scrapbook/:site/:slug', (c) =>
    c.html(
      renderScrapbookPage(ctx, c.req.param('site'), c.req.param('slug')),
    ),
  );

  // Static assets — UI client JS, CSS, etc.
  app.use(
    '/static/*',
    serveStatic({
      root: publicDir(),
      rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
    }),
  );

  // Convenience root redirect to the dashboard.
  app.get('/', (c) => c.redirect('/dev/editorial-studio'));

  return app;
}

async function main(): Promise<void> {
  const { projectRoot, port } = parseCliArgs(process.argv.slice(2));

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

  // Bind to loopback only. The studio is dev-only — no auth, no review of
  // mutation handlers against a hostile caller. Binding 0.0.0.0 (Hono's
  // default) would expose the project tree and review APIs to anyone on the
  // local network.
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    process.stdout.write(`deskwork-studio listening on http://localhost:${info.port}/\n`);
    process.stdout.write(`  project: ${projectRoot}\n`);
    process.stdout.write(`  sites:   ${Object.keys(config.sites).join(', ')}\n`);
  });
}

// Only run when invoked directly, not when imported from tests. Resolve
// argv[1] to an absolute path before comparing to import.meta.url, since the
// shell may invoke us through a symlink (npm's node_modules/.bin/...).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
