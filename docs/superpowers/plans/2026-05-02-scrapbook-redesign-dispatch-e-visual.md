# Scrapbook Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the studio scrapbook surface (`/dev/scrapbook/<site>/<path>`) to match the operator-approved mockup composition — aside-left folder card with numbered item list, vertical card grid with per-kind colored ribbons + always-visible foot toolbar + per-kind preview rendering, drop zone, secret section, single-expanded card invariant, aside cross-linking.

**Architecture:** Six dispatches (F1–F6). F1 is a coherent rebuild of `scrapbook.ts` + `scrapbook.css` + `scrapbook-client.ts` from scratch using the mockup's markup tree; tests rewritten in the same commit. F2–F5 incrementally add per-kind preview refinement, aside numbered list + per-kind extra meta, aside cross-linking + single-expanded invariant + URL hash sync, drop zone + secret section. F6 is a non-code dispatch: `/frontend-design` final integrated sign-off against the mockup at all 4 viewports, producing the audit-trail walkthrough document and the issue's fix-landed comment. No backwards-compat shims; clean replace per the project's "no garbage turds" rule. Each dispatch is one commit. **Design-review gates G1–G4 are non-negotiable** (see "Design-review gates" section below).

**Tech Stack:** TypeScript (Node 22+, ECMAScript), Hono framework for server, vanilla DOM client (no framework), CodeMirror 6 (carried over from review surface, not used here), Vitest for tests, Playwright MCP for live verification. Press-check tokens (`--er-paper`, `--er-ink`, `--er-red-pencil`, etc.) defined in `editorial-review.css` already; mono / serif / display font families already loaded.

**Spec:** [`docs/superpowers/specs/2026-05-02-scrapbook-redesign-impl-spec.md`](../specs/2026-05-02-scrapbook-redesign-impl-spec.md) — read first; this plan implements it.

**Issue:** [#161](https://github.com/audiocontrol-org/deskwork/issues/161)

**Mockup:** [`docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html`](../frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html)

---

## Design-review gates (NON-NEGOTIABLE)

The plan was authored against the mockup; the executor MUST use `/frontend-design:frontend-design` at four explicit gates. Skipping any of these is a process failure on the same severity tier as skipping `ui-verification.md`'s playwright steps. The operator's framing on the cost of skipping: *"don't 'just for now' it and be lazy. That just creates more work for us to cleanup the garbage turds you leave lying around."*

| Gate | When | Input | Required output |
|---|---|---|---|
| **G1** — pre-CSS design review | Before Task **F1.4** (rewriting `scrapbook.css`) | Current page screenshot at 1440 + the mockup HTML file. | Deviation list (each tagged small/medium/large) + go/no-go to write the CSS as drafted in the plan. Any large-tagged deviations must be resolved before proceeding. |
| **G2** — pre-preview-refinement design review | Before Task **F2.2** (refining `renderPreview`) | F1's live preview rendering for each kind + the mockup's preview blocks (md italic excerpt, img frame, json mono pre, txt mono pre). | Per-kind sign-off OR list of deviations to fix in F2.2 / file as follow-up. |
| **G3** — pre-secret/drop-zone design review | Before Task **F5.2** (rendering drop zone + secret section) | Mockup's `.scrap-drop` and `.scrap-secret` blocks + the F4 live state of the page. | Sign-off on the drop-zone visual treatment + secret section's purple stamp + mark-public label flow + dragover state design. |
| **G4** — final integrated sign-off | After **F5** lands (= new Dispatch F6) | Integrated live page at 4 viewports + the mockup. | Either explicit sign-off ("integration matches mockup") OR a list of blocking deviations that must be fixed before issue closure. The sign-off is itself a deliverable; without it the plan is not done. |

`/frontend-design` is invoked the same way the planning phase did: as a Skill tool call with a specific brief (current state + mockup section + question), producing a structured response. The response is captured in the dispatch's verification step (commit message + issue comment) so the audit trail shows the design review actually happened.

## Verification mandate (per `.claude/rules/ui-verification.md`, EXTENDED)

Every dispatch's verification step requires BOTH:

1. **Playwright** — drive the live surface, capture measurements, take screenshots, exercise interactions. Proves the implementation **functions** as specified.
2. **`/frontend-design`** — review the live screenshots + DOM state against the mockup. Proves the implementation **looks** as specified.

Both, not either. Playwright catches "the click handler is broken." `/frontend-design` catches "the click handler works but the button is in the wrong color." The cost of dropping either is exactly what motivated the verification rule; the cost of dropping `/frontend-design` specifically is what motivated this amendment.

If `/frontend-design`'s response says any aspect deviates from the mockup, the dispatch is **not** marked done until either (a) the deviation is fixed in the same dispatch, or (b) it is filed as a follow-up issue with the deviation captured precisely.

---

## File structure

### Files modified across the plan

| Path | Role | Touched in dispatches |
|---|---|---|
| `packages/studio/src/pages/scrapbook.ts` | Server-side page renderer (markup template, data preparation) | F1 (rewrite), F2, F3, F5 |
| `plugins/deskwork-studio/public/css/scrapbook.css` | Page styling | F1 (rewrite), F2, F3, F4, F5 |
| `plugins/deskwork-studio/public/src/scrapbook-client.ts` | Client-side interactivity (filter chips, search, expand/collapse, mutations) | F1 (rewrite), F4, F5 |
| `packages/studio/test/review-scrapbook-index-redesign.test.ts` | Vitest assertions for markup contract | F1 (rewrite), F2, F3, F4, F5 |
| `packages/core/src/scrapbook.ts` (or wherever `ScrapbookItem` lives) | Data model — may need `lineCount`, `imgDimensions`, `jsonKeyCount` extensions | F2, F3 (additions only) |

### File responsibilities (post-rebuild)

- **`scrapbook.ts` (server):** read scrapbook items via `@deskwork/core/scrapbook`, compute per-kind extra meta (line counts, image dimensions, json key counts), build the page model, emit the new markup tree (`.scrap-page` / `.scrap-aside` / `.scrap-main` / `.scrap-cards` / `.scrap-card` / etc.).
- **`scrapbook.css`:** all styling for the new markup. Single rewrite from the mockup's CSS, adapted to the project's token system.
- **`scrapbook-client.ts`:** wire filter chips, search, expand/collapse, single-expanded invariant, aside cross-linking, drop zone, mutation buttons (rename / save / delete / mark-secret / upload).
- **Tests:** assert structural contracts (markup tree, class presence, data-state values, ARIA attributes) and per-dispatch behavioral contracts.

---

## Dispatch F1 — Page rebuild + new markup tree (foundation)

**Goal:** rewrite `scrapbook.ts`, `scrapbook.css`, `scrapbook-client.ts`, and test file from scratch using the mockup's markup tree. Live page renders the new visual composition; existing behavior (filter chips, search, expand-state model, peek rendering, mutation actions) preserved through migration.

**Files:**
- Rewrite: `packages/studio/src/pages/scrapbook.ts`
- Rewrite: `plugins/deskwork-studio/public/css/scrapbook.css`
- Rewrite: `plugins/deskwork-studio/public/src/scrapbook-client.ts`
- Rewrite: `packages/studio/test/review-scrapbook-index-redesign.test.ts`

### Task F1.1: Capture before-state baseline

- [ ] **Step 1: Take a baseline screenshot of the current live scrapbook**

```bash
# Studio dev server must be running (npm run dev --workspace @deskwork/studio).
# Drive the live page in playwright via the MCP browser tools at 1440x900:
#   navigate: http://127.0.0.1:47321/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan
#   browser_resize 1440 900
#   browser_take_screenshot .playwright-mcp/scrapbook-before-rebuild-1440.png (fullPage: true)
```

Expected: screenshot saved showing the current (pre-rebuild) state — aside on right, horizontal card row layout, no per-kind ribbons.

- [ ] **Step 2: Capture computed-style snapshot of key elements**

```js
// Run in playwright via browser_evaluate; persist output as a comment in the test file or a markdown note.
() => ({
  asideRect: document.querySelector('.scrapbook-index')?.getBoundingClientRect(),
  pageGridCols: getComputedStyle(document.querySelector('.scrapbook-page')).gridTemplateColumns,
  itemsGridCols: getComputedStyle(document.querySelector('.scrapbook-items')).gridTemplateColumns,
  hasKindRibbon: getComputedStyle(document.querySelector('.scrapbook-item'), '::before').content !== 'none',
})
```

Expected: aside on right (left > 700), no kind ribbon, current grid cols documented.

### Task F1.2: Write the failing structural test

**Files:** `packages/studio/test/review-scrapbook-index-redesign.test.ts`

- [ ] **Step 1: Replace the existing test file with the new contract**

```typescript
/**
 * Issue #161 — scrapbook redesign structural contract.
 *
 * Asserts the new markup tree from the operator-approved mockup at
 * `docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html`
 * is rendered by the server. Behavior tests are covered in dispatch-specific
 * test additions (F2-F5).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type { EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'd',
  };
}

function seedScrapbookFixture(root: string, cfg: DeskworkConfig): void {
  const cal: EditorialCalendar = { entries: [], distributions: [] };
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
  // Create a content tree node with a scrapbook containing one md file + one txt file.
  const dir = join(root, 'docs/folder/scrapbook');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'note.md'), '---\ntitle: A Note\n---\n\nProse line one.\n');
  writeFileSync(join(dir, 'arrangement.txt'), 'short text content\n');
}

async function fetchScrapbook(
  app: ReturnType<typeof createApp>,
  site: string,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x/dev/scrapbook/${site}/${path}`));
  return { status: res.status, html: await res.text() };
}

