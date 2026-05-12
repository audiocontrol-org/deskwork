---
title: Shortform desk audit — pre-mockup grounding for Task 2.2
date: 2026-05-12
feature: studio-mobile-first
phase: 2 (Task 2.2)
---

# Shortform desk audit

Read-only audit for Task 2.2.1 of the `studio-mobile-first` feature. Grounds the `/frontend-design` mockup pass (Task 2.2.2) in the actual state of the shortform surface so the mockups address real friction rather than imagined friction. Same audit-first pattern that prevented two structural mistakes in Task 2.1's `mobile-shell` extraction (the workplan had assumed dashboard had a mobile-bar; it didn't, and three "sheet-like" patterns were really two).

## TL;DR — three findings the mockup author must internalize

1. **The shortform review surface has zero mobile CSS.** Every mobile rule in `editorial-review.css` that matters — strip stickiness, strip-inner flex layout, mobile bar/sheet — is scoped to `[data-review-ui="longform"]`. The shortform `data-review-ui="shortform"` body attribute gets only the global page-reset. Decision buttons scroll out of sight on phone. The strip items render as inline blocks, not flex. No bottom bar exists.

2. **Both shortform pages carry Commandment III violations** — legacy `DraftWorkflowState` values (`in-review`, `iterating`, `approved`) rendered as stamp labels on row (`shortform.ts:85`) and review strip (`shortform-review.ts:313`). These must be removed in the mobile-first pass regardless of which mobile idiom is chosen.

3. **The `postDecision()` POST pattern in `editorial-review-client.ts:1619` is a THESIS Consequence 2 violation.** The Approve and Iterate button handlers POST state mutations to `/api/dev/editorial-review/decision` BEFORE copying the slash command. The copy should be the only action; the POST should not exist on this surface. The reject button (`shortform-review.ts:138`) is additionally not a state-machine verb — there is no `reject` in `DESKWORK-STATE-MACHINE.md`.

## Inventory table

| File | Role | Surface | Lines | Mobile gate |
|---|---|---|---|---|
| `packages/studio/src/server.ts` | Route registration | All | ~500 | N/A |
| `packages/studio/src/pages/shortform.ts` | Server-render desk index | Shortform desk | 162 | None |
| `packages/studio/src/pages/shortform-review.ts` | Server-render review | Shortform review | 342 | None |
| `plugins/deskwork-studio/public/src/editorial-review-client.ts` | Decision handler JS | Shortform review | ~1800 | None |
| `plugins/deskwork-studio/public/src/editorial-studio-client.ts` | Dashboard-specific JS | Shortform desk (wrong) | ~520 | `(max-width: 600px)` :513 |
| `plugins/deskwork-studio/public/css/editorial-review.css` | Primary CSS | Both shortform surfaces | 4933 | `@media (max-width: 48rem)` :3703 |
| `plugins/deskwork-studio/public/css/editorial-studio.css` | Dashboard CSS | Shortform desk (loaded) | ~450 | `@media (max-width: 600px)` :395 |
| `packages/core/src/review/types.ts` | Data model | Both | 80 | N/A |
| `packages/core/src/review/render.ts` | Markdown renderer | Both | ~80 | N/A |
| `packages/core/src/review/toc.ts` | TOC extractor | Entry-review only | ~50 | N/A |
| `packages/studio/src/pages/entry-review/mobile-bar.ts` | Server-render bar/sheet | Entry-review only | 161 | N/A |
| `plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts` | Shared slide-up sheet | entry-review + dashboard | 166 | N/A |
| `scripts/lib/mobile-probe-helpers.mjs` | Probe shared helpers | Entry-review + dashboard | ~120 | N/A |

## A. Existing surface

### Routes

Two distinct routes serve shortform content.

**Shortform desk index:** `server.ts:257`
```
app.get('/dev/editorial-review-shortform', (c) => c.html(renderShortformPage(ctx)));
```
Renders a navigation index of all open shortform workflows grouped by platform. Every row is an anchor tag linking to the review surface (`/dev/editorial-review/<workflow.id>`). No inline editing, no decision buttons.

