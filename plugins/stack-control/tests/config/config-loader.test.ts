// 009 T003 (RED-first) — installation config loader: snake→camel translation
// and fail-loud structural validation, mirroring the audit-barrage config-loader
// pattern. Structural rules only (version, unknown keys, non-empty strings,
// {feature} placeholder); path containment/escape is resolve-paths' job (T005),
// since it needs the installation root the pure loader does not have.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseInstallationConfig,
  loadInstallationConfig,
} from '../../src/config/config-loader.js';
import { InstallationError } from '../../src/config/errors.js';

const LABEL = '.stack-control/config.yaml';

describe('parseInstallationConfig — valid', () => {
  it('parses a minimal config (version only)', () => {
    const cfg = parseInstallationConfig('version: 1\n', LABEL);
    expect(cfg.version).toBe(1);
    expect(cfg.baseDir).toBeUndefined();
    expect(cfg.paths).toBeUndefined();
  });

  it('translates snake_case wire keys to camelCase in-memory', () => {
    const cfg = parseInstallationConfig(
      [
        'version: 1',
        'base_dir: ".stack-control"',
        'paths:',
        '  roadmap: "ROADMAP.md"',
        '  inbox: "DESIGN-INBOX.md"',
        '  backlog: ".stack-control/backlog"',
        '  audit_log: ".stack-control/audit-log.md"',
        '  feature_audit_log_pattern: "specs/{feature}/audit-log.md"',
        '',
      ].join('\n'),
      LABEL,
    );
    expect(cfg.baseDir).toBe('.stack-control');
    expect(cfg.paths?.roadmap).toBe('ROADMAP.md');
    expect(cfg.paths?.inbox).toBe('DESIGN-INBOX.md');
    expect(cfg.paths?.backlog).toBe('.stack-control/backlog');
    expect(cfg.paths?.auditLog).toBe('.stack-control/audit-log.md');
    expect(cfg.paths?.featureAuditLogPattern).toBe('specs/{feature}/audit-log.md');
  });
});

describe('parseInstallationConfig — fail-loud', () => {
  it('rejects a missing version', () => {
    expect(() => parseInstallationConfig('base_dir: ".sc"\n', LABEL)).toThrow(InstallationError);
  });

  it('rejects a non-integer version', () => {
    expect(() => parseInstallationConfig('version: 1.5\n', LABEL)).toThrow(/version/);
  });

  it('rejects a zero / negative version', () => {
    expect(() => parseInstallationConfig('version: 0\n', LABEL)).toThrow(/version/);
    expect(() => parseInstallationConfig('version: -3\n', LABEL)).toThrow(/version/);
  });

  it('rejects a string version', () => {
    expect(() => parseInstallationConfig('version: "1"\n', LABEL)).toThrow(/version/);
  });

  it('rejects an unsupported future version (2) naming the version', () => {
    expect(() => parseInstallationConfig('version: 2\n', LABEL)).toThrow(InstallationError);
    expect(() => parseInstallationConfig('version: 2\n', LABEL)).toThrow(/2/);
    try {
      parseInstallationConfig('version: 2\n', LABEL);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InstallationError);
      expect((err as InstallationError).code).toBe('invalid-config');
    }
  });

  it('rejects an unknown top-level key', () => {
    expect(() =>
      parseInstallationConfig('version: 1\nmystery: true\n', LABEL),
    ).toThrow(/mystery/);
  });

  it('rejects an unknown paths.* key', () => {
    expect(() =>
      parseInstallationConfig('version: 1\npaths:\n  bogus: "x"\n', LABEL),
    ).toThrow(/bogus/);
  });

  it('rejects an empty-string path value', () => {
    expect(() =>
      parseInstallationConfig('version: 1\npaths:\n  roadmap: ""\n', LABEL),
    ).toThrow(/roadmap/);
  });

  it('rejects an empty-string base_dir', () => {
    expect(() => parseInstallationConfig('version: 1\nbase_dir: ""\n', LABEL)).toThrow(/base_dir/);
  });

  it('rejects feature_audit_log_pattern missing the literal {feature}', () => {
    expect(() =>
      parseInstallationConfig(
        'version: 1\npaths:\n  feature_audit_log_pattern: "specs/audit-log.md"\n',
        LABEL,
      ),
    ).toThrow(/\{feature\}/);
  });

  it('rejects malformed YAML', () => {
    expect(() => parseInstallationConfig('version: 1\n  : : :\n', LABEL)).toThrow(InstallationError);
  });

  it('rejects a non-mapping top-level document', () => {
    expect(() => parseInstallationConfig('- a\n- b\n', LABEL)).toThrow(InstallationError);
  });

  it('thrown errors carry code "invalid-config"', () => {
    try {
      parseInstallationConfig('version: 0\n', LABEL);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InstallationError);
      expect((err as InstallationError).code).toBe('invalid-config');
    }
  });
});

describe('loadInstallationConfig — reads from disk', () => {
  it('loads a config file from disk and validates it', () => {
    const root = mkdtempSync(join(tmpdir(), 'sc-cfgload-'));
    mkdirSync(join(root, '.stack-control'), { recursive: true });
    const configPath = join(root, '.stack-control', 'config.yaml');
    writeFileSync(configPath, 'version: 1\npaths:\n  roadmap: "docs/ROADMAP.md"\n');
    const cfg = loadInstallationConfig(configPath);
    expect(cfg.version).toBe(1);
    expect(cfg.paths?.roadmap).toBe('docs/ROADMAP.md');
  });

  it('fails loud naming the file on a malformed config', () => {
    const root = mkdtempSync(join(tmpdir(), 'sc-cfgload-'));
    mkdirSync(join(root, '.stack-control'), { recursive: true });
    const configPath = join(root, '.stack-control', 'config.yaml');
    writeFileSync(configPath, 'version: 0\n');
    expect(() => loadInstallationConfig(configPath)).toThrow(/config\.yaml/);
  });
});
