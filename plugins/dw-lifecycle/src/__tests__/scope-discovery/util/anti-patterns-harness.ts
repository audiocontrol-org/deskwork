/**
 * Test-side harness for spawning the plugin CLI dispatcher at
 * `dw-lifecycle check-anti-patterns ...` against a per-test fixture.
 *
 * Mirrors the detector-harness pattern (Phase 1) — each fixture is
 * self-contained under the OS tmpdir; the subprocess runs with the
 * fixture's scan-root as CWD so the scanner's CWD-relative
 * `excludes_paths:` / `canonical_implementation_file:` matching matches
 * the pilot's semantics. The CLI entry path is resolved against this
 * file's absolute location so vitest workers running from any CWD
 * still find the dispatcher.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScannerSubprocess, type ScannerRun } from './run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/util/ -> src/cli.ts is ../../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', '..', 'cli.ts');

export interface AntiPatternsFixture {
  readonly dir: string;
  readonly registryPath: string;
  readonly scanRoot: string;
  writeRegistry(yamlText: string): Promise<void>;
  writeSource(relPath: string, content: string): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Create a fresh fixture directory under the OS tmpdir. Each fixture
 * gets a unique random suffix via `mkdtemp` so concurrent vitest
 * workers don't collide. Layout matches the pilot scenarios:
 *
 *   <fixture>/
 *     registry.yaml      <-- written via writeRegistry()
 *     src/<files>        <-- written via writeSource()
 */
export async function makeAntiPatternsFixture(label: string): Promise<AntiPatternsFixture> {
  const dir = await mkdtemp(join(tmpdir(), `dw-anti-patterns-${label}-`));
  const scanRoot = join(dir, 'src');
  await mkdir(scanRoot, { recursive: true });
  const registryPath = join(dir, 'registry.yaml');
  return {
    dir,
    registryPath,
    scanRoot,
    async writeRegistry(yamlText: string): Promise<void> {
      await writeFile(registryPath, yamlText, 'utf8');
    },
    async writeSource(relPath: string, content: string): Promise<void> {
      const full = join(scanRoot, relPath);
      const lastSlash = full.lastIndexOf('/');
      if (lastSlash > scanRoot.length) {
        await mkdir(full.substring(0, lastSlash), { recursive: true });
      }
      await writeFile(full, content, 'utf8');
    },
    async cleanup(): Promise<void> {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Run the scanner with the fixture's scanRoot as CWD and `--root .`.
 * This is the "literal-paths render fixture-relative" mode used by the
 * pilot's `runFromScanRoot` helper for the excludes_paths /
 * canonical_implementation_file scenarios — both fields match against
 * CWD-relative POSIX paths, so anchoring CWD at the scan root makes the
 * paths render the way the registry fixtures expect.
 *
 * The harness passes `--gate-mode` by default so existing tests
 * asserting exit-1-on-findings continue to hold. Tests exercising the
 * default informational mode pass an `extra` array that includes
 * `--no-gate-mode` (handled in the scanner) or invoke the scanner
 * directly without this harness.
 */
export function runAntiPatternsFromScanRoot(
  fixture: AntiPatternsFixture,
  extra: readonly string[] = [],
): Promise<ScannerRun> {
  const args = [
    'check-anti-patterns',
    '--registry',
    fixture.registryPath,
    '--root',
    '.',
    '--gate-mode',
    ...extra,
  ];
  return runScannerSubprocess(CLI_ENTRY, args, { cwd: fixture.scanRoot });
}

/**
 * Run the scanner with the parent CWD (no override). Use for scenarios
 * that need the scanner to read the registry from an absolute path AND
 * resolve --root to a fully-qualified fixture sub-path (e.g. the
 * "malformed registry" scenarios where the test asserts a parse error
 * without caring how findings render).
 *
 * `--gate-mode` is passed by default — see `runAntiPatternsFromScanRoot`.
 */
export function runAntiPatterns(
  fixture: AntiPatternsFixture,
  extra: readonly string[] = [],
): Promise<ScannerRun> {
  const args = [
    'check-anti-patterns',
    '--registry',
    fixture.registryPath,
    '--root',
    fixture.scanRoot,
    '--gate-mode',
    ...extra,
  ];
  return runScannerSubprocess(CLI_ENTRY, args);
}

/**
 * Run the scanner WITHOUT --gate-mode so the default informational
 * behavior (findings → exit 0 with report on stdout) is exercised.
 * Used by the gate-mode flag rollout tests in
 * `anti-patterns.gate-mode.test.ts` to assert the default vs.
 * --gate-mode behavior delta.
 */
export function runAntiPatternsInformational(
  fixture: AntiPatternsFixture,
  extra: readonly string[] = [],
): Promise<ScannerRun> {
  const args = [
    'check-anti-patterns',
    '--registry',
    fixture.registryPath,
    '--root',
    fixture.scanRoot,
    ...extra,
  ];
  return runScannerSubprocess(CLI_ENTRY, args);
}
