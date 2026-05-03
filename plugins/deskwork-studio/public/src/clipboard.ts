/**
 * Unified clipboard helper for the studio's copy-to-clipboard buttons.
 *
 * Two layers:
 *
 *   1. `copyToClipboard(text)` — best-effort write. Tries the async
 *      Clipboard API (secure-context only), falls back to a hidden-
 *      textarea `execCommand('copy')` so the helper works on plain
 *      HTTP origins (LAN dev, Tailscale magic-DNS, etc.). Returns
 *      `true` on success, `false` when both paths fail. Throws
 *      synchronously on empty `text` — callers must validate input.
 *
 *   2. `copyOrShowFallback(text, options)` — the user-facing helper.
 *      Calls `copyToClipboard`. On success: optional success toast.
 *      On failure: renders a persistent dismiss-able panel containing
 *      the text in a pre-selected `<pre>` block so the operator can
 *      Cmd-C it manually. Returns the success boolean so the caller
 *      can decide whether to auto-collapse a containing form, fire
 *      an auto-reload, etc.
 *
 * Leaf module — no imports from sibling client files. Both clients
 * import FROM here, never the other way around.
 *
 * Design notes:
 *
 *  - Empty input is a programmer error, not a user error. The button
 *    that triggers a copy should never be enabled when there is no
 *    text to copy. Throwing makes the bug loud during development
 *    instead of silently producing a no-op (the failure mode in #105
 *    and #99). Each call site is responsible for surfacing input
 *    validation in its own UI affordance (inline hint, disabled
 *    state, focus on the offending field) before calling here.
 *
 *  - The fallback panel sets `document.body.dataset.manualCopyOpen =
 *    '1'` while it's mounted. Auto-reload paths (Approve, Iterate)
 *    must check this flag and skip the reload — otherwise the panel
 *    is destroyed before the operator can use it (this is #74). When
 *    the operator dismisses the panel, the optional `onDismiss`
 *    callback fires; that's where the caller can trigger the
 *    deferred reload.
 */

const MANUAL_COPY_FLAG = 'manualCopyOpen';
const MANUAL_COPY_PANEL_SELECTOR = 'aside[data-manual-copy]';

export interface CopyOrShowFallbackOptions {
  /** Toast text shown on a successful clipboard write. */
  readonly successMessage: string;
  /**
   * Header above the manual-copy `<pre>` when the clipboard write
   * fails. Should explain to the operator that they need to copy
   * manually and why (e.g., "Clipboard unavailable on this origin").
   */
  readonly fallbackMessage: string;
  /**
   * Called when the operator dismisses the manual-copy panel. Use
   * this to fire deferred work that the auto-reload would have
   * triggered (e.g., reloading the page after the operator has
   * grabbed the command).
   */
  readonly onDismiss?: () => void;
}

/**
 * Attempt to copy `text` to the clipboard using the most-capable
 * path available. Returns true on success, false on failure.
 *
 * Throws synchronously if `text` is empty — empty copies are always
 * a caller bug.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (text.length === 0) {
    throw new Error('copyToClipboard: refusing to copy empty text (caller must validate input first)');
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path — some sandboxed contexts
      // gate the async API even when isSecureContext is true.
    }
  }
  return execCommandCopy(text);
}

function execCommandCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '-1000px';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(ta);
  }
  return ok;
}

/**
 * Try to copy `text`. On failure, render a persistent manual-copy
 * panel near the top of the page so the operator can select and
 * Cmd-C the text. Returns the success boolean.
 */
export async function copyOrShowFallback(
  text: string,
  options: CopyOrShowFallbackOptions,
): Promise<boolean> {
  if (text.length === 0) {
    throw new Error('copyOrShowFallback: refusing to copy empty text (caller must validate input first)');
  }
  const ok = await copyToClipboard(text);
  if (ok) {
    showTransientToast(options.successMessage, false);
    return true;
  }
  showManualCopyPanel(text, options.fallbackMessage, options.onDismiss);
  return false;
}

/**
 * Whether a manual-copy fallback panel is currently mounted. Callers
 * with auto-reload behavior should check this before reloading so
 * the operator doesn't lose the panel.
 */
export function isManualCopyOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.dataset[MANUAL_COPY_FLAG] === '1';
}

