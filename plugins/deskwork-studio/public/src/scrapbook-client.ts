/**
 * Scrapbook viewer client — `/dev/scrapbook/<site>/<path>`.
 *
 * Issue #161 redesign — wires the new .scrap-* markup tree:
 *   - filter chips (.scrap-filter): toggle data-filtered-out on cards
 *   - search input (.scrap-search input[data-scrap-search]): filter cards by
 *     name; '/' focuses the input from anywhere outside another text field
 *   - card open/close (.scrap-name + [data-action="open"]): toggle data-state
 *   - foot toolbar buttons: rename / edit / mark-secret / delete
 *   - aside actions: new-note / upload
 *
 * F1 ships filter / search / open-close / mutations. F4 will refine
 * single-expanded invariant + aside cross-linking + URL hash sync. F5
 * will add the drop zone and secret section.
 *
 * Mutation handlers (rename/edit/delete/mark-secret/new-note/upload)
 * preserve the rich UX of the prior client and live in
 * `./scrapbook-mutations.ts`. Markdown rendering and the toast helper
 * live in `./scrapbook-markdown.ts` and `./scrapbook-toast.ts`. This
 * file is the orchestration shell that wires the markup tree to those
 * handlers.
 */

import { initScrapbookLightbox } from './lightbox.ts';
import {
  enterDeleteConfirm,
  enterEditMode,
  enterRenameMode,
  newNote,
  pickAndUpload,
  renderExpandedBody,
  toggleSecret,
  type Ctx,
} from './scrapbook-mutations.ts';

const FILTER_KEYS = ['all', 'md', 'img', 'json', 'txt', 'other'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function init(): void {
  const page = document.querySelector<HTMLElement>('.scrap-page');
  if (!page) return;
  const ctx = readCtx(page);
  if (!ctx) return;

  wireFilterChips(ctx);
  wireSearch(ctx);
  wireCards(ctx);
  wireAsideLinks(ctx);
  wireAsideActions(ctx);
  initScrapbookLightbox(page);
  // F4: restore expanded state from #item-N hash on page load.
  restoreFromHash(ctx);
}

function readCtx(page: HTMLElement): Ctx | null {
  // Server emits data-site / data-path on .scrap-page (scrapbook.ts). The
  // client reads them directly — parsing a display string would silently
  // break the moment the path display format changes.
  const site = page.dataset.site;
  const path = page.dataset.path;
  if (!site || !path) return null;
  return { page, site, path };
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

function isFilterKey(v: string): v is FilterKey {
  return (FILTER_KEYS as readonly string[]).includes(v);
}

function wireFilterChips(ctx: Ctx): void {
  const chips = ctx.page.querySelectorAll<HTMLButtonElement>('.scrap-filter');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const raw = chip.dataset.filter ?? 'all';
      const filter: FilterKey = isFilterKey(raw) ? raw : 'all';
      chips.forEach((c) => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      applyFilter(ctx, filter);
    });
  });
}

function applyFilter(ctx: Ctx, filter: FilterKey): void {
  ctx.page.querySelectorAll<HTMLElement>('.scrap-card').forEach((card) => {
    const kind = card.dataset.kind ?? 'other';
    const match = filter === 'all' || filter === kind;
    if (match) card.removeAttribute('data-filtered-out');
    else card.setAttribute('data-filtered-out', 'true');
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function wireSearch(ctx: Ctx): void {
  const input = ctx.page.querySelector<HTMLInputElement>('.scrap-search input[data-scrap-search]');
  if (!input) return;
  input.addEventListener('input', () => applySearch(ctx, input.value));
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/') return;
    const tgt = ev.target;
    if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
    ev.preventDefault();
    input.focus();
    input.select();
  });
}

function applySearch(ctx: Ctx, query: string): void {
  const q = query.trim().toLowerCase();
  ctx.page.querySelectorAll<HTMLElement>('.scrap-card').forEach((card) => {
    const name = card.querySelector<HTMLElement>('.scrap-name')?.textContent?.toLowerCase() ?? '';
    const match = q === '' || name.includes(q);
    if (match) card.removeAttribute('data-search-out');
    else card.setAttribute('data-search-out', 'true');
  });
}

// ---------------------------------------------------------------------------
// Cards (open/close + toolbar wiring)
// ---------------------------------------------------------------------------

function wireCards(ctx: Ctx): void {
  ctx.page.querySelectorAll<HTMLElement>('.scrap-card').forEach((card) => wireCard(ctx, card));
}

function wireCard(ctx: Ctx, card: HTMLElement): void {
  card.querySelectorAll<HTMLElement>('.scrap-name, .scrap-card-foot [data-action="open"]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      // Edit / rename / etc. live in the same foot toolbar; let those
      // buttons' own handlers fire without the open toggle riding along.
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-action="edit"], [data-action="rename"], [data-action="delete"], [data-action="mark-secret"]')) return;
      ev.preventDefault();
      void toggleCard(ctx, card);
    });
  });
  const foot = card.querySelector<HTMLElement>('.scrap-card-foot');
  if (!foot) return;
  foot.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLButtonElement>('[data-action]');
    if (!btn || !foot.contains(btn)) return;
    const action = btn.dataset.action;
    if (action === 'open' || action === undefined) return;
    ev.stopPropagation();
    switch (action) {
      case 'edit': void enterEditMode(ctx, card); break;
      case 'rename': enterRenameMode(ctx, card); break;
      case 'delete': enterDeleteConfirm(ctx, card, (c) => wireCard(ctx, c)); break;
      case 'mark-secret': void toggleSecret(ctx, card); break;
    }
  });
}

