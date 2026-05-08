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

  const FADE_MS = 260;

  function applyState(hidden: boolean, animate = false): void {
    const marginalia = document.querySelector<HTMLElement>('.er-marginalia');
    const tab = document.querySelector<HTMLElement>('.er-marginalia-tab');

    if (!animate || !marginalia) {
      // Initial state restoration (no animation): snap to the final
      // attribute state. Animation only fires for explicit toggles.
      if (hidden) document.body.setAttribute('data-marginalia', 'hidden');
      else document.body.removeAttribute('data-marginalia');
      for (const btn of buttons) {
        btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      }
      return;
    }

    if (hidden) {
      // Stow: fade marginalia out FIRST, then collapse the grid
      // track. The `display: none` snap-to-no-grid-track is structural
      // (CSS Grid recomputes track sizes synchronously when a track's
      // child becomes display:none); the fade smooths the visual exit
      // even if the article column reflow at the end is instant.
      marginalia.style.opacity = '0';
      window.setTimeout(() => {
        document.body.setAttribute('data-marginalia', 'hidden');
        marginalia.style.opacity = '';
        // Tab fades in after the grid reflows.
        if (tab) {
          tab.style.opacity = '0';
          requestAnimationFrame(() => {
            tab.style.transition = `opacity ${FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            tab.style.opacity = '1';
            window.setTimeout(() => {
              tab.style.transition = '';
              tab.style.opacity = '';
            }, FADE_MS + 60);
          });
        }
      }, FADE_MS);
    } else {
      // Unstow: remove the body attribute first so the grid track
      // snaps back open, then fade the marginalia in. The article
      // column shrinks instantly; the marginalia fades to fill it.
      document.body.removeAttribute('data-marginalia');
      requestAnimationFrame(() => {
        if (!marginalia) return;
        marginalia.style.transition = 'none';
        marginalia.style.opacity = '0';
        // Force a layout pass so the next opacity:'' animates from 0.
        void marginalia.offsetHeight;
        marginalia.style.transition = `opacity ${FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        requestAnimationFrame(() => {
          marginalia.style.opacity = '';
          window.setTimeout(() => { marginalia.style.transition = ''; }, FADE_MS + 60);
        });
      });
    }

    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    }
  }

  function toggle(): void {
    const hidden = document.body.getAttribute('data-marginalia') !== 'hidden';
    applyState(hidden, true);
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
