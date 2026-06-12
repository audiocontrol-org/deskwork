/**
 * 010 — scope-export tests (ported + adapted from dw-lifecycle).
 *
 * Asserts the generalized per-codebase base-root resolution: the manifest path
 * resolves under the enclosing installation by default; `--repo-root` and
 * `--at` override. On-disk fixtures only. Subprocess CLI surface is left to
 * the integrator (cli.ts wiring).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { main } from '../../scope-discovery/scope-export.js';

const SAMPLE_MANIFEST = [
  'schemaVersion: 1',
  'slug: graphical-entries',
  'kind: code',
  'agents:',
  '  - name: ui-route-enumerator',
  '    summary: 4 routes enumerated',
  '',
].join('\n');

let fixtures: Fixture[] = [];
function fx(): Fixture {
  const f = makeFixture('sd-export-');
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.cleanup();
});

function plantManifest(f: Fixture, slug: string): string {
  return f.writeFile(`docs/1.0/001-IN-PROGRESS/${slug}/scope-manifest.yaml`, SAMPLE_MANIFEST);
}

describe('scope-export — base-root resolution', () => {
  it('resolves the default manifest path from --slug under the enclosing installation (--at)', async () => {
    const f = fx();
    const root = f.install('.');
    const manifestPath = plantManifest(f, 'graphical-entries');
    const result = await main(['--slug', 'graphical-entries', '--at', root, '--quiet']);
    expect(result.code).toBe(0);
    expect(result.resolvedPath).toBe(manifestPath);
  });

  it('--repo-root overrides the base root explicitly (no installation needed)', async () => {
    const f = fx();
    // No installation — --repo-root short-circuits the boundary resolution.
    const manifestPath = plantManifest(f, 'graphical-entries');
    const result = await main([
      '--slug',
      'graphical-entries',
      '--repo-root',
      f.root,
      '--quiet',
    ]);
    expect(result.code).toBe(0);
    expect(result.resolvedPath).toBe(manifestPath);
  });

  it('--manifest overrides the path entirely (relative to base root)', async () => {
    const f = fx();
    const root = f.install('.');
    const manifestPath = f.writeFile('custom/scope.yaml', SAMPLE_MANIFEST);
    const result = await main(['--manifest', 'custom/scope.yaml', '--at', root, '--quiet']);
    expect(result.code).toBe(0);
    expect(result.resolvedPath).toBe(manifestPath);
  });

  it('exits 2 on an unresolvable feature (specs/014 US7: failure moves from read time to layout-aware resolution time)', async () => {
    const f = fx();
    const root = f.install('.');
    const result = await main(['--slug', 'absent', '--at', root, '--quiet']);
    expect(result.code).toBe(2);
    // Pre-014 this constructed a legacy docs path and failed at read
    // time; under FR-010 the default routes through resolveFeatureRoot,
    // which fails loud before any path exists to report.
    expect(result.resolvedPath).toBeUndefined();
  });

  it('exits 2 on a missing manifest at an explicitly-named path (read-time failure keeps the resolved path)', async () => {
    const f = fx();
    const root = f.install('.');
    const result = await main(['--manifest', 'custom/absent.yaml', '--at', root, '--quiet']);
    expect(result.code).toBe(2);
    expect(result.resolvedPath).toBe(join(root, 'custom/absent.yaml'));
  });

  it('exits 2 when neither --slug nor --manifest is given', async () => {
    const result = await main(['--quiet']);
    expect(result.code).toBe(2);
  });

  it('rejects an invalid slug', async () => {
    const result = await main(['--slug', 'Bad_Slug', '--repo-root', '/tmp', '--quiet']);
    expect(result.code).toBe(2);
  });
});
