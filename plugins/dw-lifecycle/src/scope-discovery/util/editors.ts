/**
 * plugins/dw-lifecycle/src/scope-discovery/util/editors.ts
 *
 * Single-source-of-truth for "the set of parallel top-level modules
 * participating in cross-module symmetry checks." Consumed by the
 * editor-symmetry matrix builder (Family B) and by Family A's
 * regime-holdout-detector (which surfaces symmetry-cell holdouts).
 *
 * # Terminology
 *
 * The audiocontrol pilot uses the term "editor" for "a parallel
 * top-level module sharing canonical primitives with its peers" (each
 * device-family editor lives under `modules/<slug>-editor/`). The
 * concept generalizes beyond audiocontrol: any project with parallel
 * top-level modules that share canonical primitives benefits from the
 * (manifest x module) symmetry matrix. The term "editor" is preserved
 * verbatim across the scope-discovery layer (schema field
 * `editor_symmetry:`, manifest section `regime_holdouts.editor_symmetry`,
 * `RegimeHoldoutSource` type, etc.) because renaming would invalidate
 * the Phase 3 schema and types already at destination. Read "editor"
 * as "parallel top-level module" anywhere in this file.
 *
 * # Module-root parameterization
 *
 * The pilot hard-coded `MODULES_DIR = 'modules'` and filtered
 * directories to those ending in `-editor`. dw-lifecycle generalizes
 * both axes:
 *   - module-root is a parameter on every helper (callers pass the
 *     resolved repo-relative module-root from `DiscoveryAgentInput`).
 *   - the `-editor` suffix filter is dropped by default; every child
 *     directory under `<rootAbs>/<moduleRoot>/` is returned. Projects
 *     that need a name filter can supply it via the optional
 *     `nameFilter` parameter on `discoverEditors`.
 *
 * The exported function names retain the "editor" connotation for
 * cross-layer naming consistency (matrix renderer, regime-holdout
 * derivation, manifest schema) — see "Terminology" above.
 */

import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { resolve } from 'node:path';
import { errorMessage, isEnoent } from './typeguards.js';

/**
 * Discover the set of parallel top-level modules under
 * `<rootAbs>/<moduleRoot>/`. Returns sorted slugs (the directory
 * names). Throws on infra errors; returns an empty array when the
 * module-root does not exist (callers treat that as "no editors ->
 * matrix is empty").
 *
 * @param rootAbs Absolute path to the project root.
 * @param moduleRoot Relative path (from `rootAbs`) to the directory
 *   holding parallel top-level modules. Defaults to `'src'`.
 * @param nameFilter Optional predicate filtering directory names. By
 *   default every child directory is returned. Projects that need a
 *   suffix gate (e.g. the audiocontrol `-editor` convention) pass a
 *   custom filter.
 */
export async function discoverEditors(
  rootAbs: string,
  moduleRoot: string = 'src',
  nameFilter: (name: string) => boolean = () => true,
): Promise<readonly string[]> {
  const modulesRoot = resolve(rootAbs, moduleRoot);
  // `readdir(dir, { withFileTypes: true })` returns Dirent<string>[];
  // pin the overload's return shape so the Buffer overload union
  // doesn't leak under strict settings.
  let entries: Dirent<string>[];
  try {
    entries = await readdir(modulesRoot, { withFileTypes: true });
  } catch (err) {
    if (isEnoent(err)) return [];
    throw new Error(`editors: cannot read ${modulesRoot}: ${errorMessage(err)}`);
  }
  const editors: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (!nameFilter(entry.name)) continue;
    editors.push(entry.name);
  }
  editors.sort();
  return editors;
}

/**
 * Bucket a repo-relative POSIX path to its owning editor module, if
 * any. A path under `<moduleRoot>/<editor>/...` returns `<editor>`
 * when `<editor>` is in `editors`; otherwise returns null.
 *
 * Path-based bucketing rather than glob-based: a glob like
 * `src/{foo,bar}/...` covers two modules. The compiled regex matches
 * paths in either tree, and the matrix wants to surface BOTH columns.
 * Enumerating the matched files and bucketing by
 * `<moduleRoot>/<editor>/` prefix is the simplest correct answer.
 */
export function editorForPath(
  repoRelPath: string,
  editors: readonly string[],
  moduleRoot: string = 'src',
): string | null {
  const segments = repoRelPath.split('/');
  if (segments.length < 2 || segments[0] !== moduleRoot) return null;
  const candidate = segments[1];
  if (candidate === undefined) return null;
  return editors.includes(candidate) ? candidate : null;
}

