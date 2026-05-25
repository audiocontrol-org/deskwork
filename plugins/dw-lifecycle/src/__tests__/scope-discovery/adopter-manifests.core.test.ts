/**
 * Core adversarial scenarios for the adopter-manifests scanner (Phase 2
 * Family C). Ported from the audiocontrol pilot's
 * `adopter-manifests.scenarios.ts` and converted to vitest.
 *
 * Pilot scenarios covered (in order):
 *   1. empty-registry-exit-zero
 *   2. no-holdouts-exits-zero
 *   3. holdout-detected-exits-one
 *   4. exception-honored
 *   5. exception-path-not-in-glob-exits-two
 *   6. malformed-registry-exits-two
 *   7. multi-glob-entry
 *   8. multi-glob-with-exception
 *
 * The pilot's "gutted-stub self-check" scenario lives in the cross-
 * cutting validator coordinator (`adopter-manifests.validate.test.ts`)
 * so the adversarial teeth are documented as the suite-wide guard, not
 * a single scenario file's concern.
 *
 * Subprocess invocation goes through the plugin CLI dispatcher
 * (`cli.ts check-adopters ...`) — same path adopters trigger via
 * `dw-lifecycle check-adopters`.
 *
 * The fixture path strings (`modules/roland-sxx0-editor/...`,
 * `@/components/SlideDrawer`, etc.) are synthetic test data in temp
 * dirs — they exercise the scanner's glob + import-regex matching
 * logic, not literal deskwork paths. Do NOT rewrite (per Phase 2
 * port-map pre-made decision #5).
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

const EMPTY_REGISTRY_YAML = `adopter_manifests: []\n`;

const SLIDE_DRAWER_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/{roland-sxx0,akai-s3k}-editor/src/**/*Editor*.tsx'
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer;
      the canonical primitive owns the open/close/backdrop/scroll-lock
      contract.
`;

const MULTI_GLOB_REGISTRY = `adopter_manifests:
  - id: shared-list-bank
    introduced_in: cafef00d
    from: '@/components/ListBank'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Page.tsx'
      - 'modules/akai-s3k-editor/src/**/*Page.tsx'
    message: |
      Use the shared @/components/ListBank widget across editor pages
      so virtualization + accent state stay consistent.
`;

const WITH_EXCEPTION_REGISTRY = `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    exceptions:
      - path: modules/roland-sxx0-editor/src/SpecialEditor.tsx
        reason: |
          Needs frame-rate scroll-lock that SlideDrawer does not expose;
          tracked separately in docs/scope-discovery/.
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer.
`;

const BAD_EXCEPTION_REGISTRY = `adopter_manifests:
  - id: bad-exception
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    exceptions:
      - path: somewhere/else/Unrelated.tsx
        reason: |
          path does not match any glob; exception would be inert.
    message: |
      Replace the per-editor inline drawer with @/components/SlideDrawer.
`;

// Missing `expected_adopters_glob`. All other required fields are
// present so the parser fails specifically on the glob field.
const MALFORMED_REGISTRY = `adopter_manifests:
  - id: missing-required-fields
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    message: |
      missing 'expected_adopters_glob' on purpose.
`;

const MULTI_GLOB_WITH_EXCEPTION_REGISTRY = `adopter_manifests:
  - id: shared-list-bank
    introduced_in: cafef00d
    from: '@/components/ListBank'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Page.tsx'
      - 'modules/akai-s3k-editor/src/**/*Page.tsx'
    exceptions:
      - path: modules/roland-sxx0-editor/src/SpecialPage.tsx
        reason: needs custom bank layout.
    message: |
      Use @/components/ListBank for consistent virtualization.
