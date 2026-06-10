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

  it('defaults branches.archive.compareRef to origin/main', () => {
    const cfg = validateConfig({ version: 1 });
    expect(cfg.branches.archive.compareRef).toBe('origin/main');
  });

  it('respects branches.archive.compareRef override', () => {
    const cfg = validateConfig({
      version: 1,
      branches: { prefix: 'feature/', archive: { compareRef: 'upstream/master' } },
    });
    expect(cfg.branches.archive.compareRef).toBe('upstream/master');
  });

  it('accepts session.start.branchStalenessThreshold as a non-negative integer (Phase 28 #422)', () => {
    const cfg = validateConfig({
      version: 1,
      session: { start: { preamble: '', branchStalenessThreshold: 10 }, end: { preamble: '' } },
    });
    expect(cfg.session.start.branchStalenessThreshold).toBe(10);
  });

  it('omits session.start.branchStalenessThreshold when not provided (verb supplies default)', () => {
    const cfg = validateConfig({ version: 1 });
    expect(cfg.session.start.branchStalenessThreshold).toBeUndefined();
  });

  it('rejects negative branchStalenessThreshold with a clear error', () => {
    expect(() =>
      validateConfig({
        version: 1,
        session: { start: { preamble: '', branchStalenessThreshold: -3 }, end: { preamble: '' } },
      }),
    ).toThrow(/branchStalenessThreshold/);
  });

  it('rejects non-integer branchStalenessThreshold with a clear error', () => {
    expect(() =>
      validateConfig({
        version: 1,
        session: { start: { preamble: '', branchStalenessThreshold: 2.5 }, end: { preamble: '' } },
      }),
    ).toThrow(/branchStalenessThreshold/);
  });
});
