# Glossary tooltip — design output

**Pattern:** `.er-gloss` (inline term span) + `.er-gloss-tip` (tooltip card)
**Spec:** `docs/superpowers/specs/2026-05-01-studio-uxui-design.md` §3
**Issue:** [#114](https://github.com/audiocontrol-org/deskwork/issues/114)
**Owner module:** `plugins/deskwork-studio/public/css/editorial-review.css` (cross-surface)

---

## Design rationale

The glossary affordance lives in the press-check / galley aesthetic of the studio. The wrong move would be a generic web hover-card — paper-and-ink doesn't tolerate floating glassy panels with drop-shadow blur. The right metaphor is a margin annotation: a small note clipped to the proof, slightly askew, with a pointer to the term it explains. Two design moves carry the metaphor: the inline term gets a **fine 1px dotted underline** in `--er-faded` (the typesetter's "this needs a footnote" mark), and the tooltip card sits on slightly darker paper (`--er-paper-2`) with the same SVG fractal-noise grain the dashboard uses, rotated `-0.4°` so it reads as a clipping rather than a UI panel. The pointer triangle is rendered via two stacked CSS-border triangles to give a 1.5px-bordered card with an unbroken edge — a common typesetting trick to keep the card outline crisp where the pointer meets it.

The tooltip's content hierarchy mirrors the manual's section style: a small uppercase **kicker** (`Glossary · press-check`) in `--er-faded`, the gloss paragraph in Newsreader serif body, and an optional row of see-also **chips** styled as miniature stamps in `--er-proof-blue`. Chips inherit the same hover-invert pattern as `.er-btn` so they feel like the existing controls — clicking lands on the Manual's glossary anchor (`#glossary-<key>`). All animation stays under 120ms; the studio is a paper aesthetic and motion is anti-metaphor, but a hard pop is jarring — a 120ms fade with a 2px translate gives the "clipped onto the page" feeling without theatrics. The whole pattern works without JS for layout (CSS handles rotation, animation, pointer-triangle direction); JS only handles position calculation and visibility.

---

## CSS rules

To be appended to `plugins/deskwork-studio/public/css/editorial-review.css` at the end of the file, after the existing rules.