**Shortform per-workflow review:** `server.ts:291-316`
The bare-UUID route (`/dev/editorial-review/:id`) first checks whether the UUID resolves to a shortform workflow record (`wf !== null && wf.contentKind === 'shortform'` at `server.ts:300`). If so it serves `renderShortformReviewPage`. If not (longform/outline/missing), it 301-redirects to the canonical entry-keyed URL (`/dev/editorial-review/entry/<uuid>`).

### Data model

Both surfaces use `DraftWorkflowItem` from `packages/core/src/review/types.ts`:

- `state: DraftWorkflowState` — `'open' | 'in-review' | 'iterating' | 'approved' | 'applied' | 'cancelled'` (`types.ts:17-23`)
- `contentKind: ContentKind` — `'longform' | 'shortform' | 'outline'` (`types.ts:25`)
- `platform?: Platform` — social platform key
- `channel?: string` — sub-platform channel
- `site: string`, `slug: string`, `currentVersion: number`, `updatedAt: string`

This is the legacy workflow-keyed model, NOT the `CalendarEntry.currentStage` model used by the longform/dashboard pipeline. The shortform surface has never been migrated to `currentStage`. The shortform-review file header (`shortform-review.ts:1-18`) acknowledges this and records it as a documented deferral pending a dedicated migration phase.

### Shortform desk index (`shortform.ts`)

- Loads all open shortform workflows via `listOpen()` filtered by `contentKind === 'shortform'` (`shortform.ts:30-33`).
- Groups by platform using a `PLATFORM_ORDER = ['reddit', 'linkedin', 'youtube', 'instagram']` constant (`shortform.ts:23`).
- Renders each workflow as `<a class="er-row er-shortform-row">` — a clickable row anchor (`shortform.ts:75`). `.er-shortform-row` has no CSS definition in any stylesheet.
- Each row carries a `<span class="er-stamp er-stamp-${w.state}">` with the state value as text (`shortform.ts:85`). For `state = 'in-review'` this renders `er-stamp-in-review` with text `"in review"` — Commandment III violation.
- Page header uses `class="er-pagehead er-pagehead--centered"` (`shortform.ts:132`). The mobile CSS at `editorial-studio.css:395` targets `--dashboard`, not `--centered`; the shortform pagehead gets no phone-specific treatment.
- Body attribute: `bodyAttrs: 'data-review-ui="shortform"'` (`shortform.ts:157`).
- Script module: `editorial-studio-client` (`shortform.ts:160`). This module is the dashboard's client entry point. Its `init()` at `editorial-studio-client.ts:513-515` calls `initComposeChip()`, `initStageTiles()`, and `initRowActions()` — all of which query for dashboard-specific DOM selectors (`[data-compose-fab]`, `[data-stage-tiles]`, `[data-row-shell]`) absent from the shortform desk page. **All three initializers are no-ops on this surface.**
- CSS loaded: `editorial-review.css`, `editorial-nav.css`, `editorial-studio.css` (`shortform.ts:152-155`).

### Shortform review surface (`shortform-review.ts`)

The file header at lines 1-18 explicitly documents the surface as a "stable backwards-compat shim" pending a future shortform migration phase. This is a legitimate documented deferral with the design decision recorded in the PRD (`shortform-review.ts:14-17`).

- `prepareShortformRender()` at line 68 calls `renderMarkdownToHtml(parsed.body)` with no `RenderOptions` second argument (`shortform-review.ts:71`). `rehype-slug` runs unconditionally in `renderMarkdownToHtml` (`render.ts:23`), so every heading in the rendered HTML has a slugified `id` attribute — TOC plumbing is present.
- `renderControlsRight()` at line 117 branches on `workflow.state` against `'open'`, `'in-review'`, `'iterating'`, `'approved'`, `'applied'`, `'cancelled'` (`shortform-review.ts:117-121`). This is a legacy-state branch — Commandment I violation.
- Approve + Iterate + Reject buttons rendered when `isActive` (`state === 'open' || state === 'in-review'`) (`shortform-review.ts:124-142`).
- Reject button additionally rendered when `isApproved` (`shortform-review.ts:149-152`).
- The `isApproved` branch renders a "copy `/deskwork:approve`" button using `data-action="copy-cmd"` (`shortform-review.ts:147`) — this IS thesis-compliant (client-side clipboard copy, no POST).
- The `isIterating` branch similarly renders a "copy `/deskwork:iterate`" button (`shortform-review.ts:156-158`) — also thesis-compliant.
- The state stamp: `<span class="er-stamp er-stamp-big er-stamp-${workflow.state}" data-state-label>` (`shortform-review.ts:313`) — renders legacy state values as stamp text. For `state = 'in-review'` this emits "in review" — Commandment III violation.
- Page grid: `<div class="er-page-grid"><div class="er-draft-frame">` (`shortform-review.ts:293-295`) — no marginalia column (shortform has no annotations), only one content column.
- Body attribute: `data-review-ui="shortform"` on the `.er-review-shell` div (`shortform-review.ts:303`), NOT on `<body>`. The longform surface puts `[data-review-ui="longform"]` on `<body>`; this difference means longform-scoped CSS rules can target body OR shell descendants, while shortform's marker is descendant-only.
- CSS: `editorial-review.css`, `editorial-nav.css`, `blog-figure.css`, `review-viewport.css` (`shortform-review.ts:330-336`). Note: `editorial-studio.css` is NOT loaded on the review surface (only on the desk index).
- Script: `editorial-review-client` (`shortform-review.ts:340`).