/**
 * Determine the static directory prefix of a glob, splitting at the
 * first wildcard-bearing segment. Returns the prefix as an array of
 * literal segments (empty array if the very first segment has a
 * wildcard). Brace alternations are expanded into one prefix per
 * alternative — the caller treats each prefix as a separate edge of
 * the glob's coverage. Patterns with nested braces are not supported
 * (the glob compiler rejects those at parse time).
 *
 * Examples (input -> flattened prefixes):
 *   `src/foo/lib/**\/x.tsx`
 *     -> [['src', 'foo', 'lib']]
 *   `src/{foo,bar}/lib/**\/x.tsx`
 *     -> [['src', 'foo', 'lib'], ['src', 'bar', 'lib']]
 *   `src/**\/x.tsx`
 *     -> [['src']]
 *   `src/*-editor/lib/**\/x.tsx`
 *     -> [['src']]   (wildcard in segment #2 -> prefix stops at #1)
 */
export function staticPrefixes(globPattern: string): readonly (readonly string[])[] {
  const expanded = expandBraceAlternatives(globPattern);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const variant of expanded) {
    const prefix = leadingLiteralSegments(variant);
    const key = prefix.join('/');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(prefix);
    }
  }
  return out;
}

/**
 * Compute which editors a glob targets by inspecting the glob's
 * static directory prefix. An editor is targeted if either:
 *   (a) the prefix is `<moduleRoot>/<editor>/...` (matches the editor
 *       directory literally), or
 *   (b) the prefix is `<moduleRoot>` or shorter (the glob spans all
 *       editors via a wildcard in the editor-segment position).
 *
 * Order of the returned slugs matches `editors`. Used by the matrix
 * to decide n/a vs ✗-with-zero cells: an editor not in the targeted
 * set gets a — cell; an editor in the targeted set with zero matching
 * files gets a ✗ cell (the glob was supposed to find files in that
 * editor but didn't — possible regime drift).
 */
export function editorsTargetedByGlob(
  globPattern: string,
  editors: readonly string[],
  moduleRoot: string = 'src',
): readonly string[] {
  const prefixes = staticPrefixes(globPattern);
  const targeted = new Set<string>();
  for (const prefix of prefixes) {
    if (prefix.length === 0 || prefix[0] !== moduleRoot) {
      // The glob doesn't start with `<moduleRoot>/...`. Treat as
      // spanning all editors (e.g., a hypothetical `lib/**`); the
      // matrix is editor-scoped and the manifest authoring convention
      // is `<moduleRoot>/<editor>/...`, so this is a misauthored
      // glob, but we don't reject — we include every editor and let
      // the matched-file count decide ✗ vs ✓.
      for (const e of editors) targeted.add(e);
      continue;
    }
    if (prefix.length === 1) {
      // Prefix is exactly `<moduleRoot>` — glob spans all editors.
      for (const e of editors) targeted.add(e);
      continue;
    }
    // Prefix is `<moduleRoot>/<X>/...` — X must be in the editor set.
    const candidate = prefix[1];
    if (candidate !== undefined && editors.includes(candidate)) {
      targeted.add(candidate);
    }
  }
  return editors.filter((e) => targeted.has(e));
}

/**
 * Internal: expand `{a,b,c}` alternations into a flat list of variant
 * patterns. Mirrors the glob compiler's brace expansion but emits
 * strings (not regex pieces) so callers can inspect the static
 * prefix. Throws on unmatched / nested braces, same as the compiler.
 */
function expandBraceAlternatives(pattern: string): readonly string[] {
  const variants: string[] = [''];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern.charAt(i);
    if (ch === '{') {
      const closeIndex = pattern.indexOf('}', i + 1);
      if (closeIndex === -1) {
        throw new Error(`editors: unmatched '{' at index ${i} in "${pattern}"`);
      }
      const inner = pattern.substring(i + 1, closeIndex);
      if (inner.includes('{')) {
        throw new Error(`editors: nested braces not supported in "${pattern}"`);
      }
      const parts = inner.split(',').map((s) => s.trim());
      const next: string[] = [];
      for (const v of variants) {
        for (const p of parts) next.push(v + p);
      }
      variants.splice(0, variants.length, ...next);
      i = closeIndex + 1;
    } else {
      for (let k = 0; k < variants.length; k += 1) {
        const current = variants[k];
        if (current !== undefined) variants[k] = current + ch;
      }
      i += 1;
    }
  }
  return variants;
}

/**
 * Return the leading literal-path segments of a glob (no wildcards).
 * Stops at the first segment containing `*`, `?`, or `**`. A segment
 * that is purely literal contributes; everything after the first
 * wildcard-bearing segment is dropped.
 */
function leadingLiteralSegments(pattern: string): string[] {
  const segments = pattern.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '**' || seg.includes('*') || seg.includes('?')) break;
    out.push(seg);
  }
  return out;
}
