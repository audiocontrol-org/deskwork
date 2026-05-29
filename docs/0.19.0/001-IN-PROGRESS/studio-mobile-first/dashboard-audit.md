---
audit-of: dashboard
captured: 2026-05-09
superseded-by: ../../../../DESKWORK-STATE-MACHINE.md
status: historical
sources:
  - packages/studio/src/pages/dashboard.ts
  - packages/studio/src/pages/dashboard/data.ts
  - packages/studio/src/pages/dashboard/section.ts
  - packages/studio/src/pages/dashboard/affordances.ts
  - packages/studio/src/pages/dashboard/header.ts
  - packages/studio/src/pages/dashboard/press-queue.ts
  - packages/studio/src/server.ts
  - packages/studio/src/pages/chrome.ts
  - plugins/deskwork-studio/public/css/editorial-studio.css
  - plugins/deskwork-studio/public/css/editorial-review.css
  - plugins/deskwork-studio/public/css/editorial-nav.css
---

> **Superseded notice (2026-05-09):** several findings in this audit describe behaviors that have since been retired per `DESKWORK-STATE-MACHINE.md`. Specifically: the iterate-button's `reviewState === 'iterating'` gate (Commandment II violation), the per-row `iteration: N` display (Commandment III violation), the `renderReviewStateBadge` helper, and the press queue (review-state-driven; deleted entirely in v0.19). The audit is retained as a historical snapshot of the dashboard's state at the time of the v0.19 mobile-first design audit; for current dashboard behavior, read the source code directly. The state-machine spec is the canonical reference.

# Dashboard Audit — Phase 1 Task 1.1.1

## 1. Route + Entry Point

The dashboard is registered at `packages/studio/src/server.ts:239`:

```
app.get('/dev/editorial-studio', async (c) => { ... })
```

The handler first attempts a per-project template override via `runTemplateOverride(ctx, 'dashboard', [ctx, getIndex])` (server.ts:245-249). When no override exists, it calls `renderDashboard(ctx, getIndex)` from `packages/studio/src/pages/dashboard.ts:53`. The function is async because sidecar reads hit disk (`dashboard.ts:60`).

Two redirect aliases exist: `GET /dev/editorial-review` and `GET /dev/editorial-review/` both redirect to `/dev/editorial-studio` (server.ts:233-234).

CSS loaded by the layout call at `dashboard.ts:87-91`:
- `/static/css/editorial-review.css`
- `/static/css/editorial-nav.css`
- `/static/css/editorial-studio.css`

Client script: `editorial-studio-client` (dashboard.ts:94). Body attribute: `data-review-ui="studio"` (dashboard.ts:93).

## 2. Per-Row Data Shape

`loadDashboardData` at `data.ts:52-56` calls `readAllSidecars(projectRoot)` and bucketizes into `DashboardData`:

```typescript
interface DashboardData {
  readonly entries: readonly Entry[];
  readonly byStage: ReadonlyMap<Stage, readonly Entry[]>;
}
```
(data.ts:32-35)

Fields consumed per row by `renderRow` in `section.ts:51-81`:

| Field | Usage |
|---|---|
| `entry.slug` | Linked display name; search token; scrapbook URL path segment |
| `entry.title` | Secondary label in `.er-calendar-title` |
| `entry.uuid` | Review surface URL, scrapbook URL (`entryId`), `data-uuid` attribute |
| `entry.currentStage` | Stage chip filtering, action branching, `data-stage` attribute |
| `entry.iterationByStage[currentStage]` | Iteration count badge (`affordances.ts:40-42`) |
| `entry.reviewState` | Status badge visibility; conditional iterate button |
| `entry.updatedAt` | `<time>` element, press-queue sort axis |
| `entry.keywords` | Concatenated into `data-search` for client-side text filter |

Buckets are sorted by slug (localeCompare) per stage at `data.ts:47`. Entries with slugs containing `/` get a `data-depth` attribute and `--er-row-depth` CSS custom property computed as `slug.split('/').length - 1` (section.ts:57-61).

## 3. Per-Row Affordance Inventory

All affordances rendered by `renderRowActions` in `affordances.ts:63-123`.

**Linear active stages (Ideas / Planned / Outlining / Drafting / Final):**

- `open →` — `<a>` link to `/dev/editorial-review/entry/<uuid>` (affordances.ts:86-87)
- `iterate →` — `<button data-copy="/deskwork:iterate <slug>">` — visible only when `reviewState === 'iterating'` (affordances.ts:88-92)
- `approve →` — `<button data-copy="/deskwork:approve <slug>">` — unconditional on active-pipeline rows; formerly gated on `reviewState === 'approved'` (affordances.ts:100-102, comment at 93-99)
- `cancel ⊘` — `<button data-copy="/deskwork:cancel <slug>">` — reversible via induct (affordances.ts:105-107)

