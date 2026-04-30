/**
 * `deskwork customize` integration test.
 *
 * Exercises the dispatched binary against a fixture project. Asserts:
 *   - Templates: copies `packages/studio/src/pages/dashboard.ts` to
 *     `<fixtureRoot>/.deskwork/templates/dashboard.ts`.
 *   - Doctor: copies a built-in rule to `.deskwork/doctor/<rule>.ts`.
 *   - Refuses to clobber an existing destination file.
 *   - Rejects unknown categories with exit 2.
 *   - Rejects the reserved `prompts` category (no defaults yet).
 *   - Tarball-shape regression (#95): the published `@deskwork/studio`
 *     and `@deskwork/core` packages carry the customize source files
 *     under `dist/<category>/` so customize works against npm-installed
 *     plugins (where `src/` is excluded from the `files` whitelist).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');
const studioPagesDir = join(workspaceRoot, 'packages/studio/src/pages');
const doctorRulesDir = join(workspaceRoot, 'packages/core/src/doctor/rules');
const studioPackageRoot = join(workspaceRoot, 'packages/studio');
const corePackageRoot = join(workspaceRoot, 'packages/core');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): RunResult {
  const r = spawnSync(deskworkBin, ['customize', ...args], {
    encoding: 'utf-8',
  });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

describe('deskwork customize', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'deskwork-customize-'));
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('copies a templates default into .deskwork/templates/<name>.ts', () => {
    const res = run([project, 'templates', 'dashboard']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Customized templates\/dashboard/);

    const dest = join(project, '.deskwork', 'templates', 'dashboard.ts');
    expect(existsSync(dest)).toBe(true);

    // Byte-for-byte copy of the source.
    const source = readFileSync(
      join(studioPagesDir, 'dashboard.ts'),
      'utf-8',
    );
    expect(readFileSync(dest, 'utf-8')).toBe(source);
  });

  it('copies a doctor rule default into .deskwork/doctor/<name>.ts', () => {
    const res = run([project, 'doctor', 'missing-frontmatter-id']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Customized doctor\/missing-frontmatter-id/);

    const dest = join(
      project,
      '.deskwork',
      'doctor',
      'missing-frontmatter-id.ts',
    );
    expect(existsSync(dest)).toBe(true);
    const source = readFileSync(
      join(doctorRulesDir, 'missing-frontmatter-id.ts'),
      'utf-8',
    );
    expect(readFileSync(dest, 'utf-8')).toBe(source);
  });

  it('refuses to clobber an existing destination file', () => {
    const dest = join(project, '.deskwork', 'templates', 'dashboard.ts');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, '// pre-existing operator edit', 'utf-8');

    const res = run([project, 'templates', 'dashboard']);
    expect(res.code).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/already exists|Refusing to overwrite/);
    // The original content must not have been clobbered.
    expect(readFileSync(dest, 'utf-8')).toBe(
      '// pre-existing operator edit',
    );
  });

  it('rejects an unknown category with exit code 2', () => {
    const res = run([project, 'not-a-category', 'whatever']);
    expect(res.code).toBe(2);
    expect(res.stderr + res.stdout).toMatch(/unknown category/);
  });

  it('rejects the reserved prompts category cleanly', () => {
    const res = run([project, 'prompts', 'whatever']);
    expect(res.code).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/reserved for future use/);
  });

  it('errors when the requested template name does not exist as a built-in', () => {
    const res = run([project, 'templates', 'definitely-not-a-page']);
    expect(res.code).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/no built-in template/);
  });
});

/**
 * Tarball-shape regression test for #95.
 *
 * The npm tarball's `files` whitelist is `["dist", "package.json",
 * "README.md"]`, which excludes `src/`. Before #95, customize
 * resolved its built-in templates from `<pkg>/src/<category>/<name>.ts`
 * — present in workspace dev (where `node_modules/@deskwork/<pkg>` is
 * a workspace symlink) but absent for any adopter that npm-installed
 * the published package.
 *
 * The fix copies the customize source files verbatim into
 * `dist/<category>/` as part of each package's build pipeline, then
 * customize anchors on `dist/<category>/<name>.ts`. This test asserts
 * the contract by `npm pack`-ing each package and verifying the
 * tarball carries the customize content under `dist/`.
 */
