// specs/037-instance-observability — dogfood finding T050 (RED-first fix), e2e.
//
// Drives the REAL node:http plane end-to-end (ephemeral port, real fetch) through
// the real POST /v1/sidecar/liveness handler + GET /v1/instances/:id, proving:
//   1. a posted session-liveness heartbeat populates `lastHeartbeatAt` (was
//      ALWAYS null — the plane dropped the heartbeat) AND
//   2. keeps an activity-idle instance `live` (its lastActivityAt is 5 min stale,
//      yet the fresh heartbeat holds liveness at 'live' + connection 'attached').
//   3. the live query still makes ZERO durable-store reads (FR-023/SC-007, T024) —
//      a COUNTING ObjectStore is wired behind a real CdnReader and asserted at 0.
//
// RED until the fix lands: today `livenessHandler` records nothing, so the GET
// shows `lastHeartbeatAt: null` and `liveness: 'stale'`. GREEN once the heartbeat
// feeds the instance registry.
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
import { createCdnReader, createInMemoryCache } from '../../src/storage/cdn-reader.js';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';

const TOKEN = 'token-heartbeat-e2e';
const INST = '55555555-5555-4555-8555-555555555555';
const HOST = 'idle-host';
const PATH = '/tmp/heartbeat/proj-idle';
const ID = `${HOST}:${PATH}`;

/** A COUNTING ObjectStore — every method bumps its own counter so "did the
 * durable store get touched by the live query?" is an observable number, not an
 * assumption (test code only; mirrors live-zero-durable-reads.test.ts). */
class CountingObjectStore implements ObjectStorePort {
  getObjectCalls = 0;
  headObjectCalls = 0;
  listObjectsCalls = 0;
  putObjectCalls = 0;
  private readonly objects = new Map<string, Uint8Array>();
  async putObject(input: PutObjectInput): Promise<void> {
    this.putObjectCalls += 1;
    this.objects.set(input.key, input.body);
  }
  async getObject(key: string): Promise<Uint8Array | null> {
    this.getObjectCalls += 1;
    return this.objects.get(key) ?? null;
  }
  async headObject(key: string): Promise<ObjectMetadata | null> {
    this.headObjectCalls += 1;
    const body = this.objects.get(key);
    return body === undefined ? null : { key, size: body.byteLength };
  }
  async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
    this.listObjectsCalls += 1;
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.byteLength }));
  }
  totalCalls(): number {
    return this.getObjectCalls + this.headObjectCalls + this.listObjectsCalls + this.putObjectCalls;
  }
}

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly countingStore: CountingObjectStore;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-heartbeat-e2e-'));
  dirsToClean.add(dir);
  const countingStore = new CountingObjectStore();
  const runtime = createPlaneRuntime({
    acceptedTokens: new Map([[TOKEN, INST]]),
    commandStoreDir: dir,
    cdnReader: createCdnReader({ origin: countingStore, cache: createInMemoryCache() }),
  });
  const server = runtime.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const running: RunningPlane = {
    server,
    baseUrl: `http://127.0.0.1:${boundPort(server)}`,
    countingStore,
  };
  activePlanes.push(running);
  return running;
}

function bearer(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
}

/** Ingest a single stale invocation.completed so the instance exists with a
 * `lastActivityAt` well past the live->stale window (proving the heartbeat, not
 * activity, is what holds liveness at 'live'). `host`/`path` default to the
 * single-instance identity; the AUDIT-21 test overrides them for a second one. */
async function ingestStale(
  plane: RunningPlane,
  wallClock: string,
  host: string = HOST,
  path: string = PATH,
): Promise<void> {
  const res = await fetch(`${plane.baseUrl}/v1/ingest`, {
    method: 'POST',
    headers: bearer(),
    body: JSON.stringify({
      envelope: {
        eventId: mintUuidV7(),
        installationId: INST,
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2, // 037 identity-bearing (AUDIT-20260719-16)
        type: 'invocation.completed',
        wallClock,
        monotonicOffsetMs: 1,
        classification: 'aggregated',
        host,
        path,
        sessionId: null,
      },
      snapshot: {},
    }),
  });
  expect(res.status).toBe(200);
}

async function postHeartbeat(
  plane: RunningPlane,
  emittedAt: string,
  host: string = HOST,
  path: string = PATH,
): Promise<Response> {
  return fetch(`${plane.baseUrl}/v1/sidecar/liveness`, {
    method: 'POST',
    headers: bearer(),
    body: JSON.stringify({ kind: 'session-liveness', installationId: INST, host, path, emittedAt }),
  });
}

async function getInstance(
  plane: RunningPlane,
  id: string = ID,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${plane.baseUrl}/v1/instances/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status).toBe(200);
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null) throw new Error('expected an object body');
  const instance: unknown = Reflect.get(body, 'instance');
  if (typeof instance !== 'object' || instance === null) throw new Error('expected .instance');
  const record: Record<string, unknown> = {};
  for (const key of ['liveness', 'connection', 'lastHeartbeatAt', 'lastActivityAt']) {
    record[key] = Reflect.get(instance, key);
  }
  return record;
}

