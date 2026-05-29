/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/check-deprecations.test.ts
 *
 * Adversarial scenarios for the deprecation scanner (closes #287; the
 * scan-port ships in this commit). Each scenario plants fixture source
 * files on disk, runs the real CLI dispatcher through the plugin's
 * `cli.ts` entry, and asserts the rendered output.
 *
 * Scenarios:
 *
 *   1. empty-tree exits 0 with the "nothing to track" markdown.
 *   2. flag parsing — `--root`, `--module-root`, `--write`, `--artifact`,
 *      `--quiet`, `--json` round-trip via `parseCli`.
 *   3. blocked deprecated file is reported with its importer file:line.
 *   4. safe-to-delete deprecated file (no importers) lists under safe.
 *   5. self-importer doesn't count (a deprecated file's own re-exports).
 *   6. `--write` emits the rendered markdown to the artifact path.
 *   7. `--json` emits the documented JSON shape.
 *   8. `--quiet` suppresses the markdown body; summary line still prints.
 *   9. inline `// DEPRECATED:` marker detected within the first 20 lines.
 *  10. `--help` exits 0 with usage text.
 *  11. unknown flag exits 2 with an actionable stderr.
 *  12. gutted-stub self-check — the probe must REJECT a no-op scanner.
 *
 * The gutted-stub self-check gives the harness teeth: it simulates a
 * scanner that always returns the empty-tree shape at exit 0 (the
 * pre-port shell's behavior) and asserts that the blocked-file probe
 * REJECTS that stub. If the probe accepted, the harness couldn't tell
 * a real scanner from a no-op.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, parseCli } from '../../scope-discovery/check-deprecations.js';
import {
  ARTIFACT_PATH as DEFAULT_ARTIFACT,
} from '../../scope-discovery/deprecation-report.js';
import { runScannerSubprocess, type ScannerRun } from './util/run-scanner.js';
import {
  makeDeprecationsFixture,
  runCheckDeprecations,
  type DeprecationsFixture,
} from './util/check-deprecations-harness.js';
import { isPlainObject } from '../../scope-discovery/util/typeguards.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

