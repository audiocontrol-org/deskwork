/**
 * AUDIT-20260530-04 — regression test asserting that
 * `dist/pipelines/<id>.json` for every PRESET_ID ships in the
 * @deskwork/core published tarball.
 *
 * Background: the build / prepack scripts copy `src/pipelines/*.json`
 * into `dist/pipelines/`, but `package.json`'s `files` whitelist
 * determines what `npm pack` actually ships. If the whitelist were
 * trimmed (or replaced with a more specific subpath enumeration), the
 * preset JSONs would be absent from the published artifact and every
 * `loadPipelineTemplate` call in the marketplace-installed package
 * would throw "file not found" — the same shape as v0.11.0's missing-
 * zod tarball.
 *
 * The test runs `npm pack --dry-run --json` in the @deskwork/core
 * workspace and asserts each PRESET_ID's preset JSON appears in the
 * tarball file list. Local-only — it does not actually publish.
 *
 * The test is slow-ish (~3–5s) because npm pack runs `prepack`, which
 * runs the full TypeScript build. That cost is acceptable because the
 * test catches a class of packaging defects (file-whitelist drift,
 * cp-step removal, build-script regression) that no other test in the
 * suite catches.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESET_IDS } from '../../src/pipelines/loader.ts';

interface PackEntry {
  readonly path: string;
  readonly size: number;
}

interface PackOutput {
  readonly files: readonly PackEntry[];
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
// vitest test file lives at packages/core/test/packaging/<file> — the
// package root is two directories up.
const PACKAGE_ROOT = resolve(TEST_DIR, '..', '..');

function runNpmPackDryRun(): readonly PackEntry[] {
  // --json emits a single-element array describing the tarball.
  const stdout = execSync('npm pack --dry-run --json', {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    // Inherit stderr so prepack output (which goes to stderr) doesn't
    // contaminate the JSON parse.
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `npm pack --dry-run --json returned unexpected shape: ${stdout.slice(0, 200)}`,
    );
  }
  const first: unknown = parsed[0];
  if (
    typeof first !== 'object'
    || first === null
    || !('files' in first)
    || !Array.isArray((first as { files: unknown }).files)
  ) {
    throw new Error(
      `npm pack --dry-run --json first element missing files[] array: ${JSON.stringify(first).slice(0, 200)}`,
    );
  }
  const filesRaw: readonly unknown[] = (first as { files: readonly unknown[] }).files;
  return filesRaw.map((entry, idx) => {
    if (
      typeof entry !== 'object'
      || entry === null
      || typeof (entry as { path?: unknown }).path !== 'string'
      || typeof (entry as { size?: unknown }).size !== 'number'
    ) {
      throw new Error(
        `npm pack --dry-run --json files[${idx}] missing path/size: ${JSON.stringify(entry).slice(0, 200)}`,
      );
    }
    return {
      path: (entry as { path: string }).path,
      size: (entry as { size: number }).size,
    };
  });
}

describe('AUDIT-20260530-04 — @deskwork/core tarball includes preset JSONs', () => {
  // The test calls npm pack, which runs prepack (which runs tsc). It
  // can take a few seconds on a cold cache. Lift the per-test timeout
  // so a slow CI machine doesn't false-positive.
  it('ships dist/pipelines/<id>.json for every PRESET_ID', () => {
    const files = runNpmPackDryRun();
    const paths = files.map((f) => f.path);
    for (const id of PRESET_IDS) {
      const expected = `dist/pipelines/${id}.json`;
      expect(
        paths,
        `expected ${expected} to appear in npm pack --dry-run file list; got ${paths.length} files`,
      ).toContain(expected);
    }
  }, 60_000);

  it('every shipped preset JSON has a non-zero byte size in the tarball', () => {
    const files = runNpmPackDryRun();
    const entriesById = new Map<string, PackEntry>(
      files.map((f) => [f.path, f]),
    );
    for (const id of PRESET_IDS) {
      const entry = entriesById.get(`dist/pipelines/${id}.json`);
      expect(entry, `preset ${id} missing from tarball`).toBeDefined();
      if (entry) {
        // The preset JSONs are all > 200 bytes (the $rationale alone
        // is hundreds of chars); a zero-byte entry would mean the cp
        // step copied an empty file.
        expect(entry.size).toBeGreaterThan(50);
      }
    }
  }, 60_000);
});
