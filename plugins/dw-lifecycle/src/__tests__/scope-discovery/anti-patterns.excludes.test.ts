/**
 * Adversarial scenarios for the anti-patterns scanner's
 * `excludes_paths:` field. Ported from the audiocontrol pilot's
 * `anti-patterns.excludes-scenarios.ts` and converted to vitest.
 *
 * The motivating bug: the original anti-pattern registry had no
 * path-exclude mechanism, so any entry whose canonical primitive's own
 * file BODY matched the legacy shape would flag the canonical file as
 * a holdout against its own anti-pattern (the gate could not be
 * satisfied).
 *
 * The fix:
 *   - `AntiPatternEntry` gains optional `excludesPaths: ExcludePath[]`
 *     (compiled glob regexes).
 *   - Scanner filters each candidate file against every entry's
 *     exclude list BEFORE running the shape patterns.
 *   - Empty array OR missing field preserves existing behavior.
 *   - Match against CWD-relative POSIX path (matches how findings
 *     render in the report, so an operator can copy a flagged path
 *     into `excludes_paths:` as-is).
 *
 * Subprocess invocation goes through the plugin CLI dispatcher
 * (`cli.ts check-anti-patterns ...`) — same path adopters trigger via
 * the `dw-lifecycle check-anti-patterns` subcommand.
 */

import { describe, it, expect } from 'vitest';
import {
  makeAntiPatternsFixture,
  runAntiPatterns,
  runAntiPatternsFromScanRoot,
  type AntiPatternsFixture,
} from './util/anti-patterns-harness.js';

const EXCLUDES_LITERAL_REGISTRY = `anti_patterns:
  - id: canonical-shape-with-literal-exclude
    added_in: c0ffee01
    primitive: useCanonical
    from: '@/hooks/useCanonical'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    excludes_paths:
      - 'lib/canonical.ts'
    message: |
      Replace LEGACY_SHAPE_MARKER body with useCanonical.
`;

const EXCLUDES_LITERAL_NO_EXCLUDE_REGISTRY = `anti_patterns:
  - id: canonical-shape-without-exclude
    added_in: c0ffee02
    primitive: useCanonical
    from: '@/hooks/useCanonical'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    message: |
      Replace LEGACY_SHAPE_MARKER body with useCanonical.
`;

const EXCLUDES_GLOB_REGISTRY = `anti_patterns:
  - id: canonical-shape-with-glob-exclude
    added_in: c0ffee03
    primitive: useCanonical
    from: '@/hooks/useCanonical'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    excludes_paths:
      - 'canonical/**/*.ts'
    message: |
      Replace LEGACY_SHAPE_MARKER body with useCanonical.
`;

const EXCLUDES_EMPTY_REGISTRY = `anti_patterns:
  - id: canonical-shape-with-empty-exclude
    added_in: c0ffee04
    primitive: useCanonical
    from: '@/hooks/useCanonical'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    excludes_paths: []
    message: |
      Replace LEGACY_SHAPE_MARKER body with useCanonical.
`;

const EXCLUDES_MALFORMED_REGISTRY = `anti_patterns:
  - id: canonical-shape-malformed-exclude
    added_in: c0ffee05
    primitive: useCanonical
    from: '@/hooks/useCanonical'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    excludes_paths:
      - 123
    message: |
      Replace LEGACY_SHAPE_MARKER body with useCanonical.
`;

const EXCLUDES_NO_MATCH_REGISTRY = `anti_patterns:
  - id: canonical-shape-exclude-no-match
    added_in: c0ffee06
    primitive: useCanonical
    from: '@/hooks/useCanonical'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    excludes_paths:
      - 'nonexistent/path/**/*.ts'
    message: |
      Replace LEGACY_SHAPE_MARKER body with useCanonical.
`;

const LEGACY_SHAPE_SOURCE = 'export const x = "LEGACY_SHAPE_MARKER";\n';

async function plantTwoLegacyFiles(fixture: AntiPatternsFixture): Promise<void> {
  await fixture.writeSource('lib/canonical.ts', LEGACY_SHAPE_SOURCE);
  await fixture.writeSource('lib/holdout.ts', LEGACY_SHAPE_SOURCE);
}

describe('anti-patterns — excludes_paths', () => {
  it('literal excludes_paths skips the canonical file; control without exclude flags both', async () => {
    const fixture = await makeAntiPatternsFixture('excludes-literal');
    try {
      await fixture.writeRegistry(EXCLUDES_LITERAL_REGISTRY);
      await plantTwoLegacyFiles(fixture);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `expected exit 1; stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).not.toContain('lib/canonical.ts');
      expect(run.stdout).toContain('lib/holdout.ts');

      // Sanity-control: same fixture, no excludes_paths → both files flagged.
      const controlFixture = await makeAntiPatternsFixture('excludes-literal-control');
      try {
        await controlFixture.writeRegistry(EXCLUDES_LITERAL_NO_EXCLUDE_REGISTRY);
        await plantTwoLegacyFiles(controlFixture);
        const control = await runAntiPatternsFromScanRoot(controlFixture);
        expect(control.code).toBe(1);
        const findings = (control.stdout.match(/matches anti-pattern/g) ?? []).length;
        expect(findings, `control stdout=${control.stdout}`).toBe(2);
      } finally {
        await controlFixture.cleanup();
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it('glob excludes_paths skips a matching tree; non-matching files still surface', async () => {
    const fixture = await makeAntiPatternsFixture('excludes-glob');
    try {
      await fixture.writeRegistry(EXCLUDES_GLOB_REGISTRY);
      await fixture.writeSource('canonical/a.ts', LEGACY_SHAPE_SOURCE);
      await fixture.writeSource('canonical/sub/b.ts', LEGACY_SHAPE_SOURCE);
      await fixture.writeSource('holdouts/c.ts', LEGACY_SHAPE_SOURCE);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).not.toContain('canonical/a.ts');
      expect(run.stdout).not.toContain('canonical/sub/b.ts');
      expect(run.stdout).toContain('holdouts/c.ts');
    } finally {
      await fixture.cleanup();
    }
  });

  it('empty excludes_paths array behaves identically to a missing field', async () => {
    const fixture = await makeAntiPatternsFixture('excludes-empty');
    try {
      await fixture.writeRegistry(EXCLUDES_EMPTY_REGISTRY);
      await plantTwoLegacyFiles(fixture);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code).toBe(1);
      const findings = (run.stdout.match(/matches anti-pattern/g) ?? []).length;
      expect(findings, `stdout=${run.stdout}`).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('non-string excludes_paths element → exit 2 with descriptive parse error', async () => {
    const fixture = await makeAntiPatternsFixture('excludes-malformed');
    try {
      await fixture.writeRegistry(EXCLUDES_MALFORMED_REGISTRY);
      await fixture.writeSource('a.ts', LEGACY_SHAPE_SOURCE);
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('excludes_paths');
    } finally {
      await fixture.cleanup();
    }
  });

  it('excludes_paths glob matching nothing is not an error; both files surface', async () => {
    const fixture = await makeAntiPatternsFixture('excludes-no-match');
    try {
      await fixture.writeRegistry(EXCLUDES_NO_MATCH_REGISTRY);
      await plantTwoLegacyFiles(fixture);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      const findings = (run.stdout.match(/matches anti-pattern/g) ?? []).length;
      expect(findings).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });
});
