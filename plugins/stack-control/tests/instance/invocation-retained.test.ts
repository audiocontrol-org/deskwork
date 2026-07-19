// specs/037-instance-observability — T020 [US1] RED test.
//
// THE CONTRACT (data-model.md § Event types; registry.ts:12 note):
//   036's RUN registry DISCARDS short-verb `invocation.completed`
//   (`runId: null`) from the fleet run view. The INSTANCE view is keyed by
//   MACHINE (`host:path`), not run, and MUST RETAIN `invocation.completed` in
//   the in-memory event stream that feeds `buildInstanceRegistry` — so a
//   machine whose only recent telemetry is short-verb invocations still shows a
//   `lastActivity` / `lastActivityAt` derived from that `invocation.completed`.
//
//   This drives a REAL node:http plane: ingest one `invocation.completed`, then
//   read the instance back over the query API. Before the wiring lands the
//   instance route 404s (RED); once the instance registry is fed the full event
//   stream, the retained `invocation.completed` surfaces as the instance's last
//   activity (GREEN).
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

const TOKEN = 'token-invocation-retained';
const INST = '33333333-3333-4333-8333-333333333333';
const HOST = 'retain-host';
const PATH = '/tmp/retain/proj-b';
const INSTANCE_ID = `${HOST}:${PATH}`;
const WALL_CLOCK = new Date().toISOString();

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-invocation-retained-'));
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

function invocationCompletedBody(): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: mintUuidV7(),
      runId: null,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 2, // 037 identity-bearing (AUDIT-20260719-16)
      type: 'invocation.completed',
      wallClock: WALL_CLOCK,
      monotonicOffsetMs: 7,
      classification: 'aggregated',
      host: HOST,
      path: PATH,
      sessionId: null,
    },
    snapshot: {},
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

describe('invocation.completed is retained in the instance stream (T020)', () => {
  it('an ingested invocation.completed surfaces as the instance last activity', async () => {
    const plane = await startPlane();

    const ingest = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: invocationCompletedBody(),
    });
    expect(ingest.status).toBe(200);

    // The instance is visible in the snapshot (retained, not discarded).
    const snapRes = await fetch(`${plane.baseUrl}/v1/instances`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(snapRes.status).toBe(200);
    const snapshot: unknown = await snapRes.json();
    const instances: unknown =
      typeof snapshot === 'object' && snapshot !== null ? Reflect.get(snapshot, 'instances') : undefined;
    if (!Array.isArray(instances)) throw new Error(`expected instances array, got ${JSON.stringify(snapshot)}`);
    const ids = instances.map((inst) => Reflect.get(inst as object, 'id'));
    expect(ids).toContain(INSTANCE_ID);

    // And its lastActivity/lastActivityAt derive from that invocation.completed.
    const detailRes = await fetch(
      `${plane.baseUrl}/v1/instances/${encodeURIComponent(INSTANCE_ID)}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    expect(detailRes.status).toBe(200);
    const detail: unknown = await detailRes.json();
    if (typeof detail !== 'object' || detail === null || !('instance' in detail)) {
      throw new Error(`expected an InstanceDetail, got ${JSON.stringify(detail)}`);
    }
    const instance: unknown = Reflect.get(detail, 'instance');
    if (typeof instance !== 'object' || instance === null) {
      throw new Error('expected an instance object');
    }
    expect(Reflect.get(instance, 'lastActivity')).toBe('invocation.completed');
    expect(Reflect.get(instance, 'lastActivityAt')).toBe(WALL_CLOCK);
  });
});
