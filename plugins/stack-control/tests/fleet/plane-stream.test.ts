// specs/036-fleet-control-plane — T115 RED test for the plane's SSE-out +
// 15s keepalive comment frames (pairs with the T115 impl,
// src/plane/http/stream.ts).
//
// CONTRACT (contracts/sidecar-plane-protocol.md § C1/C3/C7):
//   § C1 — commands (plane → sidecar) travel over a held-open SSE stream,
//     opened BY THE SIDECAR. This test drives the handler exactly as a
//     connecting sidecar would: it fetches the route, holds the response
//     body reader open, and never expects the plane side to end the
//     stream.
//   § C3 — "Transport keepalive: 15s comment frames (leading `:`). It
//     proves NOTHING about process health." This test pins the wire shape
//     (leading `:`, distinct from a `data:` event) and the registered
//     cadence (exactly `KEEPALIVE_INTERVAL_MS` === 15_000) WITHOUT ever
//     waiting 15 real seconds — the handler's keepalive ticker is driven by
//     an INJECTED `IntervalScheduler` seam (mirrors the Clock-DI convention
//     `src/fleet/clock.ts` / `src/sidecar/lifecycle.ts` establish for every
//     other timeout-driven behavior in this feature). This test's
//     `FakeScheduler.tick()` invokes the captured callback directly,
//     simulating N elapsed 15s intervals with zero real wall-clock wait.
//   § C7 — a queued/held command is delivered as an SSE `data:` event
//     carrying an `id:`. This module CONSUMES a command source
//     (src/plane/commands/dispatch.ts's `CommandDispatch`); it does not
//     reimplement the durable store or replay/expiry/fan-out logic that
//     already lives there — so this test injects a minimal fake command
//     source (`Pick<CommandDispatch, 'replayOnReconnect'>`), never a real
//     `CommandDispatch`/`CommandStore` instance.
//
// Real `node:http` server on an ephemeral port (.claude/rules/testing.md);
// no mocked transport. Relative `.js` imports under node16 resolution (no
// `@/` alias — this plugin has none).

import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { CommandDispatch } from '../../src/plane/commands/dispatch.js';
import type { HeldCommand } from '../../src/plane/commands/dispatch.js';
import type { IntervalScheduler } from '../../src/plane/http/stream.js';
import { KEEPALIVE_INTERVAL_MS, createCommandStreamHandler } from '../../src/plane/http/stream.js';

// --- helpers ---------------------------------------------------------------

/** A fake `IntervalScheduler` (see stream.ts's "CADENCE SEAM" header note):
 * records every `setInterval` registration and lets the test fire the
 * captured callback on demand via `tick()`, simulating one elapsed
 * `intervalMs` of wall time with zero real waiting. */
class FakeScheduler implements IntervalScheduler {
  readonly calls: Array<{ callback: () => void; intervalMs: number }> = [];
  readonly cleared: unknown[] = [];
  private nextHandle = 1;

  setInterval(callback: () => void, intervalMs: number): unknown {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.calls.push({ callback, intervalMs });
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.cleared.push(handle);
  }

  /** Invokes the most recently registered callback — simulating exactly
   * one elapsed keepalive interval, never a real wait. */
  tick(): void {
    const last = this.calls[this.calls.length - 1];
    if (last === undefined) {
      throw new Error('FakeScheduler.tick: no interval has been registered yet');
    }
    last.callback();
  }
}

/** A minimal fake command source — `Pick<CommandDispatch,
 * 'replayOnReconnect'>` — so this test never touches a real durable store
 * or dispatch buffer (T115's scope is SSE-out framing, not the store). */
function fakeDispatch(commands: readonly HeldCommand[]): Pick<CommandDispatch, 'replayOnReconnect'> {
  return {
    replayOnReconnect: (_installationId: string): readonly HeldCommand[] => commands,
  };
}

interface RunningStreamServer {
  readonly server: Server;
  readonly baseUrl: string;
}

/** Mounts the handler directly (this route is not yet wired into
 * `createPlaneServer`'s route table — that is a later wiring task; T115's
 * scope is the handler itself), on a real ephemeral-port `node:http`
 * server, matching the convention in tests/fleet/plane-server.test.ts. */