afterEach(async () => {
  while (activePlanes.length > 0) {
    const plane = activePlanes.pop();
    if (plane === undefined) break;
    await new Promise<void>((resolve, reject) => {
      plane.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  for (const dir of dirsToClean) rmSync(dir, { recursive: true, force: true });
  dirsToClean.clear();
});

describe('POST /v1/sidecar/liveness feeds instance liveness end-to-end (dogfood T050)', () => {
  it('a posted heartbeat populates lastHeartbeatAt and keeps an activity-idle instance live', async () => {
    const plane = await startPlane();
    // Instance exists, but its only activity is 5 minutes stale (-> 'stale').
    await ingestStale(plane, new Date(Date.now() - 300_000).toISOString());

    const before = await getInstance(plane);
    expect(before.lastHeartbeatAt).toBeNull();
    expect(before.liveness).toBe('stale'); // stale off activity alone, pre-heartbeat

    // The sidecar heartbeats now — proving the uplink is alive though idle.
    const emittedAt = new Date().toISOString();
    const hb = await postHeartbeat(plane, emittedAt);
    expect(hb.status).toBe(200);

    const after = await getInstance(plane);
    expect(after.lastHeartbeatAt).toBe(emittedAt); // was ALWAYS null before the fix
    expect(after.liveness).toBe('live'); // heartbeat holds the idle instance alive
    expect(after.connection).toBe('attached'); // recent heartbeat = real uplink presence
    expect(after.lastActivityAt).toBe(before.lastActivityAt); // no new activity — heartbeat did it
  });

  // AUDIT-20260719-10 (HIGH): a single malformed/implausible heartbeat POST must
  // NOT poison the instance's liveness. The HTTP boundary 400s the bad body; the
  // producer fires-and-forgets so a 400 never crashes it (fail-open producer side).
  it('rejects an UNPARSEABLE emittedAt with 400 and leaves liveness uncorrupted', async () => {
    const plane = await startPlane();
    await ingestStale(plane, new Date(Date.now() - 300_000).toISOString());

    const before = await getInstance(plane);
    expect(before.liveness).toBe('stale');

    const res = await postHeartbeat(plane, 'not-a-real-timestamp');
    expect(res.status).toBe(400); // malformed timestamp is a client error, like a shape error

    const after = await getInstance(plane);
    expect(after.lastHeartbeatAt).toBeNull(); // garbage never recorded
    expect(after.liveness).toBe('stale'); // unchanged — not NaN-poisoned to 'gone'
  });

  it('rejects an implausibly FAR-FUTURE emittedAt with 400 — it can never pin an instance live', async () => {
    const plane = await startPlane();
    await ingestStale(plane, new Date(Date.now() - 300_000).toISOString());

    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 975).toISOString();
    const res = await postHeartbeat(plane, farFuture);
    expect(res.status).toBe(400); // future beyond clock-skew tolerance is refused at the boundary

    const after = await getInstance(plane);
    expect(after.lastHeartbeatAt).toBeNull(); // never recorded
    expect(after.liveness).toBe('stale'); // still derives off (stale) activity, not the future timestamp
    expect(after.connection).toBe('disconnected'); // a future heartbeat is not real uplink presence
  });

  // AUDIT-20260719-21 (HIGH, blast-radius-high): the heartbeat must mark ONLY the
  // instance whose host:path it carries — NOT every instance that happens to share
  // its installationId. Two checkouts (a copy) share ONE installationId but differ
  // in path; a heartbeat from the original must leave the copy DISCONNECTED. RED
  // against the pre-fix code (keyed by installationId): the beat marks BOTH live.
  it('a heartbeat marks ONLY its own host:path — a same-installationId copy stays disconnected', async () => {
    const plane = await startPlane();
    const PATH_A = '/tmp/heartbeat/proj-original';
    const PATH_B = '/tmp/heartbeat/proj-copy'; // a copied checkout: same INST, different path.
    const ID_A = `${HOST}:${PATH_A}`;
    const ID_B = `${HOST}:${PATH_B}`;

    // Both checkouts are activity-idle (5 min stale) — only a heartbeat holds one live.
    const stale = new Date(Date.now() - 300_000).toISOString();
    await ingestStale(plane, stale, HOST, PATH_A);
    await ingestStale(plane, stale, HOST, PATH_B);

    // Only checkout A's sidecar heartbeats (carrying A's own host:path).
    const emittedAt = new Date().toISOString();
    const hb = await postHeartbeat(plane, emittedAt, HOST, PATH_A);
    expect(hb.status).toBe(200);

    const a = await getInstance(plane, ID_A);
    expect(a.lastHeartbeatAt).toBe(emittedAt);
    expect(a.liveness).toBe('live'); // A's heartbeat holds A live
    expect(a.connection).toBe('attached');

    const b = await getInstance(plane, ID_B);
    expect(b.lastHeartbeatAt).toBeNull(); // A's beat must NOT reach the copy
    expect(b.liveness).toBe('stale'); // B derives off its own stale activity
    expect(b.connection).toBe('disconnected');
  });

  it('the live instance query makes ZERO durable-store reads even after a heartbeat (SC-007)', async () => {
    const plane = await startPlane();
    await ingestStale(plane, new Date(Date.now() - 300_000).toISOString());
    await postHeartbeat(plane, new Date().toISOString());
    // Poll the live view repeatedly, as an operator's dashboard would.
    for (let i = 0; i < 5; i += 1) await getInstance(plane);
    expect(plane.countingStore.totalCalls()).toBe(0);
  });
});
