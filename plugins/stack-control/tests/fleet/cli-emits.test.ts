// specs/036-fleet-control-plane — T044 / AUDIT-20260717-01 + -03 (rewritten to
// actually exercise the CLI telemetry-emit path) + AUDIT-20260717-08 (handler
// failure still emits + closes the socket).
//
// THE PRIOR DEFECT (AUDIT-01/-03): this file CLAIMED to prove cli.ts wires a
// real installationId + a monotonic installationSequence into the emitted
// envelope and that dispatcher output/exit is unchanged when the sidecar is
// absent — but its tests hand-built envelopes and never drove cli.ts, so a
// regression to a hardcoded `installationSequence: 1` (or no CLI telemetry path
// at all) would have shipped green. These tests now drive the REAL path:
//   - a REAL dispatched short verb through the CLI entry surface (subprocess),
//   - the REAL emit wrapper `runInvocationWithTelemetry` (extracted from cli.ts;
//     cli.ts calls it verbatim) against a live UDS peer.
//
// AUDIT-08: a handler that throws must STILL emit invocation.completed and close
// the emit client, and must re-throw the original error unchanged.
//
// Real UDS peer + real temp dirs + real subprocess CLI. Relative `.js` imports.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useMachineStateStore } from './_machine-state-harness.js';
import { startLocalSocketPeer, waitUntil, type LocalSocketPeer } from './_local-socket-peer.js';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { readPluginVersion } from '../../src/subcommands/version.js';
import {
  runInvocationWithTelemetry,
  type InvocationTelemetryOptions,
} from '../../src/telemetry/invocation-telemetry.js';
import { createEmitClient, type EmitClient } from '../../src/telemetry/emit.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { readHighWaterMark } from '../../src/machine-state/highwater.js';

const IS_WIN = process.platform === 'win32';

function shortTmpBase(): string {
  return IS_WIN ? tmpdir() : '/tmp';
}

const roots: string[] = [];
const peers: LocalSocketPeer[] = [];

/** A real installation-root dir (locate.ts's realpath.native requires it). */
function makeInstallationRoot(): string {
  const root = mkdtempSync(join(shortTmpBase(), 'scf-cliemit-inst-'));
  roots.push(root);
  return root;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 15));

/** Parse the `event` frames the peer has received so far. */
function eventFrames(peer: LocalSocketPeer): Array<{
  event: { envelope: { type: string; installationId: string; installationSequence: number } };
}> {
  return peer.receivedLines
    .map((line) => JSON.parse(line))
    .filter((f): f is { event: { envelope: { type: string; installationId: string; installationSequence: number } } } =>
      f !== null && typeof f === 'object' && f.kind === 'event',
    );
}

afterEach(async () => {
  for (const peer of peers.splice(0)) await peer.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('cli.ts telemetry wiring (T044, FR-012, SC-001/002)', () => {
  const store = useMachineStateStore();

  it('AUDIT-01/03: a REAL dispatched short verb (sidecar absent) leaves stdout+exit unchanged AND advances the durable installationSequence (not hardcoded 1)', () => {
    const root = makeInstallationRoot();
    const location = locateMachineState(root);
    // First-ever: no sequence emitted yet.
    expect(readHighWaterMark(location)).toBe(0);

    const expectedStdout = `${readPluginVersion()}\n`;

    // A real subprocess CLI dispatch, sidecar absent (no peer bound at the
    // resolved socket) → emit fails open. Output + exit are the verb's contract.
    const r1 = runCli(['version'], { cwd: root, env: store().env });
    expect(r1.status).toBe(0);
    expect(r1.stdout).toBe(expectedStdout);
    // The real telemetry path ran and reserved sequence 1 — a regression that
    // hardcoded `installationSequence: 1` (or dropped the CLI telemetry path)
    // would leave this at 0. This is the assertion the old tests lacked.
    expect(readHighWaterMark(location)).toBe(1);

    // A second invocation ADVANCES the counter — proves monotonic, not fixed.
    const r2 = runCli(['version'], { cwd: root, env: store().env });
    expect(r2.status).toBe(0);
    expect(r2.stdout).toBe(expectedStdout);
    expect(readHighWaterMark(location)).toBe(2);
  });

  it('AUDIT-01/03: a dispatched invocation emits EXACTLY ONE invocation.completed carrying the real minted installationId + an advancing sequence', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);
    const root = makeInstallationRoot();
    const opts: InvocationTelemetryOptions = {
      installationRoot: root,
      socketPath: peer.socketPath,
    };

    // First invocation.
    await runInvocationWithTelemetry(async () => {
      await tick();
    }, [], opts);
    await waitUntil(() => eventFrames(peer).length >= 1);

    const expectedId = mintOrReadInstallationId(root);
    let frames = eventFrames(peer);
    expect(frames).toHaveLength(1); // EXACTLY one event per invocation (FR-012)
    expect(frames[0].event.envelope.type).toBe('invocation.completed');
    expect(frames[0].event.envelope.installationId).toBe(expectedId);
    expect(frames[0].event.envelope.installationId).not.toBe('');
    expect(frames[0].event.envelope.installationSequence).toBe(1);

    // Second invocation: a NEW event, sequence advances, id is stable (mint-once).
    await runInvocationWithTelemetry(async () => {
      await tick();
    }, [], opts);
    await waitUntil(() => eventFrames(peer).length >= 2);

    frames = eventFrames(peer);
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => f.event.envelope.installationSequence).sort()).toEqual([1, 2]);
    for (const f of frames) {
      expect(f.event.envelope.installationId).toBe(expectedId);
      expect(f.event.envelope.type).toBe('invocation.completed');
    }
  });

  it('AUDIT-08: a handler that THROWS still emits invocation.completed, closes the socket, and re-throws the original error', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);
    const root = makeInstallationRoot();

    // Capture the emit client so we can assert it was closed even on the throw.
    let captured: EmitClient | undefined;
    const createEmit: typeof createEmitClient = (cfg) => {
      captured = createEmitClient(cfg);
      return captured;
    };

    const boom = new Error('boom-AUDIT-08');
    await expect(
      runInvocationWithTelemetry(
        async () => {
          await tick();
          throw boom;
        },
        [],
        { installationRoot: root, socketPath: peer.socketPath, createEmit },
      ),
    ).rejects.toBe(boom); // original error preserved

    // FR-012: the failing invocation STILL emitted — the case a fleet monitor
    // most wants to see. Pre-fix, the emit block was skipped on a throw.
    await waitUntil(() => eventFrames(peer).length >= 1);
    const frames = eventFrames(peer);
    expect(frames).toHaveLength(1);
    expect(frames[0].event.envelope.type).toBe('invocation.completed');

    // The emit client was closed even though the handler threw (no leaked socket).
    expect(captured?.state).toBe('closed');
  });
});
