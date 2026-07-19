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
// (research rows 1, 5) — both rows failed until US1's installation
// threading (T003) landed. T005 extends the table to the full R5 verb
// set (lift, slush-findings, scope-inventory, backlog capture/import,
// install-scope-discovery) plus `--at` anchored rows that additionally
// pin WHERE the state lands inside the installation (SC-001).
//
// -----------------------------------------------------------------------------
// specs/036-fleet-control-plane — T126: BOUND the declared machine-local
// exception (FR-008 / SC-001; plan.md § Complexity Tracking, "the isolation
// exception must be tested, not assumed").
//
// 036 DELIBERATELY persists identity OUTSIDE the installation tree — the
// installationId, the bearer token, and the installationSequence high-water
// mark live in a MACHINE-LOCAL durable store (HOME/XDG-located), never in the
// version-controlled `.stack-control/`. This is the SOLE sanctioned outside-
// tree write. The probe below (`snapshotOutsideInstallation`) only watched the
// OUTER repo, so this machine-local write to `$HOME` passed SILENTLY — for the
// WRONG reason (the store simply wasn't in view), which is worse than failing.
//
// Two things change here to close that gap:
//   1. EVERY row now runs under the T009 machine-state redirect
//      (`useMachineStateStore`). This is NOT optional cosmetics: the CLI
//      dispatcher (cli.ts) calls `locateMachineState(cwd)` at startup for every
//      verb (creating the durable + socket dirs) and mints identity + advances
//      the high-water mark on its emit path. Un-redirected, those writes land in
//      a real developer's `$HOME` (the silent leak) — or, once this harness is
//      imported, in its import-time durable poison "tripwire", which the
//      teardown asserts is EMPTY. Redirecting per test makes every row hermetic
//      and turns the tripwire into a loud proof that no row leaked durable
//      identity anywhere it shouldn't.
//   2. A new describe block EXPLICITLY bounds the exception for the 036 write
//      surface (`plane provision-token`, `mintOrReadInstallationId`,
//      `advanceHighWaterMark`, token custody): it asserts the write lands in the
//      machine-local durable store (exception real + exercised), that store is
//      the ONLY outside-tree write (outer tree byte-identical + tripwire empty),
//      and the INSTALLATION tree receives nothing (a machine-local write never
//      smears into the tree). A future 036 durable field is caught by the
//      known-durable-filenames bound rather than silently admitted.
// -----------------------------------------------------------------------------

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { activeCapabilities, enterFrontDoor, exitFrontDoor } from '../capability/marker.js';
import { mediateCheck } from '../subcommands/mediate-check.js';
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
import {
  useMachineStateStore,
  type MachineStateStore,
} from '../../tests/fleet/_machine-state-harness.js';
import {
  assertMachineLocalExceptionBound,
  MACHINE_LOCAL_OPS,
} from './_machine-local-exception-probe.js';

// Every test in this file redirects the machine-local durable + ephemeral store
// to a disposable temp dir and asserts (teardown) that nothing leaked to the
// import-time durable poison tripwire — i.e. no row wrote durable identity to a
// real `$HOME`. Registered at file scope so it wraps the table rows, the 026
// mediation block, AND the 036 machine-local-exception block below.
const machineStore = useMachineStateStore();

/**
 * Stub model battery: `echo` is universally present, exits 0, and emits
 * bytes (a COVERING family) — the barrage runs its full artifact pipeline
 * without any real model CLI.
 */
