/**
 * specs/036-fleet-control-plane — T138 (RED), FR-009 / contracts/
 * local-socket-protocol.md § C6 (Spawn, bind-wins election).
 *
 * THE CONTRACT UNDER TEST (FR-009 — "The sidecar MUST be runnable under
 * external supervision (e.g. launchd/systemd) as an alternative to
 * auto-spawn, without changing the local contract"): a supervisor (launchd/
 * systemd) starts the sidecar as a foreground, long-lived process instead of
 * the CLI's detached self-spawn (`spawn.ts`, T042). The distinction is the
 * START path — foreground-under-supervisor vs. detached-self-spawn — NOT the
 * socket protocol. Both paths MUST reach the identical bind-wins election
 * (`electSidecar`, T041/T043) and serve the identical wire protocol.
 *
 * `runSidecarSupervised` (src/sidecar/supervised.ts, this task's impl) is the
 * thin wrapper a supervised, foreground invocation uses: it runs the SAME
 * `electSidecar` election `spawn-race.test.ts`/`stale-lock.test.ts` already
 * pin, then — ONLY on a win — arms a graceful-shutdown seam (SIGTERM/SIGINT
 * under a real supervisor; an injected fake `ShutdownSignalSource` here,
 * since a test process must never wire real process signals onto itself)
 * that closes the server when the supervisor asks it to stop. A loss
 * resolves immediately with nothing to shut down, mirroring "the loser exits
 * silently" (C6).
 *
 * WHY REAL SOCKETS, NOT MOCKS: as in spawn-race.test.ts/stale-lock.test.ts, a
 * mock cannot race a real `bind(2)` or prove a real listener answers the
 * protocol handshake. This file drives real UDS sockets via the T009 store
 * harness; only the shutdown SIGNAL SOURCE is faked (see above — the thing
 * that must never be real is delivering an actual OS signal to the test
 * runner's own process).
 *
 * Relative `.js` imports under node16 resolution (no `@/` alias); real
 * sockets/processes, no vitest fake timers.
 */

import { createConnection } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
import { createFileOwnerRegistry, electSidecar } from '../../src/sidecar/server.js';
import {
  runSidecarSupervised,
  type ShutdownSignalSource,
} from '../../src/sidecar/supervised.js';
import { useMachineStateStore } from './_machine-state-harness.js';

/** Connects to a sidecar socket and performs the protocol `hello` /
 * `hello-ack` handshake, returning the exact acked shape — proof the peer at
 * `socketPath` is a REAL, listening sidecar that speaks the protocol.
 * Mirrors spawn-race.test.ts's `helloHandshake` byte-for-byte so a test can
 * assert the SAME shape comes back regardless of which start path produced
 * the listener (FR-009's "without changing the local contract"). */
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

/** A fake `ShutdownSignalSource` a test fully controls: `trigger()` invokes
 * whatever handler `runSidecarSupervised` registered, standing in for a real
 * supervisor delivering SIGTERM/SIGINT. Registering more than one handler
 * would be a bug in the caller, so a second `onShutdown` call throws loud
 * rather than silently dropping the first. */
function fakeShutdownSignalSource(): {
  readonly source: ShutdownSignalSource;
  trigger(): void;
} {
  let handler: (() => void) | undefined;
  return {
    source: {
      onShutdown(next: () => void): void {
        if (handler !== undefined) {
          throw new Error('fakeShutdownSignalSource: onShutdown registered more than once');
        }
        handler = next;
      },
    },
    trigger(): void {
      if (handler === undefined) {
        throw new Error('fakeShutdownSignalSource: trigger() called before onShutdown()');
      }
      handler();
    },
  };
}

