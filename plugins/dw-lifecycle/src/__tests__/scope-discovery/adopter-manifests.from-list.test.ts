/**
 * `from:` as a string OR list adversarial scenarios for the adopter-
 * manifests scanner (Phase 2 Family C). Ported from the audiocontrol
 * pilot's `adopter-manifests.from-list-scenarios.ts`
 * (AUDIT-20260524-08 Part A) and converted to vitest.
 *
 * Motivation: the pre-AUDIT-08 `from:` field was a literal string.
 * When a primitive was promoted across modules (e.g., `@/components/
 * common/X` → `@audiocontrol/editor-core`), consumers' new import
 * paths stopped matching the registry's `from:` and the gate produced
 * false holdouts.
 *
 * The fix:
 *   - `from:` may be a single non-empty string (back-compat) OR a
 *     non-empty list of non-empty strings.
 *   - `buildImportRegex` OR-combines every listed path; a consumer
 *     importing via ANY listed path counts as an adopter.
 *   - Parser rejects: empty array, non-string elements, empty string
 *     elements.
 *
 * Subprocess invocation goes through the plugin CLI dispatcher.
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

const FROM_LIST_REGISTRY = `adopter_manifests:
  - id: page-title-row
    introduced_in: deadbeef
    from:
      - '@audiocontrol/editor-core'
      - '@/components/common/PageTitleRow'
    expected_adopters_glob:
      - 'modules/{roland-sxx0,akai-s3k}-editor/src/**/*Page.tsx'
    message: |
      Replace inline page-title row with PageTitleRow from @audiocontrol/editor-core.
`;

const FROM_STRING_BACKCOMPAT_REGISTRY = `adopter_manifests:
  - id: legacy-from-string
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`;

const FROM_EMPTY_ARRAY_REGISTRY = `adopter_manifests:
  - id: empty-from-array
    introduced_in: deadbeef
    from: []
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    message: |
      Replace inline drawer with the canonical primitive.
`;

const FROM_LIST_WITH_EMPTY_STRING_REGISTRY = `adopter_manifests:
  - id: from-with-empty-string
    introduced_in: deadbeef
    from:
      - '@audiocontrol/editor-core'
      - ''
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    message: |
      Replace inline drawer with the canonical primitive.
`;

const FROM_LIST_WITH_NON_STRING_REGISTRY = `adopter_manifests:
  - id: from-with-non-string
    introduced_in: deadbeef
    from:
      - '@audiocontrol/editor-core'
      - 42
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    message: |
      Replace inline drawer with the canonical primitive.
`;

// Two import-payload variants — one importing via the new canonical
// path, one via the legacy alias. Both should count as adopters when
// the registry's `from:` lists both paths (the relocation case).
const IMPORT_VIA_NEW_PATH =
  "import { PageTitleRow } from '@audiocontrol/editor-core';\n" +
  'export function PatchesPage() { return <PageTitleRow />; }\n';
const IMPORT_VIA_LEGACY_PATH =
  "import { PageTitleRow } from '@/components/common/PageTitleRow';\n" +
  'export function ProgramsPage() { return <PageTitleRow />; }\n';

describe('adopter-manifests — from-as-list (AUDIT-08)', () => {
  it('multi-path `from:` recognizes adoption via EITHER listed import path → 0 holdouts', async () => {
    const fixture = await makeFixture('from-list-either');
    try {
      await writeRegistry(fixture, FROM_LIST_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchesPage.tsx',
        IMPORT_VIA_NEW_PATH,
      );
      await writeSource(
        fixture,
        'modules/akai-s3k-editor/src/ProgramsPage.tsx',
        IMPORT_VIA_LEGACY_PATH,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('0 holdouts');
    } finally {
      await cleanup(fixture);
    }
  });

  it('single-string `from:` preserved end-to-end; consumer importing the path counts as adopter', async () => {
    const fixture = await makeFixture('from-string-compat');
    try {
      await writeRegistry(fixture, FROM_STRING_BACKCOMPAT_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        SOURCE_PAYLOADS.IMPORTING,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('0 holdouts');
    } finally {
      await cleanup(fixture);
    }
  });

  it('empty `from:` array rejected with descriptive parse error', async () => {
    const fixture = await makeFixture('from-empty');
    try {
      await writeRegistry(fixture, FROM_EMPTY_ARRAY_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        SOURCE_PAYLOADS.IMPORTING,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('from');
    } finally {
      await cleanup(fixture);
    }
  });

  it('empty string inside `from:` list rejected with descriptive parse error', async () => {
    const fixture = await makeFixture('from-empty-element');
    try {
      await writeRegistry(fixture, FROM_LIST_WITH_EMPTY_STRING_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        SOURCE_PAYLOADS.IMPORTING,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('from');
    } finally {
      await cleanup(fixture);
    }
  });

  it('non-string element inside `from:` list rejected with descriptive parse error', async () => {
    const fixture = await makeFixture('from-non-string');
    try {
      await writeRegistry(fixture, FROM_LIST_WITH_NON_STRING_REGISTRY);
      await writeSource(
        fixture,
        'modules/roland-sxx0-editor/src/PatchEditor.tsx',
        SOURCE_PAYLOADS.IMPORTING,
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('from');
    } finally {
      await cleanup(fixture);
    }
  });

  it('multi-path `from:` recognizes mixed-state transition (new + legacy adopters); only true holdout surfaces', async () => {
    const fixture = await makeFixture('from-relocation');
    try {
      // Synthetic relocation: the primitive's package path changes from
      // an old module-local alias to a new shared-package canonical.
      // Manifest lists BOTH paths so the gate stays green during the
      // transition window — three editors land in different states:
      //  - editor A: already migrated to new path → adopter.
      //  - editor B: still on legacy alias → adopter (during transition).
      //  - editor C: doesn't import either → holdout.
      const RELOCATION_REGISTRY = `adopter_manifests:
  - id: relocated-primitive
    introduced_in: feedface
    from:
      - '@new-package/RelocatedPrimitive'
      - '@/local/RelocatedPrimitive'
    expected_adopters_glob:
      - 'modules/editor-*/src/**/*Page.tsx'
    message: |
      Migrate to '@new-package/RelocatedPrimitive' once your editor lands its scheduled bump.
`;
      await writeRegistry(fixture, RELOCATION_REGISTRY);
      await writeSource(
        fixture,
        'modules/editor-a/src/Page.tsx',
        "import { X } from '@new-package/RelocatedPrimitive';\nexport const A = X;\n",
      );
      await writeSource(
        fixture,
        'modules/editor-b/src/Page.tsx',
        "import { X } from '@/local/RelocatedPrimitive';\nexport const B = X;\n",
      );
      await writeSource(
        fixture,
        'modules/editor-c/src/Page.tsx',
        'export const C = "not adopted";\n',
      );
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).toContain('editor-c/src/Page.tsx');
      expect(run.stdout).not.toContain('editor-a/src/Page.tsx');
      expect(run.stdout).not.toContain('editor-b/src/Page.tsx');
    } finally {
      await cleanup(fixture);
    }
  });
});