const STUB_BARRAGE_CONFIG = [
  'models:',
  '  - name: stub',
  '    binary: echo',
  '    model: stub-pin',
  '    args_template: "{{model}} stub-audit {{prompt}}"',
  '    readonly_enforcement: none',
  '    output_mode: text',
  '    liveness_signal: none',
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
 * Feature scaffolding for the scope-widen rows: a legacy-docs feature
 * root + module tree with live pattern signal + a schema-valid prior
 * manifest (the same shapes scope-widen-auto-seed.test.ts builds), under
 * `base` — the OUTER root for the no-anchor refusal row (the
 * transitional cross-tree layout) or the INSTALLATION root for the
 * `--at` anchored row.
 */
async function scaffoldWidenFeature(
  fixture: NestedFixture,
  base: 'outer' | 'installation' = 'outer',
): Promise<void> {
  const baseRoot =
    base === 'outer' ? fixture.outerRoot : fixture.installationRoot;
  const featureRoot = join(
    baseRoot,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    WIDEN_SLUG,
  );
  await mkdir(featureRoot, { recursive: true });
  const prdPath = join(featureRoot, 'prd.md');
  await writeFile(prdPath, WIDEN_PRD, 'utf8');

  const widgetDir = join(baseRoot, 'src', 'widget');
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
  /** Extra env for the spawned verb (e.g. neutralizing seam overrides). */
  readonly env?: Record<string, string>;
  /**
   * Paths (relative to the INSTALLATION root) that must exist after the
   * run — the positive half of SC-001's acceptance scenarios: anchored
   * invocations place their state inside the installation.
   */
  readonly expectInsideRel?: readonly string[];
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
  {
    // SC-001 acceptance scenario 1: a barrage invoked from the outer repo,
    // explicitly anchored with --at, lands its run dir INSIDE the
    // installation and touches nothing outside it.
    name: 'audit-barrage --at (anchored)',
    setup: async (fixture) => {
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
      '--at',
      fixture.installationRoot,
      '--quiet',
    ],
    exemptRel: [],
    expectInsideRel: ['.stack-control/audit-runs'],
  },
  {
    // SC-001 acceptance scenario 2: the widen auto-seed, anchored with
    // --at, seeds scope-discovery state under the installation's
    // .stack-control/ — never the outer root.
    name: 'scope-widen --at (anchored auto-seed)',
    setup: (fixture) => scaffoldWidenFeature(fixture, 'installation'),
    args: (fixture) => [
      'scope-widen',
      'gadget module is also affected by this change',
      '--slug',
      WIDEN_SLUG,
      '--at',
      fixture.installationRoot,
      '--evidence-trail',
      'off',
    ],
    exemptRel: [],
    expectInsideRel: ['.stack-control/scope-discovery/clones.yaml'],
  },
  {
    // R5 set: every remaining state-writing verb, invoked from the outer
    // root with no anchor — no enclosing installation, so each refuses
    // and the outer tree stays byte-identical (US2's refusal is pinned
    // in its own suite; the probe pins the zero-write half).
    name: 'audit-barrage-lift',
    setup: async () => {},
    args: (fixture) => [
      'audit-barrage-lift',
      '--feature',
      'iso-probe',
      '--run-dir',
      join(fixture.outerRoot, 'no-such-run-dir'),
    ],
    exemptRel: [],
  },
  {
    name: 'slush-findings',
    setup: async () => {},
    args: () => ['slush-findings', '--feature', 'iso-probe'],
    exemptRel: [],
  },
  {
    name: 'scope-inventory',
    setup: async () => {},
    args: () => ['scope-inventory', '--slug', 'iso-probe'],
    exemptRel: [],
  },
  {
    name: 'install-scope-discovery',
    setup: async () => {},
    args: () => ['install-scope-discovery'],
    exemptRel: [],
  },
  {
    // The backlog store resolves through the installation (009 seam);
    // STACKCTL_BACKLOG_DIR is blanked so the walk-up (not the test
    // session's seam) decides — from the outer root that is a refusal.
    name: 'backlog capture',
    setup: async () => {},
    args: () => ['backlog', 'capture', 'probe-captured item', '--type', 'bug'],
    exemptRel: [],
    env: { STACKCTL_BACKLOG_DIR: '' },
  },
  {
    // STACKCTL_GH_ISSUES_FILE is the no-network test seam; the refusal
    // (no enclosing installation) must fire before any issue read.
    name: 'backlog import-github',
    setup: async (fixture) => {
      fixture.writeOuter('issues.json', '[]\n');
    },
    args: () => ['backlog', 'import-github', '--apply'],
    exemptRel: ['issues.json'],
    env: { STACKCTL_BACKLOG_DIR: '' },
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
        runCli(row.args(fixture), {
          cwd: fixture.outerRoot,
          ...(row.env !== undefined ? { env: row.env } : {}),
        });
        const after = snapshotOutsideInstallation(fixture, row.exemptRel);
        expect(
          diffSnapshots(before, after),
          'state-writing verb mutated the outer tree (isolation invariant FR-001)',
        ).toEqual([]);
        for (const rel of row.expectInsideRel ?? []) {
          expect(
            existsSync(join(fixture.installationRoot, rel)),
            `expected ${rel} under the installation after the run`,
          ).toBe(true);
        }
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );
});

