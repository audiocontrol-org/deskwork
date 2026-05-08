/**
 * iOS Safari visual-viewport sync.
 *
 * iOS Safari has two viewports:
 *   - Layout viewport: stays at the device width regardless of keyboard
 *     (e.g. 402px on iPhone 17 Pro). All CSS lengths (`100vw`, layout
 *     of fixed-position elements, etc.) compute against this.
 *   - Visual viewport: shrinks when the soft keyboard appears (e.g.
 *     402 → 352). Represents the user-visible portion of the page.
 *
 * Pages sized to the layout viewport extend past the visual viewport
 * when the keyboard is up, leaving fixed-position chrome (the edit
 * toolbar's right side) clipped behind the keyboard area. The user
 * can pan-zoom the visual viewport across the wider layout, which
 * reads as horizontal "sloshing."
 *
 * Fix: when the visual viewport differs from the layout viewport
 * (i.e. the keyboard is up), shrink the html / body / review-shell
 * to match. The page reflows to the smaller width and chrome stays
 * inside the visible area.
 *
 * Coarse-pointer only (touch devices). On desktop the visualViewport
 * tracks the layout viewport so this is a no-op.
 */

export function initVisualViewportSync(): void {
  if (!window.visualViewport) return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;

  function sync(): void {
    if (!window.visualViewport) return;
    const w = window.visualViewport.width;
    document.documentElement.style.width = `${w}px`;
    document.documentElement.style.maxWidth = `${w}px`;
    document.documentElement.style.overflowX = 'clip';
    document.body.style.maxWidth = `${w}px`;
    const shell = document.querySelector<HTMLElement>('.er-review-shell');
    if (shell) shell.style.maxWidth = `${w}px`;
  }

  window.visualViewport.addEventListener('resize', sync);
  // Run on initial load too — even without the keyboard the layout
  // viewport may differ from the visual viewport (e.g. when the
  // browser's URL bar is fully extended).
  sync();
}
