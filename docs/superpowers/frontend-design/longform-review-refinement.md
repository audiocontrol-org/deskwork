# Longform review surface refinement — design output

**Surface:** `/dev/editorial-review/<entry-uuid>` (the press-check tool — galley-proof aesthetic, margin notes, decision strip, edit toggles).
**Spec:** `docs/superpowers/specs/2026-05-01-studio-uxui-design.md` §5.3 + ad-hoc refinement based on Playwright walk.
**Issue references:** subsumed parts of #114 (jargon glossary application), #108 (keybinding chips), and several findings the operator caught visually.
**Owner module:** `plugins/deskwork-studio/public/css/editorial-review.css` (most rules), `plugins/deskwork-studio/public/css/review-viewport.css` (strip-local rules), `packages/studio/src/pages/review.ts` (markup adjustments).

---

## Design rationale

The longform review surface already does the right thing — render preview, margin notes, decision strip, Mark pencil, edit toggle, scrapbook drawer. What's wrong is **noise**: indicators that echo each other, jargon that lands without explanation, an empty state that explains affordances rather than offering them, and a top-nav label that highlights the wrong destination. The right move is subtraction + tightening, not redesign. None of the existing pattern language changes; the rubber-stamp aesthetic, the rotated `er-stamp-big`, the `er-pencil-btn` that floats above selections, the `er-strip` perforated sticky bar — all stay exactly as drawn. Refinements lean on the **glossary tooltip mechanism** that just landed (Phase 1), the **`er-strip-hint kbd`** treatment that already exists for a single hint chip, and the **`hidden`** attribute pattern used across the surface.

