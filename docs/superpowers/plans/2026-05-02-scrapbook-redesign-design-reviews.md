## Scrapbook Redesign — Design Review Audit Trail

This file captures verbatim `/frontend-design` responses at each gate (G1, G2, G3, G4) and post-dispatch verifications (F1.6, F2.3, F3.3, F4.3, F5.4, F6.2). The plan at [`2026-05-02-scrapbook-redesign-dispatch-e-visual.md`](./2026-05-02-scrapbook-redesign-dispatch-e-visual.md) requires `/frontend-design` to ratify each gate before code-shipping tasks proceed; this is the audit record.

---

## G1 — pre-CSS design review (2026-05-02)

**Trigger:** before Task F1.4 (rewriting `scrapbook.css`).
**Inputs:** post-F1.3 live page screenshot + planned CSS draft (plan lines ~677-1076) + mockup CSS (`scrapbook-redesign.html` lines 104-518).
**Live URL:** http://127.0.0.1:47321/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan
**Screenshot:** `.playwright-mcp/scrapbook-after-f1.3-pre-css-1440.png`

### Deviations (plan vs mockup)

All five deviations are deliberate planner improvements, none are regressions:

| # | Tag | Mockup line | Plan line | Difference | Verdict |
|---|---|---|---|---|---|
| D1 | small | 200-201 | 791 | `.scrap-aside-list a.active` → `[data-active="true"]` | Acceptable — JS-friendly attribute toggling, matches `data-state` convention used on cards. |
| D2 | small | 193-201 | 784-789 | Plan adds ellipsis/min-width handling on aside list anchors | Acceptable — necessary for real filenames. |
| D3 | small | 468-470 | 1062-1066 | Plan adds `max-height: none; overflow: auto` to expanded mono preview | Acceptable — long JSON/txt expanded view needs it. |
| D4 | medium | 421-427 | 1067-1072 | Plan adds expanded-state `aspect-ratio: auto; min-height: 20rem; background-size: contain` for img-frame | Acceptable + good — portrait images don't get cropped to 4:3. |
| D5 | n/a | absent | 1075 | Plan adds `.scrap-card[data-filtered-out="true"] { display: none; }` | Acceptable — cleaner JS contract than mockup's inline display. |

**Net:** zero LARGE deviations; zero "planner got it wrong" calls. Mockup translation is faithful.

### Production-polish gaps (must be added to F1.4)

| # | Tag | Issue | Resolution |
|---|---|---|---|
| **G1.1** | medium | `body[data-review-ui="scrapbook"]` is missing from `editorial-review.css:122-124` body-bg selector group. Part-A implementer added it only to the editorial-nav.css padding-top group. Without this, the live body will lack the paper grain texture. | F1.4 must `Edit` `editorial-review.css:124` to extend that selector group. |
| **G1.2** | medium | The new client (F1.5) sets `data-search-out="true"` on cards that don't match the search query, but the planned CSS has NO rule to hide them. | F1.4 add `.scrap-card[data-search-out="true"] { display: none; }` next to the `data-filtered-out` rule. |
| **G1.3** | medium | No `:focus-visible` outlines on `.scrap-filter`, `.scrap-aside-btn`, `.scrap-tool`, `.scrap-name`, `.scrap-aside-list a`, `.scrap-search input`. Browser defaults clash with editorial palette. | F1.4 add focus-visible block (CSS below). |
| **G1.4** | small/medium | No `prefers-reduced-motion` block. The 160ms hover transform on `.scrap-card` violates the project's reduced-motion contract. | F1.4 add reduced-motion block (CSS below). |
| **G1.5** | small | No `:focus-within` on `.scrap-card`. Keyboard users tabbing into the foot toolbar get no card-level affordance. | F1.4 add subtle border-color shift on `.scrap-card:focus-within`. |

### CSS to splice into F1.4 (alongside the planner's draft)

