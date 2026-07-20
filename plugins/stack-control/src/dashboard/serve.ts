// Dashboard serving — three UNAUTHENTICATED static GET routes mounted alongside
// the plane's `/v1/*` API (the static files carry no secrets themselves; the page
// is handed one plane bearer so the client can call the authed `/v1/*`).
//
// Validation-first build: the injected bearer is a crude, deliberately-deferred
// auth stand-in (see the design record). It is NOT a production auth model.

import type { ServerResponse } from 'node:http';
import type { ExtraRoute, RouteContext, RouteHandler } from '../plane/http/server.js';
import { contentTypeFor, readDashboardAsset, type DashboardAssetName } from './assets.js';

const INDEX_CONFIG_PLACEHOLDER = '__DASHBOARD_CONFIG__';

/** Serialize the bootstrap config as inert JSON, escaping `<` so the value can
 * never break out of the `<script type="application/json">` element. */
function bootstrapConfig(bearer: string | null): string {
  return JSON.stringify({ token: bearer, apiBase: '' }).replace(/</g, '\\u003c');
}

function writeAsset(res: ServerResponse, name: DashboardAssetName, body: string): void {
  res.writeHead(200, {
    'content-type': contentTypeFor(name),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function serveIndex(bearer: string | null): RouteHandler {
  return (ctx: RouteContext): void => {
    const html = readDashboardAsset('index.html').replace(
      INDEX_CONFIG_PLACEHOLDER,
      bootstrapConfig(bearer),
    );
    writeAsset(ctx.res, 'index.html', html);
  };
}

function serveStatic(name: DashboardAssetName): RouteHandler {
  return (ctx: RouteContext): void => {
    writeAsset(ctx.res, name, readDashboardAsset(name));
  };
}

/**
 * The dashboard routes, mounted as UNAUTHENTICATED extra routes on the plane. The
 * served page is handed the first plane-accepted bearer (if any) so the client
 * can call the authed `/v1/*` read API; a token-less plane injects `null` and the
 * client calls the API bare. Exact patterns ARE the allowlist: an unknown
 * `/dashboard/*` path matches no route and the plane returns its standard 404.
 */
export function buildDashboardRoutes(
  acceptedBearers: ReadonlyMap<string, string>,
): readonly ExtraRoute[] {
  const bearer = [...acceptedBearers.keys()][0] ?? null;
  return [
    { method: 'GET', pattern: '/', handler: serveIndex(bearer) },
    { method: 'GET', pattern: '/dashboard/app.js', handler: serveStatic('app.js') },
    { method: 'GET', pattern: '/dashboard/styles.css', handler: serveStatic('styles.css') },
  ];
}
