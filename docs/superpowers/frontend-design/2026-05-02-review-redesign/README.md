---
deskwork:
  designSession: 2026-05-02
  source: github.com/audiocontrol-org/deskwork/issues/154
---

# Review surface + scrapbook — redesign

Single design session against [issue #154](https://github.com/audiocontrol-org/deskwork/issues/154). Two mockups + this rationale.

## Mockups

- [`review-redesign.html`](./review-redesign.html) — the longform review surface, both modes (`?` toggles in the floater).
- [`scrapbook-redesign.html`](./scrapbook-redesign.html) — the scrapbook index with always-on previews + in-place expansion.

Open them in a browser. Both are full-document, self-contained, no build step.

## Diagnosis

The current review surface is a refinement deck on top of an architectural error: **marginalia is anchored to the viewport's right edge, not to the page.** Every issue #154 concern descends from that mistake.

| #154 concern | Root cause |
|---|---|
| (1) Edit mode cramped — Focus / Save buttons hidden under marginalia; source pane fixed-width | Marginalia is `position: fixed` on the viewport. Edit-mode tries to widen `.essay` to `calc(100vw - 19rem)` but the marginalia stays in the way. |
| (2) Read mode — empty left half, marginalia cramped at top-right | Article is centered in the viewport at ~40rem; marginalia sits in the viewport's right gutter, far from the prose it annotates. The empty left half is the negative space of an article that has no left-side neighbor. |
| (3) Scrapbook drawer that isn't a drawer | The "drawer" is an `<aside>` whose primary affordance (`open ↗`) navigates to a different page. The chrome promises in-place expansion; the action contradicts it. |
| (4) Scrapbook index has no previews; clicking does nothing | The standalone scrapbook page renders item rows as JS-driven disclosures; the click-to-expand handler is brittle and the always-collapsed default tells the operator "there is nothing to see here." |
| (5) Review surface has no global folio nav | The longform chrome explicitly suppresses the host's folio (`body:has([data-review-ui="longform"]) .header-wrapper { display: none !important }`), and the studio's own folio is omitted from the longform render path. |

## Design direction

Keep the press-check / proofreader's-desk metaphor. The metaphor was always *page on a desk, with the reviewer's marginalia in the page's own right margin.* The implementation drifted to *page floating somewhere, marginalia pinned to the desk's edge.* The redesign pulls marginalia back onto the page where it belongs.

Type, palette, and rhythm tokens are unchanged: Fraunces (display + marginalia), Newsreader (body), JetBrains Mono (chrome), `--er-paper` cream + ink + red pencil + proof blue + stamp green/purple. The redesign is composition, not reskin.

## Decision-by-decision

### Layout architecture (issues 1, 2)

The page is a tangible object centered on the desk:

```
desk (paper-2 + grain)
  ┌─────────────────────────────────────────────────────────┐
  │  THE PAGE (paper-1, soft drop-shadow, faint binding)     │
  │  ┌─────────────────────┬───┬───────────────────────────┐ │
  │  │ article (28-42rem)  │ ┊ │ marginalia (16-19rem)     │ │
  │  │ Newsreader 17px     │ ┊ │ Fraunces italic 14-16px   │ │
  │  │                     │ ┊ │                           │ │
  │  │ # Title             │ ┊ │ § Margin notes            │ │
  │  │ dek                 │ ┊ │ - voice-drift             │ │
  │  │ body … <mark> …     │ ┊ │   "red pencil goes"       │ │
  │  │                     │ ┊ │   note text…              │ │
  │  └─────────────────────┴───┴───────────────────────────┘ │
  └─────────────────────────────────────────────────────────┘
                             ┊  thin rule (paper-3)
                             ┊  ← gutter between cols
```

- **The page is a CSS Grid of three columns**: `var(--er-article-col) 1px var(--er-marginalia-col)`. The middle "column" is just the gutter rule.
- **Marginalia is `position: relative` inside the grid** — not `fixed` on the viewport. It scrolls with the article.
- **Page max-width is 78rem** (`--er-container-wide`), centered on the desk. The desk's empty left half disappears because there is no empty left half — the article column starts at the page's left padding, not at viewport center.
- **Each margin note has a slight rotation** (`±0.4deg`) for handwritten variety; hover/active straightens to neutral. Tight detail; carries the metaphor.
- **Cross-highlight on hover**: hovering a margin note marks the corresponding `.er-mark` in the article, and vice-versa. The redesign uses the same JS event surface as the existing client; no new wiring beyond the selector swap.

### Edit mode (issue 1)

- Edit mode swaps the article column for source / preview while keeping the marginalia gutter.
- The edit toolbar (Source / Split / Preview · Outline · Focus · Save · Cancel) sits **above the page-grid** (where the strip's right side previously held action buttons). It is no longer below the article and no longer collides with marginalia.
- Source / preview panes share the article column's width. In `split` they're `1fr 1fr` inside the column. In `source` only, the source pane uses the full column width. There is no fixed pixel width on either pane.
- Focus mode (when wired) hides the marginalia gutter and chrome, leaving the source pane to fill the page.

### Scrapbook drawer (issue 3)

- Bottom-anchored drawer that **expands in place**, not a link to elsewhere.
- Collapsed (`4rem`): kicker + count + first 2-3 item names + "Expand ▾" button. The handle is a click target.
- Expanded (`22rem`): grid of `er-scrap-card`s — each shows file kind, name, mtime, and an inline preview (markdown excerpt, image thumbnail, JSON snippet, txt excerpt). The card grid is `repeat(auto-fill, minmax(15rem, 1fr))`.
- An `Open viewer ↗` link still exists in the handle for the standalone scrapbook page — but it's a small, plain link, not the drawer's primary affordance. It exists for adopters who want the dedicated viewer experience.
- Animation: smooth `height` transition (240ms cubic-bezier); chevron rotates.
- Keyboard: handle is `role="button"` with Enter/Space toggling.

### Scrapbook index (issue 4)

- Every card on the index page **always shows a preview** — no JS-driven disclosure to break.
- Cards are click targets: clicking the name or `open` button **expands the card in place** to span the full grid (`grid-column: 1 / -1`). Same row collapses on second click. No navigation away.
- Image cards show a real thumbnail (background-image with `cover`); markdown shows the first ~150 characters; JSON shows the first ~6 lines verbatim in mono; txt shows excerpted prose.
- Filter chips at the top (`all · md · img · json · txt · other`). Search input at the right with `/` shortcut.
- Tools bar at the bottom of each card (open / edit / rename / mark-secret / delete) — no longer hover-conditional, but visually subdued.
- Sticky aside on the left: folder kicker, totals, item index list, action buttons, full path. Matches the existing aside but with cleaner type rhythm.

### Folio (issue 5)

- The folio appears at `top: 0` on the review surface — same one the rest of the studio has. Identical pattern, identical class names (`er-folio-*`).
- The strip sits beneath the folio at `top: var(--er-folio-h)`. Both fixed, both with paper-1 background + thin ink rule.
- The current rule that suppresses the host site's `.header-wrapper` on longform stays; it's the host's nav that's noise, not the studio's folio. The studio folio is the studio's own — different consumer, different concern.

## Token deltas (vs existing CSS)

The mockups define a few new tokens; the rest are reused verbatim from `editorial-review.css`:

```css
--er-paper-4:        #C9BFA3;    /* darker than paper-3 — page binding edge */
--er-page-max:       78rem;      /* outer page frame (= --er-container-wide) */
--er-page-pad-x:     var(--er-space-6);
--er-page-pad-y:     var(--er-space-5);
--er-article-col:    minmax(28rem, 42rem);
--er-marginalia-col: minmax(16rem, 19rem);
--er-page-gap:       var(--er-space-5);
--er-folio-h:        2.4rem;
--er-strip-h:        3.4rem;
--er-drawer-h:       4rem;       /* collapsed scrapbook drawer */
--er-drawer-h-x:     22rem;      /* expanded scrapbook drawer */
```

Color tokens unchanged. Type tokens unchanged. Space scale unchanged.

## Integration map (rough sub-agent boundaries)

The redesign breaks cleanly into 5 dispatches, each ≤4 logical changes (matching the upper bound that succeeded last session). Order matters: chrome and layout first, then the affordances that depend on them.

### Dispatch A — chrome + layout shell *(prereq for everything else)*

- Render `er-folio` on the longform review surface (issue 5).
- Replace the `position: fixed` marginalia with a CSS Grid column inside a new `.er-page` container (issues 1, 2).
- Add `--er-page-*` and `--er-article-col` / `--er-marginalia-col` tokens to `editorial-review.css`.
- Drop the `body:has(.er-edit-mode:not([hidden])) .essay { max-width: calc(100vw - 19rem) }` rule — no longer relevant once the layout owns the marginalia gutter.
- File touches: `packages/studio/src/pages/review.ts` (folio render path), `packages/studio/src/pages/chrome.ts` (folio inclusion for `longform`), `plugins/deskwork-studio/public/css/editorial-review.css` (grid + tokens).

### Dispatch B — marginalia behavior on the new layout

- Margin-note rotation, hover cross-highlight (note ↔ article mark), composer styling.
- Resolve / defer per-note actions stay on the same handler set; only the markup parent changes.
- File touches: `packages/studio/src/pages/review.ts` (`renderMarginalia`), `plugins/deskwork-studio/public/src/editorial-review-client.ts` (cross-highlight selector swap), `plugins/deskwork-studio/public/css/editorial-review.css` (`.er-note*`).

### Dispatch C — edit-mode toolbar relocation

- Move the edit toolbar (Source / Split / Preview · Outline · Focus · Save · Cancel) above `.er-page`. Strip's `er-strip-actions` hides while in edit mode.
- Source/preview panes inherit the article column's width.
- Drop hard-coded width assumptions; rely on grid for col sizing.
- File touches: `packages/studio/src/pages/review.ts` (`renderEditMode`), `plugins/deskwork-studio/public/css/editorial-review.css` (`.er-edit-*`).

### Dispatch D — scrapbook drawer (real drawer)

- Convert `.er-scrapbook-drawer` from "always-visible aside with a navigate-away link" to bottom-anchored expandable drawer.
- Body of expanded drawer renders item cards (markup similar to index cards, lower density).
- Standalone-viewer link demoted to a small text affordance in the handle.
- File touches: `packages/studio/src/pages/review-scrapbook-drawer.ts`, `plugins/deskwork-studio/public/src/editorial-review-client.ts` (drawer toggle handler), `plugins/deskwork-studio/public/css/editorial-review.css` (`.er-scrapbook*`).

### Dispatch E — scrapbook index page rewrite

- Always-on previews. In-place expansion. Filter chips. Search input. Folder aside (kept).
- The existing JS-driven disclosure handler can stay or be replaced by `<details>`-based state — the redesign works with either. Recommend `<details>` for JS-free robustness.
- File touches: `packages/studio/src/pages/scrapbook.ts`, `packages/studio/src/components/scrapbook-item.ts`, `plugins/deskwork-studio/public/src/scrapbook-client.ts`, `plugins/deskwork-studio/public/css/scrapbook.css`.

## Responsive behavior

The mockups demonstrate three breakpoints:

| Width | Page grid | Folio | Strip | Drawer |
|---|---|---|---|---|
| ≥ 64rem (default) | 3 cols (article + gutter + marginalia) | full | full | bottom |
| 40–64rem | single column (marginalia stacks below article, with a dashed top rule) | folio-spine hidden | strip-slug hidden | unchanged |
| < 40rem | single column, tighter padding | nav-gap reduced | versions hidden | peek hidden |

No new client behavior required for responsiveness — pure CSS.

## What the mockups intentionally don't show

- The shortcut overlay (existing modal; out of scope).
- The shortform review surface (separate composition; same folio + strip pattern but no marginalia or scrapbook).
- The pencil-tip floating button on text selection (kept as-is).
- Light/dark theme switching (out of scope per the broader UX/UI plan).
- Glossary tooltips (Phase 1 mechanism already shipped; the redesign preserves the `.er-gloss` markup hooks).

## Verification before integration

When implementing these dispatches:

1. After each dispatch, walk the surface in Playwright at 1440 / 1024 / 768 / 390 widths.
2. `getBoundingClientRect` on `.er-marginalia` to confirm it scrolls with the page (its `position` should not be `fixed`).
3. Confirm the strip's `Edit` button toggles `body[data-mode]` and the article column swaps to the source pane without reflow flicker.
4. Drag-resize the window through the 64rem and 40rem thresholds — single-column stacking should not produce a horizontal scrollbar.

Each dispatch ends with `npm test --workspaces` green; tests for the affected files should grow with regression cases for the layout and behavior changes.
