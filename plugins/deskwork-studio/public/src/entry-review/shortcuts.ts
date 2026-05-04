/**
 * Keyboard shortcuts for the entry-keyed press-check client (Phase 34a).
 *
 * Mirrors the legacy surface verbatim — bare-letter double-tap with no
 * modifier (#108), arming for 500ms after the first press.
 *
 *   - `?` (or `Shift+/`) — toggle the shortcuts overlay.
 *   - `Esc` — close overlay / composer / outline drawer / focus mode.
 *   - `e` — toggle edit mode.
 *   - `a a` — approve.
 *   - `i i` — iterate.
 *   - `r r` — reject (toast pointing at #173 — disabled).
 *   - `j` / `k` — next / previous margin note.
 *   - `o` — toggle outline drawer (when available).
 *   - `Shift+F` — focus mode (edit mode only).
 *   - `Shift+M` — toggle marginalia.
 */

interface ShortcutDeps {
  showToast: (msg: string, isError?: boolean) => void;
  toggleEdit: () => void;
  approve: () => void;
  iterate: () => void;
  reject: () => void;
  nextNote: (dir: 1 | -1) => void;
  toggleMarginalia: () => void;
  toggleOutline: () => void;
  outlineAvailable: () => boolean;
  closeOutline: () => void;
  outlineIsOpen: () => boolean;
  closeComposer: () => void;
  composerIsOpen: () => boolean;
  isEditing: () => boolean;
  isFocused: () => boolean;
  enterFocus: () => void;
  exitFocus: () => void;
}

type DestructiveKey = 'a' | 'i' | 'r';
const DESTRUCTIVE_LABELS: Readonly<Record<DestructiveKey, string>> = {
  a: 'approve',
  i: 'iterate',
  r: 'reject',
};

export function initShortcuts(deps: ShortcutDeps): void {
  const overlay = document.querySelector<HTMLElement>('[data-shortcuts-overlay]');
  const backdrop = document.querySelector<HTMLElement>('[data-shortcuts-backdrop]');
  const btn = document.querySelector<HTMLButtonElement>('[data-action="shortcuts"]');

  function show(visible: boolean): void {
    if (!overlay) return;
    overlay.hidden = !visible;
  }
  btn?.addEventListener('click', () => show(true));
  backdrop?.addEventListener('click', () => show(false));

  let armedKey: DestructiveKey | null = null;
  let armedTimer: ReturnType<typeof setTimeout> | null = null;
  function disarm(): void {
    armedKey = null;
    if (armedTimer !== null) {
      clearTimeout(armedTimer);
      armedTimer = null;
    }
  }
  function armKey(key: DestructiveKey): void {
    disarm();
    armedKey = key;
    deps.showToast(`Press ${key} again to ${DESTRUCTIVE_LABELS[key]}`);
    armedTimer = setTimeout(() => disarm(), 500);
  }

  document.addEventListener('keydown', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    const typing = target !== null && (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
    if (typing) {
      if (ev.key === 'Escape') {
        if (deps.isFocused()) {
          ev.preventDefault();
          deps.exitFocus();
          return;
        }
        target.blur();
        if (deps.composerIsOpen()) deps.closeComposer();
      }
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (ev.key === '?' || (ev.key === '/' && ev.shiftKey)) {
      ev.preventDefault();
      show(!overlay || overlay.hidden);
      return;
    }
    if (ev.key === 'Escape') {
      if (overlay && !overlay.hidden) { show(false); return; }
      if (deps.composerIsOpen()) { deps.closeComposer(); return; }
      if (deps.outlineIsOpen()) { deps.closeOutline(); return; }
      if (deps.isFocused()) { deps.exitFocus(); return; }
    }
    if (ev.shiftKey && ev.key === 'F') {
      ev.preventDefault();
      if (!deps.isEditing()) return;
      if (deps.isFocused()) deps.exitFocus(); else deps.enterFocus();
      return;
    }
    if (ev.shiftKey && ev.key === 'M') {
      ev.preventDefault();
      deps.toggleMarginalia();
      return;
    }
    if (ev.key === 'o' && deps.outlineAvailable()) {
      ev.preventDefault();
      deps.toggleOutline();
      return;
    }
    if (ev.key === 'e') {
      ev.preventDefault();
      disarm();
      deps.toggleEdit();
      return;
    }
    if (ev.key === 'a' || ev.key === 'i' || ev.key === 'r') {
      ev.preventDefault();
      const key = ev.key;
      if (armedKey === key) {
        disarm();
        if (key === 'a') deps.approve();
        else if (key === 'i') deps.iterate();
        else deps.reject();
      } else {
        armKey(key);
      }
      return;
    }
    if (ev.key === 'j') { ev.preventDefault(); disarm(); deps.nextNote(1); return; }
    if (ev.key === 'k') { ev.preventDefault(); disarm(); deps.nextNote(-1); return; }
    disarm();
  });
}
