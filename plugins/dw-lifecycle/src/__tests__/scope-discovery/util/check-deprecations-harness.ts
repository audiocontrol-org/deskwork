/**
 * Test-side harness for spawning `dw-lifecycle check-deprecations`
 * against a per-test fixture. Mirrors `anti-patterns-harness.ts`'s
 * shape: each fixture is self-contained under the OS tmpdir; the
 * subprocess runs with the fixture root as CWD so the scanner's
 * CWD-relative artifact rendering + `--root .` matches the pilot's
 * semantics.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScannerSubprocess, type ScannerRun } from './run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/util/ -> src/cli.ts is ../../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', '..', 'cli.ts');

export interface DeprecationsFixture {
  readonly dir: string;
  readonly scanRoot: string;
  writeSource(relPath: string, content: string): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Create a fresh fixture directory under the OS tmpdir. Each fixture
 * gets a unique random suffix via `mkdtemp` so concurrent vitest
 * workers don't collide. The scan root is the fixture directory
 * itself; source files land under `src/` so the scanner's default
 * `--module-root src` resolves the `@/` alias correctly.
 */
export async function makeDeprecationsFixture(
  label: string,
): Promise<DeprecationsFixture> {
  const dir = await mkdtemp(join(tmpdir(), `dw-check-deprecations-${label}-`));
  const scanRoot = dir;
  await mkdir(join(scanRoot, 'src'), { recursive: true });
  return {
    dir,
    scanRoot,
    async writeSource(relPath: string, content: string): Promise<void> {
      const full = join(scanRoot, relPath);
      const last = full.lastIndexOf('/');
      if (last > scanRoot.length) {
        await mkdir(full.substring(0, last), { recursive: true });
      }
      await writeFile(full, content, 'utf8');
    },
    async cleanup(): Promise<void> {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Run the scanner with the fixture's scan-root as CWD and `--root .`.
 * Default behavior is informational (exit 0 regardless of findings); the
 * exit code is 2 only on infra / arg errors.
 */
export function runCheckDeprecations(
  fixture: DeprecationsFixture,
  extra: readonly string[] = [],
): Promise<ScannerRun> {
  const args = ['check-deprecations', '--root', '.', ...extra];
  return runScannerSubprocess(CLI_ENTRY, args, { cwd: fixture.scanRoot });
}
