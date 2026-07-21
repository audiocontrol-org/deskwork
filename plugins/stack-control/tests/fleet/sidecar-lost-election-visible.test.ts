// specs/037 — a lost election must be OBSERVABLE. Previously `sidecar run`
// exited 0 with no output when it lost, indistinguishable from a healthy start;
// a running-but-not-elected process looked identical to the winner. `run` now
// writes a diagnostic line to stderr naming the already-elected owner.
import { describe, expect, it } from 'vitest';
import { lostElectionMessage } from '../../src/subcommands/sidecar.js';

describe('sidecar lost-election message (visible, not silent)', () => {
  it('names the already-elected pid when the winner is known', () => {
    const msg = lostElectionMessage({ reason: 'live-owner', ownerPid: 4242 });
    expect(msg).toMatch(/lost election/);
    expect(msg).toMatch(/pid 4242/);
    expect(msg).toMatch(/already elected for this installation/);
  });

  it('falls back to "another sidecar" when the owner pid is not known', () => {
    const msg = lostElectionMessage({ reason: 'address-in-use' });
    expect(msg).toMatch(/lost election/);
    expect(msg).toMatch(/another sidecar/);
    expect(msg).toMatch(/already elected for this installation/);
  });
});
