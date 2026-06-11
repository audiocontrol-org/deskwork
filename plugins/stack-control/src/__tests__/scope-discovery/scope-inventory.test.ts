/**
 * plugins/stack-control/src/__tests__/scope-discovery/scope-inventory.test.ts
 *
 * 010 T036 (US3, FR-015) — the deterministic upfront inventory.
 *
 * Drives `scopeInventoryMain()` end-to-end over an on-disk fixture and
 * asserts it:
 *   - exits 0,
 *   - writes a schema-valid scope-manifest.yaml to --out,
 *   - does so WITHOUT firing any audit-orchestration loop (the 010
 *     decoupling): the run completes purely from the deterministic
 *     discovery agents + synthesis. (There is no audit-log read/write
 *     side effect to assert against — its absence is the contract; the
 *     run simply succeeds with no `.stack-control` audit artifacts.)
 *
 * Builds a real fixture tree on disk; never mocks fs.
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { scopeInventoryMain } from '../../scope-discovery/scope-inventory.js';
import { isPlainObject } from '../../scope-discovery/util/typeguards.js';

const PRD = [
  '# Feature: inv-fixture',
  '',
  '## Overview',
  '',
  'The widget module is the surface under discovery. widget widget widget.',
  '',
  '## References',
  '',
  '- a reference doc',
  '',
].join('\n');

const CLONES_YAML = [
  'generated_at: 2026-06-10T00:00:00Z',
  'clones:',
  '  - id: abcd1234ef56',
  '    lines: 10',
  '    members:',
  '      - src/widget/a.ts:1-10',
  '      - src/widget/b.ts:1-10',
  '    disposition: pending',
  '    reason: null',
  '',
].join('\n');

interface Fixture {
  readonly root: string;
  readonly prdPath: string;
  readonly outPath: string;
  cleanup(): Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'inv-'));
  // The fixture root is an INSTALLATION (the marker the --at walk-up
  // resolves; specs/installation-isolation R2 retired --repo-root).
  await mkdir(join(root, '.stack-control'), { recursive: true });
  await writeFile(join(root, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  const docsDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'inv-fixture');
  await mkdir(docsDir, { recursive: true });
  const prdPath = join(docsDir, 'prd.md');
  await writeFile(prdPath, PRD, 'utf8');

  const widgetDir = join(root, 'src', 'widget');
  await mkdir(widgetDir, { recursive: true });
  await writeFile(join(widgetDir, 'a.ts'), 'export const a = (x: unknown) => x as Foo;\n', 'utf8');
  await writeFile(join(widgetDir, 'b.ts'), 'export const b = 2;\n', 'utf8');

  const sdDir = join(root, '.stack-control', 'scope-discovery');
  await mkdir(sdDir, { recursive: true });
  await writeFile(join(sdDir, 'clones.yaml'), CLONES_YAML, 'utf8');

  return {
    root,
    prdPath,
    outPath: join(docsDir, 'scope-manifest.yaml'),
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('scope-inventory — deterministic inventory writes a valid manifest (T036)', () => {
  it('exits 0 and writes a schema-valid manifest, no audit loop', async () => {
    const fixture = await makeFixture();
    try {
      const code = await scopeInventoryMain([
        '--slug',
        'inv-fixture',
        '--at',
        fixture.root,
        '--prd-path',
        fixture.prdPath,
        '--out',
        fixture.outPath,
        '--evidence-trail',
        'off',
        '--quiet',
      ]);
      expect(code).toBe(0);

      // Manifest was written and parses to a code-kind object.
      expect(await exists(fixture.outPath)).toBe(true);
      const text = await readFile(fixture.outPath, 'utf8');
      const parsed: unknown = parseYaml(text);
      if (!isPlainObject(parsed)) throw new Error('manifest is not an object');
      expect(parsed['kind']).toBe('code');
      expect(parsed['feature_slug']).toBe('inv-fixture');

      // The 010 decoupling: no audit-orchestration artifacts are written.
      // The deterministic inventory never creates an audit-log or
      // audit-request file.
      const auditLog = join(
        fixture.root,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        'inv-fixture',
        'audit-log.md',
      );
      expect(await exists(auditLog)).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
