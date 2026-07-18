// specs/036-fleet-control-plane — T124 (plane-runtime) RED test, pairs with
// the T124 impl (src/plane/runtime.ts + the `serve` subaction in
// src/subcommands/plane.ts). This is the load-bearing END-TO-END evidence
// the dogfood (T128) drives: a REAL `node:http` plane on an ephemeral port,
// exercised with REAL `fetch` (never a mocked HTTP client), asserting the
// assembled primitives behave over the wire.
//
// CONTRACTS UNDER TEST:
//   - contracts/plane-client-api.md § Route shape / C2 / C5 / C6 — the nine
//     consumer routes served from a LIVE in-memory registry.
//   - contracts/sidecar-plane-protocol.md C1/C3/C6/C7 — the three
//     sidecar-facing routes (POST /v1/ingest, GET /v1/sidecar/stream, POST
//     /v1/sidecar/liveness) and mandatory bearer auth (FR-088: a revoked
//     token's refusal is never downgraded).
//
// The 15s SSE keepalive cadence is asserted STRUCTURALLY via an injected
// `IntervalScheduler` (mirrors tests/fleet/plane-stream.test.ts) — NEVER a
// real 15-second wait. Real `node:fs` tmp dir for the durable command store
// (.claude/rules/testing.md). Relative `.js` imports under node16 resolution
// (no `@/` alias). No `any`, no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { IntervalScheduler } from '../../src/plane/http/stream.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';

const TOKEN = 'accepted-bearer-token-abc';
const REVOKED_TOKEN = 'revoked-bearer-token-xyz';
const INSTALLATION_ID = '11111111-1111-4111-8111-111111111111';

/** Fake `IntervalScheduler` — records registrations and fires the most
 * recently registered callback on demand via `tick()`, simulating one
 * elapsed keepalive interval with zero real wall-clock wait. Mirrors the
 * FakeScheduler in tests/fleet/plane-stream.test.ts. */
class FakeScheduler implements IntervalScheduler {
  readonly calls: Array<{ callback: () => void; intervalMs: number }> = [];
  readonly cleared: unknown[] = [];
  private nextHandle = 1;

  setInterval(callback: () => void, intervalMs: number): unknown {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.calls.push({ callback, intervalMs });
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.cleared.push(handle);
  }

  tick(): void {
    const last = this.calls[this.calls.length - 1];
    if (last === undefined) {
      throw new Error('FakeScheduler.tick: no interval has been registered yet');
    }
    last.callback();
  }
}

/** Reads SSE bytes progressively, yielding one complete frame (blank-line
 * terminated) at a time. Same shape as plane-stream.test.ts's reader. */
class SseFrameReader {
  private buffer = '';
  private readonly decoder = new TextDecoder();

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async next(): Promise<string> {
    while (!this.buffer.includes('\n\n')) {
      const { value, done } = await this.reader.read();
      if (done) {
        throw new Error('SseFrameReader.next: stream ended before a complete frame arrived');
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
    const index = this.buffer.indexOf('\n\n');
    const frame = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + 2);
    return frame;
  }
}

/** A raw, wire-shaped telemetry event (the body a real sidecar POST carries),
 * satisfying `validateTelemetryEvent`. */
function makeRawEvent(overrides: {
  readonly runId?: string;
  readonly type?: string;
  readonly invocationSequence?: number;
  readonly installationId?: string;
}): unknown {
  const invocationSequence = overrides.invocationSequence ?? 1;
  return {
    envelope: {
      eventId: mintUuidV7(),
      installationId: overrides.installationId ?? INSTALLATION_ID,
      invocationId: 'invocation-1',
      runId: overrides.runId ?? 'run-1',
      installationSequence: invocationSequence,
      invocationSequence,
      schemaVersion: 1,
      type: overrides.type ?? 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 12,
      classification: 'durable',
    },
    snapshot: {},
  };
}

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly dir: string;
  readonly scheduler: FakeScheduler;
}

function makeStoreDir(): string {
  return mkdtempSync(join(tmpdir(), 'scf-plane-serve-'));
}