describe('scrapbook redesign — structural contract (Issue #161)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-'));
    const cfg = makeConfig();
    seedScrapbookFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders the .scrap-page container with aside-left + main-right', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.status).toBe(200);
    // .scrap-page wraps both aside and main; aside appears BEFORE main in source order
    // (which CSS grid renders as left-then-right).
    const asideIdx = r.html.indexOf('class="scrap-aside"');
    const mainIdx = r.html.indexOf('class="scrap-main"');
    expect(asideIdx).toBeGreaterThan(0);
    expect(mainIdx).toBeGreaterThan(asideIdx);
  });

  it('renders the aside chrome (kicker, title, totals, actions, path)', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<aside class="scrap-aside"/);
    expect(r.html).toMatch(/scrap-aside-kicker/);
    expect(r.html).toMatch(/<h1 class="scrap-aside-title">/);
    expect(r.html).toMatch(/scrap-aside-totals/);
    expect(r.html).toMatch(/scrap-aside-actions/);
    expect(r.html).toMatch(/data-action="new-note"/);
    expect(r.html).toMatch(/data-action="upload"/);
    expect(r.html).toMatch(/scrap-aside-path/);
  });

  it('renders the .scrap-main with breadcrumb + search + filter chips + cards grid', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<section class="scrap-main">/);
    expect(r.html).toMatch(/<nav class="scrap-breadcrumb"/);
    expect(r.html).toMatch(/<div class="scrap-search">/);
    expect(r.html).toMatch(/<div class="scrap-filters"/);
    expect(r.html).toMatch(/<ol class="scrap-cards"/);
  });

  it('renders cards with the new vertical chrome — head + meta + preview + foot', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // Each card has data-kind, data-state="closed" (default), and an id="item-N"
    expect(r.html).toMatch(/<li class="scrap-card" data-kind="md" data-state="closed" id="item-1"/);
    expect(r.html).toMatch(/<li class="scrap-card" data-kind="txt" data-state="closed" id="item-2"/);
    expect(r.html).toMatch(/<div class="scrap-card-head">/);
    expect(r.html).toMatch(/<span class="scrap-seq">/);
    expect(r.html).toMatch(/<span class="scrap-name" data-action="open">/);
    expect(r.html).toMatch(/<time class="scrap-time"/);
    expect(r.html).toMatch(/<div class="scrap-card-meta">/);
    expect(r.html).toMatch(/<span class="scrap-kind scrap-kind--md">MD<\/span>/);
    expect(r.html).toMatch(/<span class="scrap-kind scrap-kind--txt">TXT<\/span>/);
    expect(r.html).toMatch(/<div class="scrap-card-foot">/);
    expect(r.html).toMatch(/data-action="open">open</);
    expect(r.html).toMatch(/data-action="rename">rename</);
    expect(r.html).toMatch(/data-action="delete">delete</);
    expect(r.html).toMatch(/data-action="mark-secret"/);
  });

  it('preserves filter chips with kind labels + counts', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<button class="scrap-filter"/);
    expect(r.html).toMatch(/aria-pressed="true">all/i);
    // Per-kind chips with counts
    expect(r.html).toMatch(/all\s*·\s*2/);
    expect(r.html).toMatch(/md\s*·\s*1/);
    expect(r.html).toMatch(/txt\s*·\s*1/);
  });

  it('preserves search input with / shortcut keybind hint', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<input[^>]*type="search"/);
    expect(r.html).toMatch(/scrap-search-kbd/);
    expect(r.html).toMatch(/[/]<\/span>/); // the literal "/" inside the kbd hint
  });

  it('does NOT retain the old .scrapbook-* classes (clean rebuild, no compat shims)', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // The rebuild replaces; per the spec "no backwards-compat shims; clean replace
    // per the project's no-garbage-turds rule".
    expect(r.html).not.toMatch(/class="scrapbook-page"/);
    expect(r.html).not.toMatch(/class="scrapbook-items"/);
    expect(r.html).not.toMatch(/class="scrapbook-item"/);
    expect(r.html).not.toMatch(/class="scrapbook-index"/);
  });

  it('CSS file uses the new .scrap-* class vocabulary', () => {
    const cssPath = join(
      __dirname,
      '../../../plugins/deskwork-studio/public/css/scrapbook.css',
    );
    const css = require('node:fs').readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/\.scrap-page\s*\{/);
    expect(css).toMatch(/\.scrap-aside\s*\{/);
    expect(css).toMatch(/\.scrap-main\s*\{/);
    expect(css).toMatch(/\.scrap-cards\s*\{/);
    expect(css).toMatch(/\.scrap-card\s*\{/);
    expect(css).toMatch(/\.scrap-card::before/);
    expect(css).toMatch(/\.scrap-card-foot\s*\{/);
    // No old .scrapbook-* selectors remain
    expect(css).not.toMatch(/\.scrapbook-page\s*\{/);
    expect(css).not.toMatch(/\.scrapbook-items\s*\{/);
    expect(css).not.toMatch(/\.scrapbook-item\s*\{/);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
npm test --workspace @deskwork/studio --silent -- --reporter=verbose review-scrapbook-index-redesign 2>&1 | tail -40
```

Expected: every assertion fails because the server still emits the old `.scrapbook-*` markup.

### Task F1.3: Rewrite the server template (`scrapbook.ts`)

**Files:**
- Rewrite: `packages/studio/src/pages/scrapbook.ts`

- [ ] **Step 1: Read the existing file fully**

```bash
# Read packages/studio/src/pages/scrapbook.ts via the Read tool — all 407 lines.
# Note: keep references to renderItemPeek logic, listScrapbook from @deskwork/core/scrapbook,
# scrapbookFilePath, formatRelativeTime, formatSize. These are stable utilities to reuse.
```

- [ ] **Step 2: Write the new server template**

Replace the file contents with the new template. The structure:

```typescript
/**
 * Scrapbook viewer — `/dev/scrapbook/:site/<path>`.
 *
 * Issue #161 redesign: aside-left folder card with numbered item list,
 * vertical card grid with per-kind colored ribbons + always-visible foot
 * toolbar + per-kind preview rendering, drop zone, secret section,
 * single-expanded card invariant, aside cross-linking.
 *
 * Mockup: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html
 * Spec:   docs/superpowers/specs/2026-05-02-scrapbook-redesign-impl-spec.md
 */

import { readFileSync } from 'node:fs';
import {
  formatRelativeTime,
  formatSize,
  listScrapbook,
  scrapbookFilePath,
  type ScrapbookItem,
} from '@deskwork/core/scrapbook';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

const KIND_LABEL: Record<ScrapbookItem['kind'], string> = {
  md: 'MD',
  img: 'IMG',
  json: 'JSON',
  txt: 'TXT',
  other: '·',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Server-side preview for the closed-state card. Img → bg-frame URL;
 * md → plain-text excerpt of first paragraphs; json/txt → mono pre.
 * Other → no preview block (kind chip in meta is enough).
 *
 * F1 emits the basic shape; F2 refines per-kind details (line clamping,
 * frontmatter strip, mono pre clamping).
 */
function renderPreview(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
  opts: { secret?: boolean } = {},
): RawHtml {
  const { secret = false } = opts;
  if (item.kind === 'img') {
    const params = new URLSearchParams({ site, path, name: item.name });
    if (secret) params.set('secret', '1');
    const url = `/api/dev/scrapbook-file?${params.toString()}`;
    return unsafe(html`
      <div class="scrap-preview scrap-preview--img" aria-hidden="true">
        <div class="scrap-preview--img-frame" style="background-image: url(&quot;${url}&quot;);"></div>
      </div>`);
  }
  if (item.kind === 'md' || item.kind === 'txt' || item.kind === 'json') {
    try {
      const fullPath = scrapbookFilePath(
        ctx.projectRoot,
        ctx.config,
        site,
        path,
        item.name,
        secret ? { secret: true } : {},
      );
      const buf = readFileSync(fullPath);
      const text = buf
        .subarray(0, Math.min(buf.byteLength, 1200))
        .toString('utf-8');
      const lines = text.split('\n');
      // F1: simple excerpt; F2 will strip frontmatter on md and refine clamping.
      const excerpt = lines.slice(0, 8).join('\n').slice(0, 600);
      const safe = escapeHtml(excerpt);
      if (item.kind === 'json' || item.kind === 'txt') {
        return unsafe(html`
          <pre class="scrap-preview scrap-preview--mono" aria-hidden="true">${safe}</pre>`);
      }
      // md
      return unsafe(html`
        <div class="scrap-preview scrap-preview-md" aria-hidden="true"><p>${safe}</p></div>`);
    } catch {
      return unsafe('');
    }
  }
  return unsafe('');
}

interface KindCounts {
  all: number;
  md: number;
  img: number;
  json: number;
  txt: number;
  other: number;
}

function countByKind(items: readonly ScrapbookItem[]): KindCounts {
  const counts: KindCounts = { all: items.length, md: 0, img: 0, json: 0, txt: 0, other: 0 };
  for (const i of items) counts[i.kind]++;
  return counts;
}

function renderFilterChips(counts: KindCounts): RawHtml {
  const chip = (kind: keyof KindCounts, label: string, isAll = false) => unsafe(html`
    <button class="scrap-filter" type="button" data-filter="${kind}"
      aria-pressed="${isAll ? 'true' : 'false'}">${label} · ${counts[kind]}</button>`);
  return unsafe(html`
    <div class="scrap-filters" role="toolbar" aria-label="filter by kind">
      ${chip('all', 'all', true)}
      ${chip('md', 'md')}
      ${chip('img', 'img')}
      ${chip('json', 'json')}
      ${chip('txt', 'txt')}
      ${chip('other', 'other')}
    </div>`);
}

function renderSearch(): RawHtml {
  return unsafe(html`
    <div class="scrap-search">
      <input type="search" placeholder="filter by name or content" aria-label="filter scrapbook" data-scrap-search />
      <span class="scrap-search-kbd">/</span>
    </div>`);
}

function renderBreadcrumb(site: string, path: string): RawHtml {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? path;
  return unsafe(html`
    <nav class="scrap-breadcrumb" aria-label="hierarchy">
      <a href="/dev/content/${site}">${site}</a><span class="sep">›</span>
      <b>${last}</b>
    </nav>`);
}

function renderAside(
  site: string,
  path: string,
  items: readonly ScrapbookItem[],
  totalSize: number,
  lastModified: Date | null,
): RawHtml {
  const lastModifiedLabel = lastModified
    ? formatRelativeTime(lastModified)
    : '—';
  // Public/secret split is wired in F5; F1 ships only public count.
  const publicCount = items.length;
  const secretCount = 0;
  const sizeLabel = formatSize(totalSize);
  const folderLabel = path.split('/').filter(Boolean).pop() ?? path;
  const fullPath = `${site}/${path}/scrapbook/`;
  return unsafe(html`
    <aside class="scrap-aside">
      <p class="scrap-aside-kicker"><em>§</em> The folder</p>
      <h1 class="scrap-aside-title">${folderLabel}</h1>
      <p class="scrap-aside-meta">${site}</p>
      <hr />
      <p class="scrap-aside-totals">
        <strong>${publicCount}</strong> public ·
        <strong>${secretCount}</strong> secret ·
        <em>${sizeLabel}</em>
      </p>
      <p class="scrap-aside-meta">last modified ${lastModifiedLabel}</p>
      <hr />
      <ol class="scrap-aside-list" data-scrap-aside-list>
        ${items.map((item, i) => {
          const seq = String(i + 1).padStart(2, '0');
          return unsafe(html`<li><span class="num">${seq}</span><a href="#item-${i + 1}" data-scrap-aside-link>${item.name}</a></li>`);
        })}
      </ol>
      <hr />
      <div class="scrap-aside-actions">
        <button class="scrap-aside-btn scrap-aside-btn--primary" type="button" data-action="new-note">+ new note</button>
        <button class="scrap-aside-btn" type="button" data-action="upload">+ upload file</button>
      </div>
      <hr />
      <p class="scrap-aside-path">${fullPath}</p>
    </aside>`);
}

function renderCard(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
  index: number,
): RawHtml {
  const seq = String(index + 1).padStart(2, '0');
  const kindLabel = KIND_LABEL[item.kind];
  const kindClass = item.kind === 'other' ? '' : `scrap-kind--${item.kind}`;
  const time = item.modified
    ? `<time class="scrap-time" datetime="${item.modified.toISOString()}">${formatRelativeTime(item.modified)}</time>`
    : '';
  const preview = renderPreview(ctx, site, path, item);
  // edit button omitted for img kind (no in-place editor for binary)
  const editBtn = item.kind === 'img'
    ? ''
    : `<button class="scrap-tool" type="button" data-action="edit">edit</button>`;
  return unsafe(html`
    <li class="scrap-card" data-kind="${item.kind}" data-state="closed" id="item-${index + 1}">
      <div class="scrap-card-head">
        <span class="scrap-seq">N° ${seq}</span>
        <span class="scrap-name" data-action="open">${item.name}</span>
        ${unsafe(time)}
      </div>
      <div class="scrap-card-meta">
        <span class="scrap-kind ${kindClass}">${kindLabel}</span>
        <span class="scrap-size">${formatSize(item.size)}</span>
      </div>
      ${preview}
      <div class="scrap-card-foot">
        <button class="scrap-tool scrap-tool--primary" type="button" data-action="open">open</button>
        ${unsafe(editBtn)}
        <button class="scrap-tool" type="button" data-action="rename">rename</button>
        <button class="scrap-tool" type="button" data-action="mark-secret">mark secret</button>
        <span class="spacer"></span>
        <button class="scrap-tool scrap-tool--delete" type="button" data-action="delete">delete</button>
      </div>
    </li>`);
}

export function renderScrapbook(
  ctx: StudioContext,
  site: string,
  path: string,
): RawHtml {
  let items: readonly ScrapbookItem[] = [];
  let totalSize = 0;
  let lastModified: Date | null = null;
  try {
    const result = listScrapbook(ctx.projectRoot, ctx.config, site, path);
    items = result.items;
    totalSize = items.reduce((s, i) => s + i.size, 0);
    lastModified = items.reduce<Date | null>((acc, i) => {
      if (!i.modified) return acc;
      if (!acc || i.modified > acc) return i.modified;
      return acc;
    }, null);
  } catch {
    // Empty scrapbook or missing dir — render empty state.
  }
  const counts = countByKind(items);
  const folderLabel = path.split('/').filter(Boolean).pop() ?? path;
  const cards = items.map((item, i) => renderCard(ctx, site, path, item, i));
  const body = html`
    <body data-review-ui="scrapbook">
      ${renderEditorialFolio('content', `scrapbook · ${site}/${path}`)}
      <main class="scrap-page">
        ${renderAside(site, path, items, totalSize, lastModified)}
        <section class="scrap-main">
          <header class="scrap-main-header">
            ${renderBreadcrumb(site, path)}
            ${renderSearch()}
          </header>
          ${renderFilterChips(counts)}
          <ol class="scrap-cards" id="cards" data-scrap-cards>
            ${unsafe(cards.map((c) => c.toString()).join(''))}
          </ol>
          ${unsafe('<!-- F5: drop zone + secret section -->')}
        </section>
      </main>
    </body>`;
  return layout({
    title: `scrapbook · ${folderLabel} — dev`,
    bodyHtml: body,
    extraStylesheets: ['/static/css/scrapbook.css'],
    extraClientScripts: ['/dist/scrapbook-client.js'],
  });
}
```

Note: this template uses utilities that exist (`renderEditorialFolio`, `layout`, `formatRelativeTime`, `formatSize`, `listScrapbook`, `scrapbookFilePath`, `unsafe`, `html`). The `data-review-ui="scrapbook"` body attribute is new; if `editorial-nav.css` doesn't already include `scrapbook` in its body padding-top selector group, that's a F1 follow-up edit.

- [ ] **Step 3: If `data-review-ui="scrapbook"` needs body padding-top, add it**

Edit `plugins/deskwork-studio/public/css/editorial-nav.css` to include `scrapbook` in the existing padding-top selector group (alongside `studio`, `shortform`, `entry-review`, `manual`):

```css
body[data-review-ui="studio"],
body[data-review-ui="shortform"],
body[data-review-ui="entry-review"],
body[data-review-ui="manual"],
body[data-review-ui="scrapbook"] {
  padding-top: var(--er-folio-h);
}
```

- [ ] **Step 4: Run server tests; expect markup-shape tests to pass**

```bash
npm test --workspace @deskwork/studio --silent -- --reporter=verbose review-scrapbook-index-redesign 2>&1 | tail -30
```

Expected: server-shape assertions in tests pass (`.scrap-page`, `.scrap-aside`, `.scrap-main`, etc. all present in HTML response). The CSS-shape test (Task F1.2 last assertion block) still fails because `scrapbook.css` hasn't been rewritten yet.

### Task F1.3.5: Gate G1 — pre-CSS design review (REQUIRED, blocks F1.4)

This is gate G1. Cannot be skipped. The CSS draft in F1.4 is the planner's translation of the mockup; this gate verifies the translation before code is written.

- [ ] **Step 1: Capture the current state for design review**

```bash
# Drive playwright after F1.3 (server is now emitting new markup but old CSS is still applied):
#   browser_resize 1440 900
#   browser_navigate http://127.0.0.1:47321/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan
#   browser_take_screenshot .playwright-mcp/scrapbook-after-f1.3-pre-css-1440.png (fullPage: true)
```

This screenshot shows the new markup with stale CSS — useful for the design reviewer to see the "raw shape before styling."

- [ ] **Step 2: Invoke `/frontend-design` with the pre-CSS brief**

```
Skill: frontend-design:frontend-design
Args: Review the planned CSS for the scrapbook redesign (Issue #161) against the operator-approved mockup.

CURRENT STATE: the server in scrapbook.ts now emits the new .scrap-* markup tree (Task F1.3 just landed). The old scrapbook.css is still applied, so the visual is broken — but the markup tree is in place. Screenshot at .playwright-mcp/scrapbook-after-f1.3-pre-css-1440.png.

PLANNED CSS: see docs/superpowers/plans/2026-05-02-scrapbook-redesign-dispatch-e-visual.md Task F1.4 — the planner's translation of the mockup CSS into the project's token system. About 400 lines total: page grid, aside chrome, main header, filter chips, search, cards grid, card chrome, per-kind ribbons, preview surface, foot toolbar, expanded state.

MOCKUP: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html lines 104-518 (CSS) + lines 537-806 (markup it targets).

REQUIRED OUTPUT:
1. Deviation list: each item tagged small / medium / large, with the mockup line + the plan line + what differs.
2. For each large deviation: must this be fixed in F1.4 (planner got it wrong) OR is the planned divergence acceptable?
3. Aesthetic refinements: anything the mockup does not specify but should be added (e.g., focus-visible outlines on .scrap-tool buttons, reduced-motion handling on .scrap-card hover).
4. Sign-off statement: "F1.4 may proceed as drafted" OR "F1.4 must amend [X, Y, Z] before proceeding."

This gate is non-negotiable per the plan's Design-review gates section. Skip = process failure.
```

- [ ] **Step 3: Capture the response in a notes file alongside the plan**

```bash
# Write the /frontend-design response to docs/superpowers/plans/2026-05-02-scrapbook-redesign-design-reviews.md as
#   ## G1 — pre-CSS design review (YYYY-MM-DD HH:MM)
#   ### Deviations
#   - [size] description (mockup line, plan line)
#   ### Sign-off
#   <verbatim from /frontend-design>
# This file is the audit trail for the design-review gates.
```

- [ ] **Step 4: Decision point**

If `/frontend-design` signed off: proceed to F1.4 with the planned CSS.

If it flagged large deviations that need fixing: amend the F1.4 CSS draft inline with the fixes, then proceed.

If it flagged ambiguities the operator must decide: **stop here**; surface the ambiguity to the operator and wait. Do not proceed to F1.4 with unresolved design questions.

### Task F1.4: Rewrite the CSS (`scrapbook.css`)

**Files:**
- Rewrite: `plugins/deskwork-studio/public/css/scrapbook.css`

- [ ] **Step 1: Replace the entire CSS file with the rebuild**

The new CSS is grounded in the mockup at `docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html` lines 104–518. Adapt:
- Tokens already exist in `editorial-review.css` (`:root` block); the scrapbook stylesheet does NOT need to redeclare them — it loads after `editorial-review.css` and inherits the cascade.
- The mockup's `.er-folio` styling is in `editorial-nav.css`; do not duplicate.
- The body background + grain noise also already exists in `editorial-review.css` for `body[data-review-ui="studio"|...]`. Add `scrapbook` to that selector group at the same time as the padding rule (Task F1.3 step 3).

```css
/* scrapbook.css — page styling for /dev/scrapbook/<site>/<path>.
 *
 * Issue #161 redesign — aside-left folder card + vertical scrap-card grid
 * with per-kind ribbons + always-visible foot toolbar + per-kind preview.
 * Mirrors the approved mockup at
 * docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html
 *
 * Tokens (--er-paper, --er-ink, --er-red-pencil, etc.) come from editorial-review.css
 * and editorial-nav.css; this file does not redeclare them.
 */

/* ============ PAGE GRID — aside-left + main-right ============ */
.scrap-page {
  max-width: var(--er-page-max);
  margin: var(--er-space-4) auto var(--er-space-6);
  padding: 0 var(--er-space-4);
  display: grid;
  grid-template-columns: 17rem 1fr;
  gap: var(--er-space-5);
  align-items: start;
}
@media (max-width: 64rem) {
  .scrap-page { grid-template-columns: 1fr; gap: var(--er-space-3); }
  .scrap-aside { position: static; }
}

/* ============ ASIDE — folder card, sticky on left ============ */
.scrap-aside {
  position: sticky;
  top: calc(var(--er-folio-h) + var(--er-space-3));
  font-family: var(--er-font-display);
  background: var(--er-paper);
  border: 1px solid var(--er-paper-3);
  border-radius: 2px;
  padding: var(--er-space-3);
  box-shadow: 0 6px 14px -8px rgba(26, 22, 20, 0.15);
}
.scrap-aside-kicker {
  font-family: var(--er-font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--er-faded);
  margin: 0 0 var(--er-space-1);
}
.scrap-aside-kicker em {
  font-family: var(--er-font-display);
  font-style: italic;
  color: var(--er-red-pencil);
  font-size: 1rem;
  text-transform: none;
  letter-spacing: 0;
  margin-right: 0.25rem;
}
.scrap-aside-title {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 144, "wght" 600, "SOFT" 30;
  font-size: 1.6rem;
  line-height: 1.1;
  margin: 0 0 var(--er-space-1);
  letter-spacing: -0.01em;
  word-break: break-all;
}
.scrap-aside-meta {
  font-family: var(--er-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--er-faded);
  margin: 0 0 var(--er-space-1);
}
.scrap-aside-totals {
  font-family: var(--er-font-display);
  font-style: italic;
  color: var(--er-ink-soft);
  font-size: 0.95rem;
  margin: var(--er-space-1) 0;
}
.scrap-aside hr {
  border: 0;
  border-top: 1px dashed var(--er-faded-2);
  margin: var(--er-space-2) 0;
}
.scrap-aside-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 16rem;
  overflow-y: auto;
}
.scrap-aside-list li { display: flex; gap: 0.5rem; align-items: baseline; }
.scrap-aside-list .num {
  font-family: var(--er-font-mono);
  font-size: 0.6rem;
  color: var(--er-faded);
  letter-spacing: 0.1em;
}
.scrap-aside-list a {
  font-family: var(--er-font-mono);
  font-size: 0.72rem;
  color: var(--er-ink-soft);
  text-decoration: none;
  border-bottom: 1px dotted transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
}
.scrap-aside-list a:hover { color: var(--er-red-pencil); border-bottom-color: var(--er-red-pencil); }
.scrap-aside-list a[data-active="true"] { color: var(--er-red-pencil); border-bottom-color: var(--er-red-pencil); }

.scrap-aside-actions { display: flex; flex-direction: column; gap: 0.4rem; }
.scrap-aside-btn {
  font-family: var(--er-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--er-paper-2);
  border: 1px solid var(--er-faded-2);
  color: var(--er-ink);
  padding: 0.4rem 0.7rem;
  border-radius: 2px;
  text-align: center;
  cursor: pointer;
}
.scrap-aside-btn:hover { background: var(--er-ink); color: var(--er-paper); border-color: var(--er-ink); }
.scrap-aside-btn--primary { background: var(--er-red-pencil); color: var(--er-paper); border-color: var(--er-red-pencil); }
.scrap-aside-btn--primary:hover { background: var(--er-ink); border-color: var(--er-ink); }

.scrap-aside-path {
  font-family: var(--er-font-mono);
  font-size: 0.62rem;
  color: var(--er-faded);
  margin: 0;
  word-break: break-all;
}

/* ============ MAIN — header + cards grid ============ */
.scrap-main { min-width: 0; }
.scrap-main-header {
  display: flex;
  align-items: baseline;
  gap: var(--er-space-3);
  margin-bottom: var(--er-space-3);
  flex-wrap: wrap;
}
.scrap-breadcrumb {
  font-family: var(--er-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--er-faded);
}
.scrap-breadcrumb a { color: var(--er-faded); text-decoration: none; }
.scrap-breadcrumb a:hover { color: var(--er-ink); }
.scrap-breadcrumb .sep { color: var(--er-faded-2); margin: 0 0.4em; }
.scrap-breadcrumb b { color: var(--er-ink); font-weight: 500; }

.scrap-search {
  margin-left: auto;
  display: flex;
  gap: 0.4rem;
  align-items: center;
  font-family: var(--er-font-mono);
}
.scrap-search input {
  font-family: var(--er-font-mono);
  font-size: 0.75rem;
  border: 1px solid var(--er-faded-2);
  background: var(--er-paper);
  padding: 0.3rem 0.5rem;
  width: 14rem;
  border-radius: 2px;
}
.scrap-search input::placeholder { color: var(--er-faded); }
.scrap-search-kbd {
  font-family: var(--er-font-mono);
  font-size: 0.6rem;
  border: 1px solid var(--er-faded-2);
  border-bottom-width: 2px;
  border-radius: 3px;
  padding: 0.05rem 0.3rem;
  background: var(--er-paper);
  color: var(--er-faded);
}

.scrap-filters { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: var(--er-space-3); }
.scrap-filter {
  font-family: var(--er-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: transparent;
  border: 1px solid var(--er-faded-2);
  color: var(--er-faded);
  padding: 0.25rem 0.5rem;
  border-radius: 2px;
  cursor: pointer;
}
.scrap-filter[aria-pressed="true"] { background: var(--er-ink); color: var(--er-paper); border-color: var(--er-ink); }

/* ============ CARDS GRID ============ */
.scrap-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: var(--er-space-3);
}
@media (min-width: 80rem) {
  .scrap-cards { grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr)); }
}

/* ============ CARD CHROME ============ */
.scrap-card {
  background: var(--er-paper);
  border: 1px solid var(--er-paper-3);
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: border-color 160ms, transform 160ms, box-shadow 160ms;
}
.scrap-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: var(--er-faded-2);
  border-radius: 2px 2px 0 0;
}
.scrap-card[data-kind="md"]::before   { background: var(--er-proof-blue); }
.scrap-card[data-kind="img"]::before  { background: var(--er-stamp-green); }
.scrap-card[data-kind="json"]::before { background: var(--er-stamp-purple); }
.scrap-card[data-kind="txt"]::before  { background: var(--er-faded); }
.scrap-card:hover {
  border-color: var(--er-red-pencil);
  transform: translateY(-2px);
  box-shadow:
    0 10px 22px -10px rgba(26, 22, 20, 0.18),
    0 2px 6px -2px rgba(184, 54, 42, 0.18);
}

.scrap-card-head {
  padding: var(--er-space-2);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.6rem;
  align-items: baseline;
  border-bottom: 1px dotted var(--er-paper-3);
}
.scrap-seq {
  font-family: var(--er-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  color: var(--er-faded);
}
.scrap-name {
  font-family: var(--er-font-mono);
  font-size: 0.85rem;
  color: var(--er-ink);
  word-break: break-word;
  cursor: pointer;
  border-bottom: 1px dotted transparent;
}
.scrap-name:hover { color: var(--er-red-pencil); border-bottom-color: var(--er-red-pencil); }
.scrap-time {
  font-family: var(--er-font-mono);
  font-size: 0.62rem;
  color: var(--er-faded);
  letter-spacing: 0.08em;
}

.scrap-card-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-family: var(--er-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--er-faded);
  padding: 0.4rem var(--er-space-2);
  border-bottom: 1px dotted var(--er-paper-3);
}
.scrap-kind {
  font-size: 0.55rem;
  padding: 0.05rem 0.35rem;
  border-radius: 2px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  background: var(--er-faded);
  color: var(--er-paper);
}
.scrap-kind--md   { background: var(--er-proof-blue); }
.scrap-kind--img  { background: var(--er-stamp-green); }
.scrap-kind--json { background: var(--er-stamp-purple); }
.scrap-kind--txt  { background: var(--er-faded); }
.scrap-size { color: var(--er-ink-soft); }

/* ============ PREVIEW SURFACE ============ */
.scrap-preview {
  padding: var(--er-space-2);
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 14, "wght" 350;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--er-ink-soft);
  flex: 1 1 auto;
  min-height: 6rem;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.scrap-preview--mono {
  font-family: var(--er-font-mono);
  font-style: normal;
  font-size: 0.78rem;
  white-space: pre-wrap;
  color: var(--er-ink);
  background: var(--er-paper-2);
  border-top: 1px solid var(--er-paper-3);
  border-bottom: 1px solid var(--er-paper-3);
}
.scrap-preview--img {
  padding: 0;
  min-height: 0;
  display: block;
  overflow: hidden;
}
.scrap-preview--img-frame {
  width: 100%;
  aspect-ratio: 4 / 3;
  background-position: center;
  background-size: cover;
  background-color: var(--er-paper-3);
}
.scrap-preview-md p:first-child { margin-top: 0; }
.scrap-preview-md em { color: var(--er-stamp-purple); }

/* ============ CARD FOOT — always-visible toolbar ============ */
.scrap-card-foot {
  display: flex;
  gap: 0.3rem;
  padding: var(--er-space-1) var(--er-space-2);
  border-top: 1px dotted var(--er-paper-3);
  background: var(--er-paper-2);
  font-family: var(--er-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.scrap-tool {
  background: transparent;
  border: 1px solid transparent;
  color: var(--er-faded);
  padding: 0.2rem 0.4rem;
  border-radius: 2px;
  cursor: pointer;
}
.scrap-tool:hover { color: var(--er-ink); border-color: var(--er-faded-2); }
.scrap-tool--delete:hover { color: var(--er-red-pencil); border-color: var(--er-red-pencil); }
.scrap-tool--primary { color: var(--er-stamp-green); border-color: transparent; }
.scrap-tool--primary:hover { background: var(--er-stamp-green); color: var(--er-paper); border-color: var(--er-stamp-green); }
.scrap-card-foot .spacer { flex: 1 1 auto; }

/* ============ EXPANDED STATE ============ */
.scrap-card[data-state="expanded"] {
  grid-column: 1 / -1;
  border-color: var(--er-red-pencil);
}
.scrap-card[data-state="expanded"] .scrap-preview {
  -webkit-line-clamp: unset;
  display: block;
  min-height: 14rem;
  font-size: 1rem;
  line-height: 1.6;
}
.scrap-card[data-state="expanded"] .scrap-preview--mono {
  font-size: 0.85rem;
  max-height: none;
  overflow: auto;
}
.scrap-card[data-state="expanded"] .scrap-preview--img-frame {
  aspect-ratio: auto;
  min-height: 20rem;
  background-size: contain;
  background-repeat: no-repeat;
}

/* ============ FILTERED-OUT STATE ============ */
.scrap-card[data-filtered-out="true"] { display: none; }
```

- [ ] **Step 2: Run all studio tests; expect F1.2's CSS-shape test to pass; nothing else regresses**

```bash
npm test --workspace @deskwork/studio --silent 2>&1 | tail -10
```

Expected: 338 → 338 (the test file count is the same; F1.2's tests now pass; no regressions on existing tests).

### Task F1.5: Rewrite the client (`scrapbook-client.ts`)

**Files:**
- Rewrite: `plugins/deskwork-studio/public/src/scrapbook-client.ts`

- [ ] **Step 1: Read the existing client to understand existing mutation handlers**

```bash
# Read plugins/deskwork-studio/public/src/scrapbook-client.ts to inventory:
# - filter chip handler
# - search "/" shortcut
# - disclosure / expand-state handler
# - rename / save / delete / mark-secret / upload mutation handlers (POST endpoints)
# - bootstrap / DOMContentLoaded
# Carry forward the mutation logic; rewrite the wiring.
```

- [ ] **Step 2: Replace the client with the new wiring**

```typescript
/**
 * Scrapbook viewer client — `/dev/scrapbook/<site>/<path>`.
 *
 * Issue #161 redesign — wires the new .scrap-* markup tree:
 *   - filter chips (.scrap-filter): toggle data-filtered-out on cards
 *   - search input (.scrap-search input): filter cards by name; '/' focuses
 *   - card open/close (.scrap-name + [data-action="open"]): toggle data-state
 *   - foot toolbar buttons: rename / edit / mark-secret / delete / new-note / upload
 *   - aside list links: scroll + open the corresponding card (F4 will refine)
 *
 * F1 ships filter / search / open-close / mutations. F4 adds single-expanded
 * invariant + aria-active on aside list. F5 adds drop zone handler.
 */

const FILTER_KEYS = ['all', 'md', 'img', 'json', 'txt', 'other'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function init(): void {
  wireFilterChips();
  wireSearch();
  wireCards();
  wireMutations();
}

function wireFilterChips(): void {
  const chips = document.querySelectorAll<HTMLButtonElement>('.scrap-filter');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const filter = (chip.dataset.filter ?? 'all') as FilterKey;
      // Visual state: only this chip aria-pressed.
      chips.forEach((c) => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      applyFilter(filter);
    });
  });
}

function applyFilter(filter: FilterKey): void {
  document.querySelectorAll<HTMLElement>('.scrap-card').forEach((card) => {
    const kind = card.dataset.kind ?? 'other';
    const match = filter === 'all' || filter === kind;
    if (match) card.removeAttribute('data-filtered-out');
    else card.setAttribute('data-filtered-out', 'true');
  });
}

function wireSearch(): void {
  const input = document.querySelector<HTMLInputElement>('.scrap-search input[data-scrap-search]');
  if (!input) return;
  input.addEventListener('input', () => applySearch(input.value));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      ev.preventDefault();
      input.focus();
    }
  });
}

function applySearch(query: string): void {
  const q = query.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('.scrap-card').forEach((card) => {
    const name = card.querySelector<HTMLElement>('.scrap-name')?.textContent?.toLowerCase() ?? '';
    const match = q === '' || name.includes(q);
    if (match) card.removeAttribute('data-search-out');
    else card.setAttribute('data-search-out', 'true');
  });
}

function wireCards(): void {
  document.querySelectorAll<HTMLElement>('.scrap-card').forEach((card) => {
    // Both .scrap-name click and [data-action="open"] click toggle.
    card.querySelectorAll<HTMLElement>('.scrap-name, .scrap-card-foot [data-action="open"]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        toggleCard(card);
      });
    });
  });
}

function toggleCard(card: HTMLElement): void {
  const nextState = card.dataset.state === 'expanded' ? 'closed' : 'expanded';
  // F4 will collapse other expanded cards here (single-expanded invariant)
  // and update the aside `data-active` flip + URL hash.
  card.dataset.state = nextState;
  if (nextState === 'expanded') {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function wireMutations(): void {
  // F1: stub the mutation handlers so the buttons exist with no-ops in
  // commit time. Real wiring carries over from the prior client; replace
  // each placeholder with the existing fetch logic during this step.
  document.querySelectorAll<HTMLButtonElement>('[data-action="rename"]').forEach((btn) => {
    btn.addEventListener('click', () => handleRename(btn));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => handleEdit(btn));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="mark-secret"]').forEach((btn) => {
    btn.addEventListener('click', () => handleMarkSecret(btn));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDelete(btn));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="new-note"]').forEach((btn) => {
    btn.addEventListener('click', () => handleNewNote());
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="upload"]').forEach((btn) => {
    btn.addEventListener('click', () => handleUpload());
  });
}