`;

const IMPORTING_SOURCE = SOURCE_PAYLOADS.IMPORTING;
const HOLDOUT_SOURCE = SOURCE_PAYLOADS.HOLDOUT;

const LIST_BANK_IMPORT_SOURCE =
  "import { ListBank } from '@/components/ListBank';\nexport const x = ListBank;\n";

describe('adopter-manifests — core scenarios', () => {
  it('empty registry exits 0 even with non-adopting source files present', async () => {
    const fixture = await makeFixture('empty');
    try {
      await writeRegistry(fixture, EMPTY_REGISTRY_YAML);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        HOLDOUT_SOURCE,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
    } finally {
      await cleanup(fixture);
    }
  });

  it('every glob-matched file imports canonical path → exit 0', async () => {
    const fixture = await makeFixture('clean');
    try {
      await writeRegistry(fixture, SLIDE_DRAWER_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        IMPORTING_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/ProgramEditor.tsx',
        IMPORTING_SOURCE,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(0);
      expect(run.stdout).toContain('0 holdouts');
    } finally {
      await cleanup(fixture);
    }
  });

  it('holdout reported with file + manifest id + canonical from + message', async () => {
    const fixture = await makeFixture('holdout');
    try {
      await writeRegistry(fixture, SLIDE_DRAWER_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        HOLDOUT_SOURCE,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('PatchEditor.tsx');
      expect(run.stdout).toContain('@/components/SlideDrawer');
      expect(run.stdout).toContain('slide-drawer-promotion');
    } finally {
      await cleanup(fixture);
    }
  });

  it('exception path excluded; non-exempted non-importer still flagged; adopter not flagged', async () => {
    const fixture = await makeFixture('exception');
    try {
      await writeRegistry(fixture, WITH_EXCEPTION_REGISTRY);
      // SpecialEditor.tsx is exempted (no import) → must NOT be a holdout.
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/SpecialEditor.tsx',
        HOLDOUT_SOURCE,
      );
      // RegularEditor.tsx is NOT exempted and doesn't import → MUST be a holdout.
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/RegularEditor.tsx',
        HOLDOUT_SOURCE,
      );
      // CleanEditor.tsx imports the canonical path → must be an adopter.
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/CleanEditor.tsx',
        IMPORTING_SOURCE,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).not.toContain('SpecialEditor.tsx');
      expect(run.stdout).toContain('RegularEditor.tsx');
      expect(run.stdout).not.toContain('CleanEditor.tsx');
    } finally {
      await cleanup(fixture);
    }
  });

  it('exception path outside any glob → exit 2 with descriptive error', async () => {
    const fixture = await makeFixture('badexcept');
    try {
      await writeRegistry(fixture, BAD_EXCEPTION_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/AnyEditor.tsx',
        IMPORTING_SOURCE,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('somewhere/else/Unrelated.tsx');
    } finally {
      await cleanup(fixture);
    }
  });

  it('malformed registry → exit 2 with descriptive error', async () => {
    const fixture = await makeFixture('malformed');
    try {
      await writeRegistry(fixture, MALFORMED_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/a.tsx',
        'export {};\n',
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('expected_adopters_glob');
    } finally {
      await cleanup(fixture);
    }
  });

  it('multi-glob entry flags holdouts across both globs; non-matching paths ignored', async () => {
    const fixture = await makeFixture('multiglob');
    try {
      await writeRegistry(fixture, MULTI_GLOB_REGISTRY);
      // Holdout via glob #1.
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchesPage.tsx',
        HOLDOUT_SOURCE,
      );
      // Adopter via glob #2.
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/ProgramsPage.tsx',
        LIST_BANK_IMPORT_SOURCE,
      );
      // Holdout via glob #2.
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/SamplesPage.tsx',
        HOLDOUT_SOURCE,
      );
      // Non-match (no glob hit at all).
      await writeSource(
        fixture,
        'modules/unrelated-module/src/Something.tsx',
        HOLDOUT_SOURCE,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('PatchesPage.tsx');
      expect(run.stdout).toContain('SamplesPage.tsx');
      expect(run.stdout).not.toContain('ProgramsPage.tsx');
      expect(run.stdout).not.toContain('Something.tsx');
    } finally {
      await cleanup(fixture);
    }
  });

  it('exception applied across multi-glob entries; non-exempted holdouts surface', async () => {
    const fixture = await makeFixture('multiglobexc');
    try {
      await writeRegistry(fixture, MULTI_GLOB_WITH_EXCEPTION_REGISTRY);
      // Exempted in glob #1.
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/SpecialPage.tsx',
        HOLDOUT_SOURCE,
      );
      // Holdout in glob #2 (not exempted).
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/SamplesPage.tsx',
        HOLDOUT_SOURCE,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).not.toContain('SpecialPage.tsx');
      expect(run.stdout).toContain('SamplesPage.tsx');
    } finally {
      await cleanup(fixture);
    }
  });
});
