# Mobile-Shell Audit — Task 2.1 Pre-Implementation Report

**Date:** 2026-05-12
**Branch:** feature/studio-mobile-first (v0.20.0)
**Auditor:** feature-dev:code-explorer (read-only analysis; no files modified)
**Purpose:** Validate or invalidate the workplan's stated mobile-shell abstraction before implementer dispatch.

---

## TL;DR — Re-scope recommended

The workplan's Phase 2 Task 2.1 assumes the dashboard has a "mobile-bar" equivalent to entry-review's `mobile-bar.ts`. It does not. The dashboard's collapsible stage-tiles are an in-flow navigation idiom with no sheet, not a fixed bottom bar. **Step 2.1.10 ("migrate dashboard mobile-bar") references something that does not exist and should be removed from the workplan.**

The three "sheet-like" patterns in the codebase are two distinct idioms: (1) named-slot slide-up sheet (`mobile-sheet-bar.ts` + `compose-chip.ts`), and (2) per-row horizontal swipe drawer (`row-actions.ts`). Only the first two share enough structure (slide-up gesture, drag-handle, `SLIDE_MS = 280`, `DRAG_DISMISS_PX = 80`, Escape/close-btn) to justify a shared controller. The row drawer must stay surface-specific.

The clearest and lowest-risk extraction is the **probe helpers** (`ping`, `assert`, `bootBrowser`, `pickEntry`) — identical across all three probes with zero surface-specific logic. The server-side bar/sheet templates should be **deferred** until Shortform mockups are picked, so the API is designed against a concrete consumer.

A **breakpoint alignment decision** (`48rem` vs `600px`) is a prerequisite for any cross-surface CSS sharing, and must be made explicitly before extracting a shared CSS file.

---

## 1. Inventory Table

| File | Role | Surface | Parameterizes | Hardcodes | Lines | matchMedia gate |
|---|---|---|---|---|---|---|
| `packages/studio/src/pages/entry-review/mobile-bar.ts` | Server-render | entry-review | Nothing — all hardcoded | 6 tab buttons (Outline/Format/Notes/Scrapbook/Actions/Save), 5 sheet slots, mode switching via CSS class tokens | 161 | N/A (server) |
| `plugins/deskwork-studio/public/src/entry-review/mobile-sheet-bar.ts` | Client controller | entry-review | `entrySlug` | 5 slot keys (SheetKey union:39), `48rem` breakpoint (:35), DOM selectors `.er-outline-drawer-body`, `.er-marginalia`, `[data-sidebar-list]`, `.er-scrapbook-drawer-body` | 499 | `(max-width: 48rem)` :35 |
| `plugins/deskwork-studio/public/src/entry-review/mobile-actions-slot.ts` | Client slot populator | entry-review | `entrySlug`, `closeSheet` callback | 4 hardcoded verbs (approve/iterate/**reject**/cancel) :62-66 — **`reject` is a state-machine violation, see § Violations Flagged** | 84 | None (called from sheet-bar) |
| `plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts` | Client controller | dashboard nav | Nothing | Stage data-attrs, `600px` breakpoint :19 | 103 | `(max-width: 600px)` :19 |
| `plugins/deskwork-studio/public/src/dashboard/compose-chip.ts` | Client controller | dashboard creation | Nothing | DOM selectors `[data-compose-fab]`, `[data-compose-sheet]`, `[data-compose-verb]`, `600px` :22, `280ms` slide :24, `80px` drag dismiss :25 | 143 | `(max-width: 600px)` :39 |
| `plugins/deskwork-studio/public/src/dashboard/row-actions.ts` | Client controller | dashboard rows | Nothing | `600px` :29, `24px` commit :33, `60px` latch :36, `16px` axis-lock :39, per-row DOM `.er-row-shell`/`-fg`/`-drawer`/`-menu` | 443 | `(max-width: 600px)` :43 |
| `plugins/deskwork-studio/public/css/dashboard-mobile.css` | CSS | dashboard | N/A | All dashboard-specific selectors | 483 | `@media (max-width: 600px)` throughout |
| `plugins/deskwork-studio/public/css/dashboard-row-affordances.css` | CSS | dashboard rows | N/A | All row-specific selectors | 225 | `@media (max-width: 600px)` :31 |
| `plugins/deskwork-studio/public/css/editorial-review.css` | CSS | entry-review | N/A | Mobile bar/sheet rules at lines 3687-3900+ | 4933 | `@media (max-width: 48rem)` :3703 |
| `packages/studio/src/pages/dashboard/affordances.ts` | Server-render | dashboard rows | `entry`, `defaultSite` | Stage-aware verb vocabulary, chip/menu/drawer render shapes | 355 | N/A (server) |
| `packages/studio/src/pages/dashboard/section.ts` | Server-render | dashboard | `stage`, `entries`, `defaultSite` | Stage ornaments :22, empty messages :32, row HTML structure | 238 | N/A (server) |
| `scripts/probe-mobile-editor.mjs` | Probe | entry-review editor | `--entry UUID`, `--studio-url` | Chromium only; duplicates `ping()`, `assert()`, `chromium.launch()` | ~250 | N/A |
| `scripts/probe-mobile-scrapbook.mjs` | Probe | entry-review scrapbook | same | same duplicated helpers | ~200 | N/A |
| `scripts/probe-mobile-dashboard.mjs` | Probe | dashboard | `--studio-url` | same duplicated helpers | ~180 | N/A |

