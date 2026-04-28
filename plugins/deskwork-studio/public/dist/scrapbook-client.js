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

// ../../plugins/deskwork-studio/public/src/scrapbook-client.ts
function itemIsSecret(item) {
  return item.dataset.secret === "true";
}
var FILENAME_RE = /^[a-zA-Z0-9._-][a-zA-Z0-9._ -]*$/;
function initScrapbook() {
  const root = document.querySelector("[data-scrapbook-root]");
  if (!root) return;
  const site = root.dataset.site ?? "";
  const slug = root.dataset.slug ?? "";
  const statusEl = root.querySelector("[data-scrapbook-status]");
  const ctx = { root, site, slug, statusEl };
  wireItems(ctx);
  wireComposer(ctx);
  wireIndexButtons(ctx);
  wireDropZone(ctx);
  wireOverlay(ctx);
  wireIndexScrollSync(ctx);
  restoreOpenStates(ctx);
  initScrapbookLightbox(ctx.root);
}
function wireItems(ctx) {
  const items = ctx.root.querySelectorAll(".scrapbook-item");
  items.forEach((item) => wireItem(ctx, item));
}
function wireItem(ctx, item) {
  const header = item.querySelector(".scrapbook-item-header");
  const toolbar = item.querySelector("[data-toolbar]");
  header?.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-toolbar]")) return;
    toggleItem(ctx, item);
  });
  toolbar?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    ev.stopPropagation();
    const action = btn.dataset.action;
    switch (action) {
      case "edit":
        enterEditMode(ctx, item);
        break;
      case "rename":
        enterRenameMode(ctx, item);
        break;
      case "delete":
        enterDeleteConfirm(ctx, item);
        break;
      case "toggle-secret":
        void toggleSecret(ctx, item);
        break;
    }
  });
}
async function toggleSecret(ctx, item) {
  const filename = item.dataset.filename;
  if (!filename) return;
  const fromSecret = itemIsSecret(item);
  const toSecret = !fromSecret;
  try {
    const res = await fetch("/api/dev/scrapbook/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site: ctx.site,
        slug: ctx.slug,
        oldName: filename,
        newName: filename,
        secret: fromSecret,
        toSecret
      })
    });
    if (!res.ok) {
      throw new Error((await res.json()).error ?? "move failed");
    }
    flashInfo(ctx, toSecret ? `marked secret: ${filename}` : `marked public: ${filename}`);
    window.location.reload();
  } catch (e) {
    flashError(ctx, `move failed: ${msg(e)}`);
  }
}
function toggleItem(ctx, item) {
  const open2 = item.dataset.open === "true";
  if (open2) collapseItem(item);
  else expandItem(ctx, item);
}
async function expandItem(ctx, item) {
  item.dataset.open = "true";
  item.querySelector(".scrapbook-item-header")?.setAttribute("aria-expanded", "true");
  persistOpenState(ctx, item, true);
  const bodyContent = item.querySelector("[data-body-content]");
  if (!bodyContent || bodyContent.dataset.loaded === "true") return;
  const filename = item.dataset.filename ?? "";
  const kind = item.dataset.kind ?? "other";
  try {
    await renderBody(ctx, bodyContent, kind, filename);
    bodyContent.dataset.loaded = "true";
    if (kind === "img") initScrapbookLightbox(ctx.root);
  } catch (e) {
    flashError(ctx, `couldn't read ${filename}: ${msg(e)}`);
  }
}
function collapseItem(item) {
  item.dataset.open = "false";
  item.querySelector(".scrapbook-item-header")?.setAttribute("aria-expanded", "false");
  const site = item.closest("[data-scrapbook-root]")?.dataset.site;
  const slug = item.closest("[data-scrapbook-root]")?.dataset.slug;
  if (site && slug && item.dataset.filename) {
    try {
      localStorage.removeItem(openKey(site, slug, item.dataset.filename));
    } catch {
    }
  }
}
function persistOpenState(ctx, item, open2) {
  if (!item.dataset.filename) return;
  try {
    if (open2) localStorage.setItem(openKey(ctx.site, ctx.slug, item.dataset.filename), "1");
    else localStorage.removeItem(openKey(ctx.site, ctx.slug, item.dataset.filename));
  } catch {
  }
}
function restoreOpenStates(ctx) {
  const items = ctx.root.querySelectorAll(".scrapbook-item");
  items.forEach((item) => {
    const filename = item.dataset.filename;
    if (!filename) return;
    try {
      if (localStorage.getItem(openKey(ctx.site, ctx.slug, filename)) === "1") {
        void expandItem(ctx, item);
      }
    } catch {
    }
  });
}
function openKey(site, slug, filename, secret = false) {
  return secret ? `scrapbook:${site}:${slug}:secret:${filename}` : `scrapbook:${site}:${slug}:${filename}`;
}
async function renderBody(ctx, target, kind, filename) {
  target.textContent = "";
  const fileUrl = `/api/dev/scrapbook-file?site=${encodeURIComponent(ctx.site)}&path=${encodeURIComponent(ctx.slug)}&name=${encodeURIComponent(filename)}`;
  if (kind === "img") {
    const img = document.createElement("img");
    img.src = fileUrl;
    img.alt = "";
    const wrap2 = document.createElement("div");
    wrap2.className = "scrapbook-body-img";
    wrap2.appendChild(img);
    const meta = document.createElement("p");
    meta.className = "scrapbook-body-img-meta";
    img.addEventListener("load", () => {
      meta.textContent = `${img.naturalWidth} \xD7 ${img.naturalHeight}`;
    });
    wrap2.appendChild(meta);
    target.appendChild(wrap2);
    return;
  }
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.text();
  if (kind === "md") {
    const wrap2 = document.createElement("div");
    wrap2.className = "scrapbook-body-md";
    wrap2.innerHTML = renderMarkdown(content);
    target.appendChild(wrap2);
    return;
  }
  if (kind === "json") {
    const pre = document.createElement("pre");
    pre.className = "scrapbook-body-code";
    try {
      pre.textContent = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      pre.textContent = content;
    }
    target.appendChild(pre);
    return;
  }
  if (kind === "js" || kind === "txt") {
    const pre = document.createElement("pre");
    pre.className = "scrapbook-body-code";
    pre.textContent = content;
    target.appendChild(pre);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "scrapbook-body-other";
  const a = document.createElement("a");
  a.href = `/api/dev/scrapbook-file?site=${encodeURIComponent(ctx.site)}&path=${encodeURIComponent(ctx.slug)}&name=${encodeURIComponent(filename)}`;
  a.textContent = `download ${filename} \u2192`;
  wrap.appendChild(a);
  target.appendChild(wrap);
}
function renderMarkdown(src) {
  const lines = src.split("\n");
  const out = [];
  let inCode = null;
  let listBuf = [];
  let listOrdered = false;
  let paraBuf = [];
  let quoteBuf = [];
  const flushList = () => {
    if (listBuf.length === 0) return;
    const tag = listOrdered ? "ol" : "ul";
    out.push(`<${tag}>${listBuf.map((l) => `<li>${inline(l)}</li>`).join("")}</${tag}>`);
    listBuf = [];
  };
  const flushPara = () => {
    if (paraBuf.length === 0) return;
    out.push(`<p>${inline(paraBuf.join(" "))}</p>`);
    paraBuf = [];
  };
  const flushQuote = () => {
    if (quoteBuf.length === 0) return;
    out.push(`<blockquote>${inline(quoteBuf.join(" "))}</blockquote>`);
    quoteBuf = [];
  };
  const flushAll = () => {
    flushList();
    flushPara();
    flushQuote();
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (inCode === null) {
        flushAll();
        inCode = "";
      } else {
        out.push(`<pre><code>${escapeHtml(inCode)}</code></pre>`);
        inCode = null;
      }
      continue;
    }
    if (inCode !== null) {
      inCode += line + "\n";
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushAll();
      const header = splitTableRow(line);
      const bodyRows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") {
        bodyRows.push(splitTableRow(lines[j]));
        j++;
      }
      out.push(renderTable(header, bodyRows));
      i = j - 1;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushAll();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      flushList();
      flushPara();
      quoteBuf.push(q[1]);
      continue;
    }
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      flushQuote();
      if (!listOrdered && listBuf.length) flushList();
      listOrdered = false;
      listBuf.push(ul[1]);
      continue;
    }
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      flushQuote();
      if (listOrdered === false && listBuf.length) flushList();
      listOrdered = true;
      listBuf.push(ol[1]);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushAll();
      out.push("<hr />");
      continue;
    }
    if (line.trim() === "") {
      flushAll();
      continue;
    }
    flushList();
    flushQuote();
    paraBuf.push(line);
  }
  flushAll();
  if (inCode !== null) out.push(`<pre><code>${escapeHtml(inCode)}</code></pre>`);
  return out.join("\n");
}
function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(trimmed);
}
function splitTableRow(line) {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}
function renderTable(header, rows) {
  const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`;
  const tbody = rows.length ? `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>` : "";
  return `<table>${thead}${tbody}</table>`;
}
function inline(text) {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}
function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}
async function enterEditMode(ctx, item) {
  const filename = item.dataset.filename ?? "";
  const bodyContent = item.querySelector("[data-body-content]");
  if (!bodyContent) return;
  await expandItem(ctx, item);
  let raw = "";
  try {
    const secretQ = itemIsSecret(item) ? "&secret=1" : "";
    const res = await fetch(`/api/dev/scrapbook-file?site=${encodeURIComponent(ctx.site)}&path=${encodeURIComponent(ctx.slug)}&name=${encodeURIComponent(filename)}${secretQ}`);
    if (!res.ok) throw new Error(await res.text());
    raw = await res.text();
  } catch (e) {
    flashError(ctx, `read failed: ${msg(e)}`);
    return;
  }
  bodyContent.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "scrapbook-editor";
  const ta = document.createElement("textarea");
  ta.value = raw;
  ta.setAttribute("aria-label", `edit ${filename}`);
  const footer = document.createElement("div");
  footer.className = "scrapbook-editor-footer";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "scrapbook-tool";
  cancel.textContent = "cancel";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "scrapbook-tool scrapbook-tool--primary";
  save.textContent = "save \u2192";
  footer.append(cancel, save);
  wrap.append(ta, footer);
  bodyContent.appendChild(wrap);
  ta.focus();
  const restoreRender = async () => {
    bodyContent.dataset.loaded = "false";
    await renderBody(ctx, bodyContent, item.dataset.kind ?? "md", filename);
    bodyContent.dataset.loaded = "true";
  };
  cancel.addEventListener("click", () => {
    void restoreRender();
  });
  const commit = async () => {
    try {
      const res = await fetch("/api/dev/scrapbook/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          site: ctx.site,
          slug: ctx.slug,
          filename,
          body: ta.value,
          secret: itemIsSecret(item)
        })
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
      const { item: updated } = await res.json();
      item.dataset.mtime = updated.mtime;
      item.dataset.size = String(updated.size);
      const mtimeEl = item.querySelector(".scrapbook-mtime");
      if (mtimeEl) {
        mtimeEl.dateTime = updated.mtime;
        mtimeEl.textContent = "just now";
      }
      flashInfo(ctx, `saved ${filename}`);
      await restoreRender();
    } catch (e) {
      flashError(ctx, `save failed: ${msg(e)}`);
    }
  };
  save.addEventListener("click", () => {
    void commit();
  });
  ta.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") {
      ev.preventDefault();
      void commit();
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      void restoreRender();
    }
  });
}
function enterRenameMode(ctx, item) {
  const cell = item.querySelector("[data-filename-cell]");
  const oldName = item.dataset.filename ?? "";
  if (!cell) return;
  cell.textContent = "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "scrapbook-rename-input";
  input.value = oldName;
  input.setAttribute("aria-label", `rename ${oldName}`);
  cell.appendChild(input);
  const dotIdx = oldName.lastIndexOf(".");
  if (dotIdx > 0) {
    input.setSelectionRange(0, dotIdx);
  }
  input.focus();
  const hint = document.createElement("p");
  hint.className = "scrapbook-rename-hint";
  cell.appendChild(hint);
  const restore = () => {
    cell.textContent = oldName;
    item.dataset.filename = oldName;
  };
  const validate = (name) => {
    if (!name) return "required";
    if (!FILENAME_RE.test(name)) return "use [A-Za-z0-9._ -]";
    if (name.startsWith(".")) return "no leading dot";
    return null;
  };
  input.addEventListener("input", () => {
    const err = validate(input.value.trim());
    if (err) {
      input.dataset.invalid = "true";
      hint.textContent = err;
    } else {
      input.removeAttribute("data-invalid");
      hint.textContent = "";
    }
  });
  input.addEventListener("keydown", async (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      restore();
      return;
    }
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const newName = input.value.trim();
    if (newName === oldName) {
      restore();
      return;
    }
    const err = validate(newName);
    if (err) {
      input.dataset.invalid = "true";
      hint.textContent = err;
      return;
    }
    try {
      const res = await fetch("/api/dev/scrapbook/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          site: ctx.site,
          slug: ctx.slug,
          oldName,
          newName,
          secret: itemIsSecret(item)
        })
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "rename failed");
      item.dataset.filename = newName;
      const id = `item-${encodeURIComponent(newName)}`;
      item.id = id;
      cell.textContent = newName;
      const idxLink = ctx.root.querySelector(`[data-index-for="${oldName}"] a`);
      if (idxLink) {
        idxLink.textContent = newName;
        idxLink.setAttribute("href", `#${id}`);
      }
      const idxLi = ctx.root.querySelector(`[data-index-for="${oldName}"]`);
      if (idxLi) idxLi.setAttribute("data-index-for", newName);
      flashInfo(ctx, `renamed to ${newName}`);
    } catch (e) {
      flashError(ctx, `rename failed: ${msg(e)}`);
      restore();
    }
  });
}
function enterDeleteConfirm(ctx, item) {
  if (item.dataset.state === "deleting") return;
  item.dataset.state = "deleting";
  const toolbar = item.querySelector("[data-toolbar]");
  if (!toolbar) return;
  const prevHtml = toolbar.innerHTML;
  toolbar.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "scrapbook-confirm-bar";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "scrapbook-tool";
  cancelBtn.textContent = "cancel";
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "scrapbook-tool scrapbook-tool--delete";
  confirmBtn.textContent = "confirm delete";
  toolbar.append(cancelBtn, confirmBtn);
  item.appendChild(bar);
  const revert = () => {
    bar.remove();
    toolbar.innerHTML = prevHtml;
    item.dataset.state = "closed";
    wireItem(ctx, item);
  };
  const timeout = setTimeout(revert, 4e3);
  cancelBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    clearTimeout(timeout);
    revert();
  });
  confirmBtn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    clearTimeout(timeout);
    try {
      const res = await fetch("/api/dev/scrapbook/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          site: ctx.site,
          slug: ctx.slug,
          filename: item.dataset.filename,
          secret: itemIsSecret(item)
        })
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "delete failed");
      item.style.transition = "opacity 180ms ease-in, transform 180ms ease-in";
      item.style.transform = "translateX(-12px)";
      item.style.opacity = "0";
      setTimeout(() => {
        const filename = item.dataset.filename;
        item.remove();
        if (filename) {
          const idxLi = ctx.root.querySelector(`[data-index-for="${filename}"]`);
          idxLi?.remove();
        }
        flashInfo(ctx, `deleted`);
      }, 200);
    } catch (e) {
      flashError(ctx, `delete failed: ${msg(e)}`);
      revert();
    }
  });
}
function wireComposer(ctx) {
  const form = ctx.root.querySelector("[data-scrapbook-composer]");
  if (!form) return;
  const filenameInput = form.querySelector("[data-composer-filename]");
  const bodyInput = form.querySelector("[data-composer-body]");
  const cancelBtn = form.querySelector('[data-action="composer-cancel"]');
  const saveBtn = form.querySelector('[data-action="composer-save"]');
  if (!filenameInput || !bodyInput || !cancelBtn || !saveBtn) return;
  cancelBtn.addEventListener("click", () => hideComposer(ctx));
  bodyInput.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") {
      ev.preventDefault();
      void submit();
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      hideComposer(ctx);
    }
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit();
  });
  async function submit() {
    let filename = filenameInput.value.trim();
    if (!filename) {
      const now = /* @__PURE__ */ new Date();
      filename = `note-${now.toISOString().slice(0, 10)}.md`;
    }
    if (!filename.endsWith(".md")) filename += ".md";
    if (!FILENAME_RE.test(filename)) {
      flashError(ctx, `invalid filename: ${filename}`);
      return;
    }
    const secret = ctx.root.querySelector("[data-composer-secret]")?.checked === true;
    try {
      const res = await fetch("/api/dev/scrapbook/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          site: ctx.site,
          slug: ctx.slug,
          filename,
          body: bodyInput.value,
          secret
        })
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "create failed");
      flashInfo(ctx, secret ? `created secret/${filename}` : `created ${filename}`);
      hideComposer(ctx);
      window.location.reload();
    } catch (e) {
      flashError(ctx, `create failed: ${msg(e)}`);
    }
  }
}
function showComposer(ctx) {
  const form = ctx.root.querySelector("[data-scrapbook-composer]");
  if (!form) return;
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.querySelector("[data-composer-body]")?.focus();
}
function hideComposer(ctx) {
  const form = ctx.root.querySelector("[data-scrapbook-composer]");
  if (!form) return;
  form.hidden = true;
  form.querySelector("[data-composer-filename]").value = "";
  form.querySelector("[data-composer-body]").value = "";
}
function wireIndexButtons(ctx) {
  ctx.root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn || !ctx.root.contains(btn)) return;
    const action = btn.dataset.action;
    if (action === "new-note") {
      ev.preventDefault();
      showComposer(ctx);
    }
    if (action === "upload") {
      ev.preventDefault();
      ctx.root.querySelector("[data-scrapbook-file-input]")?.click();
    }
  });
}
function wireIndexScrollSync(ctx) {
  const items = ctx.root.querySelectorAll(".scrapbook-item");
  if (items.length === 0) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const filename = entry.target.dataset.filename;
        if (!filename) return;
        ctx.root.querySelectorAll("[data-index-for]").forEach((li) => li.removeAttribute("data-active"));
        const active = ctx.root.querySelector(`[data-index-for="${filename}"]`);
        active?.setAttribute("data-active", "true");
      });
    },
    { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
  );
  items.forEach((item) => observer.observe(item));
}
function wireDropZone(ctx) {
  const zone = ctx.root.querySelector("[data-scrapbook-drop]");
  const input = ctx.root.querySelector("[data-scrapbook-file-input]");
  if (!zone || !input) return;
  zone.addEventListener("click", (ev) => {
    if (ev.target.tagName !== "INPUT") input.click();
  });
  zone.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      input.click();
    }
  });
  zone.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    zone.dataset.hover = "true";
  });
  zone.addEventListener("dragleave", () => {
    zone.removeAttribute("data-hover");
  });
  zone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    zone.removeAttribute("data-hover");
    const files = ev.dataTransfer?.files;
    if (files && files.length > 0) void uploadFile(ctx, files[0]);
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void uploadFile(ctx, file);
    input.value = "";
  });
}
function wireOverlay(ctx) {
  const overlay2 = ctx.root.querySelector("[data-scrapbook-overlay]");
  if (!overlay2) return;
  let depth = 0;
  document.body.addEventListener("dragenter", (ev) => {
    if (!ev.dataTransfer?.types.includes("Files")) return;
    depth++;
    overlay2.dataset.active = "true";
  });
  document.body.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay2.removeAttribute("data-active");
  });
  document.body.addEventListener("drop", (ev) => {
    depth = 0;
    overlay2.removeAttribute("data-active");
    if (!ev.dataTransfer?.files || ev.dataTransfer.files.length === 0) return;
    if (!ev.target.closest("[data-scrapbook-drop]")) {
      ev.preventDefault();
      void uploadFile(ctx, ev.dataTransfer.files[0]);
    }
  });
}
async function uploadFile(ctx, file) {
  try {
    const secret = ctx.root.querySelector("[data-upload-secret]")?.checked === true;
    const fd = new FormData();
    fd.append("site", ctx.site);
    fd.append("slug", ctx.slug);
    fd.append("file", file);
    if (secret) fd.append("secret", "true");
    const res = await fetch("/api/dev/scrapbook/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json()).error ?? "upload failed");
    flashInfo(ctx, secret ? `uploaded to secret: ${file.name}` : `uploaded ${file.name}`);
    window.location.reload();
  } catch (e) {
    flashError(ctx, `upload failed: ${msg(e)}`);
  }
}
function flashInfo(ctx, text) {
  flash(ctx, text, "info");
}
function flashError(ctx, text) {
  flash(ctx, text, "error");
}
function flash(ctx, text, kind) {
  if (!ctx.statusEl) return;
  ctx.statusEl.textContent = text;
  ctx.statusEl.dataset.kind = kind;
  ctx.statusEl.hidden = false;
  window.setTimeout(() => {
    if (ctx.statusEl) ctx.statusEl.hidden = true;
  }, 3200);
}
function msg(e) {
  return e instanceof Error ? e.message : String(e);
}
export {
  initScrapbook
};
//# sourceMappingURL=scrapbook-client.js.map
