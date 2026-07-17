// T011 (036 fleet-control-plane) — real socket/process fixture.
//
// WHY THIS EXISTS (dispatch prompt, verbatim): the sidecar's spawn-race
// election, stale-socket recovery, and PID+start-time liveness (PT-002) can
// only be honestly tested against REAL processes and REAL unix-domain-socket
// files — a mock cannot actually die from SIGKILL, cannot leave a real stale
// socket inode behind, and cannot recreate the PID-reuse hazard. This
// fixture provides those real, cruel conditions for later tests.
//
// THE CONTRACT BEING FIXTURED (research.md — SETTLED, not re-derived here):
//   PT-001 (local socket transport): authorization comes from a `0700`
//     PARENT DIRECTORY, not socket-file mode (unsound on macOS per
//     `unix(7)`). Socket paths must stay within the 103-byte (macOS) /
//     107-byte (Linux) sun_path budget.
//   PT-002 (spawn race and stale locks): bind-wins election; stale-socket
//     recovery is ECONNREFUSED-on-connect -> verify liveness by PID +
//     process start-time (start-time defeats PID reuse, since Node has no
//     native flock) -> unlink -> rebind.
//
// REUSE, NOT DUPLICATION:
//   - UDS-budget enforcement and the `sha256(realpath)[0:16]` socket-path
//     keying live in `_machine-state-harness.ts` (T009) — this fixture
//     takes a `MachineStateStore` and calls `store.socketPathFor(...)`
//     rather than re-deriving the key or re-checking the budget (the
//     harness already asserts the budget on every redirect).
//   - PID+start-time liveness semantics live in `ProcessProbe` /
//     `StartTimeSource` (`src/fleet/process-probe.ts`, T006) — this fixture
//     does not reimplement liveness; `simulatePidReuse()` below produces a
//     `StartTimeSource` shaped to compose directly with `ProcessProbe`, so a
//     consuming test proves the REAL contract (`ProcessProbe.isAlive`
//     rejects a reused pid), not a fixture-invented one.
//
// Real child processes and real socket files on disk; never a mocked
// filesystem or a mocked process (.claude/rules/testing.md — this fixture
// exists precisely because that rule forbids mocking the thing under test).
// This repo's convention is relative `.js` imports with node16 resolution
// (no `@/` alias is configured for this plugin).

import { afterEach, beforeEach } from 'vitest';
import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname } from 'node:path';
import type { ProcessIdentity, StartTimeSource } from '../../src/fleet/process-probe.js';
import type { MachineStateStore } from './_machine-state-harness.js';

