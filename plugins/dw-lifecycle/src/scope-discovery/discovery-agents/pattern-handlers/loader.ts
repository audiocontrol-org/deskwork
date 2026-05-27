/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/loader.ts
 *
 * Project-override loader for the pattern catalog. Reads
 * `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` and
 * returns a typed `PatternCatalogEntry[]` (the discriminated union
 * over `type`).
 *
 * Backward compatibility: entries without a `type` field default to
 * `type: 'regex'` (the legacy pre-Phase-11 shape). Adopters' existing
 * regex-only YAMLs continue to work unchanged.
 *
 * Errors throw with descriptive messages — no silent fallback (per
 * CLAUDE.md). Each variant gets its own per-field validation so
 * adopters see specific feedback for the field at fault.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isEnoent, isPlainObject } from '../../util/typeguards.js';
import type {
  CoverageEntry,
  NegativeSpaceEntry,
  OutlierDistanceMetric,
  OutlierEntry,
  PatternCatalogEntry,
  PatternType,
  RegexEntry,
  SemanticEntry,
} from './types.js';
import {
  parseCatalogEntryMetadata,
  type CatalogEntryMetadata,
} from '../../util/catalog-status.js';

export const OVERRIDE_PATH =
  '.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml';

const ALLOWED_OUTLIER_METRICS: ReadonlyArray<OutlierDistanceMetric> = [
  'token-composition',
  'className-composition',
];

interface ParseContext {
  readonly path: string;
  readonly index: number;
}

function ctxPrefix(ctx: ParseContext): string {
  return `pattern-matrix: override ${ctx.path} patterns[${ctx.index}]`;
}

function requireString(
  ctx: ParseContext,
  raw: Record<string, unknown>,
  field: string,
): string {
  const v = raw[field];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${ctxPrefix(ctx)}.${field} missing or non-string`);
  }
  return v;
}

function optionalNumber(
  ctx: ParseContext,
  raw: Record<string, unknown>,
  field: string,
): number | undefined {
  const v = raw[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${ctxPrefix(ctx)}.${field} must be a finite number when set`);
  }
  return v;
}

function compileRegex(ctx: ParseContext, src: string, field: string): RegExp {
  try {
    return new RegExp(src, 'g');
  } catch (err) {
    throw new Error(
      `${ctxPrefix(ctx)}.${field} is not a valid RegExp: ${errorMessage(err)}`,
    );
  }
}

function parseExtensions(
  ctx: ParseContext,
  raw: Record<string, unknown>,
): ReadonlyArray<string> | undefined {
  const v = raw['extensions'];
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new Error(`${ctxPrefix(ctx)}.extensions must be an array when set`);
  }
  return v.map((e: unknown, ei: number) => {
    if (typeof e !== 'string' || !e.startsWith('.')) {
      throw new Error(
        `${ctxPrefix(ctx)}.extensions[${ei}] must be a dot-prefixed string`,
      );
    }
    return e;
  });
}

function parseRegexEntry(
  ctx: ParseContext,
  raw: Record<string, unknown>,
  meta: CatalogEntryMetadata,
): RegexEntry {
  const id = requireString(ctx, raw, 'id');
  const description = requireString(ctx, raw, 'description');
  const regexSrc = requireString(ctx, raw, 'regex');
  const regex = compileRegex(ctx, regexSrc, 'regex');
  const extensions = parseExtensions(ctx, raw);
  return {
    type: 'regex',
    id,
    description,
    regex,
    status: meta.status,
    provenance: meta.provenance,
    ...(extensions !== undefined ? { extensions } : {}),
  };
}

function parseNegativeSpaceEntry(
  ctx: ParseContext,
  raw: Record<string, unknown>,
  meta: CatalogEntryMetadata,
): NegativeSpaceEntry {
  const id = requireString(ctx, raw, 'id');
  const description = requireString(ctx, raw, 'description');
  const matchGlob = requireString(ctx, raw, 'match_glob');
  const mustContainSrc = requireString(ctx, raw, 'must_contain');
  const mustContain = compileRegex(ctx, mustContainSrc, 'must_contain');
  const thresholdRaw = optionalNumber(ctx, raw, 'threshold');
  const threshold = thresholdRaw ?? 1;
  const secondaryContainsSrc = raw['secondary_contains'];
  let secondaryContains: RegExp | undefined;
  if (secondaryContainsSrc !== undefined) {
    if (typeof secondaryContainsSrc !== 'string' || secondaryContainsSrc.length === 0) {
      throw new Error(`${ctxPrefix(ctx)}.secondary_contains must be a non-empty string when set`);
    }
    secondaryContains = compileRegex(ctx, secondaryContainsSrc, 'secondary_contains');
  }
  const extensions = parseExtensions(ctx, raw);
  return {
    type: 'negative-space',
    id,
    description,
    matchGlob,
    mustContain,
    threshold,
    status: meta.status,
    provenance: meta.provenance,
    ...(secondaryContains !== undefined ? { secondaryContains } : {}),
    ...(extensions !== undefined ? { extensions } : {}),
  };
}

function parseCoverageEntry(
  ctx: ParseContext,
  raw: Record<string, unknown>,
  meta: CatalogEntryMetadata,
): CoverageEntry {
  const id = requireString(ctx, raw, 'id');
  const description = requireString(ctx, raw, 'description');
  const matchGlob = requireString(ctx, raw, 'match_glob');
  const mustContainSrc = requireString(ctx, raw, 'must_contain');
  const mustContain = compileRegex(ctx, mustContainSrc, 'must_contain');
  const extensions = parseExtensions(ctx, raw);
  return {
    type: 'coverage',
    id,
    description,
    matchGlob,
    mustContain,
    status: meta.status,
    provenance: meta.provenance,
    ...(extensions !== undefined ? { extensions } : {}),
  };
}

