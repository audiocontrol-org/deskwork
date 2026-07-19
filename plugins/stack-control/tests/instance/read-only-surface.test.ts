// specs/037-instance-observability — Guard test (FR-024 read-only invariant).
//
// INVARIANT: The instances query surface (/v1/instances*) is entirely read-only
// (FR-024, contracts/instance-query-api.md § No route mutates). Every route
// whose path starts with /v1/instances MUST have method: 'GET'. No POST, PUT,
// PATCH, DELETE.
//
// AUDIT-20260719-11: this guard now asserts against the REAL, imported
// `ROUTE_TABLE` data structure — NOT a regex over server.ts source text. A
// text-scraping regex can silently under-extract routes (a multi-line entry, a
// comment, a formatting change, or an unmatched method token drops the route
// from the parsed set), defeating the very invariant it exists to enforce.
// Importing the typed array makes every declared route unavoidably visible to
// the assertion, and TypeScript keeps the check in sync with the route shape.
//
// Relative `.js` imports. No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { ROUTE_TABLE } from '../../src/plane/http/server.js';

const INSTANCE_PREFIX = '/v1/instances';

function instanceRoutes(): readonly { readonly method: string; readonly pattern: string }[] {
  return ROUTE_TABLE.filter((route) => route.pattern.startsWith(INSTANCE_PREFIX)).map((route) => ({
    method: route.method,
    pattern: route.pattern,
  }));
}

describe('read-only surface invariant (FR-024, instance-query-api.md)', () => {
  it('every /v1/instances* route is GET (no state-changing operations)', () => {
    const routes = instanceRoutes();

    // At least the two currently-wired routes exist.
    expect(routes.length).toBeGreaterThanOrEqual(2);

    // EVERY declared instance route — whatever method it carries — must be GET.
    // (Iterating the imported table means a future DELETE/PUT/PATCH/POST entry is
    // caught here, not silently dropped by a text parser.)
    for (const route of routes) {
      expect(route.method, `${route.method} ${route.pattern} must be GET (FR-024)`).toBe('GET');
    }
  });

  it('documents the enumerated instance routes for audit', () => {
    const patterns = instanceRoutes()
      .map((r) => r.pattern)
      .sort();
    // At minimum, the two currently-wired routes must be present.
    expect(patterns).toContain('/v1/instances');
    expect(patterns).toContain('/v1/instances/:id');
  });
});
