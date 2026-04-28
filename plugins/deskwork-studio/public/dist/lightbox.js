// ../../plugins/deskwork-studio/public/src/lightbox.ts
var overlay = null;
var currentIndex = 0;
var currentSet = [];
function ensureOverlay() {
  if (overlay && document.body.contains(overlay)) return overlay;
  overlay = document.createElement("div");
  overlay.className = "blog-lightbox";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Image viewer");
  overlay.innerHTML = `
    <button type="button" class="blog-lightbox-close" aria-label="Close">\xD7</button>
    <button type="button" class="blog-lightbox-prev" aria-label="Previous image" hidden>\u2039</button>
    <button type="button" class="blog-lightbox-next" aria-label="Next image" hidden>\u203A</button>
    <figure class="blog-lightbox-figure">
      <img class="blog-lightbox-image" alt="" />
      <figcaption class="blog-lightbox-caption"></figcaption>
    </figure>
  `;
  overlay.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === overlay || target.classList.contains("blog-lightbox-close")) {
      close();
      return;
    }
    if (target.classList.contains("blog-lightbox-prev")) {
      ev.stopPropagation();
      step(-1);
      return;
    }
    if (target.classList.contains("blog-lightbox-next")) {
      ev.stopPropagation();
      step(1);
      return;
    }
  });
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeydown);
  return overlay;
}
function paint() {
  const el = ensureOverlay();
  const item = currentSet[currentIndex];
  if (!item) {
    close();
    return;
  }
  const img = el.querySelector(".blog-lightbox-image");
  const cap = el.querySelector(".blog-lightbox-caption");
  if (img) {
    img.src = item.src;
    img.alt = item.alt;
  }
  if (cap) {
    cap.textContent = item.caption;
    cap.hidden = item.caption.length === 0;
  }
  const prev = el.querySelector(".blog-lightbox-prev");
  const next = el.querySelector(".blog-lightbox-next");
  const multi = currentSet.length > 1;
  if (prev) prev.hidden = !multi;
  if (next) next.hidden = !multi;
}
function open(items, startIndex) {
  if (items.length === 0) return;
  currentSet = items;
  currentIndex = Math.max(0, Math.min(startIndex, items.length - 1));
  const el = ensureOverlay();
  paint();
  el.hidden = false;
  document.body.classList.add("blog-lightbox-open");
  el.querySelector(".blog-lightbox-close")?.focus();
}
function close() {
  if (!overlay) return;
  overlay.hidden = true;
  currentSet = [];
  currentIndex = 0;
  document.body.classList.remove("blog-lightbox-open");
}
function step(delta) {
  if (currentSet.length === 0) return;
  const len = currentSet.length;
  currentIndex = (currentIndex + delta + len) % len;
  paint();
}
function onKeydown(ev) {
  if (!overlay || overlay.hidden) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    close();
    return;
  }
  if (currentSet.length > 1) {
    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      step(-1);
      return;
    }
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      step(1);
      return;
    }
  }
}
function initLightbox() {
  const figures = document.querySelectorAll(
    ".essay-body figure.blog-figure, .blog-article figure.blog-figure"
  );
  if (figures.length === 0) return;
  const items = [];
  const figureFor = /* @__PURE__ */ new Map();
  for (const fig of figures) {
    const img = fig.querySelector("img");
    if (!img) continue;
    const cap = fig.querySelector("figcaption");
    items.push({
      src: img.currentSrc || img.src,
      alt: img.alt,
      caption: cap?.textContent?.trim() ?? ""
    });
    figureFor.set(fig, items.length - 1);
  }
  for (const [fig, idx] of figureFor.entries()) {
    if (fig.dataset.lightboxReady === "true") continue;
    const img = fig.querySelector("img");
    if (!img) continue;
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => {
      items[idx] = {
        src: img.currentSrc || img.src,
        alt: img.alt,
        caption: items[idx].caption
      };
      open(items, idx);
    });
    fig.dataset.lightboxReady = "true";
  }
}
function captionForScrapRow(row) {
  const filename = row.dataset.filename ?? "";
  const sizeEl = row.querySelector(".scrap__size");
  const mtimeEl = row.querySelector(".scrap__mtime");
  const parts = [];
  if (filename) parts.push(filename);
  const size = sizeEl?.textContent?.trim();
  if (size) parts.push(size);
  const mtime = mtimeEl?.textContent?.trim();
  if (mtime) parts.push(mtime);
  return parts.join(" \xB7 ");
}
function captionForScrapbookItem(li) {
  const filename = li.dataset.filename ?? "";
  const mtimeEl = li.querySelector(".scrapbook-mtime");
  const sizeAttr = li.dataset.size;
  const parts = [];
  if (filename) parts.push(filename);
  if (sizeAttr) {
    const bytes = Number.parseInt(sizeAttr, 10);
    if (Number.isFinite(bytes) && bytes > 0) {
      parts.push(formatBytes(bytes));
    }
  }
  const mtime = mtimeEl?.textContent?.trim();
  if (mtime) parts.push(mtime);
  return parts.join(" \xB7 ");
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function collectScrapRowImages(scope) {
  const out = [];
  const rows = scope.querySelectorAll('.scrap[data-kind="img"]');
  for (const row of rows) {
    const trigger = row.querySelector(".scrap__thumb-link");
    const img = row.querySelector("img.scrap__thumb");
    if (!trigger || !img) continue;
    out.push({
      trigger,
      img,
      caption: captionForScrapRow(row)
    });
  }
  return out;
}
function collectScrapbookItemImages(scope) {
  const out = [];
  const items = scope.querySelectorAll(
    '.scrapbook-item[data-kind="img"]'
  );
  for (const li of items) {
    const img = li.querySelector(".scrapbook-body-img img");
    if (!img) continue;
    out.push({
      trigger: img,
      img,
      caption: captionForScrapbookItem(li)
    });
  }
  return out;
}
function lightboxItemsFor(set) {
  return set.map((s) => ({
    src: s.img.currentSrc || s.img.src,
    alt: s.img.alt || "",
    caption: s.caption
  }));
}
function bindScrapTrigger(set, index) {
  const item = set[index];
  if (item.trigger.dataset.lightboxReady === "true") return;
  item.trigger.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    open(lightboxItemsFor(set), index);
  });
  item.img.style.cursor = "zoom-in";
  item.trigger.dataset.lightboxReady = "true";
}
function initScrapbookLightbox(root = document) {
  const rowSet = collectScrapRowImages(root);
  for (let i = 0; i < rowSet.length; i++) bindScrapTrigger(rowSet, i);
  const itemSet = collectScrapbookItemImages(root);
  for (let i = 0; i < itemSet.length; i++) bindScrapTrigger(itemSet, i);
}
export {
  initLightbox,
  initScrapbookLightbox
};
//# sourceMappingURL=lightbox.js.map