async function toggleCard(ctx: Ctx, card: HTMLElement): Promise<void> {
  const wasExpanded = card.dataset.state === 'expanded';
  // F4 single-expanded invariant: collapse anything else first. The
  // operator's mental model is "one slip on the desk under the lamp" —
  // multiple expanded cards cause cascading reflow churn.
  ctx.page.querySelectorAll<HTMLElement>('.scrap-card[data-state="expanded"]').forEach((other) => {
    if (other !== card) other.dataset.state = 'closed';
  });
  card.dataset.state = wasExpanded ? 'closed' : 'expanded';
  syncAsideActive(ctx);
  syncUrlHash(ctx);
  if (!wasExpanded) {
    await renderExpandedBody(ctx, card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ---------------------------------------------------------------------------
// Aside cross-link binding (F4)
// ---------------------------------------------------------------------------

function wireAsideLinks(ctx: Ctx): void {
  ctx.page.querySelectorAll<HTMLAnchorElement>('.scrap-aside-list a[data-scrap-aside-link]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = (a.getAttribute('href') ?? '').replace(/^#/, '');
      if (!id) return;
      const card = ctx.page.querySelector<HTMLElement>(`.scrap-card#${CSS.escape(id)}`);
      if (card) void toggleCard(ctx, card);
    });
  });
}

function syncAsideActive(ctx: Ctx): void {
  const expanded = ctx.page.querySelector<HTMLElement>('.scrap-card[data-state="expanded"]');
  ctx.page.querySelectorAll<HTMLAnchorElement>('.scrap-aside-list a[data-scrap-aside-link]').forEach((a) => {
    if (expanded && a.getAttribute('href') === `#${expanded.id}`) {
      a.setAttribute('data-active', 'true');
    } else {
      a.removeAttribute('data-active');
    }
  });
}

function syncUrlHash(ctx: Ctx): void {
  const expanded = ctx.page.querySelector<HTMLElement>('.scrap-card[data-state="expanded"]');
  const hash = expanded ? `#${expanded.id}` : '';
  if (window.location.hash === hash) return;
  // replaceState so back/forward isn't peppered with one entry per click.
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(null, '', url);
}

function restoreFromHash(ctx: Ctx): void {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;
  const id = hash.slice(1);
  const card = ctx.page.querySelector<HTMLElement>(`.scrap-card#${CSS.escape(id)}`);
  if (card) void toggleCard(ctx, card);
}

// ---------------------------------------------------------------------------
// Aside actions (new note + upload)
// ---------------------------------------------------------------------------

function wireAsideActions(ctx: Ctx): void {
  const aside = ctx.page.querySelector<HTMLElement>('.scrap-aside');
  if (!aside) return;
  aside.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLButtonElement>('[data-action]');
    if (!btn || !aside.contains(btn)) return;
    const action = btn.dataset.action;
    if (action === 'new-note') { ev.preventDefault(); void newNote(ctx); }
    if (action === 'upload') { ev.preventDefault(); void pickAndUpload(ctx); }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
}