The decision strip was the strongest signal of redundancy: `applied` written twice — once on the rotated rubber stamp, once on a small pending-state pill labeled `filed (applied)`. That pill earns its keep on `iterating` and `approved` (it's the agent-action-needed indicator near a "copy /deskwork:..." button), but in the steady-state `applied` case it's just an echo. The fix is to scope the pill's display: hide the `er-pending-state--filed` variant; keep the others. The Edit button gets the same pencil iconography as the Mark button — both are pencil verbs (one toggles the source pane, one annotates the prose) — but with a `⇄` direction-glyph so the toggle nature is read at a glance. Mode disclosure on the Edit toggle (operators today can't tell if they're in source or preview without clicking) is solved by surfacing the active mode inline as a subtle uppercase tag next to the button.

The glossary integration is mechanical: the just-landed `gloss(<key>)` helper wraps a term in `<span class="er-gloss" data-term="...">`, and the global tooltip client renders a paper-clipping margin note on hover/focus. The strip's "Galley", the empty-state copy's "Mark", and the post-fix keybinding hint can all use it. The rendered tooltips share the same paper aesthetic as the strip itself, so the surface becomes more permissive of newcomers without losing any of its character. Two markup tweaks — rename "Reviews" → "Shortform" in the nav, fix the active-state logic so longform-review pages don't highlight the shortform link — close the misleading-active-nav loop.

---

## CSS rules

To be appended to **`plugins/deskwork-studio/public/css/editorial-review.css`** (cross-surface lives there). Two small additions go to **`review-viewport.css`** for strip-local fixes; called out below.

### `editorial-review.css` — append at the end of the file

```css

/* ---------- Longform review refinement (Phase 2 follow-up) ---------- */
/*
 * Refinement of the existing longform review surface. Does not change
 * any surface layout or pattern language; only:
 *   - hides the redundant post-completion pending-state pill
 *   - adds keyboard-shortcut chips inline with action buttons
 *   - tightens scrapbook drawer empty state
 *   - surfaces the active edit mode next to the Edit button
 *
 * Owner: longform review (`/dev/editorial-review/<uuid>`).
 */

/* ISSUE 1 — decision strip: hide the redundant filed-applied echo.
 *
 * `.er-pending-state--filed` lives next to the action buttons and was
 * designed to signal the post-completion state. But the big rubber
 * stamp already says "applied" right beside it; the pill is pure echo
 * in the steady state. Other variants (`.er-pending-state`,
 * `.er-pending-state--iterating`, etc.) keep their job — they signal
 * that an agent /deskwork:* invocation is still pending and the
 * "copy /deskwork:..." button still applies. Only the post-skill,
 * post-completion variant is muted. */
[data-review-ui="longform"] .er-pending-state--filed {
  display: none;
}

/* ISSUE 5 — inline keyboard-shortcut chips on action buttons.
 *
 * The strip's `.er-strip-right` carries Approve/Iterate/Reject (etc.)
 * during non-terminal workflow states. Each gets a small kbd chip
 * tucked underneath the button. Reuses the existing `.er-strip-hint kbd`
 * treatment — same monospace, same dim color — so the chips read as
 * peripheral hints, not competing controls. The chip lives in a
 * `.er-shortcut-chip` wrapper (a small adjacent element the markup
 * adds; see markup-adjustment list).
 *
 * On Phase 32's #108 fix the bare-letter shortcuts became Cmd/Ctrl +
 * letter; the chip text follows. Operators see the chord without
 * having to open the shortcuts modal.
 */
[data-review-ui="longform"] .er-shortcut-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--er-space-0);
  margin-left: var(--er-space-0);
  font-family: var(--er-font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  color: var(--er-faded);
  white-space: nowrap;
  text-transform: none;
  vertical-align: middle;
}

[data-review-ui="longform"] .er-shortcut-chip kbd {
  font-family: var(--er-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  padding: 0.05rem 0.3rem;
  border: 1px solid var(--er-paper-3);
  border-radius: 2px;
  color: var(--er-ink-soft);
  background: var(--er-paper);
  line-height: 1.2;
  font-weight: 500;
}

@media (max-width: 60rem) {
  /* On narrow viewports the strip already drops the inline hint
   * (line 1090). Drop the per-button shortcut chips too — they
   * crowd the button row. The shortcuts modal stays available. */
  [data-review-ui="longform"] .er-shortcut-chip { display: none; }
}

/* ISSUE 7 — Edit-mode disclosure label.
 *
 * The Edit button toggles between Preview and Source panes. Today the
 * operator has no signal of which pane is active until they click. A
 * small uppercase tag next to the button shows the current mode so
 * the toggle's effect is legible.
 *
 * The label sits inline with the button (er-strip-right is a flex row).
 * Class is `.er-edit-mode-label`. Two data-state values: 'preview' and
 * 'source'. CSS picks the right glyph + color via attribute selector.
 */
[data-review-ui="longform"] .er-edit-mode-label {
  display: inline-flex;
  align-items: center;
  gap: var(--er-space-0);
  font-family: var(--er-font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--er-faded);
  margin-left: calc(-1 * var(--er-space-0));
  padding: 0.1rem 0.4rem;
  border: 1px dashed var(--er-paper-3);
  border-radius: 2px;
  background: transparent;
  user-select: none;
}

[data-review-ui="longform"] .er-edit-mode-label[data-mode="source"] {
  color: var(--er-proof-blue);
  border-color: var(--er-proof-blue-soft);
  border-style: solid;
}

[data-review-ui="longform"] .er-edit-mode-label::before {
  content: '⇄';
  font-family: var(--er-font-mono);
  margin-right: 0.15em;
  font-size: 0.85em;
  opacity: 0.7;
}

/* ISSUE 6 — scrapbook drawer empty state.
 *
 * The existing empty state shows BOTH a "0 items" header counter AND
 * a body line "no scrapbook items". The header counter is enough; the
 * body should offer an affordance (a path forward) instead of repeating
 * the header. The markup adjustment replaces the body content with a
 * small instructional paragraph + link; this CSS scopes the new
 * variant.
 */
[data-review-ui="longform"] .er-scrapbook-drawer-body .scrap--empty {
  font-family: var(--er-font-body);
  font-size: 0.85rem;
  font-style: italic;
  line-height: 1.5;
  color: var(--er-faded);
  padding: var(--er-space-2);
  margin: 0;
  border-left: 1px dotted var(--er-paper-3);
}

[data-review-ui="longform"] .er-scrapbook-drawer-body .scrap--empty a {
  color: var(--er-proof-blue);
  text-decoration: none;
  border-bottom: 1px solid var(--er-proof-blue);
  padding-bottom: 1px;
}

[data-review-ui="longform"] .er-scrapbook-drawer-body .scrap--empty a:hover {
  background: var(--er-proof-blue);
  color: var(--er-paper);
  border-bottom-color: var(--er-proof-blue);
}

/* ISSUE 6 — margin-notes empty state tightening.
 *
 * The original `.er-marginalia-empty` paragraph reads as instructional
 * text. Tightened markup keeps a single short sentence; CSS adds a
 * small affordance line that complements (rather than describes) the
 * floating Mark pencil.
 */
[data-review-ui="longform"] .er-marginalia-empty {
  font-family: var(--er-font-body);
  font-style: italic;
  font-size: 0.92rem;
  line-height: 1.5;
  color: var(--er-faded);
  padding: var(--er-space-2);
  margin: 0;
}

[data-review-ui="longform"] .er-marginalia-empty em {
  font-style: italic;
  color: var(--er-red-pencil);
  font-weight: 500;
}

/* ISSUE 2 — Edit button visual parity with Mark pencil.
 *
 * Both are pencil-family controls (Edit toggles source view; Mark
 * annotates). The Mark button has `::before { content: '✎ ' }` — Edit
 * gets a `⇄` glyph to signal "toggle" not "annotate". Same visual
 * weight, different verb. The class hook is the existing
 * `data-action="toggle-edit"` attribute on the button.
 */
[data-review-ui="longform"] .er-strip-right .er-btn-small[data-action="toggle-edit"]::before {
  content: '⇄ ';
  font-family: var(--er-font-mono);
  font-weight: 500;
  margin-right: 0.1em;
}
```

### `review-viewport.css` — append at the end of the file

```css

/* ---------- Longform review refinement (Phase 2 follow-up) ---------- */
/*
 * Strip-local refinement for the er-strip layout. Companion to the
 * cross-surface refinement rules in editorial-review.css.
 *
 * The strip's flex children (galley/slug/center/right) wrap on narrow
 * viewports. The new shortcut chip + edit-mode label both sit inside
 * `.er-strip-right` and need the strip-row's existing flex-wrap +
 * gap settings to keep their alignment. No structural changes to the
 * strip; just micro-spacing adjustments.
 */

/* When kbd chips appear under buttons, give the strip-right children
 * a tiny extra vertical breathing room so the chips don't visually
 * collide with the row above when the strip wraps onto a second line. */
[data-review-ui="longform"] .er-strip-right > * {
  align-self: center;
}

[data-review-ui="longform"] .er-strip-right > *:has(.er-shortcut-chip) {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--er-space-0);
  margin-bottom: 0;
}
```

---

## Server-side markup adjustments

A short, surgical list. None of these change the surface's structure; each is a targeted edit to apply the just-landed glossary mechanism, eliminate the redundant pill markup, or surface the new state-disclosure elements. All edits to `packages/studio/src/pages/review.ts`.

### A. Apply glossary tooltips to surface jargon

Find the `er-strip-galley` element (the decision-strip "Galley № 1" label). Wrap "Galley" in a glossary span. Approximate location around the strip-rendering function:

```typescript
// BEFORE
html`<span class="er-strip-galley">Galley <em>№ ${version}</em></span>`

// AFTER
html`<span class="er-strip-galley">${gloss('galley')} <em>№ ${version}</em></span>`
```

The `gloss()` helper is re-exported from `packages/studio/src/pages/html.ts`. If the import is missing in `review.ts`, add: `import { gloss } from './html.ts';` (review.ts already uses html.ts via the `html` template tag — just add the named import).

Find the `er-strip-hint` element (the "select text to mark · double-click to edit · ? for shortcuts" line). Wrap "mark" in the marginalia gloss:

```typescript
// BEFORE (approximate)
<span class="er-strip-hint" aria-hidden="true">select text to mark · double-click to edit · <kbd>?</kbd> for shortcuts</span>

// AFTER
<span class="er-strip-hint" aria-hidden="true">select text to ${gloss('marginalia')} · double-click to edit · <kbd>?</kbd> for shortcuts</span>
```

The visible word "mark" becomes "margin notes" (the gloss-key `marginalia` has `term: 'margin notes'`). That's by design — the gloss helper renders the term verbatim from `glossary.json`. If you want "mark" to remain the visible verb in the strip but still gloss to "marginalia", add a new glossary entry with `key: 'mark'` and `term: 'mark'` referencing the same gloss text — but the simpler path is to let the gloss render its own term.

### B. Remove the redundant filed-applied pill

Search `review.ts` for `er-pending-state--filed`. The CSS now hides this variant, but to fully clean up the markup, the renderer should skip emitting the pill when the state is `applied`. Look for the conditional that emits `<span class="er-pending-state er-pending-state--filed">filed (applied)</span>` — gate it on the workflow state being `iterating` or `approved` instead of `applied`. (If easier, rely on the CSS `display: none` and leave the markup; the cleanup is cosmetic.)

### C. Add inline kbd shortcut chips on action buttons

The strip's `.er-strip-right` renders the action buttons (Approve/Iterate/Reject) per workflow state. Wrap each interactive button in a `<span class="er-shortcut-chip-wrap">` that contains the button + a `<small class="er-shortcut-chip"><kbd>⌘A</kbd></small>` chip. Approximate shape:

```html
<span class="er-shortcut-chip-wrap">
  <button class="er-btn er-btn-approve" data-action="approve" type="button">Approve</button>
  <small class="er-shortcut-chip"><kbd>⌘</kbd>+<kbd>A</kbd></small>
</span>
```

Pre-Phase-32 these were single-letter shortcuts that fired on bare letter; the #108 fix made them Cmd/Ctrl + letter. The chips reflect the chord. Renders only on viewports ≥ 60rem (CSS handles the responsive cutoff).

### D. Add the edit-mode disclosure label

Next to the existing `<button data-action="toggle-edit">Edit</button>` element, emit a small companion label that mirrors the current mode:

```html
<button class="er-btn er-btn-small" data-action="toggle-edit" type="button">Edit</button>
<span class="er-edit-mode-label" data-mode="preview">preview</span>
```

The client (already at `plugins/deskwork-studio/public/src/editorial-review-client.ts`) presumably toggles a class or attribute on the edit container. Have the client also flip the label's `data-mode` attribute (`'preview' ↔ 'source'`) and inner text (`'preview' ↔ 'source'`) on each toggle. The CSS picks up the active state via the attribute selector and adjusts color/border accordingly.

If the client wiring is more involved than a one-line attribute flip, an acceptable interim is rendering the label server-side at initial state (preview) and letting the client update both attribute and text on each Edit click. This is a 3-line addition to the existing toggle handler.

### E. Top-nav: rename "Reviews" → "Shortform"; fix active-state on longform pages

The `er-folio-nav` is rendered by the studio chrome (likely `packages/studio/src/pages/chrome.ts` or a layout helper). Find the nav-item whose href is `/dev/editorial-review-shortform` and whose label is `Reviews`. Change the label to `Shortform`.

Active-state: the existing logic likely matches a current-route key against each nav-item's path. Today it must match `/dev/editorial-review-shortform` against any URL that starts with `/dev/editorial-review` — including the longform review URLs. Tighten the match to require the FULL path equal `/dev/editorial-review-shortform` (no prefix-match). Longform review pages should set their own active-state-key (e.g., none of the nav items match, so the dashboard or no-item is highlighted).

### F. Tighten the margin-notes empty-state copy

In `review.ts` find the `er-marginalia-empty` paragraph (currently around the `<p class="er-marginalia-empty" data-sidebar-empty>` line). Replace the long instructional copy with:

```html
<p class="er-marginalia-empty" data-sidebar-empty>Select text in the draft to leave a <em>margin note</em>.</p>
```

The floating ✎ Mark button's existence + the post-selection animation already communicate the affordance; the empty state shouldn't repeat the instructions verbatim.

### G. Tighten the scrapbook drawer empty-state copy

In `review.ts` find the `<div class="scrap scrap--empty">no scrapbook items</div>` element (or similar). Replace with a brief affordance-bearing line that links to the scrapbook page so the operator can drop research:

```html
<div class="scrap scrap--empty">No items yet. <a href="/dev/scrapbook/<site>/<slug>">Drop research notes →</a></div>
```

The header counter (`.er-scrapbook-drawer-count`) already shows "0 items"; the body now points the operator at the scrapbook entry surface to add some.

---

## Open design notes / things the operator should validate live

1. **The kbd chips below buttons assume modal-key chord style (`⌘+A`).** If the existing shortcuts modal uses a different rendering (e.g. spelled out as "Cmd+A" or "Ctrl A"), match that style instead of the macOS-glyph form. Verify against the modal's content.

2. **The `er-edit-mode-label` data attribute requires client-side update.** I described the contract; the client wiring change is a 1-3 line addition to the existing `[data-action="toggle-edit"]` handler. If the client doesn't currently toggle a single source-of-truth attribute, this is a small refactor.

3. **The marginalia gloss-key renders "margin notes" as the visible term.** This changes the surface text from "select text to **mark**" to "select text to **margin notes**" — which reads grammatically off. Two options: (a) add a new glossary entry with `key: 'mark'`, `term: 'mark'`, gloss text identical to marginalia (intentional duplication for grammatical fit); (b) keep the original "mark" verb in the strip-hint, gloss it via a span hand-rolled in the page renderer rather than via `gloss('marginalia')`. Option (b) gives the surface flexibility without bloating the JSON. The agent's call.

4. **The pending-state-pill hide is CSS-only.** If the markup-emit conditional change (item B above) is non-trivial, leaving the markup and relying on `display: none` is fine — semantically the pill is still in the accessibility tree but visually hidden. If accessibility wants stricter hiding, add `aria-hidden="true"` to the pill in the post-completion case.

5. **The "Reviews" → "Shortform" rename requires updating any tests that assert the nav label.** A grep for `>Reviews<` across `packages/studio/test/` should find them; trivial fix.