**Published stage:**

- `view →` — `<a>` link to the review surface, read-only framing (affordances.ts:109-110)

**Blocked / Cancelled stages:**

- `induct →` — `<button data-copy="/deskwork:induct <slug>">` (affordances.ts:112-114)

**All stages:**

- `scrapbook ↗` — `<a href="<scrapbookViewerUrl>">` with `data-action="open-scrapbook"` (affordances.ts:118-120). URL built via `scrapbookViewerUrl({site: defaultSite, path: entry.slug, entryId: entry.uuid})` — UUID threading added by #205.

All `data-copy` buttons use the existing `editorial-studio-client` clipboard handler. No new server handlers wired.

**Status cell** (separate from actions, rendered by `renderStatusCell` at section.ts:162-170):

- When `entry.reviewState !== undefined`: `<span class="er-calendar-status"><a class="er-stamp-link" href="<reviewLink>"><span class="er-stamp er-stamp-<state>">...</span></a></span>`
- When `entry.reviewState === undefined`: empty `<span class="er-calendar-status" aria-hidden="true"></span>` (see section 7)

## 4. Masthead Structure

Rendered by `renderHeader` at `header.ts:36-68`. Element: `<header class="er-pagehead er-pagehead--centered er-pagehead--dashboard">`.

Children in order:

1. `.er-pagehead__kicker` — `Vol. 01 · № <entry-count>` (volume is hardcoded `'01'` at header.ts:41)
2. `h1.er-pagehead__title` — literal text `Press-Check` with `<em>` on `Press-`
3. `.er-pagehead__deck` — `Project: <code><projectRoot></code>` + link to `/dev/editorial-help` + studio version span (`data-studio-version`)
4. `.er-pagehead__meta` — inline stats: date · total entries · in-review count (includes `iterating`) · approved count

Immediately below the masthead (rendered by `renderFilterStrip` at header.ts:70-83, placed before `.er-layout` in `dashboard.ts:73`):

- `<section class="er-filter" data-filter-strip>` containing:
  - Text label "Find"
  - `<input type="search" data-filter-input>` with placeholder "slug, title…"
  - Text label "Stage" (with `.er-filter-label--gap` margin)
  - `<div class="er-chips" role="tablist">` with one chip per stage plus an "all" chip

The `.er-layout` grid (`editorial-review.css:379-387`) is `2fr 1fr`, placing stage sections on the left and the press queue on the right.

## 5. CSS Files and Rough Sizes

| File | Lines | Scope |
|---|---|---|
| `plugins/deskwork-studio/public/css/editorial-review.css` | 4926 | Base design system: tokens, folio, layout primitives, shared row chrome, review surfaces |
| `plugins/deskwork-studio/public/css/editorial-studio.css` | 527 | Dashboard-specific: calendar rows, press queue, masthead compression, row reshape, filter strip, shortform matrix |
| `plugins/deskwork-studio/public/css/editorial-nav.css` | 405 | Folio strip + studio index navigation |

No dashboard-specific CSS file separate from `editorial-studio.css` exists. That file is scoped by comment to "the two `/dev/editorial-studio` routes" (editorial-studio.css:1-5).

## 6. Filter Chips / Segments / State

The filter strip (header.ts:70-83) renders client-side controls with no server round-trip:

- `<input type="search" data-filter-input>` — text filter; client reads `data-search` attributes on `.er-calendar-row-wrap` and `.er-calendar-row` elements; toggling `[hidden]` on rows (editorial-studio.css:18: `.er-calendar-row[hidden] { display: none !important }`)
- Stage chip buttons: one per stage plus "all". `data-stage-chip="<stage>"` attributes. Initial state has the "all" chip with `aria-pressed="true"` (header.ts:77). The `editorial-studio-client` handles chip click → section show/hide.

The chips container uses `role="tablist"` but individual chips do not carry `role="tab"` — the ARIA pattern is incomplete.

## 7. Em-Dash / Mystery-Box Branch (#243)

Two layers exist:

**Layer 1 — `renderReviewStateBadge` in `affordances.ts:26-30`:**
The function signature accepts `ReviewState | undefined`. When `state === undefined`, it returns:
```
<span class="er-stamp er-stamp-none" data-review-state="none">—</span>
```
The JSDoc comment at affordances.ts:22-25 still says this em-dash is the grid-alignment placeholder for pre-review entries.

**Layer 2 — `renderStatusCell` in `section.ts:162-170`:**
`renderStatusCell` gates the call. When `entry.reviewState === undefined`, it returns an empty span (`aria-hidden="true"`) directly, without calling `renderReviewStateBadge` at all (section.ts:163-165). Only when `reviewState` is defined does it call `renderReviewStateBadge` (section.ts:166-169) — at which point `state` is never `undefined` in that call.

