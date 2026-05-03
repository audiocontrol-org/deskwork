# Entry-review surface — design output

**Pattern:** the desk inset — a clipboard view of one entry under inspection.
**Spec:** `docs/superpowers/specs/2026-05-01-studio-uxui-design.md` §5.2
**Issue:** [#152](https://github.com/audiocontrol-org/deskwork/issues/152)
**Owner module:** `plugins/deskwork-studio/public/css/entry-review.css` (new file)
**Companion edit:** `plugins/deskwork-studio/public/css/editorial-review.css` (extend `data-review-ui` scope-list to include `entry-review`)

---

## Design rationale

The entry-review surface sits between the **workbench** (dashboard, where you arrange entries) and the **galley** (longform review, where you mark up an article in margin). It needed an idiom of its own — not a sub-dashboard, not a slim review surface — and the press-check metaphor delivered: this is a **clipboard with a typed manuscript clipped under the binder**, with a small strip of stage-aware controls along the top edge of the work area. Single-column, narrow container (`--er-container-narrow`), centered. Generous vertical rhythm so the operator's eye lands on the title, then the stage badge, then the manuscript itself — never crowded by the controls. The kicker uses the existing mono-uppercase pagehead pattern; the title uses the compact pagehead size (this is one entry, not a publication). The UUID and artifact path live below the meta line in mono pills so they're searchable + copyable but never compete for attention with the stage badge.

The eight stage badges share the existing `.er-stamp` foundation — letter-spaced uppercase, 1.5px border, 2px radius, faint letterpress shadow — but each gets a distinct pigment + border-style mapped to its lifecycle position. **Ideas** is faded ink with a dashed border (still in concept; the ink hasn't dried). **Planned** is proof-blue solid (decision made, editorial blue). **Outlining** is stamp-purple dotted (mid-iteration, dot-by-dot construction). **Drafting** is stamp-purple solid (the same pigment now firm, work-in-progress). **Final** is stamp-green with a 2px solid border (approval green, weighty). **Published** is stamp-green over `--er-paper-3` (settled into the page; saturated by the paper itself). **Blocked** is red-pencil with line-through (off pipeline; the operator marked it out). **Cancelled** is faded with line-through and dashed border (terminated; the ink dried out and got crossed off). No badge rotates — this is an inline metadata badge, not a press-stamp; rotation would fight the reading flow.

The artifact body is the main event: a textarea (or `<pre>` for readonly) styled as a manuscript page clipped into the desk. JetBrains Mono at 0.92rem, line-height 1.55 — comfortable for prose, dense enough that you see the shape of the document. Paper-2 background; 1.5px solid `--er-ink` border (the binder's metal clip); a 1px inset shadow at +1px +2px in `rgba(26,22,20,0.06)` (the manuscript pressed into the clipboard). Mutable variant: cursor caret + focus ring in proof-blue. Readonly variant: cursor default + faded ink color, no caret affordance. The controls strip sits between the head and the artifact body, separated by dotted top + bottom rules — like the perforation on a press-check work order. Buttons use the existing `.er-btn` family verbs (approve → green, reject → red-pencil, iterate/save → proof-blue). Selectors get a thin label + monospace value treatment so they read as compact dropdowns rather than form chrome. The 404 variant is a single centered page with a Fraunces title, a mono UUID echo, and a back-link to the dashboard — same idiom (paper, ink, rules) but quieter.

---

## CSS rules — `plugins/deskwork-studio/public/css/entry-review.css`

```css
/*
 * entry-review.css — design system extension for the entry-review surface
 * (/dev/editorial-review/<uuid>).
 *
 * Sub-metaphor: "the desk inset — a clipboard view of one entry under
 * inspection. Sits between the workbench (dashboard) and the galley
 * (longform review). Stage-aware controls for graduating an entry."
 *
 * Spec: docs/superpowers/specs/2026-05-01-studio-uxui-design.md §5.2
 * Issue: #152 (frontend-design output)
 *
 * All tokens reference --er-* from editorial-review.css. No new tokens.
 * All selectors scoped via [data-review-ui="entry-review"].
 *
 * Companion edit: editorial-review.css extends its body[data-review-ui=...]
 * scope-list (around line 107) to include "entry-review" so this surface
 * inherits the paper-grain background applied to studio + shortform.
 */

/* ---------- Shell + container ---------- */

[data-review-ui="entry-review"] .er-entry-shell {
  max-width: var(--er-container-narrow);
  margin: 0 auto;
  padding: var(--er-space-5) var(--er-space-4) var(--er-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--er-space-4);
}

[data-review-ui="entry-review"] .er-entry-shell--missing {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: var(--er-space-3);
  max-width: var(--er-container-narrow);
  margin: 0 auto;
  padding: var(--er-space-6) var(--er-space-4);
}

[data-review-ui="entry-review"] .er-entry-shell--missing h1 {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 96, "wght" 400, "SOFT" 0;
  font-size: clamp(2.2rem, 4.5vw, 3rem);
  line-height: 0.95;
  letter-spacing: -0.02em;
  color: var(--er-ink);
  margin: 0;
}

[data-review-ui="entry-review"] .er-entry-shell--missing p {
  font-family: var(--er-font-body);
  font-size: 1rem;
  line-height: 1.55;
  color: var(--er-ink-soft);
  margin: 0;
  max-width: 36rem;
}

[data-review-ui="entry-review"] .er-entry-shell--missing code {
  /* code styling already comes from the scoped reset in editorial-review.css */
  font-size: 0.85em;
}

[data-review-ui="entry-review"] .er-entry-shell--missing a {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 14, "wght" 500;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  color: var(--er-proof-blue);
  text-decoration: none;
  border-bottom: 1px solid var(--er-proof-blue);
  padding-bottom: 1px;
  margin-top: var(--er-space-2);
}

[data-review-ui="entry-review"] .er-entry-shell--missing a:hover {
  background: var(--er-proof-blue);
  color: var(--er-paper);
  border-bottom-color: var(--er-proof-blue);
}

[data-review-ui="entry-review"] .er-entry-detail {
  font-family: var(--er-font-mono);
  font-size: 0.78rem;
  color: var(--er-faded);
  letter-spacing: 0.04em;
  margin: 0;
}

/* ---------- Head ---------- */

[data-review-ui="entry-review"] .er-entry-head {
  padding: 0 0 var(--er-space-3) 0;
  border-bottom: var(--er-rule-double);
  display: flex;
  flex-direction: column;
  gap: var(--er-space-2);
}

[data-review-ui="entry-review"] .er-entry-kicker {
  font-family: var(--er-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--er-faded);
  margin: 0;
}

[data-review-ui="entry-review"] .er-entry-title {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 96, "wght" 400, "SOFT" 0;
  font-size: clamp(2rem, 4vw, 2.8rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--er-ink);
  margin: 0;
}

[data-review-ui="entry-review"] .er-entry-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--er-space-2);
  align-items: center;
  margin: 0;
  font-family: var(--er-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--er-faded);
}

[data-review-ui="entry-review"] .er-entry-uuid {
  font-family: var(--er-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  background: var(--er-paper-2);
  color: var(--er-ink-soft);
  padding: 0.15rem 0.5rem;
  border-radius: 2px;
  border: 1px solid var(--er-paper-3);
  white-space: nowrap;
}

[data-review-ui="entry-review"] .er-entry-artifact-path {
  margin: 0;
  font-family: var(--er-font-mono);
  font-size: 0.72rem;
  color: var(--er-faded);
  letter-spacing: 0.02em;
}

[data-review-ui="entry-review"] .er-entry-artifact-path code {
  background: transparent;
  color: var(--er-ink-soft);
  padding: 0;
  font-size: inherit;
}

/* ---------- Stage badges ---------- */

[data-review-ui="entry-review"] .er-entry-stage {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 14, "wght" 600;
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.2rem 0.6rem;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  display: inline-block;
  white-space: nowrap;
  background: transparent;
  line-height: 1.3;
  box-shadow: 1px 1px 0 rgba(26, 22, 20, 0.06);
}

/* Per-stage pigment + border-style mapped to lifecycle position */

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Ideas"] {
  color: var(--er-faded);
  border-style: dashed;
}

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Planned"] {
  color: var(--er-proof-blue);
  border-style: solid;
}

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Outlining"] {
  color: var(--er-stamp-purple);
  border-style: dotted;
}

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Drafting"] {
  color: var(--er-stamp-purple);
  border-style: solid;
}

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Final"] {
  color: var(--er-stamp-green);
  border-style: solid;
  border-width: 2px;
}

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Published"] {
  color: var(--er-stamp-green);
  background: var(--er-paper-3);
  border-style: solid;
  border-color: var(--er-stamp-green);
}

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Blocked"] {
  color: var(--er-red-pencil);
  border-style: solid;
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

[data-review-ui="entry-review"] .er-entry-stage[data-stage="Cancelled"] {
  color: var(--er-faded);
  border-style: dashed;
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

[data-review-ui="entry-review"] .er-entry-prior-stage {
  font-family: var(--er-font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--er-faded);
  font-style: italic;
}

/* ---------- Controls strip ---------- */

[data-review-ui="entry-review"] .er-entry-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--er-space-2);
  align-items: center;
  padding: var(--er-space-3) 0;
  border-top: 1px dotted var(--er-faded-2);
  border-bottom: 1px dotted var(--er-faded-2);
  margin: 0;
}

[data-review-ui="entry-review"] .er-entry-controls--readonly {
  border-top-color: var(--er-paper-3);
  border-bottom-color: var(--er-paper-3);
}

/* Generic control button — extends .er-btn pattern */

[data-review-ui="entry-review"] .er-entry-control {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 14, "wght" 500;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  color: var(--er-ink);
}

[data-review-ui="entry-review"] .er-entry-control--button {
  padding: 0.4rem 0.85rem;
  border: var(--er-rule-med);
  background: var(--er-paper);
  color: var(--er-ink);
  cursor: pointer;
  border-radius: 2px;
  text-transform: uppercase;
  transition: background 120ms ease, color 120ms ease, transform 120ms ease;
}

[data-review-ui="entry-review"] .er-entry-control--button:hover:not(:disabled) {
  background: var(--er-ink);
  color: var(--er-paper);
}

[data-review-ui="entry-review"] .er-entry-control--button:active:not(:disabled) {
  transform: translateY(1px);
}

[data-review-ui="entry-review"] .er-entry-control--button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

[data-review-ui="entry-review"] .er-entry-control--button:focus-visible {
  outline: 2px solid var(--er-proof-blue);
  outline-offset: 2px;
}

/* Per-action pigment for action buttons (data-control attribute) */

[data-review-ui="entry-review"] .er-entry-control--button[data-control="approve"] {
  border-color: var(--er-stamp-green);
  color: var(--er-stamp-green);
}

[data-review-ui="entry-review"] .er-entry-control--button[data-control="approve"]:hover:not(:disabled) {
  background: var(--er-stamp-green);
  color: var(--er-paper);
}

[data-review-ui="entry-review"] .er-entry-control--button[data-control="reject"] {
  border-color: var(--er-red-pencil);
  color: var(--er-red-pencil);
}

[data-review-ui="entry-review"] .er-entry-control--button[data-control="reject"]:hover:not(:disabled) {
  background: var(--er-red-pencil);
  color: var(--er-paper);
}

[data-review-ui="entry-review"] .er-entry-control--button[data-control="iterate"],
[data-review-ui="entry-review"] .er-entry-control--button[data-control="save"] {
  border-color: var(--er-proof-blue);
  color: var(--er-proof-blue);
}

[data-review-ui="entry-review"] .er-entry-control--button[data-control="iterate"]:hover:not(:disabled),
[data-review-ui="entry-review"] .er-entry-control--button[data-control="save"]:hover:not(:disabled) {
  background: var(--er-proof-blue);
  color: var(--er-paper);
}

/* Labeled selector controls (induct, history) */

[data-review-ui="entry-review"] .er-entry-control--induct,
[data-review-ui="entry-review"] .er-entry-control--history {
  display: inline-flex;
  align-items: center;
  gap: var(--er-space-1);
}

[data-review-ui="entry-review"] .er-entry-control-label {
  font-family: var(--er-font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--er-faded);
}

[data-review-ui="entry-review"] .er-entry-control--induct select,
[data-review-ui="entry-review"] .er-entry-control--history select {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 14, "wght" 500;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  padding: 0.3rem 0.55rem;
  border: 1.5px solid var(--er-ink);
  border-radius: 2px;
  background: var(--er-paper);
  color: var(--er-ink);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

[data-review-ui="entry-review"] .er-entry-control--induct select:hover,
[data-review-ui="entry-review"] .er-entry-control--history select:hover {
  background: var(--er-paper-2);
}

[data-review-ui="entry-review"] .er-entry-control--induct select:focus-visible,
[data-review-ui="entry-review"] .er-entry-control--history select:focus-visible {
  outline: 2px solid var(--er-proof-blue);
  outline-offset: 2px;
}

/* Read-only label (terminal stages) */

[data-review-ui="entry-review"] .er-entry-control--readonly {
  font-family: var(--er-font-display);
  font-variation-settings: "opsz" 14, "wght" 500;
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.3rem 0.7rem;
  border: 1.5px dashed var(--er-faded);
  border-radius: 2px;
  color: var(--er-faded);
  background: transparent;
}

/* ---------- Artifact body — the manuscript clipped to the desk ---------- */

[data-review-ui="entry-review"] .er-entry-artifact {
  padding: 0;
  margin: 0;
}

[data-review-ui="entry-review"] .er-entry-body {
  display: block;
  width: 100%;
  min-height: 22rem;
  padding: var(--er-space-3);
  font-family: var(--er-font-mono);
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--er-ink);
  background: var(--er-paper-2);
  border: 1.5px solid var(--er-ink);
  border-radius: 2px;
  box-shadow: inset 1px 2px 0 rgba(26, 22, 20, 0.06);
  resize: vertical;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  box-sizing: border-box;
}

[data-review-ui="entry-review"] textarea.er-entry-body:focus-visible {
  border-color: var(--er-proof-blue);
  box-shadow:
    inset 1px 2px 0 rgba(26, 22, 20, 0.06),
    0 0 0 2px var(--er-proof-blue-soft);
}

[data-review-ui="entry-review"] .er-entry-body--readonly {
  cursor: default;
  color: var(--er-ink-soft);
  background: var(--er-paper-2);
  resize: none;
  user-select: text;
}

/* Reduced motion */

@media (prefers-reduced-motion: reduce) {
  [data-review-ui="entry-review"] .er-entry-control--button,
  [data-review-ui="entry-review"] .er-entry-control--induct select,
  [data-review-ui="entry-review"] .er-entry-control--history select {
    transition: none;
  }
}

/* Small viewport — controls strip wraps and the title scales down */

@media (max-width: 36rem) {
  [data-review-ui="entry-review"] .er-entry-shell {
    padding: var(--er-space-3) var(--er-space-2) var(--er-space-5);
  }

  [data-review-ui="entry-review"] .er-entry-controls {
    gap: var(--er-space-1);
  }

  [data-review-ui="entry-review"] .er-entry-control--button {
    font-size: 0.72rem;
    padding: 0.35rem 0.65rem;
  }
}
```

---

## Companion edit — `plugins/deskwork-studio/public/css/editorial-review.css`

Find the existing rule around line 107 that applies the paper-grain background to the studio + shortform full-page surfaces. Extend the selector list to include `entry-review`. The rule currently looks like:

```css
/* Full-page variants (studio + shortform own html/body) */
body[data-review-ui="studio"],
body[data-review-ui="shortform"] {
  margin: 0;
  background-color: var(--er-paper);
  background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='1 1 1 1 0, 1 1 1 1 0, 1 1 1 1 0, 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  min-height: 100vh;
  color: var(--er-ink);
  font-family: var(--er-font-body);
  line-height: 1.55;
}
```

Update to include `entry-review`:

```css
/* Full-page variants (studio + shortform + entry-review own html/body) */
body[data-review-ui="studio"],
body[data-review-ui="shortform"],
body[data-review-ui="entry-review"] {
  margin: 0;
  background-color: var(--er-paper);
  background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='1 1 1 1 0, 1 1 1 1 0, 1 1 1 1 0, 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  min-height: 100vh;
  color: var(--er-ink);
  font-family: var(--er-font-body);
  line-height: 1.55;
}
```

That's the only change to `editorial-review.css`. No other rules in that file are touched.

---

## Live markup example

This is what `packages/studio/src/pages/entry-review.ts` already emits (do NOT change the markup; the CSS rules are designed to fit it exactly):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>My PRD — entry review — dev</title>
    <link rel="stylesheet" href="/static/css/editorial-review.css">
    <link rel="stylesheet" href="/static/css/entry-review.css">
  </head>
  <body data-review-ui="entry-review">
    <main class="er-entry-shell" data-entry-uuid="9845c268-670f-4793-b986-0433e9ef4fb9">
      <header class="er-entry-head">
        <p class="er-entry-kicker">Editorial Review · entry</p>
        <h1 class="er-entry-title">My PRD</h1>
        <p class="er-entry-meta">
          <span class="er-entry-stage" data-stage="Drafting">Drafting</span>
          <code class="er-entry-uuid">9845c268-670f-4793-b986-0433e9ef4fb9</code>
        </p>
        <p class="er-entry-artifact-path"><code>docs/1.0/001-IN-PROGRESS/my-feature/prd.md</code></p>
      </header>

      <nav class="er-entry-controls er-entry-controls--mutable" aria-label="Entry controls">
        <button class="er-entry-control er-entry-control--button" type="button" data-control="save" data-entry-uuid="9845c268-...">Save</button>
        <button class="er-entry-control er-entry-control--button" type="button" data-control="iterate" data-entry-uuid="9845c268-...">Iterate</button>
        <button class="er-entry-control er-entry-control--button" type="button" data-control="approve" data-entry-uuid="9845c268-...">Approve</button>
        <button class="er-entry-control er-entry-control--button" type="button" data-control="reject" data-entry-uuid="9845c268-...">Reject</button>
        <label class="er-entry-control er-entry-control--induct">
          <span class="er-entry-control-label">Induct to</span>
          <select name="induct-to" data-entry-uuid="9845c268-...">
            <option value="Ideas">Ideas</option>
            <option value="Planned">Planned</option>
            <option value="Outlining">Outlining</option>
            <option value="Drafting">Drafting</option>
            <option value="Final">Final</option>
          </select>
        </label>
      </nav>

      <section class="er-entry-artifact">
        <textarea class="er-entry-body" name="body" rows="24" data-mutable="true">## Problem statement

The studio is missing a focused single-entry review surface ...

## Solution
...
</textarea>
      </section>
    </main>
  </body>
</html>
```

The 404 missing variant:

```html
<main class="er-entry-shell er-entry-shell--missing">
  <h1>Entry not found</h1>
  <p>No sidecar matched <code>00000000-0000-0000-0000-000000000000</code>.</p>
  <p class="er-entry-detail">The UUID isn't registered with deskwork on this project.</p>
  <p><a href="/dev/editorial-studio">Back to the studio</a></p>
</main>
```

---

## Open design questions

A handful of choices the agent + operator should be aware of:

1. **No sticky controls strip.** I considered making `.er-entry-controls` `position: sticky` so it stays visible as the operator scrolls through a long artifact. Decided against — sticky chrome reads as "app", not "press-check desk". If long-document scrolling friction surfaces during dogfood, revisit.

2. **No rotation on the stage badge.** The existing `.er-stamp-big` rotates `-1.5deg` for the press-stamp-on-paper feel. The entry-review stage badge is inline metadata next to the UUID — rotation would fight the line's reading flow. The badge gets the same letterpress shadow (`1px 1px 0 rgba(26,22,20,0.06)`) but stays upright.

3. **Generic `data-control` styling.** I used attribute selectors (`[data-control="approve"]`) rather than adding modifier classes (`.er-entry-control--approve`). The markup already carries `data-control="<verb>"`. Attribute selectors keep the markup minimal and let the verb names drive style without a class explosion. If new verbs land (per affordances changes), they get default treatment until pigments are added.

4. **`.er-entry-detail` styling is ambiguous.** It appears only in the 404 variant per the source markup, but its name suggests it could be reused elsewhere (e.g., a future "entry summary" surface). Styled as faint mono caption text — generic enough to extend.

5. **`<select>` styling is system-default for the popup itself.** Browsers don't let CSS style the dropdown options panel — only the trigger. The trigger is styled to match the studio aesthetic; the option panel gets the OS default. Acceptable for v1.

6. **Empty `seeAlso`-equivalent — no chips on this surface.** Unlike the glossary tooltip, the entry-review surface has no "see also" affordance. The operator can navigate via the dashboard (clicking another row) or the URL bar. If cross-entry navigation is wanted, it's a separate design pass.

7. **Reduced motion is light.** Only the button/select transitions are gated. The 120ms `transform: translateY(1px)` on `:active` is preserved because tactile button feedback is part of the "physical button" idiom — pressing a button on a press-check desk has weight. If reduced-motion users prefer no `:active` feedback, that can be added later.

8. **No visual indicator for `aria-busy` / pending mutations.** When the operator clicks Approve, the button POSTs to `/api/dev/editorial-review/entry/<uuid>/approve` and the page presumably reloads or updates. There's no styled "loading" state. The existing `entry-review-client.ts` may handle this; if not, the next pass can add an `[aria-busy="true"]` treatment.
