/**
 * Per-request content-index memoization for the studio.
 *
 * The content index (uuid → fs path) is the cornerstone of Phase 19c's
 * id-driven file lookups. Building it walks every markdown file under
 * each site's contentDir, so we want one build per HTTP request even
 * when multiple page renderers need the index. We also want a fresh
 * build on every NEW request — keeps the index always-fresh against fs
 * changes between requests (no stale-cache invariant to maintain).
 *
 * The memo lives on the Hono context. A request-scoped `Map<site, ContentIndex>`
 * lazily populates the first time a renderer asks for an index for a
 * given site. The middleware initializes the empty map; renderers call
 * `getRequestContentIndex(c, ctx, site)` to retrieve-or-build.
 *
 * Test injection: callers can override the build function via
 * `setIndexBuilder` — the test harness uses this to count invocations
 * and verify a single request only builds the index once.
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { ContentIndex } from '@deskwork/core/content-index';
import { buildContentIndex } from '@deskwork/core/content-index';
import type { StudioContext } from './routes/api.ts';

const CONTEXT_KEY = 'deskwork:contentIndices';

/**
 * Map keyed by site slug → ContentIndex. Stored on the Hono context
 * via `c.set(CONTEXT_KEY, …)` and retrieved via `c.get(CONTEXT_KEY)`.
 * Renderers don't touch it directly — they call `getRequestContentIndex`.
 */
type IndexCache = Map<string, ContentIndex>;

/**
 * Type guard: narrow an unknown value to our IndexCache shape. The
 * stored entries are guaranteed by the middleware (only it writes to
 * this slot), so an `instanceof Map` check is sufficient at the
 * boundary. The value param of the map carries through unchanged
 * because the middleware always stores `Map<string, ContentIndex>`
 * and `c.get` returns the same reference.
 */
function isIndexCache(value: unknown): value is IndexCache {
  return value instanceof Map;
}

/**
 * Pluggable index builder. Production points at `buildContentIndex`;
 * tests override to count invocations.
 */
export type IndexBuilder = (
  projectRoot: string,
  config: StudioContext['config'],
  site: string,
) => ContentIndex;

let activeBuilder: IndexBuilder = buildContentIndex;

/**
 * Override the index builder. Tests use this to inject a spy. Pass the
 * default `buildContentIndex` to reset.
 */
export function setIndexBuilder(builder: IndexBuilder): void {
  activeBuilder = builder;
}

/**
 * Reset the index builder to the production default. Tests call this
 * in `afterEach` to avoid bleed.
 */
export function resetIndexBuilder(): void {
  activeBuilder = buildContentIndex;
}

/**
 * Hono middleware: attach an empty per-request index cache to the
 * context. Mounted before page routes in `createApp`.
 */
export function contentIndexMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const cache: IndexCache = new Map();
    c.set(CONTEXT_KEY, cache);
    await next();
  };
}

function getCache(c: Context): IndexCache | null {
  const raw: unknown = c.get(CONTEXT_KEY);
  return isIndexCache(raw) ? raw : null;
}

/**
 * Retrieve-or-build the content index for `site` within the current
 * request. Builds on first call; reuses on every subsequent call in
 * the same request lifetime. Falls through to a one-shot build when
 * the middleware isn't installed (defensive — keeps callers working
 * even outside the HTTP path, e.g. unit-test renderers that pass a
 * synthetic Context).
 */
export function getRequestContentIndex(
  c: Context,
  studioCtx: StudioContext,
  site: string,
): ContentIndex {
  const cache = getCache(c);
  if (cache !== null) {
    const cached = cache.get(site);
    if (cached !== undefined) return cached;
    const fresh = activeBuilder(studioCtx.projectRoot, studioCtx.config, site);
    cache.set(site, fresh);
    return fresh;
  }
  // No middleware → no memoization. Builds per call.
  return activeBuilder(studioCtx.projectRoot, studioCtx.config, site);
}