describe('supervised (foreground) sidecar reaches the identical socket contract as bind-wins election (T138, FR-009)', () => {
  const store = useMachineStateStore();

  it('(a) a supervised sidecar binds the socket and serves the same handshake contract as a direct election winner', async () => {
    const s = store();
    const located = locateMachineState(s.root);
    const probe = new ProcessProbe(createSystemStartTimeSource());
    const selfIdentity = probe.capture(process.pid);
    if (selfIdentity === undefined) {
      throw new Error('could not capture this process identity via the real ProcessProbe');
    }

    const shutdown = fakeShutdownSignalSource();
    const result = await runSidecarSupervised(
      {
        socketPath: located.socketPath,
        probe,
        selfIdentity,
        ownerRegistry: createFileOwnerRegistry(`${located.socketPath}.owner`),
      },
      shutdown.source,
    );

    expect(result.outcome.kind).toBe('won');
    if (result.outcome.kind !== 'won') return;

    try {
      const ack = await helloHandshake(located.socketPath);
      expect(ack.accepted).toBe(true);
      expect(ack.sidecarProtocolVersion).toBe(LOCAL_PROTOCOL_VERSION);
    } finally {
      shutdown.trigger();
      await result.shutdown;
    }
  });

  it('(b) with a supervised instance holding the socket, a second (auto-spawn-style) bind attempt loses and does not disturb it', async () => {
    const s = store();
    const located = locateMachineState(s.root);
    const probe = new ProcessProbe(createSystemStartTimeSource());
    const selfIdentity = probe.capture(process.pid);
    if (selfIdentity === undefined) {
      throw new Error('could not capture this process identity via the real ProcessProbe');
    }
    const ownerRegistry = createFileOwnerRegistry(`${located.socketPath}.owner`);

    const shutdown = fakeShutdownSignalSource();
    const supervised = await runSidecarSupervised(
      { socketPath: located.socketPath, probe, selfIdentity, ownerRegistry },
      shutdown.source,
    );
    expect(supervised.outcome.kind).toBe('won');
    if (supervised.outcome.kind !== 'won') return;

    try {
      // An auto-spawn-style attempt (a second process racing the same path,
      // represented — as in spawn-race.test.ts — by a direct `electSidecar`
      // call) MUST lose against the live supervised listener, never steal it.
      const secondSelfIdentity = probe.capture(process.pid);
      if (secondSelfIdentity === undefined) {
        throw new Error('could not capture a second identity for the racing attempt');
      }
      const raced = await electSidecar({
        socketPath: located.socketPath,
        probe,
        selfIdentity: secondSelfIdentity,
        ownerRegistry: createFileOwnerRegistry(`${located.socketPath}.owner`),
      });
      expect(raced.kind).toBe('lost');
      if (raced.kind === 'lost') {
        expect(raced.reason).toBe('live-owner');
      }

      // The supervised instance is undisturbed: it still answers the
      // handshake normally after the losing race.
      const ack = await helloHandshake(located.socketPath);
      expect(ack.accepted).toBe(true);
      expect(ack.sidecarProtocolVersion).toBe(LOCAL_PROTOCOL_VERSION);
    } finally {
      shutdown.trigger();
      await supervised.shutdown;
    }
  });

  it('(c) the frame shapes/handshake are identical whether the winner came from runSidecarSupervised or a direct electSidecar call', async () => {
    const s = store();
    const probe = new ProcessProbe(createSystemStartTimeSource());

    // Two INDEPENDENT installations (distinct socket paths) so both winners
    // can be live at once — this isolates "is the protocol identical" from
    // "who wins the election", which (a)/(b) already cover. `locateMachineState`
    // resolves `realpath.native(installationRoot)`, which requires the root to
    // actually exist on disk — mint two real dirs under the redirected store.
    const supervisedRoot = join(s.root, 'installation-supervised');
    const autoSpawnRoot = join(s.root, 'installation-autospawn');
    mkdirSync(supervisedRoot, { recursive: true });
    mkdirSync(autoSpawnRoot, { recursive: true });
    const supervisedLocated = locateMachineState(supervisedRoot);
    const autoSpawnLocated = locateMachineState(autoSpawnRoot);

    const supervisedIdentity = probe.capture(process.pid);
    const autoSpawnIdentity = probe.capture(process.pid);
    if (supervisedIdentity === undefined || autoSpawnIdentity === undefined) {
      throw new Error('could not capture this process identity via the real ProcessProbe');
    }

    const shutdown = fakeShutdownSignalSource();
    const supervised = await runSidecarSupervised(
      {
        socketPath: supervisedLocated.socketPath,
        probe,
        selfIdentity: supervisedIdentity,
        ownerRegistry: createFileOwnerRegistry(`${supervisedLocated.socketPath}.owner`),
      },
      shutdown.source,
    );
    // The auto-spawn path (per spawn-race.test.ts's own convention) is
    // represented by a direct `electSidecar` call — the function
    // `spawnDetachedSidecar` (T042) itself is a pure OS-spawn primitive with
    // no election logic of its own; the elected listener it eventually
    // starts (once T044 wires the child's entrypoint) is this same function.
    const autoSpawned = await electSidecar({
      socketPath: autoSpawnLocated.socketPath,
      probe,
      selfIdentity: autoSpawnIdentity,
      ownerRegistry: createFileOwnerRegistry(`${autoSpawnLocated.socketPath}.owner`),
    });

    expect(supervised.outcome.kind).toBe('won');
    expect(autoSpawned.kind).toBe('won');
    if (supervised.outcome.kind !== 'won' || autoSpawned.kind !== 'won') return;

    try {
      const supervisedAck = await helloHandshake(supervisedLocated.socketPath);
      const autoSpawnedAck = await helloHandshake(autoSpawnLocated.socketPath);
      expect(supervisedAck).toEqual(autoSpawnedAck);
      expect(supervisedAck.sidecarProtocolVersion).toBe(LOCAL_PROTOCOL_VERSION);
    } finally {
      shutdown.trigger();
      await supervised.shutdown;
      await autoSpawned.server.close();
    }
  });

  it('a lost election resolves immediately with nothing to shut down (no shutdown handler ever armed)', async () => {
    const s = store();
    const located = locateMachineState(s.root);
    const probe = new ProcessProbe(createSystemStartTimeSource());
    const selfIdentity = probe.capture(process.pid);
    if (selfIdentity === undefined) {
      throw new Error('could not capture this process identity via the real ProcessProbe');
    }
    const ownerRegistry = createFileOwnerRegistry(`${located.socketPath}.owner`);

    // Win the socket directly first (not via runSidecarSupervised) so the
    // supervised attempt below is guaranteed to lose.
    const holder = await electSidecar({ socketPath: located.socketPath, probe, selfIdentity, ownerRegistry });
    expect(holder.kind).toBe('won');
    if (holder.kind !== 'won') return;

    try {
      const shutdown = fakeShutdownSignalSource();
      const secondIdentity = probe.capture(process.pid);
      if (secondIdentity === undefined) {
        throw new Error('could not capture a second identity');
      }
      const result = await runSidecarSupervised(
        {
          socketPath: located.socketPath,
          probe,
          selfIdentity: secondIdentity,
          ownerRegistry: createFileOwnerRegistry(`${located.socketPath}.owner`),
        },
        shutdown.source,
      );
      expect(result.outcome.kind).toBe('lost');
      // No handler was ever registered — triggering must throw per the fake's
      // own contract, proving runSidecarSupervised armed nothing to shut down.
      expect(() => shutdown.trigger()).toThrow();
      // shutdown resolves on its own without ever needing a trigger.
      await result.shutdown;
    } finally {
      await holder.server.close();
    }
  });

  it('graceful shutdown: the armed signal closes the server and frees the socket for a new winner', async () => {
    const s = store();
    const located = locateMachineState(s.root);
    const probe = new ProcessProbe(createSystemStartTimeSource());
    const selfIdentity = probe.capture(process.pid);
    if (selfIdentity === undefined) {
      throw new Error('could not capture this process identity via the real ProcessProbe');
    }
    const ownerRegistry = createFileOwnerRegistry(`${located.socketPath}.owner`);

    const shutdown = fakeShutdownSignalSource();
    const result = await runSidecarSupervised(
      { socketPath: located.socketPath, probe, selfIdentity, ownerRegistry },
      shutdown.source,
    );
    expect(result.outcome.kind).toBe('won');

    shutdown.trigger();
    await result.shutdown;

    // The socket is fully released: a fresh election on the same path wins
    // cleanly (no leftover inode / owner record blocking it).
    const nextIdentity = probe.capture(process.pid);
    if (nextIdentity === undefined) {
      throw new Error('could not capture a fresh identity for the re-election');
    }
    const next = await electSidecar({
      socketPath: located.socketPath,
      probe,
      selfIdentity: nextIdentity,
      ownerRegistry: createFileOwnerRegistry(`${located.socketPath}.owner`),
    });
    expect(next.kind).toBe('won');
    if (next.kind === 'won') {
      await next.server.close();
    }
  });
});
