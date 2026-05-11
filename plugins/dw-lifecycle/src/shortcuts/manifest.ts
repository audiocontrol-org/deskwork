import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSchemeId, type SchemeId } from './schemes.js';

/**
 * Schema version stamped into every manifest written. Bump in lockstep
 * with breaking changes to {@link ShortcutsManifest}. Read-side
 * validation in {@link readManifest} refuses any other value, which
 * forces an explicit migration path rather than silent coercion.
 */
export const MANIFEST_SCHEMA_VERSION = 1 as const;

/**
 * Canonical filename for the manifest under
 * `${home}/.claude/commands/`. The leading dot keeps it out of the
 * normal slash-command picker — Claude Code only surfaces `*.md` files.
 */
export const MANIFEST_FILENAME = '.dw-lifecycle-shortcuts.json';

export interface ManifestShimEntry {
  command: string;
  shimName: string;
  path: string;
}

export interface ShortcutsManifest {
  version: typeof MANIFEST_SCHEMA_VERSION;
  scheme: SchemeId;
  rename: string | null;
  pluginVersion: string;
  shims: ReadonlyArray<ManifestShimEntry>;
}

/**
 * Resolve the canonical manifest path for a given home directory.
 * Centralized so callers (install, uninstall, doctor) never spell the
 * filename inline — drift between them would be silent breakage.
 */
export function manifestPath(home: string): string {
  return join(home, '.claude', 'commands', MANIFEST_FILENAME);
}

function isManifestShimEntry(value: unknown): value is ManifestShimEntry {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.command === 'string'
    && typeof record.shimName === 'string'
    && typeof record.path === 'string'
  );
}

function isShortcutsManifest(value: unknown): value is ShortcutsManifest {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== MANIFEST_SCHEMA_VERSION) return false;
  if (!isSchemeId(record.scheme)) return false;
  if (record.rename !== null && typeof record.rename !== 'string') return false;
  if (typeof record.pluginVersion !== 'string') return false;
  if (!Array.isArray(record.shims)) return false;
  return record.shims.every(isManifestShimEntry);
}

/**
 * Read + parse + validate the manifest at the given path. Throws with
 * a descriptive error on every failure mode (missing file, malformed
 * JSON, wrong schema version, missing fields). No fallback to a
 * default-shaped manifest — callers that don't have a real manifest
 * should not be calling this.
 */
export function readManifest(path: string): ShortcutsManifest {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read manifest at ${path}: ${reason}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse manifest at ${path}: ${reason}`);
  }

  if (!isShortcutsManifest(parsed)) {
    throw new Error(
      `Manifest at ${path} does not match the expected schema (version ${MANIFEST_SCHEMA_VERSION}).`,
    );
  }
  return parsed;
}

/**
 * Write a manifest to disk as JSON with 2-space indentation and a
 * trailing newline. Mirrors the on-disk shape every adopter has seen
 * since v0.1.0 — do not change the spacing without bumping
 * {@link MANIFEST_SCHEMA_VERSION}.
 */
export function writeManifest(path: string, manifest: ShortcutsManifest): void {
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
