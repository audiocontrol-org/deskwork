# Scrapbook Redesign — Implementation Specification

**Issue:** [#161](https://github.com/audiocontrol-org/deskwork/issues/161) — *"Scrapbook UI/UX: Make it look and work like the mockup"*

**Mockup (locked):** [`docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html`](../frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html)

**Date:** 2026-05-02

**Status:** Spec ready for plan-writing

---

## 1. Aesthetic direction (locked, mirrors the existing system)

The scrapbook redesign sits inside the press-check / editorial-print aesthetic the rest of the studio already speaks. **No new aesthetic invention** — the visual vocabulary is fixed by the existing system:

| Layer | Token / family |
|---|---|
| Paper | `--er-paper` (`#F5F1E8`), `--er-paper-2` (`#ECE6D4`), `--er-paper-3` (`#DFD7BF`), `--er-paper-4` (`#C9BFA3`) |
| Ink | `--er-ink`, `--er-ink-soft`, `--er-faded`, `--er-faded-2` |
| Pigments | `--er-red-pencil`, `--er-proof-blue`, `--er-stamp-green`, `--er-stamp-purple`, `--er-highlight` |
| Display type | Fraunces (italic for editorial accents) |
| Body type | Newsreader |
| Mono | JetBrains Mono |
| Surface metaphor | A folder on a desk; cards inside are slips of paper; the aside is the folder's index/cover |

The redesign's *job* is to make the scrapbook surface feel like that folder rather than a generic file listing. Every choice below is in service of that metaphor.

---

## 2. Composition (confirmed; minor refinements only)

The mockup composition is correct. Three refinements before lock:

### 2.1 Single-expanded model for cards

The mockup demo script toggles `data-state="expanded"` per card without coordination — multiple cards can be expanded at once, which causes cascading reflow as the grid recalculates. **Refinement:** opening a card collapses any previously-expanded card. Cleaner mental model (operator focuses on one slip at a time); avoids reflow churn; matches the "press-check desk" framing where one galley is under the lamp.

### 2.2 Aside cross-link active state binds to expanded state, not viewport

The mockup shows `class="active"` on `<a href="#item-1">` as a static state. The implementation drives this dynamically: the aside `<a>` whose `href` matches the currently-expanded card's `id` carries `data-active="true"`. No IntersectionObserver / scrollspy — it's strictly tied to the single-expanded model.

### 2.3 Drop zone is dock-style, not blocking

The mockup `<div class="scrap-drop">` sits at the end of the cards grid as a `role="button"`. The visual treatment (`2px dashed var(--er-faded-2)`) is right; the affordance also accepts drops via the `dragover` / `drop` events (or click-to-pick-file). Keeps the affordance attached to the surface it loads INTO (per `affordance-placement.md`).

These three refinements are the only changes from the mockup as drawn. The rest of the composition (page grid, aside chrome, card chrome, foot toolbar, per-kind preview, filter chips, search, secret section) ships verbatim.

---

## 3. Markup tree (the new shape)

### 3.1 Page-level

```html
<body data-review-ui="scrapbook">
  <!-- folio (existing, rendered by chrome.ts) -->
  <div class="er-folio">…</div>

  <main class="scrap-page">
    <aside class="scrap-aside">…</aside>
    <section class="scrap-main">
      <header class="scrap-main-header">
        <nav class="scrap-breadcrumb">…</nav>
        <div class="scrap-search">…</div>
      </header>
      <div class="scrap-filters" role="toolbar">…</div>
      <ol class="scrap-cards" id="cards">…</ol>
      <div class="scrap-drop" role="button">…</div>
      <section class="scrap-secret">…</section>
    </section>
  </main>
</body>
```

`.scrap-page` is the two-track grid: `17rem 1fr` (aside fixed-width on left, main fills). At `<= 64rem` viewport the grid collapses to a single column (`1fr`), aside loses `position: sticky` and stacks above main.

### 3.2 Aside

```html
<aside class="scrap-aside">
  <p class="scrap-aside-kicker"><em>§</em> The folder</p>
  <h1 class="scrap-aside-title">{folder-slug}</h1>
  <p class="scrap-aside-meta">{site}</p>
  <hr />
  <p class="scrap-aside-totals">
    <strong>{public-count}</strong> public ·
    <strong>{secret-count}</strong> secret ·
    <em>{total-size}</em>
  </p>
  <p class="scrap-aside-meta">last modified {relative-time}</p>
  <hr />
  <ol class="scrap-aside-list">
    <li><span class="num">{seq}</span><a href="#item-{seq}">{filename}</a></li>
    …
  </ol>
  <hr />
  <div class="scrap-aside-actions">
    <button class="scrap-aside-btn scrap-aside-btn--primary" data-action="new-note">+ new note</button>
    <button class="scrap-aside-btn" data-action="upload">+ upload file</button>
  </div>
  <hr />
  <p class="scrap-aside-path">{full-path}</p>
</aside>
```

The aside is **server-rendered** with all data populated at request time. The `data-active` flip on the `<a>` is the ONLY client-side state. `position: sticky; top: calc(var(--er-folio-h) + var(--er-space-3))` so it follows the page on scroll without overlapping the folio.

### 3.3 Card

```html
<li class="scrap-card" data-kind="{md|img|json|txt|other}" data-state="closed" id="item-{seq}">
  <div class="scrap-card-head">
    <span class="scrap-seq">N° {seq:02d}</span>
    <span class="scrap-name" data-action="open">{filename}</span>
    <time class="scrap-time" datetime="{iso}">{relative-time}</time>
  </div>
  <div class="scrap-card-meta">
    <span class="scrap-kind scrap-kind--{kind}">{KIND_LABEL}</span>
    <span class="scrap-size">{size}</span>
    <span>·</span>
    <span>{kind-specific-meta}</span>
  </div>
  <{preview-element} class="scrap-preview scrap-preview-{kind-classifier}">
    {kind-specific-preview-content}
  </{preview-element}>
  <div class="scrap-card-foot">
    <button class="scrap-tool scrap-tool--primary" data-action="open">open</button>
    <button class="scrap-tool" data-action="edit">edit</button>
    <button class="scrap-tool" data-action="rename">rename</button>
    <button class="scrap-tool" data-action="mark-secret">{mark-secret-label}</button>
    <span class="spacer"></span>
    <button class="scrap-tool scrap-tool--delete" data-action="delete">delete</button>
  </div>
</li>
```

`scrap-card::before` renders the per-kind colored top ribbon (4px high, full-width, kind-coded background). The card is `display: flex; flex-direction: column` so head → meta → preview → foot stack vertically.

The `mark-secret-label` is `"mark secret"` for public items and `"mark public"` for secret items (the action toggles).

`edit` is omitted from `img` cards (no in-place editor for binary).

### 3.4 Per-kind preview rendering

| Kind | Preview element | Class | Content |
|---|---|---|---|
| `md` | `<div>` | `.scrap-preview .scrap-preview-md` | First paragraphs of file content rendered as italic Newsreader excerpt; `-webkit-line-clamp: 5` in closed state, unclamped in expanded. Server strips frontmatter, converts to plain text, truncates to 5 visual lines. |
| `img` | `<div class="scrap-preview scrap-preview--img"><div class="scrap-preview--img-frame" style="background-image:..."></div></div>` | `.scrap-preview--img` | `aspect-ratio: 4/3` div with `background-image: url(/api/dev/scrapbook-file?...)`, `background-size: cover`. In expanded state, the inner frame's aspect-ratio is unset and the natural-size image is shown via `<img src>`. |
| `json` / `txt` | `<pre>` | `.scrap-preview .scrap-preview--mono` | Mono-rendered file content; in closed state max-height clamped via `-webkit-line-clamp` or fixed-height with overflow hidden; in expanded state full content visible with `overflow: auto`. |
| `other` | `<div>` | `.scrap-preview` (no kind suffix) | Empty / "no preview available" placeholder. The kind chip + size in `.scrap-card-meta` is enough information. |

Server reads file contents in `renderItem()` for md/json/txt; for img it just emits the URL (no body fetch). This is essentially the existing `renderItemPeek()` logic — just renamed and slightly restructured to match mockup classes.

### 3.5 Card meta — kind-specific extra info

| Kind | `{kind-specific-meta}` |
|---|---|
| `md` | `{N} lines` |
| `img` | `{W} × {H}` (image dimensions, parsed from file metadata; falls back to file size only if dimensions unavailable) |
| `json` | `{N} keys` (top-level key count) |
| `txt` | `{N} lines` |
| `other` | (omit; just kind chip + size) |

This is new server-side info; existing scrapbook listing doesn't extract dimensions/key-counts. Implementation note: image dimensions via `image-size` package or similar; JSON key count via parse-then-count. Wrap in try/catch with sensible fallback to size-only on parse error.

---

## 4. Migration approach: replace, don't morph

**Decision: rebuild `scrapbook.ts` and `scrapbook.css` from scratch in Dispatch F1, replacing the existing markup tree.** Not a class rename, not an incremental morph.

**Why:**
- The markup tree is structurally different (vertical card chrome vs horizontal grid; aside-left vs aside-right; numbered item list; foot toolbar; drop zone; secret section). An incremental migration would require N intermediate half-states, none of which are coherent shapes the operator can verify.
- Class rename without structural change leaves stale `.scrapbook-*` selectors in client TS / tests that reference layout details that no longer apply. Renaming-then-restructuring is two confused passes.
- The feature surface is contained: ONE page (`/dev/scrapbook/<site>/<path>`); the standalone scrapbook viewer markup is referenced from `scrapbook-client.ts` only. Migration risk is bounded.
- Per the project's rule against "garbage turds" — partial migration that leaves dual selectors / dual classes / dead branches IS the failure mode. A clean rebuild is the antidote.

**Preservation contract:** the rebuild MUST preserve all working behavior:
- Filter chips (kind-coded `all/md/img/json/txt/other`, with per-kind counts) — re-rendered into `.scrap-filters` markup with `.scrap-filter` class
- Search input + `/` keyboard shortcut — re-rendered into `.scrap-search` markup
- `data-state="expanded"` → `grid-column: 1 / -1` model — same mechanic, applied to `.scrap-card`
- Always-on per-kind peeks — refined into the new `.scrap-preview-*` family with kind-specific styling
- `position: sticky` aside (existing was sticky on right; new is sticky on left; same mechanic)
- Server-side image serving via `/api/dev/scrapbook-file?…` — endpoint unchanged; only the consuming markup updates
- Mutation endpoints (`POST /api/dev/scrapbook/{rename,save,delete,mark-secret,upload}`) — unchanged; only the calling code in `scrapbook-client.ts` updates to match new button selectors

**Non-preservation (intentional drops):**
- The existing horizontal-row `.scrapbook-item-header { grid-template-columns: 3rem 3.5rem 1fr auto auto }` chrome — replaced by vertical card chrome.
- The hover-revealed `.scrapbook-toolbar` — replaced by always-visible `.scrap-card-foot`.
- The `data-state="deleting"` placeholder — preserved if needed, or refactored into a `.scrap-card[data-state="deleting"]` styling.
- The legacy `.scrapbook-perforation` dashed separator — replaced by the new card border + per-kind ribbon.
- The disclosure-arrow `.scrapbook-disclosure` — the open/close affordance is now `.scrap-name` click + `.scrap-tool--primary[data-action="open"]` button, mirroring the mockup. No dedicated disclosure arrow; the card name IS the affordance (clickable, with hover treatment).

---

## 5. Data-state model

**Card states:**
- `data-state="closed"` (default) — chrome + clamped preview + foot toolbar visible.
- `data-state="expanded"` — `grid-column: 1 / -1`; preview unclamped (full content); shows additional reveal where applicable (full image at natural size; full json/txt with overflow scroll). Foot toolbar still visible.
- `data-state="deleting"` (transient) — opacity dimmed during the delete animation; carry forward from existing implementation if useful, otherwise drop.

**Single-expanded invariant:** at most one card has `data-state="expanded"` across the page (refinement 2.1). When the operator opens a new card, the client first transitions any previously-expanded card to closed, then transitions the target to expanded, then `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.

**Activation surfaces (all dispatch through one client handler `toggleCard(card)`):**
- `.scrap-name` click — primary, aligns with mockup.
- `[data-action="open"]` button click — explicit redundant affordance.
- Aside `<a href="#item-N">` click — opens that card; preventDefault on hash anchor; updates the card's state.
- (Keyboard discoverability not specified by mockup; not in scope for F-series.)

**URL hash sync:** when a card opens, the browser's URL hash updates to `#item-N`. When the page loads with a hash, that card opens automatically (initial state restoration). No history-API churn; just `window.location.hash = …`.

**Aside active-state binding:** when a card transitions to expanded, the corresponding aside `<a>` gets `data-active="true"`; the previously-active one loses it. CSS rule on `[data-active="true"]` does the visual treatment (red-pencil color + dotted-underline border).

---

## 6. Aside numbered list — server data + client behavior

**Server (`scrapbook.ts`):** when listing items, generate the aside `<ol>` from the same `ScrapbookItem[]` data already used to render the cards. Each `<li>` carries the sequence number (zero-padded for display, e.g. `01`, `02`) + `<a href="#item-N">{filename}</a>`. Filenames truncate visually via CSS `text-overflow: ellipsis` if they overflow the 17rem column, but the full name shows on hover (`title` attribute or tooltip).

**Client (`scrapbook-client.ts`):**
- Wire aside `<a>` clicks → preventDefault + `toggleCard(targetCard)` (calls the same handler as the in-card affordances).
- Sync `data-active` on the corresponding aside `<a>` whenever a card opens.
- On initial page load, if `window.location.hash` matches an item, open that card and sync the aside.

The aside list is **not** a scrollspy. Active state is bound strictly to the single-expanded card. If no card is expanded, no aside `<a>` is active.

---

## 7. Folio nav extension — OUT OF SCOPE for this dispatch

The mockup folio shows `desk · content · shortform · scrapbook · galley · manual` (active: scrapbook). The live folio shows `index · dashboard · content · shortform · manual`.

**Recommendation: scope this OUT of the scrapbook redesign and address as a separate concern.**

Reasons:
1. **Project-wide impact.** Folio nav is rendered by `chrome.ts` for every studio surface (dashboard, content, shortform, manual, scrapbook, longform review). Changing it touches every page's snapshot tests + visual treatment.
2. **Naming choices need their own design conversation.** `dashboard` → `desk`? Add `galley`? Add `scrapbook`? Each is a vocabulary decision with project-level implications. The scrapbook redesign isn't the right moment to decide.
3. **"Scrapbook" in folio nav has unresolved scope.** There is no single "the scrapbook" — there's one per content tree node. A folio link to scrapbook needs to either go to a scrapbook *index* (which doesn't exist) or to a default-pick-the-first scrapbook (which is arbitrary). Both deserve scoping.
4. **The scrapbook surface is still navigable without the folio link.** From the dashboard or content view, operators click into a content tree node and reach the scrapbook via the existing `/dev/scrapbook/<site>/<path>` route. The folio nav extension would be convenience, not necessity.