function parseOutlierEntry(
  ctx: ParseContext,
  raw: Record<string, unknown>,
  meta: CatalogEntryMetadata,
): OutlierEntry {
  const id = requireString(ctx, raw, 'id');
  const description = requireString(ctx, raw, 'description');
  const matchGlob = requireString(ctx, raw, 'match_glob');
  const distanceMetricRaw = requireString(ctx, raw, 'distance_metric');
  const distanceMetric = ALLOWED_OUTLIER_METRICS.find((m) => m === distanceMetricRaw);
  if (distanceMetric === undefined) {
    throw new Error(
      `${ctxPrefix(ctx)}.distance_metric must be one of ${ALLOWED_OUTLIER_METRICS.join(', ')}; got ${distanceMetricRaw}`,
    );
  }
  const sigmaRaw = optionalNumber(ctx, raw, 'threshold_sigma');
  const thresholdSigma = sigmaRaw ?? 2.0;
  const extensions = parseExtensions(ctx, raw);
  return {
    type: 'outlier',
    id,
    description,
    matchGlob,
    distanceMetric,
    thresholdSigma,
    status: meta.status,
    provenance: meta.provenance,
    ...(extensions !== undefined ? { extensions } : {}),
  };
}

function parseSemanticEntry(
  ctx: ParseContext,
  raw: Record<string, unknown>,
  meta: CatalogEntryMetadata,
): SemanticEntry {
  const id = requireString(ctx, raw, 'id');
  const description = requireString(ctx, raw, 'description');
  const matchGlob = requireString(ctx, raw, 'match_glob');
  const promptTemplate = requireString(ctx, raw, 'prompt_template');
  const confidenceRaw = optionalNumber(ctx, raw, 'confidence_threshold');
  const confidenceThreshold = confidenceRaw ?? 0.5;
  if (confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new Error(
      `${ctxPrefix(ctx)}.confidence_threshold must be in [0.0, 1.0]; got ${confidenceThreshold}`,
    );
  }
  const modelRaw = raw['model'];
  let model: string | undefined;
  if (modelRaw !== undefined) {
    if (typeof modelRaw !== 'string' || modelRaw.length === 0) {
      throw new Error(`${ctxPrefix(ctx)}.model must be a non-empty string when set`);
    }
    model = modelRaw;
  }
  const extensions = parseExtensions(ctx, raw);
  return {
    type: 'semantic',
    id,
    description,
    matchGlob,
    promptTemplate,
    confidenceThreshold,
    status: meta.status,
    provenance: meta.provenance,
    ...(model !== undefined ? { model } : {}),
    ...(extensions !== undefined ? { extensions } : {}),
  };
}

const ALLOWED_TYPES: ReadonlyArray<PatternType> = [
  'regex',
  'negative-space',
  'coverage',
  'outlier',
  'semantic',
];

function parseEntry(
  path: string,
  index: number,
  raw: unknown,
): PatternCatalogEntry {
  if (!isPlainObject(raw)) {
    throw new Error(`pattern-matrix: override ${path} patterns[${index}] is not an object`);
  }
  const ctx: ParseContext = { path, index };
  // Default to 'regex' when the type field is absent — backward-compat
  // with pre-Phase-11 entries.
  const typeRaw = raw['type'];
  let type: PatternType;
  if (typeRaw === undefined) {
    type = 'regex';
  } else {
    if (typeof typeRaw !== 'string') {
      throw new Error(`${ctxPrefix(ctx)}.type must be a string when set`);
    }
    const matched = ALLOWED_TYPES.find((t) => t === typeRaw);
    if (matched === undefined) {
      throw new Error(
        `${ctxPrefix(ctx)}.type must be one of ${ALLOWED_TYPES.join(', ')}; got ${typeRaw}`,
      );
    }
    type = matched;
  }
  // Phase 11 Task 2 — parse the shared Loop metadata once per entry,
  // before dispatching to the variant parser. The shared parser
  // synthesizes defaults when status/provenance are absent and
  // enforces the `withdrawn` invariant.
  const { metadata } = parseCatalogEntryMetadata(
    raw,
    `override ${path} patterns[${index}]`,
    'pattern-matrix',
  );
  switch (type) {
    case 'regex':
      return parseRegexEntry(ctx, raw, metadata);
    case 'negative-space':
      return parseNegativeSpaceEntry(ctx, raw, metadata);
    case 'coverage':
      return parseCoverageEntry(ctx, raw, metadata);
    case 'outlier':
      return parseOutlierEntry(ctx, raw, metadata);
    case 'semantic':
      return parseSemanticEntry(ctx, raw, metadata);
  }
}

/**
 * Load the project-supplied override list when present. Returns null
 * when the override file doesn't exist (use built-ins). Throws on
 * malformed override files.
 */
export async function loadOverridePatterns(
  repoRoot: string,
): Promise<ReadonlyArray<PatternCatalogEntry> | null> {
  const absPath = resolve(repoRoot, OVERRIDE_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(
      `pattern-matrix: cannot read override ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `pattern-matrix: cannot parse override ${absPath}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `pattern-matrix: override ${absPath} did not parse to a YAML object`,
    );
  }
  const patterns = parsed['patterns'];
  if (!Array.isArray(patterns)) {
    throw new Error(
      `pattern-matrix: override ${absPath} missing required 'patterns:' list`,
    );
  }
  const out: PatternCatalogEntry[] = [];
  patterns.forEach((raw: unknown, idx: number) => {
    out.push(parseEntry(absPath, idx, raw));
  });
  if (out.length === 0) {
    throw new Error(
      `pattern-matrix: override ${absPath} produced zero patterns (must have at least one)`,
    );
  }
  return out;
}
