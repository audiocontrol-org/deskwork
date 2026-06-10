/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/pattern-handlers/types.ts
 *
 * Shared types for the pattern-handler dispatcher (polymorphic pattern handlers).
 *
 * The pattern-matrix discovery agent grew from a regex-only scanner
 * into a polymorphic dispatcher that routes catalog entries to
 * type-specific handlers. Each catalog entry carries a `type`
 * discriminator (`'regex'` | `'negative-space'` | `'coverage'` |
 * `'outlier'` | `'semantic'`). For backward compatibility, entries
 * without `type` default to `'regex'`.
 *
 * Per the orchestrator loop PRD section, the v1 vocabulary is six types — five
 * implemented as per-file pattern handlers + one synthesis-layer
 * clustering pass (which lives outside this dispatcher).
 *
 * # Architecture
 *
 * - This file defines the type-handler INTERFACE + the catalog-entry
 *   union.
 * - One file per handler under `./` (regex.ts, negative-space.ts,
 *   coverage.ts, outlier.ts, semantic.ts).
 * - `index.ts` registers all handlers and exposes the dispatch
 *   function. The pattern-matrix agent imports the dispatcher and
 *   delegates per-entry routing to it.
 *
 * # No casts, no any
 *
 * The discriminated union over `type` lets TypeScript narrow each
 * handler's config without `as Type` casts. The registry maps
 * discriminator → handler, and the dispatch function returns a
 * typed `PatternFinding` (the same shape regex emits today).
 */

import type { PatternFinding } from '../types.js';
import type { SourceFileView } from '../shared.js';
import type { CatalogStatus, Provenance } from '../../util/catalog-status.js';

/**
 * Common metadata every catalog entry carries, regardless of type.
 *
 * every catalog entry now also carries Loop
 * metadata (status + provenance). The dispatcher filters out non-
 * actively-enforced entries at the entry-point boundary
 * (`pattern-matrix.ts` → `buildPatternMatrix`) BEFORE handlers run,
 * so handlers themselves see only blessed/cursed entries.
 */
interface BaseCatalogEntry {
  readonly id: string;
  readonly description: string;
  readonly extensions?: ReadonlyArray<string>;
  /** Loop status. Default `blessed` for pre-Loop entries. */
  readonly status: CatalogStatus;
  /** provenance block; synthesized when absent. */
  readonly provenance: Provenance;
  /**
   * REVERSE provenance link to the audit-log.
   * Empty when no audit finding has referenced this entry.
   */
  readonly auditHistory: ReadonlyArray<string>;
}

/**
 * The legacy regex-matcher catalog entry. Backward-compatible with
 * pre-Phase-11 entries (which had no `type` field — the loader
 * normalizes them to `'regex'`).
 */
export interface RegexEntry extends BaseCatalogEntry {
  readonly type: 'regex';
  readonly regex: RegExp;
}

/**
 * Negative-space catalog entry. Fires when a file matching
 * `match_glob` does NOT contain at least one match for `must_contain`.
 *
 * The KeygroupSummary repro from issue #315: a file matching the
 * editor-component glob (`modules/*-editor/src/**\/*Summary.tsx`) that
 * contains zero matches for the canonical-primitive regex
 * (`\.ac-[a-z]+`) yet >= 5 utility-class hits (the secondary signal).
 *
 * - `threshold` (default 1): the minimum number of secondary hits per
 *   file to escalate the finding. When `secondary_contains` is unset,
 *   the threshold defaults to 1 (any matched file with zero canonical
 *   consumers fires; secondary signal optional).
 */
export interface NegativeSpaceEntry extends BaseCatalogEntry {
  readonly type: 'negative-space';
  readonly matchGlob: string;
  readonly mustContain: RegExp;
  readonly threshold: number;
  /** Optional secondary signal that strengthens the finding when present. */
  readonly secondaryContains?: RegExp;
}

/**
 * Coverage-metric catalog entry. NOT a finding generator per se — emits
 * a synthesis-layer metric `<glob>: <N>/<M> = <fraction>%` describing
 * what fraction of matched files contain `must_contain`. Feeds the
 * codebase-state metrics codebase-state-metrics.
 */
export interface CoverageEntry extends BaseCatalogEntry {
  readonly type: 'coverage';
  readonly matchGlob: string;
  readonly mustContain: RegExp;
}

