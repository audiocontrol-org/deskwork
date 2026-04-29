/**
 * YAML frontmatter reader/writer for markdown files.
 *
 * Deskwork skills that touch blog posts (draft, publish, distribute) need to
 * read and update frontmatter — e.g. setting `datePublished` when a post
 * ships, reading `contentUrl` when recording a distribution. This module
 * wraps the `yaml` library so callers don't have to hand-roll YAML parsing.
 *
 * ## Shape
 *
 * A file with frontmatter looks like:
 *
 * ```markdown
 * ---
 * title: My Post
 * datePublished: 2026-01-15
 * ---
 *
 * # Body
 * ```
 *
 * `parseFrontmatter` splits this into `data` (parsed YAML) and `body` (the
 * remainder, including the leading newline if present). `stringifyFrontmatter`
 * is the inverse for callers that need to construct frontmatter from scratch.
 *
 * ## Round-trip preservation (Issue #37)
 *
 * Naive parse → mutate → stringify normalizes everything: quoting styles
 * dissolve, comments evaporate, key order shuffles. That bites Astro
 * schemas that demand string scalars: `datePublished: "2020-10-01"`
 * round-trips to `datePublished: 2020-10-01` and re-parses as a `Date`,
 * which `z.string()` rejects.
 *
 * `updateFrontmatter` and `writeFrontmatter` use the yaml library's
 * Document mode (`parseDocument` → mutate AST → `Document.toString()`)
 * so the only bytes that change are the keys we touched. Existing
 * quoting, comments, blank lines, and key order are byte-preserved.
 *
 * Read-only consumers (`parseFrontmatter`, `readFrontmatter`) still use
 * the simpler `parse` API since they don't write anything back.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  parse as parseYaml,
  stringify as stringifyYaml,
  parseDocument,
  isMap,
  isScalar,
  Scalar,
  YAMLMap,
  type Document,
  type ParsedNode,
} from 'yaml';

/** Frontmatter values come back as whatever YAML parses them to. */
export type FrontmatterData = Record<string, unknown>;

