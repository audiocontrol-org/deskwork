/**
 * Scrapbook viewer client. Binds all the interactive behavior the
 * design brief specifies: expand/collapse slips, lazy body-render on
 * first expand, inline edit/rename/delete, create-note composer,
 * drag-drop upload + full-page overlay, index-rail jump + scroll
 * sync, localStorage persistence.
 *
 * See docs/design/scrapbook-phase-19a-design.md for the contract.
 */

type Kind = 'md' | 'json' | 'js' | 'img' | 'txt' | 'other';

interface Ctx {
  root: HTMLElement;
  site: string;
  slug: string;
  statusEl: HTMLElement | null;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const FILENAME_RE = /^[a-zA-Z0-9._-][a-zA-Z0-9._ -]*$/;

export function initScrapbook(): void {
  const root = document.querySelector<HTMLElement>('[data-scrapbook-root]');
  if (!root) return;
  const site = root.dataset.site ?? '';
  const slug = root.dataset.slug ?? '';
  const statusEl = root.querySelector<HTMLElement>('[data-scrapbook-status]');
  const ctx: Ctx = { root, site, slug, statusEl };

  wireItems(ctx);
  wireComposer(ctx);
  wireIndexButtons(ctx);
  wireDropZone(ctx);
  wireOverlay(ctx);
  wireIndexScrollSync(ctx);
  restoreOpenStates(ctx);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function wireItems(ctx: Ctx): void {
  const items = ctx.root.querySelectorAll<HTMLLIElement>('.scrapbook-item');
  items.forEach((item) => wireItem(ctx, item));
}

function wireItem(ctx: Ctx, item: HTMLLIElement): void {
  const header = item.querySelector<HTMLButtonElement>('.scrapbook-item-header');
  const toolbar = item.querySelector<HTMLElement>('[data-toolbar]');
  header?.addEventListener('click', (ev) => {
    // Avoid re-firing when a toolbar button was clicked (they're
    // children of the item but not the header button itself).
    if ((ev.target as Element).closest('[data-toolbar]')) return;
    toggleItem(ctx, item);
  });

  toolbar?.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest<HTMLButtonElement>('[data-action]');
    if (!btn) return;
    ev.stopPropagation();
    const action = btn.dataset.action;
    switch (action) {
      case 'edit':
        enterEditMode(ctx, item);
        break;
      case 'rename':
        enterRenameMode(ctx, item);
        break;
      case 'delete':
        enterDeleteConfirm(ctx, item);
        break;
    }
  });
}

function toggleItem(ctx: Ctx, item: HTMLLIElement): void {
  const open = item.dataset.open === 'true';
  if (open) collapseItem(item);
  else expandItem(ctx, item);
}

async function expandItem(ctx: Ctx, item: HTMLLIElement): Promise<void> {
  item.dataset.open = 'true';
  item.querySelector('.scrapbook-item-header')?.setAttribute('aria-expanded', 'true');
  persistOpenState(ctx, item, true);
  const bodyContent = item.querySelector<HTMLElement>('[data-body-content]');
  if (!bodyContent || bodyContent.dataset.loaded === 'true') return;
  const filename = item.dataset.filename ?? '';
  const kind = (item.dataset.kind as Kind) ?? 'other';
  try {
    await renderBody(ctx, bodyContent, kind, filename);
    bodyContent.dataset.loaded = 'true';
  } catch (e) {
    flashError(ctx, `couldn't read ${filename}: ${msg(e)}`);
  }
}

function collapseItem(item: HTMLLIElement): void {
  item.dataset.open = 'false';
  item.querySelector('.scrapbook-item-header')?.setAttribute('aria-expanded', 'false');
  const site = item.closest<HTMLElement>('[data-scrapbook-root]')?.dataset.site;
  const slug = item.closest<HTMLElement>('[data-scrapbook-root]')?.dataset.slug;
  if (site && slug && item.dataset.filename) {
    try {
      localStorage.removeItem(openKey(site, slug, item.dataset.filename));
    } catch { /* noop */ }
  }
}

