/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/controller/controller-config.test.ts
 *
 * Phase 11 Task 5 — Config loader + validation tests.
 *
 * Validates `parseControllerConfig` (in-memory parsing + invariant
 * checks) and `loadControllerConfig` (filesystem read + YAML parse).
 * Uses tmpdir fixtures per testing.md ("fixture project trees on
 * disk, never mock the filesystem").
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_CONTROLLER_CONFIG,
  loadControllerConfig,
  parseControllerConfig,
} from '../../../scope-discovery/controller/controller-config.js';

describe('parseControllerConfig', () => {
  it('returns defaults when the YAML is empty {}', () => {
    const c = parseControllerConfig({}, 'test');
    expect(c).toEqual(DEFAULT_CONTROLLER_CONFIG);
  });

  it('honors per-field overrides', () => {
    const c = parseControllerConfig(
      {
        cold_start_frequency: 0.8,
        ratchet_down_window: 7,
      },
      'test',
    );
    expect(c.cold_start_frequency).toBe(0.8);
    expect(c.ratchet_down_window).toBe(7);
    expect(c.anti_thrashing_window).toBe(
      DEFAULT_CONTROLLER_CONFIG.anti_thrashing_window,
    );
  });

  it('throws on out-of-range cold_start_frequency', () => {
    expect(() =>
      parseControllerConfig({ cold_start_frequency: 1.5 }, 'test'),
    ).toThrow(/must be in \[0, 1\]/);
  });

  it('throws on non-integer ratchet_down_window', () => {
    expect(() =>
      parseControllerConfig({ ratchet_down_window: 2.5 }, 'test'),
    ).toThrow(/must be an integer/);
  });

  it('throws when low_drift_threshold > high_drift_threshold', () => {
    expect(() =>
      parseControllerConfig(
        { low_drift_threshold: 0.6, high_drift_threshold: 0.3 },
        'test',
      ),
    ).toThrow(/low_drift_threshold .* > high_drift_threshold/);
  });

  it('throws when cold_start_frequency outside [frequency_min, frequency_max]', () => {
    expect(() =>
      parseControllerConfig(
        { frequency_min: 0.5, frequency_max: 0.7, cold_start_frequency: 0.3 },
        'test',
      ),
    ).toThrow(/cold_start_frequency .* outside/);
  });

  it('throws when frequency_min > frequency_max', () => {
    expect(() =>
      parseControllerConfig(
        { frequency_min: 0.9, frequency_max: 0.1, cold_start_frequency: 0.9 },
        'test',
      ),
    ).toThrow(/frequency_min .* > frequency_max/);
  });

  it('throws on non-object YAML', () => {
    expect(() => parseControllerConfig('not an object', 'test')).toThrow(
      /must parse to a YAML object/,
    );
  });

  it('throws on non-finite number', () => {
    expect(() =>
      parseControllerConfig({ ratchet_down_rate: Number.POSITIVE_INFINITY }, 'test'),
    ).toThrow(/must be a finite number/);
  });
});

describe('loadControllerConfig', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'controller-config-'));
  });

  afterAll(async () => {
    if (root !== undefined && root.length > 0) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns defaults when the config file is absent', async () => {
    const config = await loadControllerConfig(root);
    expect(config).toEqual(DEFAULT_CONTROLLER_CONFIG);
  });

  it('reads operator overrides from disk', async () => {
    const configDir = join(root, '.dw-lifecycle', 'scope-discovery');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'controller-config.yaml'),
      ['cold_start_frequency: 0.8', 'ratchet_down_window: 10'].join('\n'),
      'utf8',
    );
    const config = await loadControllerConfig(root);
    expect(config.cold_start_frequency).toBe(0.8);
    expect(config.ratchet_down_window).toBe(10);
  });

  it('throws on malformed YAML', async () => {
    const configDir = join(root, '.dw-lifecycle', 'scope-discovery');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'controller-config.yaml'),
      'cold_start_frequency: [: invalid yaml',
      'utf8',
    );
    await expect(loadControllerConfig(root)).rejects.toThrow();
  });
});
