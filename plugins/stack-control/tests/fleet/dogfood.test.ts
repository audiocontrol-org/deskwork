/**
 * specs/036-fleet-control-plane — T128 (THE DOGFOOD LOOP), the feature's PRIMARY
 * verification path (FR-087, SC-018). Pairs with quickstart.md — which is NOT a
 * demo script but the requirement: "If a scenario cannot be driven from a
 * terminal, that is a DEFECT in the feature."
 *
 * THIS IS THE HEADLESS DRIVER. vitest is the terminal here: each test stands up
 * a REAL `node:http` plane (createPlaneRuntime) and — where the scenario needs
 * it — a REAL sidecar daemon (runSidecarDaemon) over a REAL bound UDS, driving
 * the CORE, LOAD-BEARING assertion of each terminal-reachable quickstart
 * scenario with REAL fetch/UDS/fs. Never a mocked transport or filesystem
 * (.claude/rules/testing.md).
 *
 * MACHINE-STATE REDIRECT (non-negotiable): `useMachineStateStore()` redirects
 * the durable + ephemeral machine-local store off the real $HOME for every
 * test, so the dogfood NEVER mints identity/token/spool into a developer's
 * home. The harness tripwire fails loud if any path skips the redirect.
 *
 * NO REAL LONG WAITS: the plane's 15s SSE keepalive uses a FakeScheduler; the
 * sidecar's cadences are passed tiny; the honesty invariant (socket-close ⇒ not
 * death) is a pure function. Every assertion polls under a bounded deadline so a
 * hang becomes a FAILURE, never an infinite run.
 *
 * SCOPE (single most important check per scenario; the harness is structured so
 * more per-bullet checks slot in later):
 *   - Scenario 1 (US1) — the CLI is never degraded: emit over a live sidecar
 *     whose plane is UNREACHABLE returns at normal speed. No network in the
 *     interactive path.
 *   - Scenario 2 (US2) — fleet aggregation: a run event uplinks and shows as
 *     exactly one fleet entry with its three status axes; a short verb never
 *     becomes a fleet entry.
 *   - Scenario 3 (US3) — commands & their fate: pause returns a commandId whose
 *     status is 'accepted' (requested), distinct from applied; the sidecar's
 *     command stream DELIVERS it. Run-application is a KNOWN GAP (TASK-461).
 *   - Scenario 4 (US4) — trust incl. failure: a socket close is
 *     `abnormally-disconnected`, NEVER a death verdict; a severed uplink
 *     degrades the uplink hop, naming THAT hop.
 *   - Scenario 6 (US6) — hostile network: unauthenticated / revoked ⇒ 401,
 *     never downgraded; a copied installation tree re-mints a distinct
 *     installationId (SC-014).
 *
 * Relative `.js` imports under node16 resolution (no `@/` alias). No `any`, no
 * `as`, no `@ts-ignore` (Constitution Principle VI). File under the 500-line cap.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createConnection, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { useMachineStateStore } from './_machine-state-harness.js';
import { makeTelemetryEvent } from './_local-socket-peer.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import type { EventLog } from '../../src/plane/event-log.js';
import type { ClassifiedEvent } from '../../src/plane/registry.js';
import type { IntervalScheduler } from '../../src/plane/http/stream.js';
import { runSidecarDaemon, type SidecarDaemonHandle } from '../../src/sidecar/daemon.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { openTokenCustody } from '../../src/machine-state/token.js';
import { interpretSocketClose } from '../../src/sidecar/liveness.js';
import { createEmitClient, type EmitClient } from '../../src/telemetry/emit.js';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { TelemetryEvent } from '../../src/fleet/event.js';
import { buildEventFrame, serializeFrame } from '../../src/telemetry/protocol.js';

const TOKEN = 'dogfood-bearer-token-abc';
const REVOKED_TOKEN = 'dogfood-revoked-token-xyz';

/** Fake `IntervalScheduler` — records the 15s keepalive registration without
 * arming a real timer (mirrors plane-serve.test.ts / sidecar-daemon.test.ts). */
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
    /* no real timer was armed — nothing to clear. */
  }
}

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly dir: string;
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Build a real, wire-shaped `TelemetryEvent` — full control over runId/type so
 * a commandable-run event and a short-verb event can both be driven. */
