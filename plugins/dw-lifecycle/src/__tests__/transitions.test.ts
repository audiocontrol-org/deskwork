import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transitionFeature } from '../transitions.js';
import type { Config } from '../config.types.js';

const baseCfg: Config = {
  version: 1,
  docs: {
    root: 'docs',
    byVersion: true,
    defaultTargetVersion: '1.0',
    knownVersions: ['1.0'],
    statusDirs: { inProgress: '001-IN-PROGRESS', waiting: '002-WAITING', complete: '003-COMPLETE' },
  },
  branches: { prefix: 'feature/' },
  worktrees: { naming: '<repo>-<slug>' },
  journal: { path: 'DEVELOPMENT-NOTES.md', enabled: true },
  tracking: { platform: 'github', parentLabels: [], phaseLabels: [] },
  session: { start: { preamble: '' }, end: { preamble: '' } },
};

describe('transitions', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-trans-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('moves a feature directory from inProgress to complete', () => {
    const fromDir = join(tmp, 'docs/1.0/001-IN-PROGRESS/test');
    mkdirSync(fromDir, { recursive: true });
    writeFileSync(join(fromDir, 'README.md'), '# test\n', 'utf8');

    transitionFeature(baseCfg, tmp, 'test', { from: 'inProgress', to: 'complete', targetVersion: '1.0' });

    expect(existsSync(fromDir)).toBe(false);
    const toDir = join(tmp, 'docs/1.0/003-COMPLETE/test');
    expect(existsSync(join(toDir, 'README.md'))).toBe(true);
  });

  it('is idempotent if source missing but destination present', () => {
    const toDir = join(tmp, 'docs/1.0/003-COMPLETE/test');
    mkdirSync(toDir, { recursive: true });
    writeFileSync(join(toDir, 'README.md'), '# test\n', 'utf8');

    transitionFeature(baseCfg, tmp, 'test', { from: 'inProgress', to: 'complete', targetVersion: '1.0' });

    expect(existsSync(join(toDir, 'README.md'))).toBe(true);
  });

  it('throws if both source and destination missing', () => {
    expect(() =>
      transitionFeature(baseCfg, tmp, 'nonexistent', { from: 'inProgress', to: 'complete', targetVersion: '1.0' })
    ).toThrow(/not found/i);
  });
});