// === Mutation handlers — port from prior scrapbook-client.ts ===

function handleRename(btn: HTMLButtonElement): void {
  const card = btn.closest<HTMLElement>('.scrap-card');
  if (!card) return;
  const oldName = card.querySelector<HTMLElement>('.scrap-name')?.textContent?.trim() ?? '';
  const newName = window.prompt('Rename to:', oldName);
  if (!newName || newName === oldName) return;
  postMutation('/api/dev/scrapbook/rename', { oldName, newName, ...readSiteAndPath(card) })
    .then(() => location.reload());
}

function handleEdit(btn: HTMLButtonElement): void {
  // Opens the card in edit-in-place mode. Existing implementation uses a
  // CodeMirror dialog; carry forward identically. This is a placeholder
  // for the executor to reconstruct from the prior client file.
  const card = btn.closest<HTMLElement>('.scrap-card');
  if (!card) return;
  // Mark the card data-state="expanded"; the existing renderer uses the
  // expanded state's preview area to mount the editor.
  toggleCard(card);
  // ... existing edit modal wiring ...
}

function handleMarkSecret(btn: HTMLButtonElement): void {
  const card = btn.closest<HTMLElement>('.scrap-card');
  if (!card) return;
  const name = card.querySelector<HTMLElement>('.scrap-name')?.textContent?.trim() ?? '';
  postMutation('/api/dev/scrapbook/mark-secret', { name, ...readSiteAndPath(card) })
    .then(() => location.reload());
}

