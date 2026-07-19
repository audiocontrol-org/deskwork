// specs/037-instance-observability — D-B (FR-027 dogfood Scenario 1) RED test.
//
// THE DEFECT (D-B): an ordinary SHORT `stackctl` verb (e.g. `version`) whose
// handler is FAST creates NO instance, because its `invocation.completed`
// telemetry never reaches the sidecar. `runInvocationWithTelemetry`
// (src/telemetry/invocation-telemetry.ts) created its emit client with
// `callerKind: 'short-verb'` — a CAPACITY-0 buffer that DROPS the event when the
// eager socket connect has not completed yet. It then `emit()`s and `close()`s
// in the same synchronous shape; for a fast handler the connect is still in
// flight at emit-time, so the short-verb buffer drops the event and the CLI
// exits before anything reaches the sidecar. Session events already deliver
// (they use a `long-run` buffer) — which is why dogfood Scenario 2 worked but
// Scenario 1 did not. The spec requires an instance to exist from a bare
// invocation.
//
// THE FIX (invocation-telemetry.ts, scoped to the dispatcher — NOT emit.ts):
//   - use a `long-run`-style buffer so the event is HELD across the connect gap
//     instead of dropped (mirrors phase-entered.ts, the sibling 037 seam), AND
//   - after emit(), give the connect a SMALL BOUNDED window to complete + drain
//     before close() — fail-open + non-hanging (a down sidecar errors instantly
//     → no wait; a stalled peer never blocks because delivery does not wait on a
//     peer ack; the budget is a hard ceiling so it can never hang).
//
// HOW THIS DRIVES THE REAL DEFECT PATH (NOT a /v1/ingest POST — that bypasses the
// emit client under test): a REAL sidecar daemon over a REAL bound UDS + a REAL
// node:http plane. We call the REAL `runInvocationWithTelemetry` with a FAST
// handler (the exact shape of a short verb like `version`), then read the
// instance back over the query API. Pre-fix the fast-verb event is dropped, no
// event uplinks, and the instance never appears (RED — poll times out). Post-fix
// the held event drains on connect, flushes on close, uplinks, and surfaces as
// the instance's last activity (GREEN).
//
// Real node:net UDS + real node:http plane + real fs tmp dirs
// (.claude/rules/testing.md). Machine-state store redirected off $HOME
// (non-negotiable). Relative `.js` imports under node16. No `any`/`as`/`@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { useMachineStateStore } from '../fleet/_machine-state-harness.js';
import { boundPort } from '../_bound-port.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import type { IntervalScheduler } from '../../src/plane/http/stream.js';
import { runSidecarDaemon, type SidecarDaemonHandle } from '../../src/sidecar/daemon.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { openTokenCustody } from '../../src/machine-state/token.js';
import { runInvocationWithTelemetry } from '../../src/telemetry/invocation-telemetry.js';

const TOKEN = 'invocation-fast-verb-bearer-token';

/** Fake keepalive scheduler — records the registration without arming a real
 * 15s timer (mirrors dogfood/sidecar-daemon test scaffolding). */
class FakeScheduler implements IntervalScheduler {
  private nextHandle = 1;
  setInterval(_callback: () => void, _intervalMs: number): unknown {
    const handle = this.nextHandle;
    this.nextHandle += 1;
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

/** Every instance the plane's snapshot reports whose lastActivity is the given
 * event type. The plane is a real HTTP peer whose body we do not trust
 * structurally, so every access stays `unknown` (never `any`/`as`). */
async function instancesWithLastActivity(baseUrl: string, activity: string): Promise<unknown[]> {
  const res = await fetch(`${baseUrl}/v1/instances`, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (res.status !== 200) return [];
  const body: unknown = await res.json();
  const instances: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'instances') : undefined;
  if (!Array.isArray(instances)) return [];
  return instances.filter(
    (inst) =>
      typeof inst === 'object' && inst !== null && Reflect.get(inst, 'lastActivity') === activity,
  );
}

describe('D-B (FR-027 Scenario 1): a FAST short verb delivers invocation.completed so an instance appears', () => {
  const store = useMachineStateStore();

  const planes: RunningPlane[] = [];
  const daemons: SidecarDaemonHandle[] = [];
  const tmpRoots: string[] = [];

  afterEach(async () => {
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

  async function startPlane(installationId: string): Promise<RunningPlane> {
    const dir = mkdtempSync(join(tmpdir(), 'scf-fastverb-plane-'));
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
    const running: RunningPlane = {
      server,
      baseUrl: `http://127.0.0.1:${boundPort(server)}`,
      dir,
    };
    planes.push(running);
    return running;
  }

  /** Provision a real installation (realpath keys the store): temp root, minted
   * id, token in machine-local custody — all under the redirected store. */
  function provisionInstallation(): { installationRoot: string; installationId: string } {
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-fastverb-root-'));
    tmpRoots.push(installationRoot);
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    openTokenCustody(location.durableDir).write(TOKEN);
    return { installationRoot, installationId };
  }

  it('a FAST-handler invocation reaches the sidecar and surfaces as an instance', async () => {
    // touch `store()` so the redirect is active for this test (tripwire guard).
    expect(store().root).toBeTruthy();
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
    if (start.kind !== 'won') throw new Error('expected a won sidecar election');

    // Drive the REAL dispatcher path with a FAST handler — the exact shape of a
    // short verb like `version`: it resolves before the eager socket connect
    // completes, so pre-fix the short-verb buffer drops the invocation.completed.
    await runInvocationWithTelemetry(async () => {}, [], {
      installationRoot,
      socketPath: start.socketPath,
    });

    // The instance surfaces on the plane, its lastActivity derived from the
    // delivered invocation.completed. Pre-fix: no event uplinks → times out (RED).
    await pollUntil(
      async () => (await instancesWithLastActivity(plane.baseUrl, 'invocation.completed')).length >= 1,
      6000,
      'GET /v1/instances to show an instance whose lastActivity is invocation.completed',
    );

    const matched = await instancesWithLastActivity(plane.baseUrl, 'invocation.completed');
    expect(matched.length).toBeGreaterThanOrEqual(1);
  }, 20_000);

  it('a NO-SIDECAR invocation still returns PROMPTLY (the bounded wait never hangs)', async () => {
    const { installationRoot } = provisionInstallation();

    // No daemon, no peer bound at the resolved socket — the canonical fail-open
    // condition (sidecar absent). The eager connect fires ENOENT on the next
    // tick, so the bounded drain-wait resolves near-instantly, never on the
    // budget ceiling. The invocation must return well under the budget.
    const startMs = performance.now();
    await runInvocationWithTelemetry(async () => {}, [], { installationRoot });
    const elapsedMs = performance.now() - startMs;
    // eslint-disable-next-line no-console
    console.log(`[D-B] no-sidecar runInvocationWithTelemetry returned in ${elapsedMs.toFixed(2)}ms`);
    // Generous headroom over the ~few-ms real return, well under any hang; the
    // 50ms drain budget is a ceiling only for a pathological never-errors socket,
    // which an absent sidecar is not.
    expect(elapsedMs).toBeLessThan(500);
  });
});
