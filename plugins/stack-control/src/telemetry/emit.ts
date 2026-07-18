/**
 * specs/036-fleet-control-plane — T039 (impl), pairs with T031's
 * `tests/fleet/fail-open.test.ts` and T032's `tests/fleet/fail-open-hang.test.ts`.
 *
 * THE HIGHEST-RISK FILE IN THE FEATURE: every `stackctl` invocation runs this
 * code. Its ONE job is to emit telemetry to the local sidecar WITHOUT EVER
 * degrading the tool it observes.
 *
 * THE CONSTRAINT THAT DOMINATES EVERYTHING (spec § "The constraint that
 * dominates every other"; plan.md § Complexity Tracking — the DECLARED,
 * bounded Principle-V violation): telemetry is NOT the verb's functionality.
 * The verb's contract — its output, exit code, and wall-clock — is UNCHANGED
 * whether or not anyone is observing. So when the sidecar is unreachable this
 * client SILENTLY continues; it does NOT raise a descriptive error (that would
 * convert an observability outage into a total tool outage, exactly the harm
 * forbidden). This silence is correct ONLY here, ONLY for the telemetry path.
 *
 * THE ASYNC MODEL — how every rule is guaranteed by construction:
 *
 *   - `emit()` is SYNCHRONOUS and returns `void`. There is no Promise a caller
 *     could `await`, so the mistake C1 forbids (blocking the invocation on
 *     socket state) is UNWRITABLE, mirroring `spawnDetachedSidecar`'s `void`.
 *   - The client NEVER awaits a connect, write flush, or peer reply. The socket
 *     lifecycle is entirely event-driven (`connect`/`data`/`error`/`close`);
 *     `emit()` inspects the CURRENT state and either writes now (connected) or
 *     holds-per-C4 (not connected) — it never blocks to change that state.
 *   - CONNECT FAILS INSTANTLY on absence: `createConnection` to a missing/
 *     listener-less UDS fires `error` on the next tick (ENOENT/ECONNREFUSED),
 *     never a hang. The `error` handler swallows it (fail-open), buffers future
 *     events, and triggers a spawn seam for NEXT time.
 *   - A STALLED PEER CANNOT BLOCK: nothing reads-then-waits. On `connect` we
 *     write `hello` + drain the buffer, fire-and-forget. The socket is
 *     `unref()`d, so a silent peer never keeps the process alive (T032).
 *   - The client talks ONLY to the LOCAL socket, NEVER the WAN/plane. Its only
 *     timers (`RECONNECT_DELAY_MS`, `CLOSE_FLUSH_GRACE_MS`) are `unref()`d
 *     background schedules — never a synchronous wait the invocation blocks on.
 *
 * BUFFERING ASYMMETRY (C4/FR-007) is delegated WHOLESALE to `buffer.ts` (T040):
 * a `'short-verb'` buffer DROPS on a not-connected socket; a `'long-run'` buffer
 * holds a bounded FIFO across a restart gap. This client only decides WHEN to
 * push and drains on (re)connect — it does not re-implement the drop-vs-bound
 * policy. EVERY failure path is silent + non-blocking.
 *
 * SCOPE: the emit client ONLY — not the CLI dispatcher (T044), the sidecar
 * listener/spool/plane, nor the spawn command (the `onSocketUnavailable` seam).
 * It imports the protocol (T038), buffer (T040), and `locateMachineState` (T024).
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative `.js`
 * imports under node16 resolution. File under the 500-line cap.
 */

import { createConnection, type Socket } from 'node:net';
import type { TelemetryEvent } from '../fleet/event.js';
import { locateMachineState } from '../machine-state/locate.js';
import { createEventBuffer, type CallerKind, type EventBuffer } from './buffer.js';
import {
  LOCAL_PROTOCOL_VERSION,
  buildEventFrame,
  buildHelloFrame,
  interpretHelloAck,
  parseSidecarToCliFrame,
  serializeFrame,
  splitFrameLines,
  type ProtocolFrame,
} from './protocol.js';

