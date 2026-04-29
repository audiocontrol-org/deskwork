/**
 * Tests for `buildClientAssets` — Phase 23e on-startup esbuild.
 *
 * Each test sets up a fixture pluginRoot on disk (no fs mocks per
 * project rules) with `public/src/<name>.ts` entries, then exercises
 * the build/cache behavior end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildClientAssets } from '../src/build-client-assets.ts';

interface Fixture {
  readonly pluginRoot: string;
  readonly srcDir: string;
  readonly outDir: string;
  cleanup(): Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'deskwork-bc-'));
  const srcDir = join(pluginRoot, 'public', 'src');
  const outDir = join(pluginRoot, '.runtime-cache', 'dist');
  await mkdir(srcDir, { recursive: true });
  return {
    pluginRoot,
    srcDir,
    outDir,
    async cleanup() {
      await rm(pluginRoot, { recursive: true, force: true });
    },
  };
}

async function writeEntry(srcDir: string, name: string, body: string): Promise<string> {
  const path = join(srcDir, `${name}.ts`);
  await writeFile(path, body, 'utf8');
  return path;
}

describe('buildClientAssets', () => {
  it('produces a .runtime-cache/dist/<name>.js for each public/src/<name>.ts', async () => {
    const fx = await makeFixture();
    try {
      await writeEntry(fx.srcDir, 'one', "export const one = 1;\n");
      await writeEntry(fx.srcDir, 'two', "export const two = 2;\n");

      const summary = await buildClientAssets({ pluginRoot: fx.pluginRoot });

      expect(summary.entriesBuilt).toBe(2);
      expect(summary.entriesCached).toBe(0);
      expect(summary.outDir).toBe(fx.outDir);

      const oneJs = await readFile(join(fx.outDir, 'one.js'), 'utf8');
      const twoJs = await readFile(join(fx.outDir, 'two.js'), 'utf8');
      expect(oneJs).toContain('one');
      expect(twoJs).toContain('two');
      expect(summary.totalBytes).toBeGreaterThan(0);
    } finally {
      await fx.cleanup();
    }
  });

  it('re-running with no source changes leaves files untouched (cached)', async () => {
    const fx = await makeFixture();
    try {
      await writeEntry(fx.srcDir, 'a', "export const a = 'a';\n");
      await writeEntry(fx.srcDir, 'b', "export const b = 'b';\n");

      const first = await buildClientAssets({ pluginRoot: fx.pluginRoot });
      expect(first.entriesBuilt).toBe(2);

      const aMtimeBefore = (await stat(join(fx.outDir, 'a.js'))).mtimeMs;
      const bMtimeBefore = (await stat(join(fx.outDir, 'b.js'))).mtimeMs;

      const second = await buildClientAssets({ pluginRoot: fx.pluginRoot });
      expect(second.entriesBuilt).toBe(0);
      expect(second.entriesCached).toBe(2);

      const aMtimeAfter = (await stat(join(fx.outDir, 'a.js'))).mtimeMs;
      const bMtimeAfter = (await stat(join(fx.outDir, 'b.js'))).mtimeMs;
      expect(aMtimeAfter).toBe(aMtimeBefore);
      expect(bMtimeAfter).toBe(bMtimeBefore);
    } finally {
      await fx.cleanup();
    }
  });

  it('touching an entry source rebuilds only that entry', async () => {
    const fx = await makeFixture();
    try {
      const aPath = await writeEntry(fx.srcDir, 'a', "export const a = 1;\n");
      await writeEntry(fx.srcDir, 'b', "export const b = 2;\n");

      const first = await buildClientAssets({ pluginRoot: fx.pluginRoot });
      expect(first.entriesBuilt).toBe(2);

      const aOutBefore = (await stat(join(fx.outDir, 'a.js'))).mtimeMs;
      const bOutBefore = (await stat(join(fx.outDir, 'b.js'))).mtimeMs;

      // Bump only `a.ts`'s mtime to be 5 seconds in the future. utimes
      // takes seconds; using a future time avoids races against any
      // filesystem mtime resolution quirks.
      const future = new Date(Date.now() + 5000);
      await utimes(aPath, future, future);

      const second = await buildClientAssets({ pluginRoot: fx.pluginRoot });
      expect(second.entriesBuilt).toBe(1);
      expect(second.entriesCached).toBe(1);

      const aOutAfter = (await stat(join(fx.outDir, 'a.js'))).mtimeMs;
      const bOutAfter = (await stat(join(fx.outDir, 'b.js'))).mtimeMs;
      expect(aOutAfter).toBeGreaterThan(aOutBefore);
      expect(bOutAfter).toBe(bOutBefore);
    } finally {
      await fx.cleanup();
    }
  });

  it('throws a clear error when public/src/ is missing', async () => {
    const fx = await makeFixture();
    try {
      // Remove the src dir we created in the fixture to simulate a
      // pluginRoot with no client entries.
      await rm(fx.srcDir, { recursive: true, force: true });

      await expect(
        buildClientAssets({ pluginRoot: fx.pluginRoot }),
      ).rejects.toThrow(/cannot read client source dir/);
    } finally {
      await fx.cleanup();
    }
  });

  it('throws when public/src/ exists but has no .ts entries', async () => {
    const fx = await makeFixture();
    try {
      // Drop a non-.ts file to confirm extension filtering.
      await writeFile(join(fx.srcDir, 'README.md'), '# nothing\n', 'utf8');
      await expect(
        buildClientAssets({ pluginRoot: fx.pluginRoot }),
      ).rejects.toThrow(/no \.ts entries found/);
    } finally {
      await fx.cleanup();
    }
  });
});
