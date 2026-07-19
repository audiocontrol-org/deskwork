/**
 * specs/036-fleet-control-plane — T035 (RED), PT-002 / contracts/
 * local-socket-protocol.md § C6 (Spawn, bind-wins election).
 *
 * THE CONTRACT UNDER TEST (SETTLED, not re-derived here): election is
 * BIND-WINS. Whoever successfully binds the UDS socket IS the sidecar;
 * `EADDRINUSE` means someone else already bound → this process LOST → it
 * exits silently (a returned VALUE, never a thrown error — losing is
 * normal). Binding is atomic at the OS level, which is what makes the
 * election AUTHORITATIVE rather than advisory (research.md PT-002).
 *
 * WHY REAL SOCKETS, NOT MOCKS: a mock cannot race a real `bind(2)`. The
 * only honest proof that exactly ONE of N concurrent invocations wins is N
 * REAL `net.Server.listen()` attempts against the SAME redirected socket
 * path, letting the OS serialize the bind. One binds; the rest get
 * `EADDRINUSE` (or connect to the live winner) and lose. This file drives
 * that real race and asserts EXACTLY ONE winner + a functional listener.
 *
 * Store is redirected via the T009 harness (`useMachineStateStore`) so no
 * real `$HOME`/`$TMPDIR` identity is touched; the socket path is resolved
 * through the real `locateMachineState` (T024) — same path the harness's
 * `socketPathFor` models — which also creates the 0700 parent dir.
 *
 * Relative `.js` imports under node16 resolution (no `@/` alias); real
 * sockets/processes, no vitest fake timers.
 */

import { createConnection } from 'node:net';
import { describe, expect, it } from 'vitest';
import { ProcessProbe, createSystemStartTimeSource } from '../../src/fleet/process-probe.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import {
  LOCAL_PROTOCOL_VERSION,
  buildHelloFrame,
  parseSidecarToCliFrame,
  serializeFrame,
  splitFrameLines,
} from '../../src/telemetry/protocol.js';
import {
  createFileOwnerRegistry,
  electSidecar,
  type ElectionOutcome,
  type SidecarServer,
} from '../../src/sidecar/server.js';
import { useMachineStateStore } from './_machine-state-harness.js';

/** Connects to the elected sidecar and performs the protocol `hello` /
 * `hello-ack` handshake — proof the winner is a REAL, listening sidecar
 * that speaks the protocol, not merely a bound-but-dead inode. */
function helloHandshake(
  socketPath: string,
): Promise<{ accepted: boolean; sidecarProtocolVersion: number }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.once('connect', () => {
      socket.write(serializeFrame(buildHelloFrame(LOCAL_PROTOCOL_VERSION)));
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const { complete, remainder } = splitFrameLines(buffer);
      buffer = remainder;
      for (const line of complete) {
        const parsed = parseSidecarToCliFrame(line);
        if (parsed.ok && parsed.frame.kind === 'hello-ack') {
          socket.destroy();
          resolve({
            accepted: parsed.frame.accepted,
            sidecarProtocolVersion: parsed.frame.sidecarProtocolVersion,
          });
          return;
        }
      }
    });
    socket.once('error', (err: Error) => {
      socket.destroy();
      reject(err);
    });
  });
}

describe('bind-wins election: N concurrent invocations elect EXACTLY ONE sidecar (T035, PT-002 / C6)', () => {
  const store = useMachineStateStore();

  it('exactly one of N concurrent bind attempts wins; the rest lose silently and none throw', async () => {
    const installationRoot = store().root;
    const located = locateMachineState(installationRoot);
    const socketPath = located.socketPath;

    const probe = new ProcessProbe(createSystemStartTimeSource());
    const selfIdentity = probe.capture(process.pid);
    if (selfIdentity === undefined) {
      throw new Error('could not capture this process identity via the real ProcessProbe');
    }

    const N = 12;
    // N REAL, concurrent elections racing the SAME socket path. Promise.all
    // rejecting would itself be a failure of the contract ("all invocations
    // unaffected" — losing the election is a value, never a throw).
    const outcomes: ElectionOutcome[] = await Promise.all(
      Array.from({ length: N }, () =>
        electSidecar({
          socketPath,
          probe,
          selfIdentity,
          ownerRegistry: createFileOwnerRegistry(`${socketPath}.owner`),
        }),
      ),
    );

    let winner: SidecarServer | undefined;
    let wonCount = 0;
    let lostCount = 0;
    for (const outcome of outcomes) {
      if (outcome.kind === 'won') {
        wonCount += 1;
        winner = outcome.server;
      } else {
        lostCount += 1;
      }
    }

    expect(wonCount).toBe(1);
    expect(lostCount).toBe(N - 1);
    if (winner === undefined) {
      throw new Error('no election winner — expected exactly one');
    }

    try {
      // The single winner is a genuinely-listening sidecar: it accepts a
      // connection and answers the version handshake. A second "sidecar"
      // would have had to win a second bind, which the OS forbids.
      const ack = await helloHandshake(socketPath);
      expect(ack.accepted).toBe(true);
      expect(ack.sidecarProtocolVersion).toBe(LOCAL_PROTOCOL_VERSION);
    } finally {
      await winner.close();
    }
  });
});
