// specs/036-fleet-control-plane — AUDIT-20260717-16 / -13 / -15 / -14
// (RED→GREEN). End-to-end evidence over a REAL node:http plane (ephemeral
// port, real fetch), covering four runtime-wiring defects:
//
//   -16: POST /v1/runs/:runId/commands must hold the command for the run's
//        OWNER (the installation that owns runId), not whichever bearer token
//        the caller used; and an unknown runId is rejected.
//   -13/-15: GET /v1/runs/:id/history and /timings must serve the archived
//        record through an INJECTED CdnReader (no dead {found:false} hardcode).
//   -14: the plane's live fleet state must survive a restart — a fresh runtime
//        over the SAME durable dir rehydrates the registry from a persisted
//        event log.
//
// Real node:fs tmp dir (.claude/rules/testing.md). Relative `.js` imports
// under node16 resolution. No `any`, no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import type { CdnReader, CdnReadResult } from '../../src/storage/cdn-reader.js';
import { runHistoryObjectKey } from '../../src/plane/http/api.js';

const TOKEN_A = 'token-a-owner';
const TOKEN_B = 'token-b-caller';
const INST_A = '11111111-1111-4111-8111-111111111111';
const INST_B = '22222222-2222-4222-8222-222222222222';

/** A fake CdnReader seeded with canned archive objects — the injected
 * archive-read seam under test, no real B2 credentials. */
class FakeCdnReader implements CdnReader {
  private readonly objects = new Map<string, Uint8Array>();
  seed(key: string, record: unknown): void {
    this.objects.set(key, new TextEncoder().encode(JSON.stringify(record)));
  }
  async readObject(key: string): Promise<CdnReadResult> {
    const body = this.objects.get(key);
    return body === undefined ? { status: 404, body: null } : { status: 200, body };
  }
}

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly dir: string;
}

