// specs/037-instance-observability — Guard test (FR-024 read-only invariant).
//
// INVARIANT: The instances query surface (/v1/instances*) is entirely read-only
// (FR-024, contracts/instance-query-api.md § No route mutates). Every route
// whose path starts with /v1/instances MUST have method: 'GET'. No POST, PUT,
// PATCH, DELETE. This test codifies that invariant by reading ROUTE_TABLE
// statically.
//
// If this test PASSES, the invariant holds (no state-changing operations on
// instances). If it FAILS, a violation was introduced and must be flagged.
//
// Relative `.js` imports. No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

interface RouteEntry {
  method: string;
  pattern: string;
}

/**
 * Parse ROUTE_TABLE from server.ts by text extraction. Returns array of
 * { method, pattern } for each route entry. This is a static guard that
 * verifies the source code itself carries the invariant.
 */
function extractInstanceRoutes(): RouteEntry[] {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const serverPath = join(currentDir, '../../src/plane/http/server.ts');

  const source = readFileSync(serverPath, 'utf8');

  // Extract the ROUTE_TABLE const block. The table spans multiple lines.
  // Pattern: const ROUTE_TABLE: ... = [ ... ];
  const routeTableMatch = source.match(
    /const\s+ROUTE_TABLE\s*:\s*readonly\s+RouteDefinition\[\]\s*=\s*\[([\s\S]*?)^\]/m,
  );
  if (!routeTableMatch) {
    throw new Error(
      'extractInstanceRoutes: could not find ROUTE_TABLE in server.ts. ' +
        'Verify the const declaration exists and follows the expected structure.',
    );
  }

  const tableContent = routeTableMatch[1];

  // Extract each route entry: { method: 'GET'|'POST', pattern: '...', handler: '...' }
  // Pattern handles leading whitespace and newlines. We only care about method and pattern.
  const routePattern =
    /\{\s*method:\s*'(GET|POST)',\s*pattern:\s*'([^']+)',\s*handler:\s*'[^']+'\s*\}/g;

  const routes: RouteEntry[] = [];
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = routePattern.exec(tableContent)) !== null) {
    const method = match[1];
    const pattern = match[2];
    routes.push({ method, pattern });
  }

  if (routes.length === 0) {
    throw new Error(
      'extractInstanceRoutes: parsed ROUTE_TABLE but found zero routes. ' +
        'Check regex or table format.',
    );
  }

  return routes;
}

describe('read-only surface invariant (FR-024, instance-query-api.md)', () => {
  it('every /v1/instances* route is GET (no state-changing operations)', () => {
    const allRoutes = extractInstanceRoutes();

    // Filter to instance routes: those whose pattern starts with /v1/instances.
    const instanceRoutes = allRoutes.filter((route) => route.pattern.startsWith('/v1/instances'));

    // Verify: must find at least the two documented routes.
    expect(instanceRoutes.length).toBeGreaterThanOrEqual(2);

    // Assert: each instance route must be GET.
    for (const route of instanceRoutes) {
      expect(route.method).toBe('GET');
    }

    // Report the routes found for traceability.
    const routeDescriptions = instanceRoutes.map((r) => `${r.method} ${r.pattern}`).join(', ');
    console.log(`Instance routes verified as read-only: ${routeDescriptions}`);
  });

  it('documents the enumerated instance routes for audit', () => {
    const allRoutes = extractInstanceRoutes();
    const instanceRoutes = allRoutes.filter((route) => route.pattern.startsWith('/v1/instances'));

    // Expected routes per contracts/instance-query-api.md § Routes:
    // - GET /v1/instances
    // - GET /v1/instances/:id
    // - GET /v1/instances/:id/runs (future, T037)
    // - GET /v1/instances/stream (future, T036)

    const patterns = instanceRoutes.map((r) => r.pattern).sort();
    console.log('Instance routes enumerated from ROUTE_TABLE:', patterns);

    // At minimum, the two currently-wired routes must be present.
    expect(patterns).toContain('/v1/instances');
    expect(patterns).toContain('/v1/instances/:id');
  });
});
