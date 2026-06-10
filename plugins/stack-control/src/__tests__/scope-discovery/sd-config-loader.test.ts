/**
 * 010 T057 — sd-config loader unit tests.
 *
 * Loads + validates `<installation>/.stack-control/scope-discovery/config.yaml`;
 * fails loud on unknown keys / bad version / wrong types. Lazy-and-announced
 * `ensureSdConfig` creates the default when absent. On-disk fixtures only.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import {
  CURRENT_SD_CONFIG_VERSION,
  ensureSdConfig,
  loadSdConfig,
  parseSdConfig,
  SD_CONFIG_REL_PATH,
} from '../../scope-discovery/sd-config.js';

let fixtures: Fixture[] = [];
function fx(): Fixture {
  const f = makeFixture('sd-config-');
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.cleanup();
});

describe('parseSdConfig — valid shapes', () => {
  it('parses minimal config (schema_version only)', () => {
    const cfg = parseSdConfig('schema_version: 1\n', 'mem');
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.agents).toEqual({});
    expect(cfg.tunables).toEqual({});
  });

  it('parses agents flags + tunables bag', () => {
    const cfg = parseSdConfig(
      'schema_version: 1\nagents:\n  prd-scanner: true\n  ast-grep: false\ntunables:\n  top_n: 5\n  stopwords: [a, the]\n',
      'mem',
    );
    expect(cfg.agents).toEqual({ 'prd-scanner': true, 'ast-grep': false });
    expect(cfg.tunables['top_n']).toBe(5);
    expect(cfg.tunables['stopwords']).toEqual(['a', 'the']);
  });
});

describe('parseSdConfig — fails loud', () => {
  it('rejects an unknown top-level key', () => {
    expect(() => parseSdConfig('schema_version: 1\nbogus: 1\n', 'mem')).toThrow(
      /unknown top-level key 'bogus'/,
    );
  });

  it('rejects a missing schema_version', () => {
    expect(() => parseSdConfig('agents: {}\n', 'mem')).toThrow(/schema_version must be a positive integer/);
  });

  it('rejects an unsupported schema_version', () => {
    expect(() => parseSdConfig('schema_version: 99\n', 'mem')).toThrow(/is not supported/);
  });

  it('rejects a non-integer schema_version', () => {
    expect(() => parseSdConfig('schema_version: 1.5\n', 'mem')).toThrow(/positive integer/);
  });

  it('rejects a non-mapping top-level value', () => {
    expect(() => parseSdConfig('- 1\n- 2\n', 'mem')).toThrow(/must be a mapping/);
  });

  it('rejects a non-boolean agent flag', () => {
    expect(() => parseSdConfig('schema_version: 1\nagents:\n  x: "yes"\n', 'mem')).toThrow(
      /agents.x must be a boolean/,
    );
  });

  it('rejects a non-mapping agents block', () => {
    expect(() => parseSdConfig('schema_version: 1\nagents: [1, 2]\n', 'mem')).toThrow(
      /'agents' must be a mapping/,
    );
  });

  it('rejects a non-mapping tunables block', () => {
    expect(() => parseSdConfig('schema_version: 1\ntunables: 7\n', 'mem')).toThrow(
      /'tunables' must be a mapping/,
    );
  });

  it('rejects malformed YAML', () => {
    expect(() => parseSdConfig('schema_version: 1\n  : :\n', 'mem')).toThrow(/malformed YAML/);
  });
});

describe('loadSdConfig — from disk', () => {
  it('reads + validates a config file', () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(SD_CONFIG_REL_PATH, 'schema_version: 1\nagents:\n  a: true\n');
    const cfg = loadSdConfig(join(root, SD_CONFIG_REL_PATH));
    expect(cfg.agents).toEqual({ a: true });
  });

  it('fails loud when the file is unreadable', () => {
    const f = fx();
    const root = f.install('.');
    expect(() => loadSdConfig(join(root, SD_CONFIG_REL_PATH))).toThrow(/failed to read/);
  });
});

describe('ensureSdConfig — lazy-and-announced', () => {
  it('creates the default config when absent', () => {
    const f = fx();
    const root = f.install('.');
    const result = ensureSdConfig(root);
    expect(result.created).toBe(true);
    expect(result.config.schemaVersion).toBe(CURRENT_SD_CONFIG_VERSION);
    expect(existsSync(result.path)).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toMatch(/schema_version:\s*1/);
  });

  it('loads (does not recreate) an existing config', () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(SD_CONFIG_REL_PATH, 'schema_version: 1\ntunables:\n  k: 9\n');
    const result = ensureSdConfig(root);
    expect(result.created).toBe(false);
    expect(result.config.tunables['k']).toBe(9);
  });
});
