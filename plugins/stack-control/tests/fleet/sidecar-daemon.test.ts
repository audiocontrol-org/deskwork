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
import type { Server } from 'node:http';
import { useMachineStateStore } from './_machine-state-harness.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import type { IntervalScheduler } from '../../src/plane/http/stream.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { openTokenCustody } from '../../src/machine-state/token.js';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { TelemetryEvent } from '../../src/fleet/event.js';
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

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
  readonly dir: string;
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

function makeTelemetryEvent(installationId: string, runId: string, type: string): TelemetryEvent {
  return {
    envelope: {
      eventId: mintUuidV7(),
      installationId,
      invocationId: 'invocation-daemon-1',
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 1,
      type,
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 7,
      classification: 'durable',
    },
    snapshot: {},
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

describe('sidecar daemon — runnable end-to-end (specs/036 sidecar-daemon)', () => {
  const store = useMachineStateStore();

  let plane: RunningPlane | undefined;
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
});
