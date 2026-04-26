/*
 * lightbox.ts — click-to-view image viewer for blog figures.
 *
 * Wiring: `initLightbox()` is called from each site's BlogLayout on
 * page load. It finds every `figure.blog-figure img` inside the
 * rendered essay body, attaches a click listener that opens a
 * full-viewport overlay showing the image at natural size (or
 * viewport-constrained, whichever is smaller). Close on backdrop
 * click, close button, or Escape.
 *
 * Design intent:
 *   - No library, no dependencies. One small module, pure DOM.
 *   - The overlay lives outside the essay flow so it can't inherit
 *     any prose cascade from BlogLayout.
 *   - Caption from the figcaption follows the image in the overlay,
 *     matching what the reader saw inline.
 *   - Cursor hint on figure images (`cursor: zoom-in`) tells readers
 *     the click is live without needing a visible overlay.
 */

let overlay: HTMLElement | null = null;

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
    <figure class="blog-lightbox-figure">
      <img class="blog-lightbox-image" alt="" />
      <figcaption class="blog-lightbox-caption"></figcaption>
    </figure>
  `;
  overlay.addEventListener('click', (ev) => {
    // Clicks on the backdrop (overlay itself) or the close button
    // close the viewer. Clicks inside the image or caption do not.
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === overlay || target.classList.contains('blog-lightbox-close')) {
      close();
    }
  });
  document.body.appendChild(overlay);
  return overlay;
}

function open(src: string, alt: string, caption: string): void {
  const el = ensureOverlay();
  const img = el.querySelector<HTMLImageElement>('.blog-lightbox-image');
  const cap = el.querySelector<HTMLElement>('.blog-lightbox-caption');
  if (img) {
    img.src = src;
    img.alt = alt;
  }
  if (cap) {
    cap.textContent = caption;
    cap.hidden = caption.length === 0;
  }
  el.hidden = false;
  document.body.classList.add('blog-lightbox-open');
  // Focus the close button so Esc is wired to an element inside
  // the modal and screen readers announce the dialog.
  el.querySelector<HTMLButtonElement>('.blog-lightbox-close')?.focus();
}

function close(): void {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('blog-lightbox-open');
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape' && overlay && !overlay.hidden) {
    ev.preventDefault();
    close();
  }
}

/**
 * Attach click handlers to every `figure.blog-figure img` inside
 * the essay body. Idempotent — repeated calls (e.g. during Astro
 * client-side nav) skip figures that already carry the marker
 * attribute. Also wires the single Escape listener lazily on the
 * first call.
 */
export function initLightbox(): void {
  // Accept either site's body container class. editorialcontrol
  // uses .essay-body; audiocontrol uses .blog-article. Figures
  // from the remark plugin carry `.blog-figure` in both cases.
  const figures = document.querySelectorAll<HTMLElement>(
    '.essay-body figure.blog-figure, .blog-article figure.blog-figure',
  );
  if (figures.length === 0) return;
  for (const fig of figures) {
    if (fig.dataset.lightboxReady === 'true') continue;
    const img = fig.querySelector<HTMLImageElement>('img');
    if (!img) continue;
    const cap = fig.querySelector<HTMLElement>('figcaption');
    const caption = cap?.textContent?.trim() ?? '';
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => {
      open(img.currentSrc || img.src, img.alt, caption);
    });
    fig.dataset.lightboxReady = 'true';
  }
  document.addEventListener('keydown', onKeydown);
}
