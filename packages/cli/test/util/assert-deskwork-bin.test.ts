/**
 * Unit tests for `assertDeskworkBinPresent` and the `deskworkBin`
 * resolution constant.
 *
 * AUDIT-20260530-82 (cross-model: AUDIT-BARRAGE-claude-P6-3). Covers
 * three invariants:
 *
 *   1. Happy path: the real workspace bin resolves under
 *      `packages/cli/dist/` and the assertion does not throw.
 *   2. Missing-bin failure mode: the assertion's error message names
 *      both `npm install` AND `npm run build` (not just install) so
 *      operators land on the correct remediation.
 *   3. Stale-target failure mode: when the bin resolves outside the
 *      expected `packages/cli/dist/` directory, the assertion throws
 *      a message naming the build command.
 *
 * (2) and (3) exercise the public function via real on-disk symlink
 * scenarios in a tmpdir — no mocking. The fixtures construct a fake
 * `node_modules/.bin/deskwork` shim with a known resolution target,
 * then re-import the module under that workspace root by point-loading
 * a generated wrapper that re-exports the production helper. The
 * cleanup deletes the tmpdir.
 */

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertDeskworkBinPresent,
  deskworkBin,
} from './assert-deskwork-bin.ts';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../../..');

describe('assertDeskworkBinPresent (real workspace bin)', () => {
  it('resolves the workspace bin under packages/cli/dist/', () => {
    expect(deskworkBin).toBe(
      join(workspaceRoot, 'node_modules/.bin/deskwork'),
    );
    // The bin in the workspace is freshly built by the suite's setup.
    // This call should succeed against the live workspace symlink.
    expect(() => assertDeskworkBinPresent()).not.toThrow();
  });
});

/**
 * Construct an isolated fake-workspace tree under tmp and import a
 * generated module that re-exports `assertDeskworkBinPresent` from a
 * cloned source file. The clone is necessary because the production
 * helper computes `workspaceRoot` from its own `import.meta.url`; to
 * exercise the helper against a different workspace root we have to
 * place a copy of the source at the equivalent `test/util/` depth
 * inside the fake workspace.
 */
async function loadHelperUnderFakeRoot(rootDir: string): Promise<{
  assertDeskworkBinPresent: () => void;
  deskworkBin: string;
}> {
  const fakeUtilDir = join(rootDir, 'packages/cli/test/util');
  mkdirSync(fakeUtilDir, { recursive: true });
  const srcPath = join(testDir, 'assert-deskwork-bin.ts');
  const dstPath = join(fakeUtilDir, 'assert-deskwork-bin.ts');
  // Copy the source verbatim via fs.readFileSync + writeFileSync (no
  // mocking — the clone is the exercise harness).
  const { readFileSync } = await import('node:fs');
  writeFileSync(dstPath, readFileSync(srcPath, 'utf-8'), 'utf-8');
  // Cache-bust each load: vitest reuses the module graph, so we
  // suffix the URL with the rootDir to ensure a fresh import.
  const moduleUrl =
    pathToFileURL(dstPath).href + '?probe=' + encodeURIComponent(rootDir);
  return (await import(moduleUrl)) as {
    assertDeskworkBinPresent: () => void;
    deskworkBin: string;
  };
}

describe('assertDeskworkBinPresent (failure modes via fake workspace)', () => {
  it('throws with build command hint when the bin is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dw-bin-missing-'));
    try {
      // node_modules/.bin/ does not exist — assertion should throw the
      // not-found error.
      const helper = await loadHelperUnderFakeRoot(root);
      let error: unknown;
      try {
        helper.assertDeskworkBinPresent();
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toMatch(/deskwork binary not found/);
      expect(message).toMatch(/npm install/);
      expect(message).toMatch(/npm --workspace @deskwork\/cli run build/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws when the bin resolves outside packages/cli/dist/', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dw-bin-stale-'));
    try {
      // Build a fake bin that resolves to a sibling location OUTSIDE
      // the expected `packages/cli/dist/` directory. This simulates a
      // standalone npm-installed copy or a misconfigured workspace.
      const binDir = join(root, 'node_modules/.bin');
      mkdirSync(binDir, { recursive: true });
      const standaloneCli = join(root, 'standalone/cli.js');
      mkdirSync(dirname(standaloneCli), { recursive: true });
      writeFileSync(standaloneCli, '#!/usr/bin/env node\n', 'utf-8');
      symlinkSync(standaloneCli, join(binDir, 'deskwork'));

      const helper = await loadHelperUnderFakeRoot(root);
      let error: unknown;
      try {
        helper.assertDeskworkBinPresent();
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toMatch(/not under the workspace's/);
      expect(message).toMatch(/packages\/cli\/dist/);
      expect(message).toMatch(/npm --workspace @deskwork\/cli run build/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws with build hint when the symlink target is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dw-bin-dangling-'));
    try {
      // Build a dangling symlink — points at a path that doesn't
      // exist on disk. The bin file IS present (existsSync follows
      // symlinks but returns true for the link itself only on some
      // platforms; here we make the target absent post-creation).
      const binDir = join(root, 'node_modules/.bin');
      mkdirSync(binDir, { recursive: true });
      const targetPath = join(root, 'packages/cli/dist/cli.js');
      // Don't mkdir the target's parent — the symlink is dangling.
      symlinkSync(targetPath, join(binDir, 'deskwork'));

      const helper = await loadHelperUnderFakeRoot(root);
      let error: unknown;
      try {
        helper.assertDeskworkBinPresent();
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      // Either the existsSync gate fires (the link target doesn't
      // exist, so existsSync returns false) or the realpath gate
      // fires (symlink unresolvable). Both messages mention the
      // build command, which is the test's invariant.
      expect(message).toMatch(/npm --workspace @deskwork\/cli run build/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
