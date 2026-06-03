/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts
 *
 * Phase 11 acceptance criterion — KeygroupSummary-shape repro.
 *
 * The empirical signal that the Phase 11 self-correcting discovery loop
 * catches the gap that triggered the phase (audiocontrol issue #315). A
 * single end-to-end scenario simulates the dogfood pass:
 *
 *   STEP 1 — BEFORE state (inventory-only / Phase 1-10):
 *     Run `buildPatternMatrix` with the LEGACY built-in regex catalog
 *     only (no override file planted). Assert zero findings on
 *     KeygroupSummary.tsx. This is the gap — the file was always there;
 *     the catalog couldn't see it.
 *
 *   STEP 2 — AFTER state (Phase 11 loop active):
 *     Plant the Phase 11 polymorphic catalog (negative-space + outlier
 *     + coverage handlers) at the project override path. Re-run
 *     `buildPatternMatrix`. Assert AT LEAST ONE of the three new
 *     handlers fires on KeygroupSummary.tsx.
 *
 *   STEP 3 — Mediation:
 *     Feed the post-Phase-11 findings into `mediate()`. Assert the
 *     mediation library produces at least one cluster + an
 *     ArchitecturalSummary; project to the `discovered_candidates:`
 *     manifest section shape.
 *
 *   STEP 4 — Report rendering:
 *     Build a minimal ScopeManifest carrying the discovered candidates
 *     + a regime-holdout entry shaped to represent the negative-space
 *     finding; run `categorizeFindings` + `renderFindingCategoryReport`.
 *     Assert the discovered-candidate category surfaces with > 0 count
 *     in both the structured breakdown and the rendered markdown.
 *
 *   STEP 5 — Dogfood gap signal:
 *     Emit a `DOGFOOD GAP SIGNAL` block to stdout naming the before /
 *     after counts. Future regressions break the assertions above;
 *     this block is the human-readable indicator the operator (or a
 *     CI log reader) sees alongside.
 *
 * # Pre-made decisions
 *
 *   1. Fixture is SYNTHETIC — reproduces the SHAPE, not the bytes, of
 *      audiocontrol's real KeygroupSummary regression.
 *   2. No external LLM calls — the semantic handler / LLM-judge / external
 *      auditor steps are dry-run via parameter omission. The test pins
 *      the PATTERN-HANDLER outputs (the deterministic layer).
 *   3. Extra findings beyond the minimum expected = PASS (more discovery
 *      is better). Assertions use `>=` boundaries.
 *
 * # I/O surface
 *
 *   - mkdtemp tmpdir per test.
 *   - Plants fixture files via cp from
 *     `__tests__/scope-discovery/phase-11-acceptance/fixtures/keygroup-summary-repro/`.
 *   - Reads back the rendered category report + emits the DOGFOOD GAP
 *     SIGNAL block to stdout (visible with `--reporter=verbose`).
 *   - No external network, no LLM dispatch.
 */

import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPatternMatrix } from '../../../scope-discovery/discovery-agents/pattern-matrix.js';
import { mediate, toManifestSection } from '../../../scope-discovery/mediation/mediation.js';
import {
  categorizeFindings,
  renderCategorySummaryLine,
  renderFindingCategoryReport,
} from '../../../scope-discovery/synthesis-report.js';
import type {
  AstGrepMatrixFindings,
  PatternFinding,
} from '../../../scope-discovery/discovery-agents/types.js';
import type {
  ManifestDiscoveredCandidate,
  ScopeManifest,
} from '../../../scope-discovery/synthesis-types.js';

const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'keygroup-summary-repro',
);

const OVERRIDE_REL =
  '.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml';

const FEATURE_SLUG = 'phase-11-acceptance';

/**
 * Plant the fixture's components/*.tsx files into a tmpdir + write a
 * synthetic PRD that references the `components` module so the
 * discovery agent's module-in-scope predicate matches.
 *
 * Returns the tmpdir absolute path. The override YAML is NOT planted
 * here — that's the BEFORE-vs-AFTER discriminator the test toggles.
 */
async function plantFixture(tmp: string): Promise<void> {
  await mkdir(join(tmp, 'components'), { recursive: true });
  for (const name of ['KeygroupSummary.tsx', 'HealthySummary.tsx', 'SiblingPanel.tsx']) {
    await cp(join(FIXTURE_DIR, 'components', name), join(tmp, 'components', name));
  }
  // Synthetic PRD — references `components` so modulesInScopeForFeature
  // narrows to that module. The text body is intentionally short.
  const prd = [
    '# Phase 11 acceptance — KeygroupSummary repro',
    '',
    'This synthetic feature exercises the `components` module to surface',
    'the KeygroupSummary-shape regression from audiocontrol issue #315.',
    '',
  ].join('\n');
  await writeFile(join(tmp, 'prd.md'), prd, 'utf8');
}

