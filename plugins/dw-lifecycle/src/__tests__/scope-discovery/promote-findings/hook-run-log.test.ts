/**
 * Phase 17 Task 5 — hook-run-log library tests.
 *
 * Append-only JSONL log:
 *   1. Read of missing file returns empty array (not throw).
 *   2. Append + read round-trips one entry.
 *   3. Multiple appends accumulate; read returns them in order.
 *   4. Malformed lines are silently skipped.
 *   5. Schema-mismatched lines silently skipped.
 *   6. Write of invalid entry throws.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readHookRunLog,
  appendHookRunLogEntry,
  hookRunLogPathFor,
  type HookRunLogEntry,
} from '../../../scope-discovery/promote-findings/hook-run-log.js';

describe('hook-run-log — Phase 17 Task 5', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'hook-run-log-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns empty array when the log does not exist', async () => {
    const entries = await readHookRunLog(tmp);
    expect(entries).toEqual([]);
  });

  it('round-trips one appended entry', async () => {
    const entry: HookRunLogEntry = {
      tip: 'abc1234567890',
      timestamp: '2026-05-31T20:00:00.000Z',
      disposition: 'fired-and-promoted',
      runDir: '/tmp/audit-runs/2026-05-31-2000-feat',
    };
    await appendHookRunLogEntry(tmp, entry);
    const read = await readHookRunLog(tmp);
    expect(read).toEqual([entry]);
  });

  it('accumulates multiple appends in chronological order', async () => {
    const a: HookRunLogEntry = {
      tip: 'aaa1234',
      timestamp: '2026-05-31T19:00:00.000Z',
      disposition: 'fired-and-promoted',
      runDir: null,
    };
    const b: HookRunLogEntry = {
      tip: 'bbb5678',
      timestamp: '2026-05-31T20:00:00.000Z',
      disposition: 'no-new-diff-skip',
      runDir: null,
    };
    const c: HookRunLogEntry = {
      tip: 'ccc9012',
      timestamp: '2026-05-31T21:00:00.000Z',
      disposition: 'fired-and-slushed',
      runDir: '/tmp/run-3',
    };
    await appendHookRunLogEntry(tmp, a);
    await appendHookRunLogEntry(tmp, b);
    await appendHookRunLogEntry(tmp, c);
    const read = await readHookRunLog(tmp);
    expect(read).toEqual([a, b, c]);
  });

  it('silently skips malformed JSON lines', async () => {
    const path = hookRunLogPathFor(tmp);
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await writeFile(
      path,
      [
        '{not-json',
        JSON.stringify({
          tip: 'good1234',
          timestamp: '2026-05-31T20:00:00.000Z',
          disposition: 'fired-and-promoted',
          runDir: null,
        }),
        'also not json',
      ].join('\n'),
      'utf8',
    );
    const read = await readHookRunLog(tmp);
    expect(read).toHaveLength(1);
    expect(read[0]?.tip).toBe('good1234');
  });

  it('silently skips schema-mismatched lines (wrong disposition enum)', async () => {
    const path = hookRunLogPathFor(tmp);
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await appendFile(
      path,
      JSON.stringify({
        tip: 'abc1234',
        timestamp: '2026-05-31T20:00:00.000Z',
        disposition: 'imploded-spectacularly',
        runDir: null,
      }) + '\n',
      'utf8',
    );
    const read = await readHookRunLog(tmp);
    expect(read).toEqual([]);
  });

  // Per AUDIT-20260601-claude-01 (BLOCKING follow-on): hasBootstrapSentinel
  // must return true when sentinel exists OR log non-empty, and backfill
  // the sentinel on read. Without this, fresh clones / migrating
  // projects with a non-empty log but no sentinel fall into the boot-
  // case "allow" branch and the pre-push gate fails open.
  it('hasBootstrapSentinel: returns true when sentinel file is present', async () => {
    const { hasBootstrapSentinel, bootstrapSentinelPathFor } = await import(
      '../../../scope-discovery/promote-findings/hook-run-log.js'
    );
    const fs = await import('node:fs/promises');
    await fs.mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await fs.writeFile(bootstrapSentinelPathFor(tmp), 'whatever', 'utf8');
    expect(await hasBootstrapSentinel(tmp)).toBe(true);
  });

  it('hasBootstrapSentinel: returns false on truly-fresh project (no sentinel, empty log)', async () => {
    const { hasBootstrapSentinel } = await import(
      '../../../scope-discovery/promote-findings/hook-run-log.js'
    );
    expect(await hasBootstrapSentinel(tmp)).toBe(false);
  });

  it('hasBootstrapSentinel: returns true AND backfills sentinel when log non-empty but sentinel missing (migration/clone)', async () => {
    const { hasBootstrapSentinel, bootstrapSentinelPathFor, appendHookRunLogEntry } = await import(
      '../../../scope-discovery/promote-findings/hook-run-log.js'
    );
    const fs = await import('node:fs/promises');
    // Seed a log entry then DELETE the sentinel to simulate the
    // migration / fresh-clone state (the bug claude-01 named).
    await appendHookRunLogEntry(tmp, {
      tip: 'aaa1234567',
      timestamp: '2026-05-31T20:00:00.000Z',
      disposition: 'fired-and-promoted',
      runDir: null,
    });
    await fs.unlink(bootstrapSentinelPathFor(tmp));
    // Pre-call: sentinel definitively absent.
    let sentinelMissing = false;
    try {
      await fs.stat(bootstrapSentinelPathFor(tmp));
    } catch {
      sentinelMissing = true;
    }
    expect(sentinelMissing).toBe(true);
    // Call hasBootstrapSentinel — should return true AND backfill.
    expect(await hasBootstrapSentinel(tmp)).toBe(true);
    // Sentinel now exists.
    const stat = await fs.stat(bootstrapSentinelPathFor(tmp));
    expect(stat.isFile()).toBe(true);
  });

  it('throws on append of invalid entry (caller must validate)', async () => {
    const bogus = {
      tip: 'x', // too short
      timestamp: 'not-a-date',
      disposition: 'fired-and-promoted',
      runDir: null,
    } as unknown as HookRunLogEntry;
    await expect(appendHookRunLogEntry(tmp, bogus)).rejects.toThrow();
  });
});
