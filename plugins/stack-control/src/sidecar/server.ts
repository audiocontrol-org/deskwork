/**
 * specs/036-fleet-control-plane — T041 + T043 (impl), pairs with T035's
 * spawn-race RED test and T036's stale-lock RED test.
 *
 * THE SIDECAR LISTENER + BIND-WINS ELECTION + STALE-SOCKET RECOVERY.
 * (contracts/local-socket-protocol.md § C6 / § Transport, research.md
 * PT-002 + PT-001 — SETTLED, not re-derived here.)
 *
 * ELECTION IS BIND-WINS (T041). Whoever successfully binds the UDS socket /
 * named pipe at the located path IS the sidecar. `bind(2)` is atomic at the
 * OS level, which is what makes the election AUTHORITATIVE rather than
 * advisory — Node has NO native `flock`, so an advisory lock would race;
 * the bind cannot. On `EADDRINUSE` this process LOST the election → it
 * returns a `{ kind: 'lost' }` VALUE and the caller exits SILENTLY. Losing
 * is normal and quiet; it is NEVER a thrown error. A genuine bind fault
 * (EACCES, a missing 0700 parent dir, …) is a different thing and DOES
 * throw (fail loud, .claude rules) — only losing is silent.
 *
 * STALE-SOCKET RECOVERY (T043). A leftover socket FILE with no listener
 * behind it makes `bind` fail `EADDRINUSE` too (the inode exists), but a
 * `connect` to it yields `ECONNREFUSED` — no process is accepting. That is
 * the stale condition. Recovery verifies the PRIOR OWNER's liveness via
 * `ProcessProbe` (PID + process START-TIME — start-time defeats PID reuse,
 * so a recycled PID reports a different start-time and is NEVER mistaken for
 * a live sidecar), then unlinks the stale inode and re-binds. If the prior
 * owner is GENUINELY alive (start-time matches), the contract says DEFER —
 * lose silently rather than steal a live sidecar's endpoint.
 *
 * SCOPE (per the task pairing): the listener + election + recovery ONLY.
 * This module does NOT spawn the sidecar (`spawn.ts`, T042), does NOT
 * implement the emit client (`emit.ts`, T039), the bounded buffer
 * (`buffer.ts`, T040), or the spool/plane. It IMPORTS the protocol (T038),
 * `ProcessProbe` (T006), and `locateMachineState` (T024); it re-implements
 * none of them. The winner speaks the protocol handshake (answers an
 * incoming `hello` with a `hello-ack`) because C6 says the elected sidecar
 * starts listening and speaks the protocol — that is the one protocol
 * behavior in scope here.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI): every
 * `unknown` is narrowed with a user-defined type guard. Relative `.js`
 * imports under node16 resolution (no `@/` alias configured for this
 * plugin). Files 300-500 lines.
 */

import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { ProcessProbe, createSystemStartTimeSource, type ProcessIdentity } from '../fleet/process-probe.js';
import { locateMachineState } from '../machine-state/locate.js';
import {
  LOCAL_PROTOCOL_VERSION,
  buildHelloAckFrame,
  parseCliToSidecarFrame,
  serializeFrame,
  splitFrameLines,
} from '../telemetry/protocol.js';

// ---------------------------------------------------------------------------
// Owner registry — where the socket's owning process identity is recorded so
// a later process can decide, via ProcessProbe, whether a stale socket file's
// prior owner is genuinely alive or a recycled PID. The socket file itself
// carries no PID, so a companion record is the only way stale-recovery can
// tell "dead owner, safe to reclaim" from "live owner mid-restart, defer".
// ---------------------------------------------------------------------------

/**
 * Reads / persists / clears the identity of the process that owns the
 * socket. `read()` returns `undefined` when there is no (readable) record —
 * which stale-recovery treats as "cannot vouch the owner is alive", i.e.
 * safe to reclaim.
 */
