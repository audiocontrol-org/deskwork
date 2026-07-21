// specs/036-fleet-control-plane — Task 10 (RED→GREEN): auto-enroll on
// `sidecar run`. When a sidecar starts with NO telemetry token but DOES hold
// a host-level enrollment credential (provisioned by `sidecar set-enrollment`,
// Task 8), it self-enrolls via the enroll client (Task 9), persists the
// returned per-instance token into the SAME custody `openTokenCustody` reads
// on every other path, and proceeds with a normal uplink.
//
// This is the LOAD-BEARING integration evidence: the auto-enroll behavior is
// exercised through the REAL `runSidecarDaemon` (not a standalone helper), per
// the task brief. Only the enroll HTTP call itself is faked (`options.enroll`
// seam) — election, the local socket, and the WAL are all real, mirroring
// sidecar-daemon.test.ts's construction/teardown pattern.
//
// The uplink's OWN network calls (telemetry POST, SSE stream) are also faked
// (`poster`/`transport` seams) so this test never depends on real network
// reachability of the placeholder `planeUrl`.
//
// Relative `.js` imports under node16 resolution (no `@/` alias). No `any`,
// no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useMachineStateStore } from './_machine-state-harness.js';
import { locateMachineState, locateHostState } from '../../src/machine-state/locate.js';
import { mintOrReadInstallationId } from '../../src/machine-state/identity.js';
import { deriveInstanceFields } from '../../src/machine-state/instance-id.js';
import { openTokenCustody } from '../../src/machine-state/token.js';
import { openEnrollmentCustody } from '../../src/machine-state/enrollment-custody.js';
import { runSidecarDaemon } from '../../src/sidecar/daemon.js';
import type { EnrollArgs, EnrollResult } from '../../src/sidecar/enroll-client.js';
import type { TelemetryPoster } from '../../src/sidecar/uplink/post.js';
import type { SseTransport } from '../../src/sidecar/uplink/transport.js';

/** Never touches the network: every POST (telemetry ingest, liveness) resolves
 * 200 immediately, so drain/liveness cadences never depend on a reachable
 * `planeUrl`. */
const fakePoster: TelemetryPoster = {
  post: async () => ({ status: 200, body: '{}' }),
};

/** Never touches the network: the SSE connect resolves to an already-empty
 * chunk stream, so the reconnect loop has nothing to read and nothing to
 * retry against a real socket. */
const fakeTransport: SseTransport = {
  connect: async () => ({
    status: 200,
    headers: new Map<string, string>(),
    chunks: (async function* (): AsyncIterable<Uint8Array> {
      /* no chunks */
    })(),
    close: (): void => undefined,
  }),
};

describe('sidecar daemon — auto-enroll on run (specs/036 Task 10)', () => {
  const store = useMachineStateStore();

  let daemon: { started: Promise<{ kind: string }>; stop(): Promise<void> } | undefined;

  afterEach(async () => {
    if (daemon !== undefined) {
      await daemon.stop();
      daemon = undefined;
    }
  });

  it('self-enrolls with the host credential when no telemetry token is provisioned, then persists the issued token', async () => {
    store();
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-auto-enroll-root-'));
    const location = locateMachineState(installationRoot);
    const installationId = mintOrReadInstallationId(installationRoot);
    const { host, path } = deriveInstanceFields(installationRoot);

    // Provision the HOST-level enrollment credential (Task 4/8's custody) —
    // shared across every installation on the host. Deliberately do NOT write
    // a telemetry token: that is exactly the "credential but no token" state
    // auto-enroll must detect.
    openEnrollmentCustody(locateHostState().durableDir).write('cred-1');
    expect(openTokenCustody(location.durableDir).read()).toBeUndefined();

    const calls: EnrollArgs[] = [];
    const fakeEnroll = async (args: EnrollArgs): Promise<EnrollResult> => {
      calls.push(args);
      return { ok: true, token: 'issued-token-1' };
    };

    const planeUrl = 'http://plane.invalid';
    const handle = runSidecarDaemon({
      installationRoot,
      planeUrl,
      drainIntervalMs: 5,
      livenessIntervalMs: 5,
      enroll: fakeEnroll,
      poster: fakePoster,
      transport: fakeTransport,
    });
    daemon = handle;

    const start = await handle.started;
    expect(start.kind).toBe('won');

    // The enroll seam was called exactly once, with the derived identity —
    // never re-derived or hardcoded, the SAME installationId/host/path this
    // installation's other identity-bearing calls use.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      planeUrl,
      credential: 'cred-1',
      identity: { installationId, host, path },
    });

    // The issued token is now readable from the SAME custody every other
    // token-consuming path reads (drain-loop bearer header, etc).
    expect(openTokenCustody(location.durableDir).read()).toBe('issued-token-1');

    rmSync(installationRoot, { recursive: true, force: true });
  });

  it('does NOT auto-enroll when no host enrollment credential is provisioned — uplink stays idle, no crash', async () => {
    store();
    const installationRoot = mkdtempSync(join(tmpdir(), 'scf-sidecar-auto-enroll-root-'));
    const location = locateMachineState(installationRoot);

    // No enrollment credential written at all.
    expect(openEnrollmentCustody(locateHostState().durableDir).read()).toBeUndefined();
    expect(openTokenCustody(location.durableDir).read()).toBeUndefined();

    const calls: EnrollArgs[] = [];
    const fakeEnroll = async (args: EnrollArgs): Promise<EnrollResult> => {
      calls.push(args);
      return { ok: true, token: 'should-never-be-issued' };
    };

    const handle = runSidecarDaemon({
      installationRoot,
      planeUrl: 'http://plane.invalid',
      drainIntervalMs: 5,
      livenessIntervalMs: 5,
      enroll: fakeEnroll,
      poster: fakePoster,
      transport: fakeTransport,
    });
    daemon = handle;

    const start = await handle.started;
    expect(start.kind).toBe('won');

    expect(calls).toHaveLength(0);
    expect(openTokenCustody(location.durableDir).read()).toBeUndefined();

    rmSync(installationRoot, { recursive: true, force: true });
  });
});
