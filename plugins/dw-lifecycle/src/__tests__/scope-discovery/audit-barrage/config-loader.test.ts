/**
 * Tests for the audit-barrage config-loader — happy path, project
 * override resolution, malformed-YAML rejection, per-entry validation,
 * and the seeded-scaffold fall-through (override exists but `models:`
 * is commented out → use plugin default).
 *
 * Fixtures live on disk in tmpdir trees (per the project testing rule);
 * no fs mocking.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIG_OVERRIDE_PATH,
  loadAuditBarrageConfig,
  parseConfig,
} from '../../../scope-discovery/audit-barrage/config-loader.js';

describe('parseConfig — happy path', () => {
  it('parses a 3-entry list with the documented args templates', () => {
    const body = [
      'models:',
      '  - name: claude',
      '    binary: claude',
      '    args_template: "-p {{prompt}}"',
      '    timeout_seconds: 300',
      '  - name: codex',
      '    binary: codex',
      '    args_template: "exec {{prompt}}"',
      '    timeout_seconds: 300',
      '  - name: gemini',
      '    binary: gemini',
      '    args_template: "{{prompt}}"',
      '    timeout_seconds: 300',
      '',
    ].join('\n');
    const config = parseConfig(body, '<inline>');
    expect(config.models.length).toBe(3);
    expect(config.models.map((m) => m.name)).toEqual(['claude', 'codex', 'gemini']);
    expect(config.models[0]?.argsTemplate).toBe('-p {{prompt}}');
    expect(config.models[1]?.argsTemplate).toBe('exec {{prompt}}');
    expect(config.models[2]?.argsTemplate).toBe('{{prompt}}');
    for (const m of config.models) {
      expect(m.timeoutSeconds).toBe(300);
    }
  });
});

describe('parseConfig — malformed YAML', () => {
  it('rejects unparseable YAML', () => {
    expect(() =>
      parseConfig('models:\n  - this: is\n   indented: wrong\n  ::\n', '<inline>'),
    ).toThrow(/malformed YAML/);
  });

  it('rejects a top-level non-mapping (e.g. a list)', () => {
    expect(() => parseConfig('- a\n- b\n', '<inline>')).toThrow(
      /top-level value must be a mapping/,
    );
  });

  it('rejects a mapping without models:', () => {
    expect(() => parseConfig('other_section: []\n', '<inline>')).toThrow(
      /missing required 'models:' list/,
    );
  });

  it('rejects an empty models: list', () => {
    expect(() => parseConfig('models: []\n', '<inline>')).toThrow(
      /'models:' list is empty/,
    );
  });

  it('rejects a models: value that is not a list', () => {
    expect(() => parseConfig('models: "not-a-list"\n', '<inline>')).toThrow(
      /missing required 'models:' list/,
    );
  });
});

describe('parseConfig — per-entry validation', () => {
  function entry(overrides: Record<string, unknown>): string {
    const merged: Record<string, unknown> = {
      name: 'claude',
      binary: 'claude',
      args_template: '-p {{prompt}}',
      timeout_seconds: 300,
      ...overrides,
    };
    const lines = ['models:'];
    lines.push('  -');
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined) continue;
      if (typeof v === 'string') {
        lines.push(`    ${k}: "${v}"`);
      } else {
        lines.push(`    ${k}: ${String(v)}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  it('rejects a missing name', () => {
    expect(() => parseConfig(entry({ name: undefined }), '<inline>')).toThrow(
      /\.name missing or not a non-empty string/,
    );
  });

  it('rejects an empty-string name', () => {
    expect(() => parseConfig(entry({ name: '' }), '<inline>')).toThrow(
      /\.name missing or not a non-empty string/,
    );
  });

  it('rejects a missing binary', () => {
    expect(() => parseConfig(entry({ binary: undefined }), '<inline>')).toThrow(
      /\.binary missing or not a non-empty string/,
    );
  });

  it('rejects a missing args_template', () => {
    expect(() =>
      parseConfig(entry({ args_template: undefined }), '<inline>'),
    ).toThrow(/\.args_template missing or not a non-empty string/);
  });

  it('rejects an args_template that lacks {{prompt}}', () => {
    expect(() =>
      parseConfig(entry({ args_template: '-p no-placeholder' }), '<inline>'),
    ).toThrow(/args_template must contain the literal '\{\{prompt\}\}'/);
  });

  it('rejects a missing timeout_seconds', () => {
    expect(() =>
      parseConfig(entry({ timeout_seconds: undefined }), '<inline>'),
    ).toThrow(/\.timeout_seconds must be a positive integer/);
  });

  it('rejects a zero or negative timeout_seconds', () => {
    expect(() =>
      parseConfig(entry({ timeout_seconds: 0 }), '<inline>'),
    ).toThrow(/timeout_seconds must be a positive integer/);
    expect(() =>
      parseConfig(entry({ timeout_seconds: -1 }), '<inline>'),
    ).toThrow(/timeout_seconds must be a positive integer/);
  });

  it('rejects a non-integer timeout_seconds', () => {
    expect(() =>
      parseConfig(entry({ timeout_seconds: 1.5 }), '<inline>'),
    ).toThrow(/timeout_seconds must be a positive integer/);
  });

  it('rejects duplicate name across entries', () => {
    const body = [
      'models:',
      '  - name: claude',
      '    binary: claude',
      '    args_template: "-p {{prompt}}"',
      '    timeout_seconds: 300',
      '  - name: claude',
      '    binary: claude-alt',
      '    args_template: "exec {{prompt}}"',
      '    timeout_seconds: 60',
      '',
    ].join('\n');
    expect(() => parseConfig(body, '<inline>')).toThrow(
      /name 'claude' is a duplicate/,
    );
  });
});

describe('loadAuditBarrageConfig — disk resolution', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'audit-barrage-cfg-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function writeOverride(body: string): Promise<void> {
    const overrideAbs = join(tmp, CONFIG_OVERRIDE_PATH);
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    await writeFile(overrideAbs, body, 'utf8');
  }

  it('reads the plugin default when no override is present', async () => {
    const config = await loadAuditBarrageConfig(tmp);
    expect(config.models.length).toBe(3);
    const names = config.models.map((m) => m.name);
    expect(names).toEqual(['claude', 'codex', 'gemini']);
  });

  it('reads the project override when its models: list is non-empty', async () => {
    await writeOverride(
      [
        'models:',
        '  - name: only-one',
        '    binary: /usr/local/bin/only-one',
        '    args_template: "run {{prompt}}"',
        '    timeout_seconds: 120',
        '',
      ].join('\n'),
    );
    const config = await loadAuditBarrageConfig(tmp);
    expect(config.models.length).toBe(1);
    expect(config.models[0]?.name).toBe('only-one');
    expect(config.models[0]?.binary).toBe('/usr/local/bin/only-one');
    expect(config.models[0]?.timeoutSeconds).toBe(120);
  });

  it('falls through to the default when the override has commented-out models:', async () => {
    // Mirror the install-scope-discovery seed: file present, comments
    // only, no active `models:` section.
    await writeOverride(
      [
        '# Project-local audit-barrage override',
        '#',
        '# models:',
        '#   - name: would-be-override',
        '#     binary: would-be-binary',
        '#     args_template: "would-be {{prompt}}"',
        '#     timeout_seconds: 99',
        '',
      ].join('\n'),
    );
    const config = await loadAuditBarrageConfig(tmp);
    // Plugin default battery: 3 entries (claude/codex/gemini).
    expect(config.models.length).toBe(3);
    expect(config.models.map((m) => m.name)).toEqual([
      'claude',
      'codex',
      'gemini',
    ]);
  });

  it('falls through to the default when the override is fully empty', async () => {
    await writeOverride('');
    const config = await loadAuditBarrageConfig(tmp);
    expect(config.models.length).toBe(3);
  });

  it('throws on a malformed override (not silent fall-through)', async () => {
    await writeOverride('models:\n  - name: x\n  not_yaml: :::\n');
    await expect(loadAuditBarrageConfig(tmp)).rejects.toThrow(/malformed YAML/);
  });

  it('throws when override has models: with a non-array value', async () => {
    await writeOverride('models: "oops not a list"\n');
    await expect(loadAuditBarrageConfig(tmp)).rejects.toThrow(
      /'models:' must be a list when present/,
    );
  });
});
