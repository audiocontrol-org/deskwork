// src/__tests__/docs.test.ts
import { describe, it, expect } from 'vitest';
import { resolveFeatureDir, resolveFeaturePath } from '../docs.js';
import type { Config } from '../config.types.js';

const baseCfg: Config = {
  version: 1,
  docs: {
    root: 'docs',
    byVersion: true,
    defaultTargetVersion: '1.0',
    knownVersions: ['1.0', '1.1'],
    statusDirs: {
      inProgress: '001-IN-PROGRESS',
      waiting: '002-WAITING',
      complete: '003-COMPLETE',
    },
  },
  branches: { prefix: 'feature/' },
  worktrees: { naming: '<repo>-<slug>' },
  journal: { path: 'DEVELOPMENT-NOTES.md', enabled: true },
  tracking: { platform: 'github', parentLabels: [], phaseLabels: [] },
  session: { start: { preamble: '' }, end: { preamble: '' } },
};

describe('docs', () => {
  it('resolves byVersion path with explicit target', () => {
    const dir = resolveFeatureDir(baseCfg, '/repo', 'my-slug', { stage: 'inProgress', targetVersion: '1.1' });
    expect(dir).toBe('/repo/docs/1.1/001-IN-PROGRESS/my-slug');
  });

  it('uses defaultTargetVersion when target omitted', () => {
    const dir = resolveFeatureDir(baseCfg, '/repo', 'my-slug', { stage: 'inProgress' });
    expect(dir).toBe('/repo/docs/1.0/001-IN-PROGRESS/my-slug');
  });

  it('omits version segment when byVersion is false', () => {
    const cfg: Config = { ...baseCfg, docs: { ...baseCfg.docs, byVersion: false } };
    const dir = resolveFeatureDir(cfg, '/repo', 'my-slug', { stage: 'inProgress' });
    expect(dir).toBe('/repo/docs/001-IN-PROGRESS/my-slug');
  });

  it('resolves complete stage', () => {
    const dir = resolveFeatureDir(baseCfg, '/repo', 'my-slug', { stage: 'complete', targetVersion: '1.0' });
    expect(dir).toBe('/repo/docs/1.0/003-COMPLETE/my-slug');
  });

  it('resolveFeaturePath joins file inside the feature dir', () => {
    const file = resolveFeaturePath(baseCfg, '/repo', 'my-slug', 'workplan.md', { stage: 'inProgress' });
    expect(file).toBe('/repo/docs/1.0/001-IN-PROGRESS/my-slug/workplan.md');
  });
});
