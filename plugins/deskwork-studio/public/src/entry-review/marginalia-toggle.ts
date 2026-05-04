/**
 * Marginalia visibility toggle for the entry-keyed press-check client
 * (Phase 34a — T10 client wiring).
 *
 * Three affordances dispatch through the same handler (mirrors the
 * legacy surface verbatim):
 *
 *   - `.er-marginalia-stow` chevron in the marginalia head — visible
 *     when marginalia is visible.
 *   - `.er-marginalia-tab` pull tab on the right edge of the viewport
 *     — visible only when marginalia is stowed.
 *   - `Shift+M` keyboard shortcut.
 *
 * State persists to `localStorage` so the operator's preference
 * survives reload. Failures are non-fatal — the toggle still works
 * in-memory in private-browsing / cookie-blocked contexts.
 */

const MARGINALIA_HIDDEN_KEY = 'deskwork:review:marginalia-hidden';

interface MarginaliaToggle {
  toggle: () => void;
  applyState: (hidden: boolean) => void;
}

export function initMarginaliaToggle(): MarginaliaToggle {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-action="toggle-marginalia"]'),
  );

  function applyState(hidden: boolean): void {
    if (hidden) document.body.setAttribute('data-marginalia', 'hidden');
    else document.body.removeAttribute('data-marginalia');
    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    }
  }

  function toggle(): void {
    const hidden = document.body.getAttribute('data-marginalia') !== 'hidden';
    applyState(hidden);
    try {
      window.localStorage.setItem(MARGINALIA_HIDDEN_KEY, hidden ? '1' : '0');
    } catch {
      // localStorage unavailable — toggle still works in-memory.
    }
  }

  // Initial state from persisted preference.
  try {
    if (window.localStorage.getItem(MARGINALIA_HIDDEN_KEY) === '1') {
      applyState(true);
    }
  } catch {
    // Default to visible.
  }

  for (const btn of buttons) {
    btn.addEventListener('click', toggle);
  }

  return { toggle, applyState };
}