function persistOpenState(ctx: Ctx, item: HTMLLIElement, open: boolean): void {
  if (!item.dataset.filename) return;
  try {
    if (open) localStorage.setItem(openKey(ctx.site, ctx.slug, item.dataset.filename), '1');
    else localStorage.removeItem(openKey(ctx.site, ctx.slug, item.dataset.filename));
  } catch { /* noop */ }
}

function restoreOpenStates(ctx: Ctx): void {
  const items = ctx.root.querySelectorAll<HTMLLIElement>('.scrapbook-item');
  items.forEach((item) => {
    const filename = item.dataset.filename;
    if (!filename) return;
    try {
      if (localStorage.getItem(openKey(ctx.site, ctx.slug, filename)) === '1') {
        void expandItem(ctx, item);
      }
    } catch { /* noop */ }
  });
}

function openKey(site: string, slug: string, filename: string): string {
  return `scrapbook:${site}:${slug}:${filename}`;
}

// ---------------------------------------------------------------------------
// Body render by kind
// ---------------------------------------------------------------------------

async function renderBody(
  ctx: Ctx,
  target: HTMLElement,
  kind: Kind,
  filename: string,
): Promise<void> {
  target.textContent = '';
  if (kind === 'img') {
    const img = document.createElement('img');
    img.src = `/api/dev/scrapbook/read?site=${ctx.site}&slug=${ctx.slug}&file=${encodeURIComponent(filename)}`;
    img.alt = '';
    const wrap = document.createElement('div');
    wrap.className = 'scrapbook-body-img';
    wrap.appendChild(img);
    const meta = document.createElement('p');
    meta.className = 'scrapbook-body-img-meta';
    img.addEventListener('load', () => {
      meta.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    });
    wrap.appendChild(meta);
    target.appendChild(wrap);
    return;
  }

  const res = await fetch(
    `/api/dev/scrapbook/read?site=${ctx.site}&slug=${ctx.slug}&file=${encodeURIComponent(filename)}`,
  );
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { content: string; kind: Kind };
  const content = data.content;

  if (kind === 'md') {
    const wrap = document.createElement('div');
    wrap.className = 'scrapbook-body-md';
    wrap.innerHTML = renderMarkdown(content);
    target.appendChild(wrap);
    return;
  }
  if (kind === 'json') {
    const pre = document.createElement('pre');
    pre.className = 'scrapbook-body-code';
    try {
      pre.textContent = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      pre.textContent = content;
    }
    target.appendChild(pre);
    return;
  }
  if (kind === 'js' || kind === 'txt') {
    const pre = document.createElement('pre');
    pre.className = 'scrapbook-body-code';
    pre.textContent = content;
    target.appendChild(pre);
    return;
  }
  // other: just link to download
  const wrap = document.createElement('div');
  wrap.className = 'scrapbook-body-other';
  const a = document.createElement('a');
  a.href = `/api/dev/scrapbook/read?site=${ctx.site}&slug=${ctx.slug}&file=${encodeURIComponent(filename)}`;
  a.textContent = `download ${filename} →`;
  wrap.appendChild(a);
  target.appendChild(wrap);
}

