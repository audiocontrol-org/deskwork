/**
 * plugins/dw-lifecycle/src/scope-discovery/mediation/cluster-candidates.ts
 *
 * Phase 11 Task 3 — cluster raw per-agent findings into architectural-
 * scale candidate classes.
 *
 * # Algorithm
 *
 * Shape-similarity clustering via Jaccard similarity over character
 * n-grams of the matched excerpt. Default threshold 0.7 (per Phase 11
 * Task 3 pre-made decision #1).
 *
 * Steps:
 *   1. For each input finding, extract a "shape token" — the verbatim
 *      matched excerpt (trimmed). For multi-hit findings (e.g., a
 *      regex with many hits), each hit becomes its own input.
 *   2. Compute the character-trigram set for each excerpt
 *      (configurable via ClusteringConfig.ngramSize).
 *   3. Greedy single-pass clustering: walk inputs in stable order; for
 *      each input, find the first existing cluster whose centroid
 *      Jaccard-similarity to the input exceeds threshold. If none,
 *      open a new cluster. Centroid = union of member n-grams.
 *   4. Per cluster, synthesize a 1-2 sentence summary from member
 *      count + representative excerpt + provenance distribution.
 *
 * # Why greedy single-pass, not k-means
 *
 * - The input size (a few hundred findings per scan run) doesn't
 *   warrant the cost of full distance-matrix clustering.
 * - Determinism: stable input order → deterministic cluster ids. The
 *   manifest's `discovered_candidates:` section can be diffed across
 *   scan runs (same code state → same clusters).
 * - The orchestrator's call site already has an LLM-judge step (Phase
 *   11 Task 7) for high-precision shape grouping when needed; this
 *   handler's job is to bound the candidate count to a triage-able
 *   set, not to produce optimal groupings.
 *
 * # Determinism contract
 *
 * Cluster ids are stable: `cluster-<index>` where index is the order
 * the cluster was first opened during the greedy pass. Member order
 * within a cluster preserves input order. The synthesized summary is
 * deterministic given the inputs + config (no timestamps, no
 * randomness).
 *
 * # Purity
 *
 * No FS / no network / no module-level state. Pure over the inputs.
 */

import type {
  DiscoveryAgentFinding,
  PatternFinding,
  PatternHit,
} from '../discovery-agents/types.js';
import {
  type Candidate,
  type CandidateMember,
  type ClusteringConfig,
  DEFAULT_CLUSTERING_CONFIG,
} from './mediation-types.js';

/**
 * Internal: one input to the clusterer — one finding-hit pair. Multi-
 * hit findings are exploded into one input per hit so each member's
 * file/line is preserved through clustering.
 */
interface ClusterInput {
  readonly member: CandidateMember;
  readonly ngrams: ReadonlySet<string>;
}

/**
 * Internal: cluster under construction. Members + centroid n-gram
 * union; final shape is folded into a `Candidate` at the end.
 */
interface InternalCluster {
  readonly index: number;
  readonly members: CandidateMember[];
  readonly centroid: Set<string>;
  /** First member's excerpt; used as the cluster's representative. */
  readonly representativeExcerpt: string;
}

/**
 * Compute the character-n-gram set for a string. Trims whitespace at
 * both ends, lower-cases, and slides a window of size `n`. Returns a
 * Set for cheap intersection / union ops.
 *
 * For strings shorter than `n` we return a set containing the string
 * itself padded with spaces — every short excerpt still produces a
 * fingerprint that can be compared.
 */
export function ngrams(text: string, n: number): ReadonlySet<string> {
  if (n <= 0) {
    throw new Error(`cluster-candidates: ngramSize must be > 0; got ${n}`);
  }
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) {
    return new Set();
  }
  if (normalized.length < n) {
    return new Set([normalized.padEnd(n, ' ')]);
  }
  const out = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i++) {
    out.add(normalized.slice(i, i + n));
  }
  return out;
}

/**
 * Jaccard similarity = |A ∩ B| / |A ∪ B|. Range [0, 1]. Returns 0
 * when both inputs are empty (no overlap defined). The cluster pass
 * checks > threshold so an empty-vs-empty comparison correctly NEVER
 * joins (avoids the "everything empty clusters together" degeneracy).
 */
export function jaccard(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const token of smaller) {
    if (larger.has(token)) intersection++;
  }
  const unionSize = a.size + b.size - intersection;
  if (unionSize === 0) return 0;
  return intersection / unionSize;
}

/**
 * Project DiscoveryAgentFinding[] into the clusterer's flat input
 * shape. Only PatternFinding-bearing agents contribute (ast-grep-
 * matrix is the primary source); the other agents (ui-route-
 * enumerator, clone-detector-reader, prd-themed-pattern-hunter,
 * regime-holdout-detector, adopter-manifest-checker) have their own
 * candidate-clustering paths that share the same `Candidate` output
 * shape but ingest different finding types.
 *
 * For each PatternFinding's hits, one ClusterInput is emitted. Multi-
 * hit findings expand to multiple inputs so each member carries its
 * own file/line.
 *
 * The mediation library is the single place where the discriminated-
 * union finding shape collapses into a uniform clustering input — the
 * call site (scope-inventory) doesn't dispatch on agent type.
 */
function projectPatternFindings(
  findings: ReadonlyArray<DiscoveryAgentFinding>,
  config: ClusteringConfig,
): ReadonlyArray<ClusterInput> {
  const out: ClusterInput[] = [];
  for (const f of findings) {
    if (f.agent !== 'ast-grep-matrix') continue;
    for (const pattern of f.patterns) {
      const provenance = pattern.provenance;
      for (const hit of pattern.hits) {
        const member = projectHitToMember(hit, provenance);
        const memberNgrams = ngrams(member.excerpt, config.ngramSize);
        out.push({ member, ngrams: memberNgrams });
      }
    }
  }
  return out;
}

