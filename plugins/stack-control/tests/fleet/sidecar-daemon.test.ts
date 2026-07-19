// specs/036-fleet-control-plane — sidecar-daemon (RED→GREEN), the runnable
// SIDECAR daemon that assembles the already-tested primitives into a live
// `runSidecarDaemon`. This is the LOAD-BEARING end-to-end evidence: a REAL
// `node:http` plane (createPlaneRuntime) on an ephemeral port, a REAL bound
// UDS sidecar socket (bind-wins election), a REAL client socket, and REAL
// fetch/SSE between them — never a mocked transport or filesystem
// (.claude/rules/testing.md).
//
// CONTRACTS EXERCISED:
//   - local-socket-protocol.md § Frames — an `event` frame the CLI sends over
//     the local socket is redacted+spooled by the sidecar pipeline (FR-047/048).
//   - sidecar-plane-protocol.md C1 — spooled telemetry uplinks to the plane
//     over POST /v1/ingest (bearer); GET /v1/fleet then shows the run.
//   - sidecar-plane-protocol.md C1/C7 — a command issued at the plane reaches
//     the sidecar over the held-open SSE stream (delivered on connect via
//     replayOnReconnect).
//
// MACHINE-STATE REDIRECT: `useMachineStateStore()` (tests/fleet/_machine-
// state-harness.ts) redirects the durable + ephemeral machine-local store off
// the real $HOME for every test — a daemon test must NEVER mint identity /
// token / spool into a developer's home (the harness's tripwire fails loud if
// any path skips the redirect).
//
// NO REAL LONG WAITS: the plane's SSE keepalive uses a FakeScheduler (no real
// 15s timer); the sidecar's liveness/drain cadences are passed tiny; the
// happy-path SSE stream stays connected so the 45s read-idle watchdog and the
// transmit backoff never fire. Assertions poll under a bounded deadline so a
// hang becomes a FAILURE, never an infinite run.
//
// Relative `.js` imports under node16 resolution (no `@/` alias). No `any`,
// no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { createConnection, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createPipeline } from '../../src/sidecar/pipeline.js';
import { useMachineStateStore } from './_machine-state-harness.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import type { IntervalScheduler } from '../../src/plane/http/stream.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { openTokenCustody } from '../../src/machine-state/token.js';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { SnapshotPayload, TelemetryEvent } from '../../src/fleet/event.js';
import type { Clock } from '../../src/fleet/clock.js';
import { buildEventFrame, serializeFrame } from '../../src/telemetry/protocol.js';
import { runSidecarDaemon } from '../../src/sidecar/daemon.js';

const TOKEN = 'sidecar-daemon-bearer-token-abc';

/** Fake `IntervalScheduler` — records registrations without arming a real
 * timer (no 15s keepalive wait). Mirrors the FakeScheduler in
 * plane-serve.test.ts. */
class FakeScheduler implements IntervalScheduler {
  readonly calls: Array<{ callback: () => void; intervalMs: number }> = [];
  private nextHandle = 1;
  setInterval(callback: () => void, intervalMs: number): unknown {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.calls.push({ callback, intervalMs });
    return handle;
  }
  clearInterval(): void {
    /* records nothing to clear — no real timer was armed. */
  }
}

/** Explicitly-advanced clock so the drain loop's backoff gating is under the
 * test's control (never a real wall-clock wait). The daemon gates each drain
 * pass on `clock.monotonicNowMs() < nextDrainAllowedMs`, so freezing then
 * jumping the clock makes the retry-after-backoff behavior deterministic. */
class FakeClock implements Clock {
  private mono = 0;
  private wallMs = Date.parse('2026-07-18T00:00:00.000Z');
  nowIso(): string {
    return new Date(this.wallMs).toISOString();
  }
  monotonicNowMs(): number {
    return this.mono;
  }
  advance(ms: number): void {
    this.mono += ms;
    this.wallMs += ms;
  }
}

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly dir: string;
}

