/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/synthesis-discovered-candidates.ts
 *
 * Synthesis-layer unmatched-shape clustering pass.
 *
 * After all registered pattern handlers (regex / negative-space /
 * coverage / outlier / semantic) run, this pass groups source files
 * whose content shape was NOT matched by any registered pattern, by
 * shape similarity. Each cluster above a frequency floor surfaces as
 * a `discovered_candidate` in the scope-manifest; the operator decides
 * whether to author a pattern for the cluster or mark it ignore.
 *
 * Closes https://github.com/audiocontrol-org/deskwork/issues/318
 * (Algorithmic spec ported from audiocontrol issue #315.)
 *
 * # Algorithm
 *
 * 1. Coverage set = union of files in `findings[*].hits[*].file`.
 * 2. Uncovered set = scanned files NOT in the coverage set.
 * 3. Shape signature per file = MinHash(n-grams(tokens)) where:
 *    - tokens are alphanumeric (identifiers, attribute names, JSX
 *      element names; string literals and comments excluded for
 *      stability across cosmetic edits);
 *    - n-grams span n=3..5 to capture short repeating phrases AND
 *      longer structural shapes;
 *    - MinHash uses 128 independent hash functions; the resulting
 *      `Uint32Array(128)` signature compares cheaply via element-wise
 *      equality (the fraction of matching positions estimates Jaccard
 *      similarity).
 * 4. Cluster by Jaccard >= 0.7 with an every-pair check (greedy
 *    single-link: a candidate joins a cluster only if it meets the
 *    threshold against EVERY existing member; preserves cluster
 *    tightness as it grows).
 * 5. Rank by member count desc; secondary tiebreak by distinctiveness
 *    from the covered (already-blessed) vocabulary — clusters that
 *    look NOTHING like any registered pattern rank above near-misses
 *    of registered shapes.
 * 6. Frequency floor: emit clusters with `memberCount >= 3`. Fewer
 *    than 3 files is statistical noise per the spec.
 * 7. Shape summary: bag-of-words of the top-10 n-grams by frequency
 *    within the cluster — the human-readable artifact the operator
 *    reads to decide whether the cluster is a real shape.
 *
 * # Complexity
 *
 * O(N * (T + S * H)) for signature build (N = uncovered files; T =
 * tokenization cost per file; S = n-gram set size per file; H =
 * MinHash width = 128). O(N^2 * H) for clustering's worst-case
 * every-pair comparison + O(N * M * H) for distinctiveness against
 * M covered files. Both quadratic terms are fine for typical
 * uncovered-set sizes (< 1000 files); above that, locality-sensitive
 * hashing would replace the every-pair check, but the spec
 * deliberately defers that until the simple algorithm is proven.
 */

import type { PatternFinding } from './types.js';
import type { SourceFileView } from './shared.js';
import type { DiscoveredCandidateCluster } from './types.js';

/**
 * Tuning constants. Sources of the defaults:
 *   - NGRAM_MIN / NGRAM_MAX: #318 spec (n=3..5 captures both short
 *     repeating phrases and longer structural shapes).
 *   - MINHASH_SIZE: 128 hash functions is the standard literature
 *     default; gives ~9% standard error on the Jaccard estimate.
 *   - JACCARD_THRESHOLD: 0.7 per #318 spec; the operator can revise
 *     once we have telemetry from the audit-log on cluster quality.
 *   - MIN_CLUSTER_SIZE: 3 per #318 spec; fewer is statistical noise.
 *   - SUMMARY_TOP_K: 10 per #318 spec; matches operator-attention
 *     budget on the manifest surface.
 *
 * No project-override loader is wired in v1 — the constants are
 * literally the spec. Adopters can fork the file or file a follow-up
 * if real-world tuning needs surface.
 */
const NGRAM_MIN = 3;
const NGRAM_MAX = 5;
const MINHASH_SIZE = 128;
const JACCARD_THRESHOLD = 0.7;
const MIN_CLUSTER_SIZE = 3;
const SUMMARY_TOP_K = 10;

export interface ClusterUnmatchedShapesInput {
  /** All in-scope source files (already read into views). */
  readonly scans: ReadonlyArray<SourceFileView>;
  /** Findings produced by registered pattern handlers in this run. */
  readonly findings: ReadonlyArray<PatternFinding>;
}

/**
 * Public entry point. Composes the algorithm steps; pure (no I/O).
 *
 * Empty input → empty output. Files that tokenize to fewer than
 * NGRAM_MIN tokens contribute zero n-grams and are silently dropped
 * (they can't meaningfully cluster); the per-file ngram-set being
 * empty is the gate.
 */
export function clusterUnmatchedShapes(
  input: ClusterUnmatchedShapesInput,
): ReadonlyArray<DiscoveredCandidateCluster> {
  // STEP 1 — Coverage set.
  const covered = buildCoverageSet(input.findings);

  // STEP 2-3 — Partition + build signatures.
  const uncoveredShapes: FileShape[] = [];
  const coveredShapes: FileShape[] = [];
  for (const scan of input.scans) {
    const shape = buildShape(scan);
    if (shape === null) continue;
    if (covered.has(scan.file)) {
      coveredShapes.push(shape);
    } else {
      uncoveredShapes.push(shape);
    }
  }
  if (uncoveredShapes.length < MIN_CLUSTER_SIZE) return [];

  // STEP 4 — Cluster.
  const clusters = clusterByJaccard(uncoveredShapes);

  // STEP 5-6 — Filter by frequency floor + rank.
  const eligible = clusters.filter((c) => c.memberShapes.length >= MIN_CLUSTER_SIZE);
  const ranked = rankClusters(eligible, coveredShapes);

  // STEP 7 — Emit operator-facing summaries.
  return ranked.map((c) => ({
    id: stableClusterId(c.memberShapes.map((s) => s.file)),
    shapeSummary: bagOfWordsSummary(c.memberShapes),
    members: c.memberShapes.map((s) => s.file).sort(),
    memberCount: c.memberShapes.length,
  }));
}

/** One file's signature + supporting metadata used downstream. */
interface FileShape {
  readonly file: string;
  readonly ngrams: ReadonlySet<string>;
  readonly signature: Uint32Array;
}

interface Cluster {
  readonly memberShapes: FileShape[];
}

function buildCoverageSet(findings: ReadonlyArray<PatternFinding>): Set<string> {
  const out = new Set<string>();
  for (const finding of findings) {
    for (const hit of finding.hits) {
      out.add(hit.file);
    }
  }
  return out;
}

function buildShape(view: SourceFileView): FileShape | null {
  const tokens = tokenize(view.text);
  const ngramArr = allNgrams(tokens);
  if (ngramArr.length === 0) return null;
  const ngramSet = new Set(ngramArr);
  if (ngramSet.size === 0) return null;
  const signature = minHashSignature(ngramSet);
  return { file: view.file, ngrams: ngramSet, signature };
}

/**
 * Strip comments + string literals; tokenize on non-alphanumeric.
 *
 * The stripping is heuristic, not language-aware (we accept .ts,
 * .tsx, .md, .css, .yaml, .json, .html — the same content types the
 * scan engine handles uniformly via the polymorphic dispatcher). For
 * language-aware tokenization (e.g. JSX-aware unwrapping of attribute
 * values), an AST tokenizer would replace this; not in scope for #318.
 */
function tokenize(text: string): string[] {
  const stripped = text
    .replace(/\/\/[^\n]*/g, '') // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/<!--[\s\S]*?-->/g, '') // HTML/markdown comments
    .replace(/"(?:[^"\\]|\\.)*"/g, '') // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, '') // single-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, ''); // backtick template literals
  return stripped.split(/[^A-Za-z0-9_]+/).filter((t) => t.length > 0);
}

