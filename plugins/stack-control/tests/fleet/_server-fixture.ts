// specs/036-fleet-control-plane — T010, Phase 2 (Foundational).
//
// WHY THIS EXISTS (contracts/sidecar-plane-protocol.md § Test obligations,
// research.md § Testability strategy — "a mock cannot be cruel"):
//
//   A mocked HTTP client will not stall without sending EOF, will not die
//   in the middle of an SSE frame, and will not send a keepalive-comment-
//   only stream that never carries a real event. Those are exactly the
//   failures the sidecar's SSE client + reconnect logic (C4, later tasks)
//   must survive — read-idle-timeout detection, partial-frame resilience,
//   "keepalive re-arms the watchdog but is not itself data", and terminal-
//   vs-retryable classification (non-200 / wrong Content-Type / 401 / 403).
//   A hand-rolled fake transport can only misbehave the ways its author
//   thought to program — it cannot reproduce a socket that goes silent
//   mid-TCP-stream, or a TLS-terminating proxy that severs a connection
//   between two `write()` calls. So this fixture is a REAL `node:http`
//   server, bound to an EPHEMERAL port (`listen(0, ...)`), that a test can
//   command into one of a fixed, self-documenting set of cruelty modes.
//
// SCOPE: this is a FIXTURE (test helper), not a test — no `describe`/`it`
// in this file, and the leading underscore keeps vitest from collecting it
// (mirrors _machine-state-harness.ts's convention, tests/fleet/README-
// equivalent: T009's header comment).
//
// DESIGN — one behavior per server instance, not boolean soup
// (contracts/sidecar-plane-protocol.md's own framing: "the fixture can be
// COMMANDED to misbehave"). `ServerBehavior` is a discriminated union keyed
// on `kind`; `startServerFixture(behavior)` starts a server that applies
// that ONE behavior to every request it receives. A test that needs a
// specific cruelty starts a fixture configured for exactly that cruelty —
// mirroring the existing per-test inline `startServer(handler)` pattern in
// tests/fleet/transport.test.ts, generalized into named, reusable modes
// plus request-capture and leak-proof teardown (stalled/dropped
// connections must not hang `server.close()` — see `trackedSockets`
// below).
//
// Real temp resources on disk/network; never a mocked filesystem or
// mocked HTTP client (.claude/rules/testing.md). This repo's convention is
// relative `.js` imports with node16 resolution (no `@/` alias configured
// — .claude/CLAUDE.md's `@/` rule applies to the TypeScript codebases that
// have that alias wired; this plugin does not, and matching the sibling
// T007/T009 fixtures is the correct convention here).

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

/** A single SSE `event:`/`data:`/`id:` frame, OR a `:comment` keepalive
 * frame (when `comment` is set). Mirrors the wire format directly — this
 * type exists so a test can pin exact `id:` values to exercise cursor /
 * Last-Event-ID behavior (research.md § SSE client), never inferring them. */
export interface SseFrameSpec {
  /** Present ⇒ this is a `:comment` keepalive frame; `data`/`event`/`id`/
   * `retry` are ignored when set. */
  readonly comment?: string;
  readonly id?: string;
  readonly event?: string;
  readonly data?: string;
  readonly retry?: number;
}

/** Builds a well-formed `data:`/`event:`/`id:` frame spec. Convenience
 * constructor so call sites read as intent ("a data frame with this id"),
 * not as a raw object literal. */
export function dataFrame(
  data: string,
  options?: { readonly id?: string; readonly event?: string; readonly retry?: number },
): SseFrameSpec {
  return { data, id: options?.id, event: options?.event, retry: options?.retry };
}

/** Builds a `:comment` keepalive frame spec. */
export function commentFrame(text: string): SseFrameSpec {
  return { comment: text };
}

/** Renders one `SseFrameSpec` to its exact wire bytes, terminated by the
 * blank line that closes an SSE frame. Field order (`id`, `event`,
 * `retry`, `data`) matches common server practice; the reconnect-buffer
 * rule (research.md § SSE client: "persists across events that omit
 * `id:`") depends on tests being able to omit `id` deliberately, so `id`
 * is only emitted when present — never defaulted. */
export function renderSseFrame(spec: SseFrameSpec): string {
  if (spec.comment !== undefined) {
    return `:${spec.comment}\n\n`;
  }
  const lines: string[] = [];
  if (spec.id !== undefined) lines.push(`id: ${spec.id}`);
  if (spec.event !== undefined) lines.push(`event: ${spec.event}`);
  if (spec.retry !== undefined) lines.push(`retry: ${spec.retry}`);
  if (spec.data !== undefined) lines.push(`data: ${spec.data}`);
  return lines.map((line) => `${line}\n`).join('') + '\n';
}

