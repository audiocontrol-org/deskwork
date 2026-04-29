/**
 * ingest-paths.ts — markdown file collection for ingest discovery.
 *
 * Walks a list of operator-supplied paths (file / directory / glob)
 * and produces a deduplicated, deterministically-ordered list of
 * `CollectedFile` records — each one a markdown file paired with the
 * "discovery root" it was found under. The root is what slug derivation
 * uses to compute the file's path-relative slug.
 *
 * Glob expansion is hand-rolled to avoid pulling a dep onto the
 * discovery hot path. The supported pattern surface — `*`, `**`, `?`,
 * `[...]` — covers every operator pattern surfaced in the issue (e.g.
 * `src/content/essays/​**​/*.md`).
 */

import {
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

const MARKDOWN_EXTENSIONS = ['.md', '.mdx', '.markdown'] as const;

/**
 * A discovered markdown file paired with its discovery root — the
 * directory the operator's path argument resolved to (or the deepest
 * static prefix for a glob). Slug derivation computes the slug as
 * the file's path relative to this root, so siblings of a flat
 * collection ("essays/foo/index.md", "essays/bar/index.md") get
 * unprefixed slugs while deeper nesting produces hierarchical slugs.
 */
export interface CollectedFile {
  filePath: string;
  root: string;
}

/**
 * Walk every supplied path and return a deduplicated, sorted list of
 * `CollectedFile` records. First-seen wins for root attribution: if
 * the same file is reachable from two paths the operator passed, the
 * first path's discovery root is canonical.
 */
export function collectMarkdownFiles(paths: string[]): CollectedFile[] {
  const seen = new Map<string, CollectedFile>();
  for (const p of paths) {
    for (const file of expandPath(p)) {
      if (!seen.has(file.filePath)) {
        seen.set(file.filePath, file);
      }
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.filePath.localeCompare(b.filePath),
  );
}

function expandPath(input: string): CollectedFile[] {
  const absolute = isAbsolute(input) ? input : resolve(process.cwd(), input);

  if (containsGlob(input)) {
    return expandGlob(absolute);
  }

  if (!existsSync(absolute)) {
    throw new Error(`Path does not exist: ${input}`);
  }

  const stat = statSync(absolute);
  if (stat.isFile()) {
    if (!hasMarkdownExtension(absolute)) {
      throw new Error(
        `Path is not a markdown file: ${input} (expected one of ${MARKDOWN_EXTENSIONS.join(', ')})`,
      );
    }
    // For a single-file argument the discovery root is the file's
    // parent — no hierarchical prefix.
    return [{ filePath: absolute, root: dirnameOf(absolute) }];
  }
  if (stat.isDirectory()) {
    return walkDirectory(absolute, absolute);
  }
  return [];
}

function dirnameOf(filePath: string): string {
  const idx = filePath.lastIndexOf(sep);
  if (idx <= 0) return sep;
  return filePath.slice(0, idx);
}

function walkDirectory(dir: string, root: string): CollectedFile[] {
  const out: CollectedFile[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDirectory(child, root));
    } else if (entry.isFile() && hasMarkdownExtension(entry.name)) {
      out.push({ filePath: child, root });
    }
  }
  return out;
}

function containsGlob(input: string): boolean {
  return /[*?[]/.test(input);
}

/**
 * Minimal glob expansion supporting `*`, `**`, `?`, and `[...]`.
 *
 * The deepest static prefix becomes the discovery root so slugs are
 * computed relative to it (e.g. `src/posts/​**​/*.md` uses `src/posts`
 * as the slug-derivation root).
 */
function expandGlob(absolutePattern: string): CollectedFile[] {
  const segments = absolutePattern.split(sep);
  let rootEnd = 0;
  for (let i = 0; i < segments.length; i++) {
    if (containsGlob(segments[i])) break;
    rootEnd = i;
  }
  const root = segments.slice(0, rootEnd + 1).join(sep) || sep;
  const remainder = segments.slice(rootEnd + 1);

  if (!existsSync(root)) {
    return [];
  }

  return matchPattern(root, remainder, root);
}

function matchPattern(
  currentDir: string,
  remaining: string[],
  root: string,
): CollectedFile[] {
  if (remaining.length === 0) {
    if (statSync(currentDir).isFile() && hasMarkdownExtension(currentDir)) {
      return [{ filePath: currentDir, root }];
    }
    return [];
  }
  const [head, ...rest] = remaining;
  const out: CollectedFile[] = [];

  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return out;
  }

  if (head === '**') {
    // Match zero or more directories, then continue with `rest`.
    out.push(...matchPattern(currentDir, rest, root));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        out.push(
          ...matchPattern(join(currentDir, entry.name), remaining, root),
        );
      }
    }
    return out;
  }

  const matcher = globSegmentMatcher(head);
  for (const entry of entries) {
    if (!matcher(entry.name)) continue;
    const child = join(currentDir, entry.name);
    if (rest.length === 0) {
      if (entry.isFile() && hasMarkdownExtension(entry.name)) {
        out.push({ filePath: child, root });
      }
    } else if (entry.isDirectory()) {
      out.push(...matchPattern(child, rest, root));
    }
  }
  return out;
}

function globSegmentMatcher(pattern: string): (name: string) => boolean {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '[') {
      const close = pattern.indexOf(']', i);
      if (close === -1) {
        re += '\\[';
      } else {
        re += pattern.slice(i, close + 1);
        i = close;
      }
    } else if (/[\\^$+().{}|]/.test(ch)) re += `\\${ch}`;
    else re += ch;
  }
  re += '$';
  const compiled = new RegExp(re);
  return (name) => compiled.test(name);
}

export function hasMarkdownExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export { MARKDOWN_EXTENSIONS };
