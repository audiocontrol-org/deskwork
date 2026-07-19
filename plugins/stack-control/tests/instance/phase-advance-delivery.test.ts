// specs/037-instance-observability — D-E (FR-027 dogfood Scenario 3) RED test.
//
// THE DEFECT (D-E): a REAL `stackctl workflow advance ... --apply` (a committed
// phase transition) emits `phase.entered`, but it NEVER reaches the instance —
// GET /v1/instances/:id shows `currentBearing: null`. The sidecar T044 test already
// proved the sidecar PRESERVES a `phase.entered` snapshot when it arrives, so this is
// a DELIVERY failure, not a snapshot-stripping one. The cause:
// `src/telemetry/phase-entered.ts` `emitPhaseEntered` created a `long-run` emit
// client, called `client.emit(event)`, and returned WITHOUT waiting for delivery or
// closing — it relied on the process staying alive. Called synchronously inside
// `emitAdvance` (src/subcommands/workflow-advance.ts), the `workflow advance` CLI
// then finished and EXITED before that separate client's UDS connect completed and
// drained, ABANDONING the buffered phase.entered.
//
// THE FIX (mirror T046's proven invocation.completed pattern): `emitPhaseEntered`
// becomes async with a BOUNDED deliver-or-budget wait + close (shared helper
// `src/telemetry/emit-drain.js`), and `emitAdvance` AWAITS it — so the event reliably
// reaches the sidecar before the advance (and the CLI) returns, while a
// down/stalled/absent sidecar NEVER hangs or measurably slows the advance.
//
// WHY THE RED IS OBSERVED AT `emitAdvance`'s RETURN (the exit model): the defect only
// manifests when the CLI PROCESS EXITS before the fire-and-forget connect completes.
// A persistent test process does NOT exit, so a plain poll of the sidecar/plane lets
// the abandoned client's connect catch up and deliver — masking the defect (a plain
// poll is green even pre-fix). The RED discriminator (test 1) models "the CLI process
// has exited" DETERMINISTICALLY and load-invariantly: right after `await emitAdvance`
// returns, the recording peer STOPS ACCEPTING new connections (`server.close()`, which
// leaves already-established sockets live). Post-fix, `await emitAdvance` did not
// resolve until the bounded wait DROVE the connect + drain, so the connection is
// already ESTABLISHED and the frame is already written — it still arrives (GREEN).
// Pre-fix, `emitAdvance` returned synchronously with the connect still PENDING, so
// stop-accepting REFUSES it and every armed reconnect — the buffered phase.entered is
// abandoned exactly as it is at a real process exit (RED). Verified 5/5 each way, and
// invariant to load (it turns on connection-establishment ordering, not wall-clock).
// `currentBearing` is then derived from the genuinely-delivered frame through the
// plane's own instance accumulator (`buildInstanceRegistry`) — NOT a `/v1/ingest` POST
// (which would bypass the delivery path under test).
//
// Test 2 asserts the fail-open time bound (NO sidecar → prompt return, never a hang).
// Test 3 is the end-to-end integration proof over a REAL sidecar daemon + REAL plane +
// GET /v1/instances/:id (green post-fix; a persistent-process poll can't isolate the
// exit race, so test 1 is the RED discriminator and test 3 is the full-chain guard).
//
// Real node:net UDS + real node:http plane + real git + real fs tmp dirs
// (.claude/rules/testing.md). Machine-state store redirected off $HOME. Relative `.js`
// imports under node16. No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer, type Server as NetServer, type Socket } from 'node:net';
import type { Server } from 'node:http';
import { boundPort } from '../_bound-port.js';
import { useMachineStateStore, type MachineStateStore } from '../fleet/_machine-state-harness.js';
import { splitFrameLines } from '../../src/telemetry/protocol.js';
import { validateTelemetryEvent } from '../../src/fleet/event.js';
import { buildInstanceRegistry, type ClassifiedEvent } from '../../src/plane/instance-registry.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import type { IntervalScheduler } from '../../src/plane/http/stream.js';
import { runSidecarDaemon, type SidecarDaemonHandle } from '../../src/sidecar/daemon.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { openTokenCustody } from '../../src/machine-state/token.js';
import { deriveInstanceId } from '../../src/machine-state/instance-id.js';
import {
  makeWorkflowFixture,
  type WorkflowFixture,
} from '../../src/__tests__/fixtures/workflow/workflow-fixtures.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { emitAdvance } from '../../src/subcommands/workflow-advance.js';

