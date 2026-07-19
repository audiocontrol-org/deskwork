// specs/037-instance-observability — T037 RED test (per-instance runs facet).
//
// THE CONTRACT (contracts/instance-query-api.md § GET /v1/instances/:id/runs):
//   GET /v1/instances/:id/runs → { runs: FleetEntry[] } — the 036 run registry
//   FILTERED to the runs OWNED by this instance (host:path). `FleetEntry` is
//   036's existing shape (unchanged). `/v1/fleet` STILL serves the full
//   cross-instance run view.
//
// A run is owned by the instance whose events carry that run's `host:path`
// (envelopes carry host/path — T007). This drives a REAL node:http plane
// end-to-end (ephemeral port, real fetch), mirroring instances-routes.test.ts.
// RED until T037 adds the route + handler + `instanceRuns` projection.
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

const TOKEN = 'token-instance-runs';
const INST = '55555555-5555-5555-8555-555555555555';

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-instance-runs-'));
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

/** A run.started telemetry event owned by a given instance (host:path) and run. */
function runBody(host: string, path: string, runId: string): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: mintUuidV7(),
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 2, // 037 identity-bearing event (AUDIT-20260719-06: v1 is legacy-without-identity)
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 1,
      classification: 'durable',
      host,
      path,
      sessionId: null,
    },
    snapshot: {},
  });
}

async function ingestRun(plane: RunningPlane, host: string, path: string, runId: string): Promise<void> {
  const res = await fetch(`${plane.baseUrl}/v1/ingest`, {
    method: 'POST',
    headers: bearer(),
    body: runBody(host, path, runId),
  });
  expect(res.status).toBe(200);
}

function runIdsOf(body: unknown, key: string): string[] {
  const list: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, key) : undefined;
  if (!Array.isArray(list)) throw new Error(`expected ${key} array, got ${JSON.stringify(body)}`);
  return list.map((entry) => {
    const runId: unknown = Reflect.get(entry as object, 'runId');
    if (typeof runId !== 'string') throw new Error('expected string runId on entry');
    return runId;
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

describe('GET /v1/instances/:id/runs — per-instance runs facet (T037)', () => {
  it('returns { runs: FleetEntry[] } filtered to the runs OWNED by that instance', async () => {
    const plane = await startPlane();
    // Two distinct instances, each owning one commandable run.
    await ingestRun(plane, 'host-a', '/tmp/proj-a', 'run-a');
    await ingestRun(plane, 'host-b', '/tmp/proj-b', 'run-b');

    const idA = 'host-a:/tmp/proj-a';
    const res = await fetch(`${plane.baseUrl}/v1/instances/${encodeURIComponent(idA)}/runs`, {
      headers: bearer(),
    });
    expect(res.status).toBe(200);
    const runIds = runIdsOf(await res.json(), 'runs');
    expect(runIds).toEqual(['run-a']);
    expect(runIds).not.toContain('run-b');
  });

  it('an instance with no runs returns { runs: [] }', async () => {
    const plane = await startPlane();
    await ingestRun(plane, 'host-a', '/tmp/proj-a', 'run-a');

    const idB = 'host-b:/tmp/proj-b'; // never ingested
    const res = await fetch(`${plane.baseUrl}/v1/instances/${encodeURIComponent(idB)}/runs`, {
      headers: bearer(),
    });
    expect(res.status).toBe(200);
    expect(runIdsOf(await res.json(), 'runs')).toEqual([]);
  });

  it('GET /v1/fleet STILL serves the full cross-instance run view (unchanged)', async () => {
    const plane = await startPlane();
    await ingestRun(plane, 'host-a', '/tmp/proj-a', 'run-a');
    await ingestRun(plane, 'host-b', '/tmp/proj-b', 'run-b');

    const res = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer() });
    expect(res.status).toBe(200);
    const runIds = runIdsOf(await res.json(), 'entries');
    expect(runIds).toContain('run-a');
    expect(runIds).toContain('run-b');
  });

  it('the runs route requires a bearer (401 on missing auth)', async () => {
    const plane = await startPlane();
    const idA = 'host-a:/tmp/proj-a';
    const res = await fetch(`${plane.baseUrl}/v1/instances/${encodeURIComponent(idA)}/runs`);
    expect(res.status).toBe(401);
  });
});
