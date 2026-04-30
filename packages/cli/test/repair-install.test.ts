/**
 * Unit tests for `deskwork repair-install` registry-pruning logic.
 *
 * The exported `pruneRegistry` function is pure given a registry object
 * + the file system state of `installPath`s. We test it by constructing
 * a registry literal, mkdir'ing some installPath fixtures so they exist,
 * and asserting the prune output.
 *
 * Integration coverage (the dispatcher + stdout text) is exercised by
 * the `repair-install --dry-run` invocation in the dogfood smoke; these
 * tests pin the prune semantics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneRegistry } from '../src/commands/repair-install.ts';

interface InstallEntry {
  scope: string;
  installPath: string;
  version: string;
  installedAt?: string;
}

interface Registry {
  version: number;
  plugins: Record<string, InstallEntry[]>;
}

function makeEntry(installPath: string, version = '0.9.7', scope = 'project'): InstallEntry {
  return { scope, installPath, version, installedAt: '2026-04-30T00:00:00Z' };
}

describe('repair-install pruneRegistry', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'deskwork-repair-install-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns no-op report when registry has no deskwork entries', () => {
    const registry: Registry = { version: 2, plugins: {} };
    const report = pruneRegistry(registry, true);

    expect(report.pruned).toHaveLength(0);
    expect(report.kept).toHaveLength(0);
    expect(report.missingAfterPrune).toEqual(['deskwork', 'deskwork-studio', 'dw-lifecycle']);
    expect(report.registryWritten).toBe(false);
  });

  it('keeps live entries unchanged', () => {
    const livePath = join(tmp, 'cache/deskwork/deskwork/0.9.7');
    mkdirSync(livePath, { recursive: true });
    const registry: Registry = {
      version: 2,
      plugins: { 'deskwork@deskwork': [makeEntry(livePath)] },
    };

    const report = pruneRegistry(registry, true);

    expect(report.pruned).toHaveLength(0);
    expect(report.kept).toHaveLength(1);
    expect(report.kept[0]?.entry.installPath).toBe(livePath);
    expect(registry.plugins['deskwork@deskwork']).toHaveLength(1);
  });

  it('prunes entries whose installPath does not exist', () => {
    const stalePath = join(tmp, 'cache/deskwork/deskwork/0.9.4');
    const livePath = join(tmp, 'cache/deskwork/deskwork/0.9.7');
    mkdirSync(livePath, { recursive: true });
    const registry: Registry = {
      version: 2,
      plugins: {
        'deskwork@deskwork': [makeEntry(stalePath), makeEntry(livePath)],
      },
    };

    const report = pruneRegistry(registry, true);

    expect(report.pruned).toHaveLength(1);
    expect(report.pruned[0]?.entry.installPath).toBe(stalePath);
    expect(report.kept).toHaveLength(1);
    expect(report.kept[0]?.entry.installPath).toBe(livePath);
    expect(registry.plugins['deskwork@deskwork']).toHaveLength(1);
  });

  it('deletes the key entirely when every entry is stale', () => {
    const stalePathA = join(tmp, 'cache/deskwork/deskwork/0.9.4');
    const stalePathB = join(tmp, 'cache/deskwork/deskwork/0.9.5');
    const registry: Registry = {
      version: 2,
      plugins: {
        'deskwork@deskwork': [makeEntry(stalePathA), makeEntry(stalePathB)],
      },
    };

    const report = pruneRegistry(registry, true);

    expect(report.pruned).toHaveLength(2);
    expect(report.kept).toHaveLength(0);
    expect(registry.plugins['deskwork@deskwork']).toBeUndefined();
    expect(report.missingAfterPrune).toContain('deskwork');
  });

  it('only touches deskwork-owned keys (leaves third-party plugins alone)', () => {
    const livePath = join(tmp, 'cache/deskwork/deskwork-studio/0.9.7');
    mkdirSync(livePath, { recursive: true });
    const registry: Registry = {
      version: 2,
      plugins: {
        'frontend-design@claude-plugins-official': [makeEntry('/nonexistent/path')],
        'deskwork-studio@deskwork': [makeEntry(livePath)],
      },
    };

    const report = pruneRegistry(registry, true);

    expect(report.pruned).toHaveLength(0);
    expect(report.kept).toHaveLength(1);
    expect(registry.plugins['frontend-design@claude-plugins-official']).toBeDefined();
    expect(registry.plugins['frontend-design@claude-plugins-official']?.[0]?.installPath).toBe(
      '/nonexistent/path',
    );
  });

  it('reports all three deskwork plugins as missing when none have live entries', () => {
    const stalePath = join(tmp, 'cache/deskwork/deskwork/0.9.4');
    const registry: Registry = {
      version: 2,
      plugins: { 'deskwork@deskwork': [makeEntry(stalePath)] },
    };

    const report = pruneRegistry(registry, true);

    expect(report.missingAfterPrune).toEqual(['deskwork', 'deskwork-studio', 'dw-lifecycle']);
  });

  it('reports only the missing plugins after prune (not the ones with live entries)', () => {
    const liveStudio = join(tmp, 'cache/deskwork/deskwork-studio/0.9.7');
    mkdirSync(liveStudio, { recursive: true });
    const stalePath = join(tmp, 'cache/deskwork/deskwork/0.9.4');
    const registry: Registry = {
      version: 2,
      plugins: {
        'deskwork@deskwork': [makeEntry(stalePath)],
        'deskwork-studio@deskwork': [makeEntry(liveStudio)],
      },
    };

    const report = pruneRegistry(registry, true);

    expect(report.missingAfterPrune).toEqual(['deskwork', 'dw-lifecycle']);
    expect(report.missingAfterPrune).not.toContain('deskwork-studio');
  });

  it('handles entries with missing installPath gracefully', () => {
    const registry: Registry = {
      version: 2,
      plugins: {
        'deskwork@deskwork': [{ scope: 'local', installPath: '', version: '0.0.1' }],
      },
    };

    const report = pruneRegistry(registry, true);

    expect(report.pruned).toHaveLength(1);
    expect(registry.plugins['deskwork@deskwork']).toBeUndefined();
  });

  it('preserves entry ordering for live entries', () => {
    const pathA = join(tmp, 'cache/deskwork/deskwork-studio/0.7.2');
    const pathB = join(tmp, 'cache/deskwork/deskwork-studio/0.9.7');
    mkdirSync(pathA, { recursive: true });
    mkdirSync(pathB, { recursive: true });
    const registry: Registry = {
      version: 2,
      plugins: {
        'deskwork-studio@deskwork': [
          makeEntry(pathA, '0.7.2'),
          makeEntry(pathB, '0.9.7'),
        ],
      },
    };

    pruneRegistry(registry, true);

    const liveEntries = registry.plugins['deskwork-studio@deskwork'];
    expect(liveEntries?.[0]?.version).toBe('0.7.2');
    expect(liveEntries?.[1]?.version).toBe('0.9.7');
  });
});