function showManualCopyPanel(
  text: string,
  fallbackMessage: string,
  onDismiss: (() => void) | undefined,
): void {
  // Replace any existing panel — back-to-back failures should not
  // pile up panels.
  const existing = document.querySelector<HTMLElement>(MANUAL_COPY_PANEL_SELECTOR);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const aside = document.createElement('aside');
  aside.setAttribute('data-manual-copy', '');
  aside.setAttribute('role', 'dialog');
  aside.setAttribute('aria-live', 'polite');
  aside.setAttribute('aria-label', 'Manual copy fallback');
  applyPanelStyles(aside);

  const header = document.createElement('div');
  header.textContent = fallbackMessage;
  applyHeaderStyles(header);
  aside.appendChild(header);

  const pre = document.createElement('pre');
  pre.textContent = text;
  applyPreStyles(pre);
  pre.tabIndex = 0;
  aside.appendChild(pre);

  const footer = document.createElement('div');
  applyFooterStyles(footer);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.textContent = 'Dismiss';
  applyDismissStyles(dismissBtn);
  dismissBtn.addEventListener('click', () => {
    closeManualCopyPanel(aside);
    if (onDismiss) onDismiss();
  });
  footer.appendChild(dismissBtn);
  aside.appendChild(footer);

  document.body.appendChild(aside);
  document.body.dataset[MANUAL_COPY_FLAG] = '1';

  // Pre-select the text so the operator can Cmd-C immediately.
  // requestAnimationFrame defers selection until the node is
  // laid out — selecting on a hidden node fails silently in some
  // browsers.
  window.requestAnimationFrame(() => {
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(pre);
      sel.addRange(range);
    }
    dismissBtn.focus();
  });
}

function closeManualCopyPanel(aside: HTMLElement): void {
  if (aside.parentNode) aside.parentNode.removeChild(aside);
  if (document.body.dataset[MANUAL_COPY_FLAG] === '1') {
    delete document.body.dataset[MANUAL_COPY_FLAG];
  }
}

function applyPanelStyles(el: HTMLElement): void {
  el.style.position = 'fixed';
  el.style.top = '12px';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '99999';
  el.style.maxWidth = 'min(720px, calc(100vw - 32px))';
  el.style.background = '#1f1f1f';
  el.style.color = '#f5f5f5';
  el.style.border = '1px solid #444';
  el.style.borderRadius = '6px';
  el.style.padding = '12px 14px';
  el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';
  el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  el.style.fontSize = '13px';
  el.style.lineHeight = '1.4';
}

function applyHeaderStyles(el: HTMLElement): void {
  el.style.fontWeight = '600';
  el.style.marginBottom = '8px';
  el.style.color = '#ffd479';
}

function applyPreStyles(el: HTMLElement): void {
  el.style.background = '#2b2b2b';
  el.style.color = '#f5f5f5';
  el.style.border = '1px solid #555';
  el.style.borderRadius = '4px';
  el.style.padding = '8px 10px';
  el.style.margin = '0 0 8px 0';
  el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  el.style.fontSize = '12px';
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-word';
  el.style.maxHeight = '40vh';
  el.style.overflowY = 'auto';
  el.style.userSelect = 'text';
}

function applyFooterStyles(el: HTMLElement): void {
  el.style.display = 'flex';
  el.style.justifyContent = 'flex-end';
  el.style.gap = '8px';
}

function applyDismissStyles(el: HTMLElement): void {
  el.style.background = '#3a3a3a';
  el.style.color = '#f5f5f5';
  el.style.border = '1px solid #666';
  el.style.borderRadius = '4px';
  el.style.padding = '4px 12px';
  el.style.fontSize = '12px';
  el.style.cursor = 'pointer';
}

/**
 * Lightweight toast for the success path. Prefers the existing
 * `[data-toast]` element if the host page has one (both editorial
 * surfaces do); otherwise injects a transient floating element so
 * the helper still produces feedback when called from a page that
 * lacks the host toast slot.
 */
function showTransientToast(message: string, isError: boolean): void {
  if (typeof document === 'undefined') return;
  const hostToast = document.querySelector<HTMLElement>('[data-toast]');
  if (hostToast) {
    hostToast.textContent = message;
    hostToast.classList.toggle('error', isError);
    hostToast.hidden = false;
    window.setTimeout(() => {
      hostToast.hidden = true;
    }, 4000);
    return;
  }
  const el = document.createElement('div');
  el.textContent = message;
  el.setAttribute('role', 'status');
  el.style.position = 'fixed';
  el.style.bottom = '16px';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '99999';
  el.style.background = isError ? '#7f1d1d' : '#1f2937';
  el.style.color = '#f5f5f5';
  el.style.padding = '8px 14px';
  el.style.borderRadius = '6px';
  el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  el.style.fontSize = '13px';
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  document.body.appendChild(el);
  window.setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 4000);
}
