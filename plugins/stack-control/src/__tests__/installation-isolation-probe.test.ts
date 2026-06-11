// The isolation probe (specs/installation-isolation — US1/FR-008, SC-001).
//
// Table-driven contract: every state-writing verb, run against a nested-
// installation fixture (outer git repo ⊃ installation), produces ZERO
// filesystem changes outside the installation tree. Exemptions are exactly
// FR-008's list: OS tmpdirs (outside the fixture by construction), the
// resolved feature anchor (a designated, announced write target), and
// explicitly announced operator overrides.
//
// Each row mirrors the recorded violation class (research.md anchor
// inventory): the verb is invoked from the OUTER repo root — the cwd/
// repo-root anchoring that created this repo's root half-installation.
// The probe asserts the isolation invariant, not the verb's exit code
// (refusal semantics are US2's tests): whether the verb anchors at the
// installation, refuses for lack of one, or errors, the outer tree must
// stay byte-identical.
//
// RED (T002): audit-barrage writes `<outer>/.stack-control/audit-runs/`
// and scope-widen auto-seeds `<outer>/.stack-control/scope-discovery/`
// (research rows 1, 5) — both rows fail until US1's installation
// threading (T003) lands.

import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { synthesize } from '../scope-discovery/synthesis.js';
import type { DiscoveryAgentFinding } from '../scope-discovery/discovery-agents/types.js';
import { runCli } from './_run-helpers.js';
import {
  diffSnapshots,
  makeNestedFixture,
  snapshotOutsideInstallation,
  type NestedFixture,
} from './_isolation-harness.js';

/**
 * Stub model battery: `echo` is universally present, exits 0, and emits
 * bytes (a COVERING family) — the barrage runs its full artifact pipeline
 * without any real model CLI.
 */
const STUB_BARRAGE_CONFIG = [
  'models:',
  '  - name: stub',
  '    binary: echo',
  '    args_template: "stub-audit {{prompt}}"',
  '    timeout_seconds: 60',
  '',
].join('\n');

const WIDEN_SLUG = 'widen-fixture';

const WIDEN_PRD = [
  `# Feature: ${WIDEN_SLUG}`,
  '',
  '## Overview',
  '',
  'The widget module is the surface. widget widget widget.',
  '',
].join('\n');

/**
 * Feature scaffolding for the scope-widen row: a legacy-docs feature root
 * at the OUTER root (the transitional cross-tree layout), a module tree
 * with live pattern signal, and a schema-valid prior manifest synthesized
 * the same way scope-widen-auto-seed.test.ts builds its fixture.
 */
async function scaffoldWidenFeature(fixture: NestedFixture): Promise<void> {
  const featureRoot = join(
    fixture.outerRoot,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    WIDEN_SLUG,
  );
  await mkdir(featureRoot, { recursive: true });
  const prdPath = join(featureRoot, 'prd.md');
  await writeFile(prdPath, WIDEN_PRD, 'utf8');

  const widgetDir = join(fixture.outerRoot, 'src', 'widget');
  await mkdir(widgetDir, { recursive: true });
  await writeFile(
    join(widgetDir, 'a.ts'),
    'export const widget = (x: unknown) => x as Foo;\n',
    'utf8',
  );
  await writeFile(
    join(widgetDir, 'b.ts'),
    'export const widgetCount = 2; // widget helper\n',
    'utf8',
  );

  const priorFindings: ReadonlyArray<DiscoveryAgentFinding> = [
    {
      agent: 'prd-themed-pattern-hunter',
      featureSlug: WIDEN_SLUG,
      themes: [
        {
          term: 'widget',
          occurrences: [{ file: 'src/widget/a.ts', line: 1, snippet: 'widget' }],
        },
      ],
    },
    {
      agent: 'ast-grep-matrix',
      featureSlug: WIDEN_SLUG,
      patterns: [
        {
          id: 'as-type-cast',
          description: 'as-cast bypassing the type system',
          regex: '\\bas\\s+[A-Z]',
          hits: [{ file: 'src/widget/a.ts', line: 1, snippet: 'x as Foo' }],
        },
      ],
    },
  ];
  const priorOut = await synthesize({
    featureSlug: WIDEN_SLUG,
    findings: priorFindings,
    prdPath,
    prdRelPath: `docs/1.0/001-IN-PROGRESS/${WIDEN_SLUG}/prd.md`,
    moduleRoot: 'src',
  });
  await writeFile(
    join(featureRoot, 'scope-manifest.yaml'),
    stringifyYaml(priorOut.manifest),
    'utf8',
  );
}

interface ProbeRow {
  readonly name: string;
  readonly setup: (fixture: NestedFixture) => Promise<void>;
  readonly args: (fixture: NestedFixture) => string[];
  /**
   * FR-008 exemptions for this row, relative to the outer root — only the
   * resolved feature anchor qualifies (a designated write target wherever
   * it lives).
   */
  readonly exemptRel: readonly string[];
}

const ROWS: readonly ProbeRow[] = [
  {
    // Research row 1: orchestrate-barrage run-dirs keyed on BarrageInput
    // .repoRoot — invoked from the outer root, the run dir (and config
    // read) land at the outer root today.
    name: 'audit-barrage',
    setup: async (fixture) => {
      fixture.writeOuter(
        '.stack-control/audit-barrage-config.yaml',
        STUB_BARRAGE_CONFIG,
      );
      fixture.writeInstallation(
        '.stack-control/audit-barrage-config.yaml',
        STUB_BARRAGE_CONFIG,
      );
      fixture.writeInstallation('prompt.md', 'Audit this fixture diff.\n');
    },
    args: (fixture) => [
      'audit-barrage',
      '--feature',
      'iso-probe',
      '--prompt-file',
      join(fixture.installationRoot, 'prompt.md'),
      '--quiet',
    ],
    exemptRel: [],
  },
  {
    // Research row 5: scope-widen's auto-seed installs scope-discovery
    // state at opts.repoRoot (cwd here) — the outer root today. The
    // feature root (docs/) is the designated feature anchor: exempt.
    name: 'scope-widen auto-seed',
    setup: scaffoldWidenFeature,
    args: () => [
      'scope-widen',
      'gadget module is also affected by this change',
      '--slug',
      WIDEN_SLUG,
      '--evidence-trail',
      'off',
    ],
    exemptRel: ['docs'],
  },
];

describe('installation-isolation probe (US1/FR-008) — outer tree byte-identical', () => {
  it.each(ROWS.map((row) => [row.name, row] as const))(
    '%s writes nothing outside the installation when invoked from the outer root',
    async (_name, row) => {
      const fixture = makeNestedFixture();
      try {
        await row.setup(fixture);
        const before = snapshotOutsideInstallation(fixture, row.exemptRel);
        runCli(row.args(fixture), { cwd: fixture.outerRoot });
        const after = snapshotOutsideInstallation(fixture, row.exemptRel);
        expect(
          diffSnapshots(before, after),
          'state-writing verb mutated the outer tree (isolation invariant FR-001)',
        ).toEqual([]);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );
});
