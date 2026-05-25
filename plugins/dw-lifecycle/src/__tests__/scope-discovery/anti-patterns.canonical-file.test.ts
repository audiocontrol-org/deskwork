/**
 * Adversarial scenarios for the anti-patterns scanner's
 * `canonical_implementation_file:` field. Ported from the audiocontrol
 * pilot's `anti-patterns.canonical-file-scenarios.ts` and converted to
 * vitest.
 *
 * The motivating bug: the `excludes_paths:` field assumed the canonical
 * primitive's path was stable. When a primitive was git-renamed across
 * modules, the registry's `excludes_paths:` stayed pinned at the old
 * path and the NEW canonical file (whose body IS the legacy shape, by
 * construction) got flagged as a holdout against its own anti-pattern.
 *
 * The fix:
 *   - `AntiPatternEntry` gains optional `canonicalImplementationFile`
 *     (CWD-relative POSIX string OR null).
 *   - Scanner auto-excludes the canonical file from the entry's shape
 *     match BEFORE applying `excludes_paths:` (both apply when set
 *     together — independent).
 *   - Scanner verifies the file exists at scan START; if missing, fails
 *     LOUD with an actionable error naming the entry id + missing path.
 *   - Parser accepts a non-empty string OR absent field; empty
 *     string / non-string → parse error.
 */

import { describe, it, expect } from 'vitest';
import {
  makeAntiPatternsFixture,
  runAntiPatternsFromScanRoot,
} from './util/anti-patterns-harness.js';

const CANONICAL_FILE_AUTO_EXCLUDE_REGISTRY = `anti_patterns:
  - id: page-title-row-inline
    added_in: c0ffee08
    primitive: PageTitleRow
    from: '@deskwork/editor-core'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    canonical_implementation_file: 'lib/canonical.ts'
    message: |
      Replace inline LEGACY_SHAPE_MARKER with PageTitleRow.
`;

const CANONICAL_FILE_MISSING_REGISTRY = `anti_patterns:
  - id: relocated-primitive-stale-registry
    added_in: c0ffee09
    primitive: RelocatedPrimitive
    from: '@deskwork/editor-core'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    canonical_implementation_file: 'lib/moved-away.ts'
    message: |
      Replace inline LEGACY_SHAPE_MARKER with RelocatedPrimitive.
`;

const CANONICAL_FILE_PLUS_EXCLUDES_REGISTRY = `anti_patterns:
  - id: canonical-plus-excludes
    added_in: c0ffee0a
    primitive: BothExclusionsApply
    from: '@deskwork/editor-core'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    canonical_implementation_file: 'lib/A.ts'
    excludes_paths:
      - 'lib/B.ts'
    message: |
      Replace inline LEGACY_SHAPE_MARKER with BothExclusionsApply.
`;

const CANONICAL_FILE_ABSENT_REGISTRY = `anti_patterns:
  - id: pre-canonical-behavior
    added_in: c0ffee0b
    primitive: PreCanonical
    from: '@deskwork/editor-core'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    excludes_paths:
      - 'lib/canonical.ts'
    message: |
      Replace inline LEGACY_SHAPE_MARKER with PreCanonical.
`;

const CANONICAL_FILE_EMPTY_STRING_REGISTRY = `anti_patterns:
  - id: empty-canonical
    added_in: c0ffee0c
    primitive: BadCanonical
    from: '@deskwork/editor-core'
    shape_regex: 'LEGACY_SHAPE_MARKER'
    canonical_implementation_file: ''
    message: |
      Replace LEGACY_SHAPE_MARKER with BadCanonical.
`;

const LEGACY_SHAPE_SOURCE = 'export const x = "LEGACY_SHAPE_MARKER";\n';

describe('anti-patterns — canonical_implementation_file', () => {
  it('auto-excludes the canonical file (1 finding for holdout only)', async () => {
    const fixture = await makeAntiPatternsFixture('canonical-auto');
    try {
      await fixture.writeRegistry(CANONICAL_FILE_AUTO_EXCLUDE_REGISTRY);
      // Two files BOTH carry the legacy shape. canonical.ts is the
      // primitive's source-of-truth (its body IS the shape, by
      // construction). holdout.ts is a real holdout.
      await fixture.writeSource('lib/canonical.ts', LEGACY_SHAPE_SOURCE);
      await fixture.writeSource('lib/holdout.ts', LEGACY_SHAPE_SOURCE);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).not.toContain('lib/canonical.ts');
      expect(run.stdout).toContain('lib/holdout.ts');
      const findings = (run.stdout.match(/matches anti-pattern/g) ?? []).length;
      expect(findings, `stdout=${run.stdout}`).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it('missing canonical_implementation_file → exit 2; stderr names entry id + missing path', async () => {
    const fixture = await makeAntiPatternsFixture('canonical-missing');
    try {
      await fixture.writeRegistry(CANONICAL_FILE_MISSING_REGISTRY);
      // Plant the holdout but NOT the canonical the registry expects.
      // Mimics the git-rename failure mode: operator moved the primitive
      // to a new location and forgot to update the registry.
      await fixture.writeSource('lib/holdout.ts', LEGACY_SHAPE_SOURCE);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('relocated-primitive-stale-registry');
      expect(run.stderr).toContain('lib/moved-away.ts');
      expect(run.stderr).toContain('does not exist');
      expect(run.stderr).toContain('canonical_implementation_file');
    } finally {
      await fixture.cleanup();
    }
  });

  it('canonical_implementation_file + excludes_paths apply together; both skip their targets; remaining holdout surfaces', async () => {
    const fixture = await makeAntiPatternsFixture('canonical-plus-excludes');
    try {
      await fixture.writeRegistry(CANONICAL_FILE_PLUS_EXCLUDES_REGISTRY);
      await fixture.writeSource('lib/A.ts', LEGACY_SHAPE_SOURCE);
      await fixture.writeSource('lib/B.ts', LEGACY_SHAPE_SOURCE);
      await fixture.writeSource('lib/C.ts', LEGACY_SHAPE_SOURCE);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).not.toContain('lib/A.ts');
      expect(run.stdout).not.toContain('lib/B.ts');
      expect(run.stdout).toContain('lib/C.ts');
      const findings = (run.stdout.match(/matches anti-pattern/g) ?? []).length;
      expect(findings, `stdout=${run.stdout}`).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it('entry without canonical_implementation_file behaves identically to pre-canonical-file (excludes_paths still drives the skip)', async () => {
    const fixture = await makeAntiPatternsFixture('canonical-absent');
    try {
      await fixture.writeRegistry(CANONICAL_FILE_ABSENT_REGISTRY);
      await fixture.writeSource('lib/canonical.ts', LEGACY_SHAPE_SOURCE);
      await fixture.writeSource('lib/holdout.ts', LEGACY_SHAPE_SOURCE);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).not.toContain('lib/canonical.ts');
      expect(run.stdout).toContain('lib/holdout.ts');
    } finally {
      await fixture.cleanup();
    }
  });

  it('empty-string canonical_implementation_file → exit 2 with descriptive parse error', async () => {
    const fixture = await makeAntiPatternsFixture('canonical-empty-string');
    try {
      await fixture.writeRegistry(CANONICAL_FILE_EMPTY_STRING_REGISTRY);
      await fixture.writeSource('lib/canonical.ts', LEGACY_SHAPE_SOURCE);
      const run = await runAntiPatternsFromScanRoot(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('canonical_implementation_file');
    } finally {
      await fixture.cleanup();
    }
  });
});