describe('deskwork customize — npm-installed shape (#95 regression)', () => {
  let tarballDir: string;

  beforeEach(() => {
    tarballDir = mkdtempSync(join(tmpdir(), 'deskwork-tarball-'));
  });

  afterEach(() => {
    rmSync(tarballDir, { recursive: true, force: true });
  });

  function packAndExtract(packageDir: string): string {
    const packResult = spawnSync(
      'npm',
      ['pack', '--silent', '--pack-destination', tarballDir],
      {
        cwd: packageDir,
        encoding: 'utf-8',
      },
    );
    if (packResult.status !== 0) {
      throw new Error(
        `npm pack failed (exit ${packResult.status}) for ${packageDir}: ${packResult.stderr}`,
      );
    }
    const tarballName = (packResult.stdout ?? '').trim().split(/\s+/).pop();
    if (!tarballName) {
      throw new Error(
        `npm pack produced no tarball name for ${packageDir}: stdout=${packResult.stdout}`,
      );
    }
    const tarballPath = join(tarballDir, tarballName);
    const extractDir = join(tarballDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    const tarResult = spawnSync(
      'tar',
      ['-xzf', tarballPath, '-C', extractDir],
      { encoding: 'utf-8' },
    );
    if (tarResult.status !== 0) {
      throw new Error(
        `tar -xzf failed (exit ${tarResult.status}) for ${tarballPath}: ${tarResult.stderr}`,
      );
    }
    return join(extractDir, 'package');
  }

  it(
    '@deskwork/studio tarball ships dist/pages/dashboard.ts (customize anchor)',
    { timeout: 30_000 },
    () => {
      const pkgRoot = packAndExtract(studioPackageRoot);
      const customizeAnchor = join(pkgRoot, 'dist', 'pages', 'dashboard.ts');
      expect(existsSync(customizeAnchor)).toBe(true);
      const expected = readFileSync(
        join(studioPagesDir, 'dashboard.ts'),
        'utf-8',
      );
      expect(readFileSync(customizeAnchor, 'utf-8')).toBe(expected);
    },
  );

  it(
    '@deskwork/core tarball ships dist/doctor/rules/missing-frontmatter-id.ts (customize anchor)',
    { timeout: 30_000 },
    () => {
      const pkgRoot = packAndExtract(corePackageRoot);
      const customizeAnchor = join(
        pkgRoot,
        'dist',
        'doctor',
        'rules',
        'missing-frontmatter-id.ts',
      );
      expect(existsSync(customizeAnchor)).toBe(true);
      const expected = readFileSync(
        join(doctorRulesDir, 'missing-frontmatter-id.ts'),
        'utf-8',
      );
      expect(readFileSync(customizeAnchor, 'utf-8')).toBe(expected);
    },
  );
});

/**
 * Manifest-shape regression for #101.
 *
 * `@deskwork/cli` and `@deskwork/studio` previously declared
 * `dependencies: { "@deskwork/core": "*" }`. Wildcard ranges let npm
 * satisfy the requirement with whatever stale @deskwork/core happened
 * to be in the install tree, so the v0.9.6 customize fix (#95) didn't
 * deliver to adopters running an older @deskwork/core. Lockstep is
 * enforced by `scripts/bump-version.ts` — every @deskwork/* dep across
 * the monorepo must move with the package version it travels with.
 *
 * This test asserts the invariant directly against the on-disk
 * manifests: no @deskwork/* dep anywhere uses "*", "latest", or any
 * range expression. Caret/tilde would also break lockstep; the only
 * legitimate value is an exact-version pin matching the root version.
 */
describe('monorepo manifest invariants (#101 regression)', () => {
  const rootPkg = JSON.parse(
    readFileSync(join(workspaceRoot, 'package.json'), 'utf-8'),
  ) as { version: string };
  const ROOT_VERSION = rootPkg.version;

  const LOCKSTEP_MANIFESTS = [
    'packages/cli/package.json',
    'packages/studio/package.json',
    'plugins/deskwork/package.json',
    'plugins/deskwork-studio/package.json',
  ];

  for (const relPath of LOCKSTEP_MANIFESTS) {
    it(`${relPath}: every @deskwork/* dep is pinned to exactly ${ROOT_VERSION}`, () => {
      const manifest = JSON.parse(
        readFileSync(join(workspaceRoot, relPath), 'utf-8'),
      ) as { dependencies?: Record<string, string> };
      const deps = manifest.dependencies ?? {};
      const deskworkDeps = Object.entries(deps).filter(([name]) =>
        name.startsWith('@deskwork/'),
      );
      // Each lockstep manifest must declare at least one @deskwork/*
      // dep — otherwise the entry is in the wrong list.
      expect(deskworkDeps.length).toBeGreaterThan(0);
      for (const [name, range] of deskworkDeps) {
        expect(
          range,
          `${relPath} dep ${name} must be pinned to "${ROOT_VERSION}", got "${range}"`,
        ).toBe(ROOT_VERSION);
      }
    });
  }
});
