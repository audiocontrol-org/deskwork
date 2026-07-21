// specs/036-fleet-control-plane — T5/Task 4 host-level enrollment-credential
// custody. Mirrors token.ts's custody pattern (openTokenCustody) but keyed at
// the HOST level (locateHostState) rather than per-installation
// (locateMachineState) — the enrollment credential is shared across every
// installation on a host, not scoped to one installationRoot.
//
// Uses the T009 harness (useMachineStateStore) so nothing lands in a real
// developer $HOME (.claude/rules/testing.md — real filesystem, never mocked,
// but always redirected under a temp root).

import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { locateHostState } from '../../src/machine-state/locate.js';
import { openEnrollmentCustody } from '../../src/machine-state/enrollment-custody.js';
import { useMachineStateStore } from './_machine-state-harness.js';

describe('host-level enrollment custody', () => {
  useMachineStateStore(); // redirects HOME/XDG so nothing lands in a real home

  it('locateHostState resolves a host-level durable dir under the redirected store', () => {
    const host = locateHostState();
    expect(typeof host.durableDir).toBe('string');
    expect(host.durableDir.length).toBeGreaterThan(0);
  });

  it('write then read round-trips the credential at 0600', () => {
    const host = locateHostState();
    const custody = openEnrollmentCustody(host.durableDir);
    expect(custody.read()).toBeUndefined();
    custody.write('cred-abc');
    expect(custody.read()).toBe('cred-abc');
    if (process.platform !== 'win32') {
      const mode = statSync(`${host.durableDir}/enrollment-credential`).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});