/**
 * Plant the override YAML at the dw-lifecycle path. Called only for the
 * AFTER state to demonstrate the catalog edit that closes the gap.
 */
async function plantPhase11Catalog(tmp: string): Promise<void> {
  const overridePath = join(tmp, OVERRIDE_REL);
  await mkdir(dirname(overridePath), { recursive: true });
  await cp(
    join(FIXTURE_DIR, 'pattern-matrix-patterns.yaml'),
    overridePath,
  );
}

/**
 * Filter a PatternFinding's hits to those that touch the
 * KeygroupSummary.tsx file. Used by the BEFORE / AFTER counters so the
 * dogfood-gap signal reports a per-file delta rather than a global
 * count (a global delta could be skewed by the legacy regex catalog
 * matching unrelated junk).
 */
function hitsOnKeygroupSummary(findings: AstGrepMatrixFindings): ReadonlyArray<{
  readonly patternId: string;
  readonly patternType: PatternFinding['provenance'];
  readonly file: string;
  readonly snippet: string;
}> {
  const out: Array<{
    patternId: string;
    patternType: PatternFinding['provenance'];
    file: string;
    snippet: string;
  }> = [];
  for (const pattern of findings.patterns) {
    for (const hit of pattern.hits) {
      if (hit.file.endsWith('KeygroupSummary.tsx')) {
        out.push({
          patternId: pattern.id,
          patternType: pattern.provenance,
          file: hit.file,
          snippet: hit.snippet,
        });
      }
    }
  }
  // Coverage handlers emit metrics rather than hits. Surface them when
  // the ratio is < 1 (the dogfood signal: not all components consume
  // the canonical primitive).
  for (const pattern of findings.patterns) {
    if (pattern.metrics?.['ratio'] !== undefined && pattern.metrics['ratio'] < 1) {
      out.push({
        patternId: pattern.id,
        patternType: pattern.provenance,
        file: 'components/* (directory-level coverage metric)',
        snippet: `coverage ratio = ${pattern.metrics['ratio']} (numerator=${pattern.metrics['numerator']}, denominator=${pattern.metrics['denominator']})`,
      });
    }
  }
  return out;
}

/**
 * Build a minimal ScopeManifest carrying the AFTER-state findings as
 * `regime_holdouts.anti_patterns` + `discovered_candidates`. The shape
 * mirrors what `synthesis-derive` would produce given the same inputs;
 * we synthesize directly here to avoid coupling the acceptance test to
 * the synthesis pipeline's internals.
 */
function buildAcceptanceManifest(args: {
  readonly keygroupHits: ReadonlyArray<{
    readonly patternId: string;
    readonly patternType: PatternFinding['provenance'];
    readonly file: string;
    readonly snippet: string;
  }>;
  readonly discoveredCandidates: ReadonlyArray<ManifestDiscoveredCandidate>;
}): ScopeManifest {
  // Project each handler hit on KeygroupSummary into a regime-holdout
  // entry; preserve the provenance so categorizeFindings routes them
  // correctly (operator-authored, source_status=blessed → registered-
  // pattern match; orchestrator-agent-derived → novel-shape candidate).
  const antiPatterns = args.keygroupHits
    // Coverage entries don't represent a file-level violation (they're
    // a metric); exclude from the regime-holdout list.
    .filter((h) => h.patternType !== 'coverage-gap')
    .map((h) => ({
      id: h.patternId,
      file: h.file,
      shape: h.snippet,
      replacement: 'Consume the canonical design-system primitive.',
      evidence: {
        registry_path: OVERRIDE_REL,
        registry_id: h.patternId,
      },
      status_provenance: {
        source_status: 'blessed' as const,
        provenance_source: 'operator-authored' as const,
      },
    }));
  return {
    kind: 'code',
    feature_slug: FEATURE_SLUG,
    generated_by: 'curated',
    generated_at: '2026-05-26T12:00:00.000Z',
    scenarios: [],
    reference_docs: [],
    discovery_themes: [],
    regime_holdouts: {
      anti_patterns: antiPatterns,
      adopter_manifests: [],
      module_symmetry: [],
      deprecations: [],
      meta: {
        total: antiPatterns.length,
        by_source: {
          anti_pattern: antiPatterns.length,
          adopter_manifest: 0,
          module_symmetry: 0,
          deprecation: 0,
        },
        by_status: {
          actively_enforced: antiPatterns.length,
          candidate: 0,
        },
      },
    },
    discovered_candidates: args.discoveredCandidates,
  };
}