export interface ParsedMarkdown {
  data: FrontmatterData;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Split a markdown string into its frontmatter data and body. */
export function parseFrontmatter(markdown: string): ParsedMarkdown {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) {
    return { data: {}, body: markdown };
  }
  const [, yamlContent, body] = match;
  let data: unknown;
  try {
    data = parseYaml(yamlContent);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid YAML frontmatter: ${reason}`);
  }
  if (data === null || data === undefined) {
    return { data: {}, body };
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(
      `Invalid frontmatter: expected a YAML mapping at the top level, got ${typeof data}.`,
    );
  }
  return { data: toFrontmatterData(data), body };
}

/**
 * Build a markdown string from frontmatter data and body.
 *
 * The body is joined to the frontmatter with a single newline — callers that
 * want a blank line between the closing `---` and the body should start their
 * body with `'\n'`.
 *
 * This is for callers that build frontmatter from scratch (e.g. the
 * scaffolder writing a brand-new file). It does NOT preserve formatting
 * since there's no existing source to preserve. Callers performing a
 * read/mutate/write round-trip should use `updateFrontmatter` instead.
 */
export function stringifyFrontmatter(
  data: FrontmatterData,
  body: string,
): string {
  const doc = buildDocument(data);
  return `---\n${doc.toString({ lineWidth: 0 }).replace(/\n$/, '')}\n---\n${body}`;
}

/**
 * Merge a patch into a markdown file's frontmatter and return the new contents.
 *
 * Round-trip-preserving (Issue #37): edits the existing YAML AST in place
 * so untouched keys remain byte-identical. Quoting styles, comments, blank
 * lines, and key order are preserved exactly. Patched keys overwrite
 * existing values; new keys are appended at the bottom of the map.
 *
 * If the file has no frontmatter, one is created with the patch as its
 * only contents.
 */
export function updateFrontmatter(
  markdown: string,
  patch: FrontmatterData,
): string {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) {
    // No existing frontmatter — emit a fresh block. The body becomes
    // the entire input; we prepend a fresh `---…---` block.
    return stringifyFrontmatter(patch, markdown);
  }
  const [, yamlContent, body] = match;
  const doc = parseDocument(yamlContent, { keepSourceTokens: false });
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    throw new Error(`Invalid YAML frontmatter: ${first.message}`);
  }
  applyPatchToDocument(doc, patch);
  // doc.toString() always ends with `\n`; trim it and re-add inside our
  // delimiters so the on-disk shape stays `---\n<yaml>\n---\n<body>`.
  const yamlOut = doc.toString({ lineWidth: 0 }).replace(/\n$/, '');
  return `---\n${yamlOut}\n---\n${body}`;
}

/**
 * Delete keys (or nested key paths) from a markdown file's frontmatter
 * while preserving every other byte (round-trip-preserving, like
 * `updateFrontmatter`).
 *
 * Each path is an array of string keys describing the descent into
 * nested mappings, e.g. `['deskwork', 'id']` removes the `id` field
 * inside the top-level `deskwork:` mapping. Top-level keys can be
 * passed as a single-element path (`['datePublished']`).
 *
 * After a deletion, if the parent collection is left empty AND
 * `pruneEmptyParents` is true (default), the parent collection is also
 * removed. Set false to keep the empty container.
 */
export function removeFrontmatterPaths(
  markdown: string,
  paths: ReadonlyArray<ReadonlyArray<string>>,
  options: { pruneEmptyParents?: boolean } = {},
): string {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) return markdown;
  const [, yamlContent, body] = match;
  const doc = parseDocument(yamlContent);
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    throw new Error(`Invalid YAML frontmatter: ${first.message}`);
  }
  const prune = options.pruneEmptyParents ?? true;

  let mutated = false;
  for (const path of paths) {
    if (path.length === 0) continue;
    if (!doc.hasIn(path)) continue;
    doc.deleteIn(path);
    mutated = true;
    if (prune && path.length > 1) {
      // Walk parents, deleting any that became empty maps.
      for (let depth = path.length - 1; depth >= 1; depth--) {
        const parentPath = path.slice(0, depth);
        const parent = doc.getIn(parentPath, true);
        if (isMap(parent) && parent.items.length === 0) {
          doc.deleteIn(parentPath);
        } else {
          break;
        }
      }
    }
  }

  if (!mutated) return markdown;
  const yamlOut = doc.toString({ lineWidth: 0 }).replace(/\n$/, '');
  return `---\n${yamlOut}\n---\n${body}`;
}

/** Read and parse a markdown file with frontmatter. */
export function readFrontmatter(path: string): ParsedMarkdown {
  return parseFrontmatter(readFileSync(path, 'utf-8'));
}

/**
 * Write a markdown file with frontmatter.
 *
 * Like `stringifyFrontmatter`, this is for callers that build frontmatter
 * from scratch (the scaffolder, primarily). For "read existing file →
 * mutate → write back" flows, prefer reading the file and applying
 * `updateFrontmatter` so existing formatting is preserved.
 */
export function writeFrontmatter(
  path: string,
  data: FrontmatterData,
  body: string,
): void {
  writeFileSync(path, stringifyFrontmatter(data, body), 'utf-8');
}

// ---------------------------------------------------------------------------
// Internal helpers — Document AST mutation.
// ---------------------------------------------------------------------------

/**
 * Apply a `{key: value}` patch to a parsed YAML Document, mutating the
 * AST in place. Existing keys keep their quoting style; new keys are
 * appended at the bottom of the top-level map.
 *
 * Nested objects are written via `setIn` so that `{deskwork: {id: …}}`
 * patches the deeper key without clobbering siblings of `deskwork`.
 */
function applyPatchToDocument(
  doc: Document.Parsed<ParsedNode>,
  patch: FrontmatterData,
): void {
  // The frontmatter block must be a mapping. parseFrontmatter validates
  // this on the read path; for the write path here we treat empty/null
  // contents as a fresh empty map by setting keys directly through the
  // Document API (which lazily creates the top-level container).
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new Error(
      'Cannot patch frontmatter: top-level YAML node is not a mapping.',
    );
  }

  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value)) {
      // Merge into nested map: only keys present in the patch are
      // overwritten; existing siblings under the same parent stay.
      mergeNestedObject(doc, [key], value);
      continue;
    }
    if (isMap(doc.contents)) {
      setScalarPreservingStyle(doc.contents, key, value);
    } else {
      doc.set(key, value);
    }
  }
}

/**
 * Set a scalar (or array) value on a YAMLMap, preserving the existing
 * Scalar node's `type` (quoting style) when the key already exists. This
 * is the round-trip-preservation hook: editing an already-double-quoted
 * key keeps the double quotes.
 */
function setScalarPreservingStyle(
  map: YAMLMap,
  key: string,
  value: unknown,
): void {
  const existing = map.get(key, true);
  if (isScalar(existing)) {
    const next = new Scalar(value);
    if (existing.type !== undefined) next.type = existing.type;
    map.set(key, next);
    return;
  }
  // No existing key, or the existing value was a collection — let the
  // library pick the default representation.
  map.set(key, value);
}

/**
 * Merge a nested-object patch under `path` (e.g. `['deskwork']`) into
 * the document. If the parent doesn't exist, create it as an empty map
 * BEFORE descending. If individual keys under the parent collide,
 * recursively merge so untouched siblings stay put.
 *
 * `Document.setIn` does not auto-vivify intermediate collections; it
 * throws if the parent isn't a YAML collection. We materialize each
 * level explicitly with `setIn(parentPath, {})` whenever it's missing.
 */
function mergeNestedObject(
  doc: Document.Parsed<ParsedNode>,
  path: string[],
  value: Record<string, unknown>,
): void {
  // Ensure every prefix of `path` exists as a YAMLMap. setIn does not
  // auto-vivify intermediate collections; passing a plain `{}` puts a
  // JS object at the slot (which the next setIn refuses to descend
  // into). We materialize each missing level explicitly with a real
  // YAMLMap node so subsequent setIn calls can write into it.
  for (let depth = 1; depth <= path.length; depth++) {
    const prefix = path.slice(0, depth);
    if (!doc.hasIn(prefix)) {
      doc.setIn(prefix, new YAMLMap(doc.schema));
    }
  }

  for (const [k, v] of Object.entries(value)) {
    const fullPath = [...path, k];
    if (isPlainObject(v)) {
      mergeNestedObject(doc, fullPath, v);
      continue;
    }
    doc.setIn(fullPath, v);
  }
}

/**
 * Plain-object check used to decide whether a value should be merged
 * via setIn (preserving sibling keys) or replaced wholesale via set.
 *
 * Plain objects are non-null, non-array, prototype-Object values —
 * Records of unknown.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Build a fresh Document from plain data. Used by `stringifyFrontmatter`
 * for write-from-scratch callers. We round-trip the data through
 * `parseDocument(stringify(...))` rather than constructing nodes by
 * hand so that block-style output (with proper indentation for nested
 * collections) is the default — that's the format every existing
 * scaffold/test asserts on.
 */
function buildDocument(data: FrontmatterData): Document.Parsed<ParsedNode> {
  const initialYaml = stringifyYaml(data, { lineWidth: 0 });
  // Empty data renders as `{}\n`; parseDocument handles both shapes.
  return parseDocument(initialYaml);
}

/**
 * Narrow `unknown` from yaml's `parse` return type to FrontmatterData.
 * The caller has already asserted the parse result is an object and
 * not an array; this is the single point that crosses the typing gap
 * between yaml's `unknown` and our typed surface.
 */
function toFrontmatterData(value: object): FrontmatterData {
  const out: FrontmatterData = {};
  for (const k of Object.keys(value)) {
    out[k] = (value as Record<string, unknown>)[k];
  }
  return out;
}
