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
  const FEATURE_SLUG = 'loop-state-test';

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'loop-state-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns EMPTY_LOOP_STATE when the state file is absent', async () => {
    const state = await loadLoopState(tmp, FEATURE_SLUG, RUNTIME_DIR);
    expect(state).toEqual(EMPTY_LOOP_STATE);
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
    await persistLoopState(tmp, FEATURE_SLUG, state, {
      runtimeDirOverride: RUNTIME_DIR,
      retention: 24,
    });
    const loaded = await loadLoopState(tmp, FEATURE_SLUG, RUNTIME_DIR);
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
    await persistLoopState(tmp, FEATURE_SLUG, oversized, {
      runtimeDirOverride: RUNTIME_DIR,
      retention: 24,
    });
    const loaded = await loadLoopState(tmp, FEATURE_SLUG, RUNTIME_DIR);
    expect(loaded.turnHistory.length).toBe(24);
    expect(loaded.turnHistory[0]?.turnId).toBe(oversized.turnHistory[0]?.turnId);
  });

  it('throws on malformed state file (bad JSON)', async () => {
    const dir = join(tmp, RUNTIME_DIR, FEATURE_SLUG);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, LOOP_STATE_FILENAME), 'not json {', 'utf8');
    await expect(loadLoopState(tmp, FEATURE_SLUG, RUNTIME_DIR)).rejects.toThrow(/cannot parse/);
  });

  it('throws on unsupported version', async () => {
    const dir = join(tmp, RUNTIME_DIR, FEATURE_SLUG);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, LOOP_STATE_FILENAME),
      JSON.stringify({ version: 99, lastAuditWatermark: '', lastTurnId: '', turnHistory: [], persistedAt: '2026-05-26T00:00:00.000Z' }),
      'utf8',
    );
    await expect(loadLoopState(tmp, FEATURE_SLUG, RUNTIME_DIR)).rejects.toThrow(/unsupported version/);
  });

  it('rejects empty featureSlug', async () => {
    await expect(loadLoopState(tmp, '', RUNTIME_DIR)).rejects.toThrow(/non-empty featureSlug/);
    const state: LoopState = {
      version: 1,
      lastAuditWatermark: '',
      lastTurnId: '',
      turnHistory: [],
      persistedAt: '2026-05-26T00:00:00.000Z',
    };
    await expect(
      persistLoopState(tmp, '', state, { runtimeDirOverride: RUNTIME_DIR, retention: 24 }),
    ).rejects.toThrow(/non-empty featureSlug/);
  });

  it('per-feature isolation: different slugs do NOT share loop-state', async () => {
    const stateA: LoopState = {
      version: 1,
      lastAuditWatermark: 'AUDIT-A-99',
      lastTurnId: 't-a',
      turnHistory: [],
      persistedAt: '2026-05-26T01:00:00.000Z',
    };
    const stateB: LoopState = {
      version: 1,
      lastAuditWatermark: 'AUDIT-B-42',
      lastTurnId: 't-b',
      turnHistory: [],
      persistedAt: '2026-05-26T02:00:00.000Z',
    };
    await persistLoopState(tmp, 'feature-a', stateA, {
      runtimeDirOverride: RUNTIME_DIR,
      retention: 24,
    });
    await persistLoopState(tmp, 'feature-b', stateB, {
      runtimeDirOverride: RUNTIME_DIR,
      retention: 24,
    });
    const loadedA = await loadLoopState(tmp, 'feature-a', RUNTIME_DIR);
    const loadedB = await loadLoopState(tmp, 'feature-b', RUNTIME_DIR);
    expect(loadedA.lastAuditWatermark).toBe('AUDIT-A-99');
    expect(loadedB.lastAuditWatermark).toBe('AUDIT-B-42');
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
    });
  });

  describe('generateTurnId', () => {
    it('produces YYYYMMDDHHMMSS-<6hex> shape', () => {
      const id = generateTurnId(new Date('2026-05-26T12:34:56.000Z'));
      expect(id).toMatch(/^20260526123456-[0-9a-f]{6}$/);
    });
  });
});