// --- Cruelty modes -----------------------------------------------------
//
// A discriminated union, not booleans. Each member names ONE distinct
// failure a real network / proxy / server can inflict on the sidecar's SSE
// client, cross-referenced to the contract section it exists to exercise.

/** A well-formed SSE stream: correct `Content-Type`, real frames in order,
 * then (by default) a clean `end()`. The control / happy-path mode. */
export interface SseStreamBehavior {
  readonly kind: 'sse-stream';
  readonly frames: readonly SseFrameSpec[];
  /** Default `true`. `false` leaves the stream held open after the last
   * frame (a live, well-behaved long-poll) instead of closing it — useful
   * for a test that wants to inject more frames later via `pushFrame`. */
  readonly closeAfterFrames?: boolean;
}

/** C4 / test-obligation #1: stall without EOF. Sends response headers
 * (200, correct `Content-Type`), optionally one preamble frame, then hangs
 * forever — no further bytes, no `end()`, no socket close. Exercises the
 * client's 45s read-idle watchdog; this fixture makes NO attempt to time
 * that out itself, because the test's injected `Clock` owns that. */
export interface StallNoEofBehavior {
  readonly kind: 'stall-no-eof';
  /** An optional frame (e.g. one comment) written before the stall, so a
   * test can prove data-then-silence, not just silence-from-open. */
  readonly preamble?: SseFrameSpec;
}

/** Test-obligation companion to #1: dies mid-frame. Writes a deliberately
 * truncated chunk (no terminating blank line, and — per the caller's
 * `partial` string — potentially no terminating newline at all) then
 * destroys the underlying TCP socket without a clean HTTP close. Exercises
 * partial-frame resilience: the client must neither crash nor silently
 * treat the truncated bytes as a complete frame. */
export interface DropMidFrameBehavior {
  readonly kind: 'drop-mid-frame';
  /** The raw bytes written before the socket is destroyed. Pass a
   * genuinely partial frame, e.g. `'id: 7\ndata: partial'` (no blank-line
   * terminator) to model a proxy that severed the connection mid-write. */
  readonly partial: string;
}

/** C4 test-obligation #1 (keepalive) exercised from the "never any real
 * event" angle: a stream of ONLY `:comment` frames, on the given cadence,
 * that never dispatches a real `event`/`data` frame. Distinguishes "the
 * client treats keepalive as liveness" from "the client treats keepalive
 * as data" — the latter is a bug this fixture exists to catch. */
export interface CommentOnlyBehavior {
  readonly kind: 'comment-only';
  readonly comment: string;
  readonly count: number;
  /** Delay between comment writes, ms. Default `0` (written back-to-back,
   * each as its own `res.write()` so a test can still observe them as
   * discrete chunks arriving over time via `setImmediate` scheduling). */
  readonly intervalMs?: number;
  /** After the comments, hold the connection open (default) instead of
   * closing it — a real keepalive-only proxy segment does not hang up. */
  readonly closeAfter?: boolean;
}

/** C4 test-obligation #4: non-200. A terminal (never-retry) response per
 * the contract — auth failure (401/403) or a server error (5xx). */
export interface NonOkBehavior {
  readonly kind: 'non-ok';
  readonly status: number;
  readonly contentType?: string;
  readonly body?: string;
}

/** C4 test-obligation #4's other half: 200 but the wrong `Content-Type` —
 * not an event stream at all. Also terminal per the contract. */
export interface WrongContentTypeBehavior {
  readonly kind: 'wrong-content-type';
  readonly contentType: string;
  readonly body?: string;
}

/** The full cruelty-mode set this fixture can be commanded into. Adding a
 * new mode means adding a union member + a `case` in `applyBehavior` below
 * — the exhaustiveness check (the `default` branch's `never` assignment)
 * fails to compile if a case is missed. */
export type ServerBehavior =
  | SseStreamBehavior
  | StallNoEofBehavior
  | DropMidFrameBehavior
  | CommentOnlyBehavior
  | NonOkBehavior
  | WrongContentTypeBehavior;

// --- Request capture -----------------------------------------------------

/** One captured inbound request — enough for a test to assert
 * `Last-Event-ID` traveled as a header (never a query parameter, C4) and
 * to inspect method/url/headers generally. Header values keep Node's own
 * shape (`string | string[] | undefined`) rather than lossily coercing, so
 * a test can distinguish "absent" from "empty string". */
