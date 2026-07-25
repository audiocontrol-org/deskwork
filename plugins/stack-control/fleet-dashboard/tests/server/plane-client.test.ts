// T010 — RED test for the Fleet Dashboard BFF plane client.
//
// Per FR-002/FR-025 (dashboard-bff-api.md), the plane client is the ONLY
// party in the BFF that calls the plane's `/v1/*` read API and the ONLY
// holder of the read credential: it MUST attach the credential
// (Authorization: Bearer, matching src/plane/http/auth.ts's bearer-scheme
// verification) to every allowlisted upstream read, and MUST NEVER expose
// that credential to callers — not in a returned value, not in a thrown
// error's message. Non-allowlisted upstream paths are refused, not
// proxied — the six typed methods below are the WHOLE allowlist; there is
// no generic "call this path" escape hatch to test against.
//
// `fetch` is injected (DI) so every assertion below reads the actual
// outgoing request (URL + headers) with zero real network I/O.

import { describe, it, expect } from 'vitest';
import {
  createPlaneClient,
  isAllowlistedPlanePath,
  PlaneClientError,
  type PlaneClientDeps,
} from '../../src/server/plane-client.js';
import type { DashboardConfig } from '../../src/server/config.js';

const CONFIG: DashboardConfig = Object.freeze({
  planeUrl: 'https://plane.example.internal:7777',
  planeReadToken: 'read-token-abc123-SECRET',
  host: '127.0.0.1',
  port: 8080,
});

interface RecordedCall {
  readonly url: string;
  readonly method: string | undefined;
  readonly headers: Headers;
}

/** A recording fetch stub: every call is captured (no real network I/O)
 * and answered by `respond` (defaults to an empty 200 JSON object). */