function allNgrams(tokens: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (let n = NGRAM_MIN; n <= NGRAM_MAX; n += 1) {
    if (tokens.length < n) continue;
    for (let i = 0; i + n <= tokens.length; i += 1) {
      out.push(tokens.slice(i, i + n).join(' '));
    }
  }
  return out;
}

/**
 * MinHash signature: for each of MINHASH_SIZE independent hash
 * functions, take the minimum hash over all elements. Element-wise
 * equality of two signatures estimates Jaccard similarity (the
 * fraction of positions where both signatures coincide approximates
 * |A∩B|/|A∪B|, unbiased).
 */
function minHashSignature(ngramSet: ReadonlySet<string>): Uint32Array {
  const sig = new Uint32Array(MINHASH_SIZE).fill(0xffffffff);
  for (const s of ngramSet) {
    for (let i = 0; i < MINHASH_SIZE; i += 1) {
      const h = fnv1aSeeded(s, i + 1);
      const current = sig[i] ?? 0xffffffff;
      if (h < current) sig[i] = h;
    }
  }
  return sig;
}

/**
 * FNV-1a 32-bit hash, seeded by mixing the seed into the initial
 * offset basis. Standard library-free MinHash hash-function family.
 * Seeds in [1, MINHASH_SIZE] produce 128 effectively-independent
 * functions (the seed perturbs every byte's contribution).
 */
function fnv1aSeeded(s: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function jaccardFromSigs(a: Uint32Array, b: Uint32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `clusterUnmatchedShapes: MinHash signature length mismatch (${a.length} vs ${b.length})`,
    );
  }
  let same = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai === bi) same += 1;
  }
  return same / a.length;
}

