/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/controller/controller-state.test.ts
 *
 * Phase 11 Task 5 — Durable controller-state persistence tests.
 *
 * Round-trips load/persist; verifies retention bounding via
 * `DEFAULT_HISTORY_RETENTION`; throws cleanly on malformed files.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONTROLLER_STATE_FILENAME,
  DEFAULT_HISTORY_RETENTION,
  appendControllerEntry,
  loadControllerState,
  persistControllerState,
} from '../../../scope-discovery/controller/controller-state.js';
import type { ControllerHistoryEntry } from '../../../scope-discovery/controller/controller-types.js';
import { baseMetrics } from './controller.fixtures.js';

function makeEntry(turn: number): ControllerHistoryEntry {
  // ISO-8601 hour padded — kept simple; the tests don't depend on
  // wall-clock accuracy.
  const hour = String(turn).padStart(2, '0');
  return {
    decision: {
      frequency: 1.0,
      intensity: 1.0,
      escalationThreshold: 0.9,
      signals: {
        drift: 0.0,
        correction: 0.0,
        auditorCorrectionRate: 0.0,
      },
      audit_trail: [],
      decided_at: `2026-05-26T${hour}:00:00Z`,
    },
    metrics_snapshot: baseMetrics(),
  };
}

describe('controller-state — persistence round-trip', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'controller-state-'));
  });

  afterAll(async () => {
    if (root !== undefined && root.length > 0) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns empty history when no state file exists', async () => {
    const history = await loadControllerState(root);
    expect(history).toEqual([]);
  });

  it('persists + reads back a decision', async () => {
    const entry: ControllerHistoryEntry = {
      decision: {
        frequency: 0.8,
        intensity: 0.7,
        escalationThreshold: 0.6,
        signals: {
          drift: 0.1,
          correction: 0.2,
          auditorCorrectionRate: 0.0,
        },
        audit_trail: [
          {
            field: 'frequency',
            signal_used: 'drift',
            prior_value: 1.0,
            new_value: 0.8,
            reason: 'test',
            adjusted_at: '2026-05-26T12:00:00Z',
          },
        ],
        decided_at: '2026-05-26T12:00:00Z',
      },
      metrics_snapshot: baseMetrics(),
    };
    await persistControllerState(root, [entry]);
    const stateFile = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
      CONTROLLER_STATE_FILENAME,
    );
    const text = await readFile(stateFile, 'utf8');
    expect(text).toContain('"version": 1');
    const loaded = await loadControllerState(root);
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.decision.frequency).toBe(0.8);
    expect(loaded[0]?.decision.signals.drift).toBe(0.1);
  });

  it('appendControllerEntry prepends and trims retention', async () => {
    await persistControllerState(root, []);
    for (let i = 0; i < DEFAULT_HISTORY_RETENTION + 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await appendControllerEntry(root, makeEntry(i));
    }
    const final = await loadControllerState(root);
    expect(final.length).toBe(DEFAULT_HISTORY_RETENTION);
    // Newest-first: index 0 has the most recent decided_at; with our
    // sequence, the LAST iteration of the loop (turn = retention + 4)
    // is the newest.
    const latestDecidedAt = final[0]?.decision.decided_at ?? '';
    const lastTurn = DEFAULT_HISTORY_RETENTION + 4;
    expect(latestDecidedAt).toBe(
      `2026-05-26T${String(lastTurn).padStart(2, '0')}:00:00Z`,
    );
    // Oldest retained: lastTurn - (retention - 1).
    const oldestTurn = lastTurn - (DEFAULT_HISTORY_RETENTION - 1);
    expect(final[final.length - 1]?.decision.decided_at).toBe(
      `2026-05-26T${String(oldestTurn).padStart(2, '0')}:00:00Z`,
    );
  });

  it('throws on unsupported version in state file', async () => {
    const stateDir = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
    );
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, CONTROLLER_STATE_FILENAME),
      JSON.stringify({ version: 99, history: [] }),
      'utf8',
    );
    await expect(loadControllerState(root)).rejects.toThrow(
      /unsupported version 99/,
    );
  });

  it('throws on malformed JSON', async () => {
    const stateDir = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
    );
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, CONTROLLER_STATE_FILENAME),
      'this is not json',
      'utf8',
    );
    await expect(loadControllerState(root)).rejects.toThrow(/cannot parse/);
  });

  it('rejects state file with non-array history', async () => {
    const stateDir = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
    );
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, CONTROLLER_STATE_FILENAME),
      JSON.stringify({ version: 1, history: { wrong: 'shape' } }),
      'utf8',
    );
    await expect(loadControllerState(root)).rejects.toThrow(
      /\`history\` must be an array/,
    );
  });

  it('persistControllerState truncates history beyond retention cap', async () => {
    const overlong: ControllerHistoryEntry[] = [];
    for (let i = 0; i < DEFAULT_HISTORY_RETENTION + 10; i += 1) {
      overlong.push(makeEntry(i));
    }
    await persistControllerState(root, overlong);
    const reloaded = await loadControllerState(root);
    expect(reloaded.length).toBe(DEFAULT_HISTORY_RETENTION);
  });
});
