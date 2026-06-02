/**
 * Project-key hash used by the multi-lane swimlane dashboard's
 * client controller to namespace localStorage state per project
 * root.
 *
 * The accepted brief specifies localStorage keys of the shape
 * `deskwork:dashboard:<projectRoot-hash>:focus` (and
 * `:visibility`). Hashing the project root rather than embedding
 * the raw path keeps localStorage keys short, opaque, and free of
 * path-separator collision concerns; it also avoids leaking
 * absolute filesystem paths into the browser's storage when the
 * studio is reverse-proxied.
 *
 * The hash is sha1-12 (12 lowercase hex chars). This is NOT a
 * cryptographic identifier — it's a namespace separator. sha1 is
 * fine here; the truncation guarantees the project key stays
 * compact in the rendered HTML attribute.
 *
 * The companion client controller at
 * `plugins/deskwork-studio/public/src/dashboard/swimlane.ts` reads
 * `shell.dataset.projectKey` and falls back to `window.location.
 * pathname` when the attribute is absent. Emitting the hash here
 * means two projects sharing the same studio route (different
 * project roots, same path) get isolated localStorage namespaces.
 */

import { createHash } from 'node:crypto';

/**
 * Hash a project root path into a 12-char lowercase hex token.
 * Stable across processes (no salt); identical input always
 * produces identical output. Used as the namespace segment for
 * the dashboard's localStorage keys.
 */
export function projectKeyHash(projectRoot: string): string {
  return createHash('sha1').update(projectRoot).digest('hex').slice(0, 12);
}
