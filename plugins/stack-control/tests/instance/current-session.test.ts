// T012 (RED test) — machine-local current-session record store.
// Mints and persists the current session (sessionId, startedAt ISO timestamp) to
// the machine-local durable dir. Supersede: a second mint() returns the OLD
// sessionId (so the caller can emit session.ended for it) then overwrites with
// the new record.
//
// Contract (data-model.md D9):
// - Record shape: { sessionId: string, startedAt: string /* ISO */ }
// - mint(sessionId, startedAt) writes to durable dir, returns the OLD sessionId if
//   superseding (or void/undefined on first write)
// - read() returns the record or null
// - clear() removes the record
// - Never writes to git-tracked paths (durableDir is machine-local, outside git)

import { describe, it, expect } from 'vitest';
import { useMachineStateStore } from '../fleet/_machine-state-harness.js';
import * as CurrentSession from '../../src/machine-state/current-session.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('CurrentSession store (T012)', () => {
  const store = useMachineStateStore();

  it('mint writes a record to the durable dir', () => {
    const sessionId = 'session-001';
    const startedAt = '2026-07-18T10:00:00Z';

    const result = CurrentSession.mint(sessionId, startedAt);

    // First mint should return undefined (no prior session to supersede)
    expect(result).toBeUndefined();

    // Record should be readable
    const record = CurrentSession.read();
    expect(record).toEqual({ sessionId, startedAt });
  });

  it('read returns null when no record exists', () => {
    const record = CurrentSession.read();
    expect(record).toBeNull();
  });

  it('mint returns the old sessionId when superseding', () => {
    const session1 = 'session-001';
    const time1 = '2026-07-18T10:00:00Z';
    CurrentSession.mint(session1, time1);

    const session2 = 'session-002';
    const time2 = '2026-07-18T11:00:00Z';
    const oldId = CurrentSession.mint(session2, time2);

    // Supersede should return the old sessionId
    expect(oldId).toBe(session1);

    // New record should be active
    const record = CurrentSession.read();
    expect(record).toEqual({ sessionId: session2, startedAt: time2 });
  });

  it('clear removes the record', () => {
    const sessionId = 'session-test-clear';
    const startedAt = '2026-07-18T10:30:00Z';
    CurrentSession.mint(sessionId, startedAt);

    // Verify it was written
    expect(CurrentSession.read()).toEqual({ sessionId, startedAt });

    // Clear it
    CurrentSession.clear();

    // Should be gone
    expect(CurrentSession.read()).toBeNull();
  });

  it('record is persisted under durable dir, not under repo tree', () => {
    const sessionId = 'session-durable-test';
    const startedAt = '2026-07-18T10:45:00Z';
    CurrentSession.mint(sessionId, startedAt);

    // The file should exist under the redirected durable dir (via the harness)
    const machineStore = store();
    const durableDir = machineStore.durableDir;
    expect(durableDir).toBeDefined();

    // Current session record file should exist in durable dir
    const recordPath = join(durableDir, 'current-session');
    expect(existsSync(recordPath)).toBe(true);

    // Verify it's not under a git-tracked path (no .stack-control/)
    expect(recordPath).not.toMatch(/\.stack-control/);
  });

  it('read after clear is null', () => {
    const sessionId = 'session-lifecycle';
    const startedAt = '2026-07-18T11:00:00Z';
    CurrentSession.mint(sessionId, startedAt);
    expect(CurrentSession.read()).not.toBeNull();

    CurrentSession.clear();
    expect(CurrentSession.read()).toBeNull();

    // Re-mint should work after clear
    const session2 = 'session-after-clear';
    const time2 = '2026-07-18T11:30:00Z';
    CurrentSession.mint(session2, time2);
    expect(CurrentSession.read()).toEqual({ sessionId: session2, startedAt: time2 });
  });
});
