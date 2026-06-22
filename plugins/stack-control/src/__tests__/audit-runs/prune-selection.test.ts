// TASK-425 — pure retention-selection for `audit-runs prune`. No filesystem;
// selectForPrune is a pure function over dir names + options.

import { describe, it, expect } from 'vitest';
import { parseRunDirTimestamp, selectForPrune } from '../../audit-runs/prune.js';

const NOW = new Date('2026-06-22T00:00:00.000Z');

/** A run-dir name stamped at `iso`, for a feature slug. */
function runDir(iso: string, slug = 'feat'): string {
  const d = iso.replace(/-/g, '').replace(/:/g, '').replace('.', '');
  return `${d.slice(0, 8)}T${d.slice(9, 15)}${d.slice(15, 18)}Z-${slug}`;
}

describe('parseRunDirTimestamp', () => {
  it('round-trips an encoded run-dir prefix', () => {
    const ts = parseRunDirTimestamp('20260622T123456789Z-feat');
    expect(ts?.toISOString()).toBe('2026-06-22T12:34:56.789Z');
  });
  it('returns null for a foreign directory name', () => {
    expect(parseRunDirTimestamp('not-a-run-dir')).toBeNull();
    expect(parseRunDirTimestamp('stderr')).toBeNull();
  });
});

describe('selectForPrune — keepLast', () => {
  it('keeps the N newest and prunes the rest (newest first)', () => {
    const names = [
      runDir('2026-06-20T01:00:00.000Z'),
      runDir('2026-06-22T01:00:00.000Z'),
      runDir('2026-06-21T01:00:00.000Z'),
      runDir('2026-06-19T01:00:00.000Z'),
    ];
    const { keep, prune } = selectForPrune(names, { keepLast: 2, now: NOW });
    expect(keep).toEqual([runDir('2026-06-22T01:00:00.000Z'), runDir('2026-06-21T01:00:00.000Z')]);
    expect(prune).toEqual([runDir('2026-06-20T01:00:00.000Z'), runDir('2026-06-19T01:00:00.000Z')]);
  });

  it('keepLast >= count prunes nothing', () => {
    const names = [runDir('2026-06-22T01:00:00.000Z'), runDir('2026-06-21T01:00:00.000Z')];
    expect(selectForPrune(names, { keepLast: 5, now: NOW }).prune).toEqual([]);
  });
});

describe('selectForPrune — olderThanDays', () => {
  it('prunes dirs strictly older than the cutoff, keeps the rest', () => {
    const names = [
      runDir('2026-06-22T00:00:00.000Z'), // 0 days old → keep
      runDir('2026-06-19T00:00:00.000Z'), // 3 days old → keep (not strictly older than 3)
      runDir('2026-06-18T23:00:00.000Z'), // >3 days old → prune
      runDir('2026-06-01T00:00:00.000Z'), // far older → prune
    ];
    const { prune } = selectForPrune(names, { olderThanDays: 3, now: NOW });
    expect(prune).toEqual([
      runDir('2026-06-18T23:00:00.000Z'),
      runDir('2026-06-01T00:00:00.000Z'),
    ]);
  });
});

describe('selectForPrune — foreign dirs are never candidates', () => {
  it('ignores names without the run-dir grammar', () => {
    const names = [runDir('2026-06-22T01:00:00.000Z'), 'README.md', '.gitkeep', 'some-other-dir'];
    const { keep, prune } = selectForPrune(names, { keepLast: 0, now: NOW });
    // The one valid run dir is pruned (keepLast 0); the foreign names appear in neither set.
    expect(prune).toEqual([runDir('2026-06-22T01:00:00.000Z')]);
    expect(keep).toEqual([]);
  });
});
