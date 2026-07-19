// specs/036-fleet-control-plane — T099 (impl), Phase 7 (US5 — serve history
// without amplifying the capped store); AUDIT-20260718-10 (REGRESSION fix —
// in-flight request coalescing).
//
// This is the READ ECONOMICS surface (data-model.md § Storage layout
// invariants ~149-150; research.md PT-005; contracts/plane-client-api.md
// C7): a `CdnReader` fronts the vendor-free `ObjectStorePort` (origin, the
// capped durable store) with an injected `CachePort` (the CDN edge cache).
// Operator ground truth (research.md § Do NOT re-derive): B2 Class B
// (read) transactions ARE aggressively capped in production — a read path
// that amplifies capped-store transactions with client traffic is a
// DEFECT. This module is the ONLY seam that reaches the durable store for
// reads (live views never do — see tests/fleet/live-no-cloud-read.test.ts,
// T090, SC-009); every read routed through here must keep origin
// transactions FLAT as client traffic scales (SC-008).
//
// Three behaviors, all pinned by tests:
//   1. Cache-then-origin, asymmetric by result (data-model.md ~150,
//      research.md PT-005): a 200 (object present) is cached FOREVER — the
//      storage layer's immutability invariant (FR-066: published event
//      objects are never mutated; a new revision is a new URL) means there
//      is never anything to invalidate. A 404 (absent key — exactly the
//      shape of sequence probing, research.md R-01) is NEVER cached: every
//      read of a still-absent key re-checks origin, so the event landing a
//      moment later is visible on the very next probe. Cloudflare caches
//      404s with a short but nonzero TTL by default; caching them here
//      would stall the plane (PT-005's one deliberate no-cache exception).
//   2. Path-only cache keys (contracts/plane-client-api.md C7, FR-069): the
//      query string never appears in, or influences, the cache key. An
//      "uncanned query" (arbitrary pagination/filter/nonce) is
//      UNREPRESENTABLE, not merely discouraged — the design's own thesis
//      (make the failure state impossible) applied to caching.
//   3. In-flight request coalescing (AUDIT-20260718-10): a cache MISS on
//      its own is not enough to keep origin transactions flat — N
//      concurrent callers all missing the cache for the SAME not-yet-cached
//      key would, without coalescing, each independently reach origin,
//      directly amplifying origin transactions with client traffic (the
//      exact defect SC-008 above exists to prevent). A per-key in-flight
//      `Promise<CdnReadResult>` map ensures only the FIRST concurrent
//      caller for a cold key ever calls `origin.getObject`; every
//      concurrent caller behind it shares that same in-flight promise. The
//      in-flight entry is cleared once the read settles (success or
//      failure) so the NEXT cold read (e.g. a later 404-then-200 probe,
//      PT-005) starts a fresh origin call rather than being stuck replaying
//      a stale result.
//
// `Cache-Control: public, max-age=31536000, immutable` (data-model.md
// ~150) is the HTTP-layer header a future route handler attaches when
// serving a 200 `CdnReadResult` to a client — this module doesn't speak
// HTTP, so it exports the value as `CDN_CACHE_CONTROL` for that layer to
// apply. It must never be attached to a 404 response (the bypass above).
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias).

import type { ObjectStorePort } from './port.js';

/** The result of a single CDN-fronted read. `status: 404` always pairs
 * with `body: null` — there is no other legitimate combination, because a
 * 404 means the object does not exist yet (research.md R-01: sequence
 * probing terminates on 404, not on an error). */
export interface CdnReadResult {
  readonly status: 200 | 404;
  readonly body: Uint8Array | null;
}

/** The CDN edge-cache capability this reader fronts origin with. A plain
 * synchronous key/value store is sufficient — the cache holds only
 * already-resolved `CdnReadResult`s, never triggers I/O itself. */
export interface CachePort {
  get(key: string): CdnReadResult | undefined;
  set(key: string, value: CdnReadResult): void;
}

