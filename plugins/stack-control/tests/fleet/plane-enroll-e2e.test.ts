/**
 * specs/037-instance-observability (plan: docs/superpowers/plans/
 * 2026-07-20-fleet-multihost-enrollment.md) — Task 3.
 *
 * End-to-end proof that the plane runtime, wired with the fleet registry's
 * live token maps + the enroll handler, actually accepts a freshly-enrolled
 * token for its bound identity and refuses it for any other identity. This
 * is the load-bearing wiring test for Task 3 (`src/plane/runtime.ts`'s
 * `enrollment` option) — it exercises Task 1 (fleet-registry.ts), Task 2
 * (http/enroll.ts) and Task 3 together over a REAL `node:http` server with
 * REAL `fetch`, never a mocked transport.
 *
 * `makeRawEvent`'s envelope shape mirrors `plane-serve.test.ts`'s helper
 * exactly (same field set) — the ingest handler's `validateTelemetryEvent`
 * requires the full envelope shape to reach `accepted`, not just
 * installationId/host/path.
 *
 * Relative `.js` imports under node16 resolution (no `@/` alias). No `any`,
 * no `as`, no `@ts-ignore` (Constitution Principle VI).
 */

import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { boundPort } from '../_bound-port.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import { loadFleetRegistry } from '../../src/plane/fleet-registry.js';
import { createEnrollHandler } from '../../src/plane/http/enroll.js';

/** A raw, wire-shaped telemetry event (the body a real sidecar POST
 * carries), satisfying `validateTelemetryEvent`. Field shape copied
 * verbatim from `plane-serve.test.ts`'s `makeRawEvent` helper. */
function makeRawEvent(o: {
  readonly installationId: string;
  readonly host: string;
  readonly path: string;
  readonly runId: string;
}): unknown {
  return {
    envelope: {
      eventId: mintUuidV7(),
      installationId: o.installationId,
      invocationId: 'invocation-1',
      runId: o.runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 1,
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 12,
      classification: 'durable',
      host: o.host,
      path: o.path,
      sessionId: null,
    },
    snapshot: {},
  };
}

let dir: string | undefined;
let server: Server | undefined;

afterEach(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
  }
  server = undefined;
  dir = undefined;
});

async function startPlane(): Promise<{ base: string; cred: string }> {
  dir = mkdtempSync(join(tmpdir(), 'scf-enroll-e2e-'));
  const reg = loadFleetRegistry(dir);
  reg.addCredential('cred-1', 'hostB');
  const runtime = createPlaneRuntime({
    acceptedTokens: reg.activeTokens(),
    acceptedInstances: reg.instanceBindings(),
    revokedTokens: reg.revokedTokens(),
    commandStoreDir: join(dir, 'commands'),
    enrollment: { handler: createEnrollHandler(reg) },
  });
  server = runtime.createServer();
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
  return { base: `http://127.0.0.1:${boundPort(server)}`, cred: 'cred-1' };
}

describe('plane enroll → ingest end to end (Task 3: runtime wiring)', () => {
  it('a freshly-enrolled token is accepted by /v1/ingest for its bound identity', async () => {
    const { base, cred } = await startPlane();
    const enroll = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'inst-1', host: 'hostB', path: '/p' }),
    });
    expect(enroll.status).toBe(200);
    const { token } = (await enroll.json()) as { token: string };

    const ok = await fetch(`${base}/v1/ingest`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(makeRawEvent({ installationId: 'inst-1', host: 'hostB', path: '/p', runId: 'r1' })),
    });
    expect(ok.status).toBe(200);
  });

  it('the enrolled token is refused 403 for a DIFFERENT identity', async () => {
    const { base, cred } = await startPlane();
    const enroll = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'inst-1', host: 'hostB', path: '/p' }),
    });
    const { token } = (await enroll.json()) as { token: string };
    const bad = await fetch(`${base}/v1/ingest`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(makeRawEvent({ installationId: 'other', host: 'hostZ', path: '/q', runId: 'r2' })),
    });
    expect(bad.status).toBe(403);
  });
});
