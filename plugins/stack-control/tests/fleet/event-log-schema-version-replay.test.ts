// specs/037-instance-observability — AUDIT-20260719-03 (RED-first): the durable
// event-log replay must TOLERATE pre-037 (schemaVersion-1) records.
//
// THE DEFECT: 037 threaded three new envelope fields (`host`/`path`/`sessionId`)
// and a top-level `snapshot` through the ingest→registry→log boundary, then made
// the REPLAY path REQUIRE them: `parseLine` (`src/plane/event-log.ts`) throws if a
// persisted line lacks top-level `snapshot`, and `validateEnvelope`
// (`src/fleet/event.ts`) throws if the envelope lacks `host`/`path`. A durable
// log written by a 036-era plane (schemaVersion 1, no snapshot, no host/path/
// sessionId) therefore BRICKS an upgraded plane during `createEventLog` replay —
// old-but-valid records treated as corruption; the fresh-install path works at
// the expense of the upgrade path.
//
// THE SPEC-MANDATED BEHAVIOR (data-model.md § EventEnvelope): "older events read
// `sessionId: null` and derive `host`/`path` absent → not attributable to an
// instance (pre-feature events are simply not projected). schemaVersion
// increments". So replay MUST read a schemaVersion-1 record without throwing,
// treat the missing 037 fields as absent/null, and let it simply not attribute to
// any instance (no host:path → no instance key → not projected). STRICT
// validation stays for newly-ingested schemaVersion-2 events (ingest unchanged).
//
// Real node:fs tmp dir (.claude/rules/testing.md — real fs, no mocks). Relative
// `.js` imports under node16 resolution. No `any`/`as`/`@ts-ignore` (Constitution
// Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventLog } from '../../src/plane/event-log.js';
import { buildInstanceRegistry } from '../../src/plane/instance-registry.js';
import { mintUuidV7 } from '../../src/fleet/types.js';
import {
  createIngestState,
  ingestEvent,
  type DurableEventStore,
  type IngestState,
} from '../../src/plane/http/ingest.js';
import type { TelemetryEvent } from '../../src/fleet/event.js';

const LOG_FILE = 'accepted-events.log';

const dirsToClean = new Set<string>();
afterEach(() => {
  for (const dir of dirsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirsToClean.clear();
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'scf-schema-version-replay-'));
  dirsToClean.add(dir);
  return dir;
}

/**
 * A durable log line in the 036-era (schemaVersion-1) shape: NO top-level
 * `snapshot`, and the envelope carries NONE of the 037 fields
 * (`host`/`path`/`sessionId`). This is the exact JSONL a pre-feature plane
 * appended. Newline-terminated so replay treats it as a fully-durable
 * (non-trailing) line that MUST parse — not a truncated crash tail that the
 * crash-tolerance would silently drop.
 */
function schemaV1Line(runId: string, sequence: number): string {
  const envelope = {
    eventId: mintUuidV7(),
    installationId: '11111111-1111-4111-8111-111111111111',
    invocationId: `inv-${runId}`,
    runId,
    installationSequence: sequence,
    invocationSequence: sequence,
    schemaVersion: 1,
    type: 'run.started',
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: 5,
    classification: 'durable',
  };
  return `${JSON.stringify({ envelope })}\n`;
}

/**
 * A durable log line in the 037 (schemaVersion-2) shape: the envelope carries
 * `host`/`path`/`sessionId`, and a top-level bounded `snapshot` is present.
 */
function schemaV2Line(host: string, path: string, sequence: number): string {
  const envelope = {
    eventId: mintUuidV7(),
    installationId: '22222222-2222-4222-8222-222222222222',
    invocationId: `inv-${host}`,
    runId: `run-${host}`,
    installationSequence: sequence,
    invocationSequence: sequence,
    schemaVersion: 2,
    type: 'run.started',
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: 5,
    classification: 'durable',
    host,
    path,
    sessionId: null,
  };
  return `${JSON.stringify({ envelope, snapshot: {} })}\n`;
}

class FakeDurableEventStore implements DurableEventStore {
  readonly stored: TelemetryEvent[] = [];
  async storeLateEvent(event: TelemetryEvent): Promise<void> {
    this.stored.push(event);
  }
}

/** A schemaVersion-2 raw wire event MISSING the required `host` field. */
function v2RawEventMissingHost(): unknown {
  return {
    envelope: {
      eventId: mintUuidV7(),
      installationId: '33333333-3333-4333-8333-333333333333',
      invocationId: 'inv-x',
      runId: 'run-x',
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 2,
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 5,
      classification: 'durable',
      // host: DELIBERATELY ABSENT — a v2 event must carry it.
      path: '/some/install/root',
      sessionId: null,
    },
    snapshot: {},
  };
}

describe('event-log replay tolerates pre-037 schemaVersion-1 records (AUDIT-20260719-03)', () => {
  it('replays a lone schemaVersion-1 record (036 shape) without throwing; it is not attributed to any instance', () => {
    const dir = makeDir();
    const path = join(dir, LOG_FILE);
    writeFileSync(path, schemaV1Line('run-old', 1));

    // Pre-fix: `parseLine` throws ("missing snapshot" / "expected non-empty
    // string" for host) on this non-trailing line — bricking plane boot. Post-
    // fix: it replays.
    const log = createEventLog(dir);
    expect(log.replayed).toHaveLength(1);
    expect(log.replayed[0]?.envelope.runId).toBe('run-old');

    // The old event derives no host:path, so it is NOT projected as an instance
    // (data-model.md § EventEnvelope: pre-feature events are simply not projected).
    const registry = buildInstanceRegistry(log.replayed);
    expect(registry.instances()).toHaveLength(0);
  });

  it('replays a MIX of a schemaVersion-1 record and a schemaVersion-2 record; only the v2 record becomes an instance', () => {
    const dir = makeDir();
    const path = join(dir, LOG_FILE);
    writeFileSync(path, schemaV1Line('run-old', 1) + schemaV2Line('newhost', '/new/root', 2));

    const log = createEventLog(dir);
    expect(log.replayed).toHaveLength(2);

    const registry = buildInstanceRegistry(log.replayed);
    const instances = registry.instances();
    expect(instances).toHaveLength(1);
    expect(instances[0]?.id).toBe('newhost:/new/root');
    expect(instances[0]?.host).toBe('newhost');
    expect(instances[0]?.path).toBe('/new/root');
  });

  it('still STRICTLY rejects a newly-ingested schemaVersion-2 event missing a required 037 field (ingest unchanged)', async () => {
    const state: IngestState = createIngestState();
    const deps = { durableStore: new FakeDurableEventStore() };

    await expect(ingestEvent(state, deps, v2RawEventMissingHost())).rejects.toThrow(
      /EventEnvelope\.host/,
    );
  });
});
