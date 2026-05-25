/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/scope-export.test.ts
 *
 * Tests for scope-export. Asserts:
 *   - default path resolution from --slug
 *   - --manifest override
 *   - --json round-trips the YAML through parseYaml + JSON.stringify
 *   - missing manifest exits 2 with actionable stderr
 *   - malformed YAML in --json mode exits 2
 *   - invalid slug rejected
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../scope-discovery/scope-export.js';
import { runScannerSubprocess } from './util/run-scanner.js';
import { isPlainObject } from '../../scope-discovery/util/typeguards.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

const SAMPLE_MANIFEST = [
  'schemaVersion: 1',
  'slug: graphical-entries',
  'kind: code',
  'agents:',
  '  - name: ui-route-enumerator',
  '    summary: 4 routes enumerated',
  '  - name: pattern-matrix',
  '    summary: 2 patterns flagged',
  '',
].join('\n');

interface Fixture {
  readonly dir: string;
  readonly manifestPath: string;
  readonly relManifestPath: string;
  cleanup(): Promise<void>;
}

async function makeFixture(slug: string): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), `scope-export-`));
  const docsDir = join(dir, 'docs', '1.0', '001-IN-PROGRESS', slug);
  await mkdir(docsDir, { recursive: true });
  const manifestPath = join(docsDir, 'scope-manifest.yaml');
  await writeFile(manifestPath, SAMPLE_MANIFEST, 'utf8');
  return {
    dir,
    manifestPath,
    relManifestPath: `docs/1.0/001-IN-PROGRESS/${slug}/scope-manifest.yaml`,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe('scope-export — programmatic main', () => {
  it('resolves the default manifest path from --slug + --repo-root', async () => {
    const fixture = await makeFixture('graphical-entries');
    try {
      const result = await main([
        '--slug',
        'graphical-entries',
        '--repo-root',
        fixture.dir,
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      expect(result.resolvedPath).toBe(fixture.manifestPath);
    } finally {
      await fixture.cleanup();
    }
  });

  it('honors --manifest override (absolute path)', async () => {
    const fixture = await makeFixture('any-slug');
    try {
      const result = await main(['--manifest', fixture.manifestPath, '--quiet']);
      expect(result.code).toBe(0);
      expect(result.resolvedPath).toBe(fixture.manifestPath);
    } finally {
      await fixture.cleanup();
    }
  });

  it('honors --manifest override (relative + --repo-root)', async () => {
    const fixture = await makeFixture('any-slug');
    try {
      const result = await main([
        '--manifest',
        fixture.relManifestPath,
        '--repo-root',
        fixture.dir,
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      expect(result.resolvedPath).toBe(fixture.manifestPath);
    } finally {
      await fixture.cleanup();
    }
  });

  it('exits 2 when neither --slug nor --manifest is provided', async () => {
    const result = await main([]);
    expect(result.code).toBe(2);
  });

  it('rejects malformed slug', async () => {
    const result = await main(['--slug', '-bad-slug']);
    expect(result.code).toBe(2);
  });

  it('exits 2 when the manifest does not exist', async () => {
    const result = await main(['--manifest', '/no/such/manifest.yaml', '--quiet']);
    expect(result.code).toBe(2);
  });
});

describe('scope-export — CLI surface', () => {
  it('emits the manifest verbatim on stdout', async () => {
    const fixture = await makeFixture('graphical-entries');
    try {
      const run = await runScannerSubprocess(CLI_ENTRY, [
        'scope-export',
        '--slug',
        'graphical-entries',
        '--repo-root',
        fixture.dir,
        '--quiet',
      ]);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('slug: graphical-entries');
      expect(run.stdout).toContain('ui-route-enumerator');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--json emits parseable JSON with the manifest contents', async () => {
    const fixture = await makeFixture('graphical-entries');
    try {
      const run = await runScannerSubprocess(CLI_ENTRY, [
        'scope-export',
        '--slug',
        'graphical-entries',
        '--repo-root',
        fixture.dir,
        '--quiet',
        '--json',
      ]);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      const parsed: unknown = JSON.parse(run.stdout);
      expect(isPlainObject(parsed)).toBe(true);
      if (!isPlainObject(parsed)) return;
      expect(parsed['slug']).toBe('graphical-entries');
      expect(parsed['schemaVersion']).toBe(1);
      expect(Array.isArray(parsed['agents'])).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('missing manifest exits 2 with actionable stderr', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, [
      'scope-export',
      '--manifest',
      '/no/such/manifest.yaml',
      '--quiet',
    ]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('failed to read manifest');
  });

  it('--help exits 0 with usage banner', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['scope-export', '--help']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('scope-export');
    expect(run.stdout).toContain('--manifest');
  });
});
