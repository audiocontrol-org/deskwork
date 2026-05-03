/**
 * Scrapbook viewer — mutation handlers for the F1 redesign.
 *
 * Encapsulates the rich-UX mutation flows (rename, edit, delete,
 * mark-secret, new-note, upload) ported from the prior 917-line
 * scrapbook-client.ts. Kept in its own module so the orchestration
 * file stays under the project's 300–500 line cap.
 *
 * Each handler operates on a freshly-resolved `Ctx { page, site, path }`
 * passed in by the caller — no module-level state.
 */

import { renderMarkdown } from './scrapbook-markdown.ts';
import { flashError, flashInfo } from './scrapbook-toast.ts';

export type Kind = 'md' | 'json' | 'js' | 'img' | 'txt' | 'other';

const KINDS = ['md', 'json', 'js', 'img', 'txt', 'other'] as const;

function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

function readKind(card: HTMLElement, fallback: Kind): Kind {
  const raw = card.dataset.kind ?? '';
  return isKind(raw) ? raw : fallback;
}

export interface Ctx {
  page: HTMLElement;
  site: string;
  path: string;
}

const FILENAME_RE = /^[a-zA-Z0-9._-][a-zA-Z0-9._ -]*$/;

export function readCardFilename(card: HTMLElement): string {
  return card.querySelector<HTMLElement>('.scrap-name')?.textContent?.trim() ?? '';
}

