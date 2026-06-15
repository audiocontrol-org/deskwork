/**
 * Adopter-bootstrap smoke for the bin/ shims (AUDIT-20260614-31).
 *
 * A fresh marketplace install of ONLY this plugin (a git-subdir clone of
 * plugins/design-control/) has no node_modules, no hoisted tsx, and none of
 * the declared runtime deps (parse5 / tsx / zod). Before this fix the shims
 * only resolved tsx by walking up to a workspace-hoisted node_modules/.bin/tsx
 * and otherwise printed "run npm install first" and exit 1 — so the advertised
 * marketplace path failed on first use.
 *
 * This smoke reproduces adopter mode HERMETICALLY (no network npm install):
 *   - The isolated plugin root lives OUTSIDE the monorepo tree (under
 *     os.tmpdir()), so the shim's upward walk finds no hoisted tsx and the
 *     bootstrap path must fire. (A temp dir inside the monorepo would resolve
 *     the monorepo's hoisted tsx and never enter adopter mode.)
 *   - npm is stubbed on PATH: a fake `npm` that records it ran and FAKES the
 *     install — it writes the node_modules/.bin/tsx runner + the dep
 *     package.json files the probe checks (parse5 / tsx / zod). The real tsx
 *     binary is symlinked in so the post-install dispatch actually runs.
 *
 * The assertion that pins the bootstrap: the shim invokes the stub npm
 * (leaving its marker) and then dispatches to the CLI target (which prints a
 * sentinel and exits 0). Pre-fix the shim never runs npm and exits 1 with the
 * "run npm install first" message — that is the failing-for-the-right-reason
 * signal.
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(testDir, '..', '..', '..');
const realTsx = resolve(pluginRoot, 'bin');

// Resolve the real hoisted tsx binary so the faked post-install dispatch is a
// genuine tsx run (proves we reached dispatch, not just the install branch).
const repoRoot = resolve(pluginRoot, '..', '..');
const realTsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const SHIM_NAME = 'check-wireframe';
const HELPER_NAME = '_resolve-tsx.sh';
const CLI_REL = 'src/authoring/check-wireframe-cli.ts';

/**
 * Build an isolated plugin tree OUTSIDE the monorepo so the shim's upward walk
 * for a hoisted tsx finds nothing and adopter mode fires. Copies the REAL shim
 * + helper so we exercise the shipped logic, and substitutes a trivial CLI
 * target that prints a sentinel (avoids dragging the full src/ + its deps).
 */
function buildIsolatedPlugin(parentDir?: string): string {
  const base = parentDir ?? realpathSync(tmpdir());
  const root = mkdtempSync(join(base, 'dc-adopter-'));
  if (!parentDir) dirs.push(root);

  mkdirSync(join(root, 'bin'), { recursive: true });
  copyFileSync(join(realTsx, SHIM_NAME), join(root, 'bin', SHIM_NAME));
  copyFileSync(join(realTsx, HELPER_NAME), join(root, 'bin', HELPER_NAME));
  chmodSync(join(root, 'bin', SHIM_NAME), 0o755);

  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'design-control', version: '0.0.0-test' }),
  );
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@deskwork/plugin-design-control',
      dependencies: { parse5: '^7', tsx: '^4', zod: '^3' },
    }),
  );
  writeFileSync(join(root, 'tsconfig.json'), '{ "compilerOptions": {} }');

  mkdirSync(join(root, 'src', 'authoring'), { recursive: true });
  writeFileSync(
    join(root, CLI_REL),
    'console.log("DISPATCHED-OK");\nprocess.exit(0);\n',
  );

  return root;
}

/**
 * Write a stub npm earlier on PATH than the real one. It records that it ran
 * (a marker file under PLUGIN_ROOT) and FAKES the install — writing the
 * node_modules/.bin/tsx runner (symlinked to the real tsx) plus the dep
 * package.json files the probe checks. No network.
 */
