/**
 * Inline prompt helpers — replacements for `window.confirm` and
 * `window.prompt` (#166, Phase 34b — full audit).
 *
 * The native browser dialogs can't be styled or keyboard-driven
 * consistently, and they block the JS thread in ways that interact
 * badly with the studio's polling + toast layers. These helpers
 * render small in-page dialogs anchored to a trigger element and
 * resolve a Promise with the operator's choice.
 *
 * Cmd/Ctrl+Enter confirms; Esc cancels — same chord as the marginalia
 * composer.
 */

interface InlineConfirmOptions {
  readonly label: string;
  readonly message: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly anchor: HTMLElement;
}

/**
 * Render an inline confirm dialog after `anchor`. Returns true when
 * the operator clicks the confirm button (or hits Cmd/Ctrl+Enter),
 * false when they cancel (button or Esc).
 *
 * Prevents stacking — only one inline dialog can be mounted at a
 * time. Subsequent calls focus the existing dialog and resolve false.
 */
export function inlineConfirm(opts: InlineConfirmOptions): Promise<boolean> {
  const existing = document.querySelector<HTMLDivElement>('[data-inline-prompt]');
  if (existing) {
    existing.querySelector<HTMLButtonElement>('[data-inline-confirm]')?.focus();
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'er-inline-prompt';
    wrap.dataset.inlinePrompt = 'true';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', opts.label);

    const labelEl = document.createElement('p');
    labelEl.className = 'er-inline-prompt-label';
    labelEl.textContent = opts.label;

    const messageEl = document.createElement('p');
    messageEl.className = 'er-inline-prompt-message';
    messageEl.textContent = opts.message;

    const actions = document.createElement('div');
    actions.className = 'er-inline-prompt-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'er-btn er-btn-small';
    cancel.textContent = opts.cancel;
    cancel.dataset.inlineCancel = 'true';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'er-btn er-btn-small er-btn-reject';
    confirm.textContent = opts.confirm;
    confirm.dataset.inlineConfirm = 'true';
    actions.appendChild(cancel);
    actions.appendChild(confirm);

    wrap.appendChild(labelEl);
    wrap.appendChild(messageEl);
    wrap.appendChild(actions);

    opts.anchor.insertAdjacentElement('afterend', wrap);
    confirm.focus();

    function close(value: boolean): void {
      document.removeEventListener('keydown', onKeyDown, true);
      wrap.remove();
      resolve(value);
    }
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close(false);
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault();
        close(true);
      }
    }
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKeyDown, true);
  });
}

interface InlinePromptOptions {
  readonly label: string;
  readonly defaultValue: string;
  readonly placeholder?: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly anchor: HTMLElement;
}

/**
 * Render an inline text-input prompt after `anchor`. Returns the
 * trimmed input string when the operator confirms (button or
 * Cmd/Ctrl+Enter or Enter inside the input), null when they cancel
 * (button or Esc). Whitespace-only input resolves null. Same
 * stacking-prevention contract as `inlineConfirm`.
 */
export function inlinePrompt(opts: InlinePromptOptions): Promise<string | null> {
  const existing = document.querySelector<HTMLDivElement>('[data-inline-prompt]');
  if (existing) {
    existing.querySelector<HTMLInputElement>('[data-inline-input]')?.focus();
    return Promise.resolve(null);
  }
  return new Promise<string | null>((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'er-inline-prompt';
    wrap.dataset.inlinePrompt = 'true';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', opts.label);

    const labelEl = document.createElement('label');
    labelEl.className = 'er-inline-prompt-label';
    labelEl.textContent = opts.label;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'er-inline-prompt-input';
    input.dataset.inlineInput = 'true';
    input.value = opts.defaultValue;
    if (opts.placeholder !== undefined) input.placeholder = opts.placeholder;
    labelEl.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'er-inline-prompt-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'er-btn er-btn-small';
    cancel.textContent = opts.cancel;
    cancel.dataset.inlineCancel = 'true';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'er-btn er-btn-small er-btn-confirm';
    confirm.textContent = opts.confirm;
    confirm.dataset.inlineConfirm = 'true';
    actions.appendChild(cancel);
    actions.appendChild(confirm);

    wrap.appendChild(labelEl);
    wrap.appendChild(actions);

    opts.anchor.insertAdjacentElement('afterend', wrap);
    input.focus();
    input.select();

    function close(value: string | null): void {
      document.removeEventListener('keydown', onKeyDown, true);
      wrap.remove();
      resolve(value);
    }
    function resolveConfirm(): void {
      const trimmed = input.value.trim();
      close(trimmed.length === 0 ? null : trimmed);
    }
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close(null);
        return;
      }
      if (ev.key === 'Enter' || ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter')) {
        if (document.activeElement !== input
          && document.activeElement !== confirm) return;
        ev.preventDefault();
        resolveConfirm();
      }
    }
    cancel.addEventListener('click', () => close(null));
    confirm.addEventListener('click', resolveConfirm);
    document.addEventListener('keydown', onKeyDown, true);
  });
}
