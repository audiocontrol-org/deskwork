/**
 * specs/036-fleet-control-plane — T036 (RED), PT-002 / contracts/
 * local-socket-protocol.md § C6 (stale-socket recovery).
 *
 * THE CONTRACT UNDER TEST (SETTLED, not re-derived here): a leftover socket
 * FILE with no listener behind it yields `ECONNREFUSED` on connect. Recovery:
 * verify the previous owner's liveness by **PID + process start-time**
 * (start-time DEFEATS PID reuse — a recycled PID must NOT be mistaken for a
 * live sidecar), then unlink the stale socket and re-bind. Where the prior
 * owner is genuinely alive, the election defers (loses silently) rather than
 * stealing a live sidecar's endpoint.
 *
 * WHY REAL SOCKETS/PROCESSES: a mock cannot leave a real stale inode behind
 * or actually die from SIGKILL. The T011 ipc-fixture provides those cruel,
 * real conditions — `createStaleSocket` binds a real UDS listener, SIGKILLs
 * it, and leaves the inode; `simulatePidReuse` composes with the REAL
 * `ProcessProbe`/`StartTimeSource` contract so the PID-reuse defeat this
 * asserts is the real one, not a fixture-invented one.
 *
 * Store redirected via the T009 harness; real ipc-fixture (T011) reused for
 * every stale-socket / PID-reuse condition. Relative `.js` imports (node16);
 * no vitest fake timers.
 */

import { describe, expect, it } from 'vitest';
import { ProcessProbe, createSystemStartTimeSource, type ProcessIdentity, type StartTimeSource } from '../../src/fleet/process-probe.js';
import { electSidecar, type OwnerRegistry } from '../../src/sidecar/server.js';
import { createIpcFixture, simulatePidReuse } from './_ipc-fixture.js';
import { useMachineStateStore } from './_machine-state-harness.js';

/** An in-memory owner registry seeded with a fixed recorded identity (or
 * none). Lets a test control EXACTLY what the prior-owner record says,
 * independent of any file on disk, so the ProcessProbe liveness decision is
 * the only thing under test. */
function fixedOwnerRegistry(recorded: ProcessIdentity | undefined): OwnerRegistry {
  let current = recorded;
  return {
    read: () => current,
    write: (identity: ProcessIdentity) => {
      current = identity;
    },
    clear: () => {
      current = undefined;
    },
  };
}

describe('stale-socket recovery: recover a dead endpoint, never steal a live one (T036, PT-002 / C6)', () => {
  const store = useMachineStateStore();

  it('a stale socket file (crashed listener, no owner record) is confirmed refused, then unlinked and re-bound', async () => {
    const s = store();
    const fixture = createIpcFixture();
    try {
      const stale = await fixture.createStaleSocket(s, s.root);

      // Ground truth: the leftover inode refuses connections — no listener.
      const connectErr = await stale.connect();
      expect(connectErr.code).toBe('ECONNREFUSED');

      const probe = new ProcessProbe(createSystemStartTimeSource());
      const selfIdentity = probe.capture(process.pid);
      if (selfIdentity === undefined) {
        throw new Error('could not capture this process identity via the real ProcessProbe');
      }

      // No owner record survived the crash → recovery cannot vouch the prior
      // owner is alive → it must recover (unlink + re-bind), not defer.
      const outcome = await electSidecar({
        socketPath: stale.socketPath,
        probe,
        selfIdentity,
        ownerRegistry: fixedOwnerRegistry(undefined),
      });

      expect(outcome.kind).toBe('won');
      if (outcome.kind === 'won') {
        await outcome.server.close();
      }
    } finally {
      await fixture.dispose();
    }
  });

  it('a RECYCLED PID is NOT mistaken for a live sidecar — start-time defeats PID reuse, so recovery proceeds', async () => {
    const s = store();
    const fixture = createIpcFixture();
    try {
      const stale = await fixture.createStaleSocket(s, s.root);
      const deadPid = stale.deadPid;

      // The prior owner's RECORDED identity (as it would have been captured
      // while the now-dead listener was alive).
      const recordedOwner: ProcessIdentity = { pid: deadPid, startTime: 'owner-start-time' };

      // The OS recycled `deadPid` to a DIFFERENT, live process instance — the
      // exact hazard PT-002 exists to defeat. `simulatePidReuse` yields a REAL
      // `StartTimeSource` reporting a DIFFERENT start-time for `deadPid`, so
      // the real `ProcessProbe.isAlive(recordedOwner)` must return false.
      const hazard = simulatePidReuse(recordedOwner);
      const probe = new ProcessProbe(hazard.source);
      // Sanity: the real probe rejects the reused PID as NOT the same instance.
      expect(probe.isAlive(recordedOwner)).toBe(false);

      const selfIdentity: ProcessIdentity = { pid: process.pid, startTime: 'self-start-time' };

      const outcome = await electSidecar({
        socketPath: stale.socketPath,
        probe,
        selfIdentity,
        ownerRegistry: fixedOwnerRegistry(recordedOwner),
      });

      // Recycled PID ⇒ not a live sidecar ⇒ the election recovers and wins,
      // rather than deferring to a phantom "live owner".
      expect(outcome.kind).toBe('won');
      if (outcome.kind === 'won') {
        await outcome.server.close();
      }
    } finally {
      await fixture.dispose();
    }
  });

  it('a GENUINELY-live prior owner (start-time matches) is NOT stolen — the election defers and loses silently', async () => {
    const s = store();
    const fixture = createIpcFixture();
    try {
      const stale = await fixture.createStaleSocket(s, s.root);
      const deadPid = stale.deadPid;

      const recordedOwner: ProcessIdentity = { pid: deadPid, startTime: 'owner-start-time' };

      // The recorded owner is genuinely still the same instance: the source
      // reports the SAME start-time for its PID. The socket refuses (mid
      // restart, say), but PID+start-time proves the owner is alive, so the
      // contract says defer — do not steal a live sidecar's endpoint.
      const liveSource: StartTimeSource = {
        read: (pid) => (pid === deadPid ? 'owner-start-time' : undefined),
      };
      const probe = new ProcessProbe(liveSource);
      expect(probe.isAlive(recordedOwner)).toBe(true);

      const selfIdentity: ProcessIdentity = { pid: process.pid, startTime: 'self-start-time' };

      const outcome = await electSidecar({
        socketPath: stale.socketPath,
        probe,
        selfIdentity,
        ownerRegistry: fixedOwnerRegistry(recordedOwner),
      });

      expect(outcome.kind).toBe('lost');
      // The lost outcome carries the already-elected owner's pid so `sidecar
      // run` can name it on stderr instead of exiting silently.
      if (outcome.kind === 'lost') expect(outcome.ownerPid).toBe(deadPid);
    } finally {
      await fixture.dispose();
    }
  });
});