**Critical finding:** `scripts/lib/mobile-probe-helpers.mjs` does not exist. All three probes independently define `ping()`, `assert()`, `chromium.launch()` boot sequences, and argument parsing. This is the clearest extraction opportunity in the codebase.

---

## 2. Shared-vs-Surface-Specific Analysis

### Tab Bar Abstraction (mobile-bar vs stage-tiles)

**The dashboard never had a mobile-bar.** The workplan's Step 2.1.10 says "Migrate Phase 1's dashboard mobile-bar to consume the shared module" — but Phase 1 shipped zero mobile-bar equivalent on the dashboard. The dashboard's navigation idiom is the collapsible stage-tiles stack (`stage-tiles.ts`), which is a fundamentally different pattern:

- **Entry-review mobile-bar**: fixed bottom bar, 64px tall, 4-6 tab buttons, opens a slide-up sheet to a named slot. CSS: `position: fixed; bottom: 0; height: 64px; z-index: 60` (`editorial-review.css:3761-3776`).
- **Dashboard stage-tiles**: not a bar at all. Each tile is a full-width row button in the page flow, stacked top-to-bottom, toggling `data-collapsed` on its section inline. No `position: fixed`. No sheet. Completely different DOM structure and interaction model.

**Conclusion:** The stage-tiles idiom does not count as a "tab bar" in the mobile-bar sense. Treating them as the same abstraction would force either the dashboard's inline-collapse pattern into a fixed-bar shape (wrong for dashboard's "structure over scrolling" principle per `DESIGN-STANDARDS.md:83`) or dilute the entry-review bar into something so generic it carries no fixed-bar semantics. They should remain separate.

### Sheet Abstraction (mobile-sheet)

There are three "sheet-like" things in the codebase. They are not the same abstraction:

**Pattern A — Named-slot sheet (entry-review):** One shared `<section class="er-mobile-sheet">` host with 5 named `data-mobile-sheet-slot` divs. Tab clicks show one slot, hide others. Controller (`mobile-sheet-bar.ts:124-154`) manages slot population (lazy, with MutationObserver for live data), bidirectional mark-note linking, drag-to-dismiss via handle, Escape key, close button, tab `aria-expanded` state. The sheet is full-surface, not tied to any one item.

**Pattern B — Simple verb panel (compose-chip):** One `[data-compose-sheet]` host containing a single panel (no slots). Open/close is boolean. Verb buttons copy clipboard commands. Drag-to-dismiss is the same gesture pattern as Pattern A (`compose-chip.ts:80-116` mirrors `mobile-sheet-bar.ts:349-371`). Only difference: no slot dispatch, no slot population, no MutationObserver.

**Pattern C — Per-row swipe drawer (row-actions):** Not a sheet at all. Each row has its own `.er-row-drawer` that slides in behind the row foreground via CSS `translateX`. Gesture is horizontal swipe, not vertical drag-to-dismiss. The drawer is always in the DOM (server-rendered), never dynamically populated. No sheet host, no slot concept, no handle, no close button. `row-actions.ts:242-405`.

**Conclusion:** Patterns A and B share a slide-up sheet + drag-handle + Escape + close-btn idiom. Pattern C is a fundamentally different gesture model (horizontal swipe, per-row, in-flow DOM, no host overlay). A shared `mobile-sheet` abstraction can cover Patterns A and B. Pattern C must remain surface-specific.

### Sheet Controller (client)

The drag-handle gesture code between `mobile-sheet-bar.ts:349-371` and `compose-chip.ts:80-116` is nearly identical (same `onStart/onMove/onEnd` structure, same `SLIDE_MS = 280`, same `DRAG_DISMISS_PX = 80`). The constants match. **This is the strongest case for extraction.**

