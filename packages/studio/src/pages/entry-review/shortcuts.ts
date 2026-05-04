/**
 * Keyboard shortcuts overlay for the entry-keyed press-check surface
 * (Phase 34a — T13 helper).
 *
 * Relocated from `pages/review.ts:renderShortcutsOverlay`. Triggered by
 * `?` (or Shift+/) and the strip's `?` button. Mirrors the destructive-
 * shortcut UX from the legacy surface verbatim — bare-letter double-tap
 * with no Cmd/Ctrl modifier (#108). On the entry-keyed surface, `r r`
 * (reject) is shown for completeness but the underlying button is
 * disabled until reject semantics land — see issue #173.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderShortcutsOverlay(): RawHtml {
  return unsafe(html`
    <div class="er-shortcuts" data-shortcuts-overlay hidden role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="er-shortcuts-backdrop" data-shortcuts-backdrop></div>
      <div class="er-shortcuts-panel">
        <h2>Keyboard</h2>
        <dl>
          <dt><kbd>e</kbd> / dbl-click</dt><dd>toggle edit mode</dd>
          <dt>select text</dt><dd>leave a margin note</dd>
          <dt><kbd>⌘</kbd><kbd>↵</kbd> / <kbd>ctrl</kbd><kbd>↵</kbd></dt><dd>save margin note (in composer)</dd>
          <dt><kbd>a</kbd> <kbd>a</kbd></dt><dd>approve <em>— press twice within 500ms; first press arms, second fires</em></dd>
          <dt><kbd>i</kbd> <kbd>i</kbd></dt><dd>iterate <em>— press twice within 500ms</em></dd>
          <dt><kbd>r</kbd> <kbd>r</kbd></dt><dd>reject <em>— pending design (#173)</em></dd>
          <dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>next / previous margin note</dd>
          <dt><kbd>shift</kbd><kbd>F</kbd></dt><dd>focus mode <em>(edit mode only)</em></dd>
          <dt><kbd>shift</kbd><kbd>M</kbd></dt><dd>show / hide margin notes column <em>— or click the chevron in the head when visible, or the pull tab on the right edge when stowed</em></dd>
          <dt><kbd>?</kbd></dt><dd>this panel</dd>
          <dt><kbd>esc</kbd></dt><dd>close / cancel composer</dd>
        </dl>
        <p class="er-shortcuts-footer">Press <kbd>?</kbd> anytime.</p>
      </div>
    </div>`);
}