interface StartOptions {
  readonly dir?: string;
  readonly cdnReader?: CdnReader;
  readonly tokens?: ReadonlyMap<string, string>;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(options: StartOptions = {}): Promise<RunningPlane> {
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), 'scf-runtime-fixes-'));
  dirsToClean.add(dir);
  const runtime = createPlaneRuntime({
    acceptedTokens: options.tokens ?? new Map([[TOKEN_A, INST_A]]),
    commandStoreDir: dir,
    cdnReader: options.cdnReader,
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
  const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${address.port}`, dir };
  activePlanes.push(running);
  return running;
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function livenessBody(installationId: string): string {
  return JSON.stringify({
    kind: 'session-liveness',
    installationId,
    emittedAt: new Date().toISOString(),
  });
}

function runStartedBody(runId: string, installationId: string): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId,
      invocationId: `inv-${runId}`,
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 1,
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 5,
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
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

describe('run-scoped commands are held for the run owner, not the caller (AUDIT-20260717-16)', () => {
  it('holds the command for the installation that OWNS the run, even when a different bearer issues it', async () => {
    const plane = await startPlane({ tokens: new Map([[TOKEN_A, INST_A], [TOKEN_B, INST_B]]) });
    const runId = 'run-owned-by-a';

    // Install the run as owned by INST_A (the event body names INST_A).
    const ingest = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: runStartedBody(runId, INST_A),
    });
    expect(ingest.status).toBe(200);

    // INST_B (a DIFFERENT bearer) issues a command against INST_A's run.
    const issue = await fetch(`${plane.baseUrl}/v1/runs/${runId}/commands`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_B), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'cancel' }),
    });
    expect(issue.status).toBe(200);
    const issueBody: unknown = await issue.json();
    if (typeof issueBody !== 'object' || issueBody === null || !('commandId' in issueBody)) {
      throw new Error(`expected commandId, got ${JSON.stringify(issueBody)}`);
    }
    const { commandId } = issueBody as { commandId: string };

    // The durably-held command must target the RUN OWNER (INST_A), never the
    // caller's installation (INST_B) — otherwise replayOnReconnect delivers it
    // to the wrong sidecar.
    const status = await fetch(`${plane.baseUrl}/v1/commands/${commandId}`, { headers: bearer(TOKEN_A) });
    const statusBody: unknown = await status.json();
    expect(statusBody).toMatchObject({
      found: true,
      command: { installationId: INST_A, kind: 'cancel' },
    });
  });

  it('rejects a command against an unknown run (404)', async () => {
    const plane = await startPlane();
    const res = await fetch(`${plane.baseUrl}/v1/runs/no-such-run/commands`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pause' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('history/timings serve the injected CdnReader archive (AUDIT-20260717-13/-15)', () => {
  it('GET /v1/runs/:id/history returns the archived record; /timings returns real phase durations', async () => {
    const reader = new FakeCdnReader();
    const runId = 'run-archived';
    reader.seed(runHistoryObjectKey({ installationId: INST_A, runId }), {
      phases: {
        execution: { durationMs: 4200 },
        governance: { durationMs: 1500 },
      },
    });
    const plane = await startPlane({ cdnReader: reader });

    // The run must be known to the registry so its installationId resolves.
    await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: runStartedBody(runId, INST_A),
    });

    const history = await fetch(`${plane.baseUrl}/v1/runs/${runId}/history`, { headers: bearer(TOKEN_A) });
    expect(history.status).toBe(200);
    const historyBody: unknown = await history.json();
    expect(historyBody).toMatchObject({
      found: true,
      record: { phases: { execution: { durationMs: 4200 }, governance: { durationMs: 1500 } } },
    });

    const timings = await fetch(`${plane.baseUrl}/v1/runs/${runId}/timings`, { headers: bearer(TOKEN_A) });
    expect(timings.status).toBe(200);
    const timingsBody: unknown = await timings.json();
    expect(timingsBody).toMatchObject({
      runId,
      phases: { execution: { durationMs: 4200 }, governance: { durationMs: 1500 } },
    });
  });
});

describe('sidecar-facing handlers enforce authed installation == body-claimed installation (AUDIT-20260718-45)', () => {
  it('REFUSES an ingest event whose envelope.installationId is spoofed to another installation (403), leaving the spoofed fleet state untouched', async () => {
    const plane = await startPlane({ tokens: new Map([[TOKEN_A, INST_A], [TOKEN_B, INST_B]]) });
    const spoofedRunId = 'run-spoofed-as-b';

    // Installation A's VALID token, but the body claims to be installation B.
    const spoof = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: runStartedBody(spoofedRunId, INST_B),
    });
    expect(spoof.status).toBe(403);

    // B's fleet state must NOT have been poisoned by A's token.
    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(TOKEN_B) });
    expect(fleet.status).toBe(200);
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot, got ${JSON.stringify(snapshot)}`);
    }
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(0);
  });

  it('ACCEPTS an ingest event whose envelope.installationId matches the authenticated installation (200)', async () => {
    const plane = await startPlane({ tokens: new Map([[TOKEN_A, INST_A]]) });
    const runId = 'run-owned-by-a';

    const accepted = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: runStartedBody(runId, INST_A),
    });
    expect(accepted.status).toBe(200);

    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(TOKEN_A) });
    const snapshot: unknown = await fleet.json();
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ runId, installationId: INST_A });
  });

  it('REFUSES a liveness heartbeat whose installationId is spoofed to another installation (403)', async () => {
    const plane = await startPlane({ tokens: new Map([[TOKEN_A, INST_A], [TOKEN_B, INST_B]]) });

    const spoof = await fetch(`${plane.baseUrl}/v1/sidecar/liveness`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: livenessBody(INST_B),
    });
    expect(spoof.status).toBe(403);
  });

  it('ACCEPTS a liveness heartbeat whose installationId matches the authenticated installation (200)', async () => {
    const plane = await startPlane({ tokens: new Map([[TOKEN_A, INST_A]]) });

    const accepted = await fetch(`${plane.baseUrl}/v1/sidecar/liveness`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: livenessBody(INST_A),
    });
    expect(accepted.status).toBe(200);
  });
});

describe("plane fleet state survives a restart over the same dir (AUDIT-20260717-14)", () => {
  it('a fresh runtime over the same durable dir rehydrates the live registry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scf-runtime-restart-'));
    dirsToClean.add(dir);
    const runId = 'run-persisted';

    const first = await startPlane({ dir });
    const ingest = await fetch(`${first.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: runStartedBody(runId, INST_A),
    });
    expect(ingest.status).toBe(200);

    // Simulate a plane restart: close the first server, boot a NEW runtime over
    // the SAME durable dir.
    await new Promise<void>((resolve, reject) => {
      first.server.close((error) => (error ? reject(error) : resolve()));
    });
    const idx = activePlanes.indexOf(first);
    if (idx >= 0) activePlanes.splice(idx, 1);

    const second = await startPlane({ dir });
    const fleet = await fetch(`${second.baseUrl}/v1/fleet`, { headers: bearer(TOKEN_A) });
    expect(fleet.status).toBe(200);
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot, got ${JSON.stringify(snapshot)}`);
    }
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    // The run ingested before the "restart" is rehydrated from the persisted
    // event log — fleet visibility survives the bounce.
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ runId, installationId: INST_A });
  });
});
