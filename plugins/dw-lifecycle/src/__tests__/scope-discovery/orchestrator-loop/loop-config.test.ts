/**
 * Tests for the orchestrator-loop config loader.
 *
 * Per the project test rules: fixture trees on disk, no fs mocks.
 */

import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOP_CONFIG,
  LOOP_CONFIG_PATH,
  loadLoopConfig,
} from '../../../scope-discovery/orchestrator-loop/loop-config.js';

describe('orchestrator-loop/loop-config', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'loop-config-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns DEFAULT_LOOP_CONFIG when the config file is absent', async () => {
    const config = await loadLoopConfig(tmp);
    expect(config).toEqual(DEFAULT_LOOP_CONFIG);
  });

  it('returns DEFAULT_LOOP_CONFIG when the YAML is null', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(path, '', 'utf8');
    const config = await loadLoopConfig(tmp);
    expect(config).toEqual(DEFAULT_LOOP_CONFIG);
  });

  it('honors a partial override (only auto_apply_confidence_floor)', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(path, 'auto_apply_confidence_floor: 0.85\n', 'utf8');
    const config = await loadLoopConfig(tmp);
    expect(config.auto_apply_confidence_floor).toBe(0.85);
    expect(config.turn_history_retention).toBe(
      DEFAULT_LOOP_CONFIG.turn_history_retention,
    );
  });

  it('honors a partial override (only turn_history_retention)', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(path, 'turn_history_retention: 12\n', 'utf8');
    const config = await loadLoopConfig(tmp);
    expect(config.turn_history_retention).toBe(12);
    expect(config.auto_apply_confidence_floor).toBe(
      DEFAULT_LOOP_CONFIG.auto_apply_confidence_floor,
    );
  });

  it('throws on non-finite turn_history_retention', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(
      path,
      'turn_history_retention: .nan\n',
      'utf8',
    );
    await expect(loadLoopConfig(tmp)).rejects.toThrow(
      /turn_history_retention.*must be a finite number/,
    );
  });

  it('throws on non-integer turn_history_retention', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(path, 'turn_history_retention: 3.5\n', 'utf8');
    await expect(loadLoopConfig(tmp)).rejects.toThrow(
      /turn_history_retention.*positive integer/,
    );
  });

  it('throws on auto_apply_confidence_floor out of range', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(path, 'auto_apply_confidence_floor: 1.5\n', 'utf8');
    await expect(loadLoopConfig(tmp)).rejects.toThrow(
      /auto_apply_confidence_floor.*must be in \[0, 1\]/,
    );
  });

  it('throws on malformed YAML', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(path, '!!not yaml: [unbalanced\n', 'utf8');
    await expect(loadLoopConfig(tmp)).rejects.toThrow(/loop-config/);
  });

  it('honors both fields set in YAML', async () => {
    const path = join(tmp, LOOP_CONFIG_PATH);
    await mkdir(join(tmp, '.dw-lifecycle/scope-discovery'), {
      recursive: true,
    });
    await writeFile(
      path,
      'turn_history_retention: 50\nauto_apply_confidence_floor: 0.6\n',
      'utf8',
    );
    const config = await loadLoopConfig(tmp);
    expect(config).toEqual({
      turn_history_retention: 50,
      auto_apply_confidence_floor: 0.6,
    });
  });
});