/** A REAL in-process `node:http` plane whose `/v1/ingest` REJECTS every record
 * with 401 (a bearer-auth failure — a fact about credentials, NOT the payload)
 * until `accept` is flipped to true, after which it 200-ingests and records the
 * runId. Models the AUDIT-20260718-36 window: a valid sidecar's token is
 * transiently refused (plane restarted with a mismatched `--token`, a startup
 * race, an operator credential rotation), then accepted once auth is restored.
 * The spooled records must be RETAINED across that window, never dropped. */
interface AuthGateStubPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly ingested: string[];
  accept: boolean;
}

async function startStubPlaneAuthGate(): Promise<AuthGateStubPlane> {
  const state: { accept: boolean } = { accept: false };
  const ingested: string[] = [];
  const server = createHttpServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/ingest') {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        raw += chunk;
      });
      req.on('end', () => {
        if (!state.accept) {
          // Auth failure: the token is (transiently) refused. This is NOT a
          // fact about the payload — the SAME record would succeed once auth is
          // restored, so the sidecar MUST retain (not drop) it.
          res.writeHead(401, { 'content-type': 'text/plain' });
          res.end('unauthorized: token not accepted (yet)');
          return;
        }
        const runId = runIdFromIngestBody(raw);
        if (runId !== undefined) ingested.push(runId);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
      return;
    }
    // Liveness + SSE stream + anything else: benign non-stream 200.
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('startStubPlaneAuthGate: expected a bound TCP AddressInfo');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    ingested,
    get accept(): boolean {
      return state.accept;
    },
    set accept(value: boolean) {
      state.accept = value;
    },
  };
}

async function startPlane(installationId: string): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-sidecar-daemon-plane-'));
  const runtime = createPlaneRuntime({
    acceptedTokens: new Map([[TOKEN, installationId]]),
    commandStoreDir: dir,
    scheduler: new FakeScheduler(),
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
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, dir };
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** A REAL in-process `node:http` plane that permanently 400s the ingest POST
 * for a specific run (the "poison pill") and 200s every other route (ingest,
 * liveness, the SSE stream). Records the runIds it 200-ingested so the test can
 * prove the records spooled AFTER the poison one still transmit. Per AUDIT-05's
 * own suggestion: "mock the plane to 400 that record via a real in-process
 * server" — this is a real http server + real sockets, not a stubbed transport. */
interface StubPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly ingested: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function runIdFromIngestBody(raw: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isRecord(parsed.envelope)) return undefined;
  const runId = parsed.envelope.runId;
  return typeof runId === 'string' ? runId : undefined;
}

async function startStubPlaneRejectingPoison(poisonRunId: string): Promise<StubPlane> {
  const ingested: string[] = [];
  const server = createHttpServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/ingest') {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        raw += chunk;
      });
      req.on('end', () => {
        const runId = runIdFromIngestBody(raw);
        if (runId === poisonRunId) {
          // A permanent, byte-identical-on-replay rejection (the shape the
          // ingest classification-downgrade guard produces).
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('permanent rejection: classification downgrade');
          return;
        }
        if (runId !== undefined) ingested.push(runId);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
      return;
    }
    // Liveness + SSE stream + anything else: benign. The daemon's SSE reconnect
    // loop tolerates a non-stream 200 (retries under backoff, harmless in-test).
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('startStubPlaneRejectingPoison: expected a bound TCP AddressInfo');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, ingested };
}

/** What a capturing plane records off each POSTed `/v1/ingest` body — the
 * instance-identity envelope fields plus the top-level snapshot, as they land
 * on the wire AFTER the sidecar re-mint. specs/037 requires these survive the
 * producer -> frame -> daemon -> receive() -> uplink -> plane path intact. */
interface CapturedIngest {
  readonly runId: string | undefined;
  readonly host: unknown;
  readonly path: unknown;
  readonly sessionId: unknown;
  readonly schemaVersion: unknown;
  readonly snapshot: unknown;
}

interface CapturingPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly captured: CapturedIngest[];
}

/** Parse a POSTed ingest body into the identity fields the specs/037 assertions
 * inspect. Reads `envelope.{runId,host,path,sessionId,schemaVersion}` and the
 * top-level `snapshot` — the extension of `runIdFromIngestBody` this test needs. */