export function isCardSecret(card: HTMLElement): boolean {
  // F5 will introduce an explicit data-secret="true" attribute on
  // secret-section cards. Until then, all cards in the redesigned
  // markup live in the public scrapbook.
  return card.dataset.secret === 'true';
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

/**
 * Type-guard parsers for JSON response bodies. Replaces the `as { error?:
 * string }` cast pattern across mutation handlers — one helper per shape,
 * narrowed via `in`-operator + typeof checks (no `as Type`). Per the
 * project's TypeScript architecture rule (no casts), and per the no-fallback
 * rule (parseSavedItem throws on unexpected shape rather than silently
 * returning a default).
 */
function parseErrorBody(json: unknown): string | null {
  if (json === null || typeof json !== 'object') return null;
  if (!('error' in json)) return null;
  return typeof json.error === 'string' ? json.error : null;
}

function parseSavedItem(json: unknown): { mtime: string; size: number } {
  if (
    json !== null &&
    typeof json === 'object' &&
    'item' in json &&
    json.item !== null &&
    typeof json.item === 'object' &&
    'mtime' in json.item && typeof json.item.mtime === 'string' &&
    'size' in json.item && typeof json.item.size === 'number'
  ) {
    return { mtime: json.item.mtime, size: json.item.size };
  }
  throw new Error('save endpoint returned unexpected response shape');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mkToolBtn(label: string, primary = false): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = primary ? 'scrap-tool scrap-tool--primary' : 'scrap-tool';
  btn.textContent = label;
  return btn;
}

// ---------------------------------------------------------------------------
// Lazy body render on first expand
// ---------------------------------------------------------------------------

export async function renderExpandedBody(ctx: Ctx, card: HTMLElement): Promise<void> {
  const preview = card.querySelector<HTMLElement>('.scrap-preview');
  if (!preview || preview.dataset.loaded === 'true') return;
  const filename = readCardFilename(card);
  if (!filename) return;
  const kind = readKind(card, 'other');
  if (kind === 'img') { preview.dataset.loaded = 'true'; return; }
  try {
    await renderBody(ctx, preview, kind, filename, isCardSecret(card));
    preview.dataset.loaded = 'true';
  } catch (e) {
    flashError(ctx.page, `couldn't read ${filename}: ${msg(e)}`);
  }
}

async function renderBody(
  ctx: Ctx,
  target: HTMLElement,
  kind: Kind,
  filename: string,
  secret: boolean,
): Promise<void> {
  target.textContent = '';
  const params = new URLSearchParams({ site: ctx.site, path: ctx.path, name: filename });
  if (secret) params.set('secret', '1');
  const fileUrl = `/api/dev/scrapbook-file?${params.toString()}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.text();

  if (kind === 'md') {
    target.classList.remove('scrap-preview--mono');
    target.classList.add('scrap-preview-md');
    target.innerHTML = renderMarkdown(content);
    return;
  }
  if (kind === 'json') {
    target.classList.add('scrap-preview--mono');
    target.classList.remove('scrap-preview-md');
    try { target.textContent = JSON.stringify(JSON.parse(content), null, 2); }
    catch { target.textContent = content; }
    return;
  }
  if (kind === 'js' || kind === 'txt') {
    target.classList.add('scrap-preview--mono');
    target.classList.remove('scrap-preview-md');
    target.textContent = content;
    return;
  }
  const a = document.createElement('a');
  a.href = fileUrl;
  a.textContent = `download ${filename} →`;
  target.appendChild(a);
}

// ---------------------------------------------------------------------------
// Edit mode (markdown + json + txt)
// ---------------------------------------------------------------------------

export async function enterEditMode(ctx: Ctx, card: HTMLElement): Promise<void> {
  const filename = readCardFilename(card);
  if (!filename) return;
  const preview = card.querySelector<HTMLElement>('.scrap-preview');
  if (!preview) return;
  if (card.dataset.state !== 'expanded') {
    card.dataset.state = 'expanded';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const params = new URLSearchParams({ site: ctx.site, path: ctx.path, name: filename });
  if (isCardSecret(card)) params.set('secret', '1');
  let raw = '';
  try {
    const res = await fetch(`/api/dev/scrapbook-file?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    raw = await res.text();
  } catch (e) { flashError(ctx.page, `read failed: ${msg(e)}`); return; }

  preview.textContent = '';
  preview.classList.remove('scrap-preview--mono', 'scrap-preview-md');
  const wrap = document.createElement('div');
  wrap.className = 'scrap-editor';
  const ta = document.createElement('textarea');
  ta.value = raw;
  ta.setAttribute('aria-label', `edit ${filename}`);
  ta.style.cssText = 'width: 100%; min-height: 20rem; font-family: var(--er-font-mono); font-size: 0.85rem; padding: 0.5rem; border: 1px solid var(--er-faded-2); background: var(--er-paper); color: var(--er-ink);';
  const footer = document.createElement('div');
  footer.style.cssText = 'display: flex; gap: 0.4rem; margin-top: 0.5rem;';
  const cancel = mkToolBtn('cancel');
  const save = mkToolBtn('save →', true);
  footer.append(cancel, save);
  wrap.append(ta, footer);
  preview.appendChild(wrap);
  ta.focus();

  const restoreRender = async (): Promise<void> => {
    preview.dataset.loaded = 'false';
    preview.textContent = '';
    const kind = readKind(card, 'md');
    await renderBody(ctx, preview, kind, filename, isCardSecret(card));
    preview.dataset.loaded = 'true';
  };

  cancel.addEventListener('click', () => { void restoreRender(); });
  const commit = async (): Promise<void> => {
    try {
      const res = await fetch('/api/dev/scrapbook/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          site: ctx.site, slug: ctx.path, filename, body: ta.value, secret: isCardSecret(card),
        }),
      });
      if (!res.ok) throw new Error(parseErrorBody(await res.json()) ?? 'save failed');
      const updated = parseSavedItem(await res.json());
      const mtimeEl = card.querySelector<HTMLTimeElement>('.scrap-time');
      if (mtimeEl) { mtimeEl.dateTime = updated.mtime; mtimeEl.textContent = 'just now'; }
      const sizeEl = card.querySelector<HTMLElement>('.scrap-size');
      if (sizeEl) sizeEl.textContent = formatSize(updated.size);
      flashInfo(ctx.page, `saved ${filename}`);
      await restoreRender();
    } catch (e) { flashError(ctx.page, `save failed: ${msg(e)}`); }
  };
  save.addEventListener('click', () => { void commit(); });
  ta.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') { ev.preventDefault(); void commit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); void restoreRender(); }
  });
}

// ---------------------------------------------------------------------------
// Rename (inline text input replacing the .scrap-name element)
// ---------------------------------------------------------------------------