```css

/* ---------- Glossary tooltip (#114, §3) ---------- */
/*
 * Cross-surface glossary mechanism. Inline term spans get a fine dotted
 * underline (typesetter's "footnote needed" mark); on hover/focus, a margin
 * annotation card shows the gloss + optional see-also chips.
 *
 * The card is appended to <body> by the client, NOT nested inside er-gloss,
 * so [data-review-ui] still scopes correctly because [data-review-ui] is on
 * the <body> element itself.
 *
 * Owner: glossary-tooltip.ts (client) + glossary-helper.ts (server gloss()).
 */

[data-review-ui] .er-gloss {
  border-bottom: 1px dotted var(--er-faded);
  cursor: help;
  color: inherit;
  padding-bottom: 1px;
  text-decoration: none;
  transition: border-color 120ms ease, border-style 120ms ease;
}

[data-review-ui] .er-gloss:hover,
[data-review-ui] .er-gloss[aria-expanded="true"] {
  border-bottom-color: var(--er-proof-blue);
  border-bottom-style: solid;
}

[data-review-ui] .er-gloss:focus-visible {
  outline: 2px solid var(--er-proof-blue);
  outline-offset: 2px;
  border-radius: 1px;
  border-bottom-color: var(--er-proof-blue);
  border-bottom-style: solid;
}

/* The tooltip card itself — a margin annotation clipped to the proof */

[data-review-ui] .er-gloss-tip {
  position: absolute;
  z-index: 100;
  max-width: 22rem;
  min-width: 14rem;
  padding: var(--er-space-2) var(--er-space-3);
  background-color: var(--er-paper-2);
  background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='1 1 1 1 0, 1 1 1 1 0, 1 1 1 1 0, 0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  border: 1.5px solid var(--er-ink);
  border-radius: 2px;
  box-shadow: 2px 2px 0 rgba(26, 22, 20, 0.08);
  transform: rotate(-0.4deg);
  pointer-events: auto;
  animation: er-gloss-appear 120ms ease-out;
}

[data-review-ui] .er-gloss-tip[data-position="below"] {
  transform: rotate(0.4deg);
  animation-name: er-gloss-appear-below;
}

[data-review-ui] .er-gloss-tip[hidden] {
  display: none;
}

@keyframes er-gloss-appear {
  from { opacity: 0; transform: translateY(-2px) rotate(-0.4deg); }
  to   { opacity: 1; transform: translateY(0) rotate(-0.4deg); }
}

@keyframes er-gloss-appear-below {
  from { opacity: 0; transform: translateY(2px) rotate(0.4deg); }
  to   { opacity: 1; transform: translateY(0) rotate(0.4deg); }
}

/* Pointer triangle — two stacked borders so the card outline stays crisp */

[data-review-ui] .er-gloss-tip::before,
[data-review-ui] .er-gloss-tip::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
}

[data-review-ui] .er-gloss-tip::before {
  left: var(--er-space-3);
  bottom: -8px;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid var(--er-ink);
}

[data-review-ui] .er-gloss-tip::after {
  left: calc(var(--er-space-3) + 2px);
  bottom: -5px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid var(--er-paper-2);
}

[data-review-ui] .er-gloss-tip[data-position="below"]::before {
  bottom: auto;
  top: -8px;
  border-top: none;
  border-bottom: 8px solid var(--er-ink);
}

[data-review-ui] .er-gloss-tip[data-position="below"]::after {
  bottom: auto;
  top: -5px;
  border-top: none;
  border-bottom: 6px solid var(--er-paper-2);
}

/* Tooltip content — kicker, gloss, see-also row */

[data-review-ui] .er-gloss-tip-kicker {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 12, "wght" 600;
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--er-faded);
  margin: 0 0 var(--er-space-1) 0;
  line-height: 1.3;
}

[data-review-ui] .er-gloss-tip-kicker-term {
  color: var(--er-ink-soft);
  font-variation-settings: "opsz" 12, "wght" 700;
}

[data-review-ui] .er-gloss-tip-gloss {
  font-family: var(--er-font-body);
  font-size: 0.92rem;
  line-height: 1.45;
  color: var(--er-ink);
  margin: 0;
}

[data-review-ui] .er-gloss-tip-see-also {
  margin: var(--er-space-2) 0 0 0;
  padding: var(--er-space-1) 0 0 0;
  border-top: 1px dotted var(--er-paper-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--er-space-1);
  align-items: center;
}

[data-review-ui] .er-gloss-tip-see-also-label {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 12, "wght" 500;
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--er-faded);
  margin-right: var(--er-space-0);
}

[data-review-ui] .er-gloss-tip-chip {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 12, "wght" 500;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--er-proof-blue);
  border-radius: 2px;
  color: var(--er-proof-blue);
  text-decoration: none;
  background: transparent;
  transition: background 120ms ease, color 120ms ease;
  white-space: nowrap;
  cursor: pointer;
}

[data-review-ui] .er-gloss-tip-chip:hover,
[data-review-ui] .er-gloss-tip-chip:focus-visible {
  background: var(--er-proof-blue);
  color: var(--er-paper);
  outline: none;
}

[data-review-ui] .er-gloss-tip-chip:focus-visible {
  outline: 2px solid var(--er-proof-blue);
  outline-offset: 2px;
}

/* Mobile / small viewport — drop the rotation, max-width relaxes */

@media (max-width: 28rem) {
  [data-review-ui] .er-gloss-tip,
  [data-review-ui] .er-gloss-tip[data-position="below"] {
    transform: none;
    max-width: calc(100vw - var(--er-space-3) * 2);
  }
}

/* Reduced motion — skip the animation */

@media (prefers-reduced-motion: reduce) {
  [data-review-ui] .er-gloss-tip {
    animation: none;
  }
  [data-review-ui] .er-gloss {
    transition: none;
  }
}
```

---

## Tooltip-card markup convention

The client JS creates the tooltip element on demand (no template element in the page; element is constructed via `document.createElement`). The shape the JS produces:

```html
<aside class="er-gloss-tip"
       id="glossary-<term-key>"
       role="tooltip"
       aria-hidden="false"
       data-position="above">
  <p class="er-gloss-tip-kicker">Glossary · <span class="er-gloss-tip-kicker-term">press-check</span></p>
  <p class="er-gloss-tip-gloss">The final pre-print review of a galley proof. In the studio, the longform-review surface where margin notes are added before approval.</p>
  <p class="er-gloss-tip-see-also">
    <span class="er-gloss-tip-see-also-label">see also</span>
    <a class="er-gloss-tip-chip" href="/dev/editorial-help#glossary-galley">galley</a>
    <a class="er-gloss-tip-chip" href="/dev/editorial-help#glossary-proof">proof</a>
  </p>
</aside>
```

Notes on the markup convention:

- **Element is `<aside role="tooltip">`** — semantically a margin note, accessibility tree treats it as a tooltip. The `id="glossary-<term-key>"` matches the `aria-describedby` on the term span (set by the server-side `gloss()` helper).
- **`data-position="above" | "below"`** — JS sets this attribute when it determines the tooltip should flip below the term. CSS uses it to pick the rotation direction and pointer-triangle direction.
- **`<p class="er-gloss-tip-kicker">`** — the kicker has `Glossary · ` static text followed by an inner `<span class="er-gloss-tip-kicker-term">` carrying the term. The inner span gets the bold treatment.
- **`<p class="er-gloss-tip-gloss">`** — the gloss text. Single paragraph; no nested elements expected.
- **`<p class="er-gloss-tip-see-also">`** — entire block omitted when the entry has no `seeAlso`. When present, contains a label span + one or more `<a class="er-gloss-tip-chip">` elements.
- **Chip links target the Manual's glossary anchor** — `/dev/editorial-help#glossary-<term-key>` — assuming the Manual's glossary section (Phase 7 deliverable) emits anchors with that id pattern.
- **No icons, no close button** — the tooltip is dismissed via Esc / click-outside / blur. A close-button would clutter the margin-note feel.