function stubNpmDir(pluginRoot: string): string {
  const binDir = mkdtempSync(join(realpathSync(tmpdir()), 'dc-npm-stub-'));
  dirs.push(binDir);
  const marker = join(pluginRoot, '.stub-npm-ran');
  const nm = join(pluginRoot, 'node_modules');
  // The faked install lays down a RESOLVABLE dep set: real node_modules/<dep>
  // dirs with package.json "main", so the helper's Node-resolution probe (which
  // calls require(...).resolve('<dep>') from PLUGIN_ROOT) actually resolves
  // parse5 / zod locally. tsx is symlinked into .bin AND given a resolvable
  // package so the probe + the exec both succeed.
  const script = [
    '#!/bin/sh',
    'set -eu',
    // Record the npm subcommand ($1) into the marker so a test can assert the
    // shim uses `npm ci` (reproducible, locked) and not `npm install` (floats).
    `printf '%s' "$1" > "${marker}"`,
    `mkdir -p "${nm}/.bin"`,
    `ln -sf "${realTsxBin}" "${nm}/.bin/tsx"`,
    `for dep in parse5 tsx zod; do`,
    `  mkdir -p "${nm}/$dep"`,
    `  printf '{"name":"%s","version":"0.0.0","main":"index.js"}' "$dep" > "${nm}/$dep/package.json"`,
    `  printf 'module.exports = {};\\n' > "${nm}/$dep/index.js"`,
    `done`,
  ].join('\n');
  const npmPath = join(binDir, 'npm');
  writeFileSync(npmPath, `${script}\n`);
  chmodSync(npmPath, 0o755);
  return binDir;
}

/**
 * Seed an ANCESTOR node_modules/.bin/tsx above the isolated plugin root, so the
 * shim's upward walk finds an inherited tsx (the mixed-environment case in
 * AUDIT-20260614 Finding 1). The plugin's OWN parse5/zod are deliberately NOT
 * placed here — only tsx — so the resolution probe must still fail and fire the
 * install. The ancestor tsx is the real binary symlinked in.
 */
function seedAncestorTsx(parentDir: string): void {
  const ancestorBin = join(parentDir, 'node_modules', '.bin');
  mkdirSync(ancestorBin, { recursive: true });
  symlinkSync(realTsxBin, join(ancestorBin, 'tsx'));
}

/**
 * Seed a RESOLVABLE local dep set directly under PLUGIN_ROOT/node_modules (no
 * npm), so the resolution probe passes on the first try and NO install is
 * needed. Used to isolate the quoted-path behavior of the probe itself.
 */
function seedResolvableDeps(root: string): void {
  const nm = join(root, 'node_modules');
  mkdirSync(join(nm, '.bin'), { recursive: true });
  symlinkSync(realTsxBin, join(nm, '.bin', 'tsx'));
  for (const dep of ['parse5', 'tsx', 'zod']) {
    mkdirSync(join(nm, dep), { recursive: true });
    writeFileSync(
      join(nm, dep, 'package.json'),
      JSON.stringify({ name: dep, version: '0.0.0', main: 'index.js' }),
    );
    writeFileSync(join(nm, dep, 'index.js'), 'module.exports = {};\n');
  }
}

