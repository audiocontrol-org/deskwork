/**
 * Summary-ordering adversarial scenarios for the adopter-manifests
 * scanner (Phase 2 Family C). Ported from the audiocontrol pilot's
 * `adopter-manifests.summary-ordering-scenarios.ts`
 * (AUDIT-20260524-13) and converted to vitest.
 *
 * Motivation: the pre-AUDIT-13 scanner printed its summary line in
 * the MIDDLE of its output (between the per-manifest counts and the
 * tracked-holdouts detail block). Operators using
 * `make check-adopters | tail -1` to grep a finding count had to
 * scroll past unrelated noise.
 *
 * The fix:
 *   - The summary line is ALWAYS the LAST non-empty line of stdout.
 *   - The summary line ALWAYS matches
 *       /^adopter-manifests: \d+ holdouts? across \d+ manifest/
 *     so `tail -1` consumers can parse the count without special-
 *     casing the zero / tracked-only branches.
 *   - `--quiet` suppresses per-manifest details ONLY when there are
 *     ZERO real holdouts; if any real holdouts exist, the full report
 *     prints so the operator sees what to act on.
 */

import { describe, it, expect } from 'vitest';
import {
  SOURCE_PAYLOADS,
  args,
  cleanup,
  makeFixture,
  runScanner,
  writeRegistry,
  writeSource,
} from './adopter-manifests.fixtures.js';

const MIXED_REAL_AND_TRACKED_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/akai-s3k-editor/src/**/*Editor*.tsx'
    tracked_holdouts:
      - path: modules/akai-s3k-editor/src/DeferredEditorA.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: pending follow-up A.
      - path: modules/akai-s3k-editor/src/DeferredEditorB.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: pending follow-up B.
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer.
`;

const TRACKED_ONLY_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/akai-s3k-editor/src/**/*Editor*.tsx'
    tracked_holdouts:
      - path: modules/akai-s3k-editor/src/DeferredEditor.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: pending follow-up.
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer.
`;

const SIMPLE_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/akai-s3k-editor/src/**/*Editor*.tsx'
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer.
`;

// Regex matching the summary line shape (AUDIT-13 contract).
const SUMMARY_REGEX = /^adopter-manifests: \d+ holdouts? across \d+ manifest/;

/**
 * Return the last non-empty line of `stdout`, or '' if `stdout` is
 * empty / whitespace-only. This is the line `tail -1` would print if
 * stdout ends with a single trailing newline.
 */
function lastNonEmptyLine(stdout: string): string {
  const trimmed = stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout;
  const lines = trimmed.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.length > 0) return line;
  }
  return '';
}

describe('adopter-manifests — summary line ordering (AUDIT-13)', () => {
  it('summary line is the last non-empty stdout line under mixed real+tracked holdouts', async () => {
    const fixture = await makeFixture('summary-last');
    try {
      await writeRegistry(fixture, MIXED_REAL_AND_TRACKED_REGISTRY);
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/RealHoldoutEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditorA.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditorB.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      const last = lastNonEmptyLine(run.stdout);
      expect(last, `last non-empty line; full stdout=${run.stdout}`).toMatch(SUMMARY_REGEX);
      // Sanity: the tracked-holdouts listing must still appear.
      expect(run.stdout).toContain('DeferredEditorA.tsx');
    } finally {
      await cleanup(fixture);
    }
  });

  it('--quiet prints summary only (no per-manifest details) when zero real holdouts', async () => {
    const fixture = await makeFixture('quiet-no-real');
    try {
      await writeRegistry(fixture, TRACKED_ONLY_REGISTRY);
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture, ['--quiet']));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      const last = lastNonEmptyLine(run.stdout);
      expect(last, `quiet-mode last line; stdout=${run.stdout}`).toMatch(SUMMARY_REGEX);
      // Quiet mode in the no-real-holdouts case MUST NOT print the
      // per-manifest detail block.
      const detailSignatures = [
        'expected adopters:',
        'actual adopters:',
        'tracked holdouts (gate-passing',
        'manifest=slide-drawer-promotion',
      ];
      for (const sig of detailSignatures) {
        expect(run.stdout, `--quiet should suppress '${sig}'; got: ${run.stdout}`).not.toContain(
          sig,
        );
      }
      // Summary tail must surface the tracked-holdout count.
      expect(run.stdout).toContain('tracked holdout');
    } finally {
      await cleanup(fixture);
    }
  });

  it('--quiet overridden by real holdouts: full report prints; summary remains last line', async () => {
    const fixture = await makeFixture('quiet-with-real');
    try {
      await writeRegistry(fixture, MIXED_REAL_AND_TRACKED_REGISTRY);
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/RealHoldoutEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditorA.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/DeferredEditorB.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture, ['--quiet']));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      // `--quiet` is overridden when real holdouts exist.
      const requiredDetails = [
        'manifest=slide-drawer-promotion',
        'expected adopters:',
        'actual adopters:',
        'RealHoldoutEditor.tsx',
      ];
      for (const sig of requiredDetails) {
        expect(run.stdout, `--quiet should still print '${sig}'; stdout=${run.stdout}`).toContain(
          sig,
        );
      }
      const last = lastNonEmptyLine(run.stdout);
      expect(last, `summary remains last; stdout=${run.stdout}`).toMatch(SUMMARY_REGEX);
    } finally {
      await cleanup(fixture);
    }
  });

  it('default mode emits exactly one summary line, at the end of stdout', async () => {
    const fixture = await makeFixture('default-summary');
    try {
      await writeRegistry(fixture, SIMPLE_REGISTRY);
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/PatchEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      const last = lastNonEmptyLine(run.stdout);
      expect(last, `default-mode last line; stdout=${run.stdout}`).toMatch(SUMMARY_REGEX);
      // Exactly one summary line.
      const matches = run.stdout.split('\n').filter((l) => SUMMARY_REGEX.test(l));
      expect(
        matches.length,
        `expected exactly one summary line; got ${matches.length}: ${JSON.stringify(matches)}`,
      ).toBe(1);
    } finally {
      await cleanup(fixture);
    }
  });
});