**Action:** file a separate issue (or amend #161 with a note) that the folio nav extension is scoped out and needs its own design pass. Whoever picks it up can read this section and the mockup as input.

---

## 8. Dispatch decomposition

Five dispatches, F1 large and the rest small, sized so each lands as one coherent commit. Naming follows the project's `Dispatch X` convention from issue #154.

### Dispatch F1 — Page rebuild + new markup tree (large)

**Scope:** rewrite `packages/studio/src/pages/scrapbook.ts` + `plugins/deskwork-studio/public/css/scrapbook.css` from scratch using the mockup's markup tree and class names. Migrate the existing client logic (`scrapbook-client.ts`) to the new selectors.

Includes:
- Page grid swap (aside-LEFT, main-RIGHT)
- Card chrome (vertical layout: head → meta → preview → foot)
- Per-kind colored top ribbons via `.scrap-card::before`
- Card foot toolbar (always-visible per-card actions)
- Filter chips (preserved behavior; new class names `.scrap-filter`)
- Search input + `/` shortcut (preserved behavior; new class `.scrap-search`)
- Per-kind preview classes (`.scrap-preview-md`, `.scrap-preview--img`, `.scrap-preview--mono`)
- `data-state="closed"` default with toggle to `data-state="expanded"`
- All press-check tokens consumed correctly
- Tests rewritten to assert the new markup contract

Does NOT yet include:
- Aside numbered item list (placeholder only — aside still has totals + actions + path)
- Aside cross-linking
- Single-expanded invariant (multiple-expanded still possible)
- Drop zone
- Secret section
- Per-kind extra meta (md lines, img dimensions, json keys)

**Acceptance:** live page at `/dev/scrapbook/{site}/{path}` renders with the new visual composition; click on a card name expands it; click on filter chip filters; `/` focuses search; aside is on the LEFT.

**Verification (per `ui-verification.md`):** drive the page in playwright at 1440 / 1024 / 768 / 390 widths; measure aside.left ≈ 0–16, main.left > aside.right; capture before/after screenshots; assert filter chips + search + expand still functional.

**Rough size:** ~400 lines CSS, ~300 lines server TS, ~150 lines client TS, ~150 lines tests.

### Dispatch F2 — Per-kind preview refinement (small)

**Scope:** refine the per-kind preview rendering to match the mockup exactly.

Includes:
- Md preview: italic Newsreader, 0.95rem, line-clamp 5; expanded state unclamps and bumps to 1rem.
- Img preview: aspect-ratio 4/3 frame in closed state with `background-image: url(...)`; expanded state shows full `<img>` at natural size with `max-width: 100%`.
- Json/txt preview: mono `<pre>` with `--er-paper-2` background, 0.78rem, line-clamp ~6; expanded state unclamps with overflow scroll.
- Server-side excerpt extraction: strip frontmatter (md), truncate at line/byte limit, escape HTML.

**Acceptance:** each of the four kinds renders distinctively per the mockup; expanded state shows the full content where applicable; server doesn't fail on edge-case files (zero-byte, binary masquerading as text, json parse error, etc.).

**Rough size:** ~80 lines CSS, ~120 lines server TS, ~50 lines tests.

### Dispatch F3 — Aside numbered item list + per-kind extra meta (small)

**Scope:** populate the aside `<ol class="scrap-aside-list">` with the full numbered item list. Add per-kind extra meta (md lines, img dimensions, json keys) to `.scrap-card-meta`.

Includes:
- Server: gather item dimensions / line counts / key counts when building the page model; pass into both card meta and aside list.
- Markup: aside `<ol>` server-rendered with one `<li>` per item linking to the corresponding card's anchor.
- Truncation: long filenames truncate via CSS in the aside; full name on hover.

**Acceptance:** aside lists every item in the scrapbook with its sequence number; each `<a>` href matches an `id` on a card; per-kind extra meta is present and accurate.

**Rough size:** ~50 lines CSS, ~100 lines server TS, ~30 lines tests.

### Dispatch F4 — Aside cross-linking + single-expanded invariant + URL hash sync (small)

**Scope:** wire the dynamic state binding the aside list to the card grid.

Includes:
- Client: `toggleCard(targetCard)` handler called by `.scrap-name` click, `[data-action="open"]` click, AND aside `<a>` click.
- Single-expanded invariant: opening a new card collapses any currently-expanded card.
- `data-active="true"` flip on the corresponding aside `<a>` whenever a card opens; remove on close.
- URL hash sync: `window.location.hash = '#item-N'` when a card opens; on initial page load with a hash, open that card.
- `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` on expand.

**Acceptance:** clicking an aside item opens the matching card and scrolls to it; the aside item shows active styling while the card is expanded; opening a different card automatically collapses the previous one; URL hash reflects current state and survives reload.

**Rough size:** ~40 lines CSS, ~120 lines client TS, ~80 lines tests.

### Dispatch F5 — Drop zone + secret section (small)

**Scope:** add the end-of-grid drop zone and the dedicated secret subsection.

Includes:
- `.scrap-drop` element at the end of the cards grid: dashed border, mono caps label `── drop a file here, or pick one ──`. Click triggers a hidden `<input type="file">`. Drop event accepts files via the same upload endpoint as the aside `+ upload file` button.
- `.scrap-secret` section between the public cards and the drop zone (or below; mockup shows below the cards but above the drop zone — adjust if needed). Renders only when there's at least one secret item. Has its own header with stamp glyph + "Secret · private — never published" badge. Items use the same `.scrap-card` template; the foot toolbar's `mark-secret` button shows label `"mark public"` instead of `"mark secret"`.

**Acceptance:** drop zone accepts file drops and click-to-pick; secret section appears only when secret items exist; toggling an item between public and secret moves it between the two sections without page reload.

**Rough size:** ~80 lines CSS, ~80 lines server TS, ~120 lines client TS, ~60 lines tests.

---

## 9. Affordance compliance check

Per `.claude/rules/affordance-placement.md`, every affordance in this design must satisfy:
1. Component-attached over toolbar-attached for per-component state.
2. Symmetric reveal/hide pattern.
3. Identical physical position across modes (n/a here — scrapbook is single-mode).
4. Reference an existing project pattern.

Audit:

| Affordance | Where attached | Pattern mirrored | Compliant? |
|---|---|---|---|
| Card open/close | `.scrap-name` click + `.scrap-tool--primary[data-action="open"]` in `.scrap-card-foot` | Card-component-attached; foot toolbar is part of card chrome. | ✓ |
| Per-card edit / rename / mark-secret / delete | `.scrap-card-foot` buttons | Card-component-attached. | ✓ |
| Filter chips | `.scrap-filters` row above the cards grid | Toolbar-style for cross-card filtering — this IS app-level / cross-component, so toolbar is correct. | ✓ |
| Search input + `/` shortcut | `.scrap-main-header` next to breadcrumb | Toolbar-style for cross-card search — same reasoning as filters. | ✓ |
| Aside `+ new note` / `+ upload file` | `.scrap-aside-actions` inside `.scrap-aside` | Aside-component-attached (the aside IS the folder; these are folder-level actions). | ✓ |
| Aside item list (cross-link to card) | `.scrap-aside-list` inside `.scrap-aside` | Aside-component-attached; cross-link is a navigation affordance. | ✓ |
| Drop zone | `.scrap-drop` at end of `.scrap-main` | Adjacent to the cards grid (the surface drops load INTO). Not in a toolbar. | ✓ |
| Card expand affordance | Card name itself (`.scrap-name`) + redundant `data-action="open"` button | Card-component-attached. The card IS the affordance. | ✓ |

No anti-patterns. Filter chips and search are NOT subject to the "component-attached" rule — they're cross-component / app-level toolbars by definition (filtering across many cards is not a per-card concern).

---

## 10. Verification protocol per dispatch

Per `.claude/rules/ui-verification.md`, every dispatch ships with:

1. **Live drive** at 1440×900 of `/dev/scrapbook/{site}/{path}` — measurements before/after for the specific change.
2. **Multi-instance test** — verify on at least two scrapbooks. If only one exists in this project, create a fixture or test on another file (e.g. a richer one with multiple kinds).
3. **Multi-viewport** — 1440 / 1024 / 768 / 390 (the project's standard breakpoints) when the change affects layout.
4. **Inner-element inspection** for any styled markdown / code / preview rendering — sample inner spans, not just line containers.
5. **Falsifiable claim format** in commit message: exact selector + measured value (before / after).
6. **One fix per commit** — F1's big rebuild is one coherent commit; F2-F5 each land as one commit.

Dispatch reports on issue #161 should follow the same format as the #155 fix-landed comment (recorded measurement + scrolled-state confirmation + screenshots).

---

## 11. Constraints + risks

### 11.1 Don't break the surface mid-rebuild

F1 is one big commit because the surface can't render half-old / half-new markup. The build before F1 lands has the OLD markup; the build after has the NEW. Tests are updated in the same commit. The CI checks must pass (vitest is fast — 2-3s for the studio suite).

### 11.2 Server data shape changes

Dispatches F2 and F3 add new data the server needs to compute (md line counts, img dimensions, json key counts). For img dimensions specifically: `image-size` (or equivalent npm package) is already in the dep tree if it isn't, accepting a new dep needs operator confirmation. Risk: parsing user-uploaded images can throw; wrap in try/catch with size-only fallback.

### 11.3 Filename anchors

Card `id="item-{seq}"` uses sequence number, not filename. This is intentional — filenames may contain characters that break HTML anchors (spaces, parens, hashes). Sequence numbers are 1-indexed and stable per page-render. The aside `<a href="#item-N">` matches.

If sequence numbers change between renders (e.g., a file is added or removed), the aside cross-link may temporarily point at a different card after the page re-renders. Acceptable: no in-place mutation of the cards grid happens without a full server round-trip in the current architecture.

### 11.4 Single-expanded vs operator preference

Refinement 2.1 imposes single-expanded. If the operator wants multi-expanded later (e.g., to compare two cards side-by-side), the change is `if (current === expanded) skip-collapse-step` in `toggleCard()`. Backwards-compatible refinement.

### 11.5 Test coverage

Tests should assert structural contracts (markup tree shape, class presence, data-state values, ARIA attributes) and behavioral contracts (filter chips toggle, search focuses on `/`, expand-state model). They should NOT assert pixel positions (those drift); use `getBoundingClientRect()` only as a smoke check that elements are visible (`width > 0`).

---

## 12. What this spec deliberately doesn't cover

- **The aesthetic.** Already locked. The spec inherits it from the existing system.
- **Folio nav extension.** Out of scope (Section 7).
- **Backwards-compat shims.** Per project rule against "garbage turds": no dual selectors, no compat aliases, no deprecation warnings. The rebuild replaces the old surface cleanly.
- **Performance optimization.** Cards render server-side with full content for md/json/txt; the only fetch is for img URLs. No virtualization needed at expected scrapbook sizes (≤100 items typical). If a scrapbook ever has 500+ items, that's a separate scope.
- **Drag-to-reorder.** Mockup doesn't include this. Out of scope.
- **Multi-select / bulk actions.** Mockup doesn't include this. Out of scope.

---

## 13. References

- Mockup: [`scrapbook-redesign.html`](../frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html)
- Issue: [#161](https://github.com/audiocontrol-org/deskwork/issues/161)
- Project rules: [`affordance-placement.md`](../../../.claude/rules/affordance-placement.md), [`ui-verification.md`](../../../.claude/rules/ui-verification.md)
- Reference patterns: `.er-outline-tab` (pull-tab), `.er-marginalia-tab` (pull-tab), `.er-scrapbook-drawer` (drawer with own collapse affordance) — all in [`editorial-review.css`](../../../plugins/deskwork-studio/public/css/editorial-review.css)
- Live page (current state): http://localhost:47321/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan
- Existing implementation: [`packages/studio/src/pages/scrapbook.ts`](../../../packages/studio/src/pages/scrapbook.ts), [`plugins/deskwork-studio/public/css/scrapbook.css`](../../../plugins/deskwork-studio/public/css/scrapbook.css), [`plugins/deskwork-studio/public/src/scrapbook-client.ts`](../../../plugins/deskwork-studio/public/src/scrapbook-client.ts)
