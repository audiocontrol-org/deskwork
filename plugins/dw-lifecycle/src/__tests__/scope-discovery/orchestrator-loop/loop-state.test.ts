/**
 * Tests for loop-state persistence + advancement.
 *
 * Per the project test rules: fixture trees on disk, no fs mocks.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_LOOP_STATE,
  LOOP_STATE_FILENAME,
  advanceLoopState,
  generateTurnId,
  loadLoopState,
  persistLoopState,
} from '../../../scope-discovery/orchestrator-loop/loop-state.js';
import type {
  LoopState,
  TurnHistoryEntry,
} from '../../../scope-discovery/orchestrator-loop/loop-types.js';

describe('orchestrator-loop/loop-state', () => {
  let tmp: string;
  const RUNTIME_DIR = '.dw-lifecycle/scope-discovery/orchestrator-runtime';

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'loop-state-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns EMPTY_LOOP_STATE when the state file is absent', async () => {
    const state = await loadLoopState(tmp, RUNTIME_DIR);
    expect(state).toEqual(EMPTY_LOOP_STATE);
    expect(state.lastAuditWatermark).toBe('');
    expect(state.lastTurnId).toBe('');
    expect(state.turnHistory.length).toBe(0);
  });

  it('round-trips state through persist + load', async () => {
    const entry: TurnHistoryEntry = {
      turnId: '20260526120000-abcdef',
      turnAt: '2026-05-26T12:00:00.000Z',
      newAuditEntries: 2,
      wrongDecisionEvents: 1,
      catalogEditProposals: 1,
      escalationsQueued: 0,
      judgeRan: true,
      auditorFired: true,
    };
    const state: LoopState = {
      version: 1,
      lastAuditWatermark: 'AUDIT-20260526-02',
      lastTurnId: entry.turnId,
      turnHistory: [entry],
      persistedAt: '2026-05-26T12:00:00.000Z',
    };
    await persistLoopState(tmp, state, {
      runtimeDirOverride: RUNTIME_DIR,
      retention: 24,
    });
    const loaded = await loadLoopState(tmp, RUNTIME_DIR);
    expect(loaded).toEqual(state);
  });

  it('truncates turnHistory at persist-time to the retention bound', async () => {
    const buildEntry = (n: number): TurnHistoryEntry => ({
      turnId: `2026052612${n.toString().padStart(2, '0')}00-aaaaaa`,
      turnAt: `2026-05-26T12:${n.toString().padStart(2, '0')}:00.000Z`,
      newAuditEntries: 0,
      wrongDecisionEvents: 0,
      catalogEditProposals: 0,
      escalationsQueued: 0,
      judgeRan: false,
      auditorFired: false,
    });
    const oversized: LoopState = {
      version: 1,
      lastAuditWatermark: '',
      lastTurnId: 'x',
      turnHistory: Array.from({ length: 30 }, (_, i) => buildEntry(i)),
      persistedAt: '2026-05-26T13:00:00.000Z',
    };
    await persistLoopState(tmp, oversized, {
      runtimeDirOverride: RUNTIME_DIR,
      retention: 24,
    });
    const loaded = await loadLoopState(tmp, RUNTIME_DIR);
    expect(loaded.turnHistory.length).toBe(24);
    // Newest-first preserved.
    expect(loaded.turnHistory[0]?.turnId).toBe(oversized.turnHistory[0]?.turnId);
  });

  it('throws on malformed state file (bad JSON)', async () => {
    const dir = join(tmp, RUNTIME_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, LOOP_STATE_FILENAME), 'not json {', 'utf8');
    await expect(loadLoopState(tmp, RUNTIME_DIR)).rejects.toThrow(
      /cannot parse/,
    );
  });

  it('throws on unsupported version', async () => {
    const dir = join(tmp, RUNTIME_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, LOOP_STATE_FILENAME),
      JSON.stringify({ version: 99, lastAuditWatermark: '', lastTurnId: '', turnHistory: [], persistedAt: '2026-05-26T00:00:00.000Z' }),
      'utf8',
    );
    await expect(loadLoopState(tmp, RUNTIME_DIR)).rejects.toThrow(
      /unsupported version/,
    );
  });

  it('throws on a history entry missing required fields', async () => {
    const dir = join(tmp, RUNTIME_DIR);
    await mkdir(dir, { recursive: true });
    const bad = {
      version: 1,
      lastAuditWatermark: '',
      lastTurnId: '',
      persistedAt: '2026-05-26T00:00:00.000Z',
      turnHistory: [
        { turnId: 'x' }, // missing newAuditEntries etc.
      ],
    };
    await writeFile(
      join(dir, LOOP_STATE_FILENAME),
      JSON.stringify(bad),
      'utf8',
    );
    await expect(loadLoopState(tmp, RUNTIME_DIR)).rejects.toThrow(
      /turnHistory/,
    );
  });

  it('throws on non-integer newAuditEntries', async () => {
    const dir = join(tmp, RUNTIME_DIR);
    await mkdir(dir, { recursive: true });
    const bad = {
      version: 1,
      lastAuditWatermark: '',
      lastTurnId: '',
      persistedAt: '2026-05-26T00:00:00.000Z',
      turnHistory: [
        {
          turnId: 'x',
          turnAt: '2026-05-26T00:00:00.000Z',
          newAuditEntries: 2.5,
          wrongDecisionEvents: 0,
          catalogEditProposals: 0,
          escalationsQueued: 0,
          judgeRan: false,
          auditorFired: false,
        },
      ],
    };
    await writeFile(
      join(dir, LOOP_STATE_FILENAME),
      JSON.stringify(bad),
      'utf8',
    );
    await expect(loadLoopState(tmp, RUNTIME_DIR)).rejects.toThrow(
      /newAuditEntries/,
    );
  });

  it('reads the persistedAt file written via persistLoopState', async () => {
    const state: LoopState = {
      version: 1,
      lastAuditWatermark: 'AUDIT-20260526-05',
      lastTurnId: '20260526120000-abcdef',
      turnHistory: [],
      persistedAt: '2026-05-26T12:00:00.000Z',
    };
    await persistLoopState(tmp, state, {
      runtimeDirOverride: RUNTIME_DIR,
      retention: 24,
    });
    const path = join(tmp, RUNTIME_DIR, LOOP_STATE_FILENAME);
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text);
    expect(parsed.persistedAt).toBe('2026-05-26T12:00:00.000Z');
    expect(parsed.lastAuditWatermark).toBe('AUDIT-20260526-05');
  });

  describe('advanceLoopState (pure)', () => {
    it('prepends new history entry; updates watermark + lastTurnId', () => {
      const prior: LoopState = {
        version: 1,
        lastAuditWatermark: 'AUDIT-20260526-02',
        lastTurnId: '20260525120000-aaaaaa',
        turnHistory: [
          {
            turnId: '20260525120000-aaaaaa',
            turnAt: '2026-05-25T12:00:00.000Z',
            newAuditEntries: 1,
            wrongDecisionEvents: 0,
            catalogEditProposals: 0,
            escalationsQueued: 0,
            judgeRan: false,
            auditorFired: false,
          },
        ],
        persistedAt: '2026-05-25T12:00:00.000Z',
      };
      const newEntry: TurnHistoryEntry = {
        turnId: '20260526130000-bbbbbb',
        turnAt: '2026-05-26T13:00:00.000Z',
        newAuditEntries: 3,
        wrongDecisionEvents: 1,
        catalogEditProposals: 1,
        escalationsQueued: 0,
        judgeRan: true,
        auditorFired: true,
      };
      const next = advanceLoopState(prior, {
        turnId: newEntry.turnId,
        newWatermark: 'AUDIT-20260526-05',
        history: newEntry,
        persistedAt: newEntry.turnAt,
      });
      expect(next.lastAuditWatermark).toBe('AUDIT-20260526-05');
      expect(next.lastTurnId).toBe(newEntry.turnId);
      expect(next.turnHistory.length).toBe(2);
      expect(next.turnHistory[0]).toEqual(newEntry);
      expect(next.turnHistory[1]?.turnId).toBe(prior.turnHistory[0]?.turnId);
      expect(next.persistedAt).toBe(newEntry.turnAt);
    });

    it('does NOT mutate the prior state', () => {
      const prior: LoopState = {
        version: 1,
        lastAuditWatermark: 'AUDIT-20260526-02',
        lastTurnId: 'x',
        turnHistory: [],
        persistedAt: '2026-05-26T12:00:00.000Z',
      };
      const newEntry: TurnHistoryEntry = {
        turnId: 'y',
        turnAt: '2026-05-26T13:00:00.000Z',
        newAuditEntries: 0,
        wrongDecisionEvents: 0,
        catalogEditProposals: 0,
        escalationsQueued: 0,
        judgeRan: false,
        auditorFired: false,
      };
      advanceLoopState(prior, {
        turnId: newEntry.turnId,
        newWatermark: 'AUDIT-20260526-03',
        history: newEntry,
        persistedAt: '2026-05-26T13:00:00.000Z',
      });
      expect(prior.turnHistory.length).toBe(0);
      expect(prior.lastAuditWatermark).toBe('AUDIT-20260526-02');
    });
  });

  describe('generateTurnId', () => {
    it('produces YYYYMMDDHHMMSS-<6hex> shape', () => {
      const id = generateTurnId(new Date('2026-05-26T12:34:56.000Z'));
      expect(id).toMatch(/^20260526123456-[0-9a-f]{6}$/);
    });

    it('produces unique ids when called twice quickly', () => {
      const a = generateTurnId(new Date('2026-05-26T12:34:56.000Z'));
      const b = generateTurnId(new Date('2026-05-26T12:34:56.000Z'));
      // The timestamp portions are identical but the random suffixes
      // overwhelmingly differ; a collision would happen with prob
      // 1/2^24, but `randomBytes(3)` makes it astronomically unlikely.
      expect(a).not.toBe(b);
    });
  });
});
