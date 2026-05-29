/**
 * plugins/dw-lifecycle/src/scope-discovery/deprecation-scan.ts
 *
 * Deprecation-driven scan (Phase 6 Task 2). Walks the source tree for
 * file-level `@deprecated` markers and counts remaining importers per
 * deprecated file. Two output buckets per scan:
 *
 *   - `blocked`        — deprecated file with one or more importers
 *                        outside its own source. Deletion is blocked
 *                        until every importer migrates.
 *   - `safeToDelete`   — deprecated file with zero importers. Safe to
 *                        remove in the next refactor commit; the
 *                        operator consults this queue to drain.
 *
 * Marker grammar (v1, **file-level only**):
 *
 *   1. JSDoc `@deprecated` tag inside the FIRST top-of-file docblock.
 *      The docblock must be syntactically a `/** ... *\/` block at
 *      the very start of the file (whitespace + shebang permitted
 *      before it).
 *
 *   2. Inline `// DEPRECATED:` line comment within the first 20 lines
 *      of the file. The marker is the entire comment line; the
 *      message is the substring after `DEPRECATED:`.
 *
 * Symbol-level deprecation (e.g., `@deprecated` on a single exported
 * function within a file that still has other live exports) is OUT OF
 * SCOPE FOR v1. The file-level scope matches the operator's "delete
 * this file when importers reach 0" lifecycle, which is the use case
 * this gate exists to serve. A future expansion could add symbol-level
 * granularity if a use case arises; the project's other scope-discovery
 * gates are pure-regex and we mirror that posture.
 *
 * Importer detection (v1, **pure regex**):
 *
 *   - Builds a per-deprecated-file regex covering:
 *       - `import ... from '<spec>'`
 *       - `export ... from '<spec>'`
 *       - dynamic `import('<spec>')`
 *       - CommonJS `require('<spec>')`
 *   - `<spec>` is the union of:
 *       a) the `@/` alias form of the file's path (e.g.,
 *          `@/components/ui/EnvelopeDisplay`),
 *       b) a basename-relative form (any `./...<basename>` or
 *          `../...<basename>` path that ends in the file's basename
 *          without its extension).
 *   - The file's own contents are NOT scanned for its own importers;
 *     a deprecated file's internal re-exports / doc-comment
 *     self-references do not count as "external importers."
 *
 * The `@/` alias form is computed by stripping the configured
 * `moduleRoot` prefix from the file's repo-relative path. `moduleRoot`
 * defaults to `src` so that a deprecated file at
 *   `src/components/ui/EnvelopeDisplay.tsx`
 * resolves to alias spec
 *   `@/components/ui/EnvelopeDisplay`
 * (matching the project-wide TypeScript path-alias convention). When
 * a project uses a non-`src` module root (e.g., `modules/<editor>/src`
 * in the audiocontrol pilot), pass the literal root through the
 * `moduleRoot` option. The alias form is only emitted for files whose
 * path actually lives under `moduleRoot`; files outside that prefix
 * (top-level CLI scripts, `tools/`, etc.) are still detected via the
 * basename-relative path form.
 *
 * # DRY
 *
 * Re-uses `listFilesMatching` + `toPosix` from `util/glob.ts` (the same
 * walker every other Phase 2/4 scanner uses) and `errorMessage` from
 * `util/typeguards.ts`. The pure-regex stance matches the rest of the
 * scope-discovery layer.
 *
 * # Source
 *
 * Ported from the audiocontrol pilot's
 * `tools/scope-discovery/deprecation-scan.ts` (commit history under
 * `audiocontrol-org/audiocontrol-scope-discovery-protocol`). Adapted
 * for dw-lifecycle's configurable `moduleRoot` (the pilot hard-coded
 * `modules/<editor>/src/`).
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { listFilesMatching, toPosix } from './util/glob.js';
import { errorMessage } from './util/typeguards.js';

/** Extensions the scanner inspects for deprecation markers. */
const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx']);

/** Directories the walker never descends into. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.git',
  '.dw-lifecycle',
]);

/** Walk pattern: every `.ts` / `.tsx` file under the scan root. */
const WALK_PATTERN: readonly RegExp[] = [/^.+\.(?:ts|tsx)$/];

/** Inline marker prefix. The line must start with this (after optional whitespace). */
const INLINE_MARKER_PREFIX = '// DEPRECATED:';