```css
/* G1.1: editorial-review.css:124 must include data-review-ui="scrapbook"
   in the same selector group as studio/shortform/entry-review. This is a
   small Edit to a different file, NOT inside scrapbook.css. */

/* G1.2: search-driven hide (paired with data-filtered-out) */
.scrap-card[data-search-out="true"] { display: none; }

/* G1.3 + G1.5: keyboard affordances */
.scrap-filter:focus-visible,
.scrap-aside-btn:focus-visible,
.scrap-tool:focus-visible,
.scrap-name:focus-visible,
.scrap-aside-list a:focus-visible,
.scrap-search input:focus-visible,
.scrap-card[data-state="expanded"]:focus-visible {
  outline: 1px dotted var(--er-red-pencil);
  outline-offset: 2px;
}
.scrap-card:focus-within { border-color: var(--er-faded); }
.scrap-card[data-state="expanded"]:focus-within { border-color: var(--er-red-pencil); }

/* G1.4: reduced motion */
@media (prefers-reduced-motion: reduce) {
  .scrap-card,
  .scrap-card:hover {
    transition: none;
    transform: none;
  }
  .scrap-aside-list,
  .scrap-aside-list * {
    scroll-behavior: auto;
  }
}
```

### Sign-off

> **F1.4 may proceed as drafted with the four amendments G1.1–G1.5 baked in.**
> These are additive (~15-20 lines beyond the planner's ~390-line draft). No part of the planner's CSS needs to be retracted or rewritten. The mockup translation itself is faithful and includes intentional production-grade improvements (D2-D4) over the mockup's hand-tuned demo.
>
> The only aesthetic call F1.4 makes on its own is the `:focus-visible` outline style, which is grounded in the project's existing `--er-red-pencil` accent and 1px dotted convention used in breadcrumb separators and card-head dividers.

---

## F1 post-implementation visual review (2026-05-02)

**Trigger:** after F1.4 + F1.5 landed (CSS rewrite + client rewrite, including all G1 amendments).
**Inputs:** live page driven at 4 viewports (1440 / 1024 / 768 / 390) + post-F1 screenshots in `.playwright-mcp/scrapbook-after-f1-*` + inner-element computed-style measurements.

### Live measurements at 1440×900

| Property | Live value | Mockup target | Match |
|---|---|---|---|
| `.scrap-page` grid template columns | `272px 880px` | `17rem 1fr` (= 272px aside + main) | ✓ |
| `.scrap-aside` left edge | x=124, width=272 | aside-LEFT, 17rem wide | ✓ |
| `.scrap-cards` grid template columns | `430px 430px` | `repeat(auto-fill, minmax(20rem, 1fr))` at 1440 | ✓ |
| `.scrap-card[data-kind="md"]::before` background | `rgb(42, 75, 124)` | `--er-proof-blue: #2A4B7C` | ✓ |
| `.scrap-kind--md` chip background | `rgb(42, 75, 124)` | `--er-proof-blue` | ✓ |
| `.scrap-filter[aria-pressed="true"]` background | `rgb(26, 22, 20)` | `--er-ink: #1A1614` | ✓ |
| `.scrap-aside-title` font-family resolved | `Fraunces, Newsreader, …, serif` | display token | ✓ |
| `.scrap-aside-title` font-size | `25.6px` | `1.6rem` | ✓ |
| `.scrap-name` font-family resolved | `JetBrains Mono, ui-monospace, …, monospace` | mono token | ✓ |
| `.scrap-name` font-size | `13.6px` | `0.85rem` | ✓ |
| `.scrap-preview-md` font-family | `Fraunces, …, serif` | display token | ✓ |
| Body bg image | SVG `feTurbulence` data URL | grain noise | ✓ G1.1 fix verified |
| `.scrap-card` transition | `border-color 0.16s, transform 0.16s, box-shadow 0.16s` | 160ms each | ✓ |

### Multi-viewport responsive collapse

| Viewport | pageGridCols | cardsGridCols | aside on top? | Verdict |
|---|---|---|---|---|
| 1440×900 | `272px 880px` | `430px 430px` | n/a | ✓ |
| 1023×800 | `967px` (single) | n/a | true | ✓ (post-cascade-fix) |
| 1024×768 | `968px` (single) | `474px 474px` | true | ✓ |
| 768×1024 | `712px` (single) | `346px 346px` | true | ✓ |
| 390×844 | `334px` (single) | `334px` (single) | true | ✓ filter chips wrap |

### Interaction verification (1440×900)

- `/` keyboard shortcut focuses search input ✓
- Click `.scrap-filter[data-filter="md"]` → that chip aria-pressed=true, all chip false ✓
- Click `.scrap-filter[data-filter="json"]` → md card hides via `data-filtered-out="true"` ✓
- Click `.scrap-card .scrap-name` → flips to `data-state="expanded"`, `grid-column: 1 / -1`, red-pencil border, lazy-loaded markdown body rendered ✓

### Match list — section-by-section

All sections of the F1 scope MATCH the mockup at 1440×900: folio (with caveat — folio nav items differ; out-of-scope per spec section 7), page grid, aside chrome (kicker / title / meta / totals / dashed-hr separators / list / actions / path), main header (breadcrumb + search + `/` kbd hint), filter chips (6 chips, mockup-faithful pressed-state styling), cards grid (auto-fill at minmax 20rem), card chrome (head / meta / preview / foot toolbar), per-kind ribbons (verified: md=proof-blue), expanded state (improved over mockup: lazy-loaded markdown HTML body instead of unclamped excerpt — preserves prior client behavior). Inner-element typography matches the token chain exactly.

### Deviations

| Tag | Issue | Resolution |
|---|---|---|
| **medium** (G1.6) | CSS cascade ordering bug — `@media (max-width: 64rem) { .scrap-aside { position: static } }` was BEFORE the `.scrap-aside { position: sticky }` base rule, causing the responsive override to be overridden by the later base rule. Visually OK at <=64rem because single-column had no scroll context, but during scroll the aside would pin to viewport top. **Mockup itself has the same cascade bug** (mockup line 105-117 vs 119); planner faithfully copied it. | **FIXED in-thread by controller** — `scrapbook.css:11-32` reordered so the `@media` block follows the `.scrap-aside { position: sticky }` rule. Verified live: at 1023px `position: "static"` (was `"sticky"`); at 1440px `position: "sticky"` (unchanged). Tests 330 passed / 0 failed / 11 skipped (no impact). |
| deferred (F2) | Frontmatter exposed in md preview ("`--- deskwork: parentId: …`"). | F2.2 strips frontmatter. Not an F1 deviation. |
| deferred (F2) | `<em>` purple highlight (`.scrap-preview-md em { color: var(--er-stamp-purple); }`) not visually verified — F1 fixture has no `<em>` content. | F2 fixture exercises. Not an F1 deviation. |
| deferred (F3) | Per-kind extra meta absent (no "72 lines", "5 keys", "2400 × 1600" yet). | F3 scope. Not an F1 deviation. |
| deferred (F4) | Multiple cards CAN expand simultaneously; URL hash not synced; aside list `[data-active]` not toggled. | F4 scope. Not an F1 deviation. |
| deferred (F5) | "+ upload file" uses click-to-pick fallback; no drop zone overlay; no secret section. | F5 scope. Not an F1 deviation. |
| small | Card hover transform not visually exercised live (single-card scrapbook doesn't surface hover-and-shift well). CSS rule is correct by inspection; reduced-motion guard in place. | Verify in F2.3 when multi-card fixture is live. Not blocking. |
| small (acceptable) | Folio nav items don't include "scrapbook" — out-of-scope per spec section 7 (folio nav extension is its own dispatch). | Acceptable for F1. |

### Sign-off

> **F1 verified at 1440 / 1024 / 768 / 390 — page-grid swap, card chrome, per-kind ribbons, filter chips, search, expanded state, paper grain bg, keyboard affordances all match the mockup. The medium cascade-ordering deviation was fixed in-thread (`scrapbook.css` `@media` block reordered to follow the `.scrap-aside` base rule); verified at 1023px (position: static + single-col) and 1440px (position: sticky + 272px aside). Tests stay green at 330/0/11. Proceed to F2 once F1 ships its commit (after spec compliance + code quality reviews).**

### Outstanding work for F1 to complete

F1 shipped as commit `44094ee` (2026-05-02). Spec-compliance and code-quality reviews ran via `superpowers:subagent-driven-development`; spec passed clean (3 small adaptive deviations all justified by live API surface), code-quality returned APPROVED WITH MINOR FIXES with 3 important fixes applied inline before commit (10 type-cast violations replaced via `parseErrorBody`/`parseSavedItem` type-guards + `instanceof Element` narrowing; 2 silent `catch{}` fallbacks in `scrapbook.ts` removed/narrowed; `readCtx` rewritten to read `data-site`/`data-path` attrs from `.scrap-page` instead of parsing display text). Tests 330 → 331 passing. Pushed to origin.

---

## G2 — pre-preview-refinement design review (2026-05-02)

**Trigger:** before Task F2.2 (refining `renderPreview` per-kind).
**Inputs:** post-F1 live page screenshot at 1440×900 with multi-kind fixture (md/img/json/txt cards) at `.playwright-mcp/scrapbook-f2-pre-multi-1440.png` + the planned F2.2 implementation (plan lines 1591-1662) + mockup CSS (`scrapbook-redesign.html` lines 380-448 preview CSS, 595-720 per-kind card markup).
**Live URL:** http://127.0.0.1:47321/dev/scrapbook/deskwork-internal/source-shipped-deskwork-plan (with 3 temporary fixture files alongside the existing md card)
**Live measurements (4 cards visible):**
| Card | Kind | Preview class | Length | Box height | Issue |
|---|---|---|---|---|---|
| #1 | img | `scrap-preview scrap-preview--img` | 16ch (mostly markup) | 321px | none — bg-frame correct |
| #2 | txt | `scrap-preview scrap-preview--mono` | 375ch | 296px | none — line-clamped correctly |
| #3 | json | `scrap-preview scrap-preview--mono` | 166ch | 124px | content cut off mid-`"value"` (byte cap sliced through) |
| #4 | md | `scrap-preview scrap-preview-md` | 263ch | 149px | frontmatter LEAKS — yaml/jargon overflows the body |

### Per-kind sign-off

| Kind | F1 status | F2 action |
|---|---|---|
| md | frontmatter leaks | Strip leading `---\n...\n---\n` block. Plan's `stripFrontmatter` rule is correct. |
| img | matches mockup | none — no F2 changes |
| json | byte cap slices content mid-line | Replace plan's "expand byte cap" with parse-then-stringify (indent 2), fall back to raw text on parse error |
| txt | mono pre (mockup uses italic display flourish) | Stay with mono pre. Mockup's italic-display txt is an editorial flourish the renderer cannot replicate per-file. |

### Implementation details

| Item | Value | Rationale |
|---|---|---|
| `-webkit-line-clamp` (closed) | **5** | Matches mockup CSS line 401; F1 already correct |
| Frontmatter-strip rule | **Leading `---\n...\n---\n` ONLY** | Body-level `---` separators (Setext H2, thematic break) preserved. Plan's rule correct. |
| NUL-byte detection | **`text.indexOf('\0') >= 0`** after UTF-8 decode of first 2400 bytes | Real text almost never has NUL; binary files have it within first KB. **Plan typo fix**: `text.indexOf(' ')` → `text.indexOf('\0')`. |

### Edge cases

| Case | Recommendation |
|---|---|
| Empty file (0 bytes) | Omit preview block entirely — `previewExcerpt` returns null when result is empty/whitespace-only |
| Frontmatter-only file (no body) | Same as empty after strip — return null |
| Long single line (minified JSON) | Parse-then-stringify makes it multi-line; for txt, `white-space: pre-wrap` (already F1 CSS) wraps gracefully |
| Tiny image at 4:3 frame | Keep `cover` for closed (zoom acceptable in thumbnail context); expanded state already switches to `contain + aspect-ratio: auto + min-height: 20rem` |

### F2.2 amendments to bake in

1. **Fix the plan's NUL-byte typo**: `text.indexOf(' ')` → `text.indexOf('\0')`.
2. **JSON: parse-then-stringify with indent 2** (option b, NOT plan's option a). Fall back to raw content on `JSON.parse` error.
3. **Empty-result short-circuit**: `previewExcerpt` returns `null` when post-strip text is empty/whitespace-only, so caller emits no preview block (matches "other" kind behavior, prevents 6rem min-height void).

### Sign-off

> **F2.2 may proceed as drafted with the three amendments above.**
> All other plan elements (frontmatter strip rule, line-clamp 5, mono pre for json/txt, img cover/contain split, ENOENT-only catch carried from F1) are correct as drafted. No additional CSS changes needed — F1's preview CSS already implements the visual contract. F2 is server-side-only refinement.

---

## F2 post-implementation visual review (2026-05-02)

**Trigger:** after F2.2 + F2.1 landed (renderPreview rewrite + 5+1 new tests).
**Inputs:** post-F2 live page + screenshots at multiple viewports + inner-element computed-style measurements + per-card preview text inspection.

### Live measurements at 1440×900 (post-F2)

| Card | Kind | Preview length | Box height (px) | First 80ch of preview text |
|---|---|---|---|---|
| #1 | img | 16 | 321 | (empty — bg-image) |
| #2 | txt | 375 | 296 | `F2 G2 live screenshot fixture (issue #161)\n=========================...` |
| #3 | json | 141 | 124 | `{\n  "purpose": "F2 G2 live screenshot fixture (issue #161)",\n  "kind": "json",\n  "nested": {\n    "key": "value"...` |
| #4 | md | 452 | 149 | `# Plan-review surface — UX audit for the comment + iterate workflow\n\n## P0 — Same packaging defect, same effects \`http://localhost:47323/static/dist/editorial-review-client.js → 404\`...` |

**The before/after diff for the md card is the proof point:** pre-F2 showed `--- deskwork: parentId: c68dc297... title: Plan-review surface UX audit ...` (frontmatter leak); post-F2 shows the actual body content (frontmatter stripped). Verified live, not just by test.

### Multi-viewport responsive collapse (post-F2)

| Viewport | pageGridCols | cardsGridCols | aside position |
|---|---|---|---|
| 1440×900 | `272px 880px` | `auto-fill 20rem` (2-col) | sticky |
| 1024×768 | `968px` (single) | `474px × 2` | static |
| 390×844 | `334px` (single) | `334px` (single) | static |

No layout regression from F1.

### Inner-element typography (computed)

| Selector | font-family | font-style | Verdict |
|---|---|---|---|
| `.scrap-preview-md` | `Fraunces, ...` | `normal` | matches mockup CSS lines 380-391 |
| `.scrap-preview--mono` | `"JetBrains Mono", ...` | `normal` | matches mockup CSS lines 411-420 |

The G2 brief said "italic Newsreader" for md — wording miss; mockup CSS specifies upright Fraunces. Live state matches the actual mockup, not the brief wording. No action.

### Card-expand path verified

Clicking `.scrap-card[data-kind="md"] .scrap-name` flips `data-state="expanded"` + `grid-column: 1/-1` + lazy-loads the markdown body via fetch. `firstHeadingText` returned `"Plan-review surface — UX audit for the comment + iterate workflow"` — proving the parsed-markdown path (separate from the closed-state escaped-text preview) still works.

### Acknowledged design choice (NOT a deviation)

The closed-state md preview renders the markdown SOURCE (escapeHtml'd), so heading marks (`#`, `##`) and other markdown syntax appear as literal characters. The mockup's item-1 example uses prose-only content (no markdown syntax), so the mockup makes the closed preview look like "italic prose universally." In reality:

- **Closed state:** plain-text excerpt (escaped). Markdown syntax visible literally.
- **Expanded state:** lazy-loads + parses markdown via the client's `renderMarkdown`. Real h1/h2/p elements render.

This split is the right architectural call — server-side markdown rendering on every page load (every card) has marginal benefit. F1 already shipped this behavior; F2 only added frontmatter-strip on top.

### Edge cases

| Case | Coverage | Verdict |
|---|---|---|
| Binary masquerading as .txt | `binary.txt` test fixture (NUL bytes) | ✓ no preview block, no crash |
| Empty file (0 bytes) | NEW test `omits the preview block entirely for empty / frontmatter-only files` | ✓ no preview block |
| Frontmatter-only md file | Same NEW test | ✓ no preview block |
| Invalid JSON | Try/catch falls through to raw text | ✓ no crash, raw shown |
| Long single line (txt) | `white-space: pre-wrap` (F1 CSS) wraps gracefully | ✓ no horizontal scroll |
| Tiny image at 4:3 frame | apple-touch-icon live fixture renders zoomed; expanded view → contain | ✓ acceptable trade-off |

### Sign-off

> **F2 verified — proceed to F3.**
> Frontmatter strip works on the project's real markdown fixture (the only md card in the live scrapbook went from yaml-leak to body-content). JSON parse-then-stringify ratified by dedicated minified-input test. Binary-as-text + empty/frontmatter-only short-circuit both have explicit regression tests. Multi-viewport collapse holds; cascade-fix from F1 unaffected. Card-expand path with parsed markdown verified live.
> Test count 331 → 338 passing (+6 F2.1 tests + 1 NEW empty/fm-only short-circuit regression). 0 failed. 11 skipped.

