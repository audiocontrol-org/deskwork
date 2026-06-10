// Scope-discovery config loader (010 T060) — load + validate
// `<installation>/.stack-control/scope-discovery/config.yaml`. This is the
// scope-discovery feature's OWN config, independent of the 009 installation
// config (`<installation>/.stack-control/config.yaml`): it carries its own
// `schemaVersion`, per-agent activation flags, and an open `tunables` object
// (ast-grep pattern locations, forbidden-phrase overrides, prd stopwords/
// top-N, etc.).
//
// Style MIRRORS config/config-loader.ts exactly: fail-loud, prefixed errors,
// STRUCTURAL validation only (version, unknown-top-level-key rejection, typed
// fields), no `any`/`as`/`@ts-ignore`. Created lazily-and-announced (009
// FR-016): `ensureSdConfig` writes the default when absent so a verb that
// needs the config can self-bootstrap; the `scope-discovery-config-missing`
// doctor rule surfaces the install hint when neither the dir nor the file
// exists.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isPlainObject } from './util/typeguards.js';

/** The scope-discovery config marker, relative to an installation root. */
export const SD_CONFIG_REL_PATH = join('.stack-control', 'scope-discovery', 'config.yaml');

/**
 * Currently-supported scope-discovery config schema versions. Independent of
 * the 009 installation-config version line (a scope-discovery shape change
 * bumps this set without touching the installation config). An unknown future
 * `schemaVersion` fails loud rather than parsing best-effort.
 */
const SUPPORTED_VERSIONS: ReadonlySet<number> = new Set([1]);

/** Current default schemaVersion seeded by `ensureSdConfig`. */
export const CURRENT_SD_CONFIG_VERSION = 1;

/** Known top-level keys (wire/snake form). Anything else fails loud. */
const KNOWN_TOP_LEVEL = new Set(['schema_version', 'agents', 'tunables']);

/** Per-agent activation flags (open map: agent-name → enabled boolean). */
export type SdAgentFlags = Readonly<Record<string, boolean>>;

/**
 * Open tunables bag. The scope-discovery surface evolves (ast-grep pattern
 * locations, forbidden-phrase overrides, prd stopwords / top-N), so the
 * loader validates STRUCTURE (a mapping) and leaves per-key interpretation to
 * the consuming verb — each tunable consumer fails loud on a shape it can't use.
 */
export type SdTunables = Readonly<Record<string, unknown>>;

/** Parsed + validated scope-discovery config (in-memory, camelCase). */
export interface SdConfig {
  /** Schema version — required positive integer; an unknown version fails loud. */
  readonly schemaVersion: number;
  /** Per-agent activation flags. Absent in the file → empty map. */
  readonly agents: SdAgentFlags;
  /** Open tunables mapping. Absent in the file → empty map. */
  readonly tunables: SdTunables;
}

/** Read + validate a scope-discovery config file from disk. `configPath` labels every error. */
export function loadSdConfig(configPath: string): SdConfig {
  let body: string;
  try {
    body = readFileSync(configPath, 'utf8');
  } catch (err) {
    throw fail(configPath, `failed to read: ${errorMessage(err)}`);
  }
  return parseSdConfig(body, configPath);
}

/** Pure parse + validate + snake→camel translation. `sourceLabel` prefixes errors. */
export function parseSdConfig(body: string, sourceLabel: string): SdConfig {
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

  const schemaVersion = requireSupportedVersion(parsed['schema_version'], sourceLabel);
  const agents = parsed['agents'] !== undefined ? parseAgents(parsed['agents'], sourceLabel) : {};
  const tunables =
    parsed['tunables'] !== undefined ? parseTunables(parsed['tunables'], sourceLabel) : {};

  return { schemaVersion, agents, tunables };
}

function parseAgents(raw: unknown, sourceLabel: string): SdAgentFlags {
  if (!isPlainObject(raw)) {
    throw fail(sourceLabel, "'agents' must be a mapping of agent-name → boolean");
  }
  const out: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'boolean') {
      throw fail(sourceLabel, `agents.${name} must be a boolean (got ${describe(value)})`);
    }
    out[name] = value;
  }
  return out;
}

function parseTunables(raw: unknown, sourceLabel: string): SdTunables {
  if (!isPlainObject(raw)) {
    throw fail(sourceLabel, "'tunables' must be a mapping");
  }
  // STRUCTURAL only — values stay opaque; each consuming verb validates the
  // tunable shape it reads and fails loud on a shape it cannot use.
  return { ...raw };
}

function requireSupportedVersion(value: unknown, sourceLabel: string): number {
  const version = requirePositiveInteger(value, 'schema_version', sourceLabel);
  if (!SUPPORTED_VERSIONS.has(version)) {
    const supported = [...SUPPORTED_VERSIONS].join(', ');
    throw fail(
      sourceLabel,
      `schema_version ${version} is not supported (supported versions: ${supported})`,
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

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  if (typeof value === 'number') return `${value}`;
  if (typeof value === 'string') return `'${value}'`;
  return typeof value;
}

function fail(sourceLabel: string, message: string): Error {
  return new Error(`stackctl scope-discovery config: ${sourceLabel}: ${message}`);
}

/** The default config body seeded when none exists (snake_case wire form). */
export const DEFAULT_SD_CONFIG_BODY = `schema_version: ${CURRENT_SD_CONFIG_VERSION}\nagents: {}\ntunables: {}\n`;

export interface EnsureSdConfigResult {
  readonly path: string;
  readonly created: boolean;
  readonly config: SdConfig;
}

/**
 * Created lazily-and-announced (009 FR-016): resolve the scope-discovery
 * config path under `installationRoot`; create the default when absent;
 * return the parsed config plus whether it was just written. A verb that
 * needs the config calls this; the doctor `scope-discovery-config-missing`
 * rule surfaces the install hint for the dir-absent case.
 */
export function ensureSdConfig(installationRoot: string): EnsureSdConfigResult {
  const path = join(installationRoot, SD_CONFIG_REL_PATH);
  if (existsSync(path)) {
    return { path, created: false, config: loadSdConfig(path) };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, DEFAULT_SD_CONFIG_BODY, 'utf8');
  return { path, created: true, config: parseSdConfig(DEFAULT_SD_CONFIG_BODY, path) };
}
