/**
 * Inline rename-slug form behavior for the editorial-studio surface.
 *
 * One form per blog row, hidden by default. The row's "rename →"
 * button toggles the form open/closed in place; the operator's eye
 * stays on the row they're acting on (no modal). Submit copies the
 * `/editorial-rename-slug` command to the clipboard so the operator
 * can paste it into Claude Code, then collapses the form. Validation
 * mirrors the server-side rules in scripts/lib/editorial/rename-slug.
 *
 * #105 fix: the silent no-op on empty-input submit. The previous
 * implementation only ran `validate()` on `input` events — the
 * button's enabled/disabled state could be stale on first render,
 * and the submit handler bailed without surfacing a visible error
 * if validation found one. The current behavior:
 *
 *  - On load, every form's submit button is disabled until the
 *    operator types a valid slug. The hint reads "type a new slug"
 *    so the disabled state is explained.
 *  - On submit, validation runs unconditionally and any error is
 *    surfaced in the hint with `data-error`. Submit is impossible
 *    when invalid (button disabled), but the keyboard Enter path
 *    still validates defensively.
 *
 * Also routes the copy step through `copyOrShowFallback` from
 * `./clipboard.ts` so the manual-copy panel surfaces when the
 * Clipboard API is unavailable (e.g., HTTP origin where the secure-
 * context gate fires before our fallback can).
 */

import { copyOrShowFallback } from './clipboard.ts';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

interface FormContext {
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly hint: HTMLElement;
  readonly copyBtn: HTMLButtonElement;
  readonly site: string;
  readonly oldSlug: string;
}

export function initRenameForms(): void {
  const slugsBySite = readSlugsBySite();

  // Initial state: every form's submit button is disabled until the
  // operator types something valid. This is the #105 fix — the prior
  // code left the button enabled on initial render, so a click
  // without typing was a silent no-op.
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-rename-form]')) {
    const ctx = contextFor(form);
    if (!ctx) continue;
    ctx.copyBtn.disabled = true;
    ctx.hint.textContent = 'type a new slug (lowercase, digits, hyphens)';
    ctx.hint.removeAttribute('data-error');
  }

  document.addEventListener('click', (ev) => {
    const openBtn = (ev.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action="rename-open"]',
    );
    if (openBtn) {
      const wrap = openBtn.closest<HTMLElement>('[data-row-wrap]');
      const form = wrap?.querySelector<HTMLFormElement>('form[data-rename-form]') ?? null;
      if (form) {
        if (form.hidden) openForm(form);
        else closeForm(form);
      }
      return;
    }
    const cancelBtn = (ev.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action="rename-cancel"]',
    );
    if (cancelBtn) {
      ev.preventDefault();
      const form = cancelBtn.closest<HTMLFormElement>('form[data-rename-form]');
      if (form) closeForm(form);
    }
  });

  document.addEventListener('input', (ev) => {
    const input = (ev.target as Element | null)?.closest<HTMLInputElement>(
      'input[data-rename-input]',
    );
    if (!input) return;
    const form = input.closest<HTMLFormElement>('form[data-rename-form]');
    if (!form) return;
    const ctx = contextFor(form);
    if (!ctx) return;
    applyValidationToHint(ctx, slugsBySite);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const active = document.activeElement;
    const form = active?.closest<HTMLFormElement>('form[data-rename-form]');
    if (form && !form.hidden) {
      ev.preventDefault();
      closeForm(form);
    }
  });

  document.addEventListener('submit', async (ev) => {
    const form = (ev.target as Element | null)?.closest<HTMLFormElement>(
      'form[data-rename-form]',
    );
    if (!form) return;
    ev.preventDefault();
    const ctx = contextFor(form);
    if (!ctx) return;
    const next = ctx.input.value.trim();
    const err = validate(ctx, next, slugsBySite);
    if (err) {
      // #105: ALWAYS surface the error visibly on submit, even if the
      // input handler hadn't yet set the disabled state. Belt-and-
      // braces against any path that lets the submit fire while the
      // form is invalid.
      ctx.hint.textContent = err;
      ctx.hint.setAttribute('data-error', 'true');
      ctx.copyBtn.disabled = true;
      ctx.input.focus();
      return;
    }
    const command = `/editorial-rename-slug --site ${ctx.site} ${ctx.oldSlug} ${next}`;
    const original = ctx.copyBtn.textContent;
    const ok = await copyOrShowFallback(command, {
      successMessage: `Copied: ${command}`,
      fallbackMessage: 'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:',
    });
    if (ok) {
      ctx.copyBtn.classList.add('copied');
      ctx.copyBtn.textContent = 'copied ✓';
      window.setTimeout(() => {
        ctx.copyBtn.classList.remove('copied');
        if (original !== null) ctx.copyBtn.textContent = original;
        closeForm(form);
      }, 900);
    }
    // On manual-copy fallback we deliberately leave the form open —
    // the operator needs the row context AND the manual-copy panel
    // both visible to grab the command.
  });
}

