/**
 * Stowable-panel state controller for the docked chat panel.
 *
 * Owns the `chat-panel--collapsed` toggle: localStorage persistence
 * keyed on the worktree path, the collapsed-vs-expanded resolution
 * applied at mount time on phone-width viewports, the dispatch
 * handler shared by both paired affordances (chevron-up on the
 * stowed strip, chevron-down on the expanded header), and the
 * one-shot strip-chip flash for operator-message round-trips.
 *
 * The chat-panel orchestrator owns the DOM and the resize listener;
 * this module owns the state-machine glue. Split out so chat-panel.ts
 * stays under the 500-line file cap while leaving the collapse
 * behavior in one place.
 *
 * Affordance pattern mirrored: `.er-marginalia-tab` /
 * `.er-marginalia-stow` from editorial-review.css. Stowed-state
 * affordance lives on the edge the panel vanished into (bottom
 * here); visible-state affordance lives in the panel's own chrome
 * (`.chat-header`). Both controls dispatch through the same handler
 * and share `aria-pressed`.
 */

export type CollapseState = 'collapsed' | 'expanded';

export const COLLAPSE_KEY_PREFIX = 'chat-panel-stow:';

const FLASH_CLASS = 'chat-state-chip--flash';
const FLASH_DURATION_MS = 1000;

export interface CollapseStoreOptions {
  readonly storage: Storage;
  readonly projectRoot: string;
}

export interface CollapseStore {
  read(): CollapseState | null;
  write(state: CollapseState): void;
}

export function createCollapseStore(opts: CollapseStoreOptions): CollapseStore {
  const key = `${COLLAPSE_KEY_PREFIX}${opts.projectRoot}`;
  return {
    read(): CollapseState | null {
      try {
        const raw = opts.storage.getItem(key);
        if (raw === 'collapsed' || raw === 'expanded') return raw;
        return null;
      } catch {
        return null;
      }
    },
    write(state: CollapseState): void {
      try {
        opts.storage.setItem(key, state);
      } catch {
        // Quota / SecurityError is non-fatal; the toggle still works
        // for the current session, the choice just won't persist.
      }
    },
  };
}

/**
 * Resolve the initial collapse state for a phone-width mount.
 *
 * Stored value wins. Absent value -> default to collapsed (the entry
 * surface — article body + decision strip — must be reachable on the
 * operator's first phone visit; expanding is a deliberate act).
 */
export function resolveInitialState(store: CollapseStore): CollapseState {
  const stored = store.read();
  if (stored !== null) return stored;
  return 'collapsed';
}

/**
 * Apply a collapse state to the panel root. The class drives the CSS;
 * the store persists the operator's choice across refresh.
 *
 * `aria-pressed` on both toggle buttons reflects the current state so
 * screen readers announce the affordance correctly.
 */
export function applyCollapseState(
  state: CollapseState,
  refs: {
    readonly root: HTMLElement;
    readonly collapseToggle: HTMLButtonElement;
    readonly stowToggle: HTMLButtonElement;
  },
): void {
  if (state === 'collapsed') {
    refs.root.classList.add('chat-panel--collapsed');
  } else {
    refs.root.classList.remove('chat-panel--collapsed');
  }
  // aria-pressed is true when the panel is *expanded* — i.e., the
  // affordance has been activated to bring it up. When collapsed, the
  // toggle is in its default ("not pressed") state.
  const pressed = state === 'expanded' ? 'true' : 'false';
  refs.collapseToggle.setAttribute('aria-pressed', pressed);
  refs.stowToggle.setAttribute('aria-pressed', pressed);
}

/**
 * Toggle a stored collapse state to its opposite. Returns the new
 * state so the caller can apply it to the DOM and skip an extra read.
 */
export function toggleCollapseState(current: CollapseState): CollapseState {
  return current === 'collapsed' ? 'expanded' : 'collapsed';
}

/**
 * Briefly add a non-iterating pulse class to the strip chip, then
 * remove it. Used when an operator message arrives while collapsed —
 * a one-shot signal that something happened, without auto-expanding.
 *
 * The CSS animation runs once; this helper drives the class lifecycle
 * (add -> wait -> remove) so the flash can be re-triggered for the
 * next message arrival.
 */
export function flashStripChip(
  chip: HTMLElement,
  setTimeoutFn: (cb: () => void, ms: number) => void = (cb, ms) => {
    window.setTimeout(cb, ms);
  },
): void {
  // Restart the animation if a previous flash is still on the element
  // (rapid-fire arrivals): drop the class, force a reflow, re-add.
  chip.classList.remove(FLASH_CLASS);
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void chip.offsetWidth;
  chip.classList.add(FLASH_CLASS);
  setTimeoutFn(() => {
    chip.classList.remove(FLASH_CLASS);
  }, FLASH_DURATION_MS);
}