function createRecordingFetch(
  respond: (call: RecordedCall) => Response = () => jsonResponse({}),
): { fetchFn: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchFn, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deps(fetchFn: typeof fetch): PlaneClientDeps {
  return { config: CONFIG, fetchFn };
}

describe('plane-client — credential attachment (FR-025)', () => {
  it('attaches Authorization: Bearer <token> to GET /v1/instances', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    await createPlaneClient(deps(fetchFn)).instanceSnapshot();
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    expect(new URL(call.url).pathname).toBe('/v1/instances');
    expect(call.method).toBe('GET');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${CONFIG.planeReadToken}`);
  });

  it('requests ?include=all on GET /v1/instances when includeAll is set (FR-014a reveal)', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    await createPlaneClient(deps(fetchFn)).instanceSnapshot({ includeAll: true });
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    const url = new URL(call.url);
    expect(url.pathname).toBe('/v1/instances');
    expect(url.searchParams.get('include')).toBe('all');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${CONFIG.planeReadToken}`);
  });

  it('attaches the credential to GET /v1/instances/:id', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    await createPlaneClient(deps(fetchFn)).instanceDetail('myhost:/work/proj');
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    expect(new URL(call.url).pathname).toBe(`/v1/instances/${encodeURIComponent('myhost:/work/proj')}`);
    expect(call.headers.get('Authorization')).toBe(`Bearer ${CONFIG.planeReadToken}`);
  });

  it('attaches the credential to GET /v1/instances/:id/runs', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    await createPlaneClient(deps(fetchFn)).instanceRuns('myhost:/work/proj');
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    expect(new URL(call.url).pathname).toBe(
      `/v1/instances/${encodeURIComponent('myhost:/work/proj')}/runs`,
    );
    expect(call.headers.get('Authorization')).toBe(`Bearer ${CONFIG.planeReadToken}`);
  });

  it('attaches the credential to GET /v1/runs/:runId', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    await createPlaneClient(deps(fetchFn)).runDetail('run-123');
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    expect(new URL(call.url).pathname).toBe('/v1/runs/run-123');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${CONFIG.planeReadToken}`);
  });

  it('attaches the credential to GET /v1/runs/:runId/history', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    await createPlaneClient(deps(fetchFn)).runHistory('run-123');
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    expect(new URL(call.url).pathname).toBe('/v1/runs/run-123/history');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${CONFIG.planeReadToken}`);
  });

  it('attaches the credential to GET /v1/runs/:runId/timings', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    await createPlaneClient(deps(fetchFn)).runTimings('run-123');
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    expect(new URL(call.url).pathname).toBe('/v1/runs/run-123/timings');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${CONFIG.planeReadToken}`);
  });
});

describe('plane-client — credential never exposed to callers (FR-003)', () => {
  it('the resolved instanceSnapshot() value is exactly the parsed upstream body — no token, no headers', async () => {
    const upstreamBody = { instances: [{ id: 'a:b', connection: 'attached', liveness: 'live' }] };
    const { fetchFn } = createRecordingFetch(() => jsonResponse(upstreamBody));
    const result = await createPlaneClient(deps(fetchFn)).instanceSnapshot();
    expect(result).toEqual(upstreamBody);
    expect(JSON.stringify(result)).not.toContain(CONFIG.planeReadToken);
  });

  it('a non-2xx upstream response raises PlaneClientError whose message never contains the token', async () => {
    const { fetchFn } = createRecordingFetch(() => jsonResponse({ error: 'unauthorized' }, 401));
    const client = createPlaneClient(deps(fetchFn));
    await expect(client.instanceSnapshot()).rejects.toBeInstanceOf(PlaneClientError);
    try {
      await client.instanceSnapshot();
      throw new Error('expected instanceSnapshot() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(PlaneClientError);
      if (!(err instanceof PlaneClientError)) throw err;
      expect(err.message).not.toContain(CONFIG.planeReadToken);
    }
  });

  it('a transport failure (fetch rejects) raises PlaneClientError whose message never contains the token', async () => {
    const fetchFn = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const client = createPlaneClient({ config: CONFIG, fetchFn });
    try {
      await client.instanceDetail('a:b');
      throw new Error('expected instanceDetail() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(PlaneClientError);
      if (!(err instanceof PlaneClientError)) throw err;
      expect(err.message).not.toContain(CONFIG.planeReadToken);
    }
  });
});

describe('plane-client — non-allowlisted upstream paths are refused, not proxied (FR-025)', () => {
  it('isAllowlistedPlanePath accepts exactly the six allowlisted route shapes', () => {
    expect(isAllowlistedPlanePath('/v1/instances')).toBe(true);
    expect(isAllowlistedPlanePath('/v1/instances/abc')).toBe(true);
    expect(isAllowlistedPlanePath('/v1/instances/abc/runs')).toBe(true);
    expect(isAllowlistedPlanePath('/v1/runs/abc')).toBe(true);
    expect(isAllowlistedPlanePath('/v1/runs/abc/history')).toBe(true);
    expect(isAllowlistedPlanePath('/v1/runs/abc/timings')).toBe(true);
  });

  it('isAllowlistedPlanePath refuses upstream routes outside the BFF allowlist', () => {
    // Real plane routes that exist (src/plane/http/server.ts) but are NOT
    // in this BFF's allowlist (dashboard-bff-api.md) — a write/command
    // route, a fleet-wide route, and the store-health route.
    expect(isAllowlistedPlanePath('/v1/fleet')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/fleet/stream')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/fleet/commands')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/runs/abc/commands')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/commands/abc')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/health/store')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/instances/stream')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/instances/stream/runs')).toBe(false);
    // Fabricated / nonsense paths.
    expect(isAllowlistedPlanePath('/v2/instances')).toBe(false);
    expect(isAllowlistedPlanePath('/v1/instances/abc/extra')).toBe(false);
    expect(isAllowlistedPlanePath('/etc/passwd')).toBe(false);
  });

  it('refuses the literal id "stream" — that upstream path is the plane\'s reserved SSE route, not an instance id', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    const client = createPlaneClient(deps(fetchFn));
    await expect(client.instanceDetail('stream')).rejects.toBeInstanceOf(PlaneClientError);
    await expect(client.instanceRuns('stream')).rejects.toBeInstanceOf(PlaneClientError);
    // Neither refused call reached the network.
    expect(calls).toHaveLength(0);
  });

  it('a path-injection attempt via a malicious id never escapes its own allowlisted route shape', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    // A malicious id trying to widen the call to a disallowed upstream
    // route via literal path segments.
    await createPlaneClient(deps(fetchFn)).instanceDetail('../../health/store');
    const call = calls[0];
    if (call === undefined) throw new Error('expected a recorded call');
    const pathname = new URL(call.url).pathname;
    // The malicious segments are percent-encoded into ONE opaque path
    // segment under /v1/instances/ — never resolved as extra path
    // components, and never landing on a disallowed route.
    expect(pathname).toBe(`/v1/instances/${encodeURIComponent('../../health/store')}`);
    expect(pathname).not.toBe('/v1/health/store');
    expect(isAllowlistedPlanePath(pathname)).toBe(true);
  });

  it('every allowlisted call target actually appears in the six-method PlaneClient interface — no generic path escape hatch exists to call off-allowlist', async () => {
    const { fetchFn } = createRecordingFetch();
    const client = createPlaneClient(deps(fetchFn));
    // Compile-time closed surface: exactly these six methods. A cast to
    // `Record<string, unknown>` would be an `as Type` violation, so this
    // is asserted structurally instead — every own key is one of the six.
    const methodNames = Object.keys(client).sort();
    expect(methodNames).toEqual(
      ['instanceDetail', 'instanceRuns', 'instanceSnapshot', 'runDetail', 'runHistory', 'runTimings'].sort(),
    );
  });
});

describe('plane-client — the read credential is scrubbed from injected fetch/transport error text (AUDIT-20260725-05)', () => {
  // Because `fetchFn` is injected, a wrapper/transport error can itself echo
  // request internals (e.g. an HTTP client that stringifies its request
  // options, including the `Authorization: Bearer <token>` header, into its
  // own Error#message). getJson()'s two String(err)-interpolating branches
  // (the transport-failure catch and the non-JSON-body-parse catch) MUST
  // scrub the configured read token out of that upstream text before it
  // reaches PlaneClientError#message — never just drop all context.

  it('channel 1 — a transport failure (fetchFn throws) whose Error#message embeds the token is redacted, not leaked', async () => {
    const fetchFn = (async () => {
      throw new Error(
        `request failed: Authorization: Bearer ${CONFIG.planeReadToken} rejected by upstream proxy`,
      );
    }) as typeof fetch;
    const client = createPlaneClient({ config: CONFIG, fetchFn });
    try {
      await client.instanceSnapshot();
      throw new Error('expected instanceSnapshot() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(PlaneClientError);
      if (!(err instanceof PlaneClientError)) throw err;
      expect(err.message).not.toContain(CONFIG.planeReadToken);
      // Context is scrubbed, not dropped: the rest of the upstream text and
      // a redaction marker both survive.
      expect(err.message).toContain('rejected by upstream proxy');
      expect(err.message).toContain('[REDACTED]');
    }
  });

  it('channel 2 — a non-JSON-body parse failure whose Error#message embeds the token is redacted, not leaked', async () => {
    const brokenJsonResponse = new Response('not json', { status: 200 });
    Object.defineProperty(brokenJsonResponse, 'json', {
      value: async () => {
        throw new Error(
          `SyntaxError while re-issuing with header Authorization: Bearer ${CONFIG.planeReadToken}`,
        );
      },
    });
    const fetchFn = (async () => brokenJsonResponse) as typeof fetch;
    const client = createPlaneClient({ config: CONFIG, fetchFn });
    try {
      await client.runDetail('run-123');
      throw new Error('expected runDetail() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(PlaneClientError);
      if (!(err instanceof PlaneClientError)) throw err;
      expect(err.message).not.toContain(CONFIG.planeReadToken);
      expect(err.message).toContain('[REDACTED]');
    }
  });

  it('channel 3 — every occurrence of the token in the upstream text is redacted, not just the first', async () => {
    const fetchFn = (async () => {
      throw new Error(
        `first attempt with Bearer ${CONFIG.planeReadToken} failed; retry with Bearer ${CONFIG.planeReadToken} also failed`,
      );
    }) as typeof fetch;
    const client = createPlaneClient({ config: CONFIG, fetchFn });
    try {
      await client.instanceSnapshot();
      throw new Error('expected instanceSnapshot() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(PlaneClientError);
      if (!(err instanceof PlaneClientError)) throw err;
      expect(err.message).not.toContain(CONFIG.planeReadToken);
      const redactionCount = err.message.split('[REDACTED]').length - 1;
      expect(redactionCount).toBe(2);
    }
  });

  it('channel 4 — an empty configured token is a safe no-op: upstream error text passes through unmangled', async () => {
    const emptyTokenConfig: DashboardConfig = Object.freeze({ ...CONFIG, planeReadToken: '' });
    const fetchFn = (async () => {
      throw new Error('ECONNREFUSED talking to upstream plane');
    }) as typeof fetch;
    const client = createPlaneClient({ config: emptyTokenConfig, fetchFn });
    try {
      await client.instanceSnapshot();
      throw new Error('expected instanceSnapshot() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(PlaneClientError);
      if (!(err instanceof PlaneClientError)) throw err;
      // An empty token must never be treated as a substring every character
      // boundary matches (`"".split("")` inserts between every character) —
      // the original upstream text survives byte-for-byte, unmangled.
      expect(err.message).toContain('ECONNREFUSED talking to upstream plane');
      expect(err.message).not.toContain('[REDACTED]');
    }
  });
});
