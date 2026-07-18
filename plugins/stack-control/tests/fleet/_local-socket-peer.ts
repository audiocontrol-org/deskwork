// specs/036-fleet-control-plane — test helper for T031/T032 (fail-open emit
// client). NOT a test (leading underscore keeps vitest from collecting it).
//
// WHY A REAL UDS PEER, NOT THE _server-fixture (contracts/local-socket-
// protocol.md § Test obligations, .claude/rules/testing.md "a mock cannot be
// cruel"): the emit client (src/telemetry/emit.ts, T039) talks ONLY to the
// LOCAL socket — a unix-domain socket / named pipe — never the WAN. The
// existing `_server-fixture.ts` is a `node:http` server for the sidecar↔plane
// SSE uplink (TCP), which is a DIFFERENT transport; it cannot stand in for the
// local UDS the emit client uses. So this helper starts a REAL `node:net` UDS
// server that can be commanded into one of two modes:
//
//   - 'ack':   accepts, reads newline-delimited frames, records them, and
//              answers an incoming `hello` with a `hello-ack` — a well-behaved
//              sidecar, used for the "normal speed" baseline + delivery proof.
//   - 'stall': accepts the connection and then goes SILENT FOREVER — no reply,
//              no `end()`, no socket close. This is the cruelty T032 needs: a
//              peer that stalls WITHOUT EOF, exactly the condition that would
//              hang an emit client that (wrongly) `await`ed a response. A mock
//              cannot reproduce "accepted then silent, never closing".
//
// Teardown force-destroys any still-open sockets (a stalled peer never ends on
// its own, so a bare `server.close()` would hang) — mirrors _server-fixture's
// trackSockets pattern.
//
// Real sockets + real temp dirs; relative `.js` imports under node16 (no `@/`
// alias configured for this plugin — matches the sibling fleet fixtures).

import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '../../src/fleet/clock.js';
import { constructEnvelope, type EnvelopeInput, type TelemetryEvent } from '../../src/fleet/event.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import {
  LOCAL_PROTOCOL_VERSION,
  buildHelloAckFrame,
  parseCliToSidecarFrame,
  serializeFrame,
  splitFrameLines,
  type HelloFrame,
} from '../../src/telemetry/protocol.js';

/** How the peer behaves for every connection it accepts.
 *   - 'ack':      well-behaved sidecar — answers `hello` with a MATCHING `hello-ack`.
 *   - 'stall':    accepts, then goes silent forever (the T032 cruelty).
 *   - 'mismatch': answers `hello` with a version-MISMATCHED `hello-ack`, driving
 *                 the C3 restart path — used by the AUDIT-20260717-02 retention test. */
export type PeerMode = 'ack' | 'stall' | 'mismatch';

/** A sidecar protocol version deliberately different from the CLI's local one,
 * so its `hello-ack` is interpreted as a mismatch (C3). */
const MISMATCH_PROTOCOL_VERSION = LOCAL_PROTOCOL_VERSION + 1000;

/** A running real-UDS peer plus everything a test needs to drive + inspect it. */
export interface LocalSocketPeer {
  /** The bound UDS socket path (short — stays within the macOS sun_path budget). */
  readonly socketPath: string;
  /** Every complete newline-delimited line received from clients, in order.
   * A live (non-frozen) reference — re-read after driving more traffic. */
  readonly receivedLines: readonly string[];
  /** How many connections the peer has accepted so far. */
  connectionCount(): number;
  /** Tears the peer down, force-destroying any socket a 'stall' connection
   * left open (otherwise `server.close()` waits forever). Idempotent. */
  close(): Promise<void>;
}

// /tmp is short + POSIX-guaranteed; macOS os.tmpdir() (/var/folders/…) is deep
// enough to blow the 103-byte UDS budget for a nested socket path. The fleet
// harness roots its runtime dirs at /tmp for the same reason.
function shortTmpBase(): string {
  return process.platform === 'win32' ? tmpdir() : '/tmp';
}

/** A deterministic `Clock` — same shape used across tests/fleet/*.test.ts. */
class FakeClock implements Clock {
  constructor(
    private readonly wall: string,
    private readonly mono: number,
  ) {}
  nowIso(): string {
    return this.wall;
  }
  monotonicNowMs(): number {
    return this.mono;
  }
}

/** Build a representative, well-formed `TelemetryEvent` for a test to emit.
 * `runId` defaults to a fresh id (a commandable run); pass `null` for a
 * non-run short verb. */
export function makeTelemetryEvent(runId: string | null = mintUuidV7()): TelemetryEvent {
  const clock = new FakeClock('2026-07-17T00:00:00.000Z', 1000);
  const input: EnvelopeInput = {
    installationId: mintInstallationId(),
    invocationId: mintUuidV7(),
    runId,
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 1,
    type: 'run.started',
    classification: 'durable',
  };
  return {
    envelope: constructEnvelope(clock, 900, input),
    snapshot: { note: 'representative snapshot payload' },
  };
}

/** Poll `pred` until it is true or `timeoutMs` elapses. Uses a real timer (no
 * fake timers — the point is real wall-clock), so it composes with the
 * emit client's real async socket lifecycle. */
export async function waitUntil(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitUntil: predicate still false after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function trackSockets(server: Server): Set<Socket> {
  const sockets = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return sockets;
}

/** Starts a real `node:net` UDS peer in `mode`, bound at a short temp path.
 * Resolves once the peer is actually listening. */
export async function startLocalSocketPeer(mode: PeerMode): Promise<LocalSocketPeer> {
  const dir = mkdtempSync(join(shortTmpBase(), `scf-peer-${process.pid}-`));
  const socketPath = join(dir, 'p.sock');
  const receivedLines: string[] = [];
  let connections = 0;

  const server = createServer((socket: Socket) => {
    connections += 1;
    socket.setEncoding('utf8');
    if (mode === 'stall') {
      // Accept, then go silent FOREVER — no read handling that replies, no
      // write, no end(), no close. The cruelty T032 exists to survive.
      return;
    }
    // 'ack' / 'mismatch' mode: read frames, record them, answer a hello with a
    // hello-ack. 'ack' matches the CLI's version; 'mismatch' answers with a
    // deliberately-different sidecar version so the CLI sees a C3 mismatch.
    let buffered = '';
    socket.on('data', (chunk: string) => {
      buffered += chunk;
      const { complete, remainder } = splitFrameLines(buffered);
      buffered = remainder;
      for (const line of complete) {
        receivedLines.push(line);
        const parsed = parseCliToSidecarFrame(line);
        if (parsed.ok && parsed.frame.kind === 'hello') {
          const hello: HelloFrame = parsed.frame;
          const ackVersion = mode === 'mismatch' ? MISMATCH_PROTOCOL_VERSION : LOCAL_PROTOCOL_VERSION;
          socket.write(serializeFrame(buildHelloAckFrame(hello, ackVersion)));
        }
      }
    });
    socket.on('error', () => {
      /* a client that severs mid-frame is expected — never crash the peer. */
    });
  });

  const sockets = trackSockets(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  let closed = false;
  return {
    socketPath,
    receivedLines,
    connectionCount: () => connections,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
