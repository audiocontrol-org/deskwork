/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/outlier.ts
 *
 * Statistical-outlier pattern handler — Phase 11 G4.
 *
 * For each glob-matched file, computes a feature vector (token
 * composition or className composition) and a distance from the
 * centroid of its directory siblings. Files whose distance exceeds
 * `thresholdSigma` standard deviations from the per-directory mean
 * fire as outlier findings.
 *
 * Distance metrics:
 *
 *   - `'token-composition'`: bag-of-words over alphanumeric tokens
 *     (length >= 3, lowercased). Cosine distance vs the centroid.
 *   - `'className-composition'`: bag-of-words over the contents of
 *     `className="..."` attributes (whitespace-split into class tokens).
 *     Cosine distance vs the centroid.
 *
 * Per-directory grouping: files are bucketed by their immediate parent
 * directory. A directory with fewer than 2 siblings produces no
 * findings (need a population to compare against).
 *
 * Distance = 1 - cosine_similarity, bounded [0, 1].
 *
 * Outputs:
 *   - hits[]: one PatternHit per outlier file (line: 0; snippet
 *     describes the deviation magnitude).
 *   - metrics: per-directory mean / stddev / population.
 *
 * Implementation cost: O(F·V) for F files, V vocabulary terms. The
 * vocabulary is bounded by the file count and per-file token count, so
 * this scales fine for typical scope-inventory inputs (~thousands of
 * files).
 */

import type { PatternFinding, PatternHit } from '../types.js';
import type { SourceFileView } from '../shared.js';
import type {
  OutlierEntry,
  PatternHandler,
  PatternHandlerInput,
} from './types.js';
import { matchesGlob } from './glob.js';

type TokenBag = Map<string, number>;

const TOKEN_RE = /[A-Za-z][A-Za-z0-9]{2,}/g;
const CLASSNAME_RE = /className\s*=\s*["']([^"']+)["']/g;

function tokenize(text: string): TokenBag {
  const bag: TokenBag = new Map();
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const tok = m[0].toLowerCase();
    bag.set(tok, (bag.get(tok) ?? 0) + 1);
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(text);
  }
  return bag;
}

function classNameTokens(text: string): TokenBag {
  const bag: TokenBag = new Map();
  const re = new RegExp(CLASSNAME_RE.source, 'g');
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const payload = m[1] ?? '';
    for (const tok of payload.split(/\s+/)) {
      const t = tok.trim();
      if (t.length === 0) continue;
      bag.set(t, (bag.get(t) ?? 0) + 1);
    }
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(text);
  }
  return bag;
}

function vectorize(entry: OutlierEntry, scan: SourceFileView): TokenBag {
  if (entry.distanceMetric === 'token-composition') {
    return tokenize(scan.text);
  }
  return classNameTokens(scan.text);
}

function dot(a: TokenBag, b: TokenBag): number {
  let sum = 0;
  for (const [k, v] of a.entries()) {
    const bv = b.get(k);
    if (bv !== undefined) sum += v * bv;
  }
  return sum;
}

function magnitude(a: TokenBag): number {
  let sum = 0;
  for (const v of a.values()) sum += v * v;
  return Math.sqrt(sum);
}

function cosineDistance(a: TokenBag, b: TokenBag): number {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return 1;
  const sim = dot(a, b) / (ma * mb);
  return 1 - sim;
}

function centroid(vectors: ReadonlyArray<TokenBag>): TokenBag {
  const sum: TokenBag = new Map();
  for (const v of vectors) {
    for (const [k, c] of v.entries()) {
      sum.set(k, (sum.get(k) ?? 0) + c);
    }
  }
  const n = vectors.length;
  if (n === 0) return sum;
  const avg: TokenBag = new Map();
  for (const [k, c] of sum.entries()) avg.set(k, c / n);
  return avg;
}

function parentDirOf(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx < 0 ? '.' : filePath.slice(0, idx);
}

interface DirectoryBucket {
  readonly dir: string;
  readonly files: ReadonlyArray<{
    readonly scan: SourceFileView;
    readonly vec: TokenBag;
  }>;
}

function bucketByDir(
  scans: ReadonlyArray<SourceFileView>,
  entry: OutlierEntry,
): ReadonlyArray<DirectoryBucket> {
  const map = new Map<string, Array<{ scan: SourceFileView; vec: TokenBag }>>();
  for (const scan of scans) {
    if (entry.extensions !== undefined) {
      const lower = scan.file.toLowerCase();
      if (!entry.extensions.some((e) => lower.endsWith(e))) continue;
    }
    if (!matchesGlob(scan.file, entry.matchGlob)) continue;
    const dir = parentDirOf(scan.file);
    const list = map.get(dir);
    const vec = vectorize(entry, scan);
    if (list === undefined) {
      map.set(dir, [{ scan, vec }]);
    } else {
      list.push({ scan, vec });
    }
  }
  const out: DirectoryBucket[] = [];
  for (const [dir, files] of map.entries()) {
    out.push({ dir, files });
  }
  return out;
}

interface OutlierResult {
  readonly hits: ReadonlyArray<PatternHit>;
  readonly meanDistance: number;
  readonly stddev: number;
  readonly population: number;
}

function analyzeBucket(
  bucket: DirectoryBucket,
  thresholdSigma: number,
): OutlierResult {
  const population = bucket.files.length;
  if (population < 2) {
    return { hits: [], meanDistance: 0, stddev: 0, population };
  }
  const cen = centroid(bucket.files.map((f) => f.vec));
  const distances = bucket.files.map((f) => cosineDistance(f.vec, cen));
  const mean = distances.reduce((s, d) => s + d, 0) / distances.length;
  const variance =
    distances.reduce((s, d) => s + (d - mean) * (d - mean), 0) /
    distances.length;
  const stddev = Math.sqrt(variance);
  const hits: PatternHit[] = [];
  // Zero-stddev directory: all files identical; no outliers possible
  // even if the operator passed a tiny sigma. Skip — emitting findings
  // here would be noise.
  if (stddev === 0) {
    return { hits, meanDistance: mean, stddev, population };
  }
  for (let i = 0; i < bucket.files.length; i += 1) {
    const d = distances[i] ?? 0;
    const z = (d - mean) / stddev;
    if (z > thresholdSigma) {
      const file = bucket.files[i];
      if (file === undefined) continue;
      hits.push({
        file: file.scan.file,
        line: 0,
        snippet: `outlier: distance=${d.toFixed(3)}, z=${z.toFixed(2)}σ (dir mean=${mean.toFixed(3)}, σ=${stddev.toFixed(3)})`,
      });
    }
  }
  return { hits, meanDistance: mean, stddev, population };
}

export const outlierHandler: PatternHandler<OutlierEntry> = {
  type: 'outlier',
  apply(input: PatternHandlerInput<OutlierEntry>): PatternFinding {
    const buckets = bucketByDir(input.scans, input.entry);
    const allHits: PatternHit[] = [];
    let bucketsAnalyzed = 0;
    let totalPopulation = 0;
    for (const bucket of buckets) {
      const result = analyzeBucket(bucket, input.entry.thresholdSigma);
      for (const h of result.hits) allHits.push(h);
      bucketsAnalyzed += 1;
      totalPopulation += result.population;
    }
    return {
      id: input.entry.id,
      description: input.entry.description,
      regex: `outlier:${input.entry.distanceMetric}`,
      hits: allHits,
      provenance: 'outlier',
      metrics: {
        buckets_analyzed: bucketsAnalyzed,
        files_scored: totalPopulation,
        outliers: allHits.length,
        threshold_sigma: input.entry.thresholdSigma,
      },
    };
  },
};