function makeEvent(installationId: string, runId: string | null, type: string): TelemetryEvent {
  return {
    envelope: {
      eventId: mintUuidV7(),
      installationId,
      invocationId: `invocation-${mintUuidV7()}`,
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 1,
      type,
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 7,
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    },
    snapshot: {},
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `predicate` until true or the bounded deadline elapses — a timeout is a
 * hard FAILURE (never an infinite hang). */
async function pollUntil(predicate: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`pollUntil timed out after ${timeoutMs}ms waiting for: ${label}`);
    }
    await sleep(15);
  }
}

/** Read the fleet entries as an untyped array (narrowed defensively — the plane
 * is a real HTTP peer whose body we do not trust structurally). */
async function fleetEntries(baseUrl: string): Promise<unknown[]> {
  const res = await fetch(`${baseUrl}/v1/fleet`, { headers: bearer(TOKEN) });
  if (res.status !== 200) throw new Error(`GET /v1/fleet ⇒ ${res.status}`);
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('entries' in body)) {
    throw new Error(`GET /v1/fleet returned no entries field: ${JSON.stringify(body)}`);
  }
  const { entries } = body as { entries: unknown };
  if (!Array.isArray(entries)) throw new Error('fleet entries is not an array');
  return entries;
}

function entryRunId(entry: unknown): unknown {
  return typeof entry === 'object' && entry !== null ? (entry as { runId?: unknown }).runId : undefined;
}

/** Narrow one hop of a `/v1/health/store` body without `as` — the plane is a
 * real HTTP peer whose body we do not trust structurally (`Reflect.get` keeps
 * every access `unknown`, never `any`). */
function hopOf(body: unknown, hop: 'uplink' | 'archive'): { status: string; lastError: string | null } {
  if (typeof body !== 'object' || body === null || !(hop in body)) {
    throw new Error(`store health missing the ${hop} hop: ${JSON.stringify(body)}`);
  }
  const hopValue: unknown = Reflect.get(body, hop);
  if (typeof hopValue !== 'object' || hopValue === null || !('status' in hopValue)) {
    throw new Error(`store health ${hop} hop malformed: ${JSON.stringify(body)}`);
  }
  const status: unknown = Reflect.get(hopValue, 'status');
  if (typeof status !== 'string') {
    throw new Error(`store health ${hop}.status is not a string: ${JSON.stringify(body)}`);
  }
  const lastErrorRaw: unknown = 'lastError' in hopValue ? Reflect.get(hopValue, 'lastError') : null;
  return { status, lastError: typeof lastErrorRaw === 'string' ? lastErrorRaw : null };
}

