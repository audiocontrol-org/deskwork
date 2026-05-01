/**
 * Client-side behavior for the /dev/editorial-studio route. Each row
 * and action button carries its own `data-site` attribute, so the
 * studio can act on workflows from any site without a page-wide site
 * marker. Inline rename-slug form behavior lives in `./rename-form.ts`
 * and clipboard helpers live in `./clipboard.ts`.
 */

import { copyOrShowFallback } from './clipboard.ts';
import { initRenameForms } from './rename-form.ts';

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

function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.er-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy ?? '';
      if (!text) {
        // The button shouldn't have been rendered without a payload —
        // surface this loudly instead of silently no-op'ing.
        // eslint-disable-next-line no-console
        console.warn('er-copy-btn: missing data-copy attribute', btn);
        return;
      }
      const original = btn.textContent;
      const ok = await copyOrShowFallback(text, {
        successMessage: 'Copied to clipboard',
        fallbackMessage: 'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:',
      });
      if (ok) {
        btn.classList.add('copied');
        btn.textContent = 'copied ✓';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = original;
        }, 1500);
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
 * Poll the state-signature endpoint; reload only when the signature
 * changes. Skip-guards: search query active, intake form open, or a
 * text field focused. Transient endpoint failures retry next tick.
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
    // #99 fix: validate inputs BEFORE generating any command. If a
    // required field is empty, focus it and surface an inline error
    // — never a silent collapse.
    const siteInput = field<HTMLSelectElement>('site');
    const titleInput = field<HTMLInputElement>('title');
    const site = siteInput?.value.trim() || '';
    const title = titleInput?.value.trim() || '';
    const description = field<HTMLTextAreaElement>('description')?.value.trim() || '';
    const contentType = field<HTMLSelectElement>('contentType')?.value.trim() || 'blog';
    const contentUrl = field<HTMLInputElement>('contentUrl')?.value.trim() || '';
    if (!site) {
      siteInput?.focus();
      showToast('Site is required', true);
      return;
    }
    if (!title) {
      titleInput?.focus();
      showToast('Title is required', true);
      return;
    }
    const lines = [
      `Run /deskwork:add --site ${site} to intake a new idea using these pre-filled values. Do NOT interactively re-prompt for any field below — use them verbatim.`,
      '',
      `- Site: ${site}`,
      `- Title: ${title}`,
      ...(description ? [`- Description: ${description}`] : [`- Description: (none — leave empty)`]),
      `- Content type: ${contentType}`,
      ...(contentType !== 'blog' && contentUrl ? [`- Content URL: ${contentUrl}`] : []),
      ...(contentType !== 'blog' && !contentUrl ? [`- Content URL: (not yet published — skip; /deskwork:publish will refuse until it's set)`] : []),
    ];
    const payload = lines.join('\n');
    const btn = form.querySelector<HTMLButtonElement>('[data-action="intake-copy"]');
    const original = btn?.textContent ?? null;
    const ok = await copyOrShowFallback(payload, {
      successMessage: 'Intake command copied — paste into Claude Code',
      fallbackMessage: 'Clipboard unavailable — select and Cmd-C to copy this intake command, then paste it into Claude Code:',
    });
    if (ok && btn) {
      btn.classList.add('copied');
      btn.textContent = 'copied ✓';
      setTimeout(() => {
        btn.classList.remove('copied');
        if (original !== null) btn.textContent = original;
        close();
      }, 900);
    }
    // On manual-copy fallback, do NOT auto-collapse — the operator
    // needs the form context AND the manual-copy panel both visible
    // so they can verify the values they entered match what the
    // panel shows.
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

/**
 * #109: render `<time data-format="date">` elements in the operator's
 * locale instead of the server's UTC date slice. Falls back silently
 * if `datetime` is missing or unparseable — the server-emitted UTC
 * slice stays as the visible text.
 */
function initLocaleDates(): void {
  const fmt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
  document.querySelectorAll<HTMLTimeElement>('time[data-format="date"]').forEach((t) => {
    const iso = t.dateTime || t.getAttribute('datetime');
    if (!iso) return;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    t.textContent = fmt.format(d);
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
  initLocaleDates();
}

init();
