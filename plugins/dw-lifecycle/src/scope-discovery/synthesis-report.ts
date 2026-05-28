/**
 * plugins/dw-lifecycle/src/scope-discovery/synthesis-report.ts
 *
 * Inventory-vs-discovery report rendering (inventory vs. discovery surfacing). Splits the
 * synthesized manifest's findings into three operator-visible categories
 * (registered-pattern match, discovered candidate, novel-shape candidate)
 * + renders a markdown fragment the scope-inventory + synthesis-cli
 * surfaces splice into `synthesis.md`. Pairs with `renderSynthesizerNotes`
 * from synthesis-cli.ts; this module owns the category breakdown so the
 * synthesis-cli stays focused on argv/IO.
 *
 * The categories close the operator-trust failure mode named in the
 * the scope-discovery acceptance criterion criteria: a green discovery report read as
 * evidence-of-no-novel-anti-patterns when it is really evidence of
 * no-already-registered matches. The report MUST distinguish the two
 * so the operator can read it correctly.
 *
 * Pure computation — no FS, no network. The category breakdown derives
 * entirely from the in-memory `ScopeManifest`; callers handle persistence.
 */

import type {
  ManifestRegimeHoldoutEntry,
  ScopeManifest,
} from './synthesis-types.js';

/**
 * Per-category counts the report surfaces. Per the agent fleet split
 * documented at `discovery-agents/README.md`:
 *
 *   - `registeredPattern` — findings whose `status_provenance.provenance_
 *     source` is `operator-authored` / `install-seed` AND
 *     `source_status` is `blessed` / `cursed`. These are the registry-
 *     authored shapes the scanner matched; the things the catalog said
 *     to look for.
 *   - `discoveredCandidate` — entries under `discovered_candidates:` on
 *     the manifest. Surfaced by the orchestrator-agent mediation layer
 *     (orchestrator-agent mediation); architectural-scale candidate clusters that
 *     the catalog doesn't currently cover.
 *   - `novelShapeCandidate` — findings whose `status_provenance.provenance_
 *     source` is `orchestrator-agent` / `llm-judge-proposed` /
 *     `promoted-from-candidate`, OR whose `source_status` is `pending`
 *     (not yet operator-blessed). These are per-handler novel-shape
 *     signals that need triage to a stable disposition.
 */
export interface FindingCategoryCounts {
  readonly registeredPattern: number;
  readonly discoveredCandidate: number;
  readonly novelShapeCandidate: number;
}

/** Per-bucket category split (anti-patterns / adopter-manifests / etc.). */
export interface PerBucketCategoryCounts {
  readonly anti_patterns: FindingCategoryCounts;
  readonly adopter_manifests: FindingCategoryCounts;
  readonly editor_symmetry: FindingCategoryCounts;
  readonly deprecations: FindingCategoryCounts;
}

/** Top-level breakdown of a manifest's findings into the three categories. */
export interface FindingCategoryBreakdown {
  readonly totals: FindingCategoryCounts;
  readonly perBucket: PerBucketCategoryCounts;
  /** Cluster count from `discovered_candidates:`; 0 when absent. */
  readonly discoveredCandidatesClusterCount: number;
  /**
   * `regime_holdouts.meta.by_status.candidate` — sum across buckets of
   * findings whose source-status was `pending` when the scan ran. Loop-
   * surface candidates pending operator triage.
   */
  readonly pendingMetaCount: number;
}

/** Mutable internal counter; converted to a readonly view before return. */
interface MutableCounts {
  registeredPattern: number;
  discoveredCandidate: number;
  novelShapeCandidate: number;
}

function emptyMutable(): MutableCounts {
  return { registeredPattern: 0, discoveredCandidate: 0, novelShapeCandidate: 0 };
}

function freezeCounts(m: MutableCounts): FindingCategoryCounts {
  return {
    registeredPattern: m.registeredPattern,
    discoveredCandidate: m.discoveredCandidate,
    novelShapeCandidate: m.novelShapeCandidate,
  };
}

