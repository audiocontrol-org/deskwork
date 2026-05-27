/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/synthesis-discovered-candidates.ts
 *
 * Synthesis-layer unmatched-shape clustering pass — Phase 11 G5 STUB.
 *
 * STATUS: stub-shipped in v1.1 Task 1. The TYPE + invocation site are
 * complete; the clustering algorithm itself returns an empty list
 * with a one-time stderr advisory naming the deferral. The algorithm
 * lands under the GH issue cross-referenced below.
 *
 * # What the real implementation will do
 *
 * After all registered pattern handlers (regex / negative-space /
 * coverage / outlier / semantic) run, this pass groups files whose
 * content shape was NOT matched by any registered pattern, by
 * similarity. The output is a list of `DiscoveredCandidateCluster`
 * with bag-of-words / n-gram summaries; the synthesis layer surfaces
 * each cluster above the frequency threshold as a `discovered_candidate`
 * in the manifest (the operator decides whether to author a pattern
 * for it).
 *
 * Tracking issue: https://github.com/audiocontrol-org/deskwork/issues/318
 *
 * Algorithmic specs the real implementation must satisfy (from
 * audiocontrol issue #315; the tracking issue #318 carries the full
 * spec + acceptance criteria):
 *   - n-gram overlap or shingled hashing (MinHash) over token
 *     composition;
 *   - frequency threshold to suppress one-off shapes;
 *   - rank by cluster size + cluster-distinctiveness from the
 *     blessed-shape vocabulary;
 *   - the operator-facing "discovered_candidates" section of the
 *     scope-manifest is the destination.
 *
 * # Why the stub here
 *
 * The Phase 11 Task 1 dispatch ships the polymorphic dispatcher;
 * the clustering algorithm is its own non-trivial piece of work
 * (token-vocabulary modeling + clustering + ranking + threshold
 * tuning). Shipping a stub keeps the wire-format forward-compatible
 * (the manifest's `discovered_candidates` field is reserved + always
 * emitted, may be empty) while the algorithm lands separately.
 */

import type { PatternFinding } from './types.js';
import type { SourceFileView } from './shared.js';
import type { DiscoveredCandidateCluster } from './types.js';

let warnedOnce = false;

function warnOnce(): void {
  if (warnedOnce) return;
  warnedOnce = true;
  // Stderr advisory so the operator running scope-inventory sees the
  // stub explicitly. Not a throw — the dispatcher continues with the
  // pattern-handler findings unaffected.
  process.stderr.write(
    'pattern-matrix: unmatched-shape clustering pass is a STUB ' +
      '(Phase 11 G5; tracking #318). The polymorphic dispatcher is ' +
      'shipped; the clustering algorithm lands under issue #318. ' +
      'discovered_candidates returns [] until then.\n',
  );
}

export interface ClusterUnmatchedShapesInput {
  /** All in-scope source files (already read into views). */
  readonly scans: ReadonlyArray<SourceFileView>;
  /** Findings produced by registered pattern handlers in this run. */
  readonly findings: ReadonlyArray<PatternFinding>;
}

/**
 * STUB clustering pass. Returns an empty list until the algorithm
 * lands. The signature is the production contract — callers can adopt
 * it now and benefit when the real implementation replaces the body.
 */
export function clusterUnmatchedShapes(
  _input: ClusterUnmatchedShapesInput,
): ReadonlyArray<DiscoveredCandidateCluster> {
  // TODO(#318): implement n-gram / MinHash-based clustering over the
  // files not covered by any registered pattern. The algorithmic
  // specs are at audiocontrol issue #315; the deskwork tracking issue
  // is #318 (filed alongside Phase 11 Task 1).
  //
  // Real implementation outline:
  //   1. Build a set of "covered" files = union of files in
  //      `findings[*].hits[*].file`.
  //   2. For each uncovered file, compute n-grams (n=3..5) over the
  //      token stream and shingle-hash them.
  //   3. Cluster by Jaccard similarity > threshold (e.g., 0.7).
  //   4. Rank clusters by member count.
  //   5. Return clusters with member count >= MIN_CLUSTER_SIZE.
  warnOnce();
  return [];
}