function handleDelete(btn: HTMLButtonElement): void {
  const card = btn.closest<HTMLElement>('.scrap-card');
  if (!card) return;
  const name = card.querySelector<HTMLElement>('.scrap-name')?.textContent?.trim() ?? '';
  if (!confirm(`Delete ${name}?`)) return;
  postMutation('/api/dev/scrapbook/delete', { name, ...readSiteAndPath(card) })
    .then(() => location.reload());
}

function handleNewNote(): void {
  const name = window.prompt('New note filename (e.g., note-2026-05-02.md):');
  if (!name) return;
  const { site, path } = readSiteAndPath(document.querySelector<HTMLElement>('.scrap-aside'));
  postMutation('/api/dev/scrapbook/save', { name, site, path, content: '' })
    .then(() => location.reload());
}

function handleUpload(): void {
  // F5 will replace this with the drop zone wiring. For F1, click-to-pick.
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const { site, path } = readSiteAndPath(document.querySelector<HTMLElement>('.scrap-aside'));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('site', site);
    fd.append('path', path);
    fetch('/api/dev/scrapbook/upload', { method: 'POST', body: fd }).then(() => location.reload());
  };
  input.click();
}

// === helpers ===

function readSiteAndPath(el: Element | null | undefined): { site: string; path: string } {
  // Aside path text is "site/path/scrapbook/" — split + drop the trailing /scrapbook/.
  const aside = el?.closest('.scrap-page')?.querySelector<HTMLElement>('.scrap-aside-path')
    ?? document.querySelector<HTMLElement>('.scrap-aside-path');
  const text = (aside?.textContent ?? '').trim().replace(/\/+$/, '').replace(/\/scrapbook$/, '');
  const [site, ...rest] = text.split('/');
  return { site: site ?? '', path: rest.join('/') };
}

