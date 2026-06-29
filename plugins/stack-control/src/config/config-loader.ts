// Installation config loader (009 T006) — load + validate
// `.stack-control/config.yaml`, translating snake_case wire keys to camelCase
// in-memory. Mirrors the audit-barrage config-loader's fail-loud, prefixed-error
// style. STRUCTURAL validation only: version, unknown-key rejection, non-empty
// strings, the {feature} placeholder. Path containment/escape (FR-024) needs the
// installation root and lives in resolve-paths.ts.

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isPlainObject } from '../scope-discovery/util/typeguards.js';
import { ACCEPTED_MODELS_LABEL, isAcceptedModel } from '../execute/accepted-models.js';
import { InstallationError } from './errors.js';
import type { InstallationConfig, InstallationPaths, TierMap } from './types.js';

const FEATURE_PLACEHOLDER = '{feature}';

/**
 * Currently-supported config schema versions. An unknown future `version`
 * (e.g. `2`) is a descriptive error, not a silent best-effort v1 parse
 * (data-model § Validation rules). Adding v2 later is a one-line change here.
 */
const SUPPORTED_VERSIONS: ReadonlySet<number> = new Set([1]);

/** Known top-level keys (wire/snake form). Anything else fails loud. */
const KNOWN_TOP_LEVEL = new Set(['version', 'base_dir', 'paths', 'tier_map']);

/** Known `paths.*` keys (wire/snake form) → in-memory camelCase key. */
const PATHS_KEY_MAP: ReadonlyMap<string, keyof InstallationPaths> = new Map([
  ['roadmap', 'roadmap'],
  ['inbox', 'inbox'],
  ['backlog', 'backlog'],
  ['audit_log', 'auditLog'],
  ['fleet_knowledge', 'fleetKnowledge'],
  ['feature_audit_log_pattern', 'featureAuditLogPattern'],
  // session-skills (011) keys.
  ['journal', 'journal'],
  ['tooling_feedback', 'toolingFeedback'],
  ['clone_scope', 'cloneScope'],
]);

/** Read + validate a config file from disk. `configPath` labels every error. */
export function loadInstallationConfig(configPath: string): InstallationConfig {
  let body: string;
  try {
    body = readFileSync(configPath, 'utf8');
  } catch (err) {
    throw new InstallationError(
      'invalid-config',
      `stackctl config: failed to read ${configPath}: ${errorMessage(err)}`,
    );
  }
  return parseInstallationConfig(body, configPath);
}

/** Pure parse + validate + snake→camel translation. `sourceLabel` prefixes errors. */
export function parseInstallationConfig(body: string, sourceLabel: string): InstallationConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(body);
  } catch (err) {
    throw fail(sourceLabel, `malformed YAML: ${errorMessage(err)}`);
  }
  if (!isPlainObject(parsed)) {
    throw fail(sourceLabel, 'top-level value must be a mapping');
  }

  for (const key of Object.keys(parsed)) {
    if (!KNOWN_TOP_LEVEL.has(key)) {
      throw fail(sourceLabel, `unknown top-level key '${key}' (no silent ignore)`);
    }
  }

  const version = requireSupportedVersion(parsed['version'], sourceLabel);
  const config: { version: number; baseDir?: string; paths?: InstallationPaths } = { version };

  if (parsed['base_dir'] !== undefined) {
    config.baseDir = requireNonEmptyString(parsed['base_dir'], 'base_dir', sourceLabel);
  }

  if (parsed['paths'] !== undefined) {
    config.paths = parsePaths(parsed['paths'], sourceLabel);
  }

  if (parsed['tier_map'] !== undefined) {
    config.tierMap = parseTierMap(parsed['tier_map'], sourceLabel);
  }

  return config;
}

/**
 * Parse + validate the additive `tier_map` section (033), mirroring `parsePaths`:
 * fail-loud, no silent ignore. Per contracts/tier-map-config.md — keys are
 * operator-chosen tier labels, values are model keywords in the dispatch surface's
 * accepted-model set (Principle V / FR-007 / FR-008). The value-membership check
 * consults the accepted-model capability constant (D4) — the one model-vocabulary
 * source — so a different host's set requires no edit here.
 */
function parseTierMap(raw: unknown, sourceLabel: string): TierMap {
  if (!isPlainObject(raw)) {
    throw fail(sourceLabel, 'tier_map must be a mapping');
  }
  const out: Record<string, string> = {};
  for (const [label, value] of Object.entries(raw)) {
    if (label.length === 0) {
      throw fail(sourceLabel, 'tier_map has an empty tier label');
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw fail(sourceLabel, `tier_map[${label}] must be a non-empty model keyword (got ${describe(value)})`);
    }
    if (!isAcceptedModel(value)) {
      throw fail(
        sourceLabel,
        `tier_map[${label}] = '${value}' is not an accepted model (${ACCEPTED_MODELS_LABEL})`,
      );
    }
    out[label] = value;
  }
  return out;
}

function parsePaths(raw: unknown, sourceLabel: string): InstallationPaths {
  if (!isPlainObject(raw)) {
    throw fail(sourceLabel, "'paths' must be a mapping");
  }
  const out: { -readonly [K in keyof InstallationPaths]: string } = {};
  for (const [wireKey, value] of Object.entries(raw)) {
    const camel = PATHS_KEY_MAP.get(wireKey);
    if (camel === undefined) {
      throw fail(sourceLabel, `unknown paths.${wireKey} key (no silent ignore)`);
    }
    const str = requireNonEmptyString(value, `paths.${wireKey}`, sourceLabel);
    if (camel === 'featureAuditLogPattern' && !str.includes(FEATURE_PLACEHOLDER)) {
      throw fail(
        sourceLabel,
        `paths.feature_audit_log_pattern must contain the literal '${FEATURE_PLACEHOLDER}' placeholder`,
      );
    }
    out[camel] = str;
  }
  return out;
}

function requireSupportedVersion(value: unknown, sourceLabel: string): number {
  const version = requirePositiveInteger(value, 'version', sourceLabel);
  if (!SUPPORTED_VERSIONS.has(version)) {
    const supported = [...SUPPORTED_VERSIONS].join(', ');
    throw fail(
      sourceLabel,
      `version ${version} is not supported (supported versions: ${supported})`,
    );
  }
  return version;
}

function requirePositiveInteger(value: unknown, field: string, sourceLabel: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw fail(sourceLabel, `${field} must be a positive integer (got ${describe(value)})`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string, sourceLabel: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw fail(sourceLabel, `${field} must be a non-empty string (got ${describe(value)})`);
  }
  return value;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  if (typeof value === 'number') return `${value}`;
  if (typeof value === 'string') return `'${value}'`;
  return typeof value;
}

function fail(sourceLabel: string, message: string): InstallationError {
  return new InstallationError('invalid-config', `stackctl config: ${sourceLabel}: ${message}`);
}