### Decision handler: `editorial-review-client.ts`

The client module is shared between longform and shortform review. The decision handler path:

- `postDecision(to: string)` at line 1619: POSTs `{ workflowId, to }` to `/api/dev/editorial-review/decision` — state mutation from a button click.
- `ensureInReview()` at line 1632: if workflow is `'open'`, POSTs transition to `'in-review'` before approve/iterate.
- Approve handler at line 1694: calls `ensureInReview()` + `postApproveAnnotation()` + `postDecision('approved')` + `copyCommandForNextStep`.
- Iterate handler at line 1723: calls `ensureInReview()` + `postDecision('iterating')` + `copyCommandForNextStep`.
- Iterate command for shortform at line 1736-1739 emits `/deskwork:iterate --site ${site} ${slug}` with NO `--platform` or `--channel` flag. The inline comment at 1734-1735 acknowledges the gap. No evidence of an alternative path emitting platform/channel was found.
- Reject handler at line 1747: calls `postDecision('cancelled')` at line 1756 — state mutation, no clipboard routing.

## B. Mobile vs. desktop today

### Desktop (≥1280px)

**Desk index:** A platform-grouped list of workflow rows. Each row is a 5-column grid via `.er-row { grid-template-columns: auto minmax(0, 1fr) auto auto auto; }` at `editorial-review.css:639-641`. Desktop renders cleanly. Navigation row with back link at bottom.

**Review surface:** A single-column content frame (no marginalia — shortform has no annotations). The strip (`er-strip` / `er-strip-inner`) sits above the article. Controls in `.er-strip-right` (Approve, Iterate, Reject, Edit, ?). At desktop widths the strip is visible while reading. The page grid adapts via the global `@media (max-width: 64rem)` rule at `editorial-review.css:1396` which collapses `.er-page-grid` to `1fr` — this applies equally to shortform since it is not scoped to longform.

### Phone (≤390px)

**Global rules that DO apply to shortform (no longform scope):**

- `.er-page-grid` collapses to single column at 64rem (`editorial-review.css:1396`).
- `.er-page { width: auto; }` at 600px (`editorial-review.css:4948-4956`) — prevents article overflow on phone.
- `@media (max-width: 40rem)` padding tightening at `editorial-review.css:1409`.
- `.er-strip-right { flex-wrap: wrap; }` at `editorial-review.css:1162` — control buttons wrap on overflow. This is the only meaningful phone accommodation for the review strip, and it is passive (wrap on overflow), not a designed phone layout.

**Rules that DO NOT apply to shortform (scoped to longform only):**

1. **Strip stickiness absent.** `[data-review-ui="longform"] .er-strip { position: sticky; top: var(--er-folio-h); }` at `editorial-review.css:1030`. The shortform strip uses base `.er-strip` styles — it scrolls with the page. On a long shortform draft the decision buttons scroll out of view and never return.

2. **Strip-inner flex layout absent.** `[data-review-ui="longform"] .er-strip-inner { display: flex; align-items: center; gap: ...; flex-wrap: wrap; overflow-x: clip; }` at `editorial-review.css:3613-3628`. The shortform `.er-strip-inner` element has no flex rules — it is an unstyled block div. Its children (`er-strip-back`, `er-stamp-big`, `er-strip-right`, etc.) render as inline elements in document flow, not as a horizontal control bar. At phone widths this produces a stacked jumble.

