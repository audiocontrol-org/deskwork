/**
 * plugins/dw-lifecycle/src/scope-discovery/anti-patterns-registry.ts
 *
 * Parser + types for the anti-patterns registry YAML consumed by the
 * scope-discovery anti-patterns gate (Phase 2 Family A). Shape lives in
 * a sibling module from the scanner so the adversarial validator can
 * import and exercise the parsing logic independently of the file-scan
 * path.
 *
 * Registry schema (canonical YAML wire format):
 *
 *   anti_patterns:
 *     - id: <kebab-case>
 *       added_in: <7-40 hex chars>
 *       primitive: <hook/component name>
 *       from: <import path>
 *       shape_regex: <regex string OR list of regex strings>
 *       min_distance: <int; optional; defaults to DEFAULT_MIN_DISTANCE>
 *       excludes_paths: <optional list of literal paths or globs>
 *       canonical_file: <optional CWD-relative POSIX path>
 *       message: <multi-line replacement instruction>
 *
 * `canonical_file:` is optional and names the primitive's
 * source-of-truth file. The scanner auto-excludes that file from the
 * entry's shape match (its body IS the legacy shape, by construction).
 * If the field is set AND the file does not exist at scan time, the
 * scanner FAILS LOUD with an actionable error naming the entry id +
 * the missing path — typically caused by a git rename without
 * registry update. Independent from `excludes_paths:`: both apply
 * when set together (auto-exclude the canonical PLUS the
 * `excludes_paths` globs).
 *
 * Path matching is BYTE-EXACT against the candidate file's CWD-
 * relative POSIX path. No glob expansion, no directory recursion —
 * `canonical_file:` names exactly one file. Operators with multiple
 * canonical files for one entry use `excludes_paths:` (glob) instead.
 *
 * Parse-time validation rejects:
 *   - non-object entries
 *   - missing/malformed required fields
 *   - empty regex pattern list
 *   - unparseable regex
 *   - non-positive min_distance
 *   - excludes_paths whose entries are not non-empty strings
 *   - canonical_file that is set but empty / non-string
 *
 * `canonical_file` existence is NOT validated at parse time — a
 * multi-step refactor may legitimately update the registry before
 * moving the file. Existence is checked at SCAN time, where the
 * failure mode is meaningful (the scanner is about to evaluate the
 * entry against the wrong tree).
 *
 * Returns a `ParsedRegistry` with the entries narrowed to concrete shapes
 * (single-pattern vs multi-pattern fingerprint), with regexes pre-compiled.
 *
 * File-read + YAML-walk + unique-id enforcement live in
 * `util/registry-yaml.ts` (shared with Family C's adopter-manifests
 * registry); this module only owns the per-entry shape + regex compile.
 *
 * Pattern type dispatcher follow-up: the pilot port (and this v1)
 * implement only the `regex` type. Extension to `glob` / `ast-grep` /
 * `ts-morph` pattern types is tracked at audiocontrol-org/deskwork#285.
 * The schema's optional `type:` field is accepted (and validated) by
 * v1 — entries that set `type: regex` parse identically to entries
 * that omit the field. Entries with any other `type:` value are
 * rejected loudly so adopters who pre-author v2 entries against this
 * v1 implementation get an actionable error rather than a silent
 * regex-fallthrough.
 */

import { globToRegex } from './util/glob.js';
import { errorMessage } from './util/typeguards.js';
import {
  loadKeyedListRegistry,
  parseKeyedListRegistry,
  requireString,
  validateGitSha,
  validateKebabId,
  type ParsedKeyedListRegistry,
  type RegistrySchema,
} from './util/registry-yaml.js';
import {
  parseAuditHistory,
  parseCatalogEntryMetadata,
  type CatalogStatus,
  type Provenance,
} from './util/catalog-status.js';

/** Default max line gap between regex matches when `shape_regex` is a list. */
export const DEFAULT_MIN_DISTANCE = 50;

/** Required regex flags — global so we find every occurrence, multi-line so ^/$ work per-line. */
const REGEX_FLAGS = 'gm';

const NAMESPACE = 'anti-patterns';
const TOP_LEVEL_KEY = 'anti_patterns';

/** One entry in the optional `excludes_paths:` list, pre-compiled. */
export interface ExcludePath {
  /** Original pattern as authored (literal path OR glob). */
  readonly pattern: string;
  /** Compiled regex matched against a candidate file's CWD-relative POSIX path. */
  readonly regex: RegExp;
}

/**
 * One entry in the registry, with regex pre-compiled.
 * Single-pattern fingerprints carry `patterns.length === 1`; multi-pattern
 * fingerprints carry length >= 2 and `minDistance > 0`.
 * `excludesPaths` is empty when the entry has no `excludes_paths:` field.
 * `canonicalFile` is `null` when the entry omits the field (preserves
 * pre-canonical-file behavior — the only exclusion source is
 * `excludesPaths`).
 */