function captureIngestBody(raw: string): CapturedIngest | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isRecord(parsed.envelope)) return undefined;
  const env = parsed.envelope;
  return {
    runId: typeof env.runId === 'string' ? env.runId : undefined,
    host: env.host,
    path: env.path,
    sessionId: env.sessionId,
    schemaVersion: env.schemaVersion,
    snapshot: parsed.snapshot,
  };
}

/** A REAL in-process `node:http` plane that 200-ingests every record and
 * CAPTURES its identity fields + snapshot for inspection, and 200s every other
 * route (liveness, SSE stream). */
async function startCapturingPlane(): Promise<CapturingPlane> {
  const captured: CapturedIngest[] = [];
  const server = createHttpServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/ingest') {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        raw += chunk;
      });
      req.on('end', () => {
        const entry = captureIngestBody(raw);
        if (entry !== undefined) captured.push(entry);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('startCapturingPlane: expected a bound TCP AddressInfo');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, captured };
}

/** Optional producer-side overrides so a test can stamp a DISTINCT instance
 * identity (host/path), a NON-NULL Claude Code sessionId, and a BARE 037
 * snapshot onto the wire event — the exact fields specs/037 requires survive
 * the sidecar re-mint intact. */
interface TelemetryEventOverrides {
  readonly host?: string;
  readonly path?: string;
  readonly sessionId?: string | null;
  readonly snapshot?: SnapshotPayload;
  readonly invocationId?: string;
}

function makeTelemetryEvent(
  installationId: string,
  runId: string,
  type: string,
  overrides?: TelemetryEventOverrides,
): TelemetryEvent {
  return {
    envelope: {
      eventId: mintUuidV7(),
      installationId,
      invocationId: overrides?.invocationId ?? 'invocation-daemon-1',
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      // specs/037: all producers stamp schemaVersion 2 (the envelope now carries
      // the instance-identity fields host/path/sessionId).
      schemaVersion: 2,
      type,
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 7,
      classification: 'durable',
      host: overrides?.host ?? 'test-host',
      path: overrides?.path ?? '/test/installation/root',
      sessionId: overrides?.sessionId ?? null,
    },
    snapshot: overrides?.snapshot ?? {},
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `predicate` until it resolves true or the bounded deadline elapses;
 * a timeout is a hard FAILURE (never an infinite hang). */
async function pollUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`pollUntil timed out after ${timeoutMs}ms waiting for: ${label}`);
    }
    await sleep(15);
  }
}

