// specs/037-instance-observability — T019 (RED-first) — the invocation-telemetry
// emit path must stamp every event with host/path identity (derived by
// construction in constructEnvelope, FR-011) AND thread the current Claude Code
// session id (§ D3), while staying strictly FAIL-OPEN: a current-session read
// that throws (corrupt/unreadable record) must NOT throw or block the
// invocation — the emit still completes, degrading `sessionId` to null.
//
// Drives the REAL emit wrapper `runInvocationWithTelemetry` (the exact code
// cli.ts calls) against a live UDS peer, mirroring tests/fleet/cli-emits.test.ts.
// The current-session store resolves its installation from `process.cwd()` (it
// takes no caller-supplied root), so a session minted via CurrentSession.mint()
// here is the same session the telemetry emit reads — both resolve through the
// same redirected machine-local store the harness installs.
//
// Real UDS peer + real temp dirs; relative `.js` imports under node16.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useMachineStateStore } from '../fleet/_machine-state-harness.js';
import { startLocalSocketPeer, waitUntil, type LocalSocketPeer } from '../fleet/_local-socket-peer.js';
import {
  runInvocationWithTelemetry,
  type InvocationTelemetryOptions,
} from '../../src/telemetry/invocation-telemetry.js';
import * as CurrentSession from '../../src/machine-state/current-session.js';

const IS_WIN = process.platform === 'win32';

function shortTmpBase(): string {
  return IS_WIN ? tmpdir() : '/tmp';
}

const roots: string[] = [];
const peers: LocalSocketPeer[] = [];

/** A real installation-root dir (locate.ts's realpath.native requires it). */
function makeInstallationRoot(): string {
  const root = mkdtempSync(join(shortTmpBase(), 'scf-emitid-inst-'));
  roots.push(root);
  return root;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 15));

interface EnvelopeShape {
  readonly type: string;
  readonly host: string;
  readonly path: string;
  readonly sessionId: string | null;
}

/** The `envelope` of every `event` frame the peer has received so far. */
function eventEnvelopes(peer: LocalSocketPeer): EnvelopeShape[] {
  return peer.receivedLines
    .map((line) => JSON.parse(line))
    .filter(
      (f): f is { kind: string; event: { envelope: EnvelopeShape } } =>
        f !== null && typeof f === 'object' && f.kind === 'event',
    )
    .map((f) => f.event.envelope);
}

afterEach(async () => {
  for (const peer of peers.splice(0)) await peer.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('emit stamps host/path identity + threads sessionId (T019, FR-011/§D3)', () => {
  const store = useMachineStateStore();

  it('stamps non-empty host + path (derived) and threads the current sessionId when a session is open', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);
    const root = makeInstallationRoot();

    // Open a session — resolves from process.cwd(), the same resolution the
    // telemetry emit's current-session read uses.
    const sessionId = 'session-emit-T019';
    CurrentSession.mint(sessionId, '2026-07-18T10:00:00Z');

    const opts: InvocationTelemetryOptions = { installationRoot: root, socketPath: peer.socketPath };
    await runInvocationWithTelemetry(async () => {
      await tick();
    }, [], opts);
    await waitUntil(() => eventEnvelopes(peer).length >= 1);

    const [env] = eventEnvelopes(peer);
    expect(env.type).toBe('invocation.completed');
    expect(env.host.length).toBeGreaterThan(0);
    expect(env.path.length).toBeGreaterThan(0);
    expect(env.sessionId).toBe(sessionId);
  });

  it('threads sessionId=null when no session is open (host/path still derived)', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);
    const root = makeInstallationRoot();

    // Fresh redirected store — no session minted → read() returns null.
    const opts: InvocationTelemetryOptions = { installationRoot: root, socketPath: peer.socketPath };
    await runInvocationWithTelemetry(async () => {
      await tick();
    }, [], opts);
    await waitUntil(() => eventEnvelopes(peer).length >= 1);

    const [env] = eventEnvelopes(peer);
    expect(env.host.length).toBeGreaterThan(0);
    expect(env.path.length).toBeGreaterThan(0);
    expect(env.sessionId).toBeNull();
  });

  it('FAIL-OPEN: a corrupt current-session record does NOT throw or block — emit still completes with sessionId=null', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);
    const root = makeInstallationRoot();

    // Mint (creates the 0700 durable dir + record), then corrupt the record so
    // the exact path current-session.read() consults fails to parse.
    CurrentSession.mint('session-will-be-corrupted', '2026-07-18T10:00:00Z');
    writeFileSync(join(store().durableDir, 'current-session'), 'not-json-at-all', 'utf8');

    // Guard: the read really throws (so the fail-open assertion below is meaningful).
    expect(() => CurrentSession.read()).toThrow();

    const opts: InvocationTelemetryOptions = { installationRoot: root, socketPath: peer.socketPath };
    // The emit must NOT reject even though the session read throws.
    await expect(
      runInvocationWithTelemetry(async () => {
        await tick();
      }, [], opts),
    ).resolves.toBeUndefined();

    // And it STILL emitted — best-effort telemetry degrades sessionId to null.
    await waitUntil(() => eventEnvelopes(peer).length >= 1);
    const [env] = eventEnvelopes(peer);
    expect(env.type).toBe('invocation.completed');
    expect(env.host.length).toBeGreaterThan(0);
    expect(env.sessionId).toBeNull();
  });
});
