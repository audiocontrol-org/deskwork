import { describe, it, expect } from 'vitest';
import { loadConfig, validateConfig, defaultConfig } from '../config.js';

describe('config', () => {
  it('parses a minimal valid config and applies defaults', () => {
    const raw = '{"version": 1, "sites": {}}';
    const cfg = validateConfig(JSON.parse(raw));
    expect(cfg.docs.root).toBe('docs');
    expect(cfg.docs.byVersion).toBe(true);
    expect(cfg.docs.defaultTargetVersion).toBe('1.0');
    expect(cfg.branches.prefix).toBe('feature/');
    expect(cfg.tracking.platform).toBe('github');
  });

  it('rejects unknown tracking platform with a clear error', () => {
    const raw = { version: 1, tracking: { platform: 'jira' } };
    expect(() => validateConfig(raw)).toThrow(/tracking\.platform/);
  });

  it('respects user overrides over defaults', () => {
    const raw = {
      version: 1,
      docs: { root: 'documentation', byVersion: false },
      branches: { prefix: 'topic/' },
    };
    const cfg = validateConfig(raw);
    expect(cfg.docs.root).toBe('documentation');
    expect(cfg.docs.byVersion).toBe(false);
    expect(cfg.branches.prefix).toBe('topic/');
  });

  it('throws on invalid version field', () => {
    expect(() => validateConfig({ version: 'banana' })).toThrow();
  });
});