/**
 * The connection's observable lifecycle. Exposed on `EmitClient.state` for
 * tests + diagnostics; the invocation never branches on it.
 *
 *   idle        — constructed, no connect attempt in flight yet.
 *   connecting  — a `createConnection` is in flight; `connect`/`error` pending.
 *   connected   — the local socket is open; events are written immediately.
 *   unavailable — the last attempt failed / the socket dropped; events are
 *                 held per the C4 buffer policy and a reconnect is armed.
 *   closed      — `close()` was called; a terminal, do-nothing state.
 */
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'closed';

/** Delay before an armed background reconnect fires after a connection carrying
 * retained events was torn down (AUDIT-20260718-11) — small enough to drain
 * promptly to a restarted sidecar, bounded so a persistently-incompatible peer
 * is retried at a rate rather than a tight spin. `unref()`d. */
const RECONNECT_DELAY_MS = 25;

/** Cap on how long `close()`'s flush lingers before a force-destroy
 * (AUDIT-20260718-09) — generous vs a real local flush (never truncates it),
 * bounding only a never-draining peer's fd linger. `unref()`d. */
const CLOSE_FLUSH_GRACE_MS = 1_000;

/** Configuration for one emit client. A single `stackctl` process is a single
 * `CallerKind` (a short verb OR a long commandable run), so the kind is fixed
 * at construction — never a per-`emit` argument. */
export interface EmitClientConfig {
  /** The resolved LOCAL socket path (UDS) / named pipe. Comes FROM
   * `locateMachineState` (see `resolveLocalSocketPath`) — never re-derived. */
  readonly socketPath: string;
  /** Selects the C4 buffering asymmetry (short-verb drops; long-run buffers). */
  readonly callerKind: CallerKind;
  /** This build's local protocol version (C3). Defaults to
   * `LOCAL_PROTOCOL_VERSION`. */
  readonly localVersion?: number;
  /**
   * FIRE-AND-FORGET seam invoked when the local socket is found unavailable,
   * so a sidecar is spawned for SUBSEQUENT invocations (C1 row 1 / C6). The
   * client NEVER awaits it and swallows any throw. Left as a seam (default
   * no-op) rather than calling `spawnDetachedSidecar` directly because the
   * sidecar's command + args are the DISPATCHER's knowledge (T044), and the
   * advisory debounce that decides WHETHER to spawn belongs there too
   * (spawn.ts's own doc comment). This keeps process-launch policy out of the
   * hot path every invocation runs.
   */
  readonly onSocketUnavailable?: () => void;
  /** Optional override of the long-run buffer's bounded capacity (defaults to
   * `INVOCATION_BUFFER_BOUND`). Ignored for `'short-verb'`. */
  readonly bufferCapacity?: number;
}

/** The emit client surface. `emit` is the ONLY method an invocation calls; the
 * rest are for diagnostics/tests and clean shutdown. */
export interface EmitClient {
  /** Emit one telemetry event. SYNCHRONOUS, `void`, never throws, never
   * blocks — see the module doc's async-model section. */
  emit(event: TelemetryEvent): void;
  /** The C4 buffer backing this client (short-verb drop vs long-run bound). */
  readonly buffer: EventBuffer;
  /** The current connection state — observability only; the invocation never
   * branches on it. */
  readonly state: ConnectionState;
  /** Idempotent teardown: destroys any open socket and stops reconnecting.
   * Telemetry-only — never something an invocation must call for correctness. */
  close(): void;
}

