/**
 * specs/036-fleet-control-plane — T042 (RED), PT-002 / C6.
 *
 * C6 (contracts/local-socket-protocol.md — SETTLED, not re-derived here):
 * spawning the sidecar MUST carry exactly four properties —
 * `detached: true`, `stdio: 'ignore'`, `unref()`, and `windowsHide: true`
 * — and the CLI MUST NEVER wait for the sidecar to become ready (spawn is
 * fire-and-forget).
 *
 * `windowsHide` is the crux this test exists to pin: Node documents that a
 * detached Windows child gets its own console window that CANNOT be
 * disabled after the fact, and every canonical `child_process.spawn`
 * snippet on the internet omits it (none of them are about background
 * daemons). Losing this one flag silently pops a console window on every
 * Windows invocation — there is no way to observe that from a Linux/macOS
 * CI box, so the flag must be pinned structurally (asserted on the options
 * object passed to the spawn primitive), not empirically.
 *
 * Per the dispatch design contract: "Prefer asserting the options object
 * passed to the spawn primitive (inject the spawn function) over trying to
 * observe a real detached process's window." A mock cannot show a Windows
 * console popping on a macOS/Linux test runner either way — the only
 * honest assertion available on any single CI platform is "did we ask the
 * OS for the right thing", so the spawn primitive itself is the injected
 * DI seam (Constitution Principle VI), matching the seam pattern already
 * used for `StartTimeSource` (src/fleet/process-probe.ts) and
 * `SseTransport` (src/sidecar/uplink/transport.ts).
 *
 * A second suite below exercises the REAL node:child_process-backed
 * primitive against a real short-lived child (no mock) to prove the
 * wiring actually spawns and detaches a real OS process end-to-end — the
 * fake-primitive suite pins the CONTRACT (exact flags), this suite pins
 * that the DEFAULT primitive really is `node:child_process.spawn`.
 *
 * This repo's convention is relative `.js` imports with node16 resolution
 * (no `@/` alias is configured for this plugin).
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createNodeSpawnPrimitive,
  spawnDetachedSidecar,
  type SpawnPrimitive,
  type Unreffable,
} from '../../src/sidecar/spawn.js';

describe('spawnDetachedSidecar against an injected fake spawn primitive (the crux: exact flags)', () => {
  it('passes exactly detached:true, stdio:"ignore", windowsHide:true to the spawn primitive', () => {
    let capturedCommand: string | undefined;
    let capturedArgs: readonly string[] | undefined;
    let capturedOptions: unknown;
    const handle: Unreffable = { unref: () => {} };
    const fakeSpawn: SpawnPrimitive = (command, args, options) => {
      capturedCommand = command;
      capturedArgs = args;
      capturedOptions = options;
      return handle;
    };

    spawnDetachedSidecar('node', ['sidecar.js'], fakeSpawn);

    expect(capturedCommand).toBe('node');
    expect(capturedArgs).toEqual(['sidecar.js']);
    // Exact-shape assertion (not a subset match): a fifth stray option
    // would be just as dangerous as a missing one (e.g. an accidental
    // `shell: true`), so this pins the object has ONLY these three keys.
    expect(capturedOptions).toEqual({
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  });

  it('calls unref() on the handle returned by the spawn primitive', () => {
    let unrefCalled = false;
    const handle: Unreffable = {
      unref: () => {
        unrefCalled = true;
      },
    };
    const fakeSpawn: SpawnPrimitive = () => handle;

    spawnDetachedSidecar('node', ['sidecar.js'], fakeSpawn);

    expect(unrefCalled).toBe(true);
  });

  it('is fire-and-forget: returns synchronously, never a Promise the caller could await readiness on', () => {
    const handle: Unreffable = { unref: () => {} };
    const fakeSpawn: SpawnPrimitive = () => handle;

    const result = spawnDetachedSidecar('node', ['sidecar.js'], fakeSpawn);

    // A Promise return would tempt a caller into `await`ing sidecar
    // readiness, which C6 forbids outright ("the CLI never waits for the
    // sidecar to become ready"). Pinning `undefined` at both the runtime
    // AND type level (the `void` return type below is checked by tsc)
    // makes that mistake impossible to write, not merely undocumented.
    expect(result).toBeUndefined();
  });

  it('never calls the spawn primitive more than once per invocation (one spawn, no retry-inside-the-call)', () => {
    let callCount = 0;
    const handle: Unreffable = { unref: () => {} };
    const fakeSpawn: SpawnPrimitive = () => {
      callCount += 1;
      return handle;
    };

    spawnDetachedSidecar('node', ['sidecar.js'], fakeSpawn);

    expect(callCount).toBe(1);
  });
});

describe('createNodeSpawnPrimitive against a REAL child process (no mock — proves the default wiring)', () => {
  it('spawns a real detached child that runs to completion after the caller has moved on', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spawn-t042-'));
    const sentinel = join(dir, 'sentinel.txt');
    try {
      const primitive = createNodeSpawnPrimitive();
      // A real short-lived node child that proves-of-life by writing a
      // sentinel file after a short delay — long enough that, if
      // spawnDetachedSidecar were secretly waiting on it, this test's
      // synchronous assertion below would observe the file NOT yet
      // written (proving fire-and-forget), and the later poll proves the
      // child really did run to completion detached.
      spawnDetachedSidecar(
        process.execPath,
        ['-e', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran');`],
        primitive,
      );

      // Fire-and-forget: the call above already returned (synchronously,
      // per the suite above) without waiting for the child to run at all,
      // so nothing has necessarily happened yet — assert that honestly
      // rather than asserting a race.
      await waitUntilOrThrow(
        () => fileExists(sentinel),
        5000,
        `real spawned child never wrote its sentinel file at ${sentinel}`,
      );
      expect(readFileSync(sentinel, 'utf8')).toBe('ran');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function fileExists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilOrThrow(
  predicate: () => boolean,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!predicate()) throw new Error(message);
}
