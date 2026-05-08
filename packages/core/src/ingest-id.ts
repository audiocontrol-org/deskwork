/**
 * ingest-id.ts — UUID-from-frontmatter helper for the ingest pipeline.
 *
 * The `/dw-lifecycle:setup` skill stamps `deskwork.id` into a freshly
 * scaffolded PRD's frontmatter so that the subsequent `deskwork ingest`
 * call can bind the calendar entry, sidecar, and journal record to the
 * same UUID the bootstrap chose. Issue #197: pre-fix, ingest ignored
 * the existing UUID and minted a fresh one with `randomUUID()`, then
 * silently rewrote the source file's frontmatter — breaking the
 * setup → ingest handoff documented in `.claude/CLAUDE.md`.
 *
 * This helper centralizes the read-and-validate step. Two regression
 * shapes live elsewhere (`content-index.ts` for index population,
 * `doctor/rules/missing-frontmatter-id.ts` for candidate filtering);
 * keep this one focused on the "is the UUID present + valid" question
 * the ingest layer needs.
 *
 * Sibling-relative imports per the project convention — `@/` doesn't
 * resolve under tsx at runtime in this package's `src/`, only in tests.
 */

import type { FrontmatterData } from './frontmatter.ts';

/**
 * UUID v4 shape check — 36 chars, hex with hyphens at positions
 * 8/13/18/23. Matches the permissive shape used by `content-index.ts`
 * so values that round-tripped through other tooling continue to be
 * accepted (we don't gatekeep on the variant nibbles).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Type predicate: true when `value` is a non-null, non-array object.
 * Used to type-narrow the `deskwork` block of frontmatter from
 * `unknown` to `Record<string, unknown>` without a synthetic cast.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read `deskwork.id` from a markdown file's parsed frontmatter and
 * return it iff it's a valid UUID. Returns `null` when the field is
 * absent, malformed, or not a UUID — the caller mints a fresh UUID in
 * that case.
 *
 * The frontmatter shape is `Record<string, unknown>`, so this helper
 * narrows `frontmatter.deskwork` via a type predicate rather than a
 * synthetic `as` cast.
 */
export function readExistingDeskworkId(
  frontmatter: FrontmatterData,
): string | null {
  const block = frontmatter.deskwork;
  if (!isPlainRecord(block)) return null;
  const id = block.id;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed === '') return null;
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed;
}
