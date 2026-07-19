// specs/037-instance-observability — T022 [US1] RED test (HTTP route wiring).
//
// THE CONTRACT (contracts/instance-query-api.md):
//   GET /v1/instances        → { instances: InstanceState[] }, bearer-authed,
//                              default filter = connected/recent, ?include=all
//                              also returns disconnected/gone.
//   GET /v1/instances/:id     → InstanceState (+ recentActivity); :id is the
//                              URL-encoded host:path; unknown id → 404
//                              { found: false, id }. Missing/invalid bearer → 401.
//
//   This drives a REAL node:http plane end-to-end (ephemeral port, real fetch),
//   mirroring tests/fleet/plane-ingest-durability.test.ts. RED until T022 adds
//   the routes to ROUTE_TABLE/PlaneRouteHandlers + wires the instance handlers.
//
// Real node:fs tmp dir (.claude/rules/testing.md). Relative `.js` imports under
// node16 resolution. No `any`, no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import { boundPort } from '../_bound-port.js';

const TOKEN = 'token-instances-routes';
const INST = '44444444-4444-4444-8444-444444444444';

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-instances-routes-'));
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
  const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${boundPort(server)}` };
  activePlanes.push(running);
  return running;
}

function bearer(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
}

function invocationBody(host: string, path: string, wallClock: string): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: mintUuidV7(),
      runId: null,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 1,
      type: 'invocation.completed',
      wallClock,
      monotonicOffsetMs: 1,
      classification: 'aggregated',
      host,
      path,
      sessionId: null,
    },
    snapshot: {},
  });
}

async function ingest(plane: RunningPlane, host: string, path: string, wallClock: string): Promise<void> {
  const res = await fetch(`${plane.baseUrl}/v1/ingest`, {
    method: 'POST',
    headers: bearer(),
    body: invocationBody(host, path, wallClock),
  });
  expect(res.status).toBe(200);
}

function snapshotIds(body: unknown): string[] {
  const instances: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'instances') : undefined;
  if (!Array.isArray(instances)) throw new Error(`expected instances array, got ${JSON.stringify(body)}`);
  return instances.map((inst) => {
    const id: unknown = Reflect.get(inst as object, 'id');
    if (typeof id !== 'string') throw new Error('expected string id');
    return id;
  });
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

describe('GET /v1/instances{,/:id} route wiring (T022)', () => {
  it('GET /v1/instances requires a bearer (401 on missing auth)', async () => {
    const plane = await startPlane();
    const res = await fetch(`${plane.baseUrl}/v1/instances`);
    expect(res.status).toBe(401);
  });

  it('GET /v1/instances returns a real ingested instance end-to-end', async () => {
    const plane = await startPlane();
    await ingest(plane, 'routes-host', '/tmp/routes/proj-a', new Date().toISOString());

    const res = await fetch(`${plane.baseUrl}/v1/instances`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    const ids = snapshotIds(await res.json());
    expect(ids).toContain('routes-host:/tmp/routes/proj-a');
  });

  it('GET /v1/instances/:id returns the full instance for a known (URL-encoded) id', async () => {
    const plane = await startPlane();
    const id = 'routes-host:/tmp/routes/proj-a';
    await ingest(plane, 'routes-host', '/tmp/routes/proj-a', new Date().toISOString());

    const res = await fetch(`${plane.baseUrl}/v1/instances/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) throw new Error('expected an object body');
    expect(Reflect.get(body, 'found')).toBe(true);
    const instance: unknown = Reflect.get(body, 'instance');
    if (typeof instance !== 'object' || instance === null) throw new Error('expected instance');
    expect(Reflect.get(instance, 'id')).toBe(id);
  });

  it('GET /v1/instances/:id for an unknown id returns 404 { found: false, id }', async () => {
    const plane = await startPlane();
    const unknownId = 'ghost-host:/nowhere';
    const res = await fetch(`${plane.baseUrl}/v1/instances/${encodeURIComponent(unknownId)}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) throw new Error('expected an object body');
    expect(Reflect.get(body, 'found')).toBe(false);
    expect(Reflect.get(body, 'id')).toBe(unknownId);
  });

  it('?include=all surfaces a gone instance the default view filters out', async () => {
    const plane = await startPlane();
    const goneWallClock = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago → gone
    await ingest(plane, 'gone-host', '/tmp/routes/proj-gone', goneWallClock);
    const goneId = 'gone-host:/tmp/routes/proj-gone';

    // Default view: excluded (disconnected + gone).
    const defaultRes = await fetch(`${plane.baseUrl}/v1/instances`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(defaultRes.status).toBe(200);
    expect(snapshotIds(await defaultRes.json())).not.toContain(goneId);

    // include=all: present.
    const allRes = await fetch(`${plane.baseUrl}/v1/instances?include=all`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(allRes.status).toBe(200);
    expect(snapshotIds(await allRes.json())).toContain(goneId);
  });
});