/** Dependencies for `createCdnReader`. `origin` is the capped durable
 * store (vendor-free `ObjectStorePort`, src/storage/port.ts); `cache` is
 * the edge cache in front of it. */
export interface CdnReaderDeps {
  readonly origin: ObjectStorePort;
  readonly cache: CachePort;
}

/** The CDN-fronted read surface. `readObject` is the only method — this
 * reader never writes to origin (that's `ObjectStorePort.putObject`,
 * exercised by the archival path, not this one). */
export interface CdnReader {
  readObject(key: string): Promise<CdnReadResult>;
}

/** `Cache-Control` value the HTTP layer attaches to every 200 response
 * this reader serves (data-model.md § Storage layout invariants ~150).
 * NEVER attach this to a 404 — see PT-005's probe-path bypass. */
export const CDN_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Perform the actual cold read against `origin` for `key`, writing a 200
 * result into `cache` (never a 404, per PT-005) and always clearing its
 * `inFlight` entry once settled — success or failure — so the next cold
 * read for this key (once the in-flight one resolves) starts a fresh
 * origin call rather than replaying a stale outcome.
 */
async function coldRead(
  deps: CdnReaderDeps,
  inFlight: Map<string, Promise<CdnReadResult>>,
  key: string,
): Promise<CdnReadResult> {
  try {
    const body = await deps.origin.getObject(key);
    if (body === null) {
      // PT-005 bypass: a 404 is never written to cache. Re-checked against
      // origin on every subsequent probe (once this in-flight entry
      // clears, below).
      return { status: 404, body: null };
    }

    const result: CdnReadResult = { status: 200, body };
    // Immutable-forever cache (FR-066): once written, this key is never
    // invalidated — a new revision lands at a new key, not this one.
    deps.cache.set(key, result);
    return result;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * A CDN-fronted `ObjectStorePort` reader. Checks `cache` first; on a miss,
 * COALESCES concurrent callers for the same not-yet-cached key behind one
 * shared in-flight read (AUDIT-20260718-10) — only the first concurrent
 * caller reaches `origin.getObject`, every caller behind it shares that
 * same pending promise — and, for a 200 only, writes the result back into
 * `cache` so every subsequent (post-settle) read of the same key, from any
 * number of distinct clients, costs origin nothing further (SC-008). A 404
 * is deliberately never written to cache (PT-005): the absent key is
 * re-checked against origin on every non-coalesced read until the object
 * appears.
 */
export function createCdnReader(deps: CdnReaderDeps): CdnReader {
  const inFlight = new Map<string, Promise<CdnReadResult>>();

  return {
    async readObject(key: string): Promise<CdnReadResult> {
      const cached = deps.cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const existing = inFlight.get(key);
      if (existing !== undefined) {
        return existing;
      }

      // `coldRead` calls `origin.getObject(key)` synchronously up to its
      // first `await` before this line returns, so `inFlight` is populated
      // before control returns to the caller — no window where a second
      // synchronously-issued concurrent call could slip past the check
      // above and start its own origin read.
      const pending = coldRead(deps, inFlight, key);
      inFlight.set(key, pending);
      return pending;
    },
  };
}

/** An in-memory `CachePort` — the CDN edge cache stand-in for this
 * codebase's current single-process deployment shape. Test code and
 * production code share this factory; there is no separate mock. */
export function createInMemoryCache(): CachePort {
  const store = new Map<string, CdnReadResult>();
  return {
    get(key: string): CdnReadResult | undefined {
      return store.get(key);
    },
    set(key: string, value: CdnReadResult): void {
      store.set(key, value);
    },
  };
}

/**
 * Derives a cache key from a request URL's PATH ONLY (contracts/
 * plane-client-api.md C7, FR-069). `url.search` never appears in, or
 * influences, the returned key — pagination cursors, per-client nonces,
 * timestamps, and every other adversarial query shape collapse to the
 * identical key for the identical path. This makes an "uncanned query"
 * UNREPRESENTABLE rather than merely discouraged.
 */
export function cacheKeyForRequest(url: URL): string {
  return url.pathname;
}
