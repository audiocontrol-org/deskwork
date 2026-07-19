// specs/036-fleet-control-plane — T092 (RED), Phase 7 (US5 — serve history
// without amplifying the capped store).
//
// contracts/plane-client-api.md C7 (~61-63, FR-069): "The query-shape
// constraint binds this API, not just the plane's internals: the plane
// MUST NOT expose a query shape that forces a near-unique cache key per
// request. Arbitrary caller-driven ranges, filters, and pagination are
// prohibited — they would defeat the edge cache that justifies the CDN.
// Everything in the path; nothing in the query string. ... Path-only keys
// make an uncanned query UNREPRESENTABLE rather than merely discouraged —
// the design's own thesis (make the failure state impossible) applied to
// caching."
//
// THIS TEST proves the cache-key function that will back every read route
// (GET /v1/runs/{runId}/history, GET /v1/runs/{runId}/timings) is
// PATH-ONLY: it structurally cannot shard on caller-supplied query
// parameters. This is stronger than "the current handler happens to
// ignore the query string" — the test drives the SAME pathname through a
// battery of adversarial, high-cardinality query strings (pagination
// cursors, timestamps, per-client nonces, per-request UUIDs) and asserts
// every one collapses to the IDENTICAL cache key. It also asserts the
// returned key never contains the raw query content at all, so a caller
// cannot construct a per-client key even by accident — an "uncanned
// query" is unrepresentable, not merely discouraged (FR-069).
//
// RED test: `src/storage/cdn-reader.ts` does NOT exist yet. This test MUST
// fail at module-load (VALUE import of a missing module), never a typo —
// the `import { cacheKeyForRequest } from
// '../../src/storage/cdn-reader.js'` line below is the RED trigger.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).

import { describe, expect, it } from 'vitest';
// The CDN-reader module (T099): does NOT exist until T099 impl lands. This
// import is the RED trigger — module resolution fails at load time.
import { cacheKeyForRequest } from '../../src/storage/cdn-reader.js';

describe('history/timings cache key is PATH-ONLY — an uncanned query is UNREPRESENTABLE (T092, FR-069)', () => {
  const basePath = 'https://plane.example/v1/runs/019012ab-0000-7000-8000-000000000001/history';

  it('an identical path with wildly different query strings resolves to the SAME cache key', () => {
    const bareUrl = new URL(basePath);
    const adversarialUrls = [
      // Pagination / range params — exactly what C7 names as prohibited.
      new URL(`${basePath}?from=2026-01-01&to=2026-06-01`),
      new URL(`${basePath}?page=1&pageSize=50`),
      new URL(`${basePath}?cursor=eyJvZmZzZXQiOjQyfQ`),
      // Per-client / per-request cardinality bombs.
      new URL(`${basePath}?clientId=${crypto.randomUUID()}`),
      new URL(`${basePath}?nonce=${Date.now()}-${Math.random()}`),
      // A caller trying every trick at once.
      new URL(`${basePath}?from=2026-01-01&clientId=${crypto.randomUUID()}&nonce=zz&sort=desc`),
    ];

    const bareKey = cacheKeyForRequest(bareUrl);

    for (const url of adversarialUrls) {
      expect(cacheKeyForRequest(url)).toBe(bareKey);
    }
  });

  it('two calls with the same adversarial query string, minted independently, still agree (deterministic, not accidentally stable)', () => {
    const first = cacheKeyForRequest(new URL(`${basePath}?clientId=${crypto.randomUUID()}`));
    const second = cacheKeyForRequest(new URL(`${basePath}?clientId=${crypto.randomUUID()}`));
    expect(first).toBe(second);
  });

  it('the returned key never contains the raw query string content — the query is discarded, not merely ignored in comparison', () => {
    const secretLookingNonce = 'zzz-should-never-appear-in-key-zzz';
    const url = new URL(`${basePath}?nonce=${secretLookingNonce}&from=2020-01-01&to=2030-01-01`);
    const key = cacheKeyForRequest(url);

    expect(key.includes('?')).toBe(false);
    expect(key.includes(secretLookingNonce)).toBe(false);
    expect(key.includes('from=')).toBe(false);
    expect(key.includes('to=')).toBe(false);
  });

  it('a DIFFERENT path produces a DIFFERENT key — the function is not a constant that discards everything', () => {
    const historyUrl = new URL(basePath);
    const timingsUrl = new URL(basePath.replace('/history', '/timings'));
    const otherRunUrl = new URL(
      basePath.replace('019012ab-0000-7000-8000-000000000001', '019012ab-0000-7000-8000-000000000002'),
    );

    const historyKey = cacheKeyForRequest(historyUrl);
    expect(cacheKeyForRequest(timingsUrl)).not.toBe(historyKey);
    expect(cacheKeyForRequest(otherRunUrl)).not.toBe(historyKey);
  });
});