/** How a spawned process actually terminated (from Node's real `'exit'` event). */
export interface ExitInfo {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/**
 * A real, running (or since-exited) child process. `exited` is wired at
 * spawn time — before any caller has a chance to race a `kill()` against
 * attaching the listener — and resolves exactly once, from the real
 * `'exit'` event, never from a timer.
 */
export interface SpawnedProcess {
  readonly pid: number;
  readonly child: ChildProcess;
  /** Resolves from the process's real `'exit'` event — no guessed delay. */
  readonly exited: Promise<ExitInfo>;
}

/**
 * A real, on-disk UDS socket file with no listener behind it — the
 * ECONNREFUSED-on-connect condition PT-002's stale-socket recovery must
 * handle. Produced by binding a real listener and then SIGKILLing it, so
 * the file is exactly what a crashed sidecar would leave behind (a
 * graceful `server.close()` DOES unlink the file — verified empirically
 * while building this fixture — so only a hard kill produces a genuine
 * stale inode).
 */
export interface StaleSocket {
  readonly socketPath: string;
  readonly parentDir: string;
  /** The pid of the now-dead process that used to listen here. */
  readonly deadPid: number;
  /** Attempts a real connection; resolves with the real connect error
   * (never rejects on the expected-failure path) — rejects only if the
   * socket unexpectedly accepted the connection, since that would mean
   * this isn't stale after all. */
  connect(): Promise<NodeJS.ErrnoException>;
}

/**
 * The PID-reuse hazard PT-002 exists to defeat: `original` is a real
 * identity captured (via `ProcessProbe.capture`) before its process died;
 * `source` is a `StartTimeSource` that reports `original.pid` as
 * belonging to a DIFFERENT, live process instance (a different
 * start-time) — simulating the OS having recycled the pid. A real OS
 * cannot be forced to recycle a specific pid deterministically, so this is
 * the fixture-level way to express the hazard while still composing with
 * the real `ProcessProbe`/`StartTimeSource` contract rather than
 * inventing a parallel one.
 */
export interface PidReuseHazard {
  readonly original: ProcessIdentity;
  readonly reusedStartTime: string;
  readonly source: StartTimeSource;
}

/** Explicit capability set — deliberately not boolean flags. */
export interface IpcFixture {
  /** Spawns a real short-lived `node -e` sleeper; resolves once the real
   * `'spawn'` event fires (process is actually running), never a blind sleep. */
  spawnSleeper(durationMs?: number): Promise<SpawnedProcess>;
  /** Spawns a real process that binds a real UDS listener at `socketPath`;
   * resolves once the child signals readiness over IPC (the socket is
   * actually bound), never a blind sleep. */
  spawnUdsListener(socketPath: string): Promise<SpawnedProcess>;
  /** Sends `signal` (default SIGKILL) and waits for the real `'exit'`
   * event — not a guessed delay. Idempotent: a no-op wait if the process
   * had already exited. */
  kill(proc: SpawnedProcess, signal?: NodeJS.Signals, timeoutMs?: number): Promise<ExitInfo>;
  /** Creates a real stale UDS socket file under a 0700 parent directory,
   * keyed via `store.socketPathFor(installationRoot)` (T009 — not
   * re-derived here) so the path is within the UDS budget the harness
   * already asserted on `store`. */
  createStaleSocket(store: MachineStateStore, installationRoot: string): Promise<StaleSocket>;
  /** Kills any still-running spawned processes and unlinks any created
   * socket parent dirs — best-effort, runs even after a prior throw.
   * Idempotent. */
  dispose(): Promise<void>;
}

/**
 * Produces the PID-reuse hazard for `original` (a real identity captured
 * before its process died). `reusedStartTime` must differ from
 * `original.startTime` — an identical value would not express reuse at
 * all, so this throws rather than silently accepting a no-op hazard.
 */
export function simulatePidReuse(
  original: ProcessIdentity,
  reusedStartTime: string = `${original.startTime}::reused-instance`,
): PidReuseHazard {
  if (reusedStartTime === original.startTime) {
    throw new Error(
      'simulatePidReuse: reusedStartTime must differ from original.startTime — an ' +
        'identical value describes the SAME process instance, not a reused pid. ' +
        'PT-002 exists precisely because a reused pid reports a DIFFERENT start-time.',
    );
  }
  const source: StartTimeSource = {
    read(pid: number): string | undefined {
      return pid === original.pid ? reusedStartTime : undefined;
    },
  };
  return { original, reusedStartTime, source };
}

/** Attempts a real UDS connection; resolves with the connect error rather
 * than throwing, since "connection refused" is the expected, asserted-on
 * outcome for a stale socket. */
export function connectUnixSocket(socketPath: string): Promise<NodeJS.ErrnoException> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    socket.once('error', (err: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve(err);
    });
    socket.once('connect', () => {
      socket.destroy();
      reject(
        new Error(
          `connectUnixSocket: unexpectedly connected to ${socketPath} — a live listener ` +
            'is answering, so this socket is not stale.',
        ),
      );
    });
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

function attachExitTracking(child: ChildProcess): Promise<ExitInfo> {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function spawnRaw(args: readonly string[], stdio: StdioOptions): Promise<SpawnedProcess> {
  const child = spawn(process.execPath, [...args], { stdio });
  const exited = attachExitTracking(child);
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve());
    child.once('error', (err: Error) => reject(err));
  });
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error(
      'spawnRaw: child reported no pid after a real "spawn" event — this cannot happen ' +
        'per Node semantics, but failing loud rather than returning an unusable handle.',
    );
  }
  return { pid, child, exited };
}

/** Waits for the child's real IPC readiness signal (or its bind-failure /
 * early-exit signal) — never a blind sleep. */
function waitForListenerReady(
  child: ChildProcess,
  socketPath: string,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `spawnUdsListener: no readiness signal from the child within ${timeoutMs}ms ` +
            `for socket ${socketPath}`,
        ),
      );
    }, timeoutMs);
    function cleanup(): void {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
    }
    function onMessage(msg: unknown): void {
      if (msg === 'ready') {
        cleanup();
        resolve();
      } else if (typeof msg === 'string' && msg.startsWith('error:')) {
        cleanup();
        reject(
          new Error(`spawnUdsListener: child reported bind failure: ${msg.slice('error:'.length)}`),
        );
      }
    }
    function onExit(code: number | null, signal: NodeJS.Signals | null): void {
      cleanup();
      reject(
        new Error(
          `spawnUdsListener: child exited (code=${String(code)}, signal=${String(signal)}) ` +
            'before signaling readiness',
        ),
      );
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
  });
}

function rmSafe(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort teardown; a leftover temp dir is not worth failing a test. */
  }
}

class DefaultIpcFixture implements IpcFixture {
  private readonly live = new Set<SpawnedProcess>();
  private readonly createdDirs = new Set<string>();
  private disposed = false;

  private track(proc: SpawnedProcess): void {
    this.live.add(proc);
    void proc.exited.then(() => {
      this.live.delete(proc);
    });
  }