// 026 T029 — the capability-mediation state writers anchor to the INSTALLATION, never
// the outer root (the same isolation invariant the table above polices for other verbs).
describe('026 capability mediation — front-door + mediate-check anchor to the installation (T029)', () => {
  let fx: NestedFixture | undefined;
  afterEach(() => fx?.cleanup());

  it('front-door enter writes the marker INSIDE the nested installation; nothing leaks to the outer root', () => {
    fx = makeNestedFixture();
    const before = snapshotOutsideInstallation(fx);
    const token = enterFrontDoor(fx.installationRoot, 'sess', 'backlog');
    expect(existsSync(join(fx.installationRoot, '.stack-control', 'state', 'front-door', 'sess.json'))).toBe(true);
    expect(diffSnapshots(before, snapshotOutsideInstallation(fx))).toEqual([]);
    exitFrontDoor(fx.installationRoot, 'sess', token);
    expect(diffSnapshots(before, snapshotOutsideInstallation(fx))).toEqual([]);
  });

  it('mediate-check --at reads the NESTED installation marker (permits) and writes nothing outside it', () => {
    fx = makeNestedFixture();
    // A marker for `sess`/backlog lives in the INNER installation only. If --at correctly
    // anchors there, mediate-check reads it and PERMITS; a no-op/wrong --at would find no
    // marker and refuse — so PERMIT is what actually proves the anchor (not a default refuse).
    enterFrontDoor(fx.installationRoot, 'sess', 'backlog');
    const before = snapshotOutsideInstallation(fx);
    const result = mediateCheck(
      ['--surface', 'bash', '--identity', 'backlog list', '--session', 'sess', '--at', fx.installationRoot],
      { resolveActive: (at, session) => activeCapabilities(at, session) },
    );
    expect(result.code).toBe(0); // permit — proves --at resolved the nested install + read its marker
    expect(diffSnapshots(before, snapshotOutsideInstallation(fx))).toEqual([]);
  });
});

// 036 T126 — BOUND the declared machine-local exception (FR-008 / SC-001).
//
// The rows above prove the OUTER tree is byte-identical. 036's identity writes
// are the ONE sanctioned exception to "nothing outside the installation": they
// land in the MACHINE-LOCAL durable store, never the tree. Each op below asserts
// the exception is (a) real + exercised — the write reaches the machine-local
// store — and (b) bounded on every other axis: the outer tree, the real `$HOME`
// (tripwire), and the installation tree all receive NOTHING. The ops table + the
// per-op bound assertions live in `_machine-local-exception-probe.ts` to keep
// this file under the line cap; this describe drives them under the same
// per-test machine-state redirect every other row uses.
describe('036 machine-local exception (T126/FR-008/SC-001) — the ONLY sanctioned outside-tree write, bounded', () => {
  it.each(MACHINE_LOCAL_OPS.map((op) => [op.name, op] as const))(
    '%s lands in the machine-local store; outer tree, $HOME, and installation tree receive nothing',
    async (_name, op) => {
      const store: MachineStateStore = machineStore();
      const fixture = makeNestedFixture();
      try {
        await assertMachineLocalExceptionBound(op, fixture, store);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );
});
