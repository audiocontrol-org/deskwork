// specs/037-instance-observability — T029 [SC-006] RED test.
//
// THE CONTRACT (data-model.md § Session Identity & InstanceState):
//   Session lifetime counters (`sessionsStarted`, `sessionsEnded`) and the
//   `firstSessionAt` timestamp MUST survive a plane restart. The instance view
//   is a materialized projection over the durable event log; session.started
//   and session.ended are `durable` events (stored in the log, replayed on boot),
//   so the counts must be rehydrated from `eventLog.replayed` exactly as the
//   036 fleet view rehydrates run data (tests/fleet/plane-ingest-durability.test.ts).
//
//   This drives a REAL node:http plane (ephemeral port, real fetch) with a REAL
//   file-backed EventLog (no injected seam) so durable session events are written
//   by the first plane and replayed by the second over the SAME commandStoreDir.
//
//   Ingest session.started + session.ended events (durable, carrying
//   { sessionId, startedAt } and { sessionId, endedAt, reason } snapshots),
//   read the instance's session counts + firstSessionAt, restart the plane,
//   and assert counts + firstSessionAt are identical (both unchanged AND
//   non-zero).
//
//   RED because buildInstanceRegistry does NOT fold session.* yet — counts
//   stay 0 both before and after restart. The test asserts the counts are
//   EXPECTED non-zero values, which fail now.
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