function bumpRegisteredOrNovel(target: MutableCounts, category: Category): void {
  if (category === 'registered-pattern') {
    target.registeredPattern += 1;
  } else {
    target.novelShapeCandidate += 1;
  }
}

/**
 * Walks the manifest's regime-holdout sections + `discovered_candidates:`
 * and bins every finding into one of the three operator-visible
 * categories. The category-key derivation honors the rules in
 * `discovery-agents/README.md`:
 *
 *   - `provenance_source` of `orchestrator-agent` / `llm-judge-proposed`
 *     / `promoted-from-candidate` always means novel-shape candidate
 *     regardless of source-status (the source is agent-derived, not
 *     operator-authored).
 *   - Otherwise, `source_status` of `pending` means novel-shape
 *     candidate (operator-authored or install-seed but not yet
 *     triaged).
 *   - Otherwise (blessed/cursed + operator-authored/install-seed),
 *     the finding is a registered-pattern match.
 */
export function categorizeFindings(manifest: ScopeManifest): FindingCategoryBreakdown {
  const totals = emptyMutable();
  const antiPatterns = emptyMutable();
  const adopterManifests = emptyMutable();
  const editorSymmetry = emptyMutable();
  const deprecations = emptyMutable();

  const rh = manifest.regime_holdouts;
  if (rh !== undefined) {
    for (const e of rh.anti_patterns) {
      const cat = categoryFor(e);
      bumpRegisteredOrNovel(totals, cat);
      bumpRegisteredOrNovel(antiPatterns, cat);
    }
    for (const e of rh.adopter_manifests) {
      const cat = categoryFor(e);
      bumpRegisteredOrNovel(totals, cat);
      bumpRegisteredOrNovel(adopterManifests, cat);
    }
    for (const e of rh.editor_symmetry) {
      const cat = categoryFor(e);
      bumpRegisteredOrNovel(totals, cat);
      bumpRegisteredOrNovel(editorSymmetry, cat);
    }
    for (const e of rh.deprecations) {
      const cat = categoryFor(e);
      bumpRegisteredOrNovel(totals, cat);
      bumpRegisteredOrNovel(deprecations, cat);
    }
  }

  const dc = manifest.discovered_candidates;
  const discoveredCandidatesClusterCount = dc !== undefined ? dc.length : 0;
  totals.discoveredCandidate = discoveredCandidatesClusterCount;
  // Per-bucket discovered-candidate count is not meaningful (mediation
  // clusters span buckets); leave the per-bucket field at 0 — totals
  // carry the count.

  const pendingMetaCount = rh !== undefined ? rh.meta.by_status.candidate : 0;

  return {
    totals: freezeCounts(totals),
    perBucket: {
      anti_patterns: freezeCounts(antiPatterns),
      adopter_manifests: freezeCounts(adopterManifests),
      editor_symmetry: freezeCounts(editorSymmetry),
      deprecations: freezeCounts(deprecations),
    },
    discoveredCandidatesClusterCount,
    pendingMetaCount,
  };
}

type Category = 'registered-pattern' | 'novel-shape-candidate';

function categoryFor(e: ManifestRegimeHoldoutEntry): Category {
  const src = e.status_provenance.provenance_source;
  if (
    src === 'orchestrator-agent' ||
    src === 'llm-judge-proposed' ||
    src === 'promoted-from-candidate'
  ) {
    return 'novel-shape-candidate';
  }
  if (e.status_provenance.source_status === 'pending') {
    return 'novel-shape-candidate';
  }
  return 'registered-pattern';
}

/**
 * Render the category breakdown as a markdown fragment whose top-level
 * heading is `## Inventory vs. discovery — finding categories`. The
 * scope-inventory subcommand splices this BEFORE `## Synthesizer notes`
 * in `synthesis.md` so the operator's first-read of the file sees the
 * category breakdown.
 *
 * When the manifest has zero findings across all categories, the
 * fragment still emits the heading + a "clean — no findings" line so
 * the section's presence is invariant.
 */
