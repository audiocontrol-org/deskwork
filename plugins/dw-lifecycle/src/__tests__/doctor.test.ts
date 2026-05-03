import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  detectPeerPluginInstalled,
  loadInstalledPluginsRegistry,
  runDoctor,
} from '../subcommands/doctor.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const PROJECT_ROOT = '/Users/test/work/sample-project';

function loadFixture(name: string) {
  return loadInstalledPluginsRegistry(join(FIXTURES_DIR, name));
}

describe('doctor', () => {
  it('returns no findings when required and recommended peers are installed', async () => {
    const findings = await runDoctor({
      projectRoot: PROJECT_ROOT,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: () => true,
      checkConfig: () => true,
    });
    expect(findings).toEqual([]);
  });

  it('flags missing recommended peer plugin (feature-dev) as warning when only the required peer is installed', async () => {
    const findings = await runDoctor({
      projectRoot: PROJECT_ROOT,
      pluginRegistry: loadFixture('installed-plugins-required-only.json'),
      fileExists: () => true,
      checkConfig: () => true,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'peer-plugins',
        severity: 'warning',
        message: expect.stringContaining('feature-dev'),
      })
    );
  });

  it('flags missing required peer plugin (superpowers)', async () => {
    const findings = await runDoctor({
      projectRoot: PROJECT_ROOT,
      pluginRegistry: loadFixture('installed-plugins-required-only.json'),
      fileExists: (path) => !path.includes('/superpowers/'),
      checkConfig: () => true,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'peer-plugins',
        severity: 'error',
        message: expect.stringContaining('superpowers'),
      })
    );
  });

  it('flags missing config', async () => {
    const findings = await runDoctor({
      projectRoot: PROJECT_ROOT,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: () => true,
      checkConfig: () => false,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'missing-config', severity: 'error' })
    );
  });

  it('parses realistic registry fixtures and matches project scope against the current project root', () => {
    const fixturePath = join(FIXTURES_DIR, 'installed-plugins-both-peers.json');
    const raw = readFileSync(fixturePath, 'utf8');
    expect(raw).toContain('"superpowers@claude-plugins-official"');

    const registry = loadInstalledPluginsRegistry(fixturePath);
    expect(
      detectPeerPluginInstalled(registry, 'feature-dev', PROJECT_ROOT, () => true)
    ).toBe(true);
    expect(
      detectPeerPluginInstalled(registry, 'frontend-design', PROJECT_ROOT, () => true)
    ).toBe(false);
  });
});