3. **No mobile bar or sheet.** The `.er-mobile-bar` and `.er-mobile-sheet` elements are server-rendered only by `renderMobileBar()` + `renderMobileSheet()` in `packages/studio/src/pages/entry-review/mobile-bar.ts`. Neither is called in `shortform-review.ts`. The `@media (max-width: 48rem)` block at `editorial-review.css:3703` that wires the mobile tab bar pattern is scoped to `[data-review-ui="longform"]` — it would not apply to shortform even if the elements were present.

4. **Desk rows have no phone collapse.** `.er-row { grid-template-columns: auto minmax(0, 1fr) auto auto auto; }` at `editorial-review.css:639` has no mobile override for the shortform desk. The 5-column grid renders on a 390px phone. Columns 3-5 (stamp, version, hint) likely overflow or force horizontal scroll.

5. **Pagehead stays full size on phone.** The mobile CSS at `editorial-studio.css:395-404` collapses pagehead chrome (kicker/title/deck hide, meta compacts) but is scoped to `.er-pagehead--dashboard`. The shortform desk uses `--centered` modifier (`shortform.ts:132`), so the full-height pagehead with kicker + title + deck renders at phone widths, consuming approximately 40% of the viewport before any row content.

6. **Stamps render on phone rows (design standards violation).** `DESIGN-STANDARDS.md:127` forbids any label-on-a-rectangle pattern on mobile rows. Both surfaces render stamps: `shortform.ts:85` on desk rows, `shortform-review.ts:313` on the review strip stamp. No CSS hides them at phone breakpoints.

## C. Issue #244 — TOC drawer applicability for shortform

Issue #244 tracks adding a TOC drawer for the review surface. The infrastructure is ready for longform but not wired for shortform.

**Infrastructure status:**

- `rehype-slug` runs unconditionally in `renderMarkdownToHtml` at `packages/core/src/review/render.ts:23`. Every call — including `prepareShortformRender()` at `shortform-review.ts:71` — produces heading HTML with `id` attributes.
- `extractToc(html: string): TocEntry[]` exists at `packages/core/src/review/toc.ts`. It reads `h2/h3/h4` elements' `id` + text from rendered HTML.
- For the longform surface, `extractToc` is called at `packages/studio/src/pages/entry-review/index.ts:120` and the result is passed into the outline drawer.
- For the shortform review surface, `prepareShortformRender()` at `shortform-review.ts:68-84` calls `renderMarkdownToHtml` but does NOT call `extractToc`. The `TocEntry[]` result is never generated for shortform.

**One call away:** Adding `const tocEntries = extractToc(bodyHtml)` after line 71 in `prepareShortformRender` would produce the TOC data. Whether to pass it into a drawer or sheet slot is a design decision for Task 2.2.2.

**Shortform content caveat:** Shortform drafts are social-platform copy (Reddit posts, LinkedIn updates, YouTube descriptions, Instagram captions). These are typically 50-500 words with few or no headings. `extractToc` returns an empty array for headingless content — a TOC drawer/slot for shortform may be consistently empty. If the mockup design includes a TOC tab, the designer should account for the empty-state case.

**Recommendation for Task 2.2.2:** Treat TOC as conditional-render — show the TOC slot only if `tocEntries.length > 0`. Consistent with the "structure over scrolling" principle at `DESIGN-STANDARDS.md:83` — a TOC that is always empty adds noise without value.

## D. Phase 2.1 primitive consumability

### `createSlideUpSheet` (sheet-controller.ts)

The shared slide-up sheet controller at `plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts:68` is consumed by:
- `mobile-sheet-bar.ts:34` (entry-review)
- `compose-chip.ts:21` (dashboard)

API parameterized cleanly:
```typescript
createSlideUpSheet({
  sheetEl,         // required: the sheet container element
  bodyOpenAttr,    // required: 'data-mobile-sheet-open' | 'data-compose-sheet-open' | any
  handleEl?,       // optional: drag handle
  closeBtnEl?,     // optional: close button
  scrimEl?,        // optional: scrim click-dismiss
  dragDismissPx?,  // optional: default 80
  onClose?,        // optional: callback on any close path
})
```