**Conclusion:** The em-dash code path in `affordances.ts:27-29` is unreachable from the dashboard's `renderStatusCell` as of the #243 fix. The JSDoc comment at affordances.ts:22-25 is stale. `renderReviewStateBadge` is exported and could be called directly by other consumers with `undefined` — the em-dash branch remains live as a public API detail.

## 8. One-Word-Per-Line Collapse Cause (#237)

The desktop base rule at `editorial-studio.css:8-14`:

```css
.er-calendar-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  ...
}
```

At narrow widths, the two `auto` end columns (`.er-calendar-status` and `.er-calendar-action`) consume their intrinsic widths first. With multiple action buttons, `.er-calendar-action` alone can consume 200-300px. The `minmax(0, 1fr)` body column receives the remainder — at 375px viewport it can collapse to ~80-120px. Since `.er-calendar-body` uses `display: flex; flex-wrap: wrap` (editorial-studio.css:49-56), each word in the slug, title, and meta falls to its own line.

The CSS comment at `editorial-studio.css:468-471` explicitly documents this: "At <= 600px the two `auto` end columns (status + actions) eat enough horizontal budget that `body` collapses to ~120px, and every word in slug/title/meta wraps onto its own line."

The fix at `editorial-studio.css:481-525` (`@media (max-width: 600px)`) reshapes to:
```css
.er-calendar-row {
  grid-template-columns: auto auto;
  grid-template-areas:
    "num    status"
    "body   body"
    "action action";
}
```
Body and action both span full width. Slug overflow handled by `overflow-wrap: anywhere; word-break: break-word` on `.er-row-slug` and `.er-row-slug a` (editorial-studio.css:511-515).

## 9. Pre-Existing Mobile Chrome

The dashboard is **desktop-first** in its base rules. Mobile overrides exist at three breakpoints:

| Breakpoint | File:Line | What it does |
|---|---|---|
| `max-width: 960px` | editorial-review.css:385-387 | `.er-layout` collapses from `2fr 1fr` to `1fr` (two-column → single-column; press queue stacks below stage sections) |
| `max-width: 60rem` | editorial-studio.css:399-404 | Press queue loses `position: sticky` and `max-height` (so it doesn't get clipped when stacked) |
| `max-width: 600px` | editorial-studio.css:420-463 | Masthead compression (#238): kicker, title, deck hidden; meta strip wraps; filter labels hidden; chips font shrinks |
| `max-width: 600px` | editorial-studio.css:481-525 | Row reshape (#237): 4-col grid → 3-row stacked grid; slug/action get full width; hierarchical indent removed |

There are no `min-width` (mobile-first) rules in either file for dashboard-specific concerns. The approach is desktop-first with `max-width` overrides. The two 600px blocks are separate `@media` declarations (one for masthead, one for rows) rather than merged.

## 10. Notable Surprises

**`STAGE_ORNAMENTS` duplicated.** The same ornament map (`Ideas: '◇'`, `Planned: '§'`, etc.) is defined identically in both `section.ts:20-29` and `press-queue.ts:18-27`. Not imported from a shared constant.

**`defaultSite` voided in press-queue item renderer.** At `press-queue.ts:58`, `void defaultSite` explicitly discards the parameter. The multi-site case is acknowledged in `affordances.ts:67-71` as out of scope, but the press queue item doesn't even build a scrapbook link — it links only to the review surface. Symptom: press-queue items have no scrapbook entry point.

**Volume hardcoded to `'01'`.** `header.ts:41` sets `const volume = '01'`. It never increments.

**`issueNum` is total entry count, not a sequential issue number.** `header.ts:42` uses `data.entries.length` padded as the "issue number". On a calendar with 23 entries, it reads "№ 23" — which will regress to "№ 22" if one entry is cancelled and dropped.

**Distribution section is a permanent-looking placeholder.** `section.ts:130-141` renders a static `<section>` with hardcoded text. There is no conditional to hide it or a feature flag around it.

**Press queue only surfaces `in-review` entries, not `iterating`.** `press-queue.ts:44` filters to `reviewState !== 'in-review'`, skipping `iterating` entries. The masthead counter at `header.ts:23` counts both `in-review` and `iterating` as "in review". The press queue and the masthead count do not agree on what constitutes "active review."

**`er-chips` uses `role="tablist"` without `role="tab"` on children.** The filter chips are `<button>` elements with `data-stage-chip` attributes. No `role="tab"` is present, making the ARIA landmark semantically misleading.

**No client-side routing or URL state.** Stage chip state and text filter state are in-memory only. A page reload resets all filters. No `?stage=Drafting` query param is read or written.