  async spawnSleeper(durationMs = 30_000): Promise<SpawnedProcess> {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error(`spawnSleeper: durationMs must be a finite non-negative number, got ${durationMs}`);
    }
    const proc = await spawnRaw(['-e', `setTimeout(() => {}, ${durationMs});`], 'ignore');
    this.track(proc);
    return proc;
  }

  async spawnUdsListener(socketPath: string): Promise<SpawnedProcess> {
    const script = [
      "const net = require('node:net');",
      'const server = net.createServer();',
      "server.on('error', (err) => {",
      "  if (process.send) process.send('error:' + err.message);",
      '  process.exitCode = 1;',
      '});',
      'server.listen(process.argv[1], () => {',
      "  if (process.send) process.send('ready');",
      '});',
    ].join('\n');
    const proc = await spawnRaw(['-e', script, socketPath], ['ignore', 'pipe', 'pipe', 'ipc']);
    await waitForListenerReady(proc.child, socketPath);
    this.track(proc);
    return proc;
  }

  async kill(
    proc: SpawnedProcess,
    signal: NodeJS.Signals = 'SIGKILL',
    timeoutMs = 5000,
  ): Promise<ExitInfo> {
    const alreadyExited = proc.child.exitCode !== null || proc.child.signalCode !== null;
    if (!alreadyExited) {
      proc.child.kill(signal);
    }
    return withTimeout(
      proc.exited,
      timeoutMs,
      `kill(): process pid=${proc.pid} did not emit 'exit' within ${timeoutMs}ms after ${signal}`,
    );
  }

  async createStaleSocket(store: MachineStateStore, installationRoot: string): Promise<StaleSocket> {
    const socketPath = store.socketPathFor(installationRoot);
    const parentDir = dirname(socketPath);
    // PT-001: authorization is the 0700 PARENT DIR, never socket-file mode.
    mkdirSync(parentDir, { recursive: true });
    chmodSync(parentDir, 0o700);
    this.createdDirs.add(parentDir);

    const listener = await this.spawnUdsListener(socketPath);
    const deadPid = listener.pid;
    await this.kill(listener, 'SIGKILL');

    if (!existsSync(socketPath)) {
      throw new Error(
        `createStaleSocket: expected the socket inode to survive the SIGKILL'd listener ` +
          `at ${socketPath}, but it is gone — cannot express the stale-socket condition ` +
          'PT-002 requires (a graceful close() unlinks the file; only a hard kill leaves it).',
      );
    }

    return {
      socketPath,
      parentDir,
      deadPid,
      connect: () => connectUnixSocket(socketPath),
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const survivors = Array.from(this.live);
    await Promise.all(survivors.map((proc) => this.forceKillBestEffort(proc)));
    for (const dir of this.createdDirs) {
      rmSafe(dir);
    }
    this.createdDirs.clear();
  }

  private async forceKillBestEffort(proc: SpawnedProcess): Promise<void> {
    try {
      const alreadyExited = proc.child.exitCode !== null || proc.child.signalCode !== null;
      if (!alreadyExited) {
        proc.child.kill('SIGKILL');
      }
      await withTimeout(
        proc.exited,
        2000,
        `dispose(): timed out waiting for tracked process pid=${proc.pid} to exit`,
      );
    } catch {
      /* best-effort teardown; the SIGKILL above was already sent — nothing more
         we can do here without risking a hung test teardown. */
    }
  }
}

/** Creates a fresh, unshared `IpcFixture`. Caller MUST call `dispose()` (or
 * use `withIpcFixture` / `useIpcFixture`, which do it for you even on throw). */
export function createIpcFixture(): IpcFixture {
  return new DefaultIpcFixture();
}

/** Runs `fn` with a fresh fixture; disposes even if `fn` throws. */
export async function withIpcFixture<T>(fn: (fixture: IpcFixture) => Promise<T>): Promise<T> {
  const fixture = createIpcFixture();
  try {
    return await fn(fixture);
  } finally {
    await fixture.dispose();
  }
}

/**
 * Registers vitest `beforeEach`/`afterEach` that create a fresh fixture per
 * test and dispose it afterward (even on throw). Returns an accessor for
 * the current fixture; throws if read outside an active test.
 *
 * Usage:
 *   const fixture = useIpcFixture();
 *   it('kills a real process', async () => { await fixture().spawnSleeper(); ... });
 */
export function useIpcFixture(): () => IpcFixture {
  let current: IpcFixture | undefined;
  beforeEach(() => {
    current = createIpcFixture();
  });
  afterEach(async () => {
    await current?.dispose();
    current = undefined;
  });
  return (): IpcFixture => {
    if (current === undefined) {
      throw new Error(
        'ipc fixture accessed outside an active test — useIpcFixture() registers ' +
          'beforeEach/afterEach; read the accessor inside it()/test().',
      );
    }
    return current;
  };
}