describe('Phase 11 acceptance — KeygroupSummary-shape repro (issue #315)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'phase-11-acceptance-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('end-to-end: BEFORE inventory-only is blind to the gap; AFTER Phase 11 loop catches it', async () => {
    await plantFixture(tmp);

    // ────────────────────────────────────────────────────────────────
    // STEP 1 — BEFORE: legacy regex-only catalog (Phase 1-10 state).
    // ────────────────────────────────────────────────────────────────
    const beforeFindings = await buildPatternMatrix({
      featureSlug: FEATURE_SLUG,
      prdPath: join(tmp, 'prd.md'),
      repoRoot: tmp,
      moduleRoot: '.',
    });
    const beforeKeygroupHits = hitsOnKeygroupSummary(beforeFindings);

    // The legacy regex catalog has no entry describing the canonical-
    // primitive-absence shape. Built-in patterns (as-type-cast, any-
    // annotation, ts-ignore-pragma, magic-number) MAY match unrelated
    // tokens but NONE of them captures "this file is in the expected-
    // adopter set yet consumes zero canonical primitives." The
    // assertion that pins the gap: ZERO of the four built-in regex
    // patterns target the negative-space / outlier / coverage shape.
    for (const hit of beforeKeygroupHits) {
      expect(hit.patternType).not.toBe('negative-space');
      expect(hit.patternType).not.toBe('outlier');
      expect(hit.patternType).not.toBe('coverage-gap');
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 2 — AFTER: plant the Phase 11 catalog + re-scan.
    // ────────────────────────────────────────────────────────────────
    await plantPhase11Catalog(tmp);
    const afterFindings = await buildPatternMatrix({
      featureSlug: FEATURE_SLUG,
      prdPath: join(tmp, 'prd.md'),
      repoRoot: tmp,
      moduleRoot: '.',
    });
    const afterKeygroupHits = hitsOnKeygroupSummary(afterFindings);

    // At least ONE of the three Phase 11 handlers must fire on the
    // KeygroupSummary repro file. The exact set may grow as the
    // catalog tightens — extra hits = PASS.
    const provenances = new Set(afterKeygroupHits.map((h) => h.patternType));
    const phase11Caught =
      provenances.has('negative-space') ||
      provenances.has('outlier') ||
      provenances.has('coverage-gap');
    expect(phase11Caught).toBe(true);

    // The negative-space pattern is the cheapest / most direct catch
    // (operator-named in PRD as the cheapest fix). It SHOULD fire on
    // the repro file. Pin it explicitly so a regression in that
    // handler surfaces here.
    const negativeSpaceHits = afterKeygroupHits.filter(
      (h) => h.patternType === 'negative-space',
    );
    expect(negativeSpaceHits.length).toBeGreaterThanOrEqual(1);
    expect(negativeSpaceHits[0]?.patternId).toBe(
      'editor-component-no-canonical-primitive',
    );

    // ────────────────────────────────────────────────────────────────
    // STEP 3 — Mediation: cluster findings + propose discovered_candidates.
    // ────────────────────────────────────────────────────────────────
    const mediation = mediate({ findings: [afterFindings] });
    expect(mediation.clusters.length).toBeGreaterThanOrEqual(1);
    expect(mediation.summaries.length).toBe(mediation.clusters.length);
    // Edits are null in PHASE 1 (cluster + summarize only); Phase 2
    // dispositions are an orchestrator-agent decision and out of scope
    // for the acceptance criterion's pattern-handler proof.
    expect(mediation.edits).toBeNull();

    const discoveredCandidates = toManifestSection(mediation.summaries);
    expect(discoveredCandidates.length).toBeGreaterThanOrEqual(1);
    // The cluster must surface the KeygroupSummary.tsx file as one of
    // its exemplars (proves the discovered-candidate signal traces back
    // to the actual offending file).
    const cluster0 = discoveredCandidates[0];
    expect(cluster0).toBeDefined();
    if (cluster0 === undefined) return;
    const exemplarMentionsKeygroup = cluster0.exemplar_files.some((f) =>
      f.endsWith('KeygroupSummary.tsx'),
    );
    expect(exemplarMentionsKeygroup).toBe(true);

    // ────────────────────────────────────────────────────────────────
    // STEP 4 — Report rendering: categorize + render the manifest.
    // ────────────────────────────────────────────────────────────────
    const manifest = buildAcceptanceManifest({
      keygroupHits: afterKeygroupHits,
      discoveredCandidates,
    });
    const breakdown = categorizeFindings(manifest);
    expect(breakdown.discoveredCandidatesClusterCount).toBeGreaterThanOrEqual(1);
    expect(breakdown.totals.discoveredCandidate).toBeGreaterThanOrEqual(1);

    const report = renderFindingCategoryReport(manifest);
    expect(report).toContain('## Inventory vs. discovery — finding categories');
    expect(report).toContain('Discovered candidates');
    // The report includes the per-bucket breakdown only when totals
    // contain registered-pattern or novel-shape entries. The negative-
    // space hit is recorded under regime_holdouts.anti_patterns with
    // status_provenance.source_status='blessed' + provenance_source=
    // 'operator-authored' → counts as a registered-pattern match.
    expect(breakdown.totals.registeredPattern).toBeGreaterThanOrEqual(1);

    const summaryLine = renderCategorySummaryLine(manifest);
    expect(summaryLine).toMatch(/categories: registered-pattern=\d+, discovered-candidate=\d+, novel-shape-candidate=\d+/);

    // ────────────────────────────────────────────────────────────────
    // STEP 5 — DOGFOOD GAP SIGNAL block.
    // ────────────────────────────────────────────────────────────────
    const before = {
      total: beforeKeygroupHits.length,
      phase11ProvenanceHits: beforeKeygroupHits.filter(
        (h) =>
          h.patternType === 'negative-space' ||
          h.patternType === 'outlier' ||
          h.patternType === 'coverage-gap',
      ).length,
    };
    const after = {
      total: afterKeygroupHits.length,
      phase11ProvenanceHits: afterKeygroupHits.filter(
        (h) =>
          h.patternType === 'negative-space' ||
          h.patternType === 'outlier' ||
          h.patternType === 'coverage-gap',
      ).length,
      negativeSpaceHits: afterKeygroupHits.filter(
        (h) => h.patternType === 'negative-space',
      ).length,
      outlierHits: afterKeygroupHits.filter((h) => h.patternType === 'outlier')
        .length,
      coverageHits: afterKeygroupHits.filter(
        (h) => h.patternType === 'coverage-gap',
      ).length,
      discoveredCandidateClusters: discoveredCandidates.length,
    };

    const lines: string[] = [
      '',
      '═══════════════════════════════════════════════════════════════',
      'DOGFOOD GAP SIGNAL — Phase 11 acceptance criterion',
      '  Source: audiocontrol issue #315 (KeygroupSummary-shape regression)',
      '═══════════════════════════════════════════════════════════════',
      'BEFORE (inventory-only / Phase 1-10):',
      `  ${before.phase11ProvenanceHits} findings on KeygroupSummary.tsx — the gap.`,
      `    (legacy regex catalog produced ${before.total} hit(s) on the file,`,
      `     none of them matching the canonical-primitive-absence shape)`,
      '',
      'AFTER (Phase 11 loop active):',
      `  ${after.phase11ProvenanceHits} findings on KeygroupSummary.tsx — the gap is now caught.`,
      `    - negative-space handler: ${after.negativeSpaceHits} hit(s)`,
      `    - outlier handler:        ${after.outlierHits} hit(s)`,
      `    - coverage handler:       ${after.coverageHits} hit(s)`,
      `    - mediation discovered-candidate clusters: ${after.discoveredCandidateClusters}`,
      '',
      `Synthesis-report categories: ${summaryLine}`,
      '═══════════════════════════════════════════════════════════════',
      '',
    ];
    for (const line of lines) {
      // eslint-disable-next-line no-console
      console.log(line);
    }

    // Final assertions on the dogfood-gap signal itself — these are
    // what break if a regression in Phase 11 erodes the catch:
    expect(before.phase11ProvenanceHits).toBe(0);
    expect(after.phase11ProvenanceHits).toBeGreaterThanOrEqual(1);
    expect(after.discoveredCandidateClusters).toBeGreaterThanOrEqual(1);
  });

  it('fixture KeygroupSummary.tsx has ZERO canonical-primitive imports + >= 14 utility-class hits', async () => {
    // Sanity test: the fixture itself reproduces the SHAPE the brief
    // names. If the fixture drifts (someone "fixes" the fixture without
    // realizing it's the bug-shape under test), this test catches it.
    await plantFixture(tmp);
    const offending = await import('node:fs').then((fs) =>
      fs.promises.readFile(join(tmp, 'components', 'KeygroupSummary.tsx'), 'utf8'),
    );
    // Strip line + block comments before pattern-matching — the file's
    // header comment legitimately *names* the canonical-primitive path
    // to explain why the file is the bug-shape under test, but the
    // canonical-primitive scanner runs against code, not prose.
    const codeOnly = offending
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Zero canonical-primitive imports (no `@/components/common/` or
    // `@audiocontrol/editor-core` references in actual code).
    expect(codeOnly).not.toMatch(/@\/components\/common\//);
    expect(codeOnly).not.toMatch(/@audiocontrol\/editor-core/);
    // >= 14 utility-class hits in the code body.
    const utilityRe =
      /\b(?:flex|grid|inline|absolute|relative|fixed|bg-[a-z0-9-]+|text-[a-z0-9-]+|p-[0-9]+|m-[0-9]+|border|border-[a-z0-9-]+|gap-[0-9]+)\b/g;
    const matches = codeOnly.match(utilityRe) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(14);
  });
});
