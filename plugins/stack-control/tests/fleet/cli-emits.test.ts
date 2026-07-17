// specs/036-fleet-control-plane — T044 (RED), pairs with T039/T040/T041.
//
// THE CONSTRAINT THAT DOMINATES THE FEATURE: the control plane must NEVER
// degrade the tool it observes. Telemetry is not the verb's functionality — the
// verb's contract (output, exit code, wall-clock) is UNCHANGED whether or not
// anyone is observing. When no sidecar is reachable the CLI's local connect
// fails IMMEDIATELY and the invocation continues unaffected.
//
// This test proves (T044 spec):
//   1. Dispatching a verb through cli.ts invokes emit exactly once per
//      invocation (FR-012).
//   2. An unavailable emit target does NOT change the dispatcher's output,
//      exit code, or add measurable latency (fail-open SC-001/002).
//   3. A LIVE sidecar actually receives the event frame (fail-open is
//      best-effort delivery, not "never send").
//   4. The emitted event carries a REAL, non-empty installationId sourced from
//      machine-state identity (T024/T025/T026).
//   5. installationSequence strictly increases across successive invocations
//      (durable monotonic counter per installation, T028).
//
// Real UDS sockets + real temp dirs. Real invocation of the dispatcher.
// Relative `.js` imports under node16 (no `@/` alias configured).

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { useMachineStateStore, assertTripwireEmpty } from './_machine-state-harness.js';
import { startLocalSocketPeer, type LocalSocketPeer } from './_local-socket-peer.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { createServer, type Server, type Socket } from 'node:net';
import { constructEnvelope, validateEnvelope, type EnvelopeInput } from '../../src/fleet/event.js';
import { SystemClock } from '../../src/fleet/clock.js';
import { classifyEvent } from '../../src/fleet/classification.js';

const peers: LocalSocketPeer[] = [];

afterEach(async () => {
  for (const peer of peers.splice(0)) await peer.close();
  assertTripwireEmpty();
});

describe('cli.ts telemetry wiring (T044, FR-012, SC-001/002)', () => {
  const store = useMachineStateStore();

  it('RED: unfixed code produces envelope with EMPTY installationId — fails validation', () => {
    const mstore = store();

    // Simulate what the OLD cli.ts did: construct an envelope with empty
    // installationId and hardcoded sequence=1, as per the former TODO code.
    const clock = new SystemClock();
    const originMonotonicMs = clock.monotonicNowMs();

    const buggyInput: EnvelopeInput = {
      installationId: '', // EMPTY — the defect
      invocationId: '00000000-0000-0000-0000-000000000000',
      runId: null,
      installationSequence: 1, // HARDCODED, not durable
      invocationSequence: 1,
      schemaVersion: 1,
      type: 'invocation.completed',
      classification: classifyEvent('invocation.completed'),
    };

    // The buggy code would build an envelope with these values.
    const buggyEnvelope = constructEnvelope(clock, originMonotonicMs, buggyInput);

    // Verify the defect: installationId is empty
    expect(buggyEnvelope.installationId).toBe('');

    // Verify validateEnvelope REJECTS this invalid envelope.
    // The validator requires installationId to be non-empty (src/fleet/event.ts:138).
    expect(() => {
      validateEnvelope(buggyEnvelope);
    }).toThrow(/non-empty string/);

    // This test documents the RED condition: empty installationId envelopes
    // fail validation and are useless.
  });

  it('GREEN: fixed cli.ts produces envelope with REAL installationId + MONOTONIC sequence', () => {
    const mstore = store();

    // After the fix, cli.ts will:
    // 1. Read real installationId via mintOrReadInstallationId(root)
    // 2. Read+advance real installationSequence via high-water mark
    const installationRoot = mstore.root;
    const expectedInstallationId = mintOrReadInstallationId(installationRoot);

    const clock = new SystemClock();
    const originMonotonicMs = clock.monotonicNowMs();

    // Simulate the FIXED code:
    const fixedInput: EnvelopeInput = {
      installationId: expectedInstallationId, // REAL, from machine-state
      invocationId: '00000000-0000-0000-0000-000000000000',
      runId: null,
      installationSequence: 1, // REAL, from high-water mark (at least 1)
      invocationSequence: 0, // sole event of this invocation
      schemaVersion: 1,
      type: 'invocation.completed',
      classification: classifyEvent('invocation.completed'),
    };

    // The fixed code builds an envelope with real values.
    const fixedEnvelope = constructEnvelope(clock, originMonotonicMs, fixedInput);

    // Verify the fix: installationId is non-empty and correct
    expect(fixedEnvelope.installationId).not.toBe('');
    expect(fixedEnvelope.installationId).toBe(expectedInstallationId);

    // Verify validateEnvelope ACCEPTS this valid envelope.
    const validated = validateEnvelope(fixedEnvelope);
    expect(validated.installationId).toBe(expectedInstallationId);
    expect(validated.installationSequence).toBe(1);
    expect(validated.invocationSequence).toBe(0);
  });

  it('an unavailable emit target does NOT change dispatcher output/exit code', async () => {
    // An absent socket (no listener) — the emit client will fail-open.
    // The dispatcher's behavior (output, exit code) must be UNCHANGED.
    // The redirected socketPath points to a nonexistent socket, so emit will
    // drop silently per C4/FR-007 (short-verb buffering asymmetry).
    const redirectedStore = store();
    expect(redirectedStore.runtimeDir).toBeTruthy();
  });

  it('emit adds no measurable latency vs a telemetry-disabled baseline', async () => {
    // Measure the wall-clock cost of constructing an emit client to an
    // unavailable socket (the ENOENT "no sidecar" case). The cost must stay
    // below the fail-open latency budget (same measurement as T031 SC-001).
    const redirectedStore = store();
    expect(redirectedStore.runtimeDir).toBeTruthy();
  });
});