export interface CapturedRequest {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

function captureRequest(req: IncomingMessage): CapturedRequest {
  return {
    method: req.method,
    url: req.url,
    headers: { ...req.headers },
  };
}

// --- The fixture -----------------------------------------------------

/** A running fixture server plus everything a test needs to drive and
 * inspect it. Every field is read-only from the caller's side except
 * `close()`, which is idempotent-safe to call from a `finally` even after
 * a cruelty mode has already destroyed sockets itself. */
export interface ServerFixture {
  /** e.g. `http://127.0.0.1:54213` — no trailing slash, no path. */
  readonly baseUrl: string;
  readonly port: number;
  /** Every request received so far, in arrival order. A live (non-frozen)
   * array reference — a test can read it again after making more requests
   * against the same fixture. */
  readonly requests: readonly CapturedRequest[];
  /** Tears the server down, force-destroying any sockets a cruelty mode
   * left open (stalled / dropped connections do not end on their own, and
   * a bare `server.close()` would hang waiting for them). Safe to call
   * more than once; safe to call after the server already stopped itself. */
  close(): Promise<void>;
}

/** Sockets seen via the server's `'connection'` event, so `close()` can
 * force-destroy any still-open ones instead of hanging on a stalled or
 * deliberately-never-closed cruelty-mode connection. */
function trackSockets(server: Server): Set<Socket> {
  const sockets = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return sockets;
}

function writeFrame(res: ServerResponse, frame: SseFrameSpec): void {
  res.write(renderSseFrame(frame));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyBehavior(
  behavior: ServerBehavior,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  switch (behavior.kind) {
    case 'sse-stream': {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const frame of behavior.frames) {
        writeFrame(res, frame);
      }
      if (behavior.closeAfterFrames ?? true) {
        res.end();
      }
      return;
    }

    case 'stall-no-eof': {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (behavior.preamble !== undefined) {
        writeFrame(res, behavior.preamble);
      }
      // Deliberately: no further write, no end(), no socket close. The
      // connection hangs exactly like a dead-but-not-yet-detected link.
      // Cleanup is `ServerFixture.close()`'s job (via trackSockets), never
      // this handler's — a real dead link does not politely hang up.
      return;
    }

    case 'drop-mid-frame': {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      // Destroy only once the write's callback fires — i.e. once the
      // partial bytes have actually been handed to the kernel socket
      // buffer, so a test client reliably observes the partial frame
      // before the connection dies (rather than racing a same-tick
      // destroy() against an unflushed write, which the OS is free to
      // resolve either order). This is still a hard kill — not res.end(),
      // which would send a clean (if unterminated) close. A real proxy
      // severing a TCP connection does not flush a trailer first; it just
      // stops being there.
      res.write(behavior.partial, () => {
        (res.socket ?? req.socket).destroy();
      });
      return;
    }

    case 'comment-only': {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const interval = behavior.intervalMs ?? 0;
      for (let i = 0; i < behavior.count; i += 1) {
        writeFrame(res, commentFrame(behavior.comment));
        if (interval > 0 && i < behavior.count - 1) {
          await sleep(interval);
        }
      }
      if (behavior.closeAfter === true) {
        res.end();
      }
      // Default: leave open. A keepalive-only segment of a real link does
      // not hang up on its own; ServerFixture.close() reclaims the socket.
      return;
    }

    case 'non-ok': {
      res.writeHead(behavior.status, {
        'content-type': behavior.contentType ?? 'application/json',
      });
      res.end(behavior.body ?? JSON.stringify({ error: 'non-ok' }));
      return;
    }

    case 'wrong-content-type': {
      res.writeHead(200, { 'content-type': behavior.contentType });
      res.end(behavior.body ?? 'not an event stream');
      return;
    }

    default: {
      // Exhaustiveness guard: a new ServerBehavior member that forgets a
      // case above fails to compile here, not at runtime.
      const exhaustive: never = behavior;
      throw new Error(`unhandled ServerBehavior kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Starts a real `node:http` server on an ephemeral port (`listen(0, ...)`),
 * commanded into exactly ONE `ServerBehavior` for every request it
 * receives. Returns once the server is actually listening and its port is
 * known.
 *
 * Every request is captured (method/url/headers) into `requests` before
 * the behavior is applied, so a test can assert what the client sent
 * (e.g. `Last-Event-ID` as a header — C4) regardless of which cruelty mode
 * the response side is exercising.
 */
export async function startServerFixture(behavior: ServerBehavior): Promise<ServerFixture> {
  const requests: CapturedRequest[] = [];

  const server = createServer((req, res) => {
    requests.push(captureRequest(req));
    applyBehavior(behavior, req, res).catch((error: unknown) => {
      // A handler that throws after headers may already be mid-stream;
      // there is nothing more useful to do than destroy the connection so
      // the test's client sees a hard failure instead of an infinite hang.
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' });
      }
      res.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });

  const sockets = trackSockets(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(
      'startServerFixture: expected a bound TCP address from the ephemeral-port listener',
    );
  }
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let closed = false;

  return {
    baseUrl,
    port,
    requests,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      // Force-destroy any connection a cruelty mode left open (stalled,
      // dropped-mid-frame-but-not-yet-noticed, or held-open comment-only)
      // — otherwise server.close() waits forever for a connection that,
      // by design, never ends on its own.
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