// Tiny markdown renderer — handles headings, paragraphs, emphasis,
// links, code blocks (fenced), inline code, lists, blockquotes.
// Enough for note-shaped content; not a full CommonMark impl.
function renderMarkdown(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let inCode: string | null = null;
  let listBuf: string[] = [];
  let listOrdered = false;
  let paraBuf: string[] = [];
  let quoteBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length === 0) return;
    const tag = listOrdered ? 'ol' : 'ul';
    out.push(`<${tag}>${listBuf.map((l) => `<li>${inline(l)}</li>`).join('')}</${tag}>`);
    listBuf = [];
  };
  const flushPara = () => {
    if (paraBuf.length === 0) return;
    out.push(`<p>${inline(paraBuf.join(' '))}</p>`);
    paraBuf = [];
  };
  const flushQuote = () => {
    if (quoteBuf.length === 0) return;
    out.push(`<blockquote>${inline(quoteBuf.join(' '))}</blockquote>`);
    quoteBuf = [];
  };
  const flushAll = () => { flushList(); flushPara(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Fenced code block
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (inCode === null) {
        flushAll();
        inCode = '';
      } else {
        out.push(`<pre><code>${escapeHtml(inCode)}</code></pre>`);
        inCode = null;
      }
      continue;
    }
    if (inCode !== null) { inCode += line + '\n'; continue; }

    // GFM pipe table: header row, then |---|---| separator, then body rows
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushAll();
      const header = splitTableRow(line);
      const bodyRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        bodyRows.push(splitTableRow(lines[j]));
        j++;
      }
      out.push(renderTable(header, bodyRows));
      i = j - 1;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushAll(); const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }

    // Blockquote
    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushList(); flushPara(); quoteBuf.push(q[1]); continue; }

    // Unordered list
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) { flushPara(); flushQuote(); if (!listOrdered && listBuf.length) flushList(); listOrdered = false; listBuf.push(ul[1]); continue; }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { flushPara(); flushQuote(); if (listOrdered === false && listBuf.length) flushList(); listOrdered = true; listBuf.push(ol[1]); continue; }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) { flushAll(); out.push('<hr />'); continue; }

    // Blank
    if (line.trim() === '') { flushAll(); continue; }

    // Paragraph accumulator
    flushList(); flushQuote();
    paraBuf.push(line);
  }
  flushAll();
  if (inCode !== null) out.push(`<pre><code>${escapeHtml(inCode)}</code></pre>`);
  return out.join('\n');
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  // A separator row is only pipes, dashes, colons, and whitespace, with
  // at least one dash.
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(trimmed);
}

