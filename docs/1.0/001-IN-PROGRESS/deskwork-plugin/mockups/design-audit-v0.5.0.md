## Cross-surface design audit (v0.5.0)

Tracking issue: [#31](https://github.com/audiocontrol-org/deskwork/issues/31)

---

### Executive summary

The studio is in better shape than the surface count suggests. The folio strip (Phase 17) is genuinely consistent across all eight surfaces; the editorial-print token system in `editorial-review.css` is well-structured and most stylesheets honor it. **The two structural problems are concentrated in one place**: `content.css` runs a parallel token system with subtly different hex values and ~35 hard-coded pixel spacing declarations, both inherited from the static mockup that produced the file. **The pervasive problem is component duplication**: there are six different class hierarchies for what is conceptually the same component (page-head), four for section-head, and five for row patterns. Each was internally consistent at the time it shipped; nothing was harmonized across them. Fixing the token leak in `content.css` and consolidating the page-head + section-head + row-pattern families into shared classes would close ~80% of the cross-surface friction without touching any surface's identity.

---

### Findings by surface

#### 1. Studio index — `/dev/`
**Files**: `packages/studio/src/pages/index.ts`, `plugins/deskwork-studio/public/css/editorial-nav.css` (lines 152–412)

- **Disciplined.** Uses `er-toc-*` classes; every value comes from `--er-*` tokens; scoped under `[data-review-ui]`.
- Page-head pattern: `er-toc-head` / `er-toc-head__kicker` / `er-toc-head__title` / `er-toc-head__deck`. **Fourth distinct page-head class hierarchy** in the studio.
- Section-head pattern: `er-toc-section-head` with `__ornament` / `__name` / `__count`. **Conceptually identical** to `er-section-title`'s `<ornament><title><count>` (`editorial-review.css:174`) but uses different class names.
- This page is the model for what disciplined token use looks like. Use it as the reference when fixing other surfaces.

#### 2. Dashboard — `/dev/editorial-studio`
**Files**: `packages/studio/src/pages/dashboard.ts`, `editorial-studio.css`, masthead in `editorial-review.css:97–154`

- **Page head**: `er-masthead-*` family. The original. `er-masthead-kicker / er-masthead-title / er-masthead-deck / er-masthead-meta`.
- **Inline `style=` at `dashboard.ts:253`**: `<a href="/dev/editorial-help" style="color: var(--er-red-pencil);">`. Inline style attribute hardcoded into the renderer. Should be a class on the anchor (e.g. `er-link-marginalia`).
- **Hardcoded volume**: `dashboard.ts:240` sets `volume = '01'` literally — never updated dynamically. The "Vol. 01 · № NN · Press-check" kicker is partially fake.
- **Filter strip styles inline**: `dashboard.ts:272`, `:280` use `style="margin-left: 1rem;"` directly. Should be a class (`er-filter-label--spaced`?) or token-driven.
- **Section heads use `er-section-title`** (defined in `editorial-review.css:174`). Three components — title / ornament / count — match the index's `er-toc-section-head`. Same data, different markup.
- **Calendar row** (`er-calendar-row`, defined in `editorial-studio.css:8–17`): four-column grid with hardcoded gap = `var(--er-space-2)`. Tokens used here. Good.

#### 3. Content top-level — `/dev/content`
**Files**: `packages/studio/src/pages/content.ts:160–225`, `content.css`

- **Page head**: `page-head` / `page-head__title` / `page-head__sub` / `page-head__meta`. **Fifth distinct page-head class hierarchy.** Conceptually equivalent to `er-masthead` minus the kicker, plus a 2-column grid (title-block left, meta block right) — no actual reason for divergence, the dashboard could absorb the right-aligned meta variant trivially.
- **Parallel token system at `content.css:20–60`**: defines `--paper`, `--ink`, `--ink-mid`, `--ink-light`, `--ink-faint`, `--rule`, `--rule-soft`, `--rule-deep`, `--accent`. Hex values **subtly different** from `--er-*`:
  - `--paper: #faf6ee` vs `--er-paper: #F5F1E8` — different cream
  - `--ink: #1c1816` vs `--er-ink: #1A1614` — different ink
  - `--accent: #6e2e2e` (oxblood) vs `--er-red-pencil: #B8362A` — DIFFERENT REDS
- The aliases at `content.css:46–56` only set `--er-*` to the local Writer's Catalog values; they don't *consume* the editorial-print tokens. Net effect: when content.css loads, the `--er-*` tokens are overridden with the Writer's Catalog hex.
- **35 hardcoded pixel spacing declarations** (vs 4 in `editorial-review.css`). Examples: `content.css:79` `padding: 0 56px 120px`, `:107` `gap: 32px`, `:108` `padding: 32px 0 28px`, `:166` `padding: 28px 32px 32px`, `:194` `margin-bottom: 24px`, `:201` `margin-bottom: 22px`, `:202` `padding-bottom: 22px`, `:215` `gap: 4px`, `:223` `margin: 8px 0 0`, `:240` `margin: 22px 0 0`, `:247` `gap: 14px`, `:248` `padding: 10px 0`. None use `--er-space-*`.
- **Pixel typography**: `font-size: 14px`, `font-size: 56px`, `font-size: 30px`, `font-size: 17px`, `font-size: 13px`, `font-size: 12px`, `font-size: 11px`, `font-size: 10px`, `font-size: 9px`. Editorial-print uses rem throughout.
- **`max-width: 1280px`** on `body` (`content.css:78`) vs **`max-width: 78rem` ≈ 1248px** on `er-container` (`editorial-review.css:159`) and on `er-folio-inner` (`editorial-nav.css:37`). Container width drift.
- **`padding: 0 56px 120px`** body padding (line 79) vs `padding: 0 var(--er-space-4)` in the rest of the studio. Bottom-pad of 120px is dramatic and unjustified.

#### 4. Content drilldown — `/dev/content/<site>/<project>`
**Files**: `packages/studio/src/pages/content.ts:380+`, `pages/content-detail.ts`, `content.css`

- Inherits all of #3's issues (same CSS file).
- Detail panel section heads: `.detail__sectionhead` (defined in content.css). **Sixth distinct section-head class hierarchy** (and the only one not yet enumerated). Conceptually identical to `er-section-title`.
- Tree rows: `tree-row` / `tree-row__main` / `tree-row__icon` / etc. — own row pattern, distinct from `er-calendar-row`, `scrap`, `er-toc-entry`, `project-row`.

#### 5. Longform review — `/dev/editorial-review/<slug>`
**Files**: `packages/studio/src/pages/review.ts`

- Mounts inside the production BlogLayout (per `editorial-review.css:7–9` comment) so its chrome lives partially in the host site's layout.
- **Page head**: `er-dispatch-*` family (`er-dispatch-dek` at review.ts:109, others elsewhere). **Seventh page-head class hierarchy.** Distinct from the six above.
- Action buttons: `er-btn / er-btn-small / er-btn-approve / er-btn-reject` — well-disciplined button family in `editorial-review.css`.
- Scrapbook drawer (Phase 16c): uses `scrap-row.css`. Falls into the shared component story — see scrap-row analysis under "Cross-surface findings".

#### 6. Shortform review — `/dev/editorial-review-shortform`
**Files**: `packages/studio/src/pages/shortform.ts:138–145`

- Uses `er-masthead-*` like the dashboard. Good — second consumer of the masthead component, no drift.
- Body sections use their own `sf-*` family (per page-renderer source). Consistent within itself; no cross-surface harmonization.

#### 7. Manual — `/dev/editorial-help`
**Files**: `packages/studio/src/pages/help.ts:42–67`, `editorial-help.css`

- **Page head**: `eh-cover-*` family. **Eighth page-head class hierarchy** (kicker / title / dek / imprint). The "imprint" line is unique to this page — strong / span pairs replacing the simpler meta strip.
- Section heads: `eh-section-head` with `<num><title><sig>`. Has a *signature* (`eh-section-sig`) that no other surface uses — `Stages · States` and similar. Genuinely distinct, but conceptually the same as `er-section-title`'s `<ornament><title><count>`.
- TOC component (`eh-toc`) at help.ts:78. **Different from the studio index's `er-toc-list`** even though they're conceptually the same component (a list of links with leader-style separators and "page numbers").
- Stage chain visualization (`eh-stage-chain`) is unique to the manual; reasonable to keep specialized.
- 36 pixel values per file count; mostly typography (which is fine in px). Spacing largely uses rem.

#### 8. Scrapbook viewer — `/dev/scrapbook/<site>/<path>`
**Files**: `packages/studio/src/pages/scrapbook.ts:247–266`, `scrapbook.css`

- **Page head**: `scrapbook-header / scrapbook-kicker / scrapbook-title / scrapbook-back`. **Yet another distinct hierarchy.** Has a `<hr>` separator (line 258) — none of the other surfaces use a literal `<hr>` element; they all use border-bottom on the header.
- Items use `scrap-row.css` (good — shared with review drawer + content detail).
- Breadcrumb pattern is its own thing; doesn't share with the content view's breadcrumb.

---

### Cross-surface findings

#### CSF-1: `content.css` parallel token system

**Severity: Harmful.** The studio has two visually-distinct color palettes running at the same time — editorial-print on most pages, Writer's Catalog on `/dev/content/*`. Operators see slight cream-shade drift moving between surfaces; the marginalia accent is a *different red*.

The fix is to delete the parallel tokens in `content.css:20–60` and rely on the editorial-print tokens already loaded by `editorial-review.css`. The component looks indistinguishable to a non-designer; the operator's eye stops registering the page transition as "different surface, different palette."

#### CSF-2: Pixel-spacing leak in `content.css`

**Severity: Harmful.** 35 spacing declarations in content.css are pixel literals, none of which use `--er-space-*` tokens. This is the single largest source of token-discipline drift in the studio. Examples and fixes:

| File:line | Current | Fix |
|---|---|---|
| `content.css:79` | `padding: 0 56px 120px` | `padding: 0 var(--er-space-4) var(--er-space-6)` (drops absurd 120px bottom) |
| `content.css:107` | `gap: 32px` | `gap: var(--er-space-4)` |
| `content.css:108` | `padding: 32px 0 28px` | `padding: var(--er-space-4) 0 var(--er-space-3)` |
| `content.css:166` | `padding: 28px 32px 32px` | `padding: var(--er-space-3) var(--er-space-4) var(--er-space-4)` |
| `content.css:194` | `margin-bottom: 24px` | `margin-bottom: var(--er-space-3)` |
| `content.css:202` | `padding-bottom: 22px` | `padding-bottom: var(--er-space-3)` |
| `content.css:248` | `padding: 10px 0` | `padding: var(--er-space-1) 0` (or `var(--er-space-2)`) |

…etc, ~30 more lines.

#### CSF-3: Six distinct page-head class hierarchies

**Severity: Harmful.** Different classes for the same conceptual component:

| Surface | Class root | Components |
|---|---|---|
| Dashboard | `er-masthead-*` | kicker · title · deck · meta |
| Shortform | `er-masthead-*` | kicker · title · deck · meta |
| Content top-level | `page-head__*` | title · sub · meta (no kicker; 2-col layout) |
| Content drilldown | `page-head__*` | (same; reused) |
| Studio index | `er-toc-head__*` | kicker · title · deck (no meta) |
| Manual | `eh-cover-*` | kicker · title · dek · imprint |
| Longform review | `er-dispatch-*` | dek (mounted inside BlogLayout) |
| Scrapbook | `scrapbook-header` | kicker · title · breadcrumb · back-link · `<hr>` |

Six surfaces × six class families. Each was self-consistent at the time. **Recommended unification**: introduce a single `er-pagehead-*` family with optional slots (kicker / title / deck / meta / postscript) that every surface uses. Surface-specific slot content stays per-surface; the markup hierarchy unifies.

#### CSF-4: Four distinct section-head class hierarchies

**Severity: Cosmetic.** `er-section-title` (dashboard), `er-toc-section-head` (index), `eh-section-head` (manual), `.detail__sectionhead` (content detail). All are `<ornament><title><count|sig>`. **Recommended unification**: `er-section-head` (rename from `er-section-title`) used everywhere; manual's `eh-section-num` and `eh-section-sig` map to ornament + count slots.

#### CSF-5: Five distinct row class hierarchies

**Severity: Harmful.** The "list of items" concept renders as five different markup hierarchies:

| Pattern | Used by | Notable |
|---|---|---|
| `er-calendar-row` | dashboard | grid: cover · body · status · stamp |
| `scrap` (scrap-row.css) | review drawer + content detail + scrapbook | grid varies by kind (4col / 5col / 2-row) |
| `tree-row` | content drilldown | depth-indented, hover affordance bar |
| `er-toc-entry` | index | row + leader dots + page-number-style route |
| `project-row` | content top-level | grid: num · name · count · lane |

Some genuinely differ (tree-row's depth indent, scrap's preview block). But the *base* row — left content, right meta — is the same shape five times. **Recommended unification**: `er-row` base class with modifiers (`er-row--depth`, `er-row--leader`, `er-row--scrap`, etc.). Tree depth and TOC leaders become row variants; the base styling (height, hover bg, border-bottom) lives in one place.

#### CSF-6: scrap-row.css uses pixel literals + fallback hex

**Severity: Cosmetic.** Lines 30, 31, 47, 57–58, 72, 88, 112, 119, 126, 131, 134, 147, 159, 165, 171, 179, 192. All are hardcoded px values. Also: every `var(--er-*)` reference has a hex fallback (e.g. `var(--er-rule-soft, #ebe5d4)`) using the *Writer's Catalog* hex, which means when the editorial-print stack loads the file, the fallbacks are dead code. Either remove the fallbacks (preferred, fewer-bytes) or align them to the editorial-print hex.

#### CSF-7: Container widths inconsistent

**Severity: Cosmetic.** `er-container` uses `78rem` (`editorial-review.css:159`); `er-folio-inner` uses `78rem` (`editorial-nav.css:37`); `er-toc-page` uses `56rem` (`editorial-nav.css:162`); `content.css` body uses `1280px ≈ 80rem` (`:78`); `editorial-help.css` uses `padding: 3rem 3.5rem 5rem` without a max-width container. Recommended: introduce `--er-container-wide: 78rem`, `--er-container-narrow: 56rem` tokens and consume them everywhere.

#### CSF-8: Inline `style=` attributes in renderers

**Severity: Cosmetic.** `dashboard.ts:253` (red-pencil link color), `dashboard.ts:272/280` (`margin-left: 1rem`). These should be classes. Inline styles bypass the design system's token discipline.

#### CSF-9: TOC patterns used twice without sharing

**Severity: Cosmetic.** The studio index (`er-toc-*`) and the manual (`eh-toc`) are both table-of-contents components with leader dots and "page numbers." Different markup. The manual's TOC is an in-page anchor list (links to `#sec-*`); the studio index's is a cross-page list (links to `/dev/*`). Could share a base `er-toc-list` class with two variants.

#### CSF-10: Review surface mounts inside production BlogLayout

**Severity: Cosmetic.** Per `editorial-review.css:7–9` comment, the longform review has a different chrome posture (mounts inside the host site's layout). This is by design — but it means the editorial-print masthead pattern can't apply there unmodified. Worth documenting as an architectural exception, not a bug to fix.

---

### Severity table — recommended unifications

Sorted by severity (Critical first; none currently rated Critical), then by impact-to-effort ratio.

| # | Severity | Finding | Proposed fix | Effort |
|---|---|---|---|---|
| CSF-1 | Harmful | content.css parallel token system w/ different hex | Delete `content.css:20–60` token redefinitions; let editorial-print tokens flow through | S |
| CSF-2 | Harmful | 35 px spacing literals in content.css | Replace with `--er-space-*` per the table above | M |
| CSF-3 | Harmful | 6 page-head class hierarchies for same component | Introduce unified `er-pagehead-*` w/ optional slots; migrate each surface | M-L |
| CSF-5 | Harmful | 5 row class hierarchies for same component | Introduce `er-row` base + modifiers; tree-depth/leader/scrap as variants | L |
| CSF-6 | Cosmetic | scrap-row.css px literals + dead-code fallbacks | Replace px → tokens; remove fallbacks (assume editorial-print stack) | S |
| CSF-7 | Cosmetic | Container widths inconsistent | Add `--er-container-wide / --er-container-narrow` tokens; consume everywhere | S |
| CSF-8 | Cosmetic | Inline `style=` in dashboard.ts | Replace with classes (`er-link-marginalia`, `er-filter-label--spaced`) | S |
| CSF-4 | Cosmetic | 4 section-head class hierarchies | Rename to `er-section-head`; consume everywhere | M |
| CSF-9 | Cosmetic | TOC patterns used twice without sharing | Extract `er-toc-list` base; two variants for in-page vs cross-page | S |
| CSF-10 | Cosmetic / by-design | Review surface chrome architectural exception | Document as design rule, no code change | — |

Effort scale: S = single PR, ≤200 LOC change. M = single PR, 200–500 LOC. L = phased PR series, >500 LOC across multiple files.

---

### Recommended order of operations

If you want to act on the audit, suggested sequence (each can be its own PR; each independently reviewable):

1. **CSF-1 + CSF-2 (token discipline in content.css).** Single PR. Highest impact-to-effort. Resolves the visible cream/ink/accent drift between surfaces. Touches only `content.css` and (post-fix) results in zero behavioral change to the rest of the studio.

2. **CSF-6 + CSF-8 (px in scrap-row + inline styles).** Small cleanup pass. One PR.

3. **CSF-7 (container width tokens).** Add tokens; convert consumers. One PR.

4. **CSF-4 (section-head consolidation).** Rename `er-section-title` → `er-section-head` everywhere. Map `eh-section-head` and `.detail__sectionhead` to the same class. Cosmetic but improves the codebase's grep-ability.

5. **CSF-3 (page-head consolidation).** Larger structural change. Introduce `er-pagehead-*` slot system; migrate each surface one at a time. Probably 6 commits in one PR.

6. **CSF-5 (row consolidation).** Largest change. Defer until 1–5 are in. Worth doing because it unifies the studio's "list of things" rendering, but not low-hanging.

7. **CSF-9 (TOC unification).** Defer; small benefit.

CSF-10 is documentation-only; do at any time.

---

### Tokens to add (minimal, only if you act on the recommendations)

Only proposed if the recommendations above are pursued — do not add unilaterally:

```css
:root {
  --er-container-wide: 78rem;
  --er-container-narrow: 56rem;
  --er-pagehead-pad-y: var(--er-space-6) var(--er-space-5) var(--er-space-4);
}
```

No new color tokens proposed — the existing `--er-*` palette is sufficient. The recommendation is to **stop defining parallel ones**, not add more.