async function fleetHasRun(baseUrl: string, runId: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}/v1/fleet`, { headers: bearer(TOKEN) });
  if (res.status !== 200) return false;
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('entries' in body)) return false;
  const { entries } = body as { entries: unknown };
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (entry) => typeof entry === 'object' && entry !== null && (entry as { runId?: unknown }).runId === runId,
  );
}

/** Announce a run to the plane so it is observed (owner known) before it can
 * be commanded. Per AUDIT-20260717-16 the plane rejects (404) a command to a
 * run it has never seen — it needs the run OWNER's installationId to route the
 * held command, so a run must be observed first. The C7 replay-on-connect
 * scenario applies to runs the plane already knows; this ingest establishes
 * that. `classification: 'durable'` is never a downgrade, so ingest accepts it
 * (AUDIT-20260717-11). */
async function announceRun(baseUrl: string, event: TelemetryEvent): Promise<void> {
  const res = await fetch(`${baseUrl}/v1/ingest`, {
    method: 'POST',
    headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (res.status !== 200) {
    throw new Error(`announceRun: expected 200 from /v1/ingest, got ${res.status}`);
  }
}

describe('sidecar daemon — runnable end-to-end (specs/036 sidecar-daemon)', () => {
  const store = useMachineStateStore();

  let plane: RunningPlane | undefined;
  let stub: StubPlane | undefined;
  let authStub: AuthGateStubPlane | undefined;
  let captureStub: CapturingPlane | undefined;
  let daemon: { started: Promise<unknown>; stop(): Promise<void> } | undefined;
  let client: Socket | undefined;

  afterEach(async () => {
    if (client !== undefined) {
      client.destroy();
      client = undefined;
    }
    if (daemon !== undefined) {
      await daemon.stop();
      daemon = undefined;
    }
    if (plane !== undefined) {
      const { server, dir } = plane;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      rmSync(dir, { recursive: true, force: true });
      plane = undefined;
    }
    if (stub !== undefined) {
      const { server } = stub;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      stub = undefined;
    }
    if (authStub !== undefined) {
      const { server } = authStub;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      authStub = undefined;
    }
    if (captureStub !== undefined) {
      const { server } = captureStub;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      captureStub = undefined;
    }
  });

  it('spools a socket event to the plane AND receives a plane-issued command over SSE, then stops cleanly', async () => {
    // installationRoot must exist on disk (realpath keys the machine-state store).
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-daemon-root-'));
    const installationId = mintOrReadInstallationId(installationRoot);
    // locate creates the 0700 durable dir; provision the bearer token into custody.
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);

    plane = await startPlane(installationId);
    const { baseUrl } = plane;

    // (AUDIT-16) The run must be OBSERVED before it can be commanded — announce
    // run-cmd so the plane knows its owner and can route the held command.
    await announceRun(baseUrl, makeTelemetryEvent(installationId, 'run-cmd', 'run.started'));

    // (C1/C7) Issue a command BEFORE the sidecar connects, so replay-on-connect
    // delivers it the moment the daemon's SSE stream opens.
    const issue = await fetch(`${baseUrl}/v1/runs/run-cmd/commands`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pause' }),
    });
    expect(issue.status).toBe(200);

    const receivedCommands: unknown[] = [];
    daemon = runSidecarDaemon({
      installationRoot,
      planeUrl: baseUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 5,
      onCommand: (command) => receivedCommands.push(command),
    });

    const start = (await daemon.started) as { kind: string; socketPath?: string };
    expect(start.kind).toBe('won');
    if (start.socketPath === undefined) {
      throw new Error('won election must report the bound socketPath');
    }

    // (Frames) Connect a raw client to the sidecar's UDS and send an `event`
    // frame carrying a real (un-redacted) TelemetryEvent for run-1.
    const socketPath = start.socketPath;
    client = createConnection(socketPath);
    await new Promise<void>((resolve, reject) => {
      client?.once('connect', resolve);
      client?.once('error', reject);
    });
    client.write(serializeFrame(buildEventFrame(makeTelemetryEvent(installationId, 'run-1', 'run.started'))));

    // (C1) The spooled event uplinks and shows on the plane's fleet view.
    await pollUntil(() => fleetHasRun(baseUrl, 'run-1'), 4000, 'GET /v1/fleet to show run-1');

    // (C1/C7) The plane-issued pause command reached the sidecar over SSE.
    await pollUntil(
      async () => receivedCommands.some(
        (c) => typeof c === 'object' && c !== null && (c as { kind?: unknown }).kind === 'pause',
      ),
      4000,
      "the sidecar's command stream to deliver the pause command",
    );

    // Teardown is exercised by afterEach: daemon.stop() must leave no live
    // timers/sockets/listeners so the test process exits.
    rmSync(installationRoot, { recursive: true, force: true });
  });

  it('AUDIT-20260718-05: a permanently-rejected (4xx) spool record does NOT head-of-line-block the records spooled after it', async () => {
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-daemon-root-'));
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);

    // Pre-spool three records into the sidecar's WAL BEFORE the daemon starts:
    // a 'before' record, a 'poison' record the plane permanently 400s, and an
    // 'after' record. Pre-fix, the drain loop breaks on the poison record's
    // non-2xx and never advances past it, so 'after' is never transmitted.
    const walDir = join(location.durableDir, 'spool');
    const pipeline = createPipeline(walDir);
    await pipeline.receive({
      installationId,
      invocationId: 'inv-poison',
      runId: 'before',
      type: 'run.started',
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    });
    await pipeline.receive({
      installationId,
      invocationId: 'inv-poison',
      runId: 'poison',
      type: 'run.progress',
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    });
    await pipeline.receive({
      installationId,
      invocationId: 'inv-poison',
      runId: 'after',
      type: 'run.completed',
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    });

    stub = await startStubPlaneRejectingPoison('poison');

    const dropped: Array<{ sequence: number; status: number }> = [];
    const handle = runSidecarDaemon({
      installationRoot,
      planeUrl: stub.baseUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 5,
      onDroppedRecord: (info) => dropped.push({ sequence: info.sequence, status: info.status }),
    });
    daemon = handle;
    const start = await handle.started;
    expect(start.kind).toBe('won');

    // The records BEFORE and AFTER the poison pill BOTH reach the plane — the
    // poison record did not block the head of the line indefinitely.
    await pollUntil(
      async () => stub !== undefined && stub.ingested.includes('before') && stub.ingested.includes('after'),
      4000,
      "the 'before' AND 'after' records to reach the plane past the poison record",
    );

    // The poison record was RECORDED as a permanent drop (not retried forever,
    // not silently swallowed).
    await pollUntil(
      async () => dropped.some((d) => d.status === 400),
      4000,
      'the poison record to be recorded as a permanent (4xx) drop',
    );

    // The plane NEVER 200-ingested the poison record (it stayed rejected).
    expect(stub.ingested).not.toContain('poison');

    rmSync(installationRoot, { recursive: true, force: true });
  });

  it('does NOT silently drop a plane command when no local-run sink is wired — it is observably recorded as UNDELIVERED (AUDIT-20260717-17)', async () => {
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-daemon-root-'));
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);

    plane = await startPlane(installationId);
    const { baseUrl } = plane;

    // (AUDIT-16) Announce run-cmd first so the plane can route the command to
    // its owner; a command to an unobserved run is (correctly) rejected 404.
    await announceRun(baseUrl, makeTelemetryEvent(installationId, 'run-cmd', 'run.started'));

    // Issue a command BEFORE the sidecar connects, so replay-on-connect
    // delivers it the moment the daemon's SSE stream opens.
    const issue = await fetch(`${baseUrl}/v1/runs/run-cmd/commands`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'cancel' }),
    });
    expect(issue.status).toBe(200);

    // Run the daemon the way PRODUCTION does: NO `onCommand` local-run sink.
    // The pre-fix daemon `?.()`-drops the command silently. The fix must make
    // the received-but-undelivered command OBSERVABLE — captured here via the
    // injected undelivered sink.
    const undelivered: unknown[] = [];
    daemon = runSidecarDaemon({
      installationRoot,
      planeUrl: baseUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 5,
      onUndeliveredCommand: (command) => undelivered.push(command),
    });

    const start = (await daemon.started) as { kind: string };
    expect(start.kind).toBe('won');

    // The plane-issued command reached the sidecar and was RECORDED as
    // undelivered (not silently dropped) even though no local-run sink exists.
    await pollUntil(
      async () =>
        undelivered.some(
          (c) => typeof c === 'object' && c !== null && (c as { kind?: unknown }).kind === 'cancel',
        ),
      4000,
      'the sidecar to observably record the undelivered cancel command',
    );

    rmSync(installationRoot, { recursive: true, force: true });
  });

  it('AUDIT-20260718-36: an auth failure (401) RETAINS spooled records — they transmit once auth is restored, never dropped', async () => {
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-daemon-root-'));
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);

    // Pre-spool two records into the sidecar's WAL BEFORE the daemon starts.
    const walDir = join(location.durableDir, 'spool');
    const pipeline = createPipeline(walDir);
    await pipeline.receive({
      installationId,
      invocationId: 'inv-authloss',
      runId: 'authloss-a',
      type: 'run.started',
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    });
    await pipeline.receive({
      installationId,
      invocationId: 'inv-authloss',
      runId: 'authloss-b',
      type: 'run.completed',
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    });

    // The plane refuses the bearer token (401) until we flip `accept`.
    authStub = await startStubPlaneAuthGate();

    // Inject a FakeClock so the drain loop's post-failure backoff gating is
    // deterministic: while the clock is frozen at 0, exactly ONE drain pass
    // runs (it 401s, backs off, sets nextDrainAllowedMs > 0); every subsequent
    // pass is gated off until we JUMP the clock past the backoff after flipping
    // auth on. No real wall-clock wait, no flaky timing.
    const clock = new FakeClock();

    const dropped: Array<{ sequence: number; status: number }> = [];
    const handle = runSidecarDaemon({
      installationRoot,
      planeUrl: authStub.baseUrl,
      clock,
      drainIntervalMs: 5,
      livenessIntervalMs: 5,
      onDroppedRecord: (info) => dropped.push({ sequence: info.sequence, status: info.status }),
    });
    daemon = handle;
    const start = await handle.started;
    expect(start.kind).toBe('won');

    // Let several real drain ticks fire while the clock is frozen. An auth
    // failure must NOT be treated as a permanent drop: `dropped` stays empty.
    // (Pre-fix, `isPermanentRejection(401)` was true, so the drain skipped-and-
    // recorded BOTH records here — dropped.length === 2 — and advanced the
    // cursor past them, losing them irrecoverably.)
    await sleep(120);
    expect(dropped).toEqual([]);
    expect(authStub.ingested).toEqual([]);

    // Auth is restored (token provisioned / rotated / plane finished booting).
    authStub.accept = true;
    // Jump the clock well past any accumulated backoff so the next real drain
    // tick is allowed to run and retry the SAME retained records.
    clock.advance(600_000);

    // Both records — retained across the auth-failure window — now transmit.
    // Pre-fix, the cursor had already advanced past them, so they were never
    // replayed and this would time out (irrecoverable telemetry loss).
    await pollUntil(
      async () =>
        authStub !== undefined &&
        authStub.ingested.includes('authloss-a') &&
        authStub.ingested.includes('authloss-b'),
      6000,
      'both records to transmit once auth is restored (retained, not dropped)',
    );

    // No record was ever recorded as a permanent drop during the auth window.
    expect(dropped).toEqual([]);

    rmSync(installationRoot, { recursive: true, force: true });
  });

  it('specs/037 T044: preserves the producer envelope host/path/sessionId AND the bare 037 snapshot through the real frame -> daemon -> receive() -> uplink -> plane path', async () => {
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-daemon-root-'));
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);

    captureStub = await startCapturingPlane();

    daemon = runSidecarDaemon({
      installationRoot,
      planeUrl: captureStub.baseUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 5,
    });
    const start = (await daemon.started) as { kind: string; socketPath?: string };
    expect(start.kind).toBe('won');
    if (start.socketPath === undefined) {
      throw new Error('won election must report the bound socketPath');
    }

    // A producer-shaped event carrying a DISTINCT instance identity (host/path
    // NOT the sidecar's own hostname/spool dir), a NON-NULL Claude Code
    // sessionId, and a BARE 037 status snapshot ({phase, from, item} — the
    // phase.entered producer's exact shape). specs/037: NONE of these may be
    // re-derived from the spool dir, hardcoded to null, or clobbered to {} by
    // the 036 deny-by-default redaction path.
    const distinctHost = 'producer-host.example';
    const distinctPath = '/real/observed/installation/root';
    const sessionId = 'session-037-abc';
    const bareSnapshot: SnapshotPayload = {
      phase: 'implementing',
      from: 'planning',
      item: 'feature/x',
    };
    const event = makeTelemetryEvent(installationId, 'run-identity', 'phase.entered', {
      host: distinctHost,
      path: distinctPath,
      sessionId,
      snapshot: bareSnapshot,
      invocationId: 'invocation-identity-1',
    });

    const socketPath = start.socketPath;
    client = createConnection(socketPath);
    await new Promise<void>((resolve, reject) => {
      client?.once('connect', resolve);
      client?.once('error', reject);
    });
    client.write(serializeFrame(buildEventFrame(event)));

    // The event must ARRIVE AT THE PLANE (poll the capture) with identity + the
    // bare snapshot intact.
    await pollUntil(
      async () =>
        captureStub !== undefined &&
        captureStub.captured.some((c) => c.runId === 'run-identity'),
      4000,
      'the phase.entered event to reach the plane carrying its producer identity',
    );

    const arrived = captureStub.captured.find((c) => c.runId === 'run-identity');
    if (arrived === undefined) {
      throw new Error('expected the run-identity event to have reached the plane');
    }
    // Producer instance identity PRESERVED (not re-derived from the spool dir).
    expect(arrived.host).toBe(distinctHost);
    expect(arrived.path).toBe(distinctPath);
    // sessionId PRESERVED (not hardcoded null).
    expect(arrived.sessionId).toBe(sessionId);
    // schemaVersion 2 (specs/037 — all producers stamp 2).
    expect(arrived.schemaVersion).toBe(2);
    // The BARE 037 snapshot survived intact (not clobbered to {} by the 036
    // {content,allowlist} deny-by-default redaction path).
    expect(arrived.snapshot).toEqual(bareSnapshot);

    rmSync(installationRoot, { recursive: true, force: true });
  });

  it('AUDIT-20260719-18: a legacy/malformed frame with null host/path is DROPPED (surfaced, never fatal) and subsequent VALID frames still ingest', async () => {
    // The upgrade-skew scenario: a STALE pre-037 CLI binary (schemaVersion 1,
    // never derives host/path) still on disk talks to an already-upgraded,
    // long-lived sidecar during a version rollout. Its `event` frame carries a
    // null (absent) instance identity. The daemon MUST NOT crash on that one bad
    // frame — it surfaces it (to the error observer) and DROPS it, then keeps
    // running so a VALID 037 frame that follows still ingests.
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-daemon-root-'));
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);

    captureStub = await startCapturingPlane();

    // Detect a process-level unhandled rejection: if the daemon lets the guard's
    // throw escape uncaught, Node emits 'unhandledRejection' and (by default)
    // would terminate the daemon. Capture it here so the assertion can prove the
    // one bad frame never became a process-fatal unhandled rejection.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    const surfacedErrors: unknown[] = [];
    try {
      daemon = runSidecarDaemon({
        installationRoot,
        planeUrl: captureStub.baseUrl,
        drainIntervalMs: 5,
        livenessIntervalMs: 5,
        onError: (error) => surfacedErrors.push(error),
      });
      const start = (await daemon.started) as { kind: string; socketPath?: string };
      expect(start.kind).toBe('won');
      if (start.socketPath === undefined) {
        throw new Error('won election must report the bound socketPath');
      }
      const socketPath = start.socketPath;

      // A LEGACY/malformed producer frame: schemaVersion 1, null host/path (the
      // pre-037 "derive host/path absent" shape). Build the envelope directly so
      // the null identity lands on the wire (makeTelemetryEvent always stamps a
      // valid host/path).
      const legacyEvent: TelemetryEvent = {
        envelope: {
          eventId: mintUuidV7(),
          installationId,
          invocationId: 'invocation-legacy-1',
          runId: 'run-legacy',
          installationSequence: 1,
          invocationSequence: 1,
          schemaVersion: 1,
          type: 'run.started',
          wallClock: new Date().toISOString(),
          monotonicOffsetMs: 3,
          classification: 'durable',
          host: null,
          path: null,
          sessionId: null,
        },
        snapshot: {},
      };

      client = createConnection(socketPath);
      await new Promise<void>((resolve, reject) => {
        client?.once('connect', resolve);
        client?.once('error', reject);
      });
      // Send the poison legacy frame FIRST, then a VALID 037 frame.
      client.write(serializeFrame(buildEventFrame(legacyEvent)));
      client.write(
        serializeFrame(buildEventFrame(makeTelemetryEvent(installationId, 'run-valid', 'run.started'))),
      );

      // The VALID frame reaches the plane — proof the daemon survived the bad one.
      await pollUntil(
        async () =>
          captureStub !== undefined && captureStub.captured.some((c) => c.runId === 'run-valid'),
        4000,
        'the VALID 037 frame to ingest after the legacy/malformed frame',
      );

      // Give any async ingest of the legacy frame a beat to have (not) happened.
      await sleep(60);

      // The legacy frame was DROPPED — it never reached the plane with a host-less
      // identity (dropping the ONE bad frame is the contract; ingesting it is not).
      expect(captureStub.captured.some((c) => c.runId === 'run-legacy')).toBe(false);

      // The bad frame never became a process-fatal unhandled rejection: the guard
      // is non-fatal (caught + surfaced), never an uncaught escape.
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }

    rmSync(installationRoot, { recursive: true, force: true });
  });
});