const TOKEN = 'token-session-rehydrate';
const INST = '33333333-3333-4333-8333-333333333333';
const HOST = 'session-rehydrate-host';
const PATH = '/tmp/session-rehydrate/proj-b';
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
  const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${boundPort(server)}` };
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

/**
 * Construct a session.started event (durable type). Per contracts/telemetry-events.md,
 * the envelope carries host/path/sessionId, and the snapshot carries { sessionId, startedAt }.
 */
function sessionStartedBody(sessionId: string, startedAt: string, installationSequence: number): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: mintUuidV7(),
      runId: null,
      // installationSequence is the instance-monotonic ordering key (per-installation,
      // monotonic across invocations); each event carries a strictly-increasing value.
      installationSequence,
      invocationSequence: 1,
      schemaVersion: 2,
      type: 'session.started',
      wallClock: startedAt,
      monotonicOffsetMs: 0,
      classification: 'durable',
      host: HOST,
      path: PATH,
      sessionId: sessionId,
    },
    snapshot: {
      sessionId: sessionId,
      startedAt: startedAt,
    },
  });
}

/**
 * Construct a session.ended event (durable type). Per contracts/telemetry-events.md,
 * the envelope carries host/path/sessionId, and the snapshot carries
 * { sessionId, endedAt, reason: 'ended' | 'abandoned' }.
 */
function sessionEndedBody(sessionId: string, startedAt: string, endedAt: string, installationSequence: number): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: mintUuidV7(),
      runId: null,
      // installationSequence is the instance-monotonic ordering key; strictly
      // greater than the paired session.started's value.
      installationSequence,
      invocationSequence: 2,
      schemaVersion: 2,
      type: 'session.ended',
      wallClock: endedAt,
      monotonicOffsetMs: 10,
      classification: 'durable',
      host: HOST,
      path: PATH,
      sessionId: sessionId,
    },
    snapshot: {
      sessionId: sessionId,
      endedAt: endedAt,
      reason: 'ended',
    },
  });
}

/**
 * Fetch the instance snapshot from the plane's GET /v1/instances endpoint.
 * Returns the full instance state (InstanceState shape per data-model.md).
 */
async function getInstanceState(plane: RunningPlane, instanceId: string): Promise<Record<string, unknown> | null> {
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

  for (const inst of instances) {
    if (typeof inst !== 'object' || inst === null || !('id' in inst)) {
      throw new Error(`expected an InstanceState with an id, got ${JSON.stringify(inst)}`);
    }
    const id: unknown = Reflect.get(inst, 'id');
    if (typeof id === 'string' && id === instanceId) {
      return inst as Record<string, unknown>;
    }
  }
  return null;
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

describe('session lifetime counters survive a plane restart (T029, SC-006)', () => {
  it('sessionsStarted, sessionsEnded, and firstSessionAt are rehydrated from the durable event log after a plane bounce', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scf-session-counts-rehydrate-'));
    dirsToClean.add(dir);

    // Timestamps are anchored to "now" (not a fixed calendar instant) so the
    // instance's derived liveness stays within the window and it surfaces in the
    // DEFAULT `/v1/instances` snapshot (which excludes `gone` instances). A fixed
    // past instant would age past the reconciliation grace and be filtered out,
    // making the read time-fragile — the ordering (session1 before session2) and
    // every asserted value below are preserved.
    const nowMs = Date.now();
    const iso = (offsetMs: number): string => new Date(nowMs + offsetMs).toISOString();

    const session1 = 'session-001-rehydrate';
    const session1StartedAt = iso(-4000);
    const session1EndedAt = iso(-3000);

    const session2 = 'session-002-rehydrate';
    const session2StartedAt = iso(-2000);
    const session2EndedAt = iso(-1000);

    // Boot 1: ingest two complete session lifecycles (started + ended).
    const first = await startPlane(dir);

    // Ingest session 1: started
    const ingest1 = await fetch(`${first.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: sessionStartedBody(session1, session1StartedAt, 1),
    });
    expect(ingest1.status).toBe(200);

    // Ingest session 1: ended
    const ingest2 = await fetch(`${first.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: sessionEndedBody(session1, session1StartedAt, session1EndedAt, 2),
    });
    expect(ingest2.status).toBe(200);

    // Ingest session 2: started
    const ingest3 = await fetch(`${first.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: sessionStartedBody(session2, session2StartedAt, 3),
    });
    expect(ingest3.status).toBe(200);

    // Ingest session 2: ended
    const ingest4 = await fetch(`${first.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: sessionEndedBody(session2, session2StartedAt, session2EndedAt, 4),
    });
    expect(ingest4.status).toBe(200);

    // Read the instance state from the first plane (before restart).
    const beforeRestart = await getInstanceState(first, INSTANCE_ID);
    expect(beforeRestart).not.toBeNull();

    if (beforeRestart === null) throw new Error('instance not found before restart');

    // Extract the session counts and firstSessionAt from the first read.
    const sessionsStartedBefore = beforeRestart.sessionsStarted;
    const sessionsEndedBefore = beforeRestart.sessionsEnded;
    const firstSessionAtBefore = beforeRestart.firstSessionAt;

    // ASSERTION: Before restart, counts MUST be non-zero (ingested 2 started + 2 ended).
    // This is the RED gate: buildInstanceRegistry does NOT fold session.* yet,
    // so these will be 0, and the assertions will FAIL.
    expect(sessionsStartedBefore).toBe(2);
    expect(sessionsEndedBefore).toBe(2);
    expect(firstSessionAtBefore).toBe(session1StartedAt);

    // Bounce: tear the plane down entirely.
    await closePlane(first);

    // Boot 2: a fresh runtime over the SAME durable dir rehydrates the session
    // counts from eventLog.replayed — counts must still be non-zero and identical.
    const second = await startPlane(dir);

    const afterRestart = await getInstanceState(second, INSTANCE_ID);
    expect(afterRestart).not.toBeNull();

    if (afterRestart === null) throw new Error('instance not found after restart');

    // Extract counts and firstSessionAt from the second read.
    const sessionsStartedAfter = afterRestart.sessionsStarted;
    const sessionsEndedAfter = afterRestart.sessionsEnded;
    const firstSessionAtAfter = afterRestart.firstSessionAt;

    // ASSERTION: After restart, counts + firstSessionAt MUST be identical to before restart.
    expect(sessionsStartedAfter).toBe(sessionsStartedBefore);
    expect(sessionsEndedAfter).toBe(sessionsEndedBefore);
    expect(firstSessionAtAfter).toBe(firstSessionAtBefore);

    // Guard: they MUST be the expected non-zero values, unchanged across the bounce.
    expect(sessionsStartedAfter).toBe(2);
    expect(sessionsEndedAfter).toBe(2);
    expect(firstSessionAtAfter).toBe(session1StartedAt);
  });
});