class FailOpenEmitClient implements EmitClient {
  readonly buffer: EventBuffer;
  private readonly localVersion: number;
  private socket: Socket | undefined;
  private stateValue: ConnectionState = 'idle';
  private readBuffer = '';
  /**
   * Whether the current connection's `hello-ack` has been observed AND matched
   * this build's protocol version (C3). Reset to `false` on every (re)connect.
   */
  private handshakeConfirmed = false;
  /**
   * Events written on the current connection BEFORE a matching `hello-ack` was
   * observed — i.e. delivery to a version-compatible sidecar is not yet
   * confirmed. On a mismatched `hello-ack` (or a drop before the ack) these are
   * requeued into the buffer rather than lost (AUDIT-20260717-02). Cleared once
   * a matching `hello-ack` confirms delivery to a compatible peer.
   */
  private unconfirmed: TelemetryEvent[] = [];
  /** A background reconnect armed after a connection carrying retained events was
   * torn down (AUDIT-20260718-11), draining them to a compatible sidecar without
   * another `emit()`. `unref()`d; cleared on (re)connect and `close()`. */
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly config: EmitClientConfig) {
    this.localVersion = config.localVersion ?? LOCAL_PROTOCOL_VERSION;
    this.buffer =
      config.callerKind === 'short-verb'
        ? createEventBuffer('short-verb')
        : createEventBuffer('long-run', config.bufferCapacity);
    // Start connecting eagerly so a live sidecar is usually already reachable
    // by the time the first `emit()` fires (the short verb's event then takes
    // the immediate-write path rather than the drop path). Never blocks.
    this.beginConnect();
  }

  get state(): ConnectionState {
    return this.stateValue;
  }

  emit(event: TelemetryEvent): void {
    // The whole contract in one method: never throw, never await, never block.
    try {
      if (this.stateValue === 'connected' && this.socket !== undefined) {
        // Deliverable NOW — write fire-and-forget (no flush wait, no ack wait).
        this.writeFrame(buildEventFrame(event));
        // Until a matching `hello-ack` confirms the peer speaks our protocol
        // version, this write is provisional: track it so a subsequent mismatch
        // (or a drop before the ack) requeues it instead of losing it
        // (AUDIT-20260717-02).
        if (!this.handshakeConfirmed) {
          this.unconfirmed.push(event);
        }
        return;
      }
      if (this.stateValue === 'closed') {
        return;
      }
      // Not deliverable right now — hold per the C4 asymmetry (short-verb
      // drops, long-run buffers), and make sure a (re)connect is armed so a
      // live sidecar eventually drains the buffer.
      this.buffer.push(event);
      if (this.stateValue === 'idle' || this.stateValue === 'unavailable') {
        this.beginConnect();
      }
    } catch {
      // Fail-open: NOTHING about telemetry may surface to the invocation.
    }
  }

  close(): void {
    this.stateValue = 'closed';
    this.clearReconnect();
    // FLUSH pending writes before the socket goes away (AUDIT-20260718-09): the
    // caller (`invocation-telemetry.ts`) emits its ONLY event then calls close()
    // in the same synchronous tick, so a bare `destroy()` here would discard that
    // event's still-buffered bytes and silently violate FR-012.
    this.flushAndDestroySocket();
  }

  // --- connection lifecycle (all event-driven; nothing here is awaited) -----

  private beginConnect(): void {
    if (
      this.stateValue === 'connecting' ||
      this.stateValue === 'connected' ||
      this.stateValue === 'closed'
    ) {
      return;
    }
    this.stateValue = 'connecting';
    let socket: Socket;
    try {
      // For a UDS path this returns immediately and defers the actual connect;
      // absence surfaces as an async `error` (ENOENT/ECONNREFUSED), never a
      // synchronous throw — but guard anyway (fail-open).
      socket = createConnection(this.config.socketPath);
    } catch {
      this.markUnavailable();
      return;
    }
    this.socket = socket;
    // CRUCIAL: the telemetry socket must NEVER keep the process alive nor delay
    // its exit. `unref()` removes it from the event loop's liveness count, so a
    // connected-but-stalled peer cannot hang the CLI (T032).
    socket.unref();
    socket.setEncoding('utf8');
    socket.once('connect', () => this.onConnect());
    socket.on('data', (chunk: string) => this.onData(chunk));
    // Attaching an `error` handler is mandatory: an unhandled socket `error`
    // would crash the process. Swallowing it IS the fail-open behavior.
    socket.on('error', () => this.markUnavailable());
    socket.on('close', () => this.onClose());
  }

  private onConnect(): void {
    if (this.stateValue === 'closed') {
      return;
    }
    this.stateValue = 'connected';
    this.clearReconnect();
    this.handshakeConfirmed = false;
    this.unconfirmed = [];
    // Handshake: send `hello` first (C3). We do NOT await the `hello-ack`;
    // `onData` handles a version mismatch out of band as a restart signal.
    this.writeRaw(serializeFrame(buildHelloFrame(this.localVersion)));
    // Deliver anything held during the connect/reconnect gap. For a short-verb
    // buffer this drains to `[]` (it dropped); for a long-run buffer it flushes
    // the FIFO the restart gap accumulated (C4). These writes are PROVISIONAL
    // until the `hello-ack` matches — track them so a mismatch requeues them
    // rather than dropping them on the floor (AUDIT-20260717-02).
    for (const held of this.buffer.drain()) {
      this.writeFrame(buildEventFrame(held));
      this.unconfirmed.push(held);
    }
  }

  private onData(chunk: string): void {
    // Reading responses must never surface to the invocation either.
    try {
      this.readBuffer += chunk;
      const { complete, remainder } = splitFrameLines(this.readBuffer);
      this.readBuffer = remainder;
      for (const line of complete) {
        const parsed = parseSidecarToCliFrame(line);
        if (!parsed.ok || parsed.frame.kind !== 'hello-ack') {
          continue;
        }
        const outcome = interpretHelloAck(parsed.frame, this.localVersion);
        if (outcome.kind === 'mismatch') {
          // C3 defined restart path: an upgraded CLI met a stale sidecar. The
          // events written before this ack went to an INCOMPATIBLE peer — requeue
          // them so a compatible sidecar (spawned for next time) still gets them,
          // instead of dropping them on the floor (AUDIT-20260717-02). Then drop
          // this connection and trigger the spawn — fire-and-forget, the
          // invocation is NEVER failed.
          this.markUnavailable();
          // Arm a reconnect so retained events DRAIN to the restarted/upgraded
          // compatible sidecar — otherwise they sit until another emit() arrives,
          // which for a long-run command that already emitted its FINAL event is
          // never (AUDIT-20260718-11).
          this.armReconnect();
          return;
        }
        // A matching `hello-ack`: the provisional events reached a compatible
        // peer — delivery confirmed, nothing left to requeue.
        this.handshakeConfirmed = true;
        this.unconfirmed = [];
      }
    } catch {
      /* fail-open: a malformed reply must never take down the CLI. */
    }
  }

  private onClose(): void {
    if (this.stateValue === 'closed' || this.stateValue === 'unavailable') {
      return;
    }
    // The sidecar closed the socket (died / restarted). Not an error by itself
    // (C5) — subsequent emits will hold per C4 and re-arm a connect. Any events
    // written before a matching `hello-ack` are unconfirmed; requeue them so the
    // restart gap does not lose them (AUDIT-20260717-02).
    this.requeueUnconfirmed();
    this.stateValue = 'unavailable';
    this.socket = undefined;
    this.readBuffer = '';
    // The sidecar restarted — arm a reconnect so retained long-run events drain
    // to its successor without waiting for another emit() (AUDIT-20260718-11).
    this.armReconnect();
  }

  /**
   * Schedule a single background reconnect (AUDIT-20260718-11). Gated to fire only
   * while `unavailable`, only when the buffer holds retained events (a short-verb
   * buffer drops, so this no-ops for short verbs and never hammers an absent
   * sidecar with nothing buffered), and at most one timer in flight. `unref()`d.
   */
  private armReconnect(): void {
    if (this.stateValue !== 'unavailable') {
      return;
    }
    if (this.buffer.size === 0 || this.reconnectTimer !== undefined) {
      return;
    }
    const timer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.stateValue === 'unavailable' && this.buffer.size > 0) {
        this.beginConnect();
      }
    }, RECONNECT_DELAY_MS);
    timer.unref();
    this.reconnectTimer = timer;
  }

  /** Cancel any armed reconnect (on (re)connect or on close). */
  private clearReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Move every still-unconfirmed event back into the buffer (AUDIT-20260717-02).
   * For a long-run buffer this retains them for the next connect's drain; for a
   * short-verb buffer the re-push drops (its contract) — correct in both cases.
   */
  private requeueUnconfirmed(): void {
    if (this.unconfirmed.length === 0) {
      return;
    }
    const held = this.unconfirmed;
    this.unconfirmed = [];
    for (const event of held) {
      this.buffer.push(event);
    }
  }

  private markUnavailable(): void {
    // Idempotent across the many ways a socket can fail (connect error, write
    // error, mismatch, close) so the spawn seam fires at most once per episode.
    if (this.stateValue === 'closed' || this.stateValue === 'unavailable') {
      return;
    }
    // Retain events whose delivery to a compatible peer was never confirmed
    // (AUDIT-20260717-02) before tearing the connection down.
    this.requeueUnconfirmed();
    this.stateValue = 'unavailable';
    this.destroySocket();
    // Spawn a sidecar for SUBSEQUENT invocations — fire-and-forget, never
    // awaited, any throw swallowed.
    try {
      this.config.onSocketUnavailable?.();
    } catch {
      /* fail-open: the spawn seam is best-effort and must not surface. */
    }
  }

  // --- write path (fire-and-forget; a write failure is just "unavailable") ---

  private writeFrame(frame: ProtocolFrame): void {
    try {
      this.writeRaw(serializeFrame(frame));
    } catch {
      /* fail-open */
    }
  }

  private writeRaw(data: string): void {
    const socket = this.socket;
    if (socket === undefined || socket.destroyed) {
      return;
    }
    try {
      // Fire-and-forget: we pass no flush callback and never await drain. If the
      // kernel buffer is full the bytes queue; if the process exits first they
      // are dropped — wall-clock dominates delivery, by design.
      socket.write(data);
    } catch {
      this.markUnavailable();
    }
  }

  private destroySocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.readBuffer = '';
    if (socket === undefined) {
      return;
    }
    // Remove our listeners BEFORE destroying so our own `close`/`error` handlers
    // don't re-enter the state machine during teardown.
    socket.removeAllListeners();
    try {
      socket.destroy();
    } catch {
      /* already gone — nothing to do. */
    }
  }

  /**
   * Teardown for the DELIBERATE `close()` path (AUDIT-20260718-09). A clean close
   * may have a freshly `emit()`ed frame still in Node's internal write queue;
   * `socket.end()` FLUSHES that queue then sends FIN, whereas `destroy()` (the
   * failure-path teardown) would abandon it — silently dropping the invocation's
   * only event. Non-blocking: `end()` returns immediately; the socket is `unref()`d.
   */
  private flushAndDestroySocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.readBuffer = '';
    if (socket === undefined) {
      return;
    }
    // Drop our state-machine handlers so teardown can't re-enter the machine,
    // but keep a bare error swallower so a flush-time EPIPE/ECONNRESET (peer went
    // away mid-flush) can't crash the process via an unhandled 'error'.
    socket.removeAllListeners();
    socket.on('error', () => {
      /* fail-open during teardown — a flush error must never surface. */
    });
    try {
      // Flush any buffered writes, then FIN. `unref()`d already, so this never
      // keeps the process alive nor delays its exit.
      socket.end();
    } catch {
      try {
        socket.destroy();
      } catch {
        /* already gone. */
      }
      return;
    }
    // Cap the linger: if the peer never drains our flush, force the socket down
    // after a generous grace (never truncates a real local flush). `unref()`d.
    const killer = setTimeout(() => {
      try {
        socket.destroy();
      } catch {
        /* already gone. */
      }
    }, CLOSE_FLUSH_GRACE_MS);
    killer.unref();
  }
}

/** Create a fail-open emit client for an already-resolved local socket path.
 * Begins connecting eagerly; the returned client's `emit` is safe to call
 * immediately (it holds/drops per C4 until the connection is up). */
export function createEmitClient(config: EmitClientConfig): EmitClient {
  return new FailOpenEmitClient(config);
}

/**
 * Resolve the LOCAL socket path for `installationRoot` via
 * `locateMachineState` (T024) — the single source of truth for the store
 * location; never re-derived here. Side effect: `locateMachineState` also
 * ensures the 0700 socket parent dir exists, which is harmless + idempotent
 * (a sidecar this CLI later spawns binds there). The DISPATCHER (T044) calls
 * this ONCE at startup and passes the result to `createEmitClient`, so the
 * per-`emit` hot path never touches the filesystem.
 */
export function resolveLocalSocketPath(installationRoot: string): string {
  return locateMachineState(installationRoot).socketPath;
}
