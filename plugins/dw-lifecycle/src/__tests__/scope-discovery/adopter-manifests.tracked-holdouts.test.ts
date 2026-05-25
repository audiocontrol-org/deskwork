/**
 * Tracked-holdouts adversarial scenarios for the adopter-manifests
 * scanner (Phase 2 Family C). Ported from the audiocontrol pilot's
 * `adopter-manifests.tracked-holdouts-scenarios.ts` (AUDIT-20260522-06)
 * and converted to vitest.
 *
 * Motivation: the pre-AUDIT-06 schema collapsed two semantically
 * distinct cases — permanent opt-outs and deferred-but-known holdouts —
 * into a single `exceptions:` field. The only way to keep the gate
 * green when a known migration was pending was to list the file as a
 * permanent exception, which hid the work-to-do count.
 *
 * The fix:
 *   - `tracked_holdouts:` field (path + issue URL + reason) parallel to
 *     `exceptions:`.
 *   - Scanner partitions expected files into three buckets:
 *     exceptions, tracked-holdouts, regular candidates.
 *   - Gate exits 0 when only tracked-holdouts remain; report emits
 *     them in a dedicated section.
 *   - Parse-time validation: non-empty issue (URL or `#`-ref), path
 *     matches at least one glob, path cannot appear in BOTH
 *     `exceptions` AND `tracked_holdouts`.
 *
 * Subprocess invocation goes through the plugin CLI dispatcher
 * (`cli.ts check-adopters ...`).
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

const TRACKED_HOLDOUT_MIXED_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    tracked_holdouts:
      - path: modules/roland-sxx0-editor/src/DeferredEditor.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: |
          pending ROLAND-BUGFIX-V3-IMPORT — v3 SlideDrawer migration deferred.
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer.
`;

const TRACKED_HOLDOUT_ONLY_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/akai-s3k-editor/src/**/*Dialog*.tsx'
    tracked_holdouts:
      - path: modules/akai-s3k-editor/src/LibraryDialogA.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/451'
        reason: pending follow-up A.
      - path: modules/akai-s3k-editor/src/LibraryDialogB.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/451'
        reason: pending follow-up B.
    message: |
      Migrate library dialogs to @/components/SlideDrawer chrome.
`;

const TRACKED_HOLDOUT_MISSING_ISSUE_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    tracked_holdouts:
      - path: modules/roland-sxx0-editor/src/DeferredEditor.tsx
        reason: |
          oops, no issue field at all.
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`;

const TRACKED_HOLDOUT_OUT_OF_GLOB_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    tracked_holdouts:
      - path: somewhere/else/Unrelated.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: |
          path is outside any glob; entry is inert.
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`;

const TRACKED_HOLDOUT_DUAL_DISPOSITION_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    exceptions:
      - path: modules/roland-sxx0-editor/src/ConflictedEditor.tsx
        reason: |
          listed as permanent opt-out here, but also tracked-holdout below.
    tracked_holdouts:
      - path: modules/roland-sxx0-editor/src/ConflictedEditor.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: |
          listed as tracked-holdout AND as exception — contradiction.
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`;

describe('adopter-manifests — tracked holdouts (AUDIT-06)', () => {
  it('tracked-holdout file routed to gate-passing section; real holdout still surfaces', async () => {
    const fixture = await makeFixture('tracked-mixed');
    try {
      await writeRegistry(fixture, TRACKED_HOLDOUT_MIXED_REGISTRY);
      // Deferred file: in tracked_holdouts; must NOT surface as a finding.
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/DeferredEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      // Real holdout: not deferred; must surface as a finding → exit 1.
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/RealHoldoutEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      // RealHoldoutEditor.tsx MUST appear as a holdout finding.
      expect(run.stdout).toContain('RealHoldoutEditor.tsx');
      // DeferredEditor.tsx MUST NOT appear in the holdouts list (where each
      // line ends with "no import matches ..."). It MUST appear under the
      // tracked-holdouts section instead.
      const holdoutFindingLine =
        'DeferredEditor.tsx — no import matches @/components/SlideDrawer';
      expect(run.stdout, `unexpected finding line: ${run.stdout}`).not.toContain(
        holdoutFindingLine,
      );
      expect(run.stdout).toContain('tracked holdouts (gate-passing, pending follow-up)');
      expect(run.stdout).toContain('DeferredEditor.tsx');
      expect(run.stdout).toContain('issues/450');
    } finally {
      await cleanup(fixture);
    }
  });

  it('tracked-holdouts only → gate passes (exit 0); files surfaced in dedicated section', async () => {
    const fixture = await makeFixture('tracked-only');
    try {
      await writeRegistry(fixture, TRACKED_HOLDOUT_ONLY_REGISTRY);
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/LibraryDialogA.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/LibraryDialogB.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      expect(run.stdout).toContain('LibraryDialogA.tsx');
      expect(run.stdout).toContain('LibraryDialogB.tsx');
      expect(run.stdout).toContain('2 tracked holdout(s) reported separately');
    } finally {
      await cleanup(fixture);
    }
  });

  it('tracked_holdouts entry without issue → exit 2 + descriptive error', async () => {
    const fixture = await makeFixture('tracked-missing-issue');
    try {
      await writeRegistry(fixture, TRACKED_HOLDOUT_MISSING_ISSUE_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/DeferredEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('issue');
    } finally {
      await cleanup(fixture);
    }
  });

  it('tracked_holdouts path outside any glob → exit 2 + descriptive error', async () => {
    const fixture = await makeFixture('tracked-oog');
    try {
      await writeRegistry(fixture, TRACKED_HOLDOUT_OUT_OF_GLOB_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/AnyEditor.tsx',
        SOURCE_PAYLOADS.IMPORTING,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('somewhere/else/Unrelated.tsx');
    } finally {
      await cleanup(fixture);
    }
  });

  it('path in BOTH exceptions and tracked_holdouts → exit 2 + descriptive error', async () => {
    const fixture = await makeFixture('tracked-conflict');
    try {
      await writeRegistry(fixture, TRACKED_HOLDOUT_DUAL_DISPOSITION_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/ConflictedEditor.tsx',
        SOURCE_PAYLOADS.HOLDOUT,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('ConflictedEditor.tsx');
      expect(run.stderr).toContain('mutually exclusive');
    } finally {
      await cleanup(fixture);
    }
  });
});
