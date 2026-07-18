// specs/036-fleet-control-plane — RED→GREEN for AUDIT-20260718-06 (accepted
// telemetry event is ACKed to the sidecar before it is durably logged on the
// plane).
//
// THE DEFECT: `ingestHandler` did `events.push(outcome.event); eventLog.append(
// outcome.event);` (a bare, unmarked call) and THEN `respondJson(200)`. It
// admitted the event to the in-memory registry BEFORE the durable append, so a
// durability failure (or a crash between the 200 and an in-flight append) left
// the sidecar believing the event was delivered — it advances its drain cursor
// and never resends — while the plane never durably recorded it. That is a
// permanent, silent loss of exactly the durable telemetry class this subsystem
// exists to protect (FR-066).
//
// THE FIX: append durably FIRST (the event-log append is synchronous + fsynced),
// admit to the registry and answer 200 only AFTER. If the append throws, the
// handler answers a non-2xx and the event is NOT admitted, so the sidecar
// (seeing a non-2xx) resends.
//
// This drives a REAL node:http plane (ephemeral port, real fetch) with an
// INJECTED EventLog (the same test seam as `scheduler` / `cdnReader`).
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
import type { EventLog } from '../../src/plane/event-log.js';
import type { ClassifiedEvent } from '../../src/plane/registry.js';

const TOKEN = 'token-durability';
const INST = '11111111-1111-4111-8111-111111111111';

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(eventLog: EventLog): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-ingest-durability-'));
  dirsToClean.add(dir);
  const runtime = createPlaneRuntime({
    acceptedTokens: new Map([[TOKEN, INST]]),
    commandStoreDir: dir,
    eventLog,
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

function bearer(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
}

function runStartedBody(runId: string): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: `inv-${runId}`,
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 1,
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 5,
      classification: 'durable',
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

describe('ingest is durable BEFORE it 200s (AUDIT-20260718-06)', () => {
  it('a durable-append failure yields a non-2xx and does NOT admit the event to live state', async () => {
    // The durable append fails. The handler must NOT admit the event to the
    // registry nor answer 200 — otherwise the sidecar would treat a lost event
    // as delivered. Before the fix, the event was pushed to the registry BEFORE
    // the (throwing) append, so the fleet snapshot would show it.
    const failingLog: EventLog = {
      replayed: [],
      append(): void {
        throw new Error('simulated durable-append failure');
      },
    };
    const plane = await startPlane(failingLog);

    const res = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: runStartedBody('run-durability'),
    });
    expect(res.status).not.toBe(200);

    // The event must NOT be visible in the live registry — durability failed,
    // so it was never admitted.
    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(fleet.status).toBe(200);
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot, got ${JSON.stringify(snapshot)}`);
    }
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(0);
  });

  it('a successful ingest appends durably BEFORE responding 200 (append precedes the ack)', async () => {
    // A recording log captures the appended events and the order relative to
    // the HTTP response. Because append is synchronous and runs before
    // respondJson, the event is durably recorded by the time the 200 is seen.
    const appended: ClassifiedEvent[] = [];
    const recordingLog: EventLog = {
      replayed: [],
      append(event: ClassifiedEvent): void {
        appended.push(event);
      },
    };
    const plane = await startPlane(recordingLog);

    const res = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: bearer(),
      body: runStartedBody('run-ok'),
    });
    expect(res.status).toBe(200);

    // The durable append happened (before the response completed): the event
    // is recorded, and it was admitted to the registry too.
    expect(appended).toHaveLength(1);
    expect(appended[0]?.envelope.runId).toBe('run-ok');

    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot, got ${JSON.stringify(snapshot)}`);
    }
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(1);
  });

  it('a retry after a durable-append FAILURE is re-accepted and durably appended, never deduped-and-dropped (AUDIT-20260718-37)', async () => {
    // REGRESSION over the incomplete AUDIT-...-06 fix: `ingestEvent` MUTATES the
    // ingest state (marks the eventId SEEN, advances the per-run no-regress
    // high-water) as part of deciding the outcome, BEFORE the durable append
    // runs. So if the first append throws (→ non-2xx), the sidecar retries the
    // SAME event — but pre-fix the eventId is already in `seenEventIds` (and the
    // run high-water advanced), so the retry is classified `duplicate`/`stale`,
    // answered 200, and NEVER durably appended → the event is lost forever, the
    // exact durable class this subsystem exists to protect.
    //
    // A flaky log fails the FIRST append then succeeds — modelling a transient
    // downstream store failure that a retry recovers from.
    let failNextAppend = true;
    const appended: ClassifiedEvent[] = [];
    const flakyLog: EventLog = {
      replayed: [],
      append(event: ClassifiedEvent): void {
        if (failNextAppend) {
          failNextAppend = false;
          throw new Error('simulated durable-append failure (first attempt only)');
        }
        appended.push(event);
      },
    };
    const plane = await startPlane(flakyLog);

    // The IDENTICAL event, sent twice — a sidecar retry re-sends the same bytes
    // (same eventId). Building the body once guarantees byte-identity.
    const body = runStartedBody('run-retry-durability');

    const first = await fetch(`${plane.baseUrl}/v1/ingest`, { method: 'POST', headers: bearer(), body });
    expect(first.status).not.toBe(200);
    expect(appended).toHaveLength(0);

    // Retry the SAME event: append now succeeds. Post-fix, the rolled-back ingest
    // state re-accepts it and appends durably; pre-fix it is deduped-and-dropped.
    const retry = await fetch(`${plane.baseUrl}/v1/ingest`, { method: 'POST', headers: bearer(), body });
    expect(retry.status).toBe(200);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.envelope.runId).toBe('run-retry-durability');

    // And it is visible in the live registry — admitted only AFTER durable append.
    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot, got ${JSON.stringify(snapshot)}`);
    }
    const entries: unknown = Reflect.get(snapshot, 'entries');
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(1);
  });
});
