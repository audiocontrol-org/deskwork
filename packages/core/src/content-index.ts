/**
 * Content index — `{uuid → absolute path}` and `{relative path → uuid}`.
 *
 * Walks `<contentDir>/` for a configured site, parses every markdown file's
 * YAML frontmatter, and records the file's `deskwork.id:` field when present
 * and shaped like a UUID. The result drives id-based file lookups (Phase 19c)
 * and `deskwork doctor`'s validation rules (Phase 19b).
 *
 * Namespace (Issue #38): the binding key lives under a `deskwork:`
 * namespace in frontmatter (`deskwork.id`), NOT at the top level. Older
 * v0.7.0/v0.7.1 files with a top-level `id:` are NOT picked up here —
 * the `legacy-top-level-id-migration` doctor rule surfaces and migrates
 * those.
 *
 * Design notes:
 * - Pure function: each call walks fresh. Callers that want memoization
 *   wrap (the studio memoizes per HTTP request; doctor memoizes per run).
 *   Building the index here means not maintaining a stale-cache invariant.
 * - Files with no `deskwork.id:` are simply omitted — that's the
 *   legitimate pre-bind state. `doctor` reports them via the calendar
 *   join, not by treating "no id" as an error here.
 * - Files with a malformed `deskwork.id:` go into `invalid` so `doctor`
 *   can surface them; they don't pollute `byId` / `byPath`.
 * - On duplicate ids across files, the first encountered (in sorted
 *   directory walk order) wins `byId`; the second is silently dropped
 *   from `byId` but its path still appears in `byPath`. The
 *   `duplicate-id` doctor rule is a separate concern and reads files
 *   directly when reporting.
 *
 * Sibling-relative imports per the project convention — `@/` doesn't
 * resolve under tsx at runtime in this package's `src/`, only in tests.
 */

import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { DeskworkConfig } from './config.ts';
import { resolveContentDir } from './paths.ts';
import { readFrontmatter } from './frontmatter.ts';
import { readAllSidecarsPartitioned } from './sidecar/read-all.ts';
import { listLaneConfigs, loadLaneConfig } from './lanes/loader.ts';

/** A markdown file whose frontmatter `id:` couldn't be used as an index key. */
export interface InvalidIndexEntry {
  /** Absolute path to the offending file. */
  absolutePath: string;
  /** Why the file was rejected — surfaced verbatim by doctor. */
  reason: string;
}

/** Result of scanning a site's content directory for id ↔ path bindings. */
export interface ContentIndex {
  /**
   * uuid → absolute path. Maps an entry's id to the file claiming it via
   * frontmatter `id:`. Studio request-lifecycle and doctor read this to
   * resolve a calendar entry to its file regardless of slug or path.
   */
  byId: Map<string, string>;
  /**
   * Relative path (under contentDir) → uuid. Reverse lookup for code
   * driven by a filesystem walk that needs the entry id for a given
   * file. Both maps are kept in sync — every byId mapping has a
   * matching byPath mapping pointing back at the same uuid.
   */
  byPath: Map<string, string>;
  /**
   * Files that have an `id:` frontmatter but the value isn't a valid
   * UUID v4-shape. Reported by doctor. Files without any `id:` field
   * are NOT reported here — they're just absent from the index, which
   * is the legitimate pre-bind state.
   */
  invalid: InvalidIndexEntry[];
}

/** Directory names skipped by the walk. Matched case-insensitively on the leaf. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'scrapbook',
  'node_modules',
  'dist',
  '.git',
]);

/** Markdown extensions recognized by the walker. */
const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.mdx',
  '.markdown',
]);

/**
 * UUID v4 shape check — 36 chars, lowercase or uppercase hex, hyphens
 * at positions 8/13/18/23. Permissive on the variant nibbles to
 * accommodate v4-but-non-canonical values that the rest of the system
 * already accepts (the parser auto-backfill uses `randomUUID()` which
 * IS canonical, but we shouldn't reject id values that round-tripped
 * through other tooling).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Lowercased extension of a filename, including the leading dot. */
function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx).toLowerCase();
}

/** True when this directory entry name should be skipped during the walk. */
function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.')) return true;
  return SKIP_DIRS.has(name.toLowerCase());
}

/**
 * Recursively collect markdown file paths under `dir`. Returns a sorted
 * list (by absolute path) so the walk is deterministic — same input
 * tree always produces the same maps regardless of OS-level readdir
 * order.
 */
