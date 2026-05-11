import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isSchemeId, type SchemeId } from './schemes.js';

/**
 * Conservative match for shim filenames: lowercase alphanumeric with
 * optional internal dashes; must start and end alphanumeric. This is
 * also what install-shortcuts enforces on `--rename <prefix>`. Sharing
 * the pattern keeps the install-side (where the operator can pass an
 * untrusted CLI argument) and the read-side (where the manifest itself
 * could be hand-edited) gated by the same character set.
 *
 * The validation matters because {@link shimPathFor} concatenates the
 * `shimName` into a `${shimName}.md` filename joined under
 * {@link commandsDir}. A `shimName` of `"../../etc/passwd"` would
 * otherwise resolve to `/etc/passwd.md`, and downstream destructive
 * paths (install's `--replace` cleanup and `--force-uninstall`) would
 * happily call `rmSync` on it.
 */
const SHIM_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

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

/**
 * Manifest shim entries store only the logical identity (`command` +
 * `shimName`). Absolute paths are reconstructed at consumer time via
 * {@link shimPathFor}, so the manifest stays portable across home-dir
 * relocations (a tarball-and-extract into a fresh user account keeps
 * working without rewriting paths in the manifest).
 */
export interface ManifestShimEntry {
  command: string;
  shimName: string;
}

export interface ShortcutsManifest {
  version: typeof MANIFEST_SCHEMA_VERSION;
  scheme: SchemeId;
  rename: string | null;
  pluginVersion: string;
  shims: ReadonlyArray<ManifestShimEntry>;
}

/**
 * Resolve the canonical `.claude/commands/` directory under a given
 * home. Centralized so callers (install, uninstall, doctor) never spell
 * the path inline.
 */
export function commandsDir(home: string): string {
  return join(home, '.claude', 'commands');
}

/**
 * Resolve the canonical manifest path for a given home directory.
 * Centralized so callers (install, uninstall, doctor) never spell the
 * filename inline — drift between them would be silent breakage.
 */
export function manifestPath(home: string): string {
  return join(commandsDir(home), MANIFEST_FILENAME);
}

/**
 * Reconstruct the absolute on-disk path of a shim from its logical
 * identity (`shimName`) plus the host home directory. The manifest does
 * NOT store this path itself — see {@link ManifestShimEntry} — so this
 * helper is the single source of truth for the mapping.
 *
 * Belt-and-suspenders: even though {@link readManifest} validates
 * `shimName` against {@link SHIM_NAME_PATTERN} on the read path, we
 * additionally verify here that the resolved path lands UNDER
 * {@link commandsDir}. Any future code path that constructs a
 * `shimName` from an untrusted source without going through the
 * manifest reader will still be caught by this inner check before any
 * destructive caller (`rmSync` under `--replace` or
 * `--force-uninstall`) touches the filesystem.
 */
export function shimPathFor(home: string, shimName: string): string {
  const dir = commandsDir(home);
  const resolved = join(dir, `${shimName}.md`);
  const rel = relative(dir, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `Refusing to construct shim path outside commands directory: `
        + `shimName=${JSON.stringify(shimName)} `
        + `resolved=${JSON.stringify(resolved)} `
        + `commandsDir=${JSON.stringify(dir)}`,
    );
  }
  return resolved;
}

function isManifestShimEntry(value: unknown): value is ManifestShimEntry {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.command === 'string'
    && typeof record.shimName === 'string'
    && SHIM_NAME_PATTERN.test(record.shimName)
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
 * Extract a printable representation of the on-disk manifest's version
 * field for error messages. We don't trust the structure (the file may
 * have any JSON shape on a schema-mismatch path), so we only surface
 * primitive values; anything object-shaped or absent becomes
 * `<unknown>`.
 */
function describeOnDiskVersion(parsed: unknown): string {
  if (typeof parsed !== 'object' || parsed === null) return '<unknown>';
  const v = (parsed as Record<string, unknown>).version;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
    return String(v);
  }
  return '<unknown>';
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
    const onDisk = describeOnDiskVersion(parsed);
    throw new Error(
      `Manifest at ${path} has schema version ${onDisk}; this dw-lifecycle knows version ${MANIFEST_SCHEMA_VERSION}. ` +
        `Upgrade dw-lifecycle, or remove the manifest by hand to force a fresh install.`,
    );
  }
  return parsed;
}

/**
 * Write a manifest to disk atomically: serialize to a sibling `.tmp`
 * file, then `renameSync` it into place. `renameSync` is atomic on
 * POSIX for same-filesystem renames, which `~/.claude/commands/`
 * always is. The canonical manifest existing on disk thereby implies a
 * successful install; a half-written `.tmp` left behind after a crash
 * does NOT register as a valid prior install.
 *
 * The on-disk shape is pretty-printed JSON (2-space indent) with a
 * trailing newline — do not change the spacing without bumping
 * {@link MANIFEST_SCHEMA_VERSION}.
 */
export function writeManifest(path: string, manifest: ShortcutsManifest): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}