---

## Client behavior spec (plain English)

The TypeScript client at `plugins/deskwork-studio/public/src/glossary-tooltip.ts` implements the following behaviors. The agent writes the TS file from this spec — no JS is provided here.

**Initialization:**
- Read the inlined glossary data from `window.__GLOSSARY__` (set by `layout.ts` per Task 1.6).
- Find every `<span class="er-gloss" data-term="<key>">` in the document.
- Attach event listeners to each: `mouseenter`, `mouseleave`, `focus`, `blur`.
- Attach document-level listeners: `keydown` (for Esc), `click` (for click-outside dismissal).

**Showing a tooltip:**
- On `mouseenter` or `focus` of an `.er-gloss` span: look up `entry = glossary[span.dataset.term]`. If the term is missing from the glossary data, log a warning and do nothing. (Should not happen at runtime — the server-side `gloss()` helper rejects unknown keys at render time.)
- If a different tooltip is currently shown, remove it first.
- Construct the tooltip element via `document.createElement('aside')`. Build the markup per the convention above. Append to `document.body`.
- Set `aria-expanded="true"` on the term span.
- Position the tooltip (see Position below).
- Determine the `data-position` value (above/below) and set it on the tooltip.

**Position calculation:**
- Get the term span's bounding client rect.
- Default position: tooltip's bottom-left aligns with term's top-left, so the pointer triangle sits at the bottom of the tooltip pointing down at the term.
- Compute `tooltip.offsetTop = termRect.top + window.scrollY - tooltipHeight - 8` (8px is the pointer triangle height).
- Compute `tooltip.offsetLeft = termRect.left + window.scrollX - var(--er-space-3)` (offset so the pointer triangle aligns with the term's left edge — the triangle is positioned at `left: var(--er-space-3)` inside the tooltip).
- **Flip below if cramped:** if `tooltip.offsetTop < window.scrollY + 80` (i.e., tooltip would extend above the visible viewport top by more than its own height tolerance), set `data-position="below"` and recompute `tooltip.offsetTop = termRect.bottom + window.scrollY + 8`.
- **Horizontal clamp:** if `tooltip.offsetLeft + tooltipWidth > window.scrollX + window.innerWidth - var(--er-space-3)`, shift `tooltip.offsetLeft` left so the tooltip's right edge sits at `window.scrollX + window.innerWidth - var(--er-space-3)`. (The pointer triangle stays anchored to the term; if the tooltip shifts, the triangle stays at the term's position via separate inline style.)
- **Mobile / small viewport (< 28rem):** skip the rotation and clamp width to `calc(100vw - er-space-3 * 2)` — handled by media query in CSS, so JS doesn't need special-casing.

**Hiding the tooltip:**
- On `mouseleave` of the term span: remove the tooltip and clear `aria-expanded` on the span.
- On `blur` of the term span: same as mouseleave.
- On `Escape` key: if a tooltip is showing, remove it.
- On `click` outside any `.er-gloss` and outside the tooltip itself: remove the tooltip.
- On any new `mouseenter`/`focus` (replacing): the existing tooltip is removed first (single-tooltip-at-a-time invariant).

**Touch behavior:**
- On touch devices, `mouseenter`/`mouseleave` may not fire reliably. Add a `click` listener to each `.er-gloss` that toggles the tooltip (show if hidden; hide if visible).
- The document-level click-outside listener still dismisses the tooltip when tapping elsewhere.

**Single-tooltip invariant:**
- At most one tooltip is in the DOM at any time. Showing a new one always removes the previous one first.
- Track the active tooltip element + the active term span in module-scoped variables.

**Animation:**
- Animation is CSS-only. JS does not orchestrate fades or transforms; it only adds/removes the element and the `data-position` attribute.

**Reduced motion:**
- Reduced-motion preference is respected entirely by CSS (`@media (prefers-reduced-motion: reduce)`). JS doesn't need to check the media query.

**Accessibility:**
- The term span is keyboard-focusable (`tabindex="0"` set by the server-side helper). Tab navigation should reveal tooltips.
- The tooltip's `aria-hidden` defaults to `false` when shown. Setting `aria-hidden="true"` is acceptable when in the process of removing it but not strictly necessary if the element is removed from the DOM.
- The term's `aria-describedby="glossary-<key>"` (set by server) matches the tooltip's `id`. Screen readers announce the gloss when the term is focused.

**Out of scope for the client:**
- The Manual's glossary section page rendering (Phase 7).
- Hot-loading new glossary entries (the data is inlined at page render).
- Per-user preferences (always-show-expanded, etc. — explicit non-goal in spec).
- Internationalization / translation.
- Custom positioning APIs (Floating UI, Popper.js, etc.) — the layout is simple enough to do directly with `getBoundingClientRect`.