export function enterRenameMode(ctx: Ctx, card: HTMLElement): void {
  const nameEl = card.querySelector<HTMLElement>('.scrap-name');
  const oldName = nameEl?.textContent?.trim() ?? '';
  if (!nameEl || !oldName) return;
  const parent = nameEl.parentElement;
  if (!parent) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'scrap-rename-input';
  input.value = oldName;
  input.setAttribute('aria-label', `rename ${oldName}`);
  input.style.cssText = 'font-family: var(--er-font-mono); font-size: 0.85rem; border: 1px solid var(--er-faded-2); background: var(--er-paper); color: var(--er-ink); padding: 0.1rem 0.3rem; width: 100%;';
  parent.replaceChild(input, nameEl);

  const dotIdx = oldName.lastIndexOf('.');
  if (dotIdx > 0) input.setSelectionRange(0, dotIdx);
  input.focus();

  const hint = document.createElement('p');
  hint.className = 'scrap-rename-hint';
  hint.style.cssText = 'font-family: var(--er-font-mono); font-size: 0.62rem; color: var(--er-red-pencil); margin: 0.2rem 0 0;';
  parent.appendChild(hint);

  const restore = (): void => {
    if (input.parentElement === parent) parent.replaceChild(nameEl, input);
    if (hint.parentElement === parent) parent.removeChild(hint);
  };

  const validate = (name: string): string | null => {
    if (!name) return 'required';
    if (!FILENAME_RE.test(name)) return 'use [A-Za-z0-9._ -]';
    if (name.startsWith('.')) return 'no leading dot';
    return null;
  };

  input.addEventListener('input', () => {
    const err = validate(input.value.trim());
    if (err) { input.dataset.invalid = 'true'; hint.textContent = err; }
    else { input.removeAttribute('data-invalid'); hint.textContent = ''; }
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); restore(); return; }
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const newName = input.value.trim();
    if (newName === oldName) { restore(); return; }
    const err = validate(newName);
    if (err) { input.dataset.invalid = 'true'; hint.textContent = err; return; }
    void (async () => {
      try {
        const res = await fetch('/api/dev/scrapbook/rename', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            site: ctx.site, slug: ctx.path, oldName, newName, secret: isCardSecret(card),
          }),
        });
        if (!res.ok) throw new Error(parseErrorBody(await res.json()) ?? 'rename failed');
        nameEl.textContent = newName;
        restore();
        flashInfo(ctx.page, `renamed to ${newName}`);
      } catch (e) {
        flashError(ctx.page, `rename failed: ${msg(e)}`);
        restore();
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Delete (two-step inline confirm replacing the foot toolbar)
// ---------------------------------------------------------------------------

export function enterDeleteConfirm(
  ctx: Ctx,
  card: HTMLElement,
  rewireCard: (card: HTMLElement) => void,
): void {
  if (card.dataset.state === 'deleting') return;
  const foot = card.querySelector<HTMLElement>('.scrap-card-foot');
  if (!foot) return;
  const prevHtml = foot.innerHTML;
  card.dataset.state = 'deleting';

  foot.innerHTML = '';
  const cancelBtn = mkToolBtn('cancel');
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'scrap-tool scrap-tool--delete';
  confirmBtn.textContent = 'confirm delete';
  foot.append(cancelBtn, confirmBtn);

  const revert = (): void => {
    foot.innerHTML = prevHtml;
    card.dataset.state = 'closed';
    rewireCard(card);
  };

  const timeout = window.setTimeout(revert, 4000);
  cancelBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    window.clearTimeout(timeout);
    revert();
  });
  confirmBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    window.clearTimeout(timeout);
    void (async () => {
      try {
        const filename = readCardFilename(card);
        const res = await fetch('/api/dev/scrapbook/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            site: ctx.site, slug: ctx.path, filename, secret: isCardSecret(card),
          }),
        });
        if (!res.ok) throw new Error(parseErrorBody(await res.json()) ?? 'delete failed');
        card.style.transition = 'opacity 180ms ease-in, transform 180ms ease-in';
        card.style.transform = 'translateX(-12px)';
        card.style.opacity = '0';
        window.setTimeout(() => { card.remove(); flashInfo(ctx.page, `deleted`); }, 200);
      } catch (e) {
        flashError(ctx.page, `delete failed: ${msg(e)}`);
        revert();
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Mark-secret (cross-section move via rename endpoint)
// ---------------------------------------------------------------------------

export async function toggleSecret(ctx: Ctx, card: HTMLElement): Promise<void> {
  const filename = readCardFilename(card);
  if (!filename) return;
  const fromSecret = isCardSecret(card);
  const toSecret = !fromSecret;
  try {
    const res = await fetch('/api/dev/scrapbook/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        site: ctx.site, slug: ctx.path, oldName: filename, newName: filename,
        secret: fromSecret, toSecret,
      }),
    });
    if (!res.ok) throw new Error(parseErrorBody(await res.json()) ?? 'move failed');
    flashInfo(ctx.page, toSecret ? `marked secret: ${filename}` : `marked public: ${filename}`);
    window.location.reload();
  } catch (e) {
    flashError(ctx.page, `move failed: ${msg(e)}`);
  }
}

// ---------------------------------------------------------------------------
// New note — inline composer (#166, Phase 34b — restores pre-F1 UX)
// ---------------------------------------------------------------------------

