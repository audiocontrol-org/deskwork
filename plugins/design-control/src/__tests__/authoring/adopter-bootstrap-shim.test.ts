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
function buildIsolatedPlugin(): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'dc-adopter-'));
  dirs.push(root);

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
  const script = [
    '#!/bin/sh',
    'set -eu',
    `: > "${marker}"`,
    `mkdir -p "${nm}/.bin"`,
    `ln -sf "${realTsxBin}" "${nm}/.bin/tsx"`,
    `for dep in parse5 tsx zod; do`,
    `  mkdir -p "${nm}/$dep"`,
    `  printf '{"name":"%s","version":"0.0.0"}' "$dep" > "${nm}/$dep/package.json"`,
    `done`,
  ].join('\n');
  const npmPath = join(binDir, 'npm');
  writeFileSync(npmPath, `${script}\n`);
  chmodSync(npmPath, 0o755);
  return binDir;
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
});
