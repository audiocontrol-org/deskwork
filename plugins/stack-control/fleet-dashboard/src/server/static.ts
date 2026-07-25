/**
 * Fleet Dashboard BFF — Static Placeholder (T015)
 *
 * Serves a minimal HTML shell at `GET /` until the browser client is built.
 * Per tasks.md T017/T026 (FR-030) the browser UI's framework and visual
 * implementation are DEFERRED to a `/frontend-design` pass driven by
 * `src/client/CONTRACT.md` — this module is an explicit placeholder shell,
 * NOT a fabricated dashboard UI: it renders no instance data, no table, no
 * fake content. It only names where the real client will live and links the
 * two live API routes for manual inspection.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

import type { ServerResponse } from 'node:http';

const PLACEHOLDER_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Fleet Dashboard</title></head>
<body>
<h1>Fleet Dashboard</h1>
<p>The browser client is not yet built. See <code>src/client/CONTRACT.md</code> for the
browser-facing data contract; the visual implementation is gated on a
<code>/frontend-design</code> pass (FR-030, specs/038-fleet-dashboard/tasks.md T017/T026).</p>
<ul>
<li><a href="/api/instances">/api/instances</a> — current fleet snapshot (JSON)</li>
<li><a href="/api/stream">/api/stream</a> — live instance deltas (SSE)</li>
</ul>
</body>
</html>
`;

/** Serve the placeholder shell for `GET /`. */
export function serveStaticRoot(res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PLACEHOLDER_HTML);
}

/** The uniform 404 for anything neither an `/api/*` route nor `GET /`. */
export function serveNotFound(res: ServerResponse): void {
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
}