The differences that would need to be parameterized in a shared controller:
- **Entry-review**: `sheet` element targeted via `[data-mobile-sheet-host]`, body class `data-mobile-sheet-open`
- **Compose-chip**: `sheet` element targeted via `[data-compose-sheet]`, body class `data-compose-sheet-open`
- **Entry-review**: multi-slot dispatch logic (slot show/hide, header update, slot population callbacks)
- **Compose-chip**: no slots, just boolean open/close

A shared `createSlideUpSheetController(opts: { sheetEl, bodyClass, onClose?, slots?, dragThreshold? })` factory could cover both. Migration cost: ~60 lines removed from `mobile-sheet-bar.ts`, ~40 lines removed from `compose-chip.ts`.

### Breakpoint Divergence

**This is a real problem.** Entry-review uses `(max-width: 48rem)` = 768px (`mobile-sheet-bar.ts:35`, `editorial-review.css:3703`). Dashboard uses `(max-width: 600px)` (`stage-tiles.ts:19`, `compose-chip.ts:22`, `row-actions.ts:29`, `dashboard-mobile.css:71`). A shared `MOBILE_QUERY` constant in a `mobile-shell` module would need to pick one value — and either break the existing entry-review behavior or the existing dashboard behavior, or expose the breakpoint as a config param. The workplan does not address this divergence.

### Press-Check Tokens

CSS custom properties (`--er-paper`, `--er-red-pencil`, `--er-font-mono`, etc.) are already defined once in `editorial-review.css` and consumed by both surfaces. No JS-layer token extraction is needed. A `mobile-shell.css` file could simply re-export the same custom properties block, but they already cascade from the document root. Low value.

### Probe Scaffolding

All three probes (`probe-mobile-editor.mjs`, `probe-mobile-scrapbook.mjs`, `probe-mobile-dashboard.mjs`) independently define:
- `ping(url)`: async fetch health check (identical in all three)
- `assert(cond, label)`: console.log + failures array push (identical)
- Argument parsing loop for `--entry`, `--studio-url` (nearly identical)
- `chromium.launch()` → `browser.newContext()` → `page.setViewportSize()` boot sequence (identical structure)

A `scripts/lib/mobile-probe-helpers.mjs` exporting `{ping, assert, bootBrowser, pickEntry, summarizeResults}` would reduce duplication across all three probes. **This is the extraction with the lowest risk and highest DRY benefit.**

---

## 3. Candidate API Directions

### Direction A — Narrow: Slide-up sheet controller + probe helpers

**Server exports:** Nothing new. `mobile-bar.ts` stays as-is. `affordances.ts` stays as-is.

**Client exports (new `mobile-shell/sheet-controller.ts`):**

```ts
createSlideUpSheet(opts: {
  sheetEl: HTMLElement;
  bodyOpenClass: string;
  handleEl?: HTMLElement;
  closeBtnEl?: HTMLElement;
  scrimEl?: HTMLElement;
  dragDismissPx?: number;   // default: 80
  slideMs?: number;          // default: 280
}): { open(): void; close(): void; isOpen(): boolean; }
```

**Probe helper exports (new `scripts/lib/mobile-probe-helpers.mjs`):**

```js
ping(url): Promise<boolean>
assert(cond, label, failures): void
bootBrowser(viewport): Promise<{ browser, page }>
pickEntry(entriesDir, opts?): Promise<string>
summarizeResults(failures): void   // exit(0|1)
```

**Does NOT export:** Tab bar markup, slot dispatch, MutationObserver scaffolding, breakpoint constants, CSS tokens.

**Trade-offs:** Narrow scope. Extracts the one objectively shared behavior (slide-up gesture). Migration cost: `mobile-sheet-bar.ts` drops ~60 lines; `compose-chip.ts` drops ~40 lines. No breakpoint decision forced. Entry-review and dashboard CSS stay independent. Probes each shrink by ~40 lines.

**Migration validation:** Existing probes (`probe-mobile-editor.mjs`, `probe-mobile-scrapbook.mjs`, `probe-mobile-dashboard.mjs`) validate the extraction is non-regressing — they exercise the sheet open/close/dismiss behaviors that the extracted controller owns.

### Direction B — Medium: + Bar server template

Extends Direction A by also extracting `renderMobileBar(opts: { tabs, sheetId })` and `renderMobileSheet(opts: { slots })` as server templates. Entry-review and a future Shortform would consume them.

