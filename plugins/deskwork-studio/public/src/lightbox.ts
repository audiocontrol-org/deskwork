/*
 * lightbox.ts — click-to-view image viewer for studio scrapbook surfaces.
 *
 * `initScrapbookLightbox()` binds clicks on:
 *   - `.scrap[data-kind="img"] .scrap__thumb-link` (read-only
 *     drawer / content-view detail panel rows)
 *   - `.scrapbook-item[data-kind="img"] .scrapbook-body-img img`
 *     (standalone viewer's expanded image body)
 * ESC closes the overlay; ← / → cycle through adjacent image-kind
 * items in the same scrapbook collection.
 *
 * Editorial-print aesthetic (cream-tinted backdrop, thin gold-leaf
 * rule around the image, mono caption).
 *
 * (A second `initLightbox()` for published-site BlogLayout figures
 * was removed in #176 — it had no consumer in the deskwork tree.)
 */

interface LightboxItem {
  src: string;
  alt: string;
  caption: string;
}

let overlay: HTMLElement | null = null;
let currentIndex = 0;
let currentSet: LightboxItem[] = [];

function ensureOverlay(): HTMLElement {
  if (overlay && document.body.contains(overlay)) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'blog-lightbox';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image viewer');
  overlay.innerHTML = `
    <button type="button" class="blog-lightbox-close" aria-label="Close">×</button>
    <button type="button" class="blog-lightbox-prev" aria-label="Previous image" hidden>‹</button>
    <button type="button" class="blog-lightbox-next" aria-label="Next image" hidden>›</button>
    <figure class="blog-lightbox-figure">
      <img class="blog-lightbox-image" alt="" />
      <figcaption class="blog-lightbox-caption"></figcaption>
    </figure>
  `;
  overlay.addEventListener('click', (ev) => {
    // Clicks on the backdrop (overlay itself) or the close button
    // close the viewer. Clicks inside the image, caption, or
    // navigation buttons do not.
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === overlay || target.classList.contains('blog-lightbox-close')) {
      close();
      return;
    }
    if (target.classList.contains('blog-lightbox-prev')) {
      ev.stopPropagation();
      step(-1);
      return;
    }
    if (target.classList.contains('blog-lightbox-next')) {
      ev.stopPropagation();
      step(1);
      return;
    }
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeydown);
  return overlay;
}

function paint(): void {
  const el = ensureOverlay();
  const item = currentSet[currentIndex];
  if (!item) {
    close();
    return;
  }
  const img = el.querySelector<HTMLImageElement>('.blog-lightbox-image');
  const cap = el.querySelector<HTMLElement>('.blog-lightbox-caption');
  if (img) {
    img.src = item.src;
    img.alt = item.alt;
  }
  if (cap) {
    cap.textContent = item.caption;
    cap.hidden = item.caption.length === 0;
  }
  // Show prev/next only when the set actually has neighbors.
  const prev = el.querySelector<HTMLButtonElement>('.blog-lightbox-prev');
  const next = el.querySelector<HTMLButtonElement>('.blog-lightbox-next');
  const multi = currentSet.length > 1;
  if (prev) prev.hidden = !multi;
  if (next) next.hidden = !multi;
}

function open(items: LightboxItem[], startIndex: number): void {
  if (items.length === 0) return;
  currentSet = items;
  currentIndex = Math.max(0, Math.min(startIndex, items.length - 1));
  const el = ensureOverlay();
  paint();
  el.hidden = false;
  document.body.classList.add('blog-lightbox-open');
  el.querySelector<HTMLButtonElement>('.blog-lightbox-close')?.focus();
}

function close(): void {
  if (!overlay) return;
  overlay.hidden = true;
  currentSet = [];
  currentIndex = 0;
  document.body.classList.remove('blog-lightbox-open');
}

function step(delta: number): void {
  if (currentSet.length === 0) return;
  const len = currentSet.length;
  currentIndex = (currentIndex + delta + len) % len;
  paint();
}

