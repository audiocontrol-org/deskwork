/**
 * Measure the chrome stack's bottom edge (folio + strip) and publish
 * it as `--er-chrome-bottom` on `<body>`, so any sticky element below
 * the strip can use it as their `top` offset and never sit behind the
 * strip regardless of how many rows it wraps to.
 *
 * Why dynamic: the strip's height varies with viewport width because
 * `.er-strip-inner` is `flex-wrap: wrap`. At 1280px it might fit in 2
 * rows; at 1600px it fits in 1; at 1920px the decision strip pushes
 * back to 2. A static `top: 6.5rem` is right for some widths and
 * wrong for others. Measuring + republishing on resize keeps sticky
 * elements (marginalia head) lined up with the strip's actual bottom.
 *
 * No-op on pages without a `.er-strip`.
 */

export function initStickyOffset(): void {
  const strip = document.querySelector<HTMLElement>('.er-strip');
  if (!strip) return;

  function publish(): void {
    if (!strip) return;
    const bottom = strip.getBoundingClientRect().bottom;
    // Add a small visual gap (4px) so the sticky head doesn't sit
    // pixel-tight against the strip's bottom border.
    document.body.style.setProperty('--er-chrome-bottom', `${Math.round(bottom + 4)}px`);
  }

  publish();
  // Re-publish on resize (viewport width drives flex-wrap row count)
  // and on the strip's own size changes (decision-strip changes when
  // edit/preview toggles).
  const ro = new ResizeObserver(publish);
  ro.observe(strip);
  window.addEventListener('resize', publish);
}