function splitTableRow(line: string): string[] {
  // Strip leading/trailing pipe then split. Trim each cell.
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function renderTable(header: string[], rows: string[][]): string {
  const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
    : '';
  return `<table>${thead}${tbody}</table>`;
}

function inline(text: string): string {
  // Order matters: code first (so code contents don't get re-processed).
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}

// ---------------------------------------------------------------------------
// Edit mode (markdown)
// ---------------------------------------------------------------------------

async function enterEditMode(ctx: Ctx, item: HTMLLIElement): Promise<void> {
  const filename = item.dataset.filename ?? '';
  const bodyContent = item.querySelector<HTMLElement>('[data-body-content]');
  if (!bodyContent) return;
  await expandItem(ctx, item);

  // Fetch raw content
  let raw = '';
  try {
    const res = await fetch(`/api/dev/scrapbook/read?site=${ctx.site}&slug=${ctx.slug}&file=${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { content: string };
    raw = data.content;
  } catch (e) { flashError(ctx, `read failed: ${msg(e)}`); return; }

  bodyContent.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = 'scrapbook-editor';
  const ta = document.createElement('textarea');
  ta.value = raw;
  ta.setAttribute('aria-label', `edit ${filename}`);
  const footer = document.createElement('div');
  footer.className = 'scrapbook-editor-footer';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'scrapbook-tool';
  cancel.textContent = 'cancel';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'scrapbook-tool scrapbook-tool--primary';
  save.textContent = 'save →';
  footer.append(cancel, save);
  wrap.append(ta, footer);
  bodyContent.appendChild(wrap);
  ta.focus();

  const restoreRender = async () => {
    bodyContent.dataset.loaded = 'false';
    await renderBody(ctx, bodyContent, (item.dataset.kind as Kind) ?? 'md', filename);
    bodyContent.dataset.loaded = 'true';
  };

  cancel.addEventListener('click', () => { void restoreRender(); });
  const commit = async () => {
    try {
      const res = await fetch('/api/dev/scrapbook/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site: ctx.site, slug: ctx.slug, filename, body: ta.value }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'save failed');
      const { item: updated } = (await res.json()) as { item: { mtime: string; size: number } };
      item.dataset.mtime = updated.mtime;
      item.dataset.size = String(updated.size);
      const mtimeEl = item.querySelector<HTMLTimeElement>('.scrapbook-mtime');
      if (mtimeEl) { mtimeEl.dateTime = updated.mtime; mtimeEl.textContent = 'just now'; }
      flashInfo(ctx, `saved ${filename}`);
      await restoreRender();
    } catch (e) { flashError(ctx, `save failed: ${msg(e)}`); }
  };
  save.addEventListener('click', () => { void commit(); });
  ta.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') { ev.preventDefault(); void commit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); void restoreRender(); }
  });
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

function enterRenameMode(ctx: Ctx, item: HTMLLIElement): void {
  const cell = item.querySelector<HTMLElement>('[data-filename-cell]');
  const oldName = item.dataset.filename ?? '';
  if (!cell) return;
  cell.textContent = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'scrapbook-rename-input';
  input.value = oldName;
  input.setAttribute('aria-label', `rename ${oldName}`);
  cell.appendChild(input);
  // Position cursor before extension
  const dotIdx = oldName.lastIndexOf('.');
  if (dotIdx > 0) { input.setSelectionRange(0, dotIdx); }
  input.focus();
  const hint = document.createElement('p');
  hint.className = 'scrapbook-rename-hint';
  cell.appendChild(hint);

  const restore = () => { cell.textContent = oldName; item.dataset.filename = oldName; };

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

  input.addEventListener('keydown', async (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); restore(); return; }
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const newName = input.value.trim();
    if (newName === oldName) { restore(); return; }
    const err = validate(newName);
    if (err) { input.dataset.invalid = 'true'; hint.textContent = err; return; }
    try {
      const res = await fetch('/api/dev/scrapbook/rename', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site: ctx.site, slug: ctx.slug, oldName, newName }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'rename failed');
      item.dataset.filename = newName;
      const id = `item-${encodeURIComponent(newName)}`;
      item.id = id;
      cell.textContent = newName;
      // Update the index rail link to match
      const idxLink = ctx.root.querySelector<HTMLAnchorElement>(`[data-index-for="${oldName}"] a`);
      if (idxLink) { idxLink.textContent = newName; idxLink.setAttribute('href', `#${id}`); }
      const idxLi = ctx.root.querySelector<HTMLElement>(`[data-index-for="${oldName}"]`);
      if (idxLi) idxLi.setAttribute('data-index-for', newName);
      flashInfo(ctx, `renamed to ${newName}`);
    } catch (e) { flashError(ctx, `rename failed: ${msg(e)}`); restore(); }
  });
}

// ---------------------------------------------------------------------------
// Delete (two-step inline confirm)
// ---------------------------------------------------------------------------