function projectHitToMember(
  hit: PatternHit,
  provenance: PatternFinding['provenance'],
): CandidateMember {
  const base = {
    file: hit.file,
    excerpt: hit.snippet.trim(),
    provenance,
  };
  return hit.line > 0
    ? { ...base, line: hit.line }
    : base;
}

/**
 * Stable deterministic cluster id. Format `cluster-<index>` so re-runs
 * against the same findings produce the same ids. The index is the
 * cluster-open order in the greedy pass; this is deterministic over
 * the input order.
 */
function clusterId(index: number): string {
  return `cluster-${String(index).padStart(4, '0')}`;
}

/**
 * Greedy single-pass clustering. For each input, find the first
 * existing cluster whose centroid Jaccard-similarity exceeds the
 * threshold; if none, open a new cluster.
 */
function greedyCluster(
  inputs: ReadonlyArray<ClusterInput>,
  config: ClusteringConfig,
): ReadonlyArray<InternalCluster> {
  const clusters: InternalCluster[] = [];
  for (const input of inputs) {
    let placed = false;
    for (const cluster of clusters) {
      const similarity = jaccard(input.ngrams, cluster.centroid);
      if (similarity >= config.jaccardThreshold) {
        cluster.members.push(input.member);
        // Update centroid = union of all member n-grams (mutable set;
        // owned by the cluster).
        for (const token of input.ngrams) cluster.centroid.add(token);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const newCluster: InternalCluster = {
        index: clusters.length,
        members: [input.member],
        centroid: new Set(input.ngrams),
        representativeExcerpt: input.member.excerpt,
      };
      clusters.push(newCluster);
    }
  }
  return clusters;
}

/**
 * Synthesize a 1-2 sentence operator-readable summary for one cluster.
 * The orchestrator-agent (Phase 11 Task 7 LLM-judge wiring) may
 * replace this with a richer description; this is the deterministic
 * fallback that ships with the pure-compute layer.
 */
function summarizeCluster(cluster: InternalCluster): string {
  const memberCount = cluster.members.length;
  const fileSet = new Set<string>();
  for (const m of cluster.members) fileSet.add(m.file);
  const fileCount = fileSet.size;
  const provenanceCounts: Record<string, number> = {};
  for (const m of cluster.members) {
    if (m.provenance !== undefined) {
      provenanceCounts[m.provenance] = (provenanceCounts[m.provenance] ?? 0) + 1;
    }
  }
  const provenanceList = Object.entries(provenanceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source}:${count}`)
    .join(', ');
  // Cap the representative excerpt at 80 chars so multi-line
  // matches collapse to a single-line summary.
  const excerpt =
    cluster.representativeExcerpt.length > 80
      ? cluster.representativeExcerpt.slice(0, 77) + '...'
      : cluster.representativeExcerpt;
  if (provenanceList.length === 0) {
    return (
      `${memberCount} matches across ${fileCount} file(s). ` +
      `Representative shape: "${excerpt}".`
    );
  }
  return (
    `${memberCount} matches across ${fileCount} file(s); ` +
    `provenance distribution: ${provenanceList}. ` +
    `Representative shape: "${excerpt}".`
  );
}

/**
 * Fold an InternalCluster into the public `Candidate` shape, including
 * the deterministic id + the n-gram fingerprint + the summary.
 */
function finalizeCluster(cluster: InternalCluster): Candidate {
  return {
    id: clusterId(cluster.index),
    shapeFingerprint: Array.from(cluster.centroid).sort(),
    representativeExcerpt: cluster.representativeExcerpt,
    members: cluster.members,
    summary: summarizeCluster(cluster),
  };
}

/**
 * Public clustering entry point. Walks raw findings, clusters by
 * shape similarity, returns the public Candidate[] shape.
 *
 * The clustering is PURE — no FS, no network, no module-level state.
 * Re-running with the same inputs + config produces the same output.
 *
 * @param findings — raw per-agent findings; ast-grep-matrix is the
 *                   primary source. Other agents' candidates are
 *                   surfaced via dedicated paths (clone-detector-
 *                   reader emits its own cluster-like groups; this
 *                   clusterer ignores them to preserve the
 *                   single-responsibility shape).
 * @param config   — optional tuning. Defaults per Phase 11 Task 3.
 * @returns Candidate[] — clusters with >= minClusterSize members,
 *                        sorted by cluster id (== creation order).
 */
export function clusterCandidates(
  findings: ReadonlyArray<DiscoveryAgentFinding>,
  config: ClusteringConfig = DEFAULT_CLUSTERING_CONFIG,
): ReadonlyArray<Candidate> {
  if (config.jaccardThreshold <= 0 || config.jaccardThreshold > 1) {
    throw new Error(
      `cluster-candidates: jaccardThreshold must be in (0, 1]; ` +
        `got ${config.jaccardThreshold}`,
    );
  }
  if (config.minClusterSize < 1) {
    throw new Error(
      `cluster-candidates: minClusterSize must be >= 1; ` +
        `got ${config.minClusterSize}`,
    );
  }
  const inputs = projectPatternFindings(findings, config);
  const clusters = greedyCluster(inputs, config);
  const finalized: Candidate[] = [];
  for (const c of clusters) {
    if (c.members.length < config.minClusterSize) continue;
    finalized.push(finalizeCluster(c));
  }
  return finalized;
}