const TOKEN = 'phase-advance-delivery-bearer-token';
const ITEM = 'multi:feature/phase-delivery';
// open-design: planned → designing (the committed transition driven below). The
// instance's currentBearing derives as `{ phase, item }` (no `from`).
const EXPECTED_BEARING = { phase: 'designing', item: ITEM };

// --- a real node:net UDS recording peer (mirrors phase-emit.test.ts) ----------

interface RecordingPeer {
  readonly socketPath: string;
  readonly receivedLines: readonly string[];
  /** Stop accepting NEW connections while keeping already-established sockets
   * live — the deterministic "the CLI process has exited" barrier (see test 1). */
  stopAccepting(): void;
  close(): Promise<void>;
}

async function startRecordingPeerAt(socketPath: string): Promise<RecordingPeer> {
  mkdirSync(dirname(socketPath), { recursive: true });
  chmodSync(dirname(socketPath), 0o700);
  const receivedLines: string[] = [];
  const sockets = new Set<Socket>();
  const server: NetServer = createServer((socket: Socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffered = '';
    socket.on('data', (chunk: string) => {
      buffered += chunk;
      const { complete, remainder } = splitFrameLines(buffered);
      buffered = remainder;
      for (const line of complete) receivedLines.push(line);
    });
    socket.on('error', () => {
      /* a client that severs mid-frame is expected — never crash the peer. */
    });
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return {
    socketPath,
    receivedLines,
    stopAccepting(): void {
      // net.Server.close() stops LISTENING immediately (a subsequent connect is
      // refused) but leaves already-accepted sockets open and delivering.
      server.close();
    },
    async close(): Promise<void> {
      for (const socket of sockets) socket.destroy();
      try {
        server.close();
      } catch {
        /* already closing (stopAccepting was called) — idempotent. */
      }
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse every `event` frame the peer received into a validated ClassifiedEvent —
 * the exact shape the plane's registry folds. `validateTelemetryEvent` narrows the
 * untrusted wire JSON to a typed envelope+snapshot without `any`/`as`. */
function classifiedEventsFrom(peer: RecordingPeer): ClassifiedEvent[] {
  const out: ClassifiedEvent[] = [];
  for (const line of peer.receivedLines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed) || parsed.kind !== 'event') continue;
    let event;
    try {
      event = validateTelemetryEvent(parsed.event);
    } catch {
      continue;
    }
    out.push({
      envelope: event.envelope,
      classification: event.envelope.classification,
      type: event.envelope.type,
      snapshot: event.snapshot,
    });
  }
  return out;
}

// --- a real node:http plane (mirrors sidecar-daemon.test.ts) ------------------

class FakeScheduler implements IntervalScheduler {
  private nextHandle = 1;
  setInterval(_callback: () => void, _intervalMs: number): unknown {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    return handle;
  }
  clearInterval(): void {
    /* no real timer armed. */
  }
}

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly dir: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntil(predicate: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`pollUntil timed out after ${timeoutMs}ms waiting for: ${label}`);
    await sleep(15);
  }
}

async function bearingAtPlane(baseUrl: string, id: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/v1/instances/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (res.status !== 200) return undefined;
  const body: unknown = await res.json();
  const instance: unknown = isRecord(body) ? Reflect.get(body, 'instance') : undefined;
  return isRecord(instance) ? Reflect.get(instance, 'currentBearing') : undefined;
}

describe('D-E (FR-027 Scenario 3): a committed `workflow advance --apply` delivers phase.entered to the instance', () => {
  const store = useMachineStateStore();
  const originalCwd = process.cwd();
  const fixtures: WorkflowFixture[] = [];
  const peers: RecordingPeer[] = [];
  const planes: RunningPlane[] = [];
  const daemons: SidecarDaemonHandle[] = [];

  afterEach(async () => {
    process.chdir(originalCwd);
    for (const daemon of daemons.splice(0)) await daemon.stop();
    for (const peer of peers.splice(0)) await peer.close();
    for (const plane of planes.splice(0)) {
      const { server, dir } = plane;
      // Tolerate an already-closed server: the restart test closes plane A in-body
      // (to free its port for plane B), so its cleanup close() is a no-op here.
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
    for (const f of fixtures.splice(0)) f.cleanup();
  });

  /** A git-initialised install with one planned node, baseline-committed (so the
   * advance-touched paths are clean), made cwd (the root `emitAdvance` resolves). */
  function drivableInstall(): WorkflowFixture {
    const f = makeWorkflowFixture([{ identifier: ITEM, status: 'planned' }], { git: true });
    fixtures.push(f);
    f.commitAll('baseline');
    process.chdir(f.root);
    return f;
  }

  /** Start a real plane runtime. `port` binds a SPECIFIC TCP port (0 ⇒ ephemeral)
   * — the restart test rebinds plane A's exact port for plane B, mirroring the
   * dogfood's realistic same-address restart. */
  async function startPlane(installationId: string, port = 0): Promise<RunningPlane & { port: number }> {
    const dir = mkdtempSync(join(tmpdir(), 'scf-phase-delivery-plane-'));
    const runtime = createPlaneRuntime({
      acceptedTokens: new Map([[TOKEN, installationId]]),
      commandStoreDir: dir,
      scheduler: new FakeScheduler(),
    });
    const server = runtime.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const boundTcpPort = boundPort(server);
    const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${boundTcpPort}`, dir };
    planes.push(running);
    return { ...running, port: boundTcpPort };
  }

  it('RED discriminator: phase.entered is delivered to the sidecar BY THE TIME emitAdvance returns, and currentBearing derives {phase,item}', async () => {
    const f = drivableInstall();
    const s: MachineStateStore = store();
    const peer = await startRecordingPeerAt(s.socketPathFor(f.root));
    peers.push(peer);

    // Drive the REAL committed transition and AWAIT it: post-fix the bounded
    // deliver-or-budget wait has driven the connect + frame-write by the time it
    // resolves; pre-fix emitAdvance returned synchronously with the connect still
    // pending.
    await emitAdvance(ITEM, true, {});

    // The transition genuinely LANDED (committed), so this is a real advance.
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)?.status).toBe('in-flight');

    // Model "the CLI process has now exited": no NEW sidecar connection may be made
    // hereafter. Post-fix the connection was already established during the awaited
    // window (its frame still arrives); pre-fix the still-pending connect is refused
    // and abandoned — the exact loss a real CLI exit produces.
    peer.stopAccepting();

    // Bounded observation (the already-written post-fix frame arrives within a tick;
    // pre-fix nothing ever arrives → this window elapses → RED at the assertion). The
    // window is load-generous; post-fix exits it near-instantly.
    let delivered = classifiedEventsFrom(peer).filter((e) => e.type === 'phase.entered');
    for (let i = 0; i < 150 && delivered.length < 1; i += 1) {
      await sleep(10);
      delivered = classifiedEventsFrom(peer).filter((e) => e.type === 'phase.entered');
    }
    expect(delivered.length).toBe(1);
    expect(delivered[0]?.snapshot).toEqual({ phase: 'designing', from: 'planned', item: ITEM });

    // The delivered frame folds (through the plane's OWN accumulator) into the
    // instance's currentBearing = { phase, item } (GET /v1/instances/:id's value).
    const id = deriveInstanceId(f.root);
    const instance = buildInstanceRegistry(delivered).instance(id);
    expect(instance?.currentBearing).toEqual(EXPECTED_BEARING);
  });

  it('fail-open: a committed advance with NO sidecar returns PROMPTLY (bounded wait never hangs) and still commits', async () => {
    const f = drivableInstall();
    // No peer, no daemon bound at the resolved socket — the canonical fail-open
    // condition. The eager connect fires ENOENT on the next tick, so the bounded
    // drain-wait resolves near-instantly, never on the 50ms budget ceiling.
    const startMs = performance.now();
    await emitAdvance(ITEM, true, {});
    const elapsedMs = performance.now() - startMs;
    // eslint-disable-next-line no-console
    console.log(`[D-E] no-sidecar emitAdvance returned in ${elapsedMs.toFixed(2)}ms`);
    // Generous headroom over the ~few-ms real return; well under any hang.
    expect(elapsedMs).toBeLessThan(500);
    // The advance itself is unperturbed — the real transition committed.
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)?.status).toBe('in-flight');
  });

  it('end-to-end: a committed advance surfaces currentBearing at GET /v1/instances/:id via a REAL sidecar daemon + REAL plane', async () => {
    const f = drivableInstall();
    const installationId = mintOrReadInstallationId(f.root);
    const location = locateMachineState(f.root);
    openTokenCustody(location.durableDir).write(TOKEN);

    const plane = await startPlane(installationId);
    const daemon = runSidecarDaemon({
      installationRoot: f.root,
      planeUrl: plane.baseUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 600_000,
    });
    daemons.push(daemon);
    const start = await daemon.started;
    if (start.kind !== 'won') throw new Error('expected a won sidecar election');

    // The emit resolves the SAME socket the daemon bound (both from f.root).
    await emitAdvance(ITEM, true, {});

    const id = deriveInstanceId(f.root);
    await pollUntil(
      async () => {
        const bearing = await bearingAtPlane(plane.baseUrl, id);
        return isRecord(bearing) && bearing.phase === 'designing' && bearing.item === ITEM;
      },
      6000,
      'GET /v1/instances/:id to show currentBearing = {phase: designing, item}',
    );

    expect(await bearingAtPlane(plane.baseUrl, id)).toEqual(EXPECTED_BEARING);
  }, 20_000);

  // FR-027 Scenario 3 × SC-006 restart — the FAITHFUL reproduction of the dogfood
  // loss the plain end-to-end test above MISSES. The dogfood restarts the plane
  // mid-run (SC-006) BEFORE driving the Scenario 3 `workflow advance`. The producer
  // path is correct (the test above proves it), so the loss is NOT in
  // phase.entered — it is that a plane restart must not strand the still-running,
  // fixed-URL sidecar. This test drives a REAL sidecar delivering to plane A, stops
  // plane A, brings a plane back up AT THE SAME ADDRESS (the realistic model: a
  // plane rebinds its stable address across its own restart), then drives the REAL
  // committed advance and asserts the POST-restart phase.entered reaches
  // currentBearing. Binding a NEW address instead (what the pre-fix dogfood did via
  // `--port 0`) is the exact stranding that produced `currentBearing: null` and
  // masqueraded as a producer defect.
  it('across a plane restart at the same address, a committed advance still surfaces currentBearing (FR-027 S3 × SC-006)', async () => {
    const f = drivableInstall();
    const installationId = mintOrReadInstallationId(f.root);
    const location = locateMachineState(f.root);
    openTokenCustody(location.durableDir).write(TOKEN);

    // Plane A: the address the sidecar is pointed at for its whole life (its
    // planeUrl is fixed at daemon startup and never re-pointed — like production).
    const planeA = await startPlane(installationId);
    const daemon = runSidecarDaemon({
      installationRoot: f.root,
      planeUrl: planeA.baseUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 600_000,
    });
    daemons.push(daemon);
    const start = await daemon.started;
    if (start.kind !== 'won') throw new Error('expected a won sidecar election');

    // Restart the plane: stop A (freeing its port), bring B up at the SAME port.
    // The sidecar keeps running, still pointed at planeA.baseUrl === planeB.baseUrl.
    await new Promise<void>((resolve) => planeA.server.close(() => resolve()));
    const planeB = await startPlane(installationId, planeA.port);
    expect(planeB.baseUrl).toBe(planeA.baseUrl);

    // The REAL committed transition emits phase.entered AFTER the restart — the
    // record the dogfood lost. The sidecar spools it, then its drain retries the
    // uplink until plane B answers (bounded backoff), delivering it.
    await emitAdvance(ITEM, true, {});

    const id = deriveInstanceId(f.root);
    await pollUntil(
      async () => {
        const bearing = await bearingAtPlane(planeB.baseUrl, id);
        return isRecord(bearing) && bearing.phase === 'designing' && bearing.item === ITEM;
      },
      8000,
      'GET /v1/instances/:id at the RESTARTED plane to show currentBearing = {phase: designing, item}',
    );

    expect(await bearingAtPlane(planeB.baseUrl, id)).toEqual(EXPECTED_BEARING);
  }, 25_000);
});
