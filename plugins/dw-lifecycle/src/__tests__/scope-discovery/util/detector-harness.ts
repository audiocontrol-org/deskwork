/**
 * Test-side harness for spawning the plugin CLI dispatcher at
 * `dw-lifecycle check-clones ...` against a per-test fixture. (The
 * legacy `dw-lifecycle detect-clones` alias still resolves to the
 * same handler; the rename is covered by a dedicated alias-symmetry
 * test in `check-clones.alias.test.ts`.)
 *
 * Each fixture is self-contained:
 *   - A unique directory under the OS tmpdir holds the fixture files,
 *     a per-fixture `.jscpd.json`, and the eventual baseline YAML +
 *     jscpd JSON report.
 *   - The subprocess runs with `cwd = fixture.dir`, so the detector's
 *     `REPO_ROOT = process.cwd()` resolves to the fixture; the
 *     `.jscpd.json` config and `reports/duplication/jscpd-report.json`
 *     output live entirely inside the fixture.
 *   - Tests don't share state with each other or with the working
 *     copy. They can in principle run in parallel without colliding
 *     on the shared `reports/duplication/jscpd-report.json` path that
 *     would otherwise serialize them.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScannerSubprocess, type ScannerRun } from './run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/util/ -> src/cli.ts is ../../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', '..', 'cli.ts');

/**
 * Per-fixture jscpd config — same shape as the plugin template but
 * tuned for the small synthetic bodies the validator scenarios plant
 * (minLines: 5, minTokens: 50; matches the audiocontrol pilot).
 *
 * `extra` merges additional jscpd config keys on top of the base shape
 * (e.g. `{ gitignore: true }` for the #354 gitignored-sandbox
 * regression). Keys in `extra` win over the base defaults.
 */
function fixtureJscpdConfig(extra: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify(
    {
      languages: ['typescript'],
      pattern: '**/*.ts',
      ignore: ['**/*.test.ts', '**/dist/**', '**/node_modules/**'],
      minLines: 5,
      minTokens: 50,
      reporters: ['json'],
      output: 'reports/duplication',
      ...extra,
    },
    null,
    2,
  );
}

export interface Fixture {
  readonly dir: string;
  readonly baseline: string;
  writeFile(name: string, body: string): Promise<void>;
  removeFile(name: string): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Create a fresh fixture directory under the OS tmpdir. Each fixture
 * gets a unique random suffix via `mkdtemp` so concurrent vitest
 * workers don't collide.
 *
 * `options.jscpdConfig` merges extra keys into the per-fixture
 * `.jscpd.json` (e.g. `{ gitignore: true }` for the #354
 * gitignored-sandbox regression).
 */
export async function makeFixture(
  label: string,
  options: { readonly jscpdConfig?: Readonly<Record<string, unknown>> } = {},
): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), `dw-clone-${label}-`));
  await writeFile(join(dir, '.jscpd.json'), fixtureJscpdConfig(options.jscpdConfig), 'utf8');
  await mkdir(join(dir, 'reports', 'duplication'), { recursive: true });
  const baseline = join(dir, 'baseline.yaml');
  return {
    dir,
    baseline,
    async writeFile(name: string, body: string): Promise<void> {
      // mkdir the parent so nested fixture paths (e.g. a gitignored
      // `sandbox/clone.ts`) can be planted without a separate step.
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), body, 'utf8');
    },
    async removeFile(name: string): Promise<void> {
      await rm(join(dir, name));
    },
    async cleanup(): Promise<void> {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Build the argv vector for invoking the CLI dispatcher at
 * `cli.ts check-clones ...`. By default the `--quiet` flag is
 * appended (matches the pre-commit hook's invocation shape); pass
 * `{ quiet: false }` to drop it and exercise the non-quiet output.
 *
 * `subcommandOverride` swaps the leading `check-clones` for an
 * arbitrary subcommand name — used by `check-clones.alias.test.ts`
 * to drive the same fixture under the legacy `detect-clones` alias
 * and prove the two names produce identical exit codes + output.
 */
export function detectorArgs(
  fixture: Fixture,
  options: { readonly quiet?: boolean; readonly subcommandOverride?: string } = {},
  extra: readonly string[] = [],
): readonly string[] {
  const subcommand = options.subcommandOverride ?? 'check-clones';
  const args: string[] = [
    subcommand,
    '--root',
    fixture.dir,
    '--baseline',
    fixture.baseline,
  ];
  if (options.quiet !== false) args.push('--quiet');
  for (const a of extra) args.push(a);
  return args;
}

/**
 * Spawn the CLI dispatcher with the fixture as cwd. The dispatcher
 * routes both `check-clones` (canonical) and `detect-clones` (alias)
 * to the checkClones() function inside scope-discovery/clone-detector.ts.
 */
export function runDetector(
  args: readonly string[],
  cwd?: string,
): Promise<ScannerRun> {
  // When no cwd is provided we infer it from the `--root` flag: the
  // detector resolves the report + baseline against process.cwd(), so
  // running the subprocess INSIDE the fixture is what keeps each
  // scenario hermetic.
  const fixtureCwd = cwd ?? extractRoot(args);
  if (fixtureCwd === null) {
    throw new Error(
      'detectorArgs must include --root <path>; received: ' + JSON.stringify(args),
    );
  }
  return runScannerSubprocess(CLI_ENTRY, args, { cwd: fixtureCwd });
}

function extractRoot(args: readonly string[]): string | null {
  const idx = args.indexOf('--root');
  if (idx < 0 || idx + 1 >= args.length) return null;
  const value = args[idx + 1];
  return value ?? null;
}
