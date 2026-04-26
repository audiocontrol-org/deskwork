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
 * is the inverse. `updateFrontmatter` is a convenience that merges a patch
 * into the existing frontmatter and rewrites the file contents.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

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
  return { data: data as FrontmatterData, body };
}

/**
 * Build a markdown string from frontmatter data and body.
 *
 * The body is joined to the frontmatter with a single newline — callers that
 * want a blank line between the closing `---` and the body should start their
 * body with `'\n'`.
 */
export function stringifyFrontmatter(
  data: FrontmatterData,
  body: string,
): string {
  const yaml = stringifyYaml(data, { lineWidth: 0 }).replace(/\n$/, '');
  return `---\n${yaml}\n---\n${body}`;
}

/**
 * Merge a patch into a markdown file's frontmatter and return the new contents.
 *
 * If the file has no frontmatter, one is created with the patch as its only
 * contents. Keys in `patch` overwrite existing keys of the same name.
 */
export function updateFrontmatter(
  markdown: string,
  patch: FrontmatterData,
): string {
  const { data, body } = parseFrontmatter(markdown);
  return stringifyFrontmatter({ ...data, ...patch }, body);
}

/** Read and parse a markdown file with frontmatter. */
export function readFrontmatter(path: string): ParsedMarkdown {
  return parseFrontmatter(readFileSync(path, 'utf-8'));
}

/** Write a markdown file with frontmatter. */
export function writeFrontmatter(
  path: string,
  data: FrontmatterData,
  body: string,
): void {
  writeFileSync(path, stringifyFrontmatter(data, body), 'utf-8');
}
