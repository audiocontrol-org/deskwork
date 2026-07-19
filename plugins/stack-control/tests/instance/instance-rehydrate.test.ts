// specs/037-instance-observability — T023 [US1] RED test.
//
// THE CONTRACT (research.md D6; plan.md § Storage; runtime.ts rehydrate path):
//   The instance view is a materialized projection over the authoritative
//   durable event log. A plane restart over the same durable dir MUST rehydrate
//   the instance registry from `eventLog.replayed` (the same boot path the run
//   registry + ingest bookkeeping already use), so instance visibility survives
//   a bounce — exactly as the 036 fleet view does
//   (tests/fleet/plane-ingest-durability.test.ts).
//
//   This drives a REAL node:http plane (ephemeral port, real fetch) with a REAL
//   file-backed EventLog (no injected seam) so the durable log is written by the
//   first plane and replayed by the second over the SAME commandStoreDir.
//
//   RED until T023 wires `buildInstanceRegistry(events)` behind the
//   `GET /v1/instances` route in runtime.ts — before that the route 404s.
//
// Real node:fs tmp dir (.claude/rules/testing.md). Relative `.js` imports under
// node16 resolution. No `any`, no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';

const TOKEN = 'token-instance-rehydrate';
const INST = '22222222-2222-4222-8222-222222222222';
const HOST = 'rehydrate-host';
const PATH = '/tmp/rehydrate/proj-a';
const INSTANCE_ID = `${HOST}:${PATH}`;

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(dir: string): Promise<RunningPlane> {
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

async function closePlane(plane: RunningPlane): Promise<void> {
  const idx = activePlanes.indexOf(plane);
  if (idx >= 0) activePlanes.splice(idx, 1);
  await new Promise<void>((resolve, reject) => {
    plane.server.close((error) => (error ? reject(error) : resolve()));
  });
}

function bearer(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
}

function invocationCompletedBody(): string {
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
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 3,
      classification: 'aggregated',
      host: HOST,
      path: PATH,
      sessionId: null,
    },
    snapshot: {},
  });
}

async function instanceIds(plane: RunningPlane): Promise<string[]> {
  const res = await fetch(`${plane.baseUrl}/v1/instances`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status).toBe(200);
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('instances' in body)) {
    throw new Error(`expected an InstanceSnapshot, got ${JSON.stringify(body)}`);
  }
  const instances: unknown = Reflect.get(body, 'instances');
  if (!Array.isArray(instances)) throw new Error('expected instances array');
  return instances.map((inst) => {
    if (typeof inst !== 'object' || inst === null || !('id' in inst)) {
      throw new Error(`expected an InstanceState with an id, got ${JSON.stringify(inst)}`);
    }
    const id: unknown = Reflect.get(inst, 'id');
    if (typeof id !== 'string') throw new Error('expected a string id');
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

describe('instance view survives a plane restart (T023, rehydrate from the durable log)', () => {
  it('an ingested instance is still present via GET /v1/instances after a plane bounce', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scf-instance-rehydrate-'));
    dirsToClean.add(dir);

    // Boot 1: ingest an event that creates the instance.
    const first = await startPlane(dir);
    const ingest = await fetch(`${first.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: invocationCompletedBody(),
    });
    expect(ingest.status).toBe(200);
    expect(await instanceIds(first)).toContain(INSTANCE_ID);

    // Bounce: tear the plane down entirely.
    await closePlane(first);

    // Boot 2: a fresh runtime over the SAME durable dir rehydrates the instance
    // registry from eventLog.replayed — the instance must still be visible.
    const second = await startPlane(dir);
    expect(await instanceIds(second)).toContain(INSTANCE_ID);
  });
});
