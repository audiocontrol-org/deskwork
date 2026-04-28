// ../../plugins/deskwork-studio/public/src/editorial-studio-client.ts
function siteFromButton(btn) {
  const site = btn.dataset.site;
  if (!site) {
    throw new Error(
      `editorial-studio: button is missing data-site (slug=${btn.dataset.slug ?? "?"}). Every row action must carry its site explicitly.`
    );
  }
  return site;
}
function showToast(msg, isError = false) {
  const toastEl = document.querySelector("[data-toast]");
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", isError);
  toastEl.hidden = false;
  setTimeout(() => {
    toastEl.hidden = true;
  }, 4e3);
}
async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.left = "-1000px";
  ta.setAttribute("readonly", "");
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
  if (!ok) throw new Error("execCommand copy returned false");
}
function initCopyButtons() {
  document.querySelectorAll(".er-copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy ?? "";
      if (!text) return;
      try {
        await copyTextToClipboard(text);
        const original = btn.textContent;
        btn.classList.add("copied");
        btn.textContent = "copied \u2713";
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = original;
        }, 1500);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        showToast(`Clipboard unavailable (${message}) \u2014 copy manually: ${text}`, true);
      }
    });
  });
}
async function postJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: payload };
}
function bodyError(body, fallback) {
  if (typeof body === "object" && body !== null) {
    const value = Reflect.get(body, "error");
    if (typeof value === "string") return value;
  }
  return fallback;
}
function initScaffoldButtons() {
  document.querySelectorAll('[data-action="scaffold-draft"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.slug;
      if (!slug) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "scaffolding\u2026";
      try {
        const result = await postJson("/api/dev/editorial-calendar/draft", {
          site: siteFromButton(btn),
          slug
        });
        if (!result.ok) {
          showToast(bodyError(result.body, `Scaffold failed: ${result.status}`), true);
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        const relativePath = typeof result.body === "object" && result.body !== null ? Reflect.get(result.body, "relativePath") : void 0;
        showToast(
          typeof relativePath === "string" ? `Scaffolded ${relativePath}` : `Scaffolded ${slug}`
        );
        setTimeout(() => window.location.reload(), 900);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        showToast(`Network error: ${message}`, true);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}
function initPublishButtons() {
  document.querySelectorAll('[data-action="mark-published"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.slug;
      if (!slug) return;
      if (!confirm(`Publish ${slug}? This sets datePublished to today.`)) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "publishing\u2026";
      try {
        const result = await postJson("/api/dev/editorial-calendar/publish", {
          site: siteFromButton(btn),
          slug
        });
        if (!result.ok) {
          showToast(bodyError(result.body, `Publish failed: ${result.status}`), true);
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        showToast(`Published ${slug}`);
        setTimeout(() => window.location.reload(), 900);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        showToast(`Network error: ${message}`, true);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}
function initEnqueueReviewButtons() {
  document.querySelectorAll('[data-action="enqueue-review"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.slug;
      if (!slug) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "enqueuing\u2026";
      try {
        const result = await postJson("/api/dev/editorial-review/start-longform", {
          site: siteFromButton(btn),
          slug
        });
        if (!result.ok) {
          showToast(bodyError(result.body, `Enqueue failed: ${result.status}`), true);
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        const site = siteFromButton(btn);
        window.location.href = `/dev/editorial-review/${slug}?site=${site}`;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        showToast(`Network error: ${message}`, true);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}
function initFilter() {
  const searchInput = document.querySelector("[data-filter-input]");
  const stageChips = Array.from(document.querySelectorAll("[data-stage-chip]"));
  const siteChips = Array.from(document.querySelectorAll("[data-site-chip]"));
  const allCalRows = Array.from(document.querySelectorAll(".er-calendar-row"));
  const stageSections = Array.from(document.querySelectorAll("[data-stage-section]"));
  const sfRows = Array.from(document.querySelectorAll(".er-sf-matrix tbody tr[data-site]"));
  let activeStage = "all";
  let activeSite = "all";
  let searchQuery = "";
  function matchesRow(row) {
    const searchBlob = row.dataset.search ?? "";
    const matchSearch = !searchQuery || searchBlob.includes(searchQuery);
    const matchSite = activeSite === "all" || row.dataset.site === activeSite;
    return matchSearch && matchSite;
  }
  function applyFilter() {
    const stageCounts = /* @__PURE__ */ new Map();
    for (const row of allCalRows) {
      const stage = row.dataset.stage ?? "";
      const matchStage = activeStage === "all" || stage === activeStage;
      const visible = matchesRow(row) && matchStage;
      row.hidden = !visible;
      if (visible) stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    }
    for (const sec of stageSections) {
      const stage = sec.dataset.stageSection ?? "";
      const sectionVisible = (stageCounts.get(stage) ?? 0) > 0;
      const originallyEmpty = !allCalRows.some((r) => r.dataset.stage === stage);
      sec.hidden = !sectionVisible && !originallyEmpty;
    }
    for (const row of sfRows) {
      row.hidden = activeSite !== "all" && row.dataset.site !== activeSite;
    }
  }
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.toLowerCase().trim();
      applyFilter();
    });
  }
  for (const chip of stageChips) {
    chip.addEventListener("click", () => {
      stageChips.forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      activeStage = chip.dataset.stageChip ?? "all";
      applyFilter();
    });
  }
  for (const chip of siteChips) {
    chip.addEventListener("click", () => {
      siteChips.forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      activeSite = chip.dataset.siteChip ?? "all";
      applyFilter();
    });
  }
}
function initKeyboardShortcuts() {
  const stageSections = Array.from(document.querySelectorAll("[data-stage-section]"));
  document.addEventListener("keydown", (ev) => {
    const target = ev.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const stageIndex = ["1", "2", "3", "4", "5"].indexOf(ev.key);
    if (stageIndex >= 0 && stageSections[stageIndex]) {
      ev.preventDefault();
      stageSections[stageIndex].scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}
function initPolling() {
  const searchInput = document.querySelector("[data-filter-input]");
  let baseline = null;
  async function fetchSignature() {
    try {
      const res = await fetch("/api/dev/editorial-studio/state-signature", { cache: "no-store" });
      if (!res.ok) return null;
      const body = await res.json();
      return typeof body.signature === "string" ? body.signature : null;
    } catch {
      return null;
    }
  }
  void fetchSignature().then((sig) => {
    baseline = sig;
  });
  setInterval(async () => {
    if (searchInput && searchInput.value.trim().length > 0) return;
    const intakeForm = document.querySelector("[data-intake-form]");
    if (intakeForm && !intakeForm.hidden) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
    const current = await fetchSignature();
    if (!current) return;
    if (baseline === null) {
      baseline = current;
      return;
    }
    if (current === baseline) return;
    const pollIndicator = document.querySelector("[data-poll]");
    if (pollIndicator) pollIndicator.classList.add("polling");
    window.location.reload();
  }, 1e4);
}
function initIntakeForm() {
  const toggleBtn = document.querySelector('[data-action="intake-toggle"]');
  const form = document.querySelector("[data-intake-form]");
  if (!toggleBtn || !form) return;
  const field = (name) => form.querySelector(`[data-intake-field="${name}"]`);
  const contentTypeSel = field("contentType");
  const contentUrlRow = form.querySelector("[data-intake-content-url]");
  function syncContentUrlVisibility() {
    if (!contentTypeSel || !contentUrlRow) return;
    const kind = contentTypeSel.value;
    contentUrlRow.hidden = kind === "blog";
  }
  contentTypeSel?.addEventListener("change", syncContentUrlVisibility);
  syncContentUrlVisibility();
  function open() {
    form.hidden = false;
    toggleBtn.setAttribute("aria-expanded", "true");
    const title = field("title");
    title?.focus();
  }
  function close() {
    form.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  toggleBtn.addEventListener("click", () => {
    if (form.hidden) open();
    else close();
  });
  form.querySelector('[data-action="intake-cancel"]')?.addEventListener("click", () => close());
  form.querySelector('[data-action="intake-copy"]')?.addEventListener("click", async () => {
    const site = field("site")?.value.trim() || "";
    const title = field("title")?.value.trim() || "";
    const description = field("description")?.value.trim() || "";
    const contentType = field("contentType")?.value.trim() || "blog";
    const contentUrl = field("contentUrl")?.value.trim() || "";
    if (!site || !title) {
      showToast("Site and title are required", true);
      return;
    }
    const lines = [
      `Run /editorial-add --site ${site} to intake a new idea using these pre-filled values. Do NOT interactively re-prompt for any field below \u2014 use them verbatim.`,
      "",
      `- Site: ${site}`,
      `- Title: ${title}`,
      ...description ? [`- Description: ${description}`] : [`- Description: (none \u2014 leave empty)`],
      `- Content type: ${contentType}`,
      ...contentType !== "blog" && contentUrl ? [`- Content URL: ${contentUrl}`] : [],
      ...contentType !== "blog" && !contentUrl ? [`- Content URL: (not yet published \u2014 skip; /editorial-publish will refuse until it's set)`] : []
    ];
    const payload = lines.join("\n");
    try {
      await copyTextToClipboard(payload);
      const btn = form.querySelector('[data-action="intake-copy"]');
      if (btn) {
        const original = btn.textContent;
        btn.classList.add("copied");
        btn.textContent = "copied \u2713";
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = original;
          close();
        }, 900);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showToast(`Clipboard unavailable (${message}) \u2014 copy manually: ${payload}`, true);
    }
  });
  form.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      form.querySelector('[data-action="intake-copy"]')?.click();
    }
  });
}
function initRenameForms() {
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
  let slugsBySite = {};
  const slugsScript = document.querySelector("script[data-rename-slugs]");
  if (slugsScript?.textContent) {
    try {
      slugsBySite = JSON.parse(slugsScript.textContent);
    } catch {
      slugsBySite = {};
    }
  }
  function contextFor(form) {
    const input = form.querySelector("[data-rename-input]");
    const hint = form.querySelector("[data-rename-hint]");
    const copyBtn = form.querySelector('[data-action="rename-copy"]');
    const site = form.dataset.site ?? "";
    const oldSlug = form.dataset.slug ?? "";
    if (!input || !hint || !copyBtn || !site || !oldSlug) return null;
    return { form, input, hint, copyBtn, site, oldSlug };
  }
  function validate(ctx, next) {
    if (!next) return "required";
    if (!SLUG_RE.test(next)) return "kebab-case only (a-z, 0-9, -)";
    if (next === ctx.oldSlug) return "same as current slug";
    const taken = (slugsBySite[ctx.site] ?? []).some(
      (s) => s === next && s !== ctx.oldSlug
    );
    if (taken) return `already used on ${ctx.site}.org`;
    return null;
  }
  function close(form) {
    form.hidden = true;
    const input = form.querySelector("[data-rename-input]");
    if (input) input.value = "";
    const hint = form.querySelector("[data-rename-hint]");
    if (hint) {
      hint.textContent = "lowercase, digits, hyphens";
      hint.removeAttribute("data-error");
    }
    const copyBtn = form.querySelector('[data-action="rename-copy"]');
    if (copyBtn) copyBtn.disabled = false;
  }
  function closeAllForms(except) {
    document.querySelectorAll("form[data-rename-form]").forEach((f) => {
      if (f !== except && !f.hidden) close(f);
    });
  }
  function open(form) {
    closeAllForms(form);
    form.hidden = false;
    const input = form.querySelector("[data-rename-input]");
    setTimeout(() => input?.focus(), 0);
  }
  document.addEventListener("click", (ev) => {
    const openBtn = ev.target?.closest(
      'button[data-action="rename-open"]'
    );
    if (openBtn) {
      const wrap = openBtn.closest("[data-row-wrap]");
      const form = wrap?.querySelector("form[data-rename-form]") ?? null;
      if (form) {
        if (form.hidden) open(form);
        else close(form);
      }
      return;
    }
    const cancelBtn = ev.target?.closest(
      'button[data-action="rename-cancel"]'
    );
    if (cancelBtn) {
      ev.preventDefault();
      const form = cancelBtn.closest("form[data-rename-form]");
      if (form) close(form);
    }
  });
  document.addEventListener("input", (ev) => {
    const input = ev.target?.closest(
      "input[data-rename-input]"
    );
    if (!input) return;
    const form = input.closest("form[data-rename-form]");
    if (!form) return;
    const ctx = contextFor(form);
    if (!ctx) return;
    const err = validate(ctx, ctx.input.value.trim());
    if (err) {
      ctx.hint.textContent = err;
      ctx.hint.setAttribute("data-error", "true");
      ctx.copyBtn.disabled = true;
    } else {
      ctx.hint.textContent = "looks good \u2014 submit to copy";
      ctx.hint.removeAttribute("data-error");
      ctx.copyBtn.disabled = false;
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const active = document.activeElement;
    const form = active?.closest("form[data-rename-form]");
    if (form && !form.hidden) {
      ev.preventDefault();
      close(form);
    }
  });
  document.addEventListener("submit", async (ev) => {
    const form = ev.target?.closest(
      "form[data-rename-form]"
    );
    if (!form) return;
    ev.preventDefault();
    const ctx = contextFor(form);
    if (!ctx) return;
    const next = ctx.input.value.trim();
    const err = validate(ctx, next);
    if (err) {
      ctx.hint.textContent = err;
      ctx.hint.setAttribute("data-error", "true");
      ctx.copyBtn.disabled = true;
      return;
    }
    const command = `/editorial-rename-slug --site ${ctx.site} ${ctx.oldSlug} ${next}`;
    try {
      await copyTextToClipboard(command);
      const original = ctx.copyBtn.textContent;
      ctx.copyBtn.classList.add("copied");
      ctx.copyBtn.textContent = "copied \u2713";
      setTimeout(() => {
        ctx.copyBtn.classList.remove("copied");
        if (original !== null) ctx.copyBtn.textContent = original;
        close(form);
      }, 900);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showToast(`Clipboard unavailable (${message}) \u2014 copy manually: ${command}`, true);
    }
  });
}
function initStartShortformButtons() {
  document.querySelectorAll('[data-action="start-shortform"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const site = btn.dataset.site;
      const slug = btn.dataset.slug;
      const platform = btn.dataset.platform;
      if (!site || !slug || !platform) {
        showToast("Start button missing site/slug/platform", true);
        return;
      }
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "starting\u2026";
      try {
        const result = await postJson(
          "/api/dev/editorial-review/start-shortform",
          { site, slug, platform }
        );
        if (!result.ok) {
          showToast(
            bodyError(result.body, `Start failed: ${result.status}`),
            true
          );
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        const reviewUrl = typeof result.body === "object" && result.body !== null ? Reflect.get(result.body, "reviewUrl") : void 0;
        if (typeof reviewUrl !== "string" || reviewUrl.length === 0) {
          showToast("Start succeeded but no reviewUrl returned", true);
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        window.location.href = reviewUrl;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        showToast(`Network error: ${message}`, true);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}
function init() {
  initCopyButtons();
  initScaffoldButtons();
  initPublishButtons();
  initEnqueueReviewButtons();
  initStartShortformButtons();
  initFilter();
  initKeyboardShortcuts();
  initPolling();
  initIntakeForm();
  initRenameForms();
}
init();
//# sourceMappingURL=editorial-studio-client.js.map