function postMutation(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// === bootstrap ===

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

Note: the `handleEdit`, `handleRename`, `handleDelete`, `handleMarkSecret`, `handleNewNote`, `handleUpload` implementations carry over from the prior `scrapbook-client.ts`. The plan executor MUST read the prior file and adapt the existing wiring (modal dialogs, error toasts, etc.) — DO NOT write naive `prompt()` / `confirm()` if the prior client had a richer UI. The placeholders above are minimum viable; the executor refines.

- [ ] **Step 3: Run all studio tests + behavioral smoke**

```bash
npm test --workspace @deskwork/studio --silent 2>&1 | tail -10
```

Expected: 338 still pass.

### Task F1.6: Live verification at multiple viewports

- [ ] **Step 1: Drive `/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan` in Playwright**

For each viewport — 1440×900, 1024×768, 768×1024, 390×844 — capture:

```bash
# In Playwright MCP:
#   browser_resize <w> <h>
#   browser_navigate http://127.0.0.1:47321/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan
#   browser_take_screenshot .playwright-mcp/scrapbook-after-f1-{w}.png (fullPage: true)
#   browser_evaluate () => ({
#     pageGridCols: getComputedStyle(document.querySelector('.scrap-page')).gridTemplateColumns,
#     asideRect: document.querySelector('.scrap-aside')?.getBoundingClientRect(),
#     mainRect: document.querySelector('.scrap-main')?.getBoundingClientRect(),
#     itemsGridCols: getComputedStyle(document.querySelector('.scrap-cards')).gridTemplateColumns,
#     firstCardKindRibbon: getComputedStyle(document.querySelector('.scrap-card'), '::before').background,
#     filterChipsCount: document.querySelectorAll('.scrap-filter').length,
#     searchInputExists: !!document.querySelector('.scrap-search input'),
#   })
```

Expected at 1440×900:
- `pageGridCols` ≈ `"272px <main-width>"` (17rem = 272px aside on left)
- `asideRect.left` ≈ 64–96 (page-pad-x)
- `asideRect.width` = 272
- `mainRect.left` > `asideRect.right` (main is to the right of aside)
- `itemsGridCols` shows multiple columns (auto-fill at minmax(22rem, 1fr) at >=80rem)
- `firstCardKindRibbon` includes `--er-proof-blue` value (or `--er-faded-2` for `other`)
- 6 filter chips (all + 5 kinds)
- search input exists

Expected at 768×1024:
- `pageGridCols` = `"<viewport>"` (single column; aside stacks above main)
- `itemsGridCols` likely 1-2 columns

- [ ] **Step 2: Click a card name; verify expansion**

```bash
# browser_click .scrap-card[data-kind="md"] .scrap-name
# browser_evaluate () => document.querySelector('.scrap-card[data-state="expanded"]')?.id
```

Expected: card transitions to `data-state="expanded"`; the test card's `id` is returned.

- [ ] **Step 3: Click a filter chip; verify other cards hide**

```bash
# browser_click .scrap-filter[data-filter="md"]
# browser_evaluate () => Array.from(document.querySelectorAll('.scrap-card')).map(c => ({ kind: c.dataset.kind, hidden: c.hasAttribute('data-filtered-out') }))
```

Expected: only `md` cards have `hidden: false`; all other kinds `hidden: true`.

- [ ] **Step 4: Press `/` outside an input; verify search focus**

```bash
# browser_press_key /
# browser_evaluate () => document.activeElement?.matches('.scrap-search input')
```

Expected: `true` — search input is focused.

- [ ] **Step 5: `/frontend-design` post-F1 visual review (REQUIRED — verification mandate)**

```
Skill: frontend-design:frontend-design
Args: Review the as-built F1 dispatch of the scrapbook redesign (Issue #161) against the mockup.

LIVE PAGE: http://127.0.0.1:47321/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan
SCREENSHOTS (post-F1, post-CSS): .playwright-mcp/scrapbook-after-f1-1440.png, scrapbook-after-f1-1024.png, scrapbook-after-f1-768.png, scrapbook-after-f1-390.png

MOCKUP: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html

WHAT F1 SHIPS: page-grid swap (aside-LEFT), card chrome (vertical: head + meta + preview + foot toolbar), per-kind colored ribbons, filter chips (preserved behavior, new class names), search input + / shortcut (preserved), data-state="expanded" model preserved (mechanic unchanged; markup new).

WHAT F1 DOES NOT YET SHIP (deferred to later dispatches): aside numbered item list (F3), aside cross-link active state (F4), single-expanded invariant (F4), URL hash sync (F4), drop zone (F5), secret section (F5), per-kind preview refinement (F2), per-kind extra meta lines/dimensions/keys (F3).

REQUIRED OUTPUT:
1. Match list: each section of the mockup that F1 successfully ships (aside chrome, main header, filter chips, search, cards grid, card chrome, per-kind ribbons, preview, foot toolbar, expanded state). Confirm each lines up with the mockup at 1440x900.
2. Multi-viewport check: at 1024 / 768 / 390, confirm the responsive collapse to single-column happens correctly and the aside stacks above main when grid breaks.
3. Deviation list: anything in F1 scope that does NOT match the mockup. Tag small/medium/large.
4. Sign-off: "F1 verified — proceed to F2" OR "F1 has [X, Y, Z] deviations; fix before tagging F1 done."

Hold to the rule: a "yes it works" response from playwright is not enough. The /frontend-design review is the visual sign-off that distinguishes "the click handler fires" from "the click handler fires AND the button is colored right AND the spacing matches AND the hover state is correct."
```

- [ ] **Step 6: Capture the response in the design-reviews notes file**

```bash
# Append to docs/superpowers/plans/2026-05-02-scrapbook-redesign-design-reviews.md:
#   ## F1 post-implementation verification (YYYY-MM-DD HH:MM)
#   ### /frontend-design review
#   <verbatim>
#   ### Resolution
#   - [item] fixed in F1 / filed as follow-up #N / accepted as deliberate variation
```

If the review signs off cleanly, proceed to commit. If deviations remain, decide per the Design-review gates rule: fix-in-dispatch OR file-as-follow-up. No silent acceptance.

### Task F1.7: Commit F1

- [ ] **Step 1: Stage + commit with falsifiable claims in the message**

Use the in-tree `.git-commit-msg.tmp` file (per the project's file-handling rule):

```bash
# Write commit message to .git-commit-msg.tmp via the Write tool first, then:
git add packages/studio/src/pages/scrapbook.ts \
        plugins/deskwork-studio/public/css/scrapbook.css \
        plugins/deskwork-studio/public/src/scrapbook-client.ts \
        packages/studio/test/review-scrapbook-index-redesign.test.ts \
        plugins/deskwork-studio/public/css/editorial-nav.css
git commit -F .git-commit-msg.tmp
rm .git-commit-msg.tmp
```

Commit message body must include:
- Goal in one line.
- Live measurements at 1440×900 (pageGridCols, asideRect.left, itemsGridCols, kind ribbon color, filter chips count).
- Verification on 4 viewports.
- Test count (338 → ?).
- Reference to issue #161 + spec path.

---

## Dispatch F2 — Per-kind preview refinement

**Goal:** refine per-kind preview rendering to match the mockup exactly: md italic excerpt with frontmatter stripped, img aspect-ratio frame, json/txt mono pre with proper line clamping. Server-side excerpt extraction handles edge cases (binary masquerading as text, json parse error, zero-byte files).

**Files:**
- Modify: `packages/studio/src/pages/scrapbook.ts` (refine `renderPreview`)
- Modify: `plugins/deskwork-studio/public/css/scrapbook.css` (preview-specific CSS)
- Modify: `packages/studio/test/review-scrapbook-index-redesign.test.ts` (add per-kind preview assertions)

### Task F2.1: Write the failing per-kind preview tests

- [ ] **Step 1: Add test cases to `review-scrapbook-index-redesign.test.ts`**

```typescript
describe('scrapbook redesign — per-kind preview rendering (Issue #161, dispatch F2)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-f2-'));
    const cfg = makeConfig();
    const cal: EditorialCalendar = { entries: [], distributions: [] };
    mkdirSync(join(root, '.deskwork'), { recursive: true });
    writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
    const dir = join(root, 'docs/folder/scrapbook');
    mkdirSync(dir, { recursive: true });
    // md with frontmatter + body
    writeFileSync(
      join(dir, 'note.md'),
      '---\ntitle: Test\nauthor: Operator\n---\n\nFirst paragraph after frontmatter.\n\nSecond paragraph.\n',
    );
    // json with parseable content
    writeFileSync(
      join(dir, 'config.json'),
      '{\n  "key": "value",\n  "nested": { "a": 1 }\n}\n',
    );
    // txt with simple content
    writeFileSync(join(dir, 'log.txt'), 'line one\nline two\nline three\n');
    // small "image" (just bytes; we test the URL emission, not actual rendering)
    writeFileSync(join(dir, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('md preview strips frontmatter and emits italic Newsreader excerpt', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // The frontmatter (--- ... ---) MUST NOT appear in the preview HTML.
    expect(r.html).not.toMatch(/<div class="scrap-preview scrap-preview-md"[^>]*>[^<]*<p>---/);
    // The body content does appear.
    expect(r.html).toMatch(/<div class="scrap-preview scrap-preview-md"[^>]*>[\s\S]*First paragraph after frontmatter/);
  });

  it('img preview emits the .scrap-preview--img-frame with background-image URL', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<div class="scrap-preview scrap-preview--img"[^>]*>[\s\S]*<div class="scrap-preview--img-frame" style="background-image:[^"]*scrapbook-file/);
  });

  it('json preview emits a mono <pre> with parsed-as-text content', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<pre class="scrap-preview scrap-preview--mono"[^>]*>[\s\S]*"key":\s*"value"/);
  });

  it('txt preview emits a mono <pre>', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<pre class="scrap-preview scrap-preview--mono"[^>]*>line one/);
  });

  it('renders without throwing on a binary-as-text file (graceful fallback to no preview)', async () => {
    // Add a binary file masquerading as .txt (UTF-8 invalid).
    const dir = join(root, 'docs/folder/scrapbook');
    writeFileSync(join(dir, 'binary.txt'), Buffer.from([0xff, 0xfe, 0x00, 0x00, 0xff, 0xfe]));
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.status).toBe(200);
    // The card for binary.txt is rendered, just possibly with empty preview text.
    expect(r.html).toMatch(/binary\.txt/);
  });
});
```

- [ ] **Step 2: Run; expect failures**

```bash
npm test --workspace @deskwork/studio --silent -- --reporter=verbose review-scrapbook-index-redesign 2>&1 | tail -40
```

Expected: F2 tests fail (frontmatter still leaks into preview; no graceful fallback yet).

### Task F2.1.5: Gate G2 — pre-preview-refinement design review (REQUIRED, blocks F2.2)

This is gate G2. The per-kind preview is one of the mockup's most distinctive choices — italic Newsreader excerpt for md, aspect-ratio bg-frame for img, mono pre for json/txt. Implementation choices (line-clamp count, frontmatter strip rule, fallback handling) need design judgment.

- [ ] **Step 1: Capture per-kind live state after F1**

```bash
# Drive playwright to a multi-kind scrapbook (the F2 test fixture has md + json + txt + img)
# Capture per-card screenshots showing the F1 preview rendering for each kind at closed AND expanded states.
# Save as .playwright-mcp/scrapbook-f2-pre-{kind}-{state}-1440.png
```

- [ ] **Step 2: Invoke `/frontend-design` with the per-kind brief**

```
Skill: frontend-design:frontend-design
Args: Review per-kind preview rendering for F2 of the scrapbook redesign (Issue #161).

CURRENT (F1) STATE: per-kind previews emit:
- md: <div class="scrap-preview scrap-preview-md"><p>{first 8 lines of file, 600 chars max}</p></div>
- img: <div class="scrap-preview scrap-preview--img"><div class="scrap-preview--img-frame" style="background-image: url(...)"></div></div>
- json: <pre class="scrap-preview scrap-preview--mono">{content excerpt}</pre>
- txt: <pre class="scrap-preview scrap-preview--mono">{content excerpt}</pre>
- other: no preview

PLANNED F2 REFINEMENTS (Task F2.2):
- md: strip frontmatter (--- ... --- block), italic Newsreader, -webkit-line-clamp: 5 in closed state, unclamped in expanded.
- img: same shape; verify aspect-ratio: 4/3 in closed state and unconstrained in expanded.
- json/txt: mono pre, line-clamp ~6 in closed, overflow auto in expanded.
- All kinds: graceful fallback to empty preview on binary-as-text or read error (no crash).

MOCKUP: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html lines 599-616 (md card example), 627-649 (img card example), 651-678 (json card example), 680-707 (txt card example).

SCREENSHOTS: .playwright-mcp/scrapbook-f2-pre-*

REQUIRED OUTPUT:
1. Per-kind sign-off: for each of md / img / json / txt, does the F1 rendering already match the mockup, or are F2 refinements needed? Be specific.
2. Implementation details: exact -webkit-line-clamp values; exact aspect-ratio decisions; exact frontmatter-strip rule (closing --- after the first frontmatter block? or any --- on a line by itself?).
3. Edge cases: empty file, file with only frontmatter (no body), file with very long single line, image too small to show meaningfully at 4/3 — recommendations.
4. Sign-off: "F2.2 may proceed as drafted with the following amendments [...]" OR "F2.2 must redesign [X] before proceeding."

The mockup gives the visual target; this gate captures the implementation judgment that turns target into code.
```

- [ ] **Step 3: Capture the response in the design-reviews notes file**

Same format as G1.

- [ ] **Step 4: Decision — proceed to F2.2 with the response baked in**

If `/frontend-design` recommends additional refinements (e.g., a different line-clamp number, a different frontmatter-strip approach), amend the F2.2 implementation accordingly.

### Task F2.2: Refine `renderPreview` in `scrapbook.ts`

- [ ] **Step 1: Replace the `renderPreview` function with the F2 version**

```typescript
function stripFrontmatter(text: string): string {
  // Strip a YAML frontmatter block from the top of an md file.
  if (!text.startsWith('---\n')) return text;
  const closeIdx = text.indexOf('\n---\n', 4);
  if (closeIdx < 0) return text;
  return text.slice(closeIdx + 5).replace(/^\n+/, '');
}

function previewExcerpt(buf: Buffer, kind: 'md' | 'json' | 'txt'): string | null {
  // UTF-8 decode with graceful fallback. If the buffer isn't valid UTF-8,
  // return null and let the caller render no preview (graceful).
  let text: string;
  try {
    text = buf.subarray(0, Math.min(buf.byteLength, 2400)).toString('utf-8');
  } catch {
    return null;
  }
  // Detect binary masquerading as text: presence of NUL bytes is a strong signal.
  if (text.indexOf(' ') >= 0) return null;
  if (kind === 'md') text = stripFrontmatter(text);
  // First ~6 lines, capped at 600 chars.
  return text.split('\n').slice(0, 8).join('\n').slice(0, 600);
}

function renderPreview(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
  opts: { secret?: boolean } = {},
): RawHtml {
  const { secret = false } = opts;
  if (item.kind === 'img') {
    const params = new URLSearchParams({ site, path, name: item.name });
    if (secret) params.set('secret', '1');
    const url = `/api/dev/scrapbook-file?${params.toString()}`;
    return unsafe(html`
      <div class="scrap-preview scrap-preview--img" aria-hidden="true">
        <div class="scrap-preview--img-frame" style="background-image: url(&quot;${url}&quot;);"></div>
      </div>`);
  }
  if (item.kind !== 'md' && item.kind !== 'json' && item.kind !== 'txt') {
    return unsafe('');
  }
  try {
    const fullPath = scrapbookFilePath(
      ctx.projectRoot,
      ctx.config,
      site,
      path,
      item.name,
      secret ? { secret: true } : {},
    );
    const buf = readFileSync(fullPath);
    const excerpt = previewExcerpt(buf, item.kind);
    if (excerpt === null) return unsafe('');
    const safe = escapeHtml(excerpt);
    if (item.kind === 'json' || item.kind === 'txt') {
      return unsafe(html`
        <pre class="scrap-preview scrap-preview--mono" aria-hidden="true">${safe}</pre>`);
    }
    return unsafe(html`
      <div class="scrap-preview scrap-preview-md" aria-hidden="true"><p>${safe}</p></div>`);
  } catch {
    return unsafe('');
  }
}
```

- [ ] **Step 2: Run F2 tests; expect pass**

```bash
npm test --workspace @deskwork/studio --silent -- --reporter=verbose review-scrapbook-index-redesign 2>&1 | tail -40
```

Expected: all F2 tests pass.

### Task F2.3: Live verification + commit F2

- [ ] **Step 1: Drive a multi-kind scrapbook in playwright**

```bash
# Navigate to the F2 test fixture (md + json + txt + img + other).
# Capture screenshots at 1440 / 1024 / 768 / 390.
# For each kind, capture both closed and expanded states.
# Save as .playwright-mcp/scrapbook-after-f2-{kind}-{state}-{viewport}.png
```

- [ ] **Step 2: Inner-element inspection (per ui-verification.md)**

For markdown previews: `getComputedStyle()` on `.scrap-preview-md p` to confirm font-family resolves to Newsreader and font-style is italic. For mono previews: `getComputedStyle()` on `.scrap-preview--mono` to confirm font-family resolves to JetBrains Mono.

- [ ] **Step 3: `/frontend-design` post-F2 visual review (REQUIRED — verification mandate)**

```
Skill: frontend-design:frontend-design
Args: Review the as-built F2 dispatch (per-kind preview refinement) of the scrapbook redesign (Issue #161).

LIVE: F2 test fixture, 4 viewports, both closed and expanded states for md / img / json / txt / other.
SCREENSHOTS: .playwright-mcp/scrapbook-after-f2-*

MOCKUP: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html — per-kind preview blocks.

WHAT F2 SHIPS: frontmatter strip on md; aspect-ratio bg-frame on img; mono pre with line-clamp on json/txt; graceful fallback on binary or read error.

REQUIRED OUTPUT:
1. Per-kind match: each kind's preview matches the mockup at closed AND expanded states. For each, list deviations or sign off.
2. Edge cases live: confirm the binary-as-text fixture renders without crashing AND without a broken preview block (graceful empty).
3. Inner-element check: verify italic Newsreader on md, JetBrains Mono on json/txt — playwright getComputedStyle output is part of the verification proof, not a substitute for visual review.
4. Sign-off: "F2 verified — proceed to F3" OR "F2 has [X, Y, Z] deviations; fix or file."
```

- [ ] **Step 4: Capture response, resolve deviations, commit F2**

```bash
# Append the /frontend-design review to the design-reviews notes file.
# If clean: commit F2. If deviations: fix-in-dispatch OR file follow-up issue, then commit.
```

---

## Dispatch F3 — Aside numbered list + per-kind extra meta

**Goal:** populate `.scrap-aside-list` with numbered links to each card; add per-kind extra meta (md lines, img dimensions, json key counts) to `.scrap-card-meta`.

**Files:**
- Modify: `packages/studio/src/pages/scrapbook.ts`
- Modify: `plugins/deskwork-studio/public/css/scrapbook.css`
- Modify: `packages/studio/test/review-scrapbook-index-redesign.test.ts`
- Possibly modify: `packages/core/src/scrapbook.ts` (if `ScrapbookItem` needs `lineCount`, `imgDimensions`, `jsonKeyCount` fields)

### Task F3.1: Compute per-kind extra meta server-side

- [ ] **Step 1: Add helper functions in `scrapbook.ts`**

```typescript
function countLines(buf: Buffer): number {
  // Count lines for md/txt — number of \n + 1 if last char isn't \n.
  let count = 0;
  for (const b of buf) if (b === 0x0a) count++;
  if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) count++;
  return count;
}

function countJsonKeys(buf: Buffer): number | null {
  try {
    const obj = JSON.parse(buf.toString('utf-8'));
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return Object.keys(obj).length;
    return null;
  } catch {
    return null;
  }
}

interface ImageDimensions { width: number; height: number; }

function readImageDimensions(buf: Buffer): ImageDimensions | null {
  // PNG: bytes 16-23 are width (big-endian) + height (big-endian).
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }
  // JPEG: scan SOF marker for dimensions. (Lightweight version; for completeness use image-size pkg.)
  // F3 ships the PNG path + size-only fallback for jpg; jpg dimensions deferred unless trivial to add.
  return null;
}

function computeKindMeta(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
): string {
  // Returns the meta-text shown after the kind chip + size: e.g. "72 lines", "2400 × 1600", "5 keys".
  // Wrapped in try/catch; falls back to empty on read error.
  if (item.kind === 'md' || item.kind === 'txt') {
    try {
      const fullPath = scrapbookFilePath(ctx.projectRoot, ctx.config, site, path, item.name);
      const buf = readFileSync(fullPath);
      return `${countLines(buf)} lines`;
    } catch {
      return '';
    }
  }
  if (item.kind === 'json') {
    try {
      const fullPath = scrapbookFilePath(ctx.projectRoot, ctx.config, site, path, item.name);
      const buf = readFileSync(fullPath);
      const keys = countJsonKeys(buf);
      return keys !== null ? `${keys} keys` : '';
    } catch {
      return '';
    }
  }
  if (item.kind === 'img') {
    try {
      const fullPath = scrapbookFilePath(ctx.projectRoot, ctx.config, site, path, item.name);
      const buf = readFileSync(fullPath);
      const dims = readImageDimensions(buf);
      return dims ? `${dims.width} × ${dims.height}` : '';
    } catch {
      return '';
    }
  }
  return '';
}
```

- [ ] **Step 2: Update `renderCard` to include the kind meta**

In `renderCard`, replace the `.scrap-card-meta` block:

```typescript
  const kindMeta = computeKindMeta(ctx, site, path, item);
  const kindMetaHtml = kindMeta ? `<span>·</span><span>${escapeHtml(kindMeta)}</span>` : '';
  // ... in the template:
  // <div class="scrap-card-meta">
  //   <span class="scrap-kind ${kindClass}">${kindLabel}</span>
  //   <span class="scrap-size">${formatSize(item.size)}</span>
  //   ${unsafe(kindMetaHtml)}
  // </div>
```

### Task F3.2: Write F3 tests

- [ ] **Step 1: Add per-kind meta assertions to the test file**

```typescript
describe('scrapbook redesign — per-kind extra meta (Issue #161, dispatch F3)', () => {
  // Reuse the F2 fixture (md / json / txt files).
  // ...
  it('md card meta shows line count', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/note\.md[\s\S]*?<span class="scrap-kind scrap-kind--md">MD<\/span>[\s\S]*?lines/);
  });
  it('json card meta shows key count', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/config\.json[\s\S]*?keys/);
  });
  it('aside list has one <li> per item with numbered link', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    const matches = r.html.match(/<li><span class="num">\d{2}<\/span><a href="#item-\d+"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // we have at least md + json + txt + png in the fixture
  });
});
```

- [ ] **Step 2: Run; verify pass after Task F3.1 implementation**

### Task F3.3: Live verification + commit F3

- [ ] **Step 1: Drive playwright at 1440 / 1024 / 768 / 390**

```bash
# Navigate to a scrapbook with at least 4 items (cover all kinds for the per-kind meta).
# Capture screenshots showing the populated aside list + per-kind extra meta in card-meta rows.
# Verify aside list scrolls properly when items overflow the 16rem max-height.
# Verify hover state on aside <a> shows red-pencil color + dotted underline.
```

- [ ] **Step 2: `/frontend-design` post-F3 visual review (REQUIRED)**

```
Skill: frontend-design:frontend-design
Args: Review the as-built F3 dispatch (aside numbered list + per-kind extra meta) of the scrapbook redesign (Issue #161).

LIVE: scrapbook with multi-kind items; aside list populated.
SCREENSHOTS: .playwright-mcp/scrapbook-after-f3-* (1440 / 1024 / 768 / 390)

MOCKUP: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html lines 550-560 (aside list) + lines 602-606, 633-637, 657-661, 686-690 (per-kind meta examples).

WHAT F3 SHIPS: aside <ol> with one <li> per item (numbered, monospaced); per-kind extra meta in .scrap-card-meta (md "{N} lines", img "{W} × {H}" via PNG header parse, json "{N} keys", txt "{N} lines").

REQUIRED OUTPUT:
1. Aside list match: numbering, link styling, ellipsis on overflow, hover state, scrollability.
2. Per-kind meta match: each kind shows the right extra info; format matches mockup ("72 lines" not "72 LINES" or "72L").
3. Long-filename handling: aside list's text-overflow ellipsis kicks in correctly.
4. Sign-off: "F3 verified — proceed to F4" OR list of deviations.
```

- [ ] **Step 3: Capture response, resolve, commit F3**

---

## Dispatch F4 — Aside cross-linking + single-expanded invariant + URL hash sync

**Goal:** opening a card collapses any other expanded card; aside `<a>` reflects active state; URL hash updates on open and is restored on page-load.

**Files:**
- Modify: `plugins/deskwork-studio/public/src/scrapbook-client.ts`
- Modify: `plugins/deskwork-studio/public/css/scrapbook.css` (active aside link styling — already present in F1 CSS as `[data-active="true"]`)
- Modify: `packages/studio/test/review-scrapbook-index-redesign.test.ts` (behavioral assertions where feasible)

### Task F4.1: Write F4 tests

- [ ] **Step 1: Add behavioral test cases**

These tests focus on what the server emits + what the client wiring expects (markup contracts). Full DOM-state behavior tests would require jsdom or playwright; we keep these as markup contracts.

```typescript
describe('scrapbook redesign — aside cross-linking markup contract (Issue #161, dispatch F4)', () => {
  // ... fixture setup
  it('every aside <a> href matches a card id', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    const asideHrefs = Array.from(r.html.matchAll(/<a href="#(item-\d+)" data-scrap-aside-link/g)).map((m) => m[1]);
    const cardIds = Array.from(r.html.matchAll(/<li class="scrap-card"[^>]*id="(item-\d+)"/g)).map((m) => m[1]);
    expect(asideHrefs.length).toBeGreaterThan(0);
    expect(asideHrefs.length).toBe(cardIds.length);
    asideHrefs.forEach((href) => expect(cardIds).toContain(href));
  });
});
```

### Task F4.2: Refine `toggleCard` in `scrapbook-client.ts` for single-expanded + aside binding

- [ ] **Step 1: Replace `toggleCard` with the F4 version**

```typescript
function toggleCard(card: HTMLElement): void {
  const wasExpanded = card.dataset.state === 'expanded';
  // Single-expanded invariant: collapse anything else first.
  document.querySelectorAll<HTMLElement>('.scrap-card[data-state="expanded"]').forEach((other) => {
    if (other !== card) other.dataset.state = 'closed';
  });
  card.dataset.state = wasExpanded ? 'closed' : 'expanded';
  syncAsideActive();
  syncUrlHash();
  if (!wasExpanded) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function syncAsideActive(): void {
  const expanded = document.querySelector<HTMLElement>('.scrap-card[data-state="expanded"]');
  document.querySelectorAll<HTMLAnchorElement>('.scrap-aside-list a[data-scrap-aside-link]').forEach((a) => {
    if (expanded && a.getAttribute('href') === `#${expanded.id}`) {
      a.setAttribute('data-active', 'true');
    } else {
      a.removeAttribute('data-active');
    }
  });
}