function readSlugsBySite(): Record<string, readonly string[]> {
  const slugsScript = document.querySelector<HTMLScriptElement>('script[data-rename-slugs]');
  if (!slugsScript?.textContent) return {};
  try {
    const parsed: unknown = JSON.parse(slugsScript.textContent);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, readonly string[]> = {};
    for (const key of Object.keys(parsed)) {
      const value = Reflect.get(parsed, key);
      if (Array.isArray(value) && value.every((v): v is string => typeof v === 'string')) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function contextFor(form: HTMLFormElement): FormContext | null {
  const input = form.querySelector<HTMLInputElement>('[data-rename-input]');
  const hint = form.querySelector<HTMLElement>('[data-rename-hint]');
  const copyBtn = form.querySelector<HTMLButtonElement>('[data-action="rename-copy"]');
  const site = form.dataset.site ?? '';
  const oldSlug = form.dataset.slug ?? '';
  if (!input || !hint || !copyBtn || !site || !oldSlug) return null;
  return { form, input, hint, copyBtn, site, oldSlug };
}

function validate(
  ctx: FormContext,
  next: string,
  slugsBySite: Record<string, readonly string[]>,
): string | null {
  if (!next) return 'required';
  if (!SLUG_RE.test(next)) return 'kebab-case only (a-z, 0-9, -)';
  if (next === ctx.oldSlug) return 'same as current slug';
  const taken = (slugsBySite[ctx.site] ?? []).some(
    (s) => s === next && s !== ctx.oldSlug,
  );
  if (taken) return `already used on ${ctx.site}.org`;
  return null;
}

function applyValidationToHint(
  ctx: FormContext,
  slugsBySite: Record<string, readonly string[]>,
): void {
  const err = validate(ctx, ctx.input.value.trim(), slugsBySite);
  if (err) {
    ctx.hint.textContent = err;
    ctx.hint.setAttribute('data-error', 'true');
    ctx.copyBtn.disabled = true;
  } else {
    ctx.hint.textContent = 'looks good — submit to copy';
    ctx.hint.removeAttribute('data-error');
    ctx.copyBtn.disabled = false;
  }
}

function closeForm(form: HTMLFormElement): void {
  form.hidden = true;
  const input = form.querySelector<HTMLInputElement>('[data-rename-input]');
  if (input) input.value = '';
  const hint = form.querySelector<HTMLElement>('[data-rename-hint]');
  if (hint) {
    hint.textContent = 'type a new slug (lowercase, digits, hyphens)';
    hint.removeAttribute('data-error');
  }
  const copyBtn = form.querySelector<HTMLButtonElement>('[data-action="rename-copy"]');
  if (copyBtn) copyBtn.disabled = true;
}

function closeAllForms(except?: HTMLFormElement): void {
  document
    .querySelectorAll<HTMLFormElement>('form[data-rename-form]')
    .forEach((f) => {
      if (f !== except && !f.hidden) closeForm(f);
    });
}

function openForm(form: HTMLFormElement): void {
  closeAllForms(form);
  form.hidden = false;
  const input = form.querySelector<HTMLInputElement>('[data-rename-input]');
  window.setTimeout(() => input?.focus(), 0);
}
