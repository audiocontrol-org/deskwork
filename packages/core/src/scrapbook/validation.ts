/**
 * Scrapbook validation + classification helpers.
 *
 * Slug + filename validation runs at every fs entry point; a `..` or
 * absolute path that slips through here would let a malicious request
 * read or write outside the scrapbook tree. The route layer relies on
 * these helpers for traversal protection.
 */

import { extname } from 'node:path';
import type { ScrapbookItemKind } from './types.ts';

// ---------------------------------------------------------------------------
// Slug + path validation
// ---------------------------------------------------------------------------

/**
 * A single slug segment — kebab-case lowercase. Used both for flat
 * slugs and as the building block of hierarchical paths.
 */
const SLUG_SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A full slug path — one or more `/`-separated kebab-case segments.
 * Accepts both legacy flat slugs ("scsi-over-wifi") and hierarchical
 * paths ("the-outbound/characters/strivers"). No leading or trailing
 * slash; no empty segments.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
const FILENAME_RE = /^[a-zA-Z0-9._-][a-zA-Z0-9._ -]*$/;

export function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid slug "${slug}" — must match ${SLUG_RE}`);
  }
}

/**
 * Split a hierarchical slug into its segments. Each segment is a
 * standalone kebab-case identifier.
 */
export function slugSegments(slug: string): string[] {
  return slug.split('/');
}

/**
 * True if a slug refers to a nested entry (has at least one `/`).
 */
export function isNestedSlug(slug: string): boolean {
  return slug.includes('/');
}

// `SLUG_SEGMENT_RE` is exported for callers that need to validate one
// segment at a time (e.g. when assembling a path interactively).
export { SLUG_SEGMENT_RE };

export function assertFilename(name: string): void {
  if (!name || name === '.' || name === '..') {
    throw new Error(`invalid filename "${name}"`);
  }
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`filename may not contain path separators: "${name}"`);
  }
  if (name.startsWith('.')) {
    // Dotfiles are suspicious for a dev-only operator UI. Reject.
    throw new Error(`filename may not start with a dot: "${name}"`);
  }
  if (!FILENAME_RE.test(name)) {
    throw new Error(
      `filename may only contain [A-Za-z0-9._ -]: "${name}"`,
    );
  }
  if (name.length > 200) {
    throw new Error(`filename too long (> 200 chars): "${name}"`);
  }
}

// ---------------------------------------------------------------------------
// Type classification
// ---------------------------------------------------------------------------

export function classify(filename: string): ScrapbookItemKind {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.md':
    case '.markdown':
      return 'md';
    case '.json':
    case '.jsonl':
      return 'json';
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.ts':
    case '.tsx':
    case '.mts':
      return 'js';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.webp':
    case '.svg':
      return 'img';
    case '.txt':
    case '.log':
      return 'txt';
    default:
      return 'other';
  }
}
