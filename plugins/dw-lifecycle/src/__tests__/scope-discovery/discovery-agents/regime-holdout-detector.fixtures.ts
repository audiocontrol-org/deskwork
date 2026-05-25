/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/regime-holdout-detector.fixtures.ts
 *
 * Fixture builders + canned YAML/source payloads for the Phase 4 Family
 * A regime-holdout-detector adversarial test suite. Ported from the
 * audiocontrol pilot's
 * `tools/scope-discovery/discovery-agents/regime-holdout-detector.fixtures.ts`
 * with destination-specific path rewrites:
 *
 *   - Registry files land under `<repoRoot>/.dw-lifecycle/scope-discovery/`
 *     (not the legacy pilot `docs/scope-discovery/` location).
 *   - Subprocess entry is the destination agent path
 *     `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts`,
 *     resolved relative to this file via `fileURLToPath(import.meta.url)`
 *     so vitest workers find it regardless of their CWD.
 *   - The agent CLI passes `--module-root modules` so canned source paths
 *     `modules/foo-editor/...` continue to land under the configured
 *     module-root (the destination default is `'src'`).
 *
 * The vitest-side tests in `regime-holdout-detector.test.ts` import the
 * fixture helpers + `payloads` map; each `it` block builds a per-test
 * temp directory, plants registries + sources, invokes the agent, and
 * cleans up in a `finally` (mirroring the pilot's scenario-function
 * pattern, with `it` describing the assertion).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runScannerSubprocess, type ScannerRun } from '../util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/discovery-agents/ -> src/scope-discovery/discovery-agents/regime-holdout-detector.ts
// is ../../../scope-discovery/discovery-agents/regime-holdout-detector.ts
const AGENT_ENTRY = resolve(
  HERE,
  '..',
  '..',
  '..',
  'scope-discovery',
  'discovery-agents',
  'regime-holdout-detector.ts',
);

export type { ScannerRun };

export interface Fixture {
  readonly dir: string;
  readonly repoRoot: string;
  readonly prdPath: string;
}

/**
 * Build a fresh per-test temp fixture. Creates `repo/modules/`,
 * `repo/.dw-lifecycle/scope-discovery/`, and a trivial `prd.md`. The
 * agent's CLI requires `--prd-path` to exist but does NOT read the PRD
 * itself — content is intentionally minimal so no module name
 * accidentally pattern-matches.
 */