export interface AntiPatternEntry {
  readonly id: string;
  readonly addedIn: string;
  readonly primitive: string;
  readonly from: string;
  readonly patterns: readonly RegExp[];
  readonly minDistance: number;
  readonly excludesPaths: readonly ExcludePath[];
  /**
   * CWD-relative POSIX path of the canonical implementation file. When
   * set, the scanner auto-excludes this file from the entry's shape
   * match AND verifies the file exists at scan start (failing loud if
   * it doesn't — the primitive may have been git-renamed without
   * updating the registry). Path matching is BYTE-EXACT — no glob, no
   * directory expansion.
   */
  readonly canonicalFile: string | null;
  readonly message: string;
  /**
   * The Loop foundation. Status discriminator (one
   * of pending / blessed / cursed / ignore / tracked-holdout /
   * withdrawn) determining whether the scanner actively enforces this
   * entry. Entries with `status: blessed` (the default for hand-
   * authored pre-Loop entries) or `status: cursed` are enforced;
   * every other status is skipped (pending awaiting triage, ignore
   * acknowledged false-positive, tracked-holdout deferred, withdrawn
   * overturned by auditor). See `util/catalog-status.ts` for the full
   * lifecycle spec.
   */
  readonly status: CatalogStatus;
  /**
   * provenance block tracking where the entry came
   * from. Synthesized to `{ source: 'install-seed', authored_at: <epoch> }`
   * when the entry omits the field (back-compat with pre-Loop registries;
   * the `catalog-entry-missing-status` doctor rule surfaces these as
   * warnings).
   */
  readonly provenance: Provenance;
  /**
   * REVERSE provenance link. Lists every audit-log
   * Finding-ID that referenced this entry over time. Empty when the
   * entry has never been touched by an auditor. The doctor rule
   * `provenance-orphaned-entries` cross-checks each id against the
   * audit-log to surface broken references.
   */
  readonly auditHistory: readonly string[];
}

/**
 * True iff `relPath` (POSIX, relative to the scanner's CWD) matches any
 * pattern in `entry.excludesPaths` OR equals `entry.canonicalFile`.
 * Used by the scanner to skip a file for this entry BEFORE running the
 * shape patterns. Primary motivation: a canonical primitive's own file
 * whose body IS the legacy shape the entry catches; secondary: test
 * fixtures intentionally carrying the legacy shape as evidence.
 *
 * When `canonicalFile` is set, the exact (POSIX-normalized) match is
 * treated as an implicit exclusion. The scanner's existence check (in
 * `check-anti-patterns.ts`) catches the "primitive renamed but
 * registry not updated" failure mode at scan start; the exclusion
 * here closes the loop by skipping the file once it's confirmed to
 * exist. Auto-exclusion is silent — the scanner emits no log line for
 * the skip; it simply doesn't report the canonical file as a finding.
 */
export function isPathExcluded(entry: AntiPatternEntry, relPath: string): boolean {
  if (entry.canonicalFile !== null && entry.canonicalFile === relPath) {
    return true;
  }
  for (const exclude of entry.excludesPaths) {
    if (exclude.regex.test(relPath)) return true;
  }
  return false;
}

export type ParsedRegistry = ParsedKeyedListRegistry<AntiPatternEntry>;

const SCHEMA: RegistrySchema<AntiPatternEntry> = {
  namespace: NAMESPACE,
  topLevelKey: TOP_LEVEL_KEY,
  parseEntry,
};

/** Read + parse the registry from disk. Throws on parse error or schema violation. */
export async function loadRegistry(path: string): Promise<ParsedRegistry> {
  return loadKeyedListRegistry(path, SCHEMA);
}

/**
 * Parse the registry from a YAML string. Separate from `loadRegistry` so the
 * adversarial validator can plant fixtures in memory without touching disk.
 */
export function parseRegistry(yamlText: string, sourcePath: string): ParsedRegistry {
  return parseKeyedListRegistry(yamlText, sourcePath, SCHEMA);
}

function parseEntry(raw: Record<string, unknown>, ctx: string): AntiPatternEntry {
  const id = requireString(raw, 'id', ctx, NAMESPACE);
  validateKebabId(id, ctx, NAMESPACE);
  parseType(raw['type'], ctx);
  const addedIn = requireString(raw, 'added_in', ctx, NAMESPACE);
  validateGitSha(addedIn, 'added_in', ctx, NAMESPACE);
  const primitive = requireString(raw, 'primitive', ctx, NAMESPACE);
  const from = requireString(raw, 'from', ctx, NAMESPACE);
  const message = requireString(raw, 'message', ctx, NAMESPACE);
  const patterns = parsePatterns(raw['shape_regex'], ctx);
  const minDistance = parseMinDistance(raw['min_distance'], ctx);
  const excludesPaths = parseExcludesPaths(raw['excludes_paths'], ctx);
  const canonicalFile = parseCanonicalFile(raw['canonical_file'], ctx);
  const { metadata } = parseCatalogEntryMetadata(raw, ctx, NAMESPACE);
  const auditHistory = parseAuditHistory(raw['audit_history'], ctx, NAMESPACE);
  return {
    id,
    addedIn,
    primitive,
    from,
    patterns,
    minDistance,
    excludesPaths,
    canonicalFile,
    message,
    status: metadata.status,
    provenance: metadata.provenance,
    auditHistory,
  };
}

