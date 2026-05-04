import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { defaultConfig } from '../config.js';
import type { Config } from '../config.types.js';
import {
  detectPeerPluginInstalled,
  loadInstalledPluginsRegistry,
  runDoctor,
} from '../subcommands/doctor.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const tmpRoots: string[] = [];

function fixtureAwareExists(path: string): boolean {
  if (path.includes('/.claude/plugins/')) {
    return true;
  }
  return existsSync(path);
}

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-'));
  tmpRoots.push(root);
  return root;
}

function writeConfig(root: string, mutate?: (config: Config) => void): Config {
  const config = defaultConfig();
  config.docs.knownVersions = ['1.0'];
  config.docs.defaultTargetVersion = '1.0';
  mutate?.(config);

  const configDir = join(root, '.dw-lifecycle');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  return config;
}

function writeFeatureDocs(root: string, slug: string, options?: { includeWorkplan?: boolean; parentIssue?: string | number }): string {
  const docsDir = join(root, 'docs/1.0/001-IN-PROGRESS', slug);
  mkdirSync(docsDir, { recursive: true });
  const parentIssue = options?.parentIssue ?? '';
  writeFileSync(
    join(docsDir, 'README.md'),
    `---\nslug: ${slug}\ntargetVersion: "1.0"\nparentIssue: ${parentIssue === '' ? '""' : parentIssue}\n---\n\n# Feature: ${slug}\n`,
    'utf8'
  );
  if (options?.includeWorkplan !== false) {
    writeFileSync(join(docsDir, 'workplan.md'), '# Workplan\n', 'utf8');
  }
  return docsDir;
}

function loadFixture(name: string) {
  return loadInstalledPluginsRegistry(join(FIXTURES_DIR, name));
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('doctor', () => {
  it('returns no findings when required and recommended peers are installed and docs are consistent', async () => {
    const root = createProjectRoot();
    writeConfig(root);
    writeFeatureDocs(root, 'sample-feature');
    writeFileSync(
      join(root, 'DEVELOPMENT-NOTES.md'),
      '## 2026-05-03\n\n### Feature: sample-feature\n',
      'utf8'
    );

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: fixtureAwareExists,
      resolveIssueState: () => 'OPEN',
    });

    expect(findings).toEqual([]);
  });

  it('flags missing recommended peer plugin (feature-dev) as warning when only the required peer is installed', async () => {
    const root = createProjectRoot();
    writeConfig(root);

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-required-only.json'),
      fileExists: fixtureAwareExists,
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
    const root = createProjectRoot();
    writeConfig(root);

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-required-only.json'),
      fileExists: (path) =>
        path.includes('/superpowers/') ? false : fixtureAwareExists(path),
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
    const root = createProjectRoot();

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: fixtureAwareExists,
      checkConfig: () => false,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'missing-config', severity: 'error' })
    );
  });

  it('flags version directories that are missing from knownVersions', async () => {
    const root = createProjectRoot();
    writeConfig(root);
    mkdirSync(join(root, 'docs/2.0/001-IN-PROGRESS'), { recursive: true });

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: fixtureAwareExists,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'version-shape-drift',
        severity: 'warning',
        message: expect.stringContaining('"2.0"'),
      })
    );
  });

  it('flags in-progress feature directories that are missing a workplan', async () => {
    const root = createProjectRoot();
    writeConfig(root);
    writeFeatureDocs(root, 'orphaned-feature', { includeWorkplan: false });

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: fixtureAwareExists,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'orphan-feature-doc',
        severity: 'warning',
        message: expect.stringContaining('orphaned-feature'),
      })
    );
  });

  it('flags closed parent issues for in-progress features', async () => {
    const root = createProjectRoot();
    writeConfig(root);
    writeFeatureDocs(root, 'stale-feature', { parentIssue: 42 });

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: fixtureAwareExists,
      resolveIssueState: (issueNumber) => (issueNumber === 42 ? 'CLOSED' : 'OPEN'),
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'stale-issue',
        severity: 'warning',
        message: expect.stringContaining('#42'),
      })
    );
  });

  it('flags journal feature headings whose slug has no feature docs', async () => {
    const root = createProjectRoot();
    writeConfig(root);
    writeFeatureDocs(root, 'tracked-feature');
    writeFileSync(
      join(root, 'DEVELOPMENT-NOTES.md'),
      '## 2026-05-03\n\n### Feature: tracked-feature\n\n### Feature: missing-feature\n',
      'utf8'
    );

    const findings = await runDoctor({
      projectRoot: root,
      pluginRegistry: loadFixture('installed-plugins-both-peers.json'),
      fileExists: fixtureAwareExists,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'journal-feature-mismatch',
        severity: 'warning',
        message: expect.stringContaining('missing-feature'),
      })
    );
    expect(findings).not.toContainEqual(
      expect.objectContaining({
        rule: 'journal-feature-mismatch',
        message: expect.stringContaining('tracked-feature'),
      })
    );
  });

  it('parses realistic registry fixtures and matches project scope against the current project root', () => {
    const fixturePath = join(FIXTURES_DIR, 'installed-plugins-both-peers.json');
    const raw = readFileSync(fixturePath, 'utf8');
    expect(raw).toContain('"superpowers@claude-plugins-official"');

    const registry = loadInstalledPluginsRegistry(fixturePath);
    expect(
      detectPeerPluginInstalled(registry, 'feature-dev', '/Users/test/work/sample-project', () => true)
    ).toBe(true);
    expect(
      detectPeerPluginInstalled(registry, 'frontend-design', '/Users/test/work/sample-project', () => true)
    ).toBe(false);
  });
});
