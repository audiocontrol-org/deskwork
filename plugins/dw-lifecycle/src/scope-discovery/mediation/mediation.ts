/**
 * plugins/dw-lifecycle/src/scope-discovery/mediation/mediation.ts
 *
 * orchestrator entry point. Composes the pure
 * computation pipeline:
 *
 *   raw findings → clusterCandidates() → Candidate[]
 *                          ↓
 *   per-cluster ArchitecturalSummary[] (operator-readable view)
 *                          ↓
 *   operator dispositions (one per cluster, architecture-scale)
 *                          ↓
 *   proposeCatalogEdits() → CatalogEditProposal[] (line-level edits)
 *
 * # Two-phase orchestration
 *
 * The mediation library is consumed in TWO phases by the call site:
 *
 *   PHASE 1 (cluster + summarize) — `mediate()` with no dispositions
 *     yet. Returns the clusters + architectural summaries for the
 *     operator-facing `discovered_candidates:` manifest section. The
 *     orchestrator surfaces the summaries to the operator (in chat
 *     or as a pending-decision artifact per the operator escalation surface).
 *
 *   PHASE 2 (propose edits) — operator returns dispositions; the
 *     call site invokes `proposeCatalogEdits()` directly with the
 *     same clusters + the dispositions. The cluster ids are stable
 *     across the two phases (deterministic from inputs) so the
 *     operator's disposition references resolve correctly.
 *
 * # Purity
 *
 * State + I/O live at the call site:
 *   - scope-inventory reads raw findings + writes the manifest's
 *     `discovered_candidates:` section.
 *   - `/dw-lifecycle:implement` applies the proposed edits to the
 *     catalog YAML files.
 *
 * This module is pure compute: clustering, summarization, edit
 * proposal generation.
 */

import type { DiscoveryAgentFinding } from '../discovery-agents/types.js';
import {
  type ArchitecturalSummary,
  type Candidate,
  type CatalogEditProposal,
  type ClusteringConfig,
  type DispositionInput,
  type ExistingCatalogEntry,
  DEFAULT_CLUSTERING_CONFIG,
} from './mediation-types.js';
import { clusterCandidates } from './cluster-candidates.js';
import { proposeCatalogEdits } from './propose-catalog-edits.js';

/**
 * Input to `mediate`. PHASE 1 callers (cluster + summarize only) omit
 * `dispositions`; PHASE 2 callers (propose edits) pass dispositions +
 * `existingEntries` + `now` + `addedIn`.
 */
export interface MediationInput {
  readonly findings: ReadonlyArray<DiscoveryAgentFinding>;
  readonly clusteringConfig?: ClusteringConfig;
  /**
   * Operator's architectural dispositions per cluster. Optional —
   * PHASE 1 callers pass none and inspect `clusters` + `summaries`.
   */
  readonly dispositions?: ReadonlyArray<DispositionInput>;
  /**
   * Existing catalog entries projected to the mediation shape. Used
   * by `proposeCatalogEdits` to decide novelty vs refinement.
   * Required when `dispositions` is present.
   */
  readonly existingEntries?: ReadonlyArray<ExistingCatalogEntry>;
  /** ISO-8601 timestamp for new entries' `provenance.authored_at`. */
  readonly now?: string;
  /**
   * Git short-sha for `added_in:` / `introduced_in:` fields. Required
   * when `dispositions` is present.
   */
  readonly addedIn?: string;
}

/**
 * Output of `mediate`. PHASE 1 callers consume `clusters` + `summaries`;
 * PHASE 2 callers consume `edits` (and may verify `clusters` is
 * unchanged across phases — same inputs produce the same clusters).
 *
 * `edits` is `null` when no dispositions were supplied (PHASE 1).
 */
export interface MediationOutput {
  readonly clusters: ReadonlyArray<Candidate>;
  readonly summaries: ReadonlyArray<ArchitecturalSummary>;
  readonly edits: ReadonlyArray<CatalogEditProposal> | null;
}

