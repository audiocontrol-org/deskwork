/**
 * Shared manifest field schemas.
 *
 * Canonical, byte-deduplicated zod schemas for fields that appear across more
 * than one manifest (referee-request, surface-status). Extracting them here
 * keeps the collection-relative path contract single-sourced — a tightening in
 * one place (e.g. rejecting `../`-escapes) can never silently diverge between
 * manifests.
 *
 * These are PURE-STRING / structural schemas: no filesystem access, no
 * resolution, no execution. A resolution-time check (symlink-following,
 * subdirectory-manifest containment) is an additive later layer at load time,
 * not a substitute for the string contract here.
 */
import { isAbsolute, normalize } from 'node:path';
import { z } from 'zod';

/**
 * Collection-relative path. Rejects, by pure-string inspection:
 *  - `~` (home-rooted),
 *  - POSIX-absolute (`/...`),
 *  - Windows drive-rooted (`C:...`),
 *  - ANY backslash (`\`) — a portable collection-relative path uses `/` only.
 *    This rejects leading-backslash / UNC roots AND embedded `\..\` escapes,
 *    which the host's `path.normalize()` cannot see on a POSIX host (so
 *    `nested\..\outside.html` would otherwise pass yet is a real parent-escape
 *    for a Windows consumer).
 *  - and any path whose normalized form escapes its own root (starts with
 *    `..`) — a `../`-escape is provably not collection-relative regardless of
 *    resolution context.
 */
export const collectionRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith('~') &&
      !isAbsolute(value) &&
      !/^[A-Za-z]:/.test(value) &&
      !value.includes('\\') &&
      !escapesOwnRoot(value),
    {
      message:
        'paths must be collection-relative; "~", absolute, machine-rooted, backslash-bearing, and "../"-escaping paths are not portable',
    },
  );

/** True when the path, once normalized, climbs above its own root (`..` prefix). */
function escapesOwnRoot(value: string): boolean {
  const normalized = normalize(value);
  return normalized === '..' || normalized.startsWith('../') || normalized.startsWith('..\\');
}

/** Lowercase-hex sha256 digest. */
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex sha256 digest');

/**
 * A captured viewport: an id and a positive integer pixel width. STRICT so an
 * unknown key (e.g. a typo'd field) fails validation rather than being silently
 * stripped — shared by the referee-request and surface-status manifests.
 */
export const viewportSchema = z
  .object({
    id: z.string().min(1),
    width: z.number().int().positive(),
  })
  .strict();

/**
 * Structural shape passed to the shared viewport-contract refinements. The
 * refinements only inspect `id` and `width`, so they accept any array of
 * objects bearing those two readonly fields — the full {@link viewportSchema}
 * value satisfies this.
 */
type ViewportContractEntry = { readonly id: string; readonly width: number };

/**
 * The shared scaffold-required viewport contract: at least one desktop
 * (width >= 1280) and one phone (width <= 390). Single-sourced here so the
 * referee-request and surface-status manifests cannot silently diverge on what
 * "desktop + phone" means (AUDIT-20260614-30).
 */
export function requireDesktopAndPhoneViewports(
  viewports: ReadonlyArray<ViewportContractEntry>,
  ctx: z.RefinementCtx,
): void {
  if (!viewports.some((viewport) => viewport.width >= 1280)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['viewports'],
      message: 'viewports must include at least one desktop viewport with width >= 1280',
    });
  }
  if (!viewports.some((viewport) => viewport.width <= 390)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['viewports'],
      message: 'viewports must include at least one phone viewport with width <= 390',
    });
  }
}

/**
 * Reject any manifest whose declared `viewports[*].id` contains a duplicate
 * (AUDIT-20260614-21, AUDIT-20260614-30). Two viewports sharing an id (e.g.
 * both `"desktop"`) collapse to one identity, which both defeats per-viewport
 * identity coverage (referee-request) and erases the distinct desktop/phone
 * identity the status completion gate depends on. Single-sourced here so both
 * manifests enforce it identically.
 */
export function requireUniqueViewportIds(
  viewports: ReadonlyArray<ViewportContractEntry>,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const viewport of viewports) {
    if (seen.has(viewport.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewports'],
        message: `duplicate viewport id "${viewport.id}"; each declared viewport must have a unique id`,
      });
    }
    seen.add(viewport.id);
  }
}