**Forces a breakpoint decision** (expose as config param, or standardize on 600px and re-audit entry-review's 601–768px range).

**Premature for now:** Shortform's tab/slot configuration is unknown until its mockups are picked (Task 2.2). Designing the API against a hypothetical consumer is exactly the over-engineering this codebase has explicit guidance against.

### Direction C — Wide: + Navigation idiom

Extends B by also abstracting stage-tiles into a generic `renderMobileNav` + `createNavController`. **Wrong for the codebase.** Stage-tiles is in-flow DOM driven by "favor structure over scrolling" (DESIGN-STANDARDS.md:83); abstracting it into the same module as a fixed bottom bar either forces the principle-violating shape, or creates a too-thin abstraction. Reject.

---

## Recommendation: Re-scope Task 2.1

**The workplan's abstraction shape is partially wrong.** Specifically:

1. **Workplan Step 2.1.10 references "dashboard mobile-bar" — this does not exist.** Remove from the workplan.
2. **The three "mobile sheet" patterns are two different idioms.** The row-actions drawer (Pattern C) is not a slide-up sheet and should not be abstracted into `mobile-shell`.
3. **The strongest extraction opportunity is the probe helpers,** not the server-rendered bar/sheet templates. Pure duplication, zero surface-specific logic.

**Proposed re-scope:**

- **Keep:** Extract slide-up sheet gesture controller (Direction A) + probe helpers. Unambiguously correct, low risk, validates with existing probes.
- **Defer:** Server-side bar/sheet templates (Direction B) until Shortform mockups are picked. Extract as part of Task 2.2 when consumer shape is concrete.
- **Drop:** Stage-tiles abstraction. Not shared, not needed.
- **Resolve:** The breakpoint divergence (48rem vs 600px) — surface as a separate decision; not blocking on Direction A.

**Revised Task 2.1 scope:** Extract probe helpers to `scripts/lib/mobile-probe-helpers.mjs` + extract slide-up sheet controller to `plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts`. Migrate `mobile-sheet-bar.ts` and `compose-chip.ts` to consume the shared controller. Verify with existing probes. Estimated effort: a sprint cut, not a multi-phase extraction.

---

## Violations Flagged (separate cleanup commit, not Task 2.1 work)

`plugins/deskwork-studio/public/src/entry-review/mobile-actions-slot.ts:64` surfaces a `reject` verb in the mobile Actions sheet, clipboard-copying `/deskwork:reject <slug>`. **`reject` is not a verb in `DESKWORK-STATE-MACHINE.md`** — Commandment II violation. The corresponding `decision.ts:110-120` handler intentionally shows a toast ("Reject semantics are pending design — see issue #173") and the button is `disabled` server-side, so it is non-functional today, but the clipboard-copy in the mobile actions slot is live and would copy a non-existent command. **Action:** file a GitHub issue; clean up in the same pass as Task 0.2 (state-machine violation sweep).

---

## Essential files for understanding this topic

- `packages/studio/src/pages/entry-review/mobile-bar.ts` — server-rendered bar + sheet host (entry-review)
- `plugins/deskwork-studio/public/src/entry-review/mobile-sheet-bar.ts` — client controller (entry-review)
- `plugins/deskwork-studio/public/src/entry-review/mobile-actions-slot.ts` — actions slot populator (contains `reject` violation)
- `plugins/deskwork-studio/public/src/dashboard/compose-chip.ts` — client controller (dashboard create sheet)
- `plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts` — client controller (dashboard navigation tiles)
- `plugins/deskwork-studio/public/src/dashboard/row-actions.ts` — client controller (dashboard row swipe drawer + menu)
- `plugins/deskwork-studio/public/css/dashboard-mobile.css` — dashboard mobile CSS
- `plugins/deskwork-studio/public/css/dashboard-row-affordances.css` — row affordance CSS
- `plugins/deskwork-studio/public/css/editorial-review.css` (lines 3681-3900) — entry-review mobile bar/sheet CSS
- `packages/studio/src/pages/dashboard/affordances.ts` — server-rendered row verb logic
- `packages/studio/src/pages/dashboard/section.ts` — server-rendered row + tile HTML structure
- `scripts/probe-mobile-editor.mjs` — probe (duplicated helpers to extract)
- `scripts/probe-mobile-scrapbook.mjs` — probe (same)
- `scripts/probe-mobile-dashboard.mjs` — probe (same)
- `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md` (lines 457-560) — Task 2.1 as written