function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  visit(dir);
  out.sort();
  return out;

  function visit(currentDir: string): void {
    let names: string[];
    try {
      names = readdirSync(currentDir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = join(currentDir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (shouldSkipDir(name)) continue;
        visit(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (MARKDOWN_EXTENSIONS.has(extensionOf(name))) {
        out.push(abs);
      }
    }
  }
}

/**
 * Read the frontmatter `id:` value from a markdown file. Returns:
 * - `{ kind: 'absent' }` when there is no `id` field at all (legitimate
 *   pre-bind state — file simply isn't indexed).
 * - `{ kind: 'valid', id }` when `id:` is a valid UUID shape.
 * - `{ kind: 'invalid', reason }` when `id:` is present but unusable.
 *
 * Unreadable / unparseable frontmatter is surfaced as `invalid` so
 * doctor can flag the file rather than silently skipping it.
 */
type IdLookup =
  | { kind: 'absent' }
  | { kind: 'valid'; id: string }
  | { kind: 'invalid'; reason: string };

function readIdFromFrontmatter(absPath: string): IdLookup {
  let parsed;
  try {
    parsed = readFrontmatter(absPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { kind: 'invalid', reason: `unreadable frontmatter: ${reason}` };
  }
  // Issue #38: read `deskwork.id` only — top-level `id:` belongs to the
  // operator, not to deskwork. Files with only a top-level id are
  // surfaced separately by the legacy-top-level-id-migration doctor rule.
  const deskworkBlock = parsed.data.deskwork;
  if (deskworkBlock === undefined || deskworkBlock === null) {
    return { kind: 'absent' };
  }
  if (typeof deskworkBlock !== 'object' || Array.isArray(deskworkBlock)) {
    return {
      kind: 'invalid',
      reason: `frontmatter deskwork is ${typeof deskworkBlock}, expected mapping`,
    };
  }
  const raw = (deskworkBlock as Record<string, unknown>).id;
  if (raw === undefined) return { kind: 'absent' };
  if (typeof raw !== 'string') {
    return {
      kind: 'invalid',
      reason: `frontmatter deskwork.id is ${typeof raw}, expected string`,
    };
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return {
      kind: 'invalid',
      reason: 'frontmatter deskwork.id is empty',
    };
  }
  if (!isUuid(trimmed)) {
    return {
      kind: 'invalid',
      reason: `frontmatter deskwork.id "${trimmed}" is not a valid UUID`,
    };
  }
  return { kind: 'valid', id: trimmed };
}

/**
 * Bind each file's frontmatter UUID into the `byId` / `byPath` maps,
 * recording parse failures on `invalid`. Shared by both index builders
 * (`buildContentIndex`'s contentDir walk + `buildContentIndexFromSidecars`'s
 * sidecar-driven discovery). `baseDir` is the root the stored `byPath` key
 * is made relative to. First-encountered wins for `byId` on duplicate ids
 * (callers pass a deterministically-ordered `files` so "first" is stable);
 * `byPath` records every path so a later caller can still resolve uuid by
 * path even for the colliding entry.
 */
function bindFilesToIndex(
  files: readonly string[],
  baseDir: string,
  byId: Map<string, string>,
  byPath: Map<string, string>,
  invalid: InvalidIndexEntry[],
): void {
  for (const abs of files) {
    const lookup = readIdFromFrontmatter(abs);
    if (lookup.kind === 'absent') continue;
    if (lookup.kind === 'invalid') {
      invalid.push({ absolutePath: abs, reason: lookup.reason });
      continue;
    }
    const rel = relative(baseDir, abs);
    if (!byId.has(lookup.id)) {
      byId.set(lookup.id, abs);
    }
    byPath.set(rel, lookup.id);
  }
}

/**
 * Build a content index for one site. Walks `<contentDir>/`, parses
 * every markdown file's frontmatter, and binds `id ↔ path` where the
 * frontmatter declares a valid UUID.
 *
 * Returns empty maps when `<contentDir>` doesn't exist (e.g. a freshly
 * configured site with nothing on disk yet) — the caller can still
 * proceed; doctor will report calendar entries with no matching files.
 */
export function buildContentIndex(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
): ContentIndex {
  const contentDir = resolveContentDir(projectRoot, config, site);
  const byId = new Map<string, string>();
  const byPath = new Map<string, string>();
  const invalid: InvalidIndexEntry[] = [];

  let files: string[];
  try {
    files = collectMarkdownFiles(contentDir);
  } catch {
    return { byId, byPath, invalid };
  }

  bindFilesToIndex(files, contentDir, byId, byPath, invalid);

  return { byId, byPath, invalid };
}

/**
 * Build a content index driven by the sidecar set (Phase 39c — sites→lanes
 * retirement, scope item 7).
 *
 * Where `buildContentIndex` walks a site's `contentDir` to DISCOVER files,
 * this builder discovers the content roots from the sidecars themselves:
 * the sidecar is the source of truth (Phase 30), and `entry.artifactPath`
 * points at each entry's on-disk file. We collect the directory of every
 * entry's resolved artifact, walk each unique directory for markdown files,
 * and bind `id ↔ path` exactly as `buildContentIndex` does — but WITHOUT a
 * configured `site` / `contentDir` axis. This lets the doctor (and any other
 * project-scoped consumer) build a content index for a project whose
 * `config.sites` has been migrated away.
 *
 * `byPath` keys are PROJECT-ROOT-relative (matching `entry.artifactPath`'s
 * own base — `resolveStoredArtifactPath` joins it against `projectRoot`), so
 * callers reconstruct absolute paths with `join(projectRoot, relPath)`. This
 * differs from `buildContentIndex`, whose `byPath` keys are contentDir-
 * relative.
 *
 * Entries without an `artifactPath` contribute no discovery root (their
 * location is unknown until `doctor --fix` backfills it). A directory that
 * doesn't exist on disk yet is silently skipped (the walk tolerates ENOENT).
 */
/**
 * Collect the lane `scaffoldDefaults` directories (absolute). These are
 * the lanes' add-time content roots — where new files land. Including
 * them in the discovery set lets the sidecar-driven index also find
 * content that has no sidecar yet (orphan files, duplicate-id collisions,
 * legacy top-level-id files), which the doctor rules that walk "the
 * content tree" depend on. A lane that declares no `scaffoldDefaults`
 * contributes nothing. Malformed lane files are skipped (loadLaneConfig
 * throws — other doctor rules surface those).
 */
function collectLaneScaffoldDirs(projectRoot: string): string[] {
  const roots = new Set<string>();
  for (const laneId of listLaneConfigs(projectRoot, { includeArchived: true })) {
    let lane;
    try {
      lane = loadLaneConfig(laneId, projectRoot);
    } catch {
      continue;
    }
    const scaffold = lane.scaffoldDefaults;
    if (scaffold === undefined) continue;
    for (const dir of Object.values(scaffold)) {
      if (typeof dir === 'string' && dir.length > 0) {
        roots.add(join(projectRoot, dir));
      }
    }
  }
  return [...roots];
}

/**
 * The discovery roots for the sidecar-driven content index (Phase 39c):
 * the union of (a) every entry's resolved artifact DIRECTORY and (b)
 * every lane's `scaffoldDefaults` directory. (a) finds bound content;
 * (b) finds not-yet-bound content (orphans / duplicates / legacy ids)
 * sitting in a lane's add-time content root. Returns absolute paths,
 * de-duplicated and sorted for deterministic walks.
 */
export async function collectSidecarArtifactDirs(
  projectRoot: string,
): Promise<string[]> {
  // Use the PARTITIONED reader: a corrupt sidecar must NOT abort index
  // construction. The doctor builds this index at the start of every run
  // (`runner.ts` `buildContext`); a throwing reader here would crash the
  // whole audit before any rule executes — including the rules whose job
  // is to surface the corruption gracefully (sites-to-lanes-migration's
  // AUDIT-20260603-14 error-finding path). Malformed sidecars contribute
  // no discovery root; the rules report them.
  const { entries } = await readAllSidecarsPartitioned(projectRoot);
  const roots = new Set<string>();
  for (const entry of entries) {
    if (entry.artifactPath === undefined || entry.artifactPath === '') continue;
    const absArtifact = join(projectRoot, entry.artifactPath);
    roots.add(dirname(absArtifact));
  }
  for (const dir of collectLaneScaffoldDirs(projectRoot)) {
    roots.add(dir);
  }
  return [...roots].sort();
}

export async function buildContentIndexFromSidecars(
  projectRoot: string,
): Promise<ContentIndex> {
  const roots = await collectSidecarArtifactDirs(projectRoot);

  const byId = new Map<string, string>();
  const byPath = new Map<string, string>();
  const invalid: InvalidIndexEntry[] = [];

  const files = new Set<string>();
  for (const root of roots) {
    for (const abs of collectMarkdownFiles(root)) {
      files.add(abs);
    }
  }
  // Deterministic order: sort so byId's first-wins on a duplicate id is
  // stable across runs (mirrors buildContentIndex's sorted walk).
  bindFilesToIndex([...files].sort(), projectRoot, byId, byPath, invalid);

  return { byId, byPath, invalid };
}
