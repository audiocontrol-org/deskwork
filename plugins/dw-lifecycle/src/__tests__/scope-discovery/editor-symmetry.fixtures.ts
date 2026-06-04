/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/editor-symmetry.fixtures.ts
 *
 * Fixture builders + canned YAML/source payloads for the Phase 4 Family
 * B `check-editor-symmetry` adversarial test suite. Ported from the
 * audiocontrol pilot's `tools/scope-discovery/editor-symmetry.fixtures.ts`
 * with destination-specific rewrites:
 *
 *   - Subprocess entry is the dw-lifecycle CLI dispatcher
 *     (`plugins/dw-lifecycle/src/cli.ts`), with `check-editor-symmetry`
 *     as the subcommand. The pilot invoked the scanner module directly;
 *     dw-lifecycle adopters trigger it via the dispatcher, so the test
 *     suite mirrors that path. CLI entry is resolved relative to this
 *     file via `fileURLToPath(import.meta.url)`.
 *   - The fixture passes `--module-root modules` because canned source
 *     paths use `modules/<editor>/src/...` (pilot layout); destination's
 *     `discoverModules` default is `'src'`. Honoring the pilot's path
 *     verbatim keeps the canned YAML payloads valid.
 *   - Editor slugs (`roland-sxx0-editor`, `akai-s3k-editor`,
 *     `jv1080-editor`) stay verbatim — they're payload directory names,
 *     not assumptions in the editor-discovery code. Keeping the
 *     audiocontrol-flavored slugs makes the test output greppable
 *     against the pilot's prior runs.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runScannerSubprocess, type ScannerRun } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/ -> src/cli.ts is ../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

export type { ScannerRun };

export interface Fixture {
  readonly registryPath: string;
  readonly scanRoot: string;
  readonly dir: string;
}

/**
 * Build a fresh per-test fixture. Creates `repo/modules/<editor>/src/`
 * directories for each editor slug. The registry lives at
 * `<dir>/registry.yaml` (not under the repo's scope-discovery directory)
 * so the test can compare empty vs populated registries without writing
 * to `.dw-lifecycle/`.
 */
export async function makeFixture(
  slug: string,
  editors: readonly string[],
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `editor-symmetry-${slug}-`));
  const scanRoot = join(root, 'repo');
  await mkdir(join(scanRoot, 'modules'), { recursive: true });
  for (const editor of editors) {
    await mkdir(join(scanRoot, 'modules', editor, 'src'), { recursive: true });
  }
  return { registryPath: join(root, 'registry.yaml'), scanRoot, dir: root };
}

export async function writeRegistry(fixture: Fixture, yamlText: string): Promise<void> {
  await writeFile(fixture.registryPath, yamlText, 'utf8');
}

export async function writeSource(
  fixture: Fixture,
  relPath: string,
  content: string,
): Promise<void> {
  const full = join(fixture.scanRoot, relPath);
  const parent = dirname(full);
  if (parent.length > fixture.scanRoot.length) {
    await mkdir(parent, { recursive: true });
  }
  await writeFile(full, content, 'utf8');
}

export async function cleanup(fixture: Fixture): Promise<void> {
  await rm(fixture.dir, { recursive: true, force: true });
}

/**
 * Build the dispatcher's CLI args for `check-editor-symmetry`. The
 * fixture's editor directories live under `modules/<editor>/src/`, so
 * the test passes `--module-root modules` to override the destination
 * default of `'src'`. Extra args are appended verbatim — used for
 * `--write`/`--artifact`/`--quiet` scenarios.
 */
export function scannerArgs(
  fixture: Fixture,
  extra: readonly string[] = [],
): string[] {
  return [
    'check-editor-symmetry',
    '--registry',
    fixture.registryPath,
    '--root',
    fixture.scanRoot,
    '--module-root',
    'modules',
    ...extra,
  ];
}

/**
 * Spawn the scanner. By default it's the CLI dispatcher; gutted-stub
 * scenarios pass a stub script as `entry` instead. Stub scripts get
 * the raw scannerArgs as argv so they can ignore them — the stub's
 * payload is hard-coded.
 */
export function runScanner(
  args: readonly string[],
  entry: string = CLI_ENTRY,
): Promise<ScannerRun> {
  return runScannerSubprocess(entry, args);
}

// ---------------------------------------------------------------------------
// Canned payloads — ported verbatim from the pilot's `payloads` const.
// ---------------------------------------------------------------------------

export const payloads = {
  EMPTY_REGISTRY_YAML: `adopter_manifests: []\n`,

  SINGLE_EDITOR_REGISTRY: `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    message: |
      Replace the inline drawer with @/components/SlideDrawer.
`,

  MULTI_EDITOR_REGISTRY: `adopter_manifests:
  - id: shared-list-bank
    introduced_in: cafef00d
    from: '@/components/ListBank'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Page.tsx'
      - 'modules/akai-s3k-editor/src/**/*Page.tsx'
    message: |
      Use @/components/ListBank for consistent virtualization.
`,

  WITH_EXCEPTION_REGISTRY: `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/roland-sxx0-editor/src/**/*Editor*.tsx'
    exceptions:
      - path: modules/roland-sxx0-editor/src/SpecialEditor.tsx
        reason: |
          Needs frame-rate scroll-lock that SlideDrawer does not expose.
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`,

  IMPORTING_SOURCE:
    "import { SlideDrawer } from '@/components/SlideDrawer';\n" +
    'export function PatchEditor() { return <SlideDrawer />; }\n',

  HOLDOUT_SOURCE:
    "import { useState } from 'react';\n" +
    'export function PatchEditor() {\n' +
    '  const [open] = useState(false);\n' +
    '  return open ? <div className="inline-drawer" /> : null;\n' +
    '}\n',

  LIST_BANK_IMPORT_SOURCE:
    "import { ListBank } from '@/components/ListBank';\nexport const x = ListBank;\n",

  // AUDIT-06 — tracked_holdouts: payloads for the editor-symmetry suite.
  TRACKED_HOLDOUT_REGISTRY: `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/akai-s3k-editor/src/**/*Editor*.tsx'
    tracked_holdouts:
      - path: modules/akai-s3k-editor/src/DeferredEditor.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: |
          pending follow-up — v3 SlideDrawer migration deferred.
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`,

  TRACKED_HOLDOUT_MIXED_REGISTRY: `adopter_manifests:
  - id: slide-drawer-promotion
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/akai-s3k-editor/src/**/*Editor*.tsx'
    tracked_holdouts:
      - path: modules/akai-s3k-editor/src/DeferredEditor.tsx
        issue: 'https://github.com/audiocontrol-org/audiocontrol/issues/450'
        reason: |
          pending follow-up — v3 SlideDrawer migration deferred.
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`,
} as const;