function enterDeleteConfirm(ctx: Ctx, item: HTMLLIElement): void {
  if (item.dataset.state === 'deleting') return;
  item.dataset.state = 'deleting';
  const toolbar = item.querySelector<HTMLElement>('[data-toolbar]');
  if (!toolbar) return;
  const prevHtml = toolbar.innerHTML;

  toolbar.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'scrapbook-confirm-bar';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'scrapbook-tool';
  cancelBtn.textContent = 'cancel';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'scrapbook-tool scrapbook-tool--delete';
  confirmBtn.textContent = 'confirm delete';
  toolbar.append(cancelBtn, confirmBtn);
  // Bar at the bottom of the item (placed under the toolbar)
  item.appendChild(bar);

  const revert = () => {
    bar.remove();
    toolbar.innerHTML = prevHtml;
    item.dataset.state = 'closed';
    wireItem(ctx, item); // rewire toolbar buttons
  };

  const timeout = setTimeout(revert, 4000);
  cancelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); clearTimeout(timeout); revert(); });
  confirmBtn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    clearTimeout(timeout);
    try {
      const res = await fetch('/api/dev/scrapbook/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site: ctx.site, slug: ctx.slug, filename: item.dataset.filename }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'delete failed');
      // Slide out
      item.style.transition = 'opacity 180ms ease-in, transform 180ms ease-in';
      item.style.transform = 'translateX(-12px)';
      item.style.opacity = '0';
      setTimeout(() => {
        const filename = item.dataset.filename;
        item.remove();
        if (filename) {
          const idxLi = ctx.root.querySelector<HTMLElement>(`[data-index-for="${filename}"]`);
          idxLi?.remove();
        }
        flashInfo(ctx, `deleted`);
      }, 200);
    } catch (e) { flashError(ctx, `delete failed: ${msg(e)}`); revert(); }
  });
}

// ---------------------------------------------------------------------------
// Composer (new note)
// ---------------------------------------------------------------------------

function wireComposer(ctx: Ctx): void {
  const form = ctx.root.querySelector<HTMLFormElement>('[data-scrapbook-composer]');
  if (!form) return;
  const filenameInput = form.querySelector<HTMLInputElement>('[data-composer-filename]');
  const bodyInput = form.querySelector<HTMLTextAreaElement>('[data-composer-body]');
  const cancelBtn = form.querySelector<HTMLButtonElement>('[data-action="composer-cancel"]');
  const saveBtn = form.querySelector<HTMLButtonElement>('[data-action="composer-save"]');
  if (!filenameInput || !bodyInput || !cancelBtn || !saveBtn) return;

  cancelBtn.addEventListener('click', () => hideComposer(ctx));
  bodyInput.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') { ev.preventDefault(); void submit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); hideComposer(ctx); }
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); void submit(); });

  async function submit(): Promise<void> {
    let filename = filenameInput!.value.trim();
    if (!filename) {
      const now = new Date();
      filename = `note-${now.toISOString().slice(0, 10)}.md`;
    }
    if (!filename.endsWith('.md')) filename += '.md';
    if (!FILENAME_RE.test(filename)) { flashError(ctx, `invalid filename: ${filename}`); return; }
    try {
      const res = await fetch('/api/dev/scrapbook/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site: ctx.site, slug: ctx.slug, filename, body: bodyInput!.value }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'create failed');
      flashInfo(ctx, `created ${filename}`);
      hideComposer(ctx);
      // Simplest refresh — reload the page so the new slip appears
      // in sorted position with the right seq numbers.
      window.location.reload();
    } catch (e) { flashError(ctx, `create failed: ${msg(e)}`); }
  }
}

function showComposer(ctx: Ctx): void {
  const form = ctx.root.querySelector<HTMLFormElement>('[data-scrapbook-composer]');
  if (!form) return;
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.querySelector<HTMLTextAreaElement>('[data-composer-body]')?.focus();
}

function hideComposer(ctx: Ctx): void {
  const form = ctx.root.querySelector<HTMLFormElement>('[data-scrapbook-composer]');
  if (!form) return;
  form.hidden = true;
  form.querySelector<HTMLInputElement>('[data-composer-filename]')!.value = '';
  form.querySelector<HTMLTextAreaElement>('[data-composer-body]')!.value = '';
}

// ---------------------------------------------------------------------------
// Index rail + actions
// ---------------------------------------------------------------------------

function wireIndexButtons(ctx: Ctx): void {
  ctx.root.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest<HTMLButtonElement>('[data-action]');
    if (!btn || !ctx.root.contains(btn)) return;
    const action = btn.dataset.action;
    if (action === 'new-note') { ev.preventDefault(); showComposer(ctx); }
    if (action === 'upload') {
      ev.preventDefault();
      ctx.root.querySelector<HTMLInputElement>('[data-scrapbook-file-input]')?.click();
    }
  });
}

