/**
 * Tests for `scripts/repair-install.sh` (#137 + #138).
 *
 * Spawns the bash script against a fixture HOME directory carrying a
 * synthetic registry + marketplace clone, asserts on stdout/stderr +
 * filesystem state.
 *
 * Conventions:
 *   - HOME points at a tmp dir so the script's hardcoded paths resolve under it.
 *   - PWD overridden to a tmp cwd so #138's project-scope filter is deterministic.
 *   - PATH stripped of any real ~/.claude/plugins/cache/ entries so the test
 *     environment doesn't bleed into the assertions.
 *   - Marketplace clone always carries all three plugins (deskwork,
 *     deskwork-studio, dw-lifecycle) at the current version — the script
 *     requires every plugin to have at least one working bin or it exits 1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'repair-install.sh');
const ALL_PLUGINS = ['deskwork', 'deskwork-studio', 'dw-lifecycle'] as const;

interface RegistryEntry {
  scope: 'user' | 'project';
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
}

interface FixtureOptions {
  /** Marketplace canonical version per plugin. Defaults to '0.12.0' for all. */
  readonly canonical?: Partial<Record<(typeof ALL_PLUGINS)[number], string>>;
  /** Pre-existing registry entries, keyed by `<plugin>@deskwork`. */
  readonly registry: Record<string, ReadonlyArray<RegistryEntry>>;
}

async function setupFixture(home: string, opts: FixtureOptions): Promise<void> {
  const marketplaceClone = join(home, '.claude', 'plugins', 'marketplaces', 'deskwork');
  const canonical = {
    deskwork: '0.12.0',
    'deskwork-studio': '0.12.0',
    'dw-lifecycle': '0.12.0',
    ...(opts.canonical ?? {}),
  };

  await mkdir(join(marketplaceClone, '.claude-plugin'), { recursive: true });
  await writeFile(
    join(marketplaceClone, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      metadata: { version: 'test-1.0' },
      plugins: ALL_PLUGINS.map((name) => ({
        name,
        version: canonical[name],
        source: { source: 'git-subdir', url: 'https://example/x.git', path: `plugins/${name}` },
      })),
    }),
  );

  for (const name of ALL_PLUGINS) {
    const dir = join(marketplaceClone, 'plugins', name);
    await mkdir(join(dir, '.claude-plugin'), { recursive: true });
    await mkdir(join(dir, 'bin'), { recursive: true });
    await writeFile(
      join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name, version: canonical[name] }),
    );
    await writeFile(join(dir, 'bin', name), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(dir, 'bin', name), 0o755);
  }

  // Make sure all three keys exist in the registry (the script keys off them).
  const registryEntries: Record<string, ReadonlyArray<RegistryEntry>> = {};
  for (const name of ALL_PLUGINS) {
    registryEntries[`${name}@deskwork`] = opts.registry[`${name}@deskwork`] ?? [];
  }

  await mkdir(join(home, '.claude', 'plugins'), { recursive: true });
  await writeFile(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: registryEntries }),
  );
}

function userScopeEntry(home: string, plugin: string, version: string): RegistryEntry {
  return {
    scope: 'user',
    installPath: join(home, '.claude', 'plugins', 'cache', 'deskwork', plugin, version),
    version,
    installedAt: '2026-04-30T00:00:00.000Z',
    lastUpdated: '2026-04-30T00:00:00.000Z',
  };
}

function projectScopeEntry(
  home: string,
  plugin: string,
  version: string,
  projectPath: string,
): RegistryEntry {
  return {
    scope: 'project',
    projectPath,
    installPath: join(home, '.claude', 'plugins', 'cache', 'deskwork', plugin, version),
    version,
    installedAt: '2026-04-27T00:00:00.000Z',
    lastUpdated: '2026-04-27T00:00:00.000Z',
  };
}

function runScript(
  home: string,
  cwd: string,
  args: string[] = [],
  pathOverride?: string,
): { stdout: string; stderr: string; status: number | null } {
  const cleanedPath = pathOverride
    ?? (process.env.PATH ?? '')
      .split(':')
      .filter((p) => !p.includes('/.claude/plugins/cache/'))
      .join(':');
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, PWD: cwd, PATH: cleanedPath },
    cwd,
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

