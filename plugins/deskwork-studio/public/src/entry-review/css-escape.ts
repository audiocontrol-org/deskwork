/**
 * CSS attribute-selector escaper for `[data-attr="..."]` queries.
 *
 * `CSS.escape` is the canonical browser API; jsdom in some
 * configurations does not expose it (older versions, restricted
 * environments). We fall back to a conservative literal allow-list
 * (alphanumerics, dash, underscore). Comment ids + annotation ids
 * use URL-safe characters only, so the allow-list covers them in
 * practice without requiring full CSS-spec escape semantics.
 *
 * Shared between `annotations.ts` (per-comment sidebar lookup) and
 * `thread-render.ts` (per-thread-root sidebar lookup) so the two
 * call sites stay in lockstep on the same escaping behavior.
 */
export function cssEscapeForSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9\-_]/g, (ch) => `\\${ch}`);
}