/**
 * Parse the optional `type:` discriminator. v1 accepts `'regex'` or
 * absence (treated as `'regex'`); rejects any other value loudly so
 * adopters who pre-author v2 entries against the v1 implementation get
 * an actionable error rather than silent regex fall-through.
 *
 * The extension to `glob` / `ast-grep` / `ts-morph` is tracked at
 * audiocontrol-org/deskwork#285.
 */
function parseType(raw: unknown, ctx: string): void {
  if (raw === undefined || raw === null) return;
  if (typeof raw !== 'string') {
    throw new Error(
      `${NAMESPACE}: ${ctx} \`type\` must be a string; got ${typeof raw}`,
    );
  }
  if (raw !== 'regex') {
    throw new Error(
      `${NAMESPACE}: ${ctx} \`type\` "${raw}" is not yet supported; v1 only implements ` +
        `\`regex\`. Other pattern types (glob / ast-grep / ts-morph) are tracked at ` +
        `audiocontrol-org/deskwork#285.`,
    );
  }
}

/**
 * Parse the optional `canonical_file:` field. Returns `null` when the
 * field is absent; returns the path string verbatim when set (no
 * trimming, no normalization — the auto-exclusion is byte-exact
 * against the CWD-relative POSIX path the scanner constructs).
 * Empty / non-string values raise a parse error.
 *
 * Existence is NOT checked here — see `check-anti-patterns.ts`'s
 * scan-start guard. A multi-step refactor may legitimately update
 * the registry before moving the file.
 */
function parseCanonicalFile(raw: unknown, ctx: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(
      `${NAMESPACE}: ${ctx} \`canonical_file\` must be a non-empty string; got ${typeof raw}`,
    );
  }
  return raw;
}

function parsePatterns(raw: unknown, ctx: string): readonly RegExp[] {
  if (typeof raw === 'string') {
    return [compilePattern(raw, ctx, 0)];
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new Error(`${NAMESPACE}: ${ctx} \`shape_regex\` list must contain >= 1 pattern`);
    }
    return raw.map((value, i) => {
      if (typeof value !== 'string') {
        throw new Error(
          `${NAMESPACE}: ${ctx} \`shape_regex[${i}]\` must be a string; got ${typeof value}`,
        );
      }
      return compilePattern(value, ctx, i);
    });
  }
  throw new Error(
    `${NAMESPACE}: ${ctx} requires \`shape_regex\` (string OR list of strings); got ${typeof raw}`,
  );
}

function compilePattern(source: string, ctx: string, index: number): RegExp {
  if (source.length === 0) {
    throw new Error(`${NAMESPACE}: ${ctx} \`shape_regex[${index}]\` must be non-empty`);
  }
  try {
    return new RegExp(source, REGEX_FLAGS);
  } catch (err) {
    throw new Error(
      `${NAMESPACE}: ${ctx} \`shape_regex[${index}]\` is not a valid regex: ${errorMessage(err)}`,
    );
  }
}

function parseMinDistance(raw: unknown, ctx: string): number {
  if (raw === undefined || raw === null) {
    return DEFAULT_MIN_DISTANCE;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
    throw new Error(
      `${NAMESPACE}: ${ctx} \`min_distance\` must be a positive integer; got ${String(raw)}`,
    );
  }
  return raw;
}

/**
 * Parse the optional `excludes_paths:` field. Missing field OR empty array
 * → no exclusions (returns `[]`). Each element is a literal-path or glob
 * string, compiled via `globToRegex` (literal paths are valid globs).
 * Non-array values or non-string elements raise a descriptive parse error.
 *
 * "A glob that matches nothing" is intentionally NOT an error here — it
 * matches the adopter-manifests stance on globs and keeps the registry
 * tolerant to file renames that the operator will fix on the next run.
 */
function parseExcludesPaths(raw: unknown, ctx: string): readonly ExcludePath[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(
      `${NAMESPACE}: ${ctx} \`excludes_paths\` must be a list; got ${typeof raw}`,
    );
  }
  return raw.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `${NAMESPACE}: ${ctx} \`excludes_paths[${index}]\` must be a non-empty string; got ${typeof value}`,
      );
    }
    let regex: RegExp;
    try {
      regex = globToRegex(value);
    } catch (err) {
      throw new Error(
        `${NAMESPACE}: ${ctx} \`excludes_paths[${index}]\` is not a valid glob: ${errorMessage(err)}`,
      );
    }
    return { pattern: value, regex };
  });
}