describe('bin shims — adopter (sparse-clone) bootstrap', () => {
  it('runs npm install on first run then dispatches when no hoisted tsx exists', () => {
    expect(existsSync(realTsxBin), `expected a real tsx at ${realTsxBin}`).toBe(
      true,
    );

    const root = buildIsolatedPlugin();
    const npmDir = stubNpmDir(root);
    const shim = join(root, 'bin', SHIM_NAME);
    const marker = join(root, '.stub-npm-ran');

    // PATH = [stub-npm dir, real PATH] — node still resolves (the helper's
    // sentinel-version read uses node, which the real PATH provides).
    const env = {
      ...process.env,
      PATH: `${npmDir}${delimiter}${process.env.PATH ?? ''}`,
    };

    const result = spawnSync(shim, ['--noop'], {
      cwd: root,
      encoding: 'utf8',
      env,
    });
    if (result.error) throw result.error;

    expect(
      existsSync(marker),
      `stub npm install was never invoked; stderr: ${result.stderr}`,
    ).toBe(true);
    // Reproducible install: the bootstrap must use `npm ci` (locked) — a
    // regression to `npm install` (which floats `^` ranges) fails here.
    expect(readFileSync(marker, 'utf8')).toBe('ci');
    expect(result.stderr).not.toContain('run npm install first');
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('DISPATCHED-OK');

    // The faked install wrote a real dep set; the probe must have passed.
    const installed = readFileSync(
      join(root, 'node_modules', 'zod', 'package.json'),
      'utf8',
    );
    expect(installed).toContain('"name":"zod"');
  }, 60_000);

  it('still bootstraps when an ANCESTOR tsx exists but the plugin deps do not resolve (mixed env)', () => {
    expect(existsSync(realTsxBin), `expected a real tsx at ${realTsxBin}`).toBe(
      true,
    );

    // Parent dir carries a node_modules/.bin/tsx (inherited tsx), but NONE of
    // the plugin's own runtime deps. The isolated plugin lives UNDER it.
    const parent = mkdtempSync(join(realpathSync(tmpdir()), 'dc-ancestor-'));
    dirs.push(parent);
    seedAncestorTsx(parent);

    const root = buildIsolatedPlugin(parent);
    const npmDir = stubNpmDir(root);
    const shim = join(root, 'bin', SHIM_NAME);
    const marker = join(root, '.stub-npm-ran');

    const env = {
      ...process.env,
      PATH: `${npmDir}${delimiter}${process.env.PATH ?? ''}`,
    };

    const result = spawnSync(shim, ['--noop'], {
      cwd: root,
      encoding: 'utf8',
      env,
    });
    if (result.error) throw result.error;

    // The ancestor tsx must NOT short-circuit the bootstrap: with parse5/zod
    // unresolvable from PLUGIN_ROOT, the resolution probe fails and install runs.
    expect(
      existsSync(marker),
      `ancestor tsx short-circuited the bootstrap; stub npm never ran. stderr: ${result.stderr}`,
    ).toBe(true);
    expect(result.stderr).not.toContain('run npm install first');
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('DISPATCHED-OK');
  }, 60_000);

  it('resolves and dispatches when the plugin path contains a single quote (AUDIT-20260614-42)', () => {
    expect(existsSync(realTsxBin), `expected a real tsx at ${realTsxBin}`).toBe(
      true,
    );

    // A valid path that contains a single quote. Pre-fix, the probe interpolated
    // $PLUGIN_ROOT into a JS single-quoted literal, so the inline `node -e`
    // became a syntax error and every verb failed before bootstrap could help.
    const parent = mkdtempSync(join(realpathSync(tmpdir()), "dc-o'brien-"));
    dirs.push(parent);
    const root = buildIsolatedPlugin(parent);

    // Deps already resolvable -> a quote-safe probe passes WITHOUT install.
    seedResolvableDeps(root);
    const npmDir = stubNpmDir(root); // safety net; must NOT be invoked
    const shim = join(root, 'bin', SHIM_NAME);
    const marker = join(root, '.stub-npm-ran');

    const env = {
      ...process.env,
      PATH: `${npmDir}${delimiter}${process.env.PATH ?? ''}`,
    };

    const result = spawnSync(shim, ['--noop'], {
      cwd: root,
      encoding: 'utf8',
      env,
    });
    if (result.error) throw result.error;

    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('DISPATCHED-OK');
    // The probe resolved on the quoted path WITHOUT crashing, so no install
    // should have fired. (Pre-fix the broken probe forces the install branch and
    // then re-fails the re-probe -> exit 1.)
    expect(
      existsSync(marker),
      `install ran on a quoted path -> the probe failed on the single quote; stderr: ${result.stderr}`,
    ).toBe(false);
  }, 60_000);
});
