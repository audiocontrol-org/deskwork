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
 *  - leading backslash / UNC (`\...`),
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
      !value.startsWith('\\') &&
      !escapesOwnRoot(value),
    {
      message:
        'paths must be collection-relative; "~", absolute, machine-rooted, and "../"-escaping paths are not portable',
    },
  );

/** True when the path, once normalized, climbs above its own root (`..` prefix). */
function escapesOwnRoot(value: string): boolean {
  const normalized = normalize(value);
  return normalized === '..' || normalized.startsWith('../') || normalized.startsWith('..\\');
}

/** Lowercase-hex sha256 digest. */
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex sha256 digest');

/** A captured viewport: an id and a positive integer pixel width. */
export const viewportSchema = z.object({
  id: z.string().min(1),
  width: z.number().int().positive(),
});