describe('scripts/repair-install.sh', () => {
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'dw-repair-home-'));
    cwd = await mkdtemp(join(tmpdir(), 'dw-repair-cwd-'));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  it('restores user-scope registry entries (#137: registry-driven, not PATH)', async () => {
    await setupFixture(home, {
      registry: {
        'deskwork@deskwork': [userScopeEntry(home, 'deskwork', '0.12.0')],
        'deskwork-studio@deskwork': [userScopeEntry(home, 'deskwork-studio', '0.12.0')],
        'dw-lifecycle@deskwork': [userScopeEntry(home, 'dw-lifecycle', '0.12.0')],
      },
    });

    const r = runScript(home, cwd);
    expect(r.status).toBe(0);
    for (const plugin of ALL_PLUGINS) {
      expect(
        existsSync(join(home, '.claude', 'plugins', 'cache', 'deskwork', plugin, '0.12.0', 'bin', plugin)),
      ).toBe(true);
    }
  });

  it('does NOT restore project-scope entries belonging to a different cwd (#138)', async () => {
    const otherProject = '/tmp/some-other-project-that-does-not-exist';
    // deskwork-studio has BOTH a user-scope 0.12.0 and a project-scope 0.7.2
    // (different project). The user-scope entry should restore; the
    // other-project entry should NOT.
    await setupFixture(home, {
      registry: {
        'deskwork@deskwork': [userScopeEntry(home, 'deskwork', '0.12.0')],
        'deskwork-studio@deskwork': [
          userScopeEntry(home, 'deskwork-studio', '0.12.0'),
          projectScopeEntry(home, 'deskwork-studio', '0.7.2', otherProject),
        ],
        'dw-lifecycle@deskwork': [userScopeEntry(home, 'dw-lifecycle', '0.12.0')],
      },
    });

    const r = runScript(home, cwd);
    expect(r.status).toBe(0);
    expect(
      existsSync(join(home, '.claude', 'plugins', 'cache', 'deskwork', 'deskwork-studio', '0.12.0', 'bin', 'deskwork-studio')),
    ).toBe(true);
    // The 0.7.2 cache should NOT have been restored.
    expect(
      existsSync(join(home, '.claude', 'plugins', 'cache', 'deskwork', 'deskwork-studio', '0.7.2')),
    ).toBe(false);
  });

  it('does restore project-scope entries whose projectPath == cwd (#138)', async () => {
    await setupFixture(home, {
      registry: {
        'deskwork@deskwork': [projectScopeEntry(home, 'deskwork', '0.12.0', cwd)],
        'deskwork-studio@deskwork': [userScopeEntry(home, 'deskwork-studio', '0.12.0')],
        'dw-lifecycle@deskwork': [userScopeEntry(home, 'dw-lifecycle', '0.12.0')],
      },
    });
    const r = runScript(home, cwd);
    expect(r.status).toBe(0);
    expect(
      existsSync(join(home, '.claude', 'plugins', 'cache', 'deskwork', 'deskwork', '0.12.0', 'bin', 'deskwork')),
    ).toBe(true);
  });

  it('does NOT re-create orphan caches referenced only by stale PATH (#137)', async () => {
    // Registry is clean (user-scope 0.12.0 only). PATH has a stale
    // 0.99.0 entry. Pre-#137 the script would treat the PATH entry as
    // a "referenced version" and restore deskwork-studio@0.99.0. After
    // #137, PATH is no longer a source.
    await setupFixture(home, {
      registry: {
        'deskwork@deskwork': [userScopeEntry(home, 'deskwork', '0.12.0')],
        'deskwork-studio@deskwork': [userScopeEntry(home, 'deskwork-studio', '0.12.0')],
        'dw-lifecycle@deskwork': [userScopeEntry(home, 'dw-lifecycle', '0.12.0')],
      },
    });
    const stalePathDir = join(home, '.claude', 'plugins', 'cache', 'deskwork', 'deskwork-studio', '0.99.0', 'bin');
    const cleanedPath = (process.env.PATH ?? '')
      .split(':')
      .filter((p) => !p.includes('/.claude/plugins/cache/'))
      .join(':');
    const r = runScript(home, cwd, [], `${stalePathDir}:${cleanedPath}`);
    expect(r.status).toBe(0);
    expect(
      existsSync(join(home, '.claude', 'plugins', 'cache', 'deskwork', 'deskwork-studio', '0.99.0')),
    ).toBe(false);
  });
});