**Shortform consumability: ready.** A shortform mobile sheet for decision actions would be a new consumer on the same pattern as `compose-chip.ts` — simple boolean open/close, no slot dispatch. `bodyOpenAttr` would be `'data-shortform-sheet-open'` or similar. No changes to `sheet-controller.ts` required.

### Probe helpers (`mobile-probe-helpers.mjs`)

`parseProbeArgs()` at `scripts/lib/mobile-probe-helpers.mjs:81-94` returns `{ studioUrl, entryUuid }`. The `entryUuid` field is keyed to the longform entry-UUID route (`/dev/editorial-review/entry/<uuid>`).

**Shortform probe gap:** Shortform review URLs are workflow-ID keyed (`/dev/editorial-review/<workflow-id>`). A shortform probe needs `{ studioUrl, workflowId }` instead of `entryUuid`. `parseProbeArgs` does not accept `--workflow-id`.

**Required extension (Task 2.2.6 prerequisite, not 2.2.2 blocker):** Either add `--workflow-id` to `parseProbeArgs` (returning `{ studioUrl, entryUuid, workflowId }` where one may be null), or add a separate `parseShortformProbeArgs()` alongside it.

### `renderMobileBar()` (mobile-bar.ts)

`renderMobileBar()` at `packages/studio/src/pages/entry-review/mobile-bar.ts:43` has zero parameters. It hardcodes 6 tabs (Outline, Format, Notes, Scrapbook, Actions, Save) and 5 sheet slots specific to entry-review. **It cannot be reused for shortform without parameterization.**

If the Task 2.2.2 mockup direction picks a tab-bar idiom for shortform, the implementer will need either:
- A new `renderShortformMobileBar()` function (same pattern, different tabs), or
- A `renderMobileBar(opts: MobileBarOptions)` parameterized version

The design decision in Task 2.2.2 determines which.

## E. Conditional extraction question (Task 2.2.5)

Task 2.2.5 asks whether `renderMobileBar()` / `renderMobileSheet()` should be extracted to a shared module or kept surface-specific.

**Current state:** The server-side bar renderer is not parameterized and is entirely entry-review specific. It cannot serve shortform without modification.

**Decision gate:** This question cannot be answered without knowing what tabs the shortform bar needs. That depends on the Task 2.2.2 mockup pick. The shortform review surface has:
- Fewer action verbs (2 primary: Approve, Iterate; 1 destructive: Reject/Cancel; 1 utility: Edit)
- No outline/marginalia slots (shortform has no annotations column)
- Possibly a TOC slot (conditional on `tocEntries.length > 0`)
- Possibly a versions slot (multiple draft versions exist)

**Likely outcome:** The shortform bar will have 2-3 tabs rather than 6. Sharing the HTML rendering function makes sense only if the tab list is parameterized.

**Recommendation:** Defer the extraction decision to after the Task 2.2.4 mockup pick confirms the exact shortform tab set. Do not parameterize `renderMobileBar()` speculatively — the API should be designed against a known consumer. Matches the Task 2.1 audit's recommendation pattern.

## F. Top 5 friction surfaces

### F.1 Strip control bar is broken at all phone widths

`[data-review-ui="longform"] .er-strip-inner { display: flex; ... }` at `editorial-review.css:3613` — the flex layout that makes the strip a horizontal control bar is scoped to longform. The shortform `.er-strip-inner` is an unstyled block div. At phone widths (390px), the strip items (`back link`, `stamp`, `version`, `controls-right`) stack or flow inline in undefined order. This is not a minor styling gap — the entire strip UX is non-functional on phone.

**Design direction implication:** Any mobile pattern for shortform review must either (a) wire the strip properly with a global or shortform-scoped flex rule, or (b) replace the strip's content with a different phone-native idiom (sticky bottom bar, floating action sheet).

### F.2 No decision affordances visible while reading on phone

The Approve/Iterate/Reject buttons live in `.er-strip-right` inside the non-sticky strip. On a 390px phone reading a 300-word shortform draft:
- The draft content scrolls the strip out of view after ~2 paragraphs.
- The strip is not sticky (scoped to longform at `editorial-review.css:1030`).
- No `.er-mobile-bar` exists on the shortform page.
- The operator must scroll back to the top to access decision buttons.