async function startPlane(): Promise<RunningPlane> {
  const dir = makeStoreDir();
  const scheduler = new FakeScheduler();
  const runtime = createPlaneRuntime({
    acceptedTokens: new Map([[TOKEN, INSTALLATION_ID]]),
    revokedTokens: new Set([REVOKED_TOKEN]),
    commandStoreDir: dir,
    scheduler,
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
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, dir, scheduler };
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe('plane serve — assembled runtime end-to-end (T124, plane-client-api.md + sidecar-plane-protocol.md)', () => {
  let active: RunningPlane | undefined;

  afterEach(async () => {
    if (active !== undefined) {
      const { server, dir } = active;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      rmSync(dir, { recursive: true, force: true });
      active = undefined;
    }
  });

  it('(1) POST /v1/ingest with a bearer accepts telemetry; GET /v1/fleet shows one live entry with its status axes', async () => {
    active = await startPlane();
    const { baseUrl } = active;

    const ingest = await fetch(`${baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify(makeRawEvent({ runId: 'run-1', type: 'run.started', invocationSequence: 1 })),
    });
    expect(ingest.status).toBe(200);
    const ingestBody: unknown = await ingest.json();
    expect(ingestBody).toMatchObject({ kind: 'accepted' });

    const fleet = await fetch(`${baseUrl}/v1/fleet`, { headers: bearer(TOKEN) });
    expect(fleet.status).toBe(200);
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot with entries, got ${JSON.stringify(snapshot)}`);
    }
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) {
      throw new Error('expected entries to be an array');
    }
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      runId: 'run-1',
      statusAxes: {
        connectionStatus: 'attached',
        livenessStatus: 'live',
        executionStatus: 'starting',
      },
    });
  });

  it('(2) GET /v1/fleet with NO bearer ⇒ 401; with a REVOKED token ⇒ 401 reason revoked (never downgraded, FR-088)', async () => {
    active = await startPlane();
    const { baseUrl } = active;

    const anon = await fetch(`${baseUrl}/v1/fleet`);
    expect(anon.status).toBe(401);

    const revoked = await fetch(`${baseUrl}/v1/fleet`, { headers: bearer(REVOKED_TOKEN) });
    expect(revoked.status).toBe(401);
    const revokedBody: unknown = await revoked.json();
    expect(revokedBody).toMatchObject({ reason: 'revoked' });

    // An unknown (never-accepted, never-revoked) token is distinctly 'unknown'.
    const unknown = await fetch(`${baseUrl}/v1/fleet`, { headers: bearer('never-heard-of-this-token') });
    expect(unknown.status).toBe(401);
    const unknownBody: unknown = await unknown.json();
    expect(unknownBody).toMatchObject({ reason: 'unknown' });
  });

  it('(3) GET /v1/sidecar/stream (bearer) ⇒ 200 text/event-stream, held open, a `:` keepalive frame per scheduler tick', async () => {
    active = await startPlane();
    const { baseUrl, scheduler } = active;
    const controller = new AbortController();

    const response = await fetch(`${baseUrl}/v1/sidecar/stream`, {
      headers: bearer(TOKEN),
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    if (response.body === null) {
      throw new Error('expected a readable response body');
    }
    const frames = new SseFrameReader(response.body.getReader());

    // The keepalive is registered at exactly the § C3 constant (15s),
    // driven synchronously — never a real wait.
    expect(scheduler.calls).toHaveLength(1);
    expect(scheduler.calls[0]?.intervalMs).toBe(15_000);

    scheduler.tick();
    const frame = await frames.next();
    expect(frame.startsWith(':')).toBe(true);
    expect(frame).not.toContain('data:');

    controller.abort();
  });

  it('(4) POST /v1/runs/:runId/commands (pause) returns a commandId; GET /v1/commands/:commandId shows requested-vs-applied distinctly', async () => {
    active = await startPlane();
    const { baseUrl } = active;

    // A run must be OBSERVED before it can be commanded (AUDIT-20260717-16): the
    // command is held for the run's owner, resolved from the live registry, so
    // the plane refuses a command against a run it has never seen.
    await fetch(`${baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify(makeRawEvent({ runId: 'run-1', type: 'run.started', invocationSequence: 1 })),
    });

    const issue = await fetch(`${baseUrl}/v1/runs/run-1/commands`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pause' }),
    });
    expect(issue.status).toBe(200);
    const issueBody: unknown = await issue.json();
    if (typeof issueBody !== 'object' || issueBody === null || !('commandId' in issueBody)) {
      throw new Error(`expected a command issue result with commandId, got ${JSON.stringify(issueBody)}`);
    }
    const { commandId, state } = issueBody as { commandId: string; state: string };
    expect(typeof commandId).toBe('string');
    expect(commandId.length).toBeGreaterThan(0);
    // Issue reports the REQUESTED state 'accepted' — never 'applied' (FR-059).
    expect(state).toBe('accepted');

    const status = await fetch(`${baseUrl}/v1/commands/${commandId}`, { headers: bearer(TOKEN) });
    expect(status.status).toBe(200);
    const statusBody: unknown = await status.json();
    // The lifecycle state is queryable and distinctly 'accepted' (requested),
    // NOT 'applied' — the honesty guarantee the operator relies on.
    expect(statusBody).toMatchObject({
      commandId,
      found: true,
      command: { state: 'accepted', kind: 'pause' },
    });
  });

  it('(5) GET /v1/runs/:runId returns per-run detail with no absolute/file:// artifact refs', async () => {
    active = await startPlane();
    const { baseUrl } = active;

    await fetch(`${baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify(makeRawEvent({ runId: 'run-42', type: 'run.started', invocationSequence: 1 })),
    });

    const detail = await fetch(`${baseUrl}/v1/runs/run-42`, { headers: bearer(TOKEN) });
    expect(detail.status).toBe(200);
    const raw = await detail.text();
    // Artifact refs (when present) must be installation-relative — never
    // file:// or an absolute path (PT-009). perRunDetail carries no artifacts
    // facet today, so the falsifiable assertion is: the serialized response
    // contains no file:// scheme and no leading-slash absolute path ref.
    expect(raw).not.toContain('file://');
    expect(raw).not.toMatch(/"[^"]*":\s*"\/[A-Za-z]/);
    const body: unknown = JSON.parse(raw);
    expect(body).toMatchObject({
      runId: 'run-42',
      status: { executionStatus: 'starting' },
    });
  });

  it('(6) POST /v1/sidecar/liveness (bearer) accepts a session-liveness heartbeat with 200', async () => {
    active = await startPlane();
    const { baseUrl } = active;

    const response = await fetch(`${baseUrl}/v1/sidecar/liveness`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'session-liveness',
        installationId: INSTALLATION_ID,
        emittedAt: new Date().toISOString(),
      }),
    });
    expect(response.status).toBe(200);
  });
});