/**
 * Synthesize the architectural-summary view for a cluster. The text
 * is the cluster's own summary by default; the orchestrator-agent
 * may replace this with an LLM-judge-rewritten version (the orchestrator loop
 * Task 7).
 *
 * `exemplarFiles` surfaces the first three (deterministic, sorted)
 * file paths so the operator has a navigation landmark without
 * scrolling through `members`.
 */
function summarizeArchitectural(cluster: Candidate): ArchitecturalSummary {
  const files = Array.from(new Set(cluster.members.map((m) => m.file))).sort();
  return {
    clusterId: cluster.id,
    text: cluster.summary,
    memberCount: cluster.members.length,
    exemplarFiles: files.slice(0, 3),
  };
}

/**
 * Public mediation entry point. Pure over inputs.
 *
 * PHASE 1 invocation (cluster + summarize):
 *
 *   const out = mediate({ findings });
 *   // out.clusters + out.summaries surfaced to operator; out.edits === null
 *
 * PHASE 2 invocation (propose edits):
 *
 *   const out = mediate({
 *     findings,                     // SAME findings as PHASE 1
 *     dispositions: operatorPicks,  // one per cluster
 *     existingEntries: projected,   // current catalog state
 *     now: '2026-05-26T12:00:00Z',
 *     addedIn: 'abc1234',
 *   });
 *   // out.edits is the line-level proposal set
 */
export function mediate(input: MediationInput): MediationOutput {
  const config = input.clusteringConfig ?? DEFAULT_CLUSTERING_CONFIG;
  const clusters = clusterCandidates(input.findings, config);
  const summaries = clusters.map(summarizeArchitectural);
  if (input.dispositions === undefined || input.dispositions.length === 0) {
    return { clusters, summaries, edits: null };
  }
  if (input.existingEntries === undefined) {
    throw new Error(
      'mediate: dispositions supplied without `existingEntries`. ' +
        'Phase 2 callers must supply the projected existing-catalog ' +
        'entries so propose-catalog-edits can decide novelty vs refinement.',
    );
  }
  if (input.now === undefined || input.now.length === 0) {
    throw new Error(
      'mediate: dispositions supplied without `now`. Phase 2 callers ' +
        'must supply an ISO-8601 timestamp for the proposed entry`s ' +
        'provenance.authored_at field.',
    );
  }
  if (input.addedIn === undefined || input.addedIn.length === 0) {
    throw new Error(
      'mediate: dispositions supplied without `addedIn`. Phase 2 ' +
        'callers must supply a git short-sha for the new entry`s ' +
        '`added_in:` / `introduced_in:` field.',
    );
  }
  const edits = proposeCatalogEdits({
    clusters,
    dispositions: input.dispositions,
    existingEntries: input.existingEntries,
    now: input.now,
    addedIn: input.addedIn,
  });
  return { clusters, summaries, edits };
}

/**
 * Surface for the manifest's `discovered_candidates:` section.
 * `scope-inventory` calls this after synthesis to produce the
 * operator-facing wire shape, sidesteps the full `mediate` output to
 * keep manifest emission concise.
 *
 * Field shape mirrors the manifest schema's `discovered_candidates:`
 * array — one entry per cluster with the architectural summary +
 * member count + exemplar files.
 */
export interface DiscoveredCandidatesManifestEntry {
  readonly cluster_id: string;
  readonly summary: string;
  readonly member_count: number;
  readonly exemplar_files: ReadonlyArray<string>;
}

/**
 * Produce the manifest-section shape from the architectural summaries.
 * Pure; the call site writes the result into the scope-manifest.yaml's
 * `discovered_candidates:` section.
 */
export function toManifestSection(
  summaries: ReadonlyArray<ArchitecturalSummary>,
): ReadonlyArray<DiscoveredCandidatesManifestEntry> {
  return summaries.map((s) => ({
    cluster_id: s.clusterId,
    summary: s.text,
    member_count: s.memberCount,
    exemplar_files: s.exemplarFiles,
  }));
}