**This is the primary UX regression on phone.** An operator reviewing shortform content on mobile cannot approve or iterate without scrolling up.

**Design direction implication:** Strongest argument for a sticky bottom bar or floating action sheet on phone. Decision affordances must be reachable without scrolling on any draft length.

### F.3 Iterate slash command missing `--platform` / `--channel` for shortform

`editorial-review-client.ts:1736-1739`: iterate command for shortform emits `/deskwork:iterate --site ${site} ${slug}` with no `--platform` or `--channel`. The inline comment acknowledges the gap. Shortform content is platform-specific (Reddit, LinkedIn, YouTube, Instagram); `--platform` and `--channel` are required for the iterate skill to produce platform-appropriate copy.

An operator clicking Iterate on a LinkedIn shortform draft receives a command that does not identify the platform. The iterate skill will either error or produce generic copy.

**Design direction implication:** The mobile review surface should surface platform + channel context prominently (already exists in `shortformMeta` at `shortform-review.ts:283-288`). Command generation at the iterate handler must be fixed — correctness bug independent of mobile design.

### F.4 Desk rows are 5-column grids with no phone collapse

`.er-row { grid-template-columns: auto minmax(0, 1fr) auto auto auto; }` at `editorial-review.css:639`. Five columns at 390px. Columns 3-5 carry the stamp, version indicator, and "Open in review →" hint text. At phone widths these columns either:
- Force horizontal page scroll, or
- Compress to near-zero, or
- Cause row content to overlap

The `.er-shortform-row` selector referenced in `shortform.ts:75` has no CSS definition in any stylesheet — no mobile override exists because there is no definition at all.

**Design direction implication:** Phone rows need a 2-column or stacked layout. The stamp (Commandment III violation) should be removed entirely. A simplified `title + relative-time` row design would work at phone widths.

### F.5 Full-height pagehead consumes ~40% of phone viewport

`shortform.ts:132`: `class="er-pagehead er-pagehead--centered"`. The `editorial-studio.css:395-404` mobile rule that collapses pagehead chrome is scoped to `.er-pagehead--dashboard`. The shortform desk pagehead renders at full height on phone: kicker text, large display title ("The compositor's desk"), deck paragraph, metadata row. At 390px this consumes approximately 180-220px before any workflow row is visible.

Combined with platform section headers (each carrying an h2 and count), the first workflow row may not be visible above the fold on a short phone.

**Design direction implication:** Shortform desk needs either (a) the `--dashboard` modifier applied or a `--shortform` modifier with the same mobile collapse rules, or (b) a redesigned compact phone header. Mockup should establish what the phone pagehead contains (likely just kicker + count, with title/deck hidden).

## G. Out-of-band findings (separate issue candidates)

Violations of canonical specs observed during the audit. NOT fixed in this audit. The parent orchestrator decides which to file as separate issues.

### G.1 Commandment III violation — legacy state stamps on both surfaces

- `shortform.ts:85`: `<span class="er-stamp er-stamp-${w.state}">${w.state.replace('-', ' ')}</span>` — renders "in review" / "iterating" / "approved" on desk rows.
- `shortform-review.ts:313`: `<span class="er-stamp er-stamp-big er-stamp-${workflow.state}" data-state-label>` — same violation on review strip.
- CSS enablers at `editorial-review.css:732-735` define `.er-stamp-open`, `.er-stamp-in-review`, `.er-stamp-iterating`, `.er-stamp-approved`, `.er-stamp-applied`, `.er-stamp-cancelled`.

`DESKWORK-STATE-MACHINE.md:234-238`: "Stamps that show review state ('In review', etc.) go." `DESIGN-STANDARDS.md:152-156`: "No 'IN REVIEW' / 'ITERATING' / 'APPROVED' labels."

### G.2 Commandment I + II violation — state-based control branching

`shortform-review.ts:117-121`: `renderControlsRight()` branches on `workflow.state === 'open' || workflow.state === 'in-review'` (grouped as `isActive`), `workflow.state === 'approved'`, `workflow.state === 'iterating'`. The shortform surface operates on `DraftWorkflowState`, not `currentStage`.