/**
 * Statistical-outlier catalog entry. Fires for files whose
 * `distanceMetric`-distance from their directory-sibling centroid
 * exceeds `threshold` standard deviations (default: 2σ).
 *
 * - `'token-composition'`: bag-of-words over alphanumeric tokens.
 * - `'className-composition'`: bag-of-words over `className="..."`
 *   attribute payloads (catches files whose CSS-class composition
 *   diverges from siblings — the KeygroupSummary case).
 */
export type OutlierDistanceMetric =
  | 'token-composition'
  | 'className-composition';

/**
 * content-type discriminator for the
 * `token-composition` outlier metric. Different content types call for
 * different tokenization strategies; treating markdown words like TS
 * identifiers loses signal (and vice-versa).
 *
 * - `'auto'` (default): infer from the file extension. `.ts/.tsx` →
 *   `ts`; `.md/.markdown` → `markdown`; `.css/.scss` → `css`;
 *   `.html/.htm` → `html`; `.yaml/.yml` → `yaml`; `.json` → `json`;
 *   anything else → `ts` (the prior-art alphanumeric tokenizer).
 * - `'ts'`: alphanumeric identifier tokens (prior behavior).
 * - `'markdown'`: word tokens (a-z, A-Z, length >= 3, lowercased).
 *   Common Markdown stopwords are kept; tokenization is identical to
 *   `ts` for portability but the dispatcher is explicit so future
 *   per-content-type tuning has a place to land.
 * - `'css'`: tokens over selectors + property names (catches files
 *   whose property mix diverges from siblings).
 * - `'html'`: tokens over tag names + attribute names (`<div>`,
 *   `class="..."`, `data-foo`).
 * - `'yaml'`: tokens over top-level + nested key paths (e.g.,
 *   `foo.bar.baz`).
 * - `'json'`: tokens over JSON key names (same shape as yaml).
 *
 * The `className-composition` metric is JSX-specific (TS/TSX files);
 * for non-TS content the operator should pick `token-composition` with
 * an appropriate `content_type` instead.
 */
export type OutlierContentType =
  | 'auto'
  | 'ts'
  | 'markdown'
  | 'css'
  | 'html'
  | 'yaml'
  | 'json';

export interface OutlierEntry extends BaseCatalogEntry {
  readonly type: 'outlier';
  readonly matchGlob: string;
  readonly distanceMetric: OutlierDistanceMetric;
  /** Sigma threshold for an outlier finding to fire. Default 2.0. */
  readonly thresholdSigma: number;
  /**
   * content-type discriminator for the
   * `token-composition` tokenizer. Defaults to `'auto'` (infer from
   * file extension). Ignored by `className-composition`. The field is
   * optional on the catalog-entry shape so pre-Phase-11-Task-13
   * fixtures continue to compile; the handler treats `undefined` as
   * `'auto'` (the default).
   */
  readonly contentType?: OutlierContentType;
}

/**
 * Semantic (LLM-augmented) catalog entry. STUB in v1.1 Task 1 — the
 * type is reserved + dispatched but the handler returns zero findings
 * with a runtime log line naming the deferral. The LLM wiring lands
 * under the LLM judge + external auditor's judge work; see the cross-reference issue.
 */
export interface SemanticEntry extends BaseCatalogEntry {
  readonly type: 'semantic';
  readonly matchGlob: string;
  readonly promptTemplate: string;
  readonly model?: string;
  /** Confidence below which a violation fires. Range 0.0–1.0. */
  readonly confidenceThreshold: number;
}

/**
 * Union of every per-file pattern-handler catalog entry. The
 * unmatched-shape clustering pass (G5) is a synthesis-layer pass,
 * not a per-file pattern, so it has no entry here.
 */
export type PatternCatalogEntry =
  | RegexEntry
  | NegativeSpaceEntry
  | CoverageEntry
  | OutlierEntry
  | SemanticEntry;

export type PatternType = PatternCatalogEntry['type'];

/**
 * Per-handler input contract. Each handler receives:
 *   - the catalog entry it should evaluate (typed to its own variant);
 *   - the in-scope files already read into `SourceFileView`s (the
 *     pattern-matrix agent reads each file once and reuses across
 *     handlers).
 */
export interface PatternHandlerInput<E extends PatternCatalogEntry> {
  readonly entry: E;
  readonly scans: ReadonlyArray<SourceFileView>;
}

/**
 * Handler contract. Every handler turns a catalog entry + a set of
 * scanned files into a `PatternFinding` consistent with the legacy
 * shape (id + description + hits) plus the Phase-11 provenance + metrics
 * extensions.
 */
export interface PatternHandler<E extends PatternCatalogEntry> {
  readonly type: E['type'];
  apply(input: PatternHandlerInput<E>): PatternFinding;
}
