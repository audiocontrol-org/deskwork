// specs/037-instance-observability — T034 [US3] RED test.
//
// THE CONTRACT (contracts/telemetry-events.md § "New event types" +
// § "Payload-threading contract (D5 — the sharpest seam)"; data-model.md
// § InstanceState `currentBearing`):
//
//   A `phase.entered` event (durable) carries its `{ phase, from, item }` on the
//   bounded `snapshot`; its envelope carries `host`/`path`. Ingested through the
//   FULL path (ingest → toClassifiedEvent copies the snapshot → the event log
//   persists it → buildInstanceRegistry folds it), the instance's
//   `currentBearing` MUST equal the DERIVED `{ phase, item }` (no separate
//   `bearing` field — analyze L2). And because the three new types are `durable`
//   precisely so the phase timeline survives a bounce (FR-013), the SAME
//   `currentBearing` MUST still be served after a plane RESTART over the same
//   durable dir (rehydrate from `eventLog.replayed`).
//
//   This is the end-to-end proof that D5's snapshot threading reaches
//   `currentBearing` and survives persistence + replay — exercised through a REAL
//   node:http plane (ephemeral port, real fetch) with a REAL file-backed EventLog
//   over one `commandStoreDir` written by the first plane and replayed by the
//   second. It MIRRORS the real-plane boot/restart mechanism of
//   tests/instance/instance-rehydrate.test.ts (T023) and layers the
//   snapshot-threading proof of tests/fleet/snapshot-threading.test.ts (T010) on
//   top, through the full HTTP surface.
//
//   RED today: even with the snapshot threading (T011) in place, the per-instance
//   fold (`applyInstanceEvent`, src/plane/instance-accumulator.ts) does NOT yet
//   fold `phase.entered` into `currentBearing` (T033 wires that), so the served
//   `currentBearing` is `null`, not `{ phase, item }`.
//
// Real node:fs tmp dir (.claude/rules/testing.md). Relative `.js` imports under
// node16 resolution (no `@/` alias — this plugin has none). No `any`, no `as`,
// no `@ts-ignore` (Constitution Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';

const TOKEN = 'token-phase-payload-e2e';
const INST = '33333333-3333-4333-8333-333333333333';
const HOST = 'phase-e2e-host';
const PATH = '/tmp/phase-e2e/proj-a';
const INSTANCE_ID = `${HOST}:${PATH}`;

// The phase.entered snapshot (contracts/telemetry-events.md § phase.entered):
// `{ phase, from, item }`; currentBearing is the DERIVED `{ phase, item }`.
const PHASE = 'implementing';
const FROM = 'specifying';
const ITEM = 'impl/instance-observability';
const EXPECTED_BEARING = { phase: PHASE, item: ITEM };

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
  const address = server.address() as AddressInfo | string | null;
  if (address === null || typeof address === 'string') {
    throw new Error('startPlane: expected a bound TCP AddressInfo');
  }
  const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${address.port}` };
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

/** A real, wire-shaped `phase.entered` (durable) POST body: envelope carries
 * host/path; the `{ phase, from, item }` rides the bounded `snapshot` — exactly
 * the D5 payload whose threading this suite proves end-to-end. */
function phaseEnteredBody(): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: mintUuidV7(),
      runId: null,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 2, // 037 identity-bearing event (AUDIT-20260719-06: v1 is legacy-without-identity)
      type: 'phase.entered',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 7,
      classification: 'durable',
      host: HOST,
      path: PATH,
      sessionId: null,
    },
    snapshot: { phase: PHASE, from: FROM, item: ITEM },
  });
}

async function ingestPhaseEntered(plane: RunningPlane): Promise<void> {
  const res = await fetch(`${plane.baseUrl}/v1/ingest`, {
    method: 'POST',
    headers: bearer(),
    body: phaseEnteredBody(),
  });
  expect(res.status).toBe(200);
}

/** Fetch the per-instance detail (GET /v1/instances/:id, URL-encoded host:path)
 * from a real booted plane and return the served `currentBearing` value — the
 * derived `{ phase, item } | null`. Fails loud if the response shape is not the
 * documented `{ found: true, instance: InstanceState }`. */
async function fetchCurrentBearing(plane: RunningPlane): Promise<unknown> {
  const res = await fetch(`${plane.baseUrl}/v1/instances/${encodeURIComponent(INSTANCE_ID)}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status).toBe(200);
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('instance' in body)) {
    throw new Error(`expected an InstanceDetail with an instance, got ${JSON.stringify(body)}`);
  }
  const instance: unknown = Reflect.get(body, 'instance');
  if (typeof instance !== 'object' || instance === null || !('currentBearing' in instance)) {
    throw new Error(`expected an InstanceState with currentBearing, got ${JSON.stringify(instance)}`);
  }
  return Reflect.get(instance, 'currentBearing');
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

describe('phase.entered → currentBearing end-to-end + rehydrate (T034, D5 payload-threading)', () => {
  it('a real ingested phase.entered appears in currentBearing AND survives a plane restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scf-phase-payload-e2e-'));
    dirsToClean.add(dir);

    // Boot 1: ingest a real phase.entered through the FULL path.
    const first = await startPlane(dir);
    await ingestPhaseEntered(first);

    // (1) currentBearing is the DERIVED { phase, item } from the ingested event.
    expect(await fetchCurrentBearing(first)).toEqual(EXPECTED_BEARING);

    // Bounce: tear the plane down entirely.
    await closePlane(first);

    // Boot 2: a fresh runtime over the SAME durable dir rehydrates from
    // eventLog.replayed — the snapshot survived persistence + replay.
    const second = await startPlane(dir);

    // (2) currentBearing is STILL the derived { phase, item } after the restart.
    expect(await fetchCurrentBearing(second)).toEqual(EXPECTED_BEARING);
  });
});