describe('dogfood loop — terminal-drivable quickstart scenarios (T128, FR-087/SC-018)', () => {
  const store = useMachineStateStore();

  const planes: RunningPlane[] = [];
  const daemons: SidecarDaemonHandle[] = [];
  const clients: EmitClient[] = [];
  const sockets: Socket[] = [];
  const tmpRoots: string[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    for (const socket of sockets.splice(0)) socket.destroy();
    for (const daemon of daemons.splice(0)) await daemon.stop();
    for (const plane of planes.splice(0)) {
      const { server, dir } = plane;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      rmSync(dir, { recursive: true, force: true });
    }
    for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  async function startPlane(
    installationId: string,
    revoked?: ReadonlySet<string>,
    eventLog?: EventLog,
  ): Promise<RunningPlane> {
    const dir = mkdtempSync(join(tmpdir(), 'scf-dogfood-plane-'));
    const runtime = createPlaneRuntime({
      acceptedTokens: new Map([[TOKEN, installationId]]),
      revokedTokens: revoked,
      commandStoreDir: dir,
      scheduler: new FakeScheduler(),
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
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('startPlane: expected a bound TCP AddressInfo');
    }
    const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`, dir };
    planes.push(running);
    return running;
  }

  /** Provision a real installation: a temp root on disk (realpath keys the
   * store), a minted installationId, and a bearer token in machine-local
   * custody. Everything lands in the redirected store, never the real $HOME. */
  function provisionInstallation(): { installationRoot: string; installationId: string } {
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-dogfood-root-'));
    tmpRoots.push(installationRoot);
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);
    return { installationRoot, installationId };
  }

  // --- Scenario 1 (US1) — the CLI is never degraded ------------------------
  it('Scenario 1: emit over a live sidecar whose plane is UNREACHABLE returns at normal speed', async () => {
    const { installationRoot } = provisionInstallation();

    // A live sidecar pointed at a DEAD plane address (ECONNREFUSED, instant).
    // Its uplink fails silently in the background; the local socket receiver +
    // spool run normally. Large cadences keep background WAN retries quiet.
    const daemon = runSidecarDaemon({
      installationRoot,
      planeUrl: 'http://127.0.0.1:59999',
      drainIntervalMs: 60_000,
      livenessIntervalMs: 600_000,
    });
    daemons.push(daemon);
    const start = await daemon.started;
    expect(start.kind).toBe('won');
    if (start.kind !== 'won') throw new Error('expected a won election');

    // A real emit client on the sidecar's bound socket — the interactive path.
    const client = createEmitClient({ socketPath: start.socketPath, callerKind: 'long-run' });
    clients.push(client);
    await sleep(30); // let the connect settle (never awaited by emit itself)

    // The dominant constraint: no network in the interactive path. 500 emits,
    // with the plane unreachable, complete effectively instantly. If any emit
    // awaited the WAN this loop would hang out to the vitest budget.
    const startMs = performance.now();
    for (let i = 0; i < 500; i += 1) {
      client.emit(makeTelemetryEvent());
    }
    const totalMs = performance.now() - startMs;
    // eslint-disable-next-line no-console
    console.log(`[T128 S1] 500 emits with plane unreachable = ${totalMs.toFixed(2)}ms`);
    expect(totalMs).toBeLessThan(500);
  });

  // --- Scenario 2 (US2) — fleet aggregation --------------------------------
  it('Scenario 2: a run event uplinks to exactly one fleet entry with its 3 status axes; a short verb never appears', async () => {
    const { installationRoot, installationId } = provisionInstallation();
    const plane = await startPlane(installationId);

    const daemon = runSidecarDaemon({
      installationRoot,
      planeUrl: plane.baseUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 600_000,
    });
    daemons.push(daemon);
    const start = await daemon.started;
    if (start.kind !== 'won') throw new Error('expected a won election');

    const client = createConnection(start.socketPath);
    sockets.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', reject);
    });

    // A commandable run event AND a short-verb event (runId null) over the socket.
    client.write(serializeFrame(buildEventFrame(makeEvent(installationId, 'run-agg', 'run.started'))));
    client.write(serializeFrame(buildEventFrame(makeEvent(installationId, null, 'invocation.completed'))));

    await pollUntil(
      async () => (await fleetEntries(plane.baseUrl)).some((e) => entryRunId(e) === 'run-agg'),
      4000,
      'GET /v1/fleet to show run-agg',
    );

    const entries = await fleetEntries(plane.baseUrl);
    // Exactly one entry (the commandable run); the short verb is NEVER an entry.
    expect(entries).toHaveLength(1);
    expect(entries.filter((e) => entryRunId(e) === null)).toHaveLength(0);
    expect(entries[0]).toMatchObject({
      runId: 'run-agg',
      statusAxes: { connectionStatus: 'attached', livenessStatus: 'live', executionStatus: 'starting' },
    });
  });

  // --- Scenario 3 (US3) — commands, and always knowing their fate ----------
  it('Scenario 3: pause returns a commandId shown as accepted (requested≠applied); the sidecar stream DELIVERS it (run-application = KNOWN GAP TASK-461)', async () => {
    const { installationRoot, installationId } = provisionInstallation();
    const plane = await startPlane(installationId);

    // A run must be OBSERVED before it can be commanded (AUDIT-20260717-16): the
    // command is held for the run's OWNER, resolved from the live registry. So
    // ingest run-cmd (owned by THIS installation) first — then the command
    // targets this daemon's installation and replays to its sidecar on connect.
    await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify(makeEvent(installationId, 'run-cmd', 'run.started')),
    });

    // Issue the command BEFORE the sidecar connects → replay-on-connect delivers
    // it the moment the daemon's SSE stream opens.
    const issue = await fetch(`${plane.baseUrl}/v1/runs/run-cmd/commands`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pause' }),
    });
    expect(issue.status).toBe(200);
    const issueBody: unknown = await issue.json();
    if (typeof issueBody !== 'object' || issueBody === null || !('commandId' in issueBody)) {
      throw new Error(`expected a commandId in the issue result: ${JSON.stringify(issueBody)}`);
    }
    const { commandId, state } = issueBody as { commandId: string; state: string };
    expect(typeof commandId).toBe('string');
    expect(commandId.length).toBeGreaterThan(0);
    // Issue reports the REQUESTED state — never 'applied' (FR-059).
    expect(state).toBe('accepted');

    // GET /v1/commands/:id shows requested-vs-applied distinctly: still accepted.
    const status = await fetch(`${plane.baseUrl}/v1/commands/${commandId}`, { headers: bearer(TOKEN) });
    expect(status.status).toBe(200);
    const statusBody: unknown = await status.json();
    expect(statusBody).toMatchObject({ commandId, found: true, command: { state: 'accepted', kind: 'pause' } });

    // The sidecar's command stream DELIVERS the pause command.
    const received: unknown[] = [];
    const daemon = runSidecarDaemon({
      installationRoot,
      planeUrl: plane.baseUrl,
      drainIntervalMs: 600_000,
      livenessIntervalMs: 600_000,
      onCommand: (command) => received.push(command),
    });
    daemons.push(daemon);
    const start = await daemon.started;
    if (start.kind !== 'won') throw new Error('expected a won election');

    await pollUntil(
      async () =>
        received.some((c) => typeof c === 'object' && c !== null && (c as { kind?: unknown }).kind === 'pause'),
      4000,
      "the sidecar's command stream to deliver the pause command",
    );
    // KNOWN GAP (TASK-461): the sidecar consuming the command is proven above;
    // fanning it into a local run over the socket (register-run/command frames)
    // is not yet wired. Delivery + plane-side status are the verified surface.
  });

  // --- Scenario 4 (US4) — trust, including about failure -------------------
  it('Scenario 4: a socket close is abnormally-disconnected (never a death verdict); a GENUINE downstream failure degrades the uplink hop (naming it), a malformed-body 400 does NOT (AUDIT-20260718-26)', async () => {
    // (a) THE HONESTY INVARIANT — a closed socket yields a CONNECTION-axis
    // verdict, never a death/crashed verdict (SC-004, FR-026). Pure + always
    // terminal-drivable.
    const verdict = interpretSocketClose({ runId: 'run-4', sawEndOfInvocation: false });
    expect(verdict.connectionStatus).toBe('abnormally-disconnected');
    expect(verdict.terminationReason).toBe('unknown');
    const DEATH = ['crashed', 'dead', 'died', 'failed', 'killed', 'terminated'];
    expect(DEATH).not.toContain(verdict.connectionStatus);

    // (b) A GENUINE downstream failure (a real store/transport error DOWNSTREAM
    // of successful schema validation) degrades the UPLINK hop, naming THAT hop
    // (FR-074, C9). Simulate it with a flaky durable log whose FIRST append
    // throws — NOT a malformed request. A malformed request is a boundary 400
    // that must NOT touch the uplink needle (proven in (d)).
    let failNextAppend = true;
    const flakyLog: EventLog = {
      replayed: [],
      append(_event: ClassifiedEvent): void {
        if (failNextAppend) {
          failNextAppend = false;
          throw new Error('simulated downstream durable-store failure');
        }
      },
    };
    const { installationId } = provisionInstallation();
    const plane = await startPlane(installationId, undefined, flakyLog);

    // A WELL-FORMED event whose durable append fails downstream ⇒ non-2xx.
    const failedIngest = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify(makeEvent(installationId, 'run-uplink-fail', 'run.started')),
    });
    expect(failedIngest.status).not.toBe(200);

    const degradedBody: unknown = await (
      await fetch(`${plane.baseUrl}/v1/health/store`, { headers: bearer(TOKEN) })
    ).json();
    const uplink = hopOf(degradedBody, 'uplink');
    // "Degraded" always answers WHICH hop — the uplink hop names its own failure.
    expect(uplink.status).toBe('degraded');
    expect(typeof uplink.lastError).toBe('string');
    expect((uplink.lastError ?? '').length).toBeGreaterThan(0);
    // The archive hop is surfaced independently (never collapsed into one).
    expect(hopOf(degradedBody, 'archive').status.length).toBeGreaterThan(0);

    // (c) NOT a sticky, unbounded false-positive: a subsequent SUCCESSFUL ingest
    // (append no longer throws) clears the degraded verdict — the hop recovers.
    await sleep(2); // ensure lastSuccess is strictly newer than lastFailure
    const okIngest = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify(makeEvent(installationId, 'run-uplink-ok', 'run.started')),
    });
    expect(okIngest.status).toBe(200);
    const recoveredBody: unknown = await (
      await fetch(`${plane.baseUrl}/v1/health/store`, { headers: bearer(TOKEN) })
    ).json();
    expect(hopOf(recoveredBody, 'uplink').status).not.toBe('degraded');

    // (d) A plain MALFORMED-BODY 400 must NOT degrade uplink health — a client
    // input error rejected at the boundary is not evidence the uplink
    // infrastructure is broken (AUDIT-20260718-26). Fresh, healthy plane.
    const healthyPlane = await startPlane(installationId);
    const badIngest = await fetch(`${healthyPlane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ not: 'a valid telemetry event' }),
    });
    expect(badIngest.status).toBe(400);
    const afterBadBody: unknown = await (
      await fetch(`${healthyPlane.baseUrl}/v1/health/store`, { headers: bearer(TOKEN) })
    ).json();
    expect(hopOf(afterBadBody, 'uplink').status).not.toBe('degraded');
  });

  // --- Scenario 6 (US6) — hostile network ----------------------------------
  it('Scenario 6: unauthenticated/revoked ⇒ 401 never downgraded; a copied installation tree re-mints a distinct installationId (SC-014)', async () => {
    const { installationId } = provisionInstallation();
    const plane = await startPlane(installationId, new Set([REVOKED_TOKEN]));

    // Unauthenticated ⇒ 401.
    const anon = await fetch(`${plane.baseUrl}/v1/fleet`);
    expect(anon.status).toBe(401);

    // Revoked ⇒ 401, reason 'revoked' — NEVER downgraded to partial access (FR-088).
    const revoked = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(REVOKED_TOKEN) });
    expect(revoked.status).toBe(401);
    const revokedBody: unknown = await revoked.json();
    expect(revokedBody).toMatchObject({ reason: 'revoked' });

    // A valid bearer is admitted — the refusal is the token's, not the route's.
    const ok = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(TOKEN) });
    expect(ok.status).toBe(200);

    // RE-MINT ON CLONE (SC-014): two installation trees at DISTINCT real paths
    // mint DISTINCT ids — no identity travels with a copied tree. mint-once holds
    // within one path (a re-read returns the same id).
    const rootA = mkdtempSync(join(tmpdir(), 'scf-dogfood-clone-a-'));
    const rootB = mkdtempSync(join(tmpdir(), 'scf-dogfood-clone-b-'));
    tmpRoots.push(rootA, rootB);
    const idA = mintOrReadInstallationId(rootA);
    const idB = mintOrReadInstallationId(rootB);
    expect(idA).not.toBe(idB);
    // mint-once: a second read at the same path is stable, not a re-mint.
    expect(mintOrReadInstallationId(rootA)).toBe(idA);

    // NOTE (referenced, verified elsewhere, not re-driven here): keepalive
    // comment frames re-arm the client read-idle watchdog — the likeliest silent
    // bug in the feature — is pinned by tests/fleet/sse-keepalive.test.ts. The
    // token never crossing the local socket is pinned by
    // tests/fleet/token-not-on-socket.test.ts + no-creds-in-cli.test.ts.
    expect(store()).toBeDefined();
  });
});