describe('check-deprecations — flag parsing', () => {
  it('default options', () => {
    const opts = parseCli([]);
    expect(opts.scanRoot).toBe('.');
    expect(opts.moduleRoot).toBe('src');
    expect(opts.writeArtifact).toBe(false);
    expect(opts.artifactPath).toBe(DEFAULT_ARTIFACT);
    expect(opts.quiet).toBe(false);
    expect(opts.json).toBe(false);
  });

  it('--write toggles writeArtifact', () => {
    expect(parseCli(['--write']).writeArtifact).toBe(true);
  });

  it('--artifact accepts a path', () => {
    expect(parseCli(['--artifact', 'tmp/x.md']).artifactPath).toBe('tmp/x.md');
  });

  it('--root + --module-root accept paths', () => {
    const opts = parseCli(['--root', '/a', '--module-root', 'modules/foo/src']);
    expect(opts.scanRoot).toBe('/a');
    expect(opts.moduleRoot).toBe('modules/foo/src');
  });

  it('--quiet + --json flags', () => {
    expect(parseCli(['--quiet']).quiet).toBe(true);
    expect(parseCli(['--json']).json).toBe(true);
  });

  it('--root requires a path', () => {
    expect(() => parseCli(['--root'])).toThrow(/--root requires a path/);
  });

  it('--module-root requires a path', () => {
    expect(() => parseCli(['--module-root'])).toThrow(/--module-root requires a path/);
  });

  it('--artifact requires a path', () => {
    expect(() => parseCli(['--artifact'])).toThrow(/--artifact requires a path/);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// Programmatic main()
// ---------------------------------------------------------------------------

describe('check-deprecations — programmatic main', () => {
  it('returns 2 on unknown flag', async () => {
    const code = await main(['--bogus']);
    expect(code).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Real scan scenarios
// ---------------------------------------------------------------------------

const DEPRECATED_JSDOC_SOURCE = `/**
 * src/legacy/old-helper.ts
 *
 * @deprecated use src/lib/new-helper.ts instead
 */
export function oldHelper(): number {
  return 1;
}
`;

const DEPRECATED_INLINE_SOURCE = `// DEPRECATED: see src/lib/new-helper.ts
export function inlineLegacy(): number {
  return 2;
}
`;

const IMPORTER_VIA_ALIAS = `import { oldHelper } from '@/legacy/old-helper';
export const value = oldHelper();
`;

const IMPORTER_VIA_RELATIVE = `import { oldHelper } from './old-helper.js';
export const value = oldHelper();
`;

const SELF_IMPORTER_RE_EXPORT = `/**
 * @deprecated use new-helper
 */
export { oldHelper } from './old-helper';
`;

describe('check-deprecations — scan scenarios', () => {
  it('empty tree exits 0 with nothing-to-track markdown', async () => {
    const fixture = await makeDeprecationsFixture('empty');
    try {
      // Only an undeprecated source file
      await fixture.writeSource('src/clean.ts', 'export const x = 1;\n');
      const run = await runCheckDeprecations(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('# Deprecation queue');
      expect(run.stdout).toContain('0 deprecated files; nothing to track');
    } finally {
      await fixture.cleanup();
    }
  });

  it('blocked deprecated file: importer surfaced with file:line', async () => {
    const fixture = await makeDeprecationsFixture('blocked');
    try {
      await fixture.writeSource('src/legacy/old-helper.ts', DEPRECATED_JSDOC_SOURCE);
      await fixture.writeSource('src/consumer.ts', IMPORTER_VIA_ALIAS);
      const run = await runCheckDeprecations(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('src/legacy/old-helper.ts');
      expect(run.stdout).toContain('Blocked');
      expect(run.stdout).toContain('src/consumer.ts:1');
      expect(run.stdout).toContain('1 blocked');
      expect(run.stdout).toContain('0 safe to delete');
    } finally {
      await fixture.cleanup();
    }
  });

  it('safe-to-delete: no importers means the file lands in the safe list', async () => {
    const fixture = await makeDeprecationsFixture('safe');
    try {
      await fixture.writeSource('src/legacy/orphan.ts', DEPRECATED_JSDOC_SOURCE);
      // No importers of orphan.ts anywhere in the tree.
      await fixture.writeSource('src/other.ts', 'export const y = 2;\n');
      const run = await runCheckDeprecations(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('Safe to delete');
      expect(run.stdout).toContain('src/legacy/orphan.ts');
      expect(run.stdout).toContain('1 safe to delete');
      expect(run.stdout).toContain('0 blocked');
    } finally {
      await fixture.cleanup();
    }
  });

  it('self-importer (a deprecated file re-exporting its own symbol) does not count', async () => {
    const fixture = await makeDeprecationsFixture('self');
    try {
      // The "deprecated" file references its own basename in a doc
      // comment / barrel-style re-export. Without the self-skip the
      // scanner would count its own line as an importer.
      await fixture.writeSource(
        'src/legacy/old-helper.ts',
        DEPRECATED_JSDOC_SOURCE + SELF_IMPORTER_RE_EXPORT,
      );
      const run = await runCheckDeprecations(fixture);
      expect(run.code).toBe(0);
      // Should land in safe-to-delete because the only "importer"
      // is the file itself.
      expect(run.stdout).toContain('Safe to delete');
      expect(run.stdout).toContain('1 safe to delete');
      expect(run.stdout).toContain('0 blocked');
    } finally {
      await fixture.cleanup();
    }
  });

  it('relative-path import detected as an importer', async () => {
    const fixture = await makeDeprecationsFixture('relative');
    try {
      await fixture.writeSource('src/legacy/old-helper.ts', DEPRECATED_JSDOC_SOURCE);
      await fixture.writeSource('src/legacy/sibling.ts', IMPORTER_VIA_RELATIVE);
      const run = await runCheckDeprecations(fixture);
      expect(run.code).toBe(0);
      expect(run.stdout).toContain('src/legacy/sibling.ts');
      expect(run.stdout).toContain('1 blocked');
    } finally {
      await fixture.cleanup();
    }
  });

  it('inline `// DEPRECATED:` marker detected within first 20 lines', async () => {
    const fixture = await makeDeprecationsFixture('inline');
    try {
      await fixture.writeSource('src/legacy/inline.ts', DEPRECATED_INLINE_SOURCE);
      const run = await runCheckDeprecations(fixture);
      expect(run.code).toBe(0);
      expect(run.stdout).toContain('src/legacy/inline.ts');
      expect(run.stdout).toContain('// DEPRECATED:');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--quiet suppresses the markdown body; summary line still prints', async () => {
    const fixture = await makeDeprecationsFixture('quiet');
    try {
      await fixture.writeSource('src/legacy/old-helper.ts', DEPRECATED_JSDOC_SOURCE);
      const run = await runCheckDeprecations(fixture, ['--quiet']);
      expect(run.code).toBe(0);
      expect(run.stdout).not.toContain('# Deprecation queue');
      expect(run.stdout).toContain('check-deprecations:');
      expect(run.stdout).toContain('1 deprecated file');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--json emits the documented shape with importers + counts', async () => {
    const fixture = await makeDeprecationsFixture('json');
    try {
      await fixture.writeSource('src/legacy/old-helper.ts', DEPRECATED_JSDOC_SOURCE);
      await fixture.writeSource('src/consumer.ts', IMPORTER_VIA_ALIAS);
      const run = await runCheckDeprecations(fixture, ['--json']);
      expect(run.code).toBe(0);
      const parsed: unknown = JSON.parse(run.stdout);
      expect(isPlainObject(parsed)).toBe(true);
      if (!isPlainObject(parsed)) return;
      expect(parsed['total']).toBe(1);
      expect(parsed['deprecation_count']).toBe(1);
      expect(Array.isArray(parsed['blocked'])).toBe(true);
      const blocked = parsed['blocked'];
      if (!Array.isArray(blocked)) return;
      expect(blocked.length).toBe(1);
      const firstBlocked: unknown = blocked[0];
      expect(isPlainObject(firstBlocked)).toBe(true);
      if (!isPlainObject(firstBlocked)) return;
      expect(firstBlocked['path']).toBe('src/legacy/old-helper.ts');
      expect(firstBlocked['markerKind']).toBe('jsdoc');
      const importers = firstBlocked['importers'];
      expect(Array.isArray(importers)).toBe(true);
      if (!Array.isArray(importers)) return;
      expect(importers.length).toBe(1);
      const firstImporter: unknown = importers[0];
      expect(isPlainObject(firstImporter)).toBe(true);
      if (!isPlainObject(firstImporter)) return;
      expect(firstImporter['path']).toBe('src/consumer.ts');
      expect(typeof firstImporter['line']).toBe('number');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--write emits the markdown artifact to the default path', async () => {
    const fixture = await makeDeprecationsFixture('write');
    try {
      await fixture.writeSource('src/legacy/old-helper.ts', DEPRECATED_JSDOC_SOURCE);
      const run = await runCheckDeprecations(fixture, ['--write']);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      const dest = join(fixture.scanRoot, DEFAULT_ARTIFACT);
      const content = await readFile(dest, 'utf8');
      expect(content).toContain('# Deprecation queue');
      expect(content).toContain('src/legacy/old-helper.ts');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--write + --artifact targets a custom path', async () => {
    const fixture = await makeDeprecationsFixture('write-custom');
    try {
      await fixture.writeSource('src/legacy/old-helper.ts', DEPRECATED_JSDOC_SOURCE);
      const customRel = 'docs/custom-deprecation.md';
      const run = await runCheckDeprecations(fixture, [
        '--write',
        '--artifact',
        customRel,
      ]);
      expect(run.code).toBe(0);
      const content = await readFile(join(fixture.scanRoot, customRel), 'utf8');
      expect(content).toContain('# Deprecation queue');
    } finally {
      await fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

describe('check-deprecations — CLI surface', () => {
  it('--help exits 0 with usage prose', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations', '--help']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('check-deprecations');
    expect(run.stdout).toContain('--write');
    expect(run.stdout).toContain('--module-root');
  });

  it('unknown flag exits 2 with actionable stderr', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations', '--bogus']);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('unknown argument');
  });
});

// ---------------------------------------------------------------------------
// Gutted-stub self-check — the test that gives the harness teeth.
// ---------------------------------------------------------------------------

type RunScannerFn = (fixture: DeprecationsFixture) => Promise<ScannerRun>;

/**
 * Simulate a gutted scanner: regardless of input, returns the pre-port
 * shell's empty-registry shape at exit 0. This is the exact silent-pass
 * failure mode the gutted-stub test must reject.
 */
function stubGuttedScanner(): RunScannerFn {
  return async () => ({
    code: 0,
    stdout:
      'check-deprecations: registry empty; nothing to scan. ' +
      '(deprecation-scan port pending — see ' +
      'https://github.com/audiocontrol-org/deskwork/issues/287)\n',
    stderr: '',
  });
}

/**
 * Single blocked-finding probe — mirrors the in-spec blocked scenario.
 * Returns true iff the probe asserts the real scanner's contract:
 *
 *   - exit 0
 *   - stdout names the deprecated file
 *   - stdout includes "1 blocked" in the summary
 *   - stdout names the importer (`src/consumer.ts`)
 *
 * Returns false iff any assertion failed — which is what we WANT
 * against a gutted stub.
 */
async function probeBlockedFinding(
  label: string,
  scanner: RunScannerFn,
): Promise<boolean> {
  const fixture = await makeDeprecationsFixture(label);
  try {
    await fixture.writeSource('src/legacy/old-helper.ts', DEPRECATED_JSDOC_SOURCE);
    await fixture.writeSource('src/consumer.ts', IMPORTER_VIA_ALIAS);
    const run = await scanner(fixture);
    if (run.code !== 0) return false;
    if (!run.stdout.includes('src/legacy/old-helper.ts')) return false;
    if (!run.stdout.includes('1 blocked')) return false;
    if (!run.stdout.includes('src/consumer.ts')) return false;
    return true;
  } finally {
    await fixture.cleanup();
  }
}

describe('check-deprecations — gutted-stub self-check', () => {
  it('rejects no-op scanner (harness has teeth)', async () => {
    const realAccepted = await probeBlockedFinding('gutted-real', (f) =>
      runCheckDeprecations(f),
    );
    expect(
      realAccepted,
      'blocked-finding probe should accept the real scanner; if false, probe is broken',
    ).toBe(true);

    const stubAccepted = await probeBlockedFinding(
      'gutted-stub',
      stubGuttedScanner(),
    );
    expect(
      stubAccepted,
      'blocked-finding probe accepted a stub that returns the empty-registry shape at exit 0 — harness has no teeth',
    ).toBe(false);
  });
});
