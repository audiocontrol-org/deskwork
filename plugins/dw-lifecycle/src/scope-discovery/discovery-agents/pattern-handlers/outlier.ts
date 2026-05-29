/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/outlier.ts
 *
 * Statistical-outlier pattern handler — the discovered_candidates stub.
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
  OutlierContentType,
  OutlierEntry,
  PatternHandler,
  PatternHandlerInput,
} from './types.js';
import { matchesGlob } from './glob.js';

type TokenBag = Map<string, number>;

const ALPHANUM_TOKEN_RE = /[A-Za-z][A-Za-z0-9]{2,}/g;
const CLASSNAME_RE = /className\s*=\s*["']([^"']+)["']/g;
// CSS — property names (`color:`, `font-size:`) + ID/class selectors.
const CSS_PROPERTY_RE = /(?:^|[\s;{}])([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:/g;
const CSS_SELECTOR_RE = /(?:^|[\s,>+~])([.#][a-zA-Z_-][a-zA-Z0-9_-]*)/g;
// HTML — tag names + attribute names (excluding values).
const HTML_TAG_RE = /<\s*([a-zA-Z][a-zA-Z0-9-]*)\b/g;
const HTML_ATTR_RE = /\s([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*["']/g;
// YAML / JSON — top-level + nested keys. Keep the keys as-is (case-
// preserving) because configuration semantics often differ on case.
const YAML_KEY_RE = /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:/g;
const JSON_KEY_RE = /"([A-Za-z_][A-Za-z0-9_-]*)"\s*:/g;

function addToken(bag: TokenBag, tok: string): void {
  if (tok.length === 0) return;
  bag.set(tok, (bag.get(tok) ?? 0) + 1);
}

function tokenizeAlphanum(text: string): TokenBag {
  const bag: TokenBag = new Map();
  const re = new RegExp(ALPHANUM_TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    addToken(bag, m[0].toLowerCase());
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(text);
  }
  return bag;
}

function tokenizeWith(text: string, patterns: ReadonlyArray<RegExp>): TokenBag {
  const bag: TokenBag = new Map();
  for (const pat of patterns) {
    const re = new RegExp(pat.source, 'g');
    let m: RegExpExecArray | null = re.exec(text);
    while (m !== null) {
      const tok = (m[1] ?? m[0]).toLowerCase();
      addToken(bag, tok);
      if (m.index === re.lastIndex) re.lastIndex += 1;
      m = re.exec(text);
    }
  }
  return bag;
}

function tokenizeCss(text: string): TokenBag {
  return tokenizeWith(text, [CSS_PROPERTY_RE, CSS_SELECTOR_RE]);
}

function tokenizeHtml(text: string): TokenBag {
  return tokenizeWith(text, [HTML_TAG_RE, HTML_ATTR_RE]);
}

function tokenizeYaml(text: string): TokenBag {
  return tokenizeWith(text, [YAML_KEY_RE]);
}

function tokenizeJson(text: string): TokenBag {
  return tokenizeWith(text, [JSON_KEY_RE]);
}

type ResolvedContentType = Exclude<OutlierContentType, 'auto'>;

const EXT_TO_CONTENT: ReadonlyMap<string, ResolvedContentType> = new Map<
  string,
  ResolvedContentType
>([
  ['.ts', 'ts'],
  ['.tsx', 'ts'],
  ['.js', 'ts'],
  ['.jsx', 'ts'],
  ['.md', 'markdown'],
  ['.markdown', 'markdown'],
  ['.css', 'css'],
  ['.scss', 'css'],
  ['.html', 'html'],
  ['.htm', 'html'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml'],
  ['.json', 'json'],
]);

/**
 * resolve `'auto'` to a concrete content type from
 * the file extension. Unknown extensions fall back to `'ts'` (the prior
 * alphanumeric-token tokenizer) so existing TS-scoped catalogs see no
 * behavior change.
 */
function resolveContentType(
  configured: OutlierContentType,
  filePath: string,
): ResolvedContentType {
  if (configured !== 'auto') return configured;
  const lower = filePath.toLowerCase();
  for (const [ext, kind] of EXT_TO_CONTENT.entries()) {
    if (lower.endsWith(ext)) return kind;
  }
  return 'ts';
}

function tokenizeForContentType(
  contentType: ResolvedContentType,
  text: string,
): TokenBag {
  switch (contentType) {
    case 'ts':
    case 'markdown':
      // Markdown shares the alphanumeric tokenizer — words instead of
      // identifiers, but the regex shape is identical at this layer.
      // Per-content-type tuning has a place to land here.
      return tokenizeAlphanum(text);
    case 'css':
      return tokenizeCss(text);
    case 'html':
      return tokenizeHtml(text);
    case 'yaml':
      return tokenizeYaml(text);
    case 'json':
      return tokenizeJson(text);
  }
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
    // `contentType` is optional on the entry shape;
    // pre-Task-13 fixtures (and adopters who never set it) inherit
    // `'auto'`, which infers the tokenizer from the file extension.
    const configured = entry.contentType ?? 'auto';
    const resolved = resolveContentType(configured, scan.file);
    return tokenizeForContentType(resolved, scan.text);
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
