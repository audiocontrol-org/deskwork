/**
 * Reverse-proxy helpers for the sidecar's `/dev/*` and `/static/*`
 * routes. The sidecar fronts these surfaces; the studio handles them
 * upstream on a separate loopback-only port.
 *
 * Discovery: each proxied request reads the studio descriptor at
 * `<projectRoot>/.deskwork/.studio` to learn the studio's current port.
 * Reading per-request keeps the sidecar honest across studio restarts —
 * a fresh studio process writes a new descriptor with its new port and
 * the next proxy hop picks it up. The descriptor read is a single
 * `readFile` of a small JSON file on the same machine; cost is
 * negligible.
 *
 * Streaming: Hono's `proxy()` helper passes the upstream `Response`
 * body through unbuffered, so SSE / chunked / large responses stream
 * correctly without intervention here.
 *
 * Failure modes:
 *   - Descriptor missing → 502 with the friendly "Studio restarting…"
 *     HTML page. The studio is not running yet (or has been killed
 *     and not restarted).
 *   - Studio process gone (descriptor still on disk, port refusing
 *     connections) → fetch throws (ECONNREFUSED, etc.) → same 502
 *     page. The studio was killed without graceful cleanup.
 *
 * Both cases produce the same UX: a small page that explains the
 * studio is restarting. The MCP / `/api/chat/*` surfaces are
 * unaffected — those live in the sidecar process and don't depend
 * on the studio.
 */

import type { Context } from 'hono';
import { proxy } from 'hono/proxy';
import { readStudioDescriptor } from './descriptor.ts';

const STUDIO_RESTARTING_HTML =
  '<!doctype html><html><head><title>Studio restarting</title>' +
  '<meta http-equiv="refresh" content="2"></head>' +
  '<body><pre>Studio restarting&hellip;</pre></body></html>';

export interface ProxyHandlerDeps {
  /** Project root the sidecar is serving — used to locate the studio descriptor. */
  readonly projectRoot: string;
}

/**
 * Build a Hono handler that reverse-proxies the incoming request to
 * the studio's loopback URL discovered via the `.studio` descriptor.
 *
 * The handler preserves the request method, headers, and body. The
 * upstream URL is constructed by replacing the request's host with
 * `127.0.0.1:<studioPort>` and keeping the path + query string.
 */
export function createProxyHandler(
  deps: ProxyHandlerDeps,
): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    const desc = await readStudioDescriptor(deps.projectRoot);
    if (desc === null) {
      return new Response(STUDIO_RESTARTING_HTML, {
        status: 502,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    const incomingUrl = new URL(c.req.url);
    const upstream = `http://127.0.0.1:${desc.port}${incomingUrl.pathname}${incomingUrl.search}`;
    try {
      // Pass `raw: c.req.raw` (the underlying `Request`) explicitly to
      // hono's `proxy()`. The proxy helper extracts method + body +
      // signal from the `raw` Request via `buildRequestInitFromRequest()`.
      //
      // Note: the alternate `{...c.req}` spread shape (shown in hono's
      // own docs example) also works in current hono — `raw` is an own
      // enumerable property on HonoRequest, so it ends up in the spread
      // output and `proxy()` destructures it correctly. But the explicit
      // `raw:` key documents intent and removes the dependency on
      // HonoRequest's internal property layout: any future hono refactor
      // that turns `raw` into a getter (the same shape `method` / `body`
      // / `headers` already use) would silently break the spread.
      //
      // See: node_modules/hono/dist/helper/proxy/index.js (proxy()) and
      // node_modules/hono/dist/types/helper/proxy/index.d.ts.
      return await proxy(upstream, {
        raw: c.req.raw,
        headers: {
          ...c.req.header(),
          'X-Forwarded-For': '127.0.0.1',
          // Guard against undefined: hono's `preprocessRequestInit`
          // deletes header keys whose value is `== null`, so an
          // undefined here is actually handled correctly today. The
          // `?? ''` makes the contract explicit at the call site
          // rather than relying on hono's internal null-handling.
          'X-Forwarded-Host': c.req.header('host') ?? '',
          'X-Forwarded-Proto': 'http',
        },
      });
    } catch {
      // ECONNREFUSED, fetch failed, etc. — studio is bouncing.
      return new Response(STUDIO_RESTARTING_HTML, {
        status: 502,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
  };
}