export async function makeFixture(slug: string): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), `regime-holdout-${slug}-`));
  const repoRoot = join(dir, 'repo');
  await mkdir(join(repoRoot, 'modules'), { recursive: true });
  await mkdir(join(repoRoot, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
  const prdPath = join(repoRoot, 'prd.md');
  await writeFile(prdPath, '# Test PRD\n\nNothing significant.\n', 'utf8');
  return { dir, repoRoot, prdPath };
}

export async function cleanup(fixture: Fixture): Promise<void> {
  await rm(fixture.dir, { recursive: true, force: true });
}

export async function writeSource(
  fixture: Fixture,
  relPath: string,
  content: string,
): Promise<void> {
  const full = join(fixture.repoRoot, relPath);
  const parent = dirname(full);
  if (parent.length > fixture.repoRoot.length) {
    await mkdir(parent, { recursive: true });
  }
  await writeFile(full, content, 'utf8');
}

export async function writeAntiPatterns(
  fixture: Fixture,
  yamlText: string,
): Promise<void> {
  await writeFile(
    join(fixture.repoRoot, '.dw-lifecycle', 'scope-discovery', 'anti-patterns.yaml'),
    yamlText,
    'utf8',
  );
}

export async function writeAdopterManifests(
  fixture: Fixture,
  yamlText: string,
): Promise<void> {
  await writeFile(
    join(fixture.repoRoot, '.dw-lifecycle', 'scope-discovery', 'adopter-manifests.yaml'),
    yamlText,
    'utf8',
  );
}

/**
 * Plant the two empty registry stubs the agent's scanners need by
 * default. Scenarios that need a populated registry overwrite via
 * `writeAntiPatterns` / `writeAdopterManifests` after calling this.
 */
export async function plantEmptyRegistries(fixture: Fixture): Promise<void> {
  await writeAntiPatterns(fixture, 'anti_patterns: []\n');
  await writeAdopterManifests(fixture, 'adopter_manifests: []\n');
}

/**
 * Build the agent's CLI args. The fixture's canned source payloads put
 * files under `modules/<editor>/src/...`, so the agent must scan with
 * `--module-root modules` to honor the pilot's layout (vs. the
 * destination default of `'src'`).
 */
export function agentArgs(fixture: Fixture): string[] {
  return [
    '--feature',
    'test-feature',
    '--prd-path',
    fixture.prdPath,
    '--repo-root',
    fixture.repoRoot,
    '--module-root',
    'modules',
  ];
}

export interface ParsedAgentRun {
  readonly run: ScannerRun;
  readonly payload: unknown;
}

/**
 * Subprocess the regime-holdout-detector against `fixture`, parse its
 * stdout as JSON, and return the parsed payload (or null on parse
 * error). The vitest tests then narrow the payload via the type-
 * predicate `isRegimeHoldoutFindings` for typed assertions without
 * `as` casts.
 *
 * `entry` defaults to the real agent path; the gutted-stub test
 * passes its own stub path instead.
 */
export async function invokeAgent(
  fixture: Fixture,
  entry: string = AGENT_ENTRY,
): Promise<ParsedAgentRun> {
  const run = await runScannerSubprocess(entry, agentArgs(fixture));
  let payload: unknown = null;
  if (run.stdout.length > 0) {
    try {
      payload = JSON.parse(run.stdout);
    } catch {
      payload = null;
    }
  }
  return { run, payload };
}

// ---------------------------------------------------------------------------
// Canned payloads — ported verbatim from the pilot module's `payloads` const.
// ---------------------------------------------------------------------------

export const payloads = {
  ANTI_PATTERN_REGISTRY_ONE: `anti_patterns:
  - id: legacy-slide-drawer
    added_in: deadbeef
    primitive: SlideDrawer
    from: '@/components/SlideDrawer'
    shape_regex: 'className="inline-drawer"'
    message: |
      Replace inline drawer with @/components/SlideDrawer.
`,

  ANTI_PATTERN_SOURCE_MATCH:
    'export function PatchEditor() {\n' +
    '  return <div className="inline-drawer" />;\n' +
    '}\n',

  ANTI_PATTERN_SOURCE_OK:
    "import { SlideDrawer } from '@/components/SlideDrawer';\n" +
    'export function PatchEditor() { return <SlideDrawer />; }\n',

  ADOPTER_MANIFEST_REGISTRY_ONE: `adopter_manifests:
  - id: slide-drawer-adoption
    introduced_in: deadbeef
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/foo-editor/src/**/*Editor*.tsx'
    message: |
      Use @/components/SlideDrawer in every editor surface.
`,

  ADOPTER_HOLDOUT_SOURCE:
    "import { useState } from 'react';\n" +
    'export function PatchEditor() {\n' +
    '  const [open] = useState(false);\n' +
    '  return open ? <div /> : null;\n' +
    '}\n',

  ADOPTER_ADOPTING_SOURCE:
    "import { SlideDrawer } from '@/components/SlideDrawer';\n" +
    'export function PatchEditor() { return <SlideDrawer />; }\n',

  SYMMETRY_REGISTRY_TWO_EDITORS: `adopter_manifests:
  - id: list-bank-shared
    introduced_in: cafef00d
    from: '@/components/ListBank'
    expected_adopters_glob:
      - 'modules/foo-editor/src/**/*Page.tsx'
      - 'modules/bar-editor/src/**/*Page.tsx'
    message: |
      Use @/components/ListBank for shared virtualization.
`,

  LIST_BANK_IMPORT:
    "import { ListBank } from '@/components/ListBank';\nexport const x = ListBank;\n",

  LIST_BANK_HOLDOUT: 'export const x = 1;\n',

  DEPRECATED_FILE_CONTENT:
    '/**\n' +
    ' * @deprecated Use the new module — this is the audit candidate.\n' +
    ' */\n' +
    '\n' +
    'export function OldEnvelope() { return null; }\n',

  DEPRECATED_IMPORTER_CONTENT:
    "import { OldEnvelope } from '@/components/OldEnvelope';\n" +
    'export const x = OldEnvelope;\n',
} as const;