/**
 * Reveal the inline composer markup that's server-rendered hidden in
 * `pages/scrapbook.ts::renderComposer`. Pre-fills the filename field
 * with today-dated default (`note-YYYY-MM-DD.md`) when empty so the
 * operator can hit save immediately.
 */
export function showComposer(ctx: Ctx): void {
  const form = ctx.page.querySelector<HTMLFormElement>('[data-scrap-composer]');
  if (!form) return;
  form.hidden = false;
  const filename = form.querySelector<HTMLInputElement>('[data-composer-filename]');
  if (filename && !filename.value) {
    filename.value = `note-${new Date().toISOString().slice(0, 10)}.md`;
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.querySelector<HTMLTextAreaElement>('[data-composer-body]')?.focus();
}

function hideComposer(ctx: Ctx): void {
  const form = ctx.page.querySelector<HTMLFormElement>('[data-scrap-composer]');
  if (!form) return;
  form.hidden = true;
  const filename = form.querySelector<HTMLInputElement>('[data-composer-filename]');
  const body = form.querySelector<HTMLTextAreaElement>('[data-composer-body]');
  const secret = form.querySelector<HTMLInputElement>('[data-composer-secret]');
  if (filename) filename.value = '';
  if (body) body.value = '';
  if (secret) secret.checked = false;
}

async function submitComposer(ctx: Ctx): Promise<void> {
  const form = ctx.page.querySelector<HTMLFormElement>('[data-scrap-composer]');
  if (!form) return;
  const filenameInput = form.querySelector<HTMLInputElement>('[data-composer-filename]');
  const bodyInput = form.querySelector<HTMLTextAreaElement>('[data-composer-body]');
  const secretInput = form.querySelector<HTMLInputElement>('[data-composer-secret]');
  if (!filenameInput || !bodyInput) return;

  let filename = filenameInput.value.trim();
  if (!filename) filename = `note-${new Date().toISOString().slice(0, 10)}.md`;
  if (!filename.endsWith('.md')) filename += '.md';
  if (!FILENAME_RE.test(filename)) {
    flashError(ctx.page, `invalid filename: ${filename}`);
    return;
  }
  const secret = secretInput?.checked === true;
  try {
    const res = await fetch('/api/dev/scrapbook/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        site: ctx.site,
        slug: ctx.path,
        filename,
        body: bodyInput.value,
        secret,
      }),
    });
    if (!res.ok) throw new Error(parseErrorBody(await res.json()) ?? 'create failed');
    flashInfo(ctx.page, secret ? `created secret/${filename}` : `created ${filename}`);
    hideComposer(ctx);
    // Page reload is the simplest way to land the new card in sorted
    // position with the right seq numbers; the cards-grid keeps state
    // server-side, so re-render is the source of truth.
    window.location.reload();
  } catch (e) {
    flashError(ctx.page, `create failed: ${msg(e)}`);
  }
}

/**
 * Wire the composer's cancel/save/keyboard handlers to its form
 * markup. Idempotent on the form element — safe to call once during
 * client init.
 */
export function wireComposer(ctx: Ctx): void {
  const form = ctx.page.querySelector<HTMLFormElement>('[data-scrap-composer]');
  if (!form) return;
  const cancelBtn = form.querySelector<HTMLButtonElement>('[data-action="composer-cancel"]');
  const bodyInput = form.querySelector<HTMLTextAreaElement>('[data-composer-body]');

  cancelBtn?.addEventListener('click', () => hideComposer(ctx));
  bodyInput?.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') {
      ev.preventDefault();
      void submitComposer(ctx);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      hideComposer(ctx);
    }
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void submitComposer(ctx);
  });
}

// ---------------------------------------------------------------------------
// Upload (click-to-pick; F5 will wire the drop zone overlay)
// ---------------------------------------------------------------------------

export async function pickAndUpload(ctx: Ctx): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  await new Promise<void>((resolve) => {
    input.onchange = (): void => {
      const file = input.files?.[0];
      if (!file) { resolve(); return; }
      void uploadFile(ctx, file).then(resolve);
    };
    input.click();
  });
}

export async function uploadFile(ctx: Ctx, file: File): Promise<void> {
  try {
    const fd = new FormData();
    fd.append('site', ctx.site);
    fd.append('slug', ctx.path);
    fd.append('file', file);
    const res = await fetch('/api/dev/scrapbook/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(parseErrorBody(await res.json()) ?? 'upload failed');
    flashInfo(ctx.page, `uploaded ${file.name}`);
    window.location.reload();
  } catch (e) { flashError(ctx.page, `upload failed: ${msg(e)}`); }
}
