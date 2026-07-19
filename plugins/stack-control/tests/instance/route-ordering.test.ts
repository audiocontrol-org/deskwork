// specs/037-instance-observability — T035 RED test (route-ordering contract).
//
// ROUTE-ORDERING CONTRACT (specs/037-instance-observability/contracts/instance-query-api.md):
// `/v1/instances/stream` MUST appear BEFORE `/v1/instances/:id` in ROUTE_TABLE —
// first-path-match dispatch + the `[^/]+` param regex would otherwise route `stream`
// to `instanceDetail`. The `/v1/instances/stream` route does NOT exist yet (T036 adds it)
// → this test MUST fail (RED).
//
// Assert:
// 1. In `ROUTE_TABLE` (src/plane/http/server.ts), the index of `/v1/instances/stream`
//    is LESS than the index of `/v1/instances/:id`.
// 2. (Stretch) A GET to `/v1/instances/stream` is dispatched to the STREAM handler,
//    not `instanceDetail` treating `stream` as an `:id`.
//
// Real node:http plane end-to-end (ephemeral port, real fetch), mirroring
// tests/instance/instances-routes.test.ts. Relative `.js` imports under node16 resolution.
// No `any`, no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createPlaneRuntime } from '../../src/plane/runtime.js';

const TOKEN = 'token-route-ordering';
const INST = '77777777-7777-7777-8777-777777777777';

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-route-ordering-'));
  dirsToClean.add(dir);
  const runtime = createPlaneRuntime({
    acceptedTokens: new Map([[TOKEN, INST]]),
    commandStoreDir: dir,
  });
  const server = runtime.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo | string | null;
  if (address === null || typeof address === 'string') {
    throw new Error('startPlane: expected a bound TCP AddressInfo');
  }
  const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${address.port}` };
  activePlanes.push(running);
  return running;
}

afterEach(async () => {
  while (activePlanes.length > 0) {
    const plane = activePlanes.pop();
    if (plane === undefined) break;
    await new Promise<void>((resolve, reject) => {
      plane.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  for (const dir of dirsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirsToClean.clear();
});

describe('Route-ordering contract (T035, RED)', () => {
  it('ROUTE_TABLE: /v1/instances/stream appears BEFORE /v1/instances/:id (prevents param swallowing)', () => {
    // Read server.ts and extract ROUTE_TABLE route patterns.
    const serverFilePath = resolve(__dirname, '../../src/plane/http/server.ts');
    const serverSource = readFileSync(serverFilePath, 'utf-8');

    // Simple pattern: match `{ method: '...', pattern: '...', handler: '...' }` lines
    // within the ROUTE_TABLE const declaration (between `const ROUTE_TABLE:` and `];`).
    const routeTableMatch = serverSource.match(
      /const ROUTE_TABLE:\s*readonly RouteDefinition\[\]\s*=\s*\[([\s\S]*?)\];/,
    );
    expect(routeTableMatch, 'ROUTE_TABLE should be present in server.ts').toBeDefined();

    const routeTableBlock = routeTableMatch![1];

    // Extract all route patterns in order.
    const routePattern = /pattern:\s*['"]([^'"]+)['"]/g;
    const patterns: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = routePattern.exec(routeTableBlock)) !== null) {
      patterns.push(match[1]);
    }

    // Find indices of /v1/instances/stream and /v1/instances/:id.
    const streamIndex = patterns.indexOf('/v1/instances/stream');
    const detailIndex = patterns.indexOf('/v1/instances/:id');

    // Both routes MUST be present.
    expect(
      streamIndex,
      '/v1/instances/stream route must exist in ROUTE_TABLE (T036 adds it; this test goes RED until then)',
    ).toBeGreaterThanOrEqual(0);

    expect(detailIndex, '/v1/instances/:id route must exist in ROUTE_TABLE').toBeGreaterThanOrEqual(0);

    // /v1/instances/stream MUST come before /v1/instances/:id to prevent the
    // `[^/]+` param regex from swallowing the literal `stream` segment.
    expect(
      streamIndex,
      'Route-ordering contract violation: /v1/instances/stream (index ' +
        streamIndex +
        ') must appear BEFORE /v1/instances/:id (index ' +
        detailIndex +
        ') in ROUTE_TABLE. ' +
        'First-path-match dispatch + the [^/]+' +
        ' param regex would otherwise route GET /v1/instances/stream to instanceDetail.',
    ).toBeLessThan(detailIndex);
  });

  it('(Stretch) GET /v1/instances/stream is dispatched to instanceStream handler, not instanceDetail', async () => {
    // This assertion is conditional on both:
    // 1. The /v1/instances/stream route existing in ROUTE_TABLE
    // 2. The `instanceStream` handler existing in PlaneRouteHandlers
    // Both T036 tasks add these; until then, this test is skipped or fails gracefully.
    //
    // Strategy: boot a real plane, fetch /v1/instances/stream, and verify the
    // response is not a 404 (which would indicate the route doesn't exist) and
    // not a 422 (which would indicate the request was incorrectly routed to
    // instanceDetail expecting an :id). The response should be 200 with
    // content-type: text/event-stream (SSE).

    const plane = await startPlane();

    // GET /v1/instances/stream should return a real SSE stream. The stream is
    // held open (SSE) with a keepalive timer, so — per the codebase's SSE test
    // pattern (tests/fleet/plane-stream.test.ts) — an AbortController closes the
    // connection after the assertions, otherwise `server.close()` in afterEach
    // hangs waiting for the still-open SSE socket.
    const controller = new AbortController();
    const res = await fetch(`${plane.baseUrl}/v1/instances/stream`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      signal: controller.signal,
    });

    try {
      // Assertion: if this test PASSES, the status is 200 with content-type text/event-stream.
      // Until T036 wires the handler, this MUST fail with 404 or 500 (not found / handler missing).
      expect(
        res.status,
        'GET /v1/instances/stream must exist and return 200 SSE stream. ' +
          'Fails until T036 adds the route + handler. ' +
          'If you see 404: route not in ROUTE_TABLE yet. ' +
          'If you see 500: route exists but handler not wired.',
      ).toBe(200);

      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    } finally {
      if (res.body !== null) {
        await res.body.cancel();
      }
      controller.abort();
    }
  });
});
