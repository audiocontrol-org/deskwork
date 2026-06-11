// AUDIT-20260611-10: scope-widen + scope-inventory WRITE under the
// resolved feature root (widen-run / inventory-run evidence dirs, the
// augmented PRD, the default --out manifest). Under the transitional
// cross-tree layout (specs/installation-isolation FR-008 feature-anchor
// exemption) that root can resolve at the derived git toplevel — OUTSIDE
// the installation — and `stackctl govern` announces that case once on
// stderr (R4/SC-006). The two scope verbs resolved the same way and
// emitted NOTHING: an adopter mid-transition running `--at
// <installation>` silently created files in the OUTER tree.
//
// Contract pinned here: right after the feature root resolves, when it
// lies outside the installation subtree, each verb emits EXACTLY ONE
// stderr line of the contracts' wording class:
//
//   <verb>: feature anchor outside the installation: <feature-root>
//   (designated anchor — artifacts land there)
//
// and stays silent when the feature root is inside the installation.
//
// Fixture: the nested isolation harness (outer git repo ⊃ installation).
// The feature docs live at the OUTER root for the announce rows (the
// transitional layout — primary resolution at the installation misses,
// the derived-toplevel legacy layer hits) and at the INSTALLATION for
// the symmetric negative rows. Code tree + clone baseline always live
// inside the installation (only the spec/docs anchor is cross-tree).

import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { synthesize } from '../scope-discovery/synthesis.js';
import type { DiscoveryAgentFinding } from '../scope-discovery/discovery-agents/types.js';
import { runCli } from './_run-helpers.js';
import { makeNestedFixture, type NestedFixture } from './_isolation-harness.js';

const SLUG = 'anchor-fixture';

const ANNOUNCEMENT = 'feature anchor outside the installation:';
const ANNOUNCEMENT_SUFFIX = '(designated anchor — artifacts land there)';

const PRD = [
  `# Feature: ${SLUG}`,
  '',
  '## Overview',
  '',
  'The widget module is the surface. widget widget widget.',
  '',
].join('\n');

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/**
 * Scaffold the feature for one row. The feature root (prd.md + — when
 * `withManifest` — a schema-valid prior scope-manifest.yaml, the
 * synthesize-based shape installation-isolation-probe.test.ts builds)
 * lands under `base`; the code tree with live pattern signal AND the
 * clone baseline always land under the INSTALLATION (the verbs scan
 * repoRoot = installation; only the docs anchor is cross-tree).
 */
async function scaffoldFeature(
  fixture: NestedFixture,
  base: 'outer' | 'installation',
  opts: { readonly withManifest: boolean },
): Promise<void> {
  const baseRoot =
    base === 'outer' ? fixture.outerRoot : fixture.installationRoot;
  const featureRoot = join(baseRoot, 'docs', '1.0', '001-IN-PROGRESS', SLUG);
  await mkdir(featureRoot, { recursive: true });
  const prdPath = join(featureRoot, 'prd.md');
  await writeFile(prdPath, PRD, 'utf8');

  const widgetDir = join(fixture.installationRoot, 'src', 'widget');
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

  // Seed the clone baseline inside the installation so the clone-
  // detector arm reads a legitimate empty baseline (scope-inventory has
  // no auto-seed; for scope-widen this also keeps the stderr under test
  // free of the US6 auto-seed announcement).
  const sdDir = join(fixture.installationRoot, '.stack-control', 'scope-discovery');
  await mkdir(sdDir, { recursive: true });
  await writeFile(
    join(sdDir, 'clones.yaml'),
    'schemaVersion: 1\ngenerated_at: "2026-06-11T00:00:00Z"\nclones: []\n',
    'utf8',
  );

  if (!opts.withManifest) return;
  const priorFindings: ReadonlyArray<DiscoveryAgentFinding> = [
    {
      agent: 'prd-themed-pattern-hunter',
      featureSlug: SLUG,
      themes: [
        {
          term: 'widget',
          occurrences: [{ file: 'src/widget/a.ts', line: 1, snippet: 'widget' }],
        },
      ],
    },
    {
      agent: 'ast-grep-matrix',
      featureSlug: SLUG,
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
    featureSlug: SLUG,
    findings: priorFindings,
    prdPath,
    prdRelPath: `docs/1.0/001-IN-PROGRESS/${SLUG}/prd.md`,
    moduleRoot: 'src',
  });
  await writeFile(
    join(featureRoot, 'scope-manifest.yaml'),
    stringifyYaml(priorOut.manifest),
    'utf8',
  );
}

function widenArgs(fixture: NestedFixture): string[] {
  return [
    'scope-widen',
    'gadget module is also affected by this change',
    '--slug',
    SLUG,
    '--at',
    fixture.installationRoot,
    '--evidence-trail',
    'off',
  ];
}

function inventoryArgs(fixture: NestedFixture): string[] {
  return [
    'scope-inventory',
    '--slug',
    SLUG,
    '--at',
    fixture.installationRoot,
    '--evidence-trail',
    'off',
  ];
}

describe('AUDIT-20260611-10 — scope verbs announce a cross-tree feature anchor', () => {
  it(
    'scope-widen announces ONCE when the feature root resolves outside the installation',
    async () => {
      const fixture = makeNestedFixture();
      try {
        await scaffoldFeature(fixture, 'outer', { withManifest: true });
        const res = runCli(widenArgs(fixture), { cwd: fixture.outerRoot });
        expect(res.status, `stderr:\n${res.stderr}`).toBe(0);
        expect(countOccurrences(res.stderr, ANNOUNCEMENT)).toBe(1);
        expect(res.stderr).toContain(`scope-widen: ${ANNOUNCEMENT}`);
        expect(res.stderr).toContain(ANNOUNCEMENT_SUFFIX);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );

  it(
    'scope-widen stays silent when the feature root is inside the installation',
    async () => {
      const fixture = makeNestedFixture();
      try {
        await scaffoldFeature(fixture, 'installation', { withManifest: true });
        const res = runCli(widenArgs(fixture), { cwd: fixture.outerRoot });
        expect(res.status, `stderr:\n${res.stderr}`).toBe(0);
        expect(res.stderr).not.toContain(ANNOUNCEMENT);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );

  it(
    'scope-inventory announces ONCE when the feature root resolves outside the installation',
    async () => {
      const fixture = makeNestedFixture();
      try {
        await scaffoldFeature(fixture, 'outer', { withManifest: false });
        const res = runCli(inventoryArgs(fixture), { cwd: fixture.outerRoot });
        expect(res.status, `stderr:\n${res.stderr}`).toBe(0);
        expect(countOccurrences(res.stderr, ANNOUNCEMENT)).toBe(1);
        expect(res.stderr).toContain(`scope-inventory: ${ANNOUNCEMENT}`);
        expect(res.stderr).toContain(ANNOUNCEMENT_SUFFIX);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );

  it(
    'scope-inventory stays silent when the feature root is inside the installation',
    async () => {
      const fixture = makeNestedFixture();
      try {
        await scaffoldFeature(fixture, 'installation', { withManifest: false });
        const res = runCli(inventoryArgs(fixture), { cwd: fixture.outerRoot });
        expect(res.status, `stderr:\n${res.stderr}`).toBe(0);
        expect(res.stderr).not.toContain(ANNOUNCEMENT);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );
});