async function startStreamServer(
  handler: (ctx: {
    req: import('node:http').IncomingMessage;
    res: import('node:http').ServerResponse;
    params: Readonly<Record<string, string>>;
    url: URL;
  }) => void | Promise<void>,
): Promise<RunningStreamServer> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://plane.invalid');
    void handler({ req, res, params: {}, url });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo | string | null;
  if (address === null || typeof address === 'string') {
    throw new Error('startStreamServer: expected a bound TCP AddressInfo');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Reads SSE bytes progressively and yields one complete frame (terminated
 * by a blank line) at a time — no polyfill/reimplementation of SSE parsing
 * beyond the blank-line frame boundary this test needs to assert on. */
class SseFrameReader {
  private buffer = '';
  private readonly decoder = new TextDecoder();

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async next(): Promise<string> {
    while (!this.buffer.includes('\n\n')) {
      const { value, done } = await this.reader.read();
      if (done) {
        throw new Error('SseFrameReader.next: stream ended before a complete frame arrived');
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
    const index = this.buffer.indexOf('\n\n');
    const frame = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + 2);
    return frame;
  }
}

/** Bounded real-time poll — matches the convention in
 * tests/fleet/sse-keepalive.test.ts (`waitUntil`): only used to let an
 * async close/cleanup callback settle, never to wait out the 15s cadence
 * itself (that is driven synchronously via `FakeScheduler.tick()`). */
async function waitUntil(predicate: () => boolean, timeoutMs = 1000, stepMs = 5): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`waitUntil: predicate not satisfied within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

// --- tests -------------------------------------------------------------

describe('plane SSE-out + 15s keepalive comment frames (T115, contracts/sidecar-plane-protocol.md § C1/C3/C7)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('writes SSE headers and holds the connection open (never ends it)', async () => {
    const scheduler = new FakeScheduler();
    const handler = createCommandStreamHandler({
      dispatch: fakeDispatch([]),
      installationIdOf: () => 'inst-1',
      scheduler,
    });
    const { server, baseUrl } = await startStreamServer(handler);
    activeServer = server;
    const controller = new AbortController();

    const response = await fetch(`${baseUrl}/stream`, { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    if (response.body === null) {
      throw new Error('expected a readable response body');
    }
    const reader = response.body.getReader();

    // Held open ⇒ no bytes and no `done` within a short, bounded real-time
    // window (a real ended stream reports `done` immediately). This is the
    // ONLY place this test waits on real time, and it is bounded at 50ms —
    // nowhere near the 15s/45s scale this feature is about.
    const raced = await Promise.race([
      reader.read().then(() => 'read-resolved' as const),
      new Promise<'still-open'>((resolve) => setTimeout(() => resolve('still-open'), 50)),
    ]);
    expect(raced).toBe('still-open');

    await reader.cancel();
    controller.abort();
  });

  it('writes a queued/held command as an SSE `data:` event carrying an `id:` (§ C7)', async () => {
    const scheduler = new FakeScheduler();
    const command: HeldCommand = {
      commandId: 'cmd-123',
      kind: 'pause',
      installationId: 'inst-1',
      runId: 'run-1',
      expiresAt: null,
    };
    const handler = createCommandStreamHandler({
      dispatch: fakeDispatch([command]),
      installationIdOf: () => 'inst-1',
      scheduler,
    });
    const { server, baseUrl } = await startStreamServer(handler);
    activeServer = server;
    const controller = new AbortController();

    const response = await fetch(`${baseUrl}/stream`, { signal: controller.signal });
    if (response.body === null) {
      throw new Error('expected a readable response body');
    }
    const frames = new SseFrameReader(response.body.getReader());

    const frame = await frames.next();
    expect(frame).toContain('id: cmd-123');
    expect(frame.startsWith(':')).toBe(false);

    const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
    if (dataLine === undefined) {
      throw new Error(`expected a "data: " line in the frame, got: ${JSON.stringify(frame)}`);
    }
    const parsed: unknown = JSON.parse(dataLine.slice('data: '.length));
    expect(parsed).toEqual(command);

    controller.abort();
  });

  it('registers the keepalive at EXACTLY the 15s cadence and emits a `:` comment frame per scheduler tick — distinct from a data event', async () => {
    const scheduler = new FakeScheduler();
    const handler = createCommandStreamHandler({
      dispatch: fakeDispatch([]),
      installationIdOf: () => 'inst-1',
      scheduler,
    });
    const { server, baseUrl } = await startStreamServer(handler);
    activeServer = server;
    const controller = new AbortController();

    const response = await fetch(`${baseUrl}/stream`, { signal: controller.signal });
    if (response.body === null) {
      throw new Error('expected a readable response body');
    }
    const frames = new SseFrameReader(response.body.getReader());

    // The cadence is asserted structurally — NEVER a real 15s wait. The
    // handler must register its keepalive at exactly the § C3 constant.
    expect(KEEPALIVE_INTERVAL_MS).toBe(15_000);
    expect(scheduler.calls).toHaveLength(1);
    expect(scheduler.calls[0]?.intervalMs).toBe(KEEPALIVE_INTERVAL_MS);

    // Firing the injected scheduler N times simulates N elapsed 15s
    // intervals of wall time with zero real waiting (per the T115 dispatch
    // note: "assert cadence by advancing the injected clock/timer, NEVER a
    // real 15s wait").
    for (let i = 0; i < 3; i += 1) {
      scheduler.tick();
      const frame = await frames.next();
      expect(frame.startsWith(':')).toBe(true);
      expect(frame).not.toContain('data:');
      expect(frame).not.toMatch(/^id:/m);
      expect(frame).not.toMatch(/^event:/m);
    }

    controller.abort();
  });

  it('clears the keepalive interval once the connection closes (no leaked timer)', async () => {
    const scheduler = new FakeScheduler();
    const handler = createCommandStreamHandler({
      dispatch: fakeDispatch([]),
      installationIdOf: () => 'inst-1',
      scheduler,
    });
    const { server, baseUrl } = await startStreamServer(handler);
    activeServer = server;
    const controller = new AbortController();

    const response = await fetch(`${baseUrl}/stream`, { signal: controller.signal });
    expect(response.status).toBe(200);

    controller.abort();

    await waitUntil(() => scheduler.cleared.length === 1);
    expect(scheduler.cleared).toHaveLength(1);
  });
});