export interface OwnerRegistry {
  read(): ProcessIdentity | undefined;
  write(identity: ProcessIdentity): void;
  clear(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Parse an owner-record JSON string into a `ProcessIdentity`, or
 * `undefined` for any malformed / partial content (total — never throws). */
function parseOwnerRecord(content: string): ProcessIdentity | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  const pid = raw.pid;
  const startTime = raw.startTime;
  if (typeof pid !== 'number' || typeof startTime !== 'string') return undefined;
  return { pid, startTime };
}

/**
 * A file-backed owner registry. The record lives beside the socket (in the
 * same 0700 parent dir), written `0600` as defense-in-depth. A missing /
 * unreadable / malformed file reads as `undefined` — the fail-safe-toward-
 * recovery default.
 */
export function createFileOwnerRegistry(ownerFilePath: string): OwnerRegistry {
  return {
    read(): ProcessIdentity | undefined {
      let content: string;
      try {
        content = readFileSync(ownerFilePath, 'utf8');
      } catch {
        return undefined;
      }
      return parseOwnerRecord(content);
    },
    write(identity: ProcessIdentity): void {
      writeFileSync(
        ownerFilePath,
        JSON.stringify({ pid: identity.pid, startTime: identity.startTime }),
        { mode: 0o600 },
      );
    },
    clear(): void {
      try {
        unlinkSync(ownerFilePath);
      } catch {
        /* already gone — clearing an absent record is a no-op success. */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The elected sidecar server + the election outcome.
// ---------------------------------------------------------------------------

/** A running, elected sidecar: a bound + listening endpoint speaking the
 * protocol handshake, plus a `close()` that tears it down and clears its
 * owner record + socket inode. */
export interface SidecarServer {
  readonly socketPath: string;
  /** Idempotent teardown: destroys open peers, closes the listener, then
   * clears the owner record and unlinks the socket. */
  close(): Promise<void>;
}

/** Why a process lost the election (both mean "exit silently"). */
export type LossReason = 'address-in-use' | 'live-owner';

export interface ElectionWon {
  readonly kind: 'won';
  readonly server: SidecarServer;
  readonly socketPath: string;
}

export interface ElectionLost {
  readonly kind: 'lost';
  readonly reason: LossReason;
}

/** The election result. Winning yields a live `SidecarServer`; losing is a
 * VALUE the caller acts on by exiting silently — never a thrown error. */
export type ElectionOutcome = ElectionWon | ElectionLost;

export interface ElectionConfig {
  /** The resolved UDS / named-pipe path. Its 0700 parent MUST already exist
   * (locate.ts owns dir creation) — a missing parent is a genuine fault
   * that throws, not a lost election. */
  readonly socketPath: string;
  /** Liveness oracle for the prior owner (PID + start-time). */
  readonly probe: ProcessProbe;
  /** This process's own identity, recorded on a winning bind so a future
   * process's stale-recovery can probe THIS owner's liveness. */
  readonly selfIdentity: ProcessIdentity;
  /** Where the owner identity is recorded / read for stale-recovery. */
  readonly ownerRegistry: OwnerRegistry;
  /** Protocol version the winner answers `hello` with. Defaults to the
   * build's `LOCAL_PROTOCOL_VERSION`. */
  readonly localVersion?: number;
  /** Bounded stale-recovery re-bind attempts before conceding to persistent
   * contention (and losing silently). Defaults to 3. */
  readonly maxRecoveryAttempts?: number;
}

type BindResult =
  | { readonly kind: 'bound'; readonly server: Server }
  | { readonly kind: 'error'; readonly code: string };

/** One real `net.Server.listen()` attempt. Resolves `bound` on success or
 * `error` with the OS error code (e.g. `EADDRINUSE`) on failure — never
 * rejects, so the election drives it as a value. */
function tryBind(socketPath: string): Promise<BindResult> {
  return new Promise((resolve) => {
    const server = createServer();
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      server.close();
      resolve({ kind: 'error', code: err.code ?? 'UNKNOWN' });
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolve({ kind: 'bound', server });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(socketPath);
  });
}

/** A real `connect` probe against an existing socket path. Resolves
 * `'connected'` if a listener accepts, otherwise the connect error (its
 * `code` is `ECONNREFUSED` for a stale, listener-less inode). Never
 * rejects. */
function probeConnect(socketPath: string): Promise<'connected' | NodeJS.ErrnoException> {
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    const onConnect = (): void => {
      socket.removeListener('error', onError);
      socket.destroy();
      resolve('connected');
    };
    const onError = (err: NodeJS.ErrnoException): void => {
      socket.removeListener('connect', onConnect);
      socket.destroy();
      resolve(err);
    };
    socket.once('connect', onConnect);
    socket.once('error', onError);
  });
}

/** Best-effort unlink of a stale socket inode — a concurrent recoverer may
 * have already removed it, which is not an error. */
function unlinkStaleSocket(socketPath: string): void {
  try {
    rmSync(socketPath, { force: true });
  } catch {
    /* best-effort; another recoverer winning the unlink race is fine. */
  }
}

/**
 * Wrap a freshly-bound `net.Server` as a `SidecarServer` that speaks the
 * protocol handshake: for each connection it reads newline-delimited frames
 * and answers an incoming `hello` with a `hello-ack` (C3 / C6). A peer that
 * dies mid-frame must never crash the sidecar — connection errors are
 * swallowed per-socket.
 */
function makeSidecarServer(
  server: Server,
  socketPath: string,
  ownerRegistry: OwnerRegistry,
  localVersion: number,
): SidecarServer {
  const openSockets = new Set<Socket>();

  server.on('connection', (socket: Socket) => {
    openSockets.add(socket);
    socket.setEncoding('utf8');
    let buffered = '';
    socket.on('data', (chunk: string) => {
      buffered += chunk;
      const { complete, remainder } = splitFrameLines(buffered);
      buffered = remainder;
      for (const line of complete) {
        const parsed = parseCliToSidecarFrame(line);
        if (parsed.ok && parsed.frame.kind === 'hello') {
          socket.write(serializeFrame(buildHelloAckFrame(parsed.frame, localVersion)));
        }
      }
    });
    socket.on('error', () => {
      /* a peer that severs the connection mid-frame is expected (C5) — it
         must not take the sidecar down. */
    });
    socket.on('close', () => {
      openSockets.delete(socket);
    });
  });

  // A dead peer / listener-level error must not crash the process either.
  server.on('error', () => {
    /* swallowed: a transport-level listener error is not fatal to election
       correctness; the winner remains bound until close(). */
  });

  let closed = false;
  return {
    socketPath,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const socket of openSockets) {
        socket.destroy();
      }
      openSockets.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      ownerRegistry.clear();
      unlinkStaleSocket(socketPath);
    },
  };
}

/**
 * Run the bind-wins election at `config.socketPath`, recovering a stale
 * socket if one is found.
 *
 * Algorithm (research.md PT-002):
 *   1. Try to bind. Success ⇒ WON — record self as owner, start listening.
 *   2. `EADDRINUSE` ⇒ the path is already held. Connect to it:
 *      - connect succeeds ⇒ a LIVE sidecar answers ⇒ LOST (`live-owner`).
 *      - `ECONNREFUSED` ⇒ no listener — a stale inode. Probe the recorded
 *        owner's liveness (PID + start-time):
 *          - owner genuinely alive ⇒ LOST (`live-owner`) — do not steal.
 *          - owner dead / recycled-PID / no record ⇒ unlink + re-bind (loop).
 *   3. Any other bind error is a genuine fault ⇒ throw (fail loud).
 *   4. Bounded recovery attempts guard against a livelock of concurrent
 *      recoverers; on exhaustion, LOST (`address-in-use`).
 */
export async function electSidecar(config: ElectionConfig): Promise<ElectionOutcome> {
  const localVersion = config.localVersion ?? LOCAL_PROTOCOL_VERSION;
  const maxRecoveryAttempts = config.maxRecoveryAttempts ?? 3;

  for (let attempt = 0; attempt <= maxRecoveryAttempts; attempt += 1) {
    const bind = await tryBind(config.socketPath);
    if (bind.kind === 'bound') {
      config.ownerRegistry.write(config.selfIdentity);
      const server = makeSidecarServer(bind.server, config.socketPath, config.ownerRegistry, localVersion);
      return { kind: 'won', server, socketPath: config.socketPath };
    }

    if (bind.code !== 'EADDRINUSE') {
      // A missing 0700 parent (ENOENT), permission denial (EACCES), etc. is a
      // genuine fault, NOT a lost election — fail loud rather than silently.
      throw new Error(
        `sidecar election: bind to ${config.socketPath} failed with ${bind.code} — ` +
          'this is a genuine fault (e.g. a missing 0700 parent dir or a permission ' +
          'denial), not a lost election. locate.ts owns creating the parent dir.',
      );
    }

    // The path is held. Is there a LIVE listener behind it?
    const connect = await probeConnect(config.socketPath);
    if (connect === 'connected') {
      return { kind: 'lost', reason: 'live-owner' };
    }
    if (connect.code === 'ENOENT') {
      // The inode vanished between our bind and connect (a concurrent
      // recoverer unlinked it) — just retry the bind.
      continue;
    }
    if (connect.code !== 'ECONNREFUSED') {
      throw new Error(
        `sidecar election: connect probe to ${config.socketPath} failed with ` +
          `${connect.code ?? 'UNKNOWN'} — expected ECONNREFUSED for a stale socket ` +
          'or a successful connect for a live one; this is an unexpected fault.',
      );
    }

    // ECONNREFUSED ⇒ no listener. Verify the prior owner's liveness by
    // PID + start-time. A recycled PID reports a DIFFERENT start-time, so
    // isAlive() is false — it is NEVER mistaken for a live sidecar.
    const owner = config.ownerRegistry.read();
    if (owner !== undefined && config.probe.isAlive(owner)) {
      // The owner process is genuinely alive (e.g. mid-restart). Defer —
      // stealing a live sidecar's endpoint is the failure PT-002 forbids.
      return { kind: 'lost', reason: 'live-owner' };
    }

    // Stale: no live listener AND (no record | dead owner | recycled PID).
    // Reclaim the inode and re-bind on the next loop iteration.
    unlinkStaleSocket(config.socketPath);
    config.ownerRegistry.clear();
  }

  // Persistent contention across every recovery attempt — concede silently.
  return { kind: 'lost', reason: 'address-in-use' };
}

/**
 * Convenience entry: resolve the socket path (and create its 0700 parent)
 * for `installationRoot` via `locateMachineState`, then run the election
 * with the system `ProcessProbe` and a file-backed owner registry beside
 * the socket. This is the production wiring; tests drive `electSidecar`
 * directly with injected dependencies.
 *
 * On a platform without a verified start-time source (e.g. Windows),
 * `createSystemStartTimeSource` fails loud — callers there must build their
 * own `ProcessProbe` and call `electSidecar` directly.
 */
export async function electSidecarForInstallation(installationRoot: string): Promise<ElectionOutcome> {
  const located = locateMachineState(installationRoot);
  const probe = new ProcessProbe(createSystemStartTimeSource());
  const selfIdentity = probe.capture(process.pid);
  if (selfIdentity === undefined) {
    throw new Error(
      `sidecar election: could not capture this process's own identity (pid ${process.pid}) — ` +
        'the ProcessProbe start-time source returned nothing for the running process, ' +
        'which should be impossible; refusing to elect without a recordable owner identity.',
    );
  }
  return electSidecar({
    socketPath: located.socketPath,
    probe,
    selfIdentity,
    ownerRegistry: createFileOwnerRegistry(`${located.socketPath}.owner`),
  });
}