**Note on scope:** The shortform-review file header (`shortform-review.ts:1-18`) explicitly acknowledges this surface is a "stable backwards-compat shim" pending a dedicated migration phase. The violations are documented and intentionally deferred. Not a "for now" IOU — a recorded design decision.

### G.3 THESIS Consequence 2 violation — state mutation from button clicks

`editorial-review-client.ts:1619-1628`: `postDecision(to: string)` POSTs to `/api/dev/editorial-review/decision`. This endpoint advances workflow state. `THESIS.md:119-122`: "No server endpoint that advances stage, sets `reviewState`, bumps iteration counters... when invoked from a UI button. Those mutations belong to skills, period."

Approve handler chain at line 1694: `ensureInReview()` → `postApproveAnnotation()` → `postDecision('approved')` → `copyCommandForNextStep`. Per thesis, the clipboard copy should be the only action — the POST should not exist.

The `isApproved` and `isIterating` branches in `shortform-review.ts:144-158` (which show "awaiting apply…" + copy-cmd button) ARE thesis-compliant — clipboard-only paths.

### G.4 Reject verb not in state machine

`shortform-review.ts:138-142`: Reject button rendered with `data-action="reject"`. `editorial-review-client.ts:1747-1764`: Reject handler calls `postDecision('cancelled')` at line 1756.

`DESKWORK-STATE-MACHINE.md` has no `reject` verb. The state machine has `iterate`, `approve`, `cancel`. The UI labels this "Reject" and maps it to `cancelled`. Verb name is wrong; mapping conflates operator-cancelled with content-quality-rejected.

Identical pattern to the issue #260 finding from Task 2.1 (`mobile-actions-slot.ts:64`). Should be filed as a similar issue or rolled into a state-machine compliance pass.

### G.5 Iterate command missing platform/channel

`editorial-review-client.ts:1734-1739`: iterate command for shortform emits `/deskwork:iterate --site ${site} ${slug}` with no `--platform` or `--channel`. Inline comment acknowledges gap. No alternative path found.

### G.6 Dead CSS — `.er-galley` classes

`editorial-review.css:941-1022`: ~80 lines of `.er-galley`, `.er-galley-head`, `.er-galley-body`, `.er-galley-actions`, `.er-galley-title`, `.er-galley-meta`. The shortform renderer uses `.er-platform-section`, `.er-platform-header`, `.er-row`, `.er-shortform-row` — none `.er-galley`. Dead code from a previous shortform design iteration.

## Recommendations for Task 2.2.2 (/frontend-design)

The mockup pass should produce directions for two distinct surfaces:

**Surface 1 — Shortform review (phone).** Highest-priority design problem. Mockup must answer:
- What replaces the broken strip-inner control bar on phone? (sticky bottom bar, floating action sheet, or strip fix)
- Where do Approve/Iterate/Cancel live on phone? (must be reachable without scrolling)
- How is platform/channel context shown? (affects what commands get built)
- What state information is shown, if any? (must NOT use legacy review-state labels per Commandment III; must use stage if anything)

**Surface 2 — Shortform desk index (phone).** Lower priority but needed. Mockup must answer:
- What does the phone pagehead look like? (collapsed or redesigned)
- What does a phone row look like? (2-column or stacked; no 5-column grid; no stamps)

**Constraints to honor:**

- Press-check vocabulary (Newsreader + JetBrains Mono, paper-noise SVG, color tokens `--er-paper` / `--er-red-pencil` etc.) — `DESIGN-STANDARDS.md` § Vocabulary
- NO rubber-stamps on mobile (`DESIGN-STANDARDS.md:107-145`)
- Review state retired — no "IN REVIEW"/"ITERATING"/"APPROVED" labels (`DESIGN-STANDARDS.md:146-165`)
- Pill (not Material round) compose-style affordances (`DESIGN-STANDARDS.md:178-188`)
- Structure-over-scrolling principle (`DESIGN-STANDARDS.md:77-101`)
- WCAG 2.1 AA contrast minimums (`DESIGN-STANDARDS.md:220-241`)

**Out of scope for mockups:**

- State-machine compliance fixes (G.1, G.2, G.3, G.4, G.5) — implementation pass should address, not mockup design. Mockups for the new surface should simply not include the violating patterns.
- Dead CSS cleanup (G.6) — separate housekeeping commit.
- The `editorial-studio-client` no-op initializers on the desk index — separate cleanup.