export function renderFindingCategoryReport(
  manifest: ScopeManifest,
): string {
  const breakdown = categorizeFindings(manifest);
  const lines: string[] = [
    '## Inventory vs. discovery — finding categories',
    '',
    'A green run against registered patterns is NOT the same as "no novel ' +
      'anti-patterns." See discovery-agents/README.md for the inventory-vs-' +
      'discovery split; the categories below derive directly from each ' +
      "finding's status + provenance.",
    '',
  ];
  const t = breakdown.totals;
  const grand = t.registeredPattern + t.discoveredCandidate + t.novelShapeCandidate;
  if (grand === 0) {
    lines.push('clean — no findings across registered-pattern, discovered-candidate, or novel-shape-candidate buckets.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`- **Registered-pattern matches (inventory):** ${t.registeredPattern}`);
  lines.push(
    '  — status_provenance.provenance_source ∈ {operator-authored, install-seed} ' +
      'AND source_status ∈ {blessed, cursed}. The catalog said to look for ' +
      'these shapes; the scanner found them.',
  );
  lines.push(
    `- **Discovered candidates (architectural; from \`discovered_candidates:\`):** ${t.discoveredCandidate}`,
  );
  lines.push(
    "  — mediation-layer clusters of raw findings the catalog doesn't " +
      'currently cover. Operator triages architecture-scale; orchestrator-' +
      'agent translates to line-level catalog edits.',
  );
  lines.push(
    `- **Novel-shape candidates (per-handler):** ${t.novelShapeCandidate}`,
  );
  lines.push(
    '  — per-handler findings whose provenance source is orchestrator-' +
      'agent / llm-judge-proposed / promoted-from-candidate, OR whose ' +
      'source-status is `pending`. Triage these into the relevant catalog ' +
      '(status: blessed / cursed / ignore) via `/dw-lifecycle:implement`' +
      "'s mediation flow.",
  );
  lines.push('');
  if (
    t.discoveredCandidate > 0 ||
    t.novelShapeCandidate > 0 ||
    breakdown.pendingMetaCount > 0
  ) {
    lines.push(
      `Operator action: review the ${t.discoveredCandidate} discovered ` +
        `candidate cluster(s) + ${t.novelShapeCandidate} novel-shape ` +
        `candidate finding(s) BEFORE treating this run as "all clear." ` +
        `A non-zero candidate count is the signal the catalog is not yet ` +
        `exhaustive.`,
    );
    lines.push('');
  }
  if (t.registeredPattern > 0 || t.novelShapeCandidate > 0) {
    lines.push('Per-bucket breakdown (registered-pattern matches / novel-shape candidates):');
    lines.push('');
    const b = breakdown.perBucket;
    lines.push(
      `- anti-patterns: ${b.anti_patterns.registeredPattern} / ${b.anti_patterns.novelShapeCandidate}`,
    );
    lines.push(
      `- adopter-manifests: ${b.adopter_manifests.registeredPattern} / ${b.adopter_manifests.novelShapeCandidate}`,
    );
    lines.push(
      `- editor-symmetry: ${b.editor_symmetry.registeredPattern} / ${b.editor_symmetry.novelShapeCandidate}`,
    );
    lines.push(
      `- deprecations: ${b.deprecations.registeredPattern} / ${b.deprecations.novelShapeCandidate}`,
    );
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Render the one-line stderr summary scope-inventory surfaces alongside
 * its existing `wrote ...` line. Format mirrors the existing
 * `kind=X, agents=N, ...` style so operators can grep / parse it.
 */
export function renderCategorySummaryLine(
  manifest: ScopeManifest,
): string {
  const b = categorizeFindings(manifest);
  return (
    `categories: registered-pattern=${b.totals.registeredPattern}, ` +
    `discovered-candidate=${b.totals.discoveredCandidate}, ` +
    `novel-shape-candidate=${b.totals.novelShapeCandidate}`
  );
}