/**
 * Greedy single-link clustering with every-pair threshold check.
 *
 * For each unassigned shape, start a new cluster. Sweep remaining
 * unassigned shapes; add one to the cluster only if it meets the
 * Jaccard threshold against EVERY existing member. The every-pair
 * check (rather than single-link's any-pair) prevents the typical
 * single-link "chain merging" pathology where transitive similarity
 * collapses heterogeneous clusters into one.
 *
 * Insertion order is the iteration order over `shapes`; the test
 * suite verifies the algorithm is stable under the input ordering
 * we actually produce (sorted by file path).
 */
function clusterByJaccard(shapes: ReadonlyArray<FileShape>): Cluster[] {
  const assigned = new Set<string>();
  const out: Cluster[] = [];
  // Sort by file path for stable iteration order across runs.
  const ordered = [...shapes].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  for (const seed of ordered) {
    if (assigned.has(seed.file)) continue;
    const members: FileShape[] = [seed];
    assigned.add(seed.file);
    for (const cand of ordered) {
      if (assigned.has(cand.file)) continue;
      if (members.every((m) => jaccardFromSigs(m.signature, cand.signature) >= JACCARD_THRESHOLD)) {
        members.push(cand);
        assigned.add(cand.file);
      }
    }
    out.push({ memberShapes: members });
  }
  return out;
}

/**
 * Rank by (member count desc, distinctiveness desc).
 *
 * Distinctiveness = 1 - mean(jaccard(cluster_member, covered_member))
 * averaged over all (cluster_member, covered_member) pairs. A cluster
 * whose shapes are entirely unlike any registered pattern shape
 * (distinctiveness → 1) ranks above a near-miss of an existing
 * registered shape (distinctiveness → 0). Near-misses are valid
 * "registered-pattern tightening" candidates; novel patterns are
 * the higher-information surface.
 *
 * If there are no covered shapes (cold-start: zero registered
 * patterns matched anything), distinctiveness collapses to 1 for
 * every cluster — the size tiebreaker dominates, which is correct.
 */
function rankClusters(eligible: ReadonlyArray<Cluster>, coveredShapes: ReadonlyArray<FileShape>): Cluster[] {
  const scored = eligible.map((c) => ({
    cluster: c,
    size: c.memberShapes.length,
    distinctiveness: distinctivenessVsCovered(c.memberShapes, coveredShapes),
  }));
  scored.sort((a, b) => {
    if (a.size !== b.size) return b.size - a.size;
    if (a.distinctiveness !== b.distinctiveness) return b.distinctiveness - a.distinctiveness;
    // Tertiary stable tiebreak: sort by smallest member file path so
    // identical-shaped runs produce identical output across reruns.
    // memberShapes is non-empty (filtered to length >= MIN_CLUSTER_SIZE
    // upstream); fall back to '' for the indexer's undefined branch.
    const aMin = a.cluster.memberShapes[0]?.file ?? '';
    const bMin = b.cluster.memberShapes[0]?.file ?? '';
    return aMin < bMin ? -1 : aMin > bMin ? 1 : 0;
  });
  return scored.map((s) => s.cluster);
}

function distinctivenessVsCovered(
  clusterShapes: ReadonlyArray<FileShape>,
  coveredShapes: ReadonlyArray<FileShape>,
): number {
  if (coveredShapes.length === 0 || clusterShapes.length === 0) return 1;
  let sum = 0;
  let count = 0;
  for (const cs of clusterShapes) {
    for (const ov of coveredShapes) {
      sum += jaccardFromSigs(cs.signature, ov.signature);
      count += 1;
    }
  }
  return 1 - sum / count;
}

/**
 * Bag-of-words summary: top-K n-grams by frequency across the
 * cluster's member n-gram sets. Joined with ", " for direct
 * inclusion in the operator-facing manifest field.
 */
function bagOfWordsSummary(memberShapes: ReadonlyArray<FileShape>): string {
  const freq = new Map<string, number>();
  for (const s of memberShapes) {
    for (const ng of s.ngrams) {
      freq.set(ng, (freq.get(ng) ?? 0) + 1);
    }
  }
  // Sort by frequency desc; secondary by n-gram string asc for stability.
  const top = Array.from(freq.entries())
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .slice(0, SUMMARY_TOP_K)
    .map(([ng]) => ng);
  return top.join(', ');
}

/**
 * Stable cluster id derived from the sorted member file paths. The
 * id is deterministic across runs against the same input — useful
 * for `discovered_candidates` diff against a prior manifest.
 */
function stableClusterId(members: ReadonlyArray<string>): string {
  const sorted = [...members].sort();
  const joined = sorted.join('|');
  // Hex-format the FNV-1a hash (seed 0) for a short stable id.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < joined.length; i += 1) {
    h = Math.imul(h ^ joined.charCodeAt(i), 16777619);
  }
  return `cluster-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
