/**
 * Phase 17 Task 2 — hook-run-marker library tests.
 *
 * Round-trip + tolerant-read invariants:
 *   1. Write then read returns the same marker.
 *   2. Read of missing file returns null (not throw).
 *   3. Read of corrupted JSON returns null.
 *   4. Read of schema-mismatched JSON returns null.
 *   5. Write of malformed marker throws (caller responsibility).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readHookRunMarker,
  writeHookRunMarker,
  markerPathFor,
  type HookRunMarker,
} from '../../../scope-discovery/promote-findings/hook-run-marker.js';

describe('hook-run-marker — Phase 17 Task 2', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'hook-run-marker-'));
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('round-trips a valid marker', async () => {
    const marker: HookRunMarker = {
      tip: 'abc123def4567890',
      timestamp: '2026-05-31T20:00:00.000Z',
      runDir: '/tmp/audit-runs/2026-05-31-2000-feat',
      disposition: 'fired-and-promoted',
      findingsCount: 3,
      promotedCount: 3,
      slushedCount: 0,
    };
    await writeHookRunMarker({ repoRoot: tmp, marker });
    const round = await readHookRunMarker({ repoRoot: tmp });
    expect(round).toEqual(marker);
  });

  it('returns null when the marker file does not exist', async () => {
    const result = await readHookRunMarker({ repoRoot: tmp });
    expect(result).toBeNull();
  });

  it('returns null when the marker file contains invalid JSON', async () => {
    await writeFile(markerPathFor(tmp), '{not json}', 'utf8');
    const result = await readHookRunMarker({ repoRoot: tmp });
    expect(result).toBeNull();
  });

  it('returns null when JSON is well-formed but schema-mismatched', async () => {
    await writeFile(
      markerPathFor(tmp),
      JSON.stringify({ wrongShape: true, missingFields: 'yep' }),
      'utf8',
    );
    const result = await readHookRunMarker({ repoRoot: tmp });
    expect(result).toBeNull();
  });

  it('returns null when disposition is unknown enum value', async () => {
    await writeFile(
      markerPathFor(tmp),
      JSON.stringify({
        tip: 'abc1234',
        timestamp: '2026-05-31T20:00:00.000Z',
        runDir: null,
        disposition: 'fired-and-imploded', // not in enum
        findingsCount: 0,
        promotedCount: 0,
        slushedCount: 0,
      }),
      'utf8',
    );
    const result = await readHookRunMarker({ repoRoot: tmp });
    expect(result).toBeNull();
  });

  it('throws on write of a malformed marker (caller must validate)', async () => {
    const bogus = {
      tip: 'short', // less than 7 chars
      timestamp: 'not-a-date',
      runDir: null,
      disposition: 'fired-and-promoted',
      findingsCount: -1, // negative
      promotedCount: 0,
      slushedCount: 0,
    } as unknown as HookRunMarker;
    await expect(writeHookRunMarker({ repoRoot: tmp, marker: bogus })).rejects.toThrow();
  });

  it('writes atomically (parent dir must exist; write succeeds with valid input)', async () => {
    const marker: HookRunMarker = {
      tip: 'def4567890abcdef',
      timestamp: '2026-05-31T21:00:00.000Z',
      runDir: null,
      disposition: 'no-new-diff-skip',
      findingsCount: 0,
      promotedCount: 0,
      slushedCount: 0,
    };
    await writeHookRunMarker({ repoRoot: tmp, marker });
    const round = await readHookRunMarker({ repoRoot: tmp });
    expect(round?.disposition).toBe('no-new-diff-skip');
    expect(round?.runDir).toBeNull();
  });
});
