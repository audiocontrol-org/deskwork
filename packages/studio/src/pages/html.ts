/**
 * HTML tagged-template helper.
 *
 * `html` escapes interpolated values by default. `unsafe(s)` wraps a
 * pre-built HTML string in an opaque marker so the tag inlines it raw.
 *
 * Behaviour summary for interpolated values:
 *   - `null` / `undefined` / `false`        → ''
 *   - `unsafe(...)` (object with `__raw`)   → inserted verbatim
 *   - Array<string>                          → joined with no separator
 *     (so `${items.map(i => html`...`)}` Just Works)
 *   - everything else                        → escaped via `escapeHtml`
 *
 * No JSX, no virtual DOM — just string concatenation. The studio is a
 * tiny dev-only surface, so the simplest thing that gets escaping
 * right is the right thing.
 */

/** Marker shape for raw-HTML embeds. */
export interface RawHtml {
  readonly __raw: string;
}

/** Wrap a pre-built HTML string so the `html` tag inlines it without escaping. */
export function unsafe(s: string): RawHtml {
  return { __raw: s };
}

/** Type guard for `unsafe(...)` values. */
function isRaw(value: unknown): value is RawHtml {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__raw' in value &&
    typeof (value as { __raw: unknown }).__raw === 'string'
  );
}

/**
 * Escape a string for safe insertion into HTML text or attribute context.
 * `&` first, then `<`, `>`, `"`, `'`. The single-quote escape lets the
 * same function serve both contexts without a separate `escapeAttr`.
 */
export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (isRaw(value)) return value.__raw;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : '';
  // Stringify objects defensively — the only legitimate object case is the
  // `unsafe(...)` marker, which we handled above. Anything else is a
  // template author bug; show it loudly so it gets caught in tests.
  return escapeHtml(String(value));
}

/**
 * Tagged-template helper. Static parts go in verbatim; interpolated
 * values run through `renderValue`.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += renderValue(values[i]);
  }
  return out;
}

// Re-export glossary helpers so page renderers can use them in template literals
export { gloss } from '../lib/glossary-helper.ts';
export type { GlossaryKey } from '../lib/glossary-helper.ts';