/** Maximum line count to scan for inline `// DEPRECATED:` markers. */
const INLINE_MARKER_MAX_LINES = 20;

/** Regex matching a top-of-file JSDoc block opener (after optional shebang / blank lines). */
const TOP_DOCBLOCK_OPEN_RE = /^(?:#![^\n]*\n)?\s*\/\*\*/;

/** A single deprecated source file. */
export interface DeprecatedFile {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** Message extracted from the marker (text after `@deprecated ` or `DEPRECATED:`). */
  readonly message: string;
  /** Whether the marker was JSDoc (`@deprecated`) or inline (`// DEPRECATED:`). */
  readonly markerKind: 'jsdoc' | 'inline';
  /** Importer files (repo-relative POSIX path + 1-based line number of the first import match). */
  readonly importers: readonly DeprecatedImporter[];
}

export interface DeprecatedImporter {
  readonly path: string;
  readonly line: number;
}

export interface ScanResult {
  /** Deprecated files with at least one importer. */
  readonly blocked: readonly DeprecatedFile[];
  /** Deprecated files with zero importers. */
  readonly safeToDelete: readonly DeprecatedFile[];
  /** Total number of source files visited during the walk. */
  readonly filesVisited: number;
}

export interface ScanOptions {
  readonly scanRoot: string;
  /**
   * Repo-relative module root used to compute `@/` alias specifiers.
   * Defaults to `src`. The single-source-of-truth for this convention
   * lives in the project's `tsconfig.json` paths. Pass an explicit
   * value when the project diverges.
   */
  readonly moduleRoot?: string;
}

const DEFAULT_MODULE_ROOT = 'src';

/**
 * Top-level scan entry. Walks the source tree once, identifies
 * deprecated files, then walks the tree a second time to count
 * importers per deprecated file. Two passes because the second pass
 * needs the set of deprecated files in hand.
 */
export async function scan(opts: ScanOptions): Promise<ScanResult> {
  const rootAbs = resolve(opts.scanRoot);
  const moduleRoot = opts.moduleRoot ?? DEFAULT_MODULE_ROOT;
  const allFiles = await listFilesMatching(rootAbs, WALK_PATTERN, SKIP_DIRS, SCANNED_EXTENSIONS);
  const deprecatedRaw: DeprecatedRaw[] = [];
  for (const abs of allFiles) {
    const content = await readFileSafe(abs);
    const marker = detectMarker(content);
    if (marker === null) continue;
    deprecatedRaw.push({
      absPath: abs,
      relPath: toPosix(toRepoRel(abs, rootAbs)),
      message: marker.message,
      markerKind: marker.kind,
    });
  }
  if (deprecatedRaw.length === 0) {
    return { blocked: [], safeToDelete: [], filesVisited: allFiles.length };
  }
  // Build per-deprecated-file importer regex + scan every non-self file.
  const importerSearches = deprecatedRaw.map((d) => buildImporterSearch(d.relPath, moduleRoot));
  const importersById = new Map<string, DeprecatedImporter[]>();
  for (const d of deprecatedRaw) importersById.set(d.relPath, []);
  for (const candidateAbs of allFiles) {
    const candidateRel = toPosix(toRepoRel(candidateAbs, rootAbs));
    const content = await readFileSafe(candidateAbs);
    importerSearches.forEach((search, idx) => {
      const deprecated = deprecatedRaw[idx];
      if (deprecated === undefined) return;
      if (deprecated.relPath === candidateRel) return;
      const match = findFirstImport(content, search.regex);
      if (match === null) return;
      const bucket = importersById.get(deprecated.relPath);
      if (bucket !== undefined) {
        bucket.push({ path: candidateRel, line: match.line });
      }
    });
  }
  const blocked: DeprecatedFile[] = [];
  const safeToDelete: DeprecatedFile[] = [];
  for (const d of deprecatedRaw) {
    const importers = (importersById.get(d.relPath) ?? []).slice().sort(byPathThenLine);
    const file: DeprecatedFile = {
      path: d.relPath,
      message: d.message,
      markerKind: d.markerKind,
      importers,
    };
    if (importers.length === 0) safeToDelete.push(file);
    else blocked.push(file);
  }
  blocked.sort(byDeprecatedPath);
  safeToDelete.sort(byDeprecatedPath);
  return { blocked, safeToDelete, filesVisited: allFiles.length };
}

interface DeprecatedRaw {
  readonly absPath: string;
  readonly relPath: string;
  readonly message: string;
  readonly markerKind: 'jsdoc' | 'inline';
}

interface MarkerDetection {
  readonly kind: 'jsdoc' | 'inline';
  readonly message: string;
}

/**
 * Inspect a file's source for a v1 deprecation marker. Returns the
 * marker kind + extracted message, or null if neither form is present.
 *
 * Precedence: JSDoc tag wins if both are present (the JSDoc form is
 * the more rigorous of the two and any inline marker in the same file
 * is redundant).
 */
export function detectMarker(content: string): MarkerDetection | null {
  const jsdoc = detectJsDocDeprecated(content);
  if (jsdoc !== null) return { kind: 'jsdoc', message: jsdoc };
  const inline = detectInlineDeprecated(content);
  if (inline !== null) return { kind: 'inline', message: inline };
  return null;
}

/**
 * Look for `@deprecated [message]` inside the top-of-file JSDoc block.
 * The JSDoc block must be the FIRST non-trivial element of the file
 * (optional shebang + optional leading whitespace before the `/**`).
 * Any subsequent docblocks (above individual symbols) are ignored
 * — that's the symbol-level scope which v1 doesn't address.
 *
 * The message is everything on the `@deprecated` line after the tag,
 * trimmed; if the tag has no inline content, returns the empty string.
 */
function detectJsDocDeprecated(content: string): string | null {
  if (!TOP_DOCBLOCK_OPEN_RE.test(content)) return null;
  const openIdx = content.indexOf('/**');
  if (openIdx === -1) return null;
  const closeIdx = content.indexOf('*/', openIdx + 3);
  if (closeIdx === -1) return null;
  const block = content.substring(openIdx + 3, closeIdx);
  // Find `@deprecated` as a whole word within the block. The regex
  // ignores leading ` * ` line prefixes that JSDoc blocks decorate
  // each line with.
  const deprecatedRe = /(^|\s)@deprecated\b([^\n]*)/m;
  const match = deprecatedRe.exec(block);
  if (match === null) return null;
  // Strip a trailing `*/` fragment (the case where `@deprecated` lives
  // on the closing line) and any trailing whitespace.
  const raw = (match[2] ?? '').replace(/\*\/.*$/, '').trim();
  return raw;
}

/**
 * Look for `// DEPRECATED: <message>` within the first
 * INLINE_MARKER_MAX_LINES lines. Matches the line-comment form a few
 * files use as an alternative to the JSDoc tag.
 */
function detectInlineDeprecated(content: string): string | null {
  const lines = content.split('\n');
  const ceiling = Math.min(lines.length, INLINE_MARKER_MAX_LINES);
  for (let i = 0; i < ceiling; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trimStart();
    if (trimmed.startsWith(INLINE_MARKER_PREFIX)) {
      return trimmed.substring(INLINE_MARKER_PREFIX.length).trim();
    }
  }
  return null;
}

interface ImporterSearch {
  readonly regex: RegExp;
}

/**
 * Build the importer-detection regex for one deprecated file. The
 * regex matches any of:
 *   - import / export / require / dynamic-import statements whose
 *     specifier is the file's `@/`-alias form,
 *   - or a relative-path form (`./<basename>` / `../**\/<basename>`)
 *     where `<basename>` is the file's basename without its extension.
 *
 * Specifier endings: a TypeScript import statement may write the
 * specifier with or without the `.js` extension (the project's
 * convention is *with* `.js` for relative paths; without for `@/`).
 * The pattern matches both shapes.
 *
 * Self-importer detection happens at the call site (we skip the file
 * whose path equals the deprecated file's path).
 */
function buildImporterSearch(deprecatedRelPath: string, moduleRoot: string): ImporterSearch {
  const aliasSpec = toAliasSpec(deprecatedRelPath, moduleRoot);
  const noExt = stripExtension(basename(deprecatedRelPath));
  const escapedAlias = aliasSpec === null ? null : escapeRegex(aliasSpec);
  const escapedBase = escapeRegex(noExt);
  // Specifier shapes to match.
  const specifierAlternatives: string[] = [];
  if (escapedAlias !== null) {
    // `@/...` with optional trailing `.js` to handle both extension
    // shapes the codebase emits.
    specifierAlternatives.push(`${escapedAlias}(?:\\.js)?`);
  }
  // Relative-path form: at least one `./` / `../` segment, ending in
  // the basename + optional `.js`. The leading `./` requirement
  // disambiguates from a literal basename appearing inside an
  // unrelated `@/...` path that just happens to share the same final
  // segment.
  specifierAlternatives.push(
    `(?:\\.\\.?/)(?:[^'"\\s]*?/)?${escapedBase}(?:\\.[tj]sx?)?`,
  );
  const specifierUnion = specifierAlternatives.join('|');
  const pattern =
    `(?:` +
    `(?:import|export)\\s+(?:[^'"]*\\sfrom\\s+)?['"](?:${specifierUnion})['"]` +
    `|` +
    `import\\s*\\(\\s*['"](?:${specifierUnion})['"]\\s*\\)` +
    `|` +
    `require\\s*\\(\\s*['"](?:${specifierUnion})['"]\\s*\\)` +
    `)`;
  return { regex: new RegExp(pattern, 'gm') };
}

/**
 * Convert a repo-relative path like
 *   `src/components/ui/EnvelopeDisplay.tsx`
 * into its `@/`-alias form:
 *   `@/components/ui/EnvelopeDisplay`
 *
 * The `@/` prefix resolves to the configured `moduleRoot` (default
 * `src`). Returns null if the path doesn't sit under `moduleRoot` (a
 * top-level CLI script, a `tools/...` file, etc.). The basename-
 * relative form still catches importers of those files.
 *
 * The pilot's audiocontrol layout (`modules/<editor>/src/...`) is
 * supported by passing `moduleRoot` like
 *   `modules/roland-sxx0-editor/src`
 * — the prefix strips correctly and the alias form lands as
 *   `@/components/ui/EnvelopeDisplay`.
 *
 * Multi-module repos (one `@/` alias per module) would need a per-
 * module mapping; that's left to a follow-up if a use case surfaces.
 */
function toAliasSpec(relPath: string, moduleRoot: string): string | null {
  const normalized = moduleRoot.replace(/\/$/, '');
  if (normalized.length === 0) return null;
  const escaped = escapeRegex(normalized);
  const re = new RegExp(`^(?:[^/]+/)*${escaped}/(.+)$`);
  // Two acceptance forms:
  //   1. `<moduleRoot>/...` — top-level layout (e.g. `src/...`).
  //   2. `<any-prefix>/<moduleRoot>/...` — module-bundled layout
  //      (e.g. `modules/<editor>/src/...`).
  // Trying simple-prefix first lets the common case stay fast.
  if (relPath.startsWith(`${normalized}/`)) {
    const inside = relPath.substring(normalized.length + 1);
    return `@/${stripExtension(inside)}`;
  }
  const match = re.exec(relPath);
  if (match === null) return null;
  const inside = match[1];
  if (inside === undefined) return null;
  return `@/${stripExtension(inside)}`;
}

function stripExtension(path: string): string {
  const ext = extname(path);
  return ext.length === 0 ? path : path.substring(0, path.length - ext.length);
}

interface ImportMatch {
  readonly line: number;
}

/**
 * Find the first importer match in a file's content. Returns the
 * 1-based line number of the match, or null if no match.
 */
function findFirstImport(content: string, importRe: RegExp): ImportMatch | null {
  importRe.lastIndex = 0;
  const match = importRe.exec(content);
  if (match === null) return null;
  const upto = content.substring(0, match.index);
  const line = upto.split('\n').length;
  return { line };
}

function byDeprecatedPath(a: DeprecatedFile, b: DeprecatedFile): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function byPathThenLine(a: DeprecatedImporter, b: DeprecatedImporter): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return a.line - b.line;
}

function toRepoRel(abs: string, rootAbs: string): string {
  if (abs === rootAbs) return '';
  if (abs.startsWith(rootAbs + '/')) return abs.substring(rootAbs.length + 1);
  return abs;
}

async function readFileSafe(path: string): Promise<string> {
  try {
    const fileStat = await stat(path);
    if (fileStat.size === 0) return '';
    return await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`deprecation-scan: failed to read ${path}: ${errorMessage(err)}`);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
