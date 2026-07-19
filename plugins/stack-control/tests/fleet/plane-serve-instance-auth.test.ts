// specs/037-instance-observability — AUDIT-20260719-01 (RED→GREEN). The REAL
// `plane serve` runtime-construction path must enable the T038 token→`host:path`
// instance-mismatch check. Before the fix, `runServe` built the runtime with
// only `acceptedTokens` + `commandStoreDir` and NEVER `acceptedInstances`, so
// `refuseInstanceMismatch` was DEAD in production: the plane accepted telemetry
// for ANY `envelope.host:path` as long as token + installationId matched. The
// prior T038 test (tests/instance/auth-host-path.test.ts) injected
// `acceptedInstances` by hand, so it could not have caught this.
//
// This test drives the SAME options-assembly `runServe` uses
// (`buildServeRuntimeOptions`, src/subcommands/plane-serve-options.ts) end-to-end
// over a REAL node:http plane — so a regression that drops the instance binding
// from the serve path WOULD fail here.
//
// The served installation's `host:path` is derived from a REAL tmp dir via the
// SAME `deriveInstanceId` the production path uses; the spoof body claims a
// DIFFERENT `host:path`; the matching body claims the served one.
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
import { deriveInstanceId } from '../../src/machine-state/instance-id.js';
import { buildServeRuntimeOptions } from '../../src/subcommands/plane-serve-options.js';
import { boundPort } from '../_bound-port.js';

const TOKEN = 'served-token';
const INSTALLATION_ID = '11111111-1111-4111-8111-111111111111';

// A DIFFERENT checkout on a DIFFERENT host — the spoof the served token must
// not be able to claim.
const SPOOF_HOST = 'some-other-host';
const SPOOF_PATH = '/some/other/checkout';

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

/**
 * Start a plane built via `buildServeRuntimeOptions` — the SAME assembly
 * `runServe` uses — with `installationRoot` naming a REAL tmp dir. Returns the
 * running plane and the served `host:path` derived from that root.
 */
async function startServedPlane(): Promise<{ plane: RunningPlane; servedInstance: string }> {
  const installationRoot = mkdtempSync(join(tmpdir(), 'scf-served-root-'));
  const commandStoreDir = mkdtempSync(join(tmpdir(), 'scf-served-cmd-'));
  dirsToClean.add(installationRoot);
  dirsToClean.add(commandStoreDir);

  const options = buildServeRuntimeOptions({
    tokens: [TOKEN],
    installationId: INSTALLATION_ID,
    installationRoot,
    commandStoreDir,
  });
  const runtime = createPlaneRuntime(options);
  const server = runtime.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const plane: RunningPlane = { server, baseUrl: `http://127.0.0.1:${boundPort(server)}` };
  activePlanes.push(plane);
  return { plane, servedInstance: deriveInstanceId(installationRoot) };
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** An ingest body whose installationId ALWAYS matches the served installation,
 * with parameterized `host`/`path` — so `host:path` is the only axis that can
 * differ from the served instance. */
function runStartedBody(runId: string, host: string, path: string): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INSTALLATION_ID,
      invocationId: `inv-${runId}`,
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 2, // 037 identity-bearing (AUDIT-20260719-16)
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 5,
      classification: 'durable',
      host,
      path,
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

describe('the REAL serve path enables the T038 instance-mismatch check (AUDIT-20260719-01)', () => {
  it('REFUSES an ingest whose envelope host:path differs from the served installation (403), even when installationId matches', async () => {
    const { plane } = await startServedPlane();

    const spoof = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: runStartedBody('run-spoofed-host-path', SPOOF_HOST, SPOOF_PATH),
    });
    expect(spoof.status).toBe(403);

    // The spoofed instance must NOT have been recorded — the fleet stays empty.
    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(TOKEN) });
    expect(fleet.status).toBe(200);
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot, got ${JSON.stringify(snapshot)}`);
    }
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(0);
  });

  it('ACCEPTS an ingest whose envelope host:path MATCHES the served installation (200)', async () => {
    const { plane, servedInstance } = await startServedPlane();

    // Split the derived `host:path` back into host + path for the envelope. The
    // path can contain no colon on this platform's tmp dirs; split on the FIRST
    // colon so the host prefix and the absolute path are recovered exactly.
    const firstColon = servedInstance.indexOf(':');
    if (firstColon < 0) throw new Error(`expected host:path, got ${servedInstance}`);
    const host = servedInstance.slice(0, firstColon);
    const path = servedInstance.slice(firstColon + 1);

    const accepted = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN), 'content-type': 'application/json' },
      body: runStartedBody('run-owned-by-served', host, path),
    });
    expect(accepted.status).toBe(200);

    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(TOKEN) });
    const snapshot: unknown = await fleet.json();
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ runId: 'run-owned-by-served', installationId: INSTALLATION_ID });
  });
});