function syncUrlHash(): void {
  const expanded = document.querySelector<HTMLElement>('.scrap-card[data-state="expanded"]');
  const hash = expanded ? `#${expanded.id}` : '';
  // Avoid redundant pushes.
  if (window.location.hash === hash) return;
  // Use replaceState so back/forward isn't peppered with these.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

function restoreFromHash(): void {
  const hash = window.location.hash; // includes leading '#'
  if (!hash) return;
  const card = document.querySelector<HTMLElement>(`.scrap-card${CSS.escape(hash)}`);
  if (card) toggleCard(card);
}
```

- [ ] **Step 2: Wire aside-link clicks to `toggleCard` of the target card**

Add to `wireCards`:

```typescript
function wireCards(): void {
  document.querySelectorAll<HTMLElement>('.scrap-card').forEach((card) => {
    card.querySelectorAll<HTMLElement>('.scrap-name, .scrap-card-foot [data-action="open"]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        toggleCard(card);
      });
    });
  });
  // Aside list cross-links
  document.querySelectorAll<HTMLAnchorElement>('.scrap-aside-list a[data-scrap-aside-link]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = (a.getAttribute('href') ?? '').replace(/^#/, '');
      const card = document.getElementById(id);
      if (card) toggleCard(card);
    });
  });
}
```

- [ ] **Step 3: Add `restoreFromHash()` to the bootstrap**

```typescript
function init(): void {
  wireFilterChips();
  wireSearch();
  wireCards();
  wireMutations();
  restoreFromHash(); // last — depends on the cards being wired first
}
```

### Task F4.3: Live verification + commit F4

- [ ] **Step 1: Drive playwright; verify single-expanded + aside-active + hash-sync**

```bash
# At 1440x900:
# - Open card 1; verify data-state="expanded" on card 1, [data-active="true"] on aside link 1, window.location.hash === '#item-1'
# - Click aside link 2; verify card 2 expanded, card 1 collapsed (single-expanded invariant), aside link 2 active (link 1 inactive), hash === '#item-2'
# - Reload with hash '#item-2'; verify card 2 auto-opens on bootstrap
# - Click card 2 to close; verify hash cleared, no aside link active
```

- [ ] **Step 2: `/frontend-design` post-F4 visual review (REQUIRED)**

```
Skill: frontend-design:frontend-design
Args: Review the as-built F4 dispatch (single-expanded + aside cross-link + URL hash) of the scrapbook redesign (Issue #161).

LIVE: scrapbook with multiple items; capture screenshots in: (a) no card expanded, (b) card 1 expanded with aside link 1 active, (c) card 2 expanded with aside link 2 active (link 1 deactivated), (d) hash-restore-on-reload state.

WHAT F4 SHIPS: single-expanded invariant (opening a new card collapses any other expanded one); aside <a data-active="true"> active styling synced with expanded state; URL hash sync via history.replaceState; restoreFromHash() on bootstrap.

MOCKUP: only shows static state; dynamic behavior (hash-sync, single-expanded) is design-judgment beyond what the mockup specifies.

REQUIRED OUTPUT:
1. Active-state visual: does the aside [data-active="true"] state read clearly as "this card is currently open"? Is the red-pencil + dotted-underline treatment legible on the aside list's small-mono text?
2. Single-expanded UX: does the collapse-on-new-open feel right, or jarring? Recommendation on transition (instant vs animated).
3. Hash-restore behavior: when the page loads with #item-N, the smooth-scroll into the card is good UX OR jumpy? Recommendation.
4. Sign-off: "F4 verified — proceed to F5" OR deviations.
```

- [ ] **Step 3: Capture response, resolve, commit F4**

---

## Dispatch F5 — Drop zone + secret section

**Goal:** end-of-grid drop zone (drag+drop + click-to-pick) and dedicated `.scrap-secret` subsection rendered when secret items exist.

**Files:**
- Modify: `packages/studio/src/pages/scrapbook.ts` (add drop zone + secret section markup)
- Modify: `plugins/deskwork-studio/public/css/scrapbook.css` (drop zone + secret styling — already present in F1 from the mockup CSS)
- Modify: `plugins/deskwork-studio/public/src/scrapbook-client.ts` (drop zone wiring; replace placeholder upload handler)
- Modify: `packages/studio/test/review-scrapbook-index-redesign.test.ts`

### Task F5.1: Tests for drop zone + secret section markup

- [ ] **Step 1: Add tests**

```typescript
describe('scrapbook redesign — drop zone + secret section (Issue #161, dispatch F5)', () => {
  it('renders the drop zone after the cards grid', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<\/ol>\s*<div class="scrap-drop"/);
    expect(r.html).toMatch(/data-action="upload"/); // role=button + click handler in client
  });

  it('omits the secret section when there are no secret items', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).not.toMatch(/<section class="scrap-secret"/);
  });

  it('renders the secret section when secret items exist', async () => {
    // Add a file under scrapbook/secret/
    const dir = join(root, 'docs/folder/scrapbook/secret');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'private-note.md'), '---\ntitle: Private\n---\n\nClassified.\n');
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<section class="scrap-secret"/);
    expect(r.html).toMatch(/scrap-secret-mark/);
    expect(r.html).toMatch(/<h2 class="scrap-secret-title">Secret<\/h2>/);
    expect(r.html).toMatch(/private-note\.md/);
    // Mark-secret button on a secret card reads "mark public"
    expect(r.html).toMatch(/data-action="mark-secret">mark public<\/button>/);
  });
});
```

### Task F5.1.5: Gate G3 — pre-secret/drop-zone design review (REQUIRED, blocks F5.2)

This is gate G3. Drop zone has dragover state + click-to-pick affordance + drop-handling behavior; secret section has purple stamp + mark-public-toggle behavior. Both are visual elements not fully specified in the static mockup; the implementation needs design judgment beyond what the mockup shows.

- [ ] **Step 1: Capture pre-F5 live state**

```bash
# Drive playwright to a scrapbook + (a) without secret items + (b) with secret items.
# Capture screenshots showing the post-F4 state (no drop zone yet, no secret section yet).
# Save as .playwright-mcp/scrapbook-pre-f5-{with|without}-secret-1440.png
```

- [ ] **Step 2: Invoke `/frontend-design` with the brief**

```
Skill: frontend-design:frontend-design
Args: Review the planned F5 dispatch (drop zone + secret section) of the scrapbook redesign (Issue #161).

CURRENT (post-F4) STATE: page has aside-left + main-right, cards grid, filter chips, search, single-expanded + aside cross-link. No drop zone. No secret section. Screenshots at .playwright-mcp/scrapbook-pre-f5-*

PLANNED F5 ELEMENTS:
1. Drop zone (.scrap-drop) at end of cards grid: dashed border 2px var(--er-faded-2), padding var(--er-space-4), centered mono-caps text "── drop a file here, or pick one ──", hover/focus changes border + text to red-pencil. Drop event accepts files; click opens hidden <input type="file">. Dragover state: data-dragover="true" on the .scrap-drop element changes border + bg + text color to red-pencil.

2. Secret section (.scrap-secret) below the public cards (above the drop zone? below the drop zone? — design call). Header has purple stamp glyph (⚿) + h2 "Secret" + dashed-purple badge "private — never published". Items are .scrap-card with same template; mark-secret button reads "mark public" (the action toggles public/secret).

MOCKUP: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html lines 472-486 (drop zone CSS), 488-518 (secret section CSS), 763-803 (drop + secret markup).

DESIGN QUESTIONS THE MOCKUP DOESN'T ANSWER:
1. Drop zone above or below secret section? Mockup shows drop after public cards then secret after drop. Does that order match the press-check metaphor (drop = where new items land = adjacent to public cards) or break it (secret items below drop creates ambiguity)?
2. Dragover state styling: mockup doesn't show drag-over treatment. Recommend the exact CSS.
3. Secret section: should secret cards have a tinted background or different border to distinguish from public, or rely on the section header alone? Mockup has no per-card visual difference.
4. Empty state: when scrapbook has zero items, what shows? Just the drop zone? Or "no items yet" message + drop zone?

REQUIRED OUTPUT:
1. Sign-off on the planned drop zone composition.
2. Recommendations on the design questions above.
3. Sign-off on the planned secret section composition.
4. "F5.2 may proceed as drafted with amendments [...]" OR "F5.2 must redesign [X] before proceeding."
```

- [ ] **Step 3: Capture response, amend F5.2 plan inline if needed**

### Task F5.2: Implement drop zone + secret section in `scrapbook.ts`

- [ ] **Step 1: Add the drop zone + secret rendering helpers**

```typescript
function renderDropZone(): RawHtml {
  return unsafe(html`
    <div class="scrap-drop" role="button" tabindex="0" data-action="upload"
         aria-label="Drop a file here, or click to pick one">
      ── drop a file here, or pick one ──
    </div>`);
}

function renderSecretSection(
  ctx: StudioContext,
  site: string,
  path: string,
  secretItems: readonly ScrapbookItem[],
): RawHtml {
  if (secretItems.length === 0) return unsafe('');
  const cards = secretItems.map((item, i) => renderCard(ctx, site, path, item, i, { secret: true }));
  return unsafe(html`
    <section class="scrap-secret" aria-label="secret items">
      <header class="scrap-secret-head">
        <span class="scrap-secret-mark" aria-hidden="true">⚿</span>
        <h2 class="scrap-secret-title">Secret</h2>
        <span class="scrap-secret-badge">private — never published</span>
      </header>
      <ol class="scrap-cards">
        ${unsafe(cards.map((c) => c.toString()).join(''))}
      </ol>
    </section>`);
}
```

- [ ] **Step 2: Update `renderCard` to accept `{ secret: boolean }` for the mark-secret label**

```typescript
function renderCard(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
  index: number,
  opts: { secret?: boolean } = {},
): RawHtml {
  const { secret = false } = opts;
  // ... existing code ...
  const markSecretLabel = secret ? 'mark public' : 'mark secret';
  // template change:
  // <button class="scrap-tool" type="button" data-action="mark-secret">${markSecretLabel}</button>
  // For secret cards, prefix the id to avoid collision with public items:
  const id = secret ? `secret-item-${index + 1}` : `item-${index + 1}`;
}
```

- [ ] **Step 3: Update `renderScrapbook` to fetch + render secret items + drop zone**

```typescript
export function renderScrapbook(
  ctx: StudioContext,
  site: string,
  path: string,
): RawHtml {
  // ... existing public-items fetch ...
  let secretItems: readonly ScrapbookItem[] = [];
  try {
    const result = listScrapbook(ctx.projectRoot, ctx.config, site, path, { secret: true });
    secretItems = result.items;
  } catch {
    // No secret subdir — empty.
  }
  // ... in the body template:
  //   ${unsafe(cards.map(c => c.toString()).join(''))}
  // </ol>
  // ${renderDropZone()}
  // ${renderSecretSection(ctx, site, path, secretItems)}
  // Update aside totals: secretCount = secretItems.length
}
```

### Task F5.3: Drop zone client wiring

- [ ] **Step 1: Replace `handleUpload` and add drag-and-drop wiring**

```typescript
function wireDropZone(): void {
  const drop = document.querySelector<HTMLElement>('.scrap-drop');
  if (!drop) return;
  // Click → file picker
  drop.addEventListener('click', () => openFilePicker());
  drop.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      openFilePicker();
    }
  });
  // Drag-and-drop
  drop.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    drop.setAttribute('data-dragover', 'true');
  });
  drop.addEventListener('dragleave', () => drop.removeAttribute('data-dragover'));
  drop.addEventListener('drop', (ev) => {
    ev.preventDefault();
    drop.removeAttribute('data-dragover');
    const file = ev.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  });
}

function openFilePicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) uploadFile(f);
  };
  input.click();
}

function uploadFile(file: File): void {
  const { site, path } = readSiteAndPath(document.querySelector('.scrap-aside'));
  const fd = new FormData();
  fd.append('file', file);
  fd.append('site', site);
  fd.append('path', path);
  fetch('/api/dev/scrapbook/upload', { method: 'POST', body: fd }).then((r) => {
    if (r.ok) location.reload();
  });
}
```

- [ ] **Step 2: Add to bootstrap**

```typescript
function init(): void {
  wireFilterChips();
  wireSearch();
  wireCards();
  wireMutations();
  wireDropZone();
  restoreFromHash();
}
```

- [ ] **Step 3: Add CSS for the dragover state**

```css
.scrap-drop[data-dragover="true"] {
  border-color: var(--er-red-pencil);
  background: var(--er-paper-2);
  color: var(--er-red-pencil);
}
```

### Task F5.4: Live verification + commit F5

- [ ] **Step 1: Drive a scrapbook with secret items in playwright at 1440 / 1024 / 768 / 390**

```bash
# Capture screenshots showing the drop zone, secret section, public-cards-then-secret order.
# Test the dragover state by simulating a drag (browser_evaluate with dispatchEvent of DragEvent).
# Click on .scrap-drop; verify the file picker opens.
# Click "mark secret" on a public card; verify the card moves to secret section after reload.
# Click "mark public" on a secret card; verify the card moves to public section after reload.
```

- [ ] **Step 2: `/frontend-design` post-F5 visual review (REQUIRED)**

```
Skill: frontend-design:frontend-design
Args: Review the as-built F5 dispatch (drop zone + secret section) of the scrapbook redesign (Issue #161).

LIVE: scrapbook with both public and secret items; multiple kinds.
SCREENSHOTS: .playwright-mcp/scrapbook-after-f5-* (4 viewports + dragover state + with/without secret items)

WHAT F5 SHIPS: .scrap-drop with click + drag-and-drop; .scrap-secret section rendered conditionally (only when secret items exist); mark-secret toggle moves items between sections.

REQUIRED OUTPUT:
1. Drop zone match: visual treatment (dashed border, mono caps, red-pencil hover) + dragover state (data-dragover styling) match mockup + G3 recommendations.
2. Secret section match: purple stamp, header treatment, "private — never published" badge, mark-public label on the toggle button.
3. Section order: confirm the cards-then-drop-zone-then-secret order (or whatever G3 finalized) reads correctly.
4. Empty state: when scrapbook has 0 items, the drop zone appears prominently; recommend further treatment if needed.
5. Sign-off: "F5 verified — proceed to F6 final sign-off" OR deviations.
```

- [ ] **Step 3: Capture response, resolve, commit F5**

---

## Dispatch F6 — Final integrated design sign-off (REQUIRED before issue closure)

**Goal:** `/frontend-design` walks the integrated implementation against the mockup at all 4 viewports and either signs off the issue as ready for closure, or produces a list of blocking deviations. This dispatch produces no code changes (typically); it produces an audit-trail document and an issue comment with the sign-off.

**Why it exists:** Per the operator's framing, the implementation is not done when the last code-shipping dispatch (F5) lands. It is done when a design-discipline review confirms the integrated result looks like the mockup. Without F6, "I think it matches" replaces "design review confirms it matches," which is exactly the failure mode the verification rule was written to prevent.

**Files (potentially):**
- `docs/superpowers/plans/2026-05-02-scrapbook-redesign-design-reviews.md` — append the F6 sign-off
- `docs/superpowers/plans/2026-05-02-scrapbook-redesign-final-walkthrough.md` (new) — capture the final per-section walkthrough as a durable artifact
- Issue #161 — comment with sign-off OR blocking deviation list

### Task F6.1: Capture full-coverage screenshots at 4 viewports

- [ ] **Step 1: Drive playwright at 1440 / 1024 / 768 / 390**

```bash
# Navigate to a scrapbook with rich content: at least one item per kind (md, img, json, txt) + at least one secret item.
# At each viewport:
#   - Full-page screenshot, no expansion: .playwright-mcp/scrapbook-final-{viewport}-default.png
#   - With md card expanded: .playwright-mcp/scrapbook-final-{viewport}-md-expanded.png
#   - With img card expanded: .playwright-mcp/scrapbook-final-{viewport}-img-expanded.png
#   - With aside list active state on item-3: .playwright-mcp/scrapbook-final-{viewport}-aside-active.png
#   - With drop zone dragover: .playwright-mcp/scrapbook-final-{viewport}-dragover.png
#   - With secret section visible: .playwright-mcp/scrapbook-final-{viewport}-secret.png
```

### Task F6.2: Invoke `/frontend-design` with the integrated brief

- [ ] **Step 1: Send the final-walkthrough brief**

```
Skill: frontend-design:frontend-design
Args: FINAL SIGN-OFF on the integrated scrapbook redesign (Issue #161).

LIVE: http://127.0.0.1:47321/dev/scrapbook/<site>/<path-with-rich-content>
SCREENSHOTS: .playwright-mcp/scrapbook-final-*

MOCKUP: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html

WHAT'S SHIPPED: F1 + F2 + F3 + F4 + F5 — the complete redesign per the spec at docs/superpowers/specs/2026-05-02-scrapbook-redesign-impl-spec.md.

This is the final integrated review. The implementation is considered "shipped to feature/deskwork-plugin" but NOT considered "done" until this review signs off OR produces a blocking-deviations list. The operator will use this review's output to decide whether to close issue #161 (or to request a follow-up dispatch).

REQUIRED OUTPUT:
1. **Section-by-section walkthrough** — for each section of the mockup (folio, page grid, aside chrome, aside numbered list, main header, breadcrumb, search, filter chips, cards grid, card chrome, per-kind ribbons, card head, card meta, per-kind preview at closed AND expanded states, foot toolbar, drop zone, secret section), state: MATCHES / MINOR DEVIATION (description) / MAJOR DEVIATION (description).
2. **Multi-viewport check** — confirm responsive behavior at 1440 / 1024 / 768 / 390 matches mockup intent (single-column collapse, aside stacking, etc.).
3. **Affordance compliance audit** — per .claude/rules/affordance-placement.md: every affordance is component-attached (not toolbar-attached), reveal/hide is symmetric, identical position across modes (n/a — single mode here).
4. **Verification compliance audit** — per .claude/rules/ui-verification.md: all five dispatches have falsifiable measurements in their commit messages; multi-instance tests passed; inner-element inspection passed for styled content.
5. **Final sign-off** — one of:
   - "INTEGRATION VERIFIED — issue #161 ready for operator review and closure."
   - "INTEGRATION INCOMPLETE — blocking deviations: [X, Y, Z]. F6 cannot sign off until these are resolved (in this dispatch or a follow-up F7)."
   - "INTEGRATION COMPLETE WITH FOLLOW-UP — sign-off granted with these non-blocking follow-ups filed as separate issues: [list]."

This sign-off is the gate between "implementation done" and "issue closed." Operator-facing: this output goes verbatim into the #161 fix-landed comment.
```

- [ ] **Step 2: Capture the final walkthrough document**

```bash
# Write the /frontend-design response to docs/superpowers/plans/2026-05-02-scrapbook-redesign-final-walkthrough.md
# Format:
#   # Scrapbook Redesign — F6 Final Walkthrough
#   ## Date / commits-included / viewports tested
#   ## Section-by-section walkthrough
#     ### {section name}: MATCHES / DEVIATION / etc.
#   ## Multi-viewport
#   ## Affordance compliance audit
#   ## Verification compliance audit
#   ## Sign-off
#     <verbatim>
#   ## Follow-up issues filed
#     - [#N] description
```

### Task F6.3: Resolve any blocking deviations (if applicable)

- [ ] **Step 1: If sign-off is "INTEGRATION INCOMPLETE"**

For each blocking deviation:
1. Decide: fix in this dispatch (F6 becomes a code-ship dispatch) OR file as F7 follow-up.
2. If fix-in-dispatch: implement, re-verify per the verification mandate, update the walkthrough doc.
3. If file-as-follow-up: open a GitHub issue with the deviation captured precisely + a screenshot.

- [ ] **Step 2: Re-invoke `/frontend-design` until sign-off is "INTEGRATION VERIFIED"**

The dispatch isn't done until sign-off is unconditional (or "with follow-up" where every follow-up is filed).

### Task F6.4: Commit the walkthrough document + post the #161 fix-landed comment

- [ ] **Step 1: Commit the walkthrough doc**

```bash
git add docs/superpowers/plans/2026-05-02-scrapbook-redesign-final-walkthrough.md \
        docs/superpowers/plans/2026-05-02-scrapbook-redesign-design-reviews.md
git commit -m "docs(plan): scrapbook redesign — F6 final walkthrough + sign-off (#161)"
```

- [ ] **Step 2: Post the fix-landed comment on issue #161**

The comment includes:
- All commit hashes from F1 through F5 (and F6 if it shipped code)
- The verbatim sign-off from `/frontend-design`
- Links to the walkthrough doc + design-reviews notes file
- Multi-viewport screenshots links
- Follow-up issues filed (if any)
- Note that closure stays pending operator verification post-release per the agent-discipline rule

---

## Post-dispatch operations

- [ ] **Update issue #161** with a fix-landed comment per the project rule. Include all 5 commit hashes, before/after measurements, screenshots links, and note that closure stays pending operator verification post-release.
- [ ] **Update README.md status table** with Phase 33++ row capturing F1–F5.
- [ ] **Update DEVELOPMENT-NOTES.md** with the session entry.
- [ ] **Update USAGE-JOURNAL.md** with friction/fix tags as the dispatches surface real frictions.
- [ ] **Run the full studio test suite** post-F5 to confirm no regressions: `npm test --workspace @deskwork/studio --silent` — expect 338 + ~60 new = ~398 passing.
- [ ] **Manual visual walkthrough** by the operator at 4 viewports (1440 / 1024 / 768 / 390) to confirm acceptance against the mockup before issue closure.

## Out of scope for this plan

- **Folio nav extension** (`scrapbook` / `galley` / `desk` rename in `chrome.ts`) — separate concern; spec section 7 explains why. File a follow-up issue if the operator wants this.
- **Drag-to-reorder cards** — mockup doesn't include this.
- **Multi-select / bulk actions** — mockup doesn't include this.
- **Card edit-in-place** — `[data-action="edit"]` button wiring carries over from prior client implementation. If the prior implementation is incomplete, that's a follow-up; this plan doesn't redesign the edit flow.
