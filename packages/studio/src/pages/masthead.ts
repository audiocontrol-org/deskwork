/**
 * Universal masthead chrome for studio surfaces (v7 architecture).
 *
 * Per `DESIGN-STANDARDS.md § Studio navigation model`, every studio
 * surface carries a three-column masthead:
 *
 *   `24px (← back) | 1fr (center stack) | 24px (⋮ menu)`
 *
 * On the Desk (`isHub: true`) the back-link is absent — you're already
 * home — and the grid collapses to `1fr | 24px`. Every cell is
 * `align-items: center`; the masthead's bottom-border rule clears
 * every content baseline so nothing is struck through.
 *
 * Center stack composition:
 *   - Top row: kicker (mono caps, red, with optional inline meta after a
 *     paper-3 separator). The kicker is always present.
 *   - Bottom row: either `slug` (mono, slug-shaped surfaces) OR `title`
 *     (italic display, hub-shaped surfaces). Callers pass exactly one
 *     of the two — passing both throws.
 *
 * Glyph contracts (per design-standards):
 *   - `←` italic-display 1.35rem in `--er-proof-blue` (8.13:1 vs paper),
 *     navigates to `/dev/editorial-studio`.
 *   - `⋮` mono 1.2rem in `--er-ink-soft` (8.92:1 vs paper). The button
 *     does nothing yet; Step 2.2.7 wires the popover menu.
 *   - Each glyph has a ≥44×44px tap target via padding+margin (visual
 *     remains 24px square).
 *
 * The masthead is mobile-only (≤600px). CSS hides it on desktop so
 * existing desktop chrome (folio + er-strip + er-pagehead) keeps its
 * exact present-day appearance. Desktop refinement is out-of-scope for
 * this feature branch (per the design-standards "separate feature
 * branch" note).
 *
 * This file ships the helper + the markup contract. The companion
 * stylesheet is `plugins/deskwork-studio/public/css/mobile-shell.css`.
 */

import { html, unsafe, escapeHtml, type RawHtml } from './html.ts';

export interface MastheadOpts {
  /**
   * Top kicker line. Mono caps, red. Example: `entry · drafting · № 12`.
   * Pre-rendered HTML may be included via `kickerHtml` instead when the
   * kicker carries inline markup (e.g. a `<span class="platform">`).
   */
  readonly kicker?: string;

  /**
   * Raw HTML alternative to `kicker`. Used when the kicker carries
   * inline ornament (platform tag, dim spans, etc.). Caller is
   * responsible for any escaping; pass through `escapeHtml` for any
   * user-supplied substring.
   */
  readonly kickerHtml?: RawHtml;

  /**
   * Bottom-row body when the surface is slug-shaped (entry-review,
   * shortform-review). Rendered as mono. Mutually exclusive with
   * `title`.
   */
  readonly slug?: string;

  /**
   * Bottom-row body when the surface is hub-shaped (Desk). Rendered as
   * italic display. Mutually exclusive with `slug`.
   */
  readonly title?: string;

  /**
   * Optional inline meta appended to the kicker line after a paper-3
   * `·` separator. Example: `v3 · 2h`, `№ 03`. Mono, dim color.
   */
  readonly metaInline?: string;

  /**
   * `true` on the Desk only. Suppresses the `←` back-link and collapses
   * the grid to `1fr | 24px`.
   */
  readonly isHub: boolean;

  /**
   * Optional id for the `⋮` button element. Step 2.2.7 will look this
   * up to wire the popover. Defaults to `masthead-menu-trigger`.
   */
  readonly menuTriggerId?: string;
}

const DESK_HREF = '/dev/editorial-studio';

function renderKicker(opts: MastheadOpts): RawHtml {
  const meta = opts.metaInline
    ? html`<span class="er-masthead-kicker-sep">·</span><span class="er-masthead-meta-inline">${opts.metaInline}</span>`
    : '';
  if (opts.kickerHtml !== undefined) {
    return unsafe(html`<div class="er-masthead-kicker">${opts.kickerHtml}${unsafe(meta)}</div>`);
  }
  if (opts.kicker !== undefined) {
    return unsafe(html`<div class="er-masthead-kicker">${opts.kicker}${unsafe(meta)}</div>`);
  }
  return unsafe('<div class="er-masthead-kicker" aria-hidden="true"></div>');
}

function renderBody(opts: MastheadOpts): RawHtml {
  if (opts.slug !== undefined && opts.title !== undefined) {
    throw new Error(
      'renderMasthead: pass exactly one of { slug, title }, not both.',
    );
  }
  if (opts.slug !== undefined) {
    return unsafe(`<div class="er-masthead-slug">${escapeHtml(opts.slug)}</div>`);
  }
  if (opts.title !== undefined) {
    return unsafe(`<div class="er-masthead-title">${escapeHtml(opts.title)}</div>`);
  }
  return unsafe('');
}

/**
 * Render the universal masthead. Returns RawHtml so callers can embed
 * the result directly in `html\`…${renderMasthead(...)}…\`` templates.
 */
export function renderMasthead(opts: MastheadOpts): RawHtml {
  const triggerId = opts.menuTriggerId ?? 'masthead-menu-trigger';
  const hubClass = opts.isHub ? ' er-masthead--hub' : '';
  const backLink = opts.isHub
    ? ''
    : html`<a class="er-masthead-back" href="${DESK_HREF}" aria-label="Back to the Desk" title="Back to the Desk">←</a>`;
  const kicker = renderKicker(opts);
  const body = renderBody(opts);
  return unsafe(html`
    <header class="er-masthead${unsafe(hubClass)}" data-er-masthead role="banner">
      ${unsafe(backLink)}
      <div class="er-masthead-center">
        ${kicker}
        ${body}
      </div>
      <button
        type="button"
        class="er-masthead-menu"
        id="${triggerId}"
        data-er-masthead-menu
        aria-haspopup="true"
        aria-expanded="false"
        aria-label="Studio menu"
        title="Studio menu"
      >⋮</button>
    </header>`);
}
