/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/adopter-manifests.fixtures.ts
 *
 * Shared fixture builders + subprocess runner for the T6.2 / Phase 2
 * Task 3 adopter-manifests adversarial validator (ported from the
 * audiocontrol pilot's `adopter-manifests.fixtures.ts`).
 *
 * Each scenario gets:
 *   - `makeFixture(slug)` — per-scenario temp dir under the OS tmpdir
 *     with a `src/` scanRoot already created.
 *   - `writeRegistry` / `writeSource` — plant the registry YAML and
 *     fixture source files.
 *   - `cleanup` — remove the temp dir in a `finally`.
 *   - `runScanner` — subprocess invocation. The default routes through
 *     the plugin CLI dispatcher at `cli.ts check-adopters ...` so the
 *     test runs the same path adopters trigger via the
 *     `dw-lifecycle check-adopters` subcommand. The gutted-stub
 *     scenarios override the entry to a stub file that always exits 0
 *     (no `check-adopters` argv prefix is injected for overrides).
 *   - `args` — builds the registry/root flag pair (and `--quiet`-style
 *     extras) the scanner expects.
 *
 * The harness mirrors `util/anti-patterns-harness.ts` from Phase 2
 * Task 1: per-fixture temp dir, absolute CLI-entry resolution from
 * `import.meta.url` so vitest workers running from any CWD still find
 * the dispatcher.
 *
 * Synthetic fixture paths (`modules/roland-sxx0-editor/...`,
 * `@/components/SlideDrawer`) are intentional test data anchored in
 * temp dirs — they exercise the scanner's matching logic, not literal
 * deskwork-flavored paths. Do NOT rewrite.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runScannerSubprocess, type ScannerRun } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/ -> src/cli.ts is ../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

export type { ScannerRun };

export interface ScenarioResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export function pass(name: string, detail: string): ScenarioResult {
  return { name, passed: true, detail };
}

export function fail(name: string, detail: string): ScenarioResult {
  return { name, passed: false, detail };
}

export interface Fixture {
  readonly registryPath: string;
  readonly scanRoot: string;
  readonly dir: string;
}

export async function makeFixture(slug: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `dw-adopter-manifests-${slug}-`));
  const scanRoot = join(root, 'src');
  await mkdir(scanRoot, { recursive: true });
  return { registryPath: join(root, 'registry.yaml'), scanRoot, dir: root };
}

export async function writeRegistry(fixture: Fixture, yamlText: string): Promise<void> {
  await writeFile(fixture.registryPath, yamlText, 'utf8');
}

export async function writeSource(
  fixture: Fixture,
  relPath: string,
  content: string,
): Promise<void> {
  const full = join(fixture.scanRoot, relPath);
  const lastSlash = full.lastIndexOf('/');
  if (lastSlash > fixture.scanRoot.length) {
    await mkdir(full.substring(0, lastSlash), { recursive: true });
  }
  await writeFile(full, content, 'utf8');
}

export async function cleanup(fixture: Fixture): Promise<void> {
  await rm(fixture.dir, { recursive: true, force: true });
}

/**
 * Build the `--registry/--root` (+ optional extras) flag list the real
 * check-adopters scanner expects. The returned array is the SCANNER's
 * argv only — `runScanner` adds the `check-adopters` subcommand prefix
 * when dispatching through the plugin CLI.
 *
 * `--gate-mode` is included by default so existing tests asserting
 * exit-1-on-holdouts continue to hold after the Phase 6 informational-
 * default flip. Tests exercising the default informational behavior
 * use `argsInformational` instead.
 */
export function args(fixture: Fixture, extra: readonly string[] = []): string[] {
  return [
    '--registry',
    fixture.registryPath,
    '--root',
    fixture.scanRoot,
    '--gate-mode',
    ...extra,
  ];
}

/**
 * `args(fixture, extra)` WITHOUT `--gate-mode` so the default
 * informational behavior (findings → exit 0 with report on stdout) is
 * exercised. Used by `adopter-manifests.gate-mode.test.ts` to assert
 * the flag toggle's effect on the exit code.
 */
export function argsInformational(
  fixture: Fixture,
  extra: readonly string[] = [],
): string[] {
  return ['--registry', fixture.registryPath, '--root', fixture.scanRoot, ...extra];
}

/**
 * Spawn the scanner with the given argv. The default `entry` is the
 * plugin CLI dispatcher (`cli.ts`); the harness prepends the
 * `check-adopters` subcommand so the resulting child process is
 * equivalent to `tsx cli.ts check-adopters <argv>` — the same path
 * adopters use via `dw-lifecycle check-adopters`.
 *
 * Pass a different `entry` (typically a gutted-stub file) to bypass
 * the dispatcher; in override mode no subcommand prefix is injected —
 * the stub receives `argv` verbatim and is responsible for choosing
 * its own exit code.
 */
export function runScanner(
  argv: readonly string[],
  entry?: string,
): Promise<ScannerRun> {
  if (entry === undefined) {
    return runScannerSubprocess(CLI_ENTRY, ['check-adopters', ...argv]);
  }
  return runScannerSubprocess(entry, argv);
}

/** Common source payloads reused across multiple scenario modules. */
export const SOURCE_PAYLOADS = {
  IMPORTING:
    "import { SlideDrawer } from '@/components/SlideDrawer';\n" +
    'export function PatchEditor() { return <SlideDrawer />; }\n',
  HOLDOUT:
    "import { useState } from 'react';\n" +
    'export function PatchEditor() {\n' +
    '  const [open, setOpen] = useState(false);\n' +
    '  return open ? <div className="inline-drawer" /> : null;\n' +
    '}\n',
} as const;