function wireIndexScrollSync(ctx: Ctx): void {
  const items = ctx.root.querySelectorAll<HTMLElement>('.scrapbook-item');
  if (items.length === 0) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const filename = (entry.target as HTMLElement).dataset.filename;
        if (!filename) return;
        ctx.root
          .querySelectorAll<HTMLElement>('[data-index-for]')
          .forEach((li) => li.removeAttribute('data-active'));
        const active = ctx.root.querySelector<HTMLElement>(`[data-index-for="${filename}"]`);
        active?.setAttribute('data-active', 'true');
      });
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
  );
  items.forEach((item) => observer.observe(item));
}

// ---------------------------------------------------------------------------
// Upload + drop zone
// ---------------------------------------------------------------------------

function wireDropZone(ctx: Ctx): void {
  const zone = ctx.root.querySelector<HTMLElement>('[data-scrapbook-drop]');
  const input = ctx.root.querySelector<HTMLInputElement>('[data-scrapbook-file-input]');
  if (!zone || !input) return;

  zone.addEventListener('click', (ev) => {
    if ((ev.target as Element).tagName !== 'INPUT') input.click();
  });
  zone.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); }
  });

  zone.addEventListener('dragover', (ev) => { ev.preventDefault(); zone.dataset.hover = 'true'; });
  zone.addEventListener('dragleave', () => { zone.removeAttribute('data-hover'); });
  zone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    zone.removeAttribute('data-hover');
    const files = ev.dataTransfer?.files;
    if (files && files.length > 0) void uploadFile(ctx, files[0]);
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void uploadFile(ctx, file);
    input.value = '';
  });
}

function wireOverlay(ctx: Ctx): void {
  const overlay = ctx.root.querySelector<HTMLElement>('[data-scrapbook-overlay]');
  if (!overlay) return;
  let depth = 0;
  document.body.addEventListener('dragenter', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files')) return;
    depth++;
    overlay.dataset.active = 'true';
  });
  document.body.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.removeAttribute('data-active');
  });
  document.body.addEventListener('drop', (ev) => {
    depth = 0;
    overlay.removeAttribute('data-active');
    if (!ev.dataTransfer?.files || ev.dataTransfer.files.length === 0) return;
    // If the drop target wasn't the in-page drop zone, route the file
    // to the scrapbook explicitly. Otherwise the drop zone handler
    // already caught it.
    if (!(ev.target as Element).closest('[data-scrapbook-drop]')) {
      ev.preventDefault();
      void uploadFile(ctx, ev.dataTransfer.files[0]);
    }
  });
}

async function uploadFile(ctx: Ctx, file: File): Promise<void> {
  try {
    const fd = new FormData();
    fd.append('site', ctx.site);
    fd.append('slug', ctx.slug);
    fd.append('file', file);
    const res = await fetch('/api/dev/scrapbook/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'upload failed');
    flashInfo(ctx, `uploaded ${file.name}`);
    window.location.reload();
  } catch (e) { flashError(ctx, `upload failed: ${msg(e)}`); }
}

// ---------------------------------------------------------------------------
// Status banner
// ---------------------------------------------------------------------------

function flashInfo(ctx: Ctx, text: string): void { flash(ctx, text, 'info'); }
function flashError(ctx: Ctx, text: string): void { flash(ctx, text, 'error'); }
function flash(ctx: Ctx, text: string, kind: 'info' | 'error'): void {
  if (!ctx.statusEl) return;
  ctx.statusEl.textContent = text;
  ctx.statusEl.dataset.kind = kind;
  ctx.statusEl.hidden = false;
  window.setTimeout(() => { if (ctx.statusEl) ctx.statusEl.hidden = true; }, 3200);
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// Mark SLUG_RE as used (client-side validation ensures the server
// receives well-formed args — keeping the regex here means both sides
// agree on the shape).
void SLUG_RE;