function onKeydown(ev: KeyboardEvent): void {
  if (!overlay || overlay.hidden) return;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    close();
    return;
  }
  if (currentSet.length > 1) {
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      step(-1);
      return;
    }
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      step(1);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Published-site BlogLayout figures (existing consumer)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Studio scrapbook lightbox (#29)
// ---------------------------------------------------------------------------

interface ScrapImageItem {
  /** The clickable element — wraps the actual <img>. */
  trigger: HTMLElement;
  /** The image element to lift into the lightbox. */
  img: HTMLImageElement;
  /** Caption: filename · size · mtime. */
  caption: string;
}

function captionForScrapRow(row: HTMLElement): string {
  const filename = row.dataset.filename ?? '';
  const sizeEl = row.querySelector<HTMLElement>('.scrap__size');
  const mtimeEl = row.querySelector<HTMLElement>('.scrap__mtime');
  const parts: string[] = [];
  if (filename) parts.push(filename);
  const size = sizeEl?.textContent?.trim();
  if (size) parts.push(size);
  const mtime = mtimeEl?.textContent?.trim();
  if (mtime) parts.push(mtime);
  return parts.join(' · ');
}

function captionForScrapbookItem(li: HTMLElement): string {
  const filename = li.dataset.filename ?? '';
  const mtimeEl = li.querySelector<HTMLElement>('.scrapbook-mtime');
  const sizeAttr = li.dataset.size;
  const parts: string[] = [];
  if (filename) parts.push(filename);
  if (sizeAttr) {
    const bytes = Number.parseInt(sizeAttr, 10);
    if (Number.isFinite(bytes) && bytes > 0) {
      parts.push(formatBytes(bytes));
    }
  }
  const mtime = mtimeEl?.textContent?.trim();
  if (mtime) parts.push(mtime);
  return parts.join(' · ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function collectScrapRowImages(scope: ParentNode): ScrapImageItem[] {
  const out: ScrapImageItem[] = [];
  const rows = scope.querySelectorAll<HTMLElement>('.scrap[data-kind="img"]');
  for (const row of rows) {
    const trigger = row.querySelector<HTMLElement>('.scrap__thumb-link');
    const img = row.querySelector<HTMLImageElement>('img.scrap__thumb');
    if (!trigger || !img) continue;
    out.push({
      trigger,
      img,
      caption: captionForScrapRow(row),
    });
  }
  return out;
}

function collectScrapbookItemImages(scope: ParentNode): ScrapImageItem[] {
  const out: ScrapImageItem[] = [];
  const items = scope.querySelectorAll<HTMLElement>(
    '.scrapbook-item[data-kind="img"]',
  );
  for (const li of items) {
    const img = li.querySelector<HTMLImageElement>('.scrapbook-body-img img');
    if (!img) continue;
    out.push({
      trigger: img,
      img,
      caption: captionForScrapbookItem(li),
    });
  }
  return out;
}

function lightboxItemsFor(set: ScrapImageItem[]): LightboxItem[] {
  return set.map((s) => ({
    src: s.img.currentSrc || s.img.src,
    alt: s.img.alt || '',
    caption: s.caption,
  }));
}

function bindScrapTrigger(set: ScrapImageItem[], index: number): void {
  const item = set[index];
  if (item.trigger.dataset.lightboxReady === 'true') return;
  // For `<a class="scrap__thumb-link">` the existing href opens the
  // file in a new tab. The lightbox preempts that with click-cancel
  // so the operator stays in context.
  item.trigger.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    open(lightboxItemsFor(set), index);
  });
  item.img.style.cursor = 'zoom-in';
  item.trigger.dataset.lightboxReady = 'true';
}

/**
 * Initialize the scrapbook lightbox for the given root (defaults to
 * the document). Call after server render, after expand-on-load, and
 * after every operation that mutates the item list (the standalone
 * viewer reloads on most mutations — re-init lands automatically).
 */
export function initScrapbookLightbox(root: ParentNode = document): void {
  const rowSet = collectScrapRowImages(root);
  for (let i = 0; i < rowSet.length; i++) bindScrapTrigger(rowSet, i);
  const itemSet = collectScrapbookItemImages(root);
  for (let i = 0; i < itemSet.length; i++) bindScrapTrigger(itemSet, i);
}
