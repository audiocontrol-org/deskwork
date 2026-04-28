/**
 * Client-side behavior for the /dev/editorial-studio route.
 *
 * Loaded via a non-inline <script> tag in the Astro page. Each row and
 * action button carries its own `data-site` attribute, so the studio
 * can act on workflows from any site without a page-wide site marker.
 *
 * Responsibilities:
 *  - Toast for transient messages
 *  - Copy-to-clipboard buttons for Claude Code commands
 *  - Scaffold-draft button → POST /api/dev/editorial-calendar/draft (site from button)
 *  - Mark-published button → POST /api/dev/editorial-calendar/publish (site from button)
 *  - Text search + stage/site-chip filtering
 *  - Keyboard shortcuts (1-5 jump to stage columns)
 *  - Idle-polling via full-page reload
 */

function siteFromButton(btn: HTMLButtonElement): string {
  const site = btn.dataset.site;
  if (!site) {
    throw new Error(
      `editorial-studio: button is missing data-site (slug=${btn.dataset.slug ?? '?'}). Every row action must carry its site explicitly.`,
    );
  }
  return site;
}

function showToast(msg: string, isError = false): void {
  const toastEl = document.querySelector<HTMLElement>('[data-toast]');
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', isError);
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 4000);
}

/**
 * Copy text across both secure and insecure contexts. The async
 * Clipboard API (navigator.clipboard.writeText) is gated on a
 * secure context — HTTPS or localhost. Dev access from another
 * machine on the LAN (http://orion-m4:4321/, etc.) isn't secure
 * in the browser's eyes, so the API throws. Fall back to the
 * legacy execCommand('copy') path on a hidden textarea, which
 * works in plain HTTP.
 */
async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  // Keep it off-screen but still focusable; some browsers skip
  // copy if the element isn't in the layout tree.
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '-1000px';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
  }
  if (!ok) throw new Error('execCommand copy returned false');
}

function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.er-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy ?? '';
      if (!text) return;
      try {
        await copyTextToClipboard(text);
        const original = btn.textContent;
        btn.classList.add('copied');
        btn.textContent = 'copied ✓';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = original;
        }, 1500);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        showToast(`Clipboard unavailable (${message}) — copy manually: ${text}`, true);
      }
    });
  });
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: payload };
}

function bodyError(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const value = Reflect.get(body, 'error');
    if (typeof value === 'string') return value;
  }
  return fallback;
}

function initScaffoldButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-action="scaffold-draft"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.slug;
      if (!slug) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'scaffolding…';
      try {
        const result = await postJson('/api/dev/editorial-calendar/draft', {
          site: siteFromButton(btn),
          slug,
        });
        if (!result.ok) {
          showToast(bodyError(result.body, `Scaffold failed: ${result.status}`), true);
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        const relativePath =
          typeof result.body === 'object' && result.body !== null
            ? Reflect.get(result.body, 'relativePath')
            : undefined;
        showToast(
          typeof relativePath === 'string'
            ? `Scaffolded ${relativePath}`
            : `Scaffolded ${slug}`,
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

function initPublishButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-action="mark-published"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.slug;
      if (!slug) return;
      if (!confirm(`Publish ${slug}? This sets datePublished to today.`)) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'publishing…';
      try {
        const result = await postJson('/api/dev/editorial-calendar/publish', {
          site: siteFromButton(btn),
          slug,
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

/**
 * Enqueue a longform review workflow for a Drafting-stage entry
 * whose body is written but has no active workflow. Calls the
 * existing /api/dev/editorial-review/start-longform endpoint
 * (idempotent — returns the in-flight workflow if one already
 * matches). On success, navigates to the review surface for the
 * workflow so the operator lands on the margin-note UI.
 */
function initEnqueueReviewButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-action="enqueue-review"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.slug;
      if (!slug) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'enqueuing…';
      try {
        const result = await postJson('/api/dev/editorial-review/start-longform', {
          site: siteFromButton(btn),
          slug,
        });
        if (!result.ok) {
          showToast(bodyError(result.body, `Enqueue failed: ${result.status}`), true);
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        // Navigate straight to the review surface — that's the whole
        // point of the button. The start-longform handler is
        // idempotent, so the review page will show whichever workflow
        // is active (freshly-created or pre-existing).
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

function initFilter(): void {
  const searchInput = document.querySelector<HTMLInputElement>('[data-filter-input]');
  const stageChips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-stage-chip]'));
  const siteChips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-site-chip]'));
  const allCalRows = Array.from(document.querySelectorAll<HTMLElement>('.er-calendar-row'));
  const stageSections = Array.from(document.querySelectorAll<HTMLElement>('[data-stage-section]'));
  // Shortform coverage rows carry their own `data-site` and deserve the
  // same site filter. They're not inside a stage section so they stay
  // visible regardless of the stage chip.
  const sfRows = Array.from(document.querySelectorAll<HTMLElement>('.er-sf-matrix tbody tr[data-site]'));
  let activeStage = 'all';
  let activeSite = 'all';
  let searchQuery = '';

  function matchesRow(row: HTMLElement): boolean {
    const searchBlob = row.dataset.search ?? '';
    const matchSearch = !searchQuery || searchBlob.includes(searchQuery);
    const matchSite = activeSite === 'all' || row.dataset.site === activeSite;
    return matchSearch && matchSite;
  }

  function applyFilter(): void {
    const stageCounts = new Map<string, number>();
    for (const row of allCalRows) {
      const stage = row.dataset.stage ?? '';
      const matchStage = activeStage === 'all' || stage === activeStage;
      const visible = matchesRow(row) && matchStage;
      row.hidden = !visible;
      if (visible) stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    }
    // Hide entire stage sections when they have no visible rows under a filter,
    // but keep originally-empty sections visible (they show their empty state).
    for (const sec of stageSections) {
      const stage = sec.dataset.stageSection ?? '';
      const sectionVisible = (stageCounts.get(stage) ?? 0) > 0;
      const originallyEmpty = !allCalRows.some(r => r.dataset.stage === stage);
      sec.hidden = !sectionVisible && !originallyEmpty;
    }
    for (const row of sfRows) {
      row.hidden = activeSite !== 'all' && row.dataset.site !== activeSite;
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.toLowerCase().trim();
      applyFilter();
    });
  }
  for (const chip of stageChips) {
    chip.addEventListener('click', () => {
      stageChips.forEach(c => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      activeStage = chip.dataset.stageChip ?? 'all';
      applyFilter();
    });
  }
  for (const chip of siteChips) {
    chip.addEventListener('click', () => {
      siteChips.forEach(c => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      activeSite = chip.dataset.siteChip ?? 'all';
      applyFilter();
    });
  }
}

function initKeyboardShortcuts(): void {
  const stageSections = Array.from(document.querySelectorAll<HTMLElement>('[data-stage-section]'));
  document.addEventListener('keydown', (ev) => {
    const target = ev.target;
    if (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const stageIndex = ['1', '2', '3', '4', '5'].indexOf(ev.key);
    if (stageIndex >= 0 && stageSections[stageIndex]) {
      ev.preventDefault();
      stageSections[stageIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

/**
 * Poll the state-signature endpoint and reload only when the
 * signature changes. Replaces the old blunt 10-second reload that
 * caused a visible flicker even when nothing had moved on the
 * backend. The server endpoint compounds mtimes of calendar files,
 * workflow pipeline/history directories, and per-site content
 * directories into a short hash — any real change advances it;
 * idle time doesn't.
 *
 * Guards preserved from the prior polling:
 *   - search query active → skip (don't blow away the operator's
 *     filter)
 *   - intake form open → skip (don't nuke in-progress input)
 *   - a text field has focus → skip (same reason)
 *
 * If the endpoint is unreachable (dev server restart, network
 * glitch), we silently retry on the next tick rather than falling
 * back to a blind reload.
 */
function initPolling(): void {
  const searchInput = document.querySelector<HTMLInputElement>('[data-filter-input]');
  let baseline: string | null = null;

  async function fetchSignature(): Promise<string | null> {
    try {
      const res = await fetch('/api/dev/editorial-studio/state-signature', { cache: 'no-store' });
      if (!res.ok) return null;
      const body = (await res.json()) as { signature?: string };
      return typeof body.signature === 'string' ? body.signature : null;
    } catch {
      return null;
    }
  }

  // Establish the baseline on page load so the first real change
  // triggers the reload (not whatever state happened to be on disk
  // at render time).
  void fetchSignature().then((sig) => { baseline = sig; });

  setInterval(async () => {
    if (searchInput && searchInput.value.trim().length > 0) return;
    const intakeForm = document.querySelector<HTMLElement>('[data-intake-form]');
    if (intakeForm && !intakeForm.hidden) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;

    const current = await fetchSignature();
    if (!current) return; // transient failure — try again next tick
    if (baseline === null) { baseline = current; return; }
    if (current === baseline) return; // nothing moved

    const pollIndicator = document.querySelector<HTMLElement>('[data-poll]');
    if (pollIndicator) pollIndicator.classList.add('polling');
    window.location.reload();
  }, 10000);
}

/**
 * Intake sheet — click the "intake new idea" button in the Ideas
 * section header, fill in the form, and the copy button produces a
 * self-contained prompt the agent can run without a second pass of
 * interactive prompts. The prompt reads like natural English so it
 * survives being pasted verbatim into Claude Code.
 */
function initIntakeForm(): void {
  const toggleBtn = document.querySelector<HTMLButtonElement>('[data-action="intake-toggle"]');
  const form = document.querySelector<HTMLElement>('[data-intake-form]');
  if (!toggleBtn || !form) return;

  const field = <T extends HTMLElement = HTMLInputElement>(name: string): T | null =>
    form.querySelector<T>(`[data-intake-field="${name}"]`);
  const contentTypeSel = field<HTMLSelectElement>('contentType');
  const contentUrlRow = form.querySelector<HTMLElement>('[data-intake-content-url]');

  function syncContentUrlVisibility(): void {
    if (!contentTypeSel || !contentUrlRow) return;
    const kind = contentTypeSel.value;
    contentUrlRow.hidden = kind === 'blog';
  }
  contentTypeSel?.addEventListener('change', syncContentUrlVisibility);
  syncContentUrlVisibility();

  function open(): void {
    form.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
    const title = field<HTMLInputElement>('title');
    title?.focus();
  }
  function close(): void {
    form.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  }
  toggleBtn.addEventListener('click', () => {
    if (form.hidden) open(); else close();
  });

  form.querySelector('[data-action="intake-cancel"]')?.addEventListener('click', () => close());

  form.querySelector('[data-action="intake-copy"]')?.addEventListener('click', async () => {
    const site = field<HTMLSelectElement>('site')?.value.trim() || '';
    const title = field<HTMLInputElement>('title')?.value.trim() || '';
    const description = field<HTMLTextAreaElement>('description')?.value.trim() || '';
    const contentType = field<HTMLSelectElement>('contentType')?.value.trim() || 'blog';
    const contentUrl = field<HTMLInputElement>('contentUrl')?.value.trim() || '';
    if (!site || !title) {
      showToast('Site and title are required', true);
      return;
    }
    const lines = [
      `Run /editorial-add --site ${site} to intake a new idea using these pre-filled values. Do NOT interactively re-prompt for any field below — use them verbatim.`,
      '',
      `- Site: ${site}`,
      `- Title: ${title}`,
      ...(description ? [`- Description: ${description}`] : [`- Description: (none — leave empty)`]),
      `- Content type: ${contentType}`,
      ...(contentType !== 'blog' && contentUrl ? [`- Content URL: ${contentUrl}`] : []),
      ...(contentType !== 'blog' && !contentUrl ? [`- Content URL: (not yet published — skip; /editorial-publish will refuse until it's set)`] : []),
    ];
    const payload = lines.join('\n');
    try {
      await copyTextToClipboard(payload);
      const btn = form.querySelector<HTMLButtonElement>('[data-action="intake-copy"]');
      if (btn) {
        const original = btn.textContent;
        btn.classList.add('copied');
        btn.textContent = 'copied ✓';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = original;
          close();
        }, 900);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showToast(`Clipboard unavailable (${message}) — copy manually: ${payload}`, true);
    }
  });

  // Cmd/Ctrl-Enter from anywhere in the form triggers copy.
  form.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      form.querySelector<HTMLButtonElement>('[data-action="intake-copy"]')?.click();
    }
  });
}

/**
 * Inline rename-slug form — one per blog row, rendered hidden under
 * the row. Clicking the row's "rename →" button expands the form in
 * place; the operator's eye stays on the row they're acting on (no
 * modal). Submit copies the `/editorial-rename-slug` command to the
 * clipboard and collapses. Validation mirrors the server-side rules
 * in scripts/lib/editorial/rename-slug.ts.
 */
function initRenameForms(): void {
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

  // Read the shared site → slugs list once. Fallback to empty if
  // missing (the collision check will be bypassed server-side anyway
  // by rename-slug.ts).
  let slugsBySite: Record<string, string[]> = {};
  const slugsScript = document.querySelector<HTMLScriptElement>('script[data-rename-slugs]');
  if (slugsScript?.textContent) {
    try {
      slugsBySite = JSON.parse(slugsScript.textContent);
    } catch {
      slugsBySite = {};
    }
  }

  type FormContext = {
    form: HTMLFormElement;
    input: HTMLInputElement;
    hint: HTMLElement;
    copyBtn: HTMLButtonElement;
    site: string;
    oldSlug: string;
  };

  function contextFor(form: HTMLFormElement): FormContext | null {
    const input = form.querySelector<HTMLInputElement>('[data-rename-input]');
    const hint = form.querySelector<HTMLElement>('[data-rename-hint]');
    const copyBtn = form.querySelector<HTMLButtonElement>('[data-action="rename-copy"]');
    const site = form.dataset.site ?? '';
    const oldSlug = form.dataset.slug ?? '';
    if (!input || !hint || !copyBtn || !site || !oldSlug) return null;
    return { form, input, hint, copyBtn, site, oldSlug };
  }

  function validate(ctx: FormContext, next: string): string | null {
    if (!next) return 'required';
    if (!SLUG_RE.test(next)) return 'kebab-case only (a-z, 0-9, -)';
    if (next === ctx.oldSlug) return 'same as current slug';
    const taken = (slugsBySite[ctx.site] ?? []).some(
      (s) => s === next && s !== ctx.oldSlug,
    );
    if (taken) return `already used on ${ctx.site}.org`;
    return null;
  }

  function close(form: HTMLFormElement): void {
    form.hidden = true;
    const input = form.querySelector<HTMLInputElement>('[data-rename-input]');
    if (input) input.value = '';
    const hint = form.querySelector<HTMLElement>('[data-rename-hint]');
    if (hint) {
      hint.textContent = 'lowercase, digits, hyphens';
      hint.removeAttribute('data-error');
    }
    const copyBtn = form.querySelector<HTMLButtonElement>('[data-action="rename-copy"]');
    if (copyBtn) copyBtn.disabled = false;
  }

  function closeAllForms(except?: HTMLFormElement): void {
    document
      .querySelectorAll<HTMLFormElement>('form[data-rename-form]')
      .forEach((f) => {
        if (f !== except && !f.hidden) close(f);
      });
  }

  function open(form: HTMLFormElement): void {
    closeAllForms(form);
    form.hidden = false;
    const input = form.querySelector<HTMLInputElement>('[data-rename-input]');
    // Next frame: focus after the form is visible.
    setTimeout(() => input?.focus(), 0);
  }

  // Click delegation: "rename →" opens the form inside its row's wrap;
  // "cancel" closes the form that contains the cancel button.
  document.addEventListener('click', (ev) => {
    const openBtn = (ev.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action="rename-open"]',
    );
    if (openBtn) {
      const wrap = openBtn.closest<HTMLElement>('[data-row-wrap]');
      const form = wrap?.querySelector<HTMLFormElement>('form[data-rename-form]') ?? null;
      if (form) {
        if (form.hidden) open(form); else close(form);
      }
      return;
    }
    const cancelBtn = (ev.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action="rename-cancel"]',
    );
    if (cancelBtn) {
      ev.preventDefault();
      const form = cancelBtn.closest<HTMLFormElement>('form[data-rename-form]');
      if (form) close(form);
    }
  });

  // Input validation on every keystroke inside any rename form.
  document.addEventListener('input', (ev) => {
    const input = (ev.target as Element | null)?.closest<HTMLInputElement>(
      'input[data-rename-input]',
    );
    if (!input) return;
    const form = input.closest<HTMLFormElement>('form[data-rename-form]');
    if (!form) return;
    const ctx = contextFor(form);
    if (!ctx) return;
    const err = validate(ctx, ctx.input.value.trim());
    if (err) {
      ctx.hint.textContent = err;
      ctx.hint.setAttribute('data-error', 'true');
      ctx.copyBtn.disabled = true;
    } else {
      ctx.hint.textContent = 'looks good — submit to copy';
      ctx.hint.removeAttribute('data-error');
      ctx.copyBtn.disabled = false;
    }
  });

  // Esc key closes the currently-open form (if any). Keeps focus on
  // the row so the next action is in-context.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const active = document.activeElement;
    const form = active?.closest<HTMLFormElement>('form[data-rename-form]');
    if (form && !form.hidden) {
      ev.preventDefault();
      close(form);
    }
  });

  // Submit handler on every rename form.
  document.addEventListener('submit', async (ev) => {
    const form = (ev.target as Element | null)?.closest<HTMLFormElement>(
      'form[data-rename-form]',
    );
    if (!form) return;
    ev.preventDefault();
    const ctx = contextFor(form);
    if (!ctx) return;
    const next = ctx.input.value.trim();
    const err = validate(ctx, next);
    if (err) {
      ctx.hint.textContent = err;
      ctx.hint.setAttribute('data-error', 'true');
      ctx.copyBtn.disabled = true;
      return;
    }
    const command = `/editorial-rename-slug --site ${ctx.site} ${ctx.oldSlug} ${next}`;
    try {
      await copyTextToClipboard(command);
      const original = ctx.copyBtn.textContent;
      ctx.copyBtn.classList.add('copied');
      ctx.copyBtn.textContent = 'copied ✓';
      setTimeout(() => {
        ctx.copyBtn.classList.remove('copied');
        if (original !== null) ctx.copyBtn.textContent = original;
        close(form);
      }, 900);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showToast(`Clipboard unavailable (${message}) — copy manually: ${command}`, true);
    }
  });
}

/**
 * Start a shortform draft for the (site, slug, platform) cell the
 * operator clicked in the coverage matrix. POSTs to
 * /api/dev/editorial-review/start-shortform — the handler scaffolds
 * the on-disk file and creates the workflow (idempotent on the
 * tuple). On success we navigate to the workflow's review URL so the
 * operator lands directly on the unified review surface.
 *
 * Phase 21c: replaces the prior copy-CLI-command flow that required
 * the operator to paste `/editorial-shortform-draft …` into Claude
 * Code. The new flow is point-and-click — no terminal round trip.
 */
function initStartShortformButtons(): void {
  document
    .querySelectorAll<HTMLButtonElement>('[data-action="start-shortform"]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const site = btn.dataset.site;
        const slug = btn.dataset.slug;
        const platform = btn.dataset.platform;
        if (!site || !slug || !platform) {
          showToast('Start button missing site/slug/platform', true);
          return;
        }
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'starting…';
        try {
          const result = await postJson(
            '/api/dev/editorial-review/start-shortform',
            { site, slug, platform },
          );
          if (!result.ok) {
            showToast(
              bodyError(result.body, `Start failed: ${result.status}`),
              true,
            );
            btn.disabled = false;
            btn.textContent = originalText;
            return;
          }
          const reviewUrl =
            typeof result.body === 'object' && result.body !== null
              ? Reflect.get(result.body, 'reviewUrl')
              : undefined;
          if (typeof reviewUrl !== 'string' || reviewUrl.length === 0) {
            showToast('Start succeeded but no reviewUrl returned', true);
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

function init(): void {
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
