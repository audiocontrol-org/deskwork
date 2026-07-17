/**
 * specs/036-fleet-control-plane — T006 (RED), PT-002.
 *
 * PT-002 (research.md "Spawn race and stale locks" — SETTLED, not
 * re-derived here): stale-socket recovery verifies liveness by
 * **PID + process start-time**, because "start-time defeats PID reuse."
 * Node has no native `flock`, so liveness of a specific process INSTANCE
 * has to be reconstructed in userspace: a bare PID is unsound because the
 * OS recycles PIDs — a stale PID may now belong to an unrelated process.
 * `ProcessProbe` answers "is the process that had this PID *and* this
 * start-time still alive?", never merely "does something with this PID
 * exist?".
 *
 * `StartTimeSource` is the injected DI seam (Constitution Principle VI):
 * the PID-reuse-defeating SEMANTICS (capture/isAlive) are pinned against a
 * fake source with zero real-process dependency, while a SEPARATE suite
 * exercises the real system source against a real short-lived child
 * process — a mock cannot actually die, so the "did liveness actually flip
 * to false on real process death" claim needs a real process.
 *
 * Platform coverage (see design contract in the dispatch prompt): Linux
 * (`/proc/<pid>/stat` field 22) and macOS (`ps -o lstart=`) are
 * implemented. Windows has NO implementation here — the factory fails loud
 * rather than fabricating unverified behavior.
 */

import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  createSystemStartTimeSource,
  ProcessProbe,
  parseLinuxProcStat,
  type ProcessIdentity,
  type StartTimeSource,
} from '../../src/fleet/process-probe.js';

describe('ProcessProbe semantics against a fake StartTimeSource (PT-002, no real process needed)', () => {
  it('capture() returns undefined when no process exists at the given pid', () => {
    const source: StartTimeSource = { read: () => undefined };
    const probe = new ProcessProbe(source);
    expect(probe.capture(999999)).toBeUndefined();
  });

  it('capture() returns {pid, startTime} when the source reports a live process', () => {
    const source: StartTimeSource = { read: (pid) => (pid === 42 ? 'start-a' : undefined) };
    const probe = new ProcessProbe(source);
    expect(probe.capture(42)).toEqual({ pid: 42, startTime: 'start-a' });
  });

  it('isAlive() is true while pid + start-time both still match', () => {
    const source: StartTimeSource = { read: () => 'start-a' };
    const probe = new ProcessProbe(source);
    const identity = probe.capture(42) as ProcessIdentity;
    expect(probe.isAlive(identity)).toBe(true);
  });

  it('isAlive() is FALSE when the pid exists but start-time differs — PID REUSE DEFEATED (PT-002 core contract)', () => {
    let current = 'start-a';
    const source: StartTimeSource = { read: () => current };
    const probe = new ProcessProbe(source);
    const identity = probe.capture(42) as ProcessIdentity;
    // The original process at pid 42 died; the OS recycled pid 42 to an
    // unrelated NEW process with a DIFFERENT start-time. Bare-PID liveness
    // would wrongly say "still alive" here — the whole point of PT-002.
    current = 'start-b';
    expect(probe.isAlive(identity)).toBe(false);
  });

  it('isAlive() is false once no process remains at the pid at all', () => {
    let exists = true;
    const source: StartTimeSource = { read: () => (exists ? 'start-a' : undefined) };
    const probe = new ProcessProbe(source);
    const identity = probe.capture(42) as ProcessIdentity;
    exists = false;
    expect(probe.isAlive(identity)).toBe(false);
  });
});

describe('Linux /proc/<pid>/stat field-22 parser (pure, fixture-driven — no /proc available on this dev host)', () => {
  it('extracts starttime (field 22) even when comm contains spaces and parentheses', () => {
    // comm = "my weird (proc)" — per `man proc`, comm can contain anything
    // including ')' and whitespace, so parsing must key off the LAST ')'.
    const stat =
      '4242 (my weird (proc)) S 1 4242 4242 0 -1 4194560 100 0 0 0 10 5 0 0 20 0 4 0 ' +
      '999888777 10000000 500 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
    expect(parseLinuxProcStat(stat)).toBe('999888777');
  });

  it('throws loud on malformed input rather than returning a fabricated value', () => {
    expect(() => parseLinuxProcStat('not a valid stat line')).toThrow();
  });
});

describe('createSystemStartTimeSource platform dispatch', () => {
  it('fails loud for a platform with no implemented start-time source (Windows is NOT faked)', () => {
    expect(() => createSystemStartTimeSource('win32')).toThrow(/win32/);
  });

  it('fails loud for an arbitrary unimplemented platform string', () => {
    expect(() => createSystemStartTimeSource('sunos')).toThrow(/sunos/);
  });
});

describe('ProcessProbe against a REAL short-lived child process (no mocks — a mock cannot actually die)', () => {
  const platform = process.platform;
  const platformSupported = platform === 'darwin' || platform === 'linux';

  it.runIf(platformSupported)(
    'reports alive while the child is running and flips to not-alive after real process death',
    async () => {
      const source = createSystemStartTimeSource(platform);
      const probe = new ProcessProbe(source);

      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', () => resolve());
        child.once('error', reject);
      });

      const pid = child.pid;
      if (pid === undefined) throw new Error('spawned child reported no pid');

      const identity = probe.capture(pid);
      expect(identity).toBeDefined();
      expect(identity?.pid).toBe(pid);
      expect(probe.isAlive(identity as ProcessIdentity)).toBe(true);

      child.kill('SIGKILL');
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
      });

      // Real process death observed via the 'exit' event (not a timer) —
      // deterministic on the actual OS-reported termination, no fixed
      // sleep. A short bounded poll absorbs any residual OS-visibility lag
      // between reap and the process table / ps reflecting it.
      await waitUntilOrThrow(
        () => probe.isAlive(identity as ProcessIdentity) === false,
        2000,
        'process still reported alive after real SIGKILL + exit',
      );
    },
  );

  it.runIf(platformSupported)(
    'capture() returns undefined for a pid with no live process (best-effort: an implausibly large, surely-unassigned pid)',
    () => {
      const source = createSystemStartTimeSource(platform);
      const probe = new ProcessProbe(source);
      // Judgment call: there is no portable "guaranteed free pid" primitive.
      // 2147483646 sits far above any real OS pid_max (macOS/Linux max out
      // in the low hundred-thousands) so collision is not a realistic flake
      // source; the PID-reuse-defeat contract itself is proven separately
      // above against a deterministic fake source.
      expect(probe.capture(2147483646)).toBeUndefined();
    },
  );

  if (!platformSupported) {
    it.skip(`real-process suite skipped: platform "${platform}" has no ProcessProbe start-time source`, () => {});
  }
});

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
