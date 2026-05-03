---
deskwork:
  id: b4569987-3575-4f41-aa23-2e3ba06a9124
---
## Design: studio UX/UI comprehensive design pass

**Status:** approved 2026-05-01 (brainstorming)
**Implementation:** pending — will be planned via `superpowers:writing-plans` and implemented per surface using `/frontend-design:frontend-design` for visual design output.
**Scope:** comprehensive design pass across 7 deskwork-studio surfaces, addressing 16 in-scope Category-A studio UX/UI issues + cross-cutting glossary mechanism (#114). One additional issue (#54 margin-note agent reply) is deferred per §10. Covers in-flight work after v0.12.1.

### Revision history

- **v1 (2026-05-01)** — initial design from brainstorming. Operator chose Approach C (comprehensive scope), Approach 1 (one umbrella spec, phased implementation plan), Approach B (keep typesetting jargon + add glossary tooltips). Theme architecture explicitly out of scope — operator decision: "I don't want to work on theme support yet." Frontend-design:frontend-design is the binding tool for visual design output.

---

## §1 — Goals + non-goals

### Goals

- The studio is in working order against this project's calendar — every documented affordance functions, every promised page renders styled, every empty state is intentional. Operator can dogfood audiocontrol.org without bloodying their fingers.
- The press-check / galley aesthetic is preserved as the studio's default look. Future themes are unblocked architecturally (CSS tokens stay the substrate) but no theme work happens here.
- Every in-scope Category-A studio-surface UX/UI issue (16 issues across 7 surfaces) is addressed — fixed, redesigned, or verified moot.
- The typesetting vocabulary (#114) becomes a feature, not a barrier — kept in-place with hover-tooltip glossary terms and a glossary section in the Manual.
- Visual design output is produced by `/frontend-design:frontend-design`, not by hand-written CSS. The agent's job is wiring, integration, and design briefs — not visual choices.
- The new entry-review surface (`/dev/editorial-review/<uuid>`, currently unstyled) gets a from-scratch design pass that joins the existing pattern language.

### Non-goals (explicit)

- Theme architecture / `[data-theme]` switching / theme-author docs.
- CLI verb UX / skill prose UX (Category B issues: #84, #65, #64, #62, #61, #60, #59, #58, #57).
- dw-lifecycle plugin work (Category C: #115–#136).
- #142 stage-rename — design accommodates future renaming (uses stage IDs internally, not hardcoded display names) but does not drive it.
- #54 agent-reply margin notes — feature work, separate arc.
- Forward-looking features: #85 version-diff, #86 Google Docs, #87 skinnable studio, #82 voice catalog, #83 mutation-commits, #53 install-author prompt.
- Performance work (#30 content-tree caching) unless it surfaces as a UX blocker.
- Audiocontrol.org dogfood. That's the post-design-pass payoff, not part of the design pass.

---

## §2 — Design language continuity

The existing design language stays exactly as-is. This section names it so the spec has something concrete to point at.

### Root metaphor

A press-check desk. Galley proofs under a pool of light. Red pencil. Rubber stamps. Marginalia. A pot of ink, not a dashboard. Every surface inherits this root.

### Per-surface sub-metaphors (locked)

| Surface | Sub-metaphor |
|---|---|
| Dashboard | The day-of-shoot board / workbench (entries laid out by stage like a cork-board) |
| Longform review | The galley proof itself (mounts inside the rendered article; margin notes are real margin marks) |
| Shortform desk | The coverage matrix (rows × platforms grid) |
| Content view + scrapbook | The flat plan + scrapbook spread (file tree → detail panel) |
| Manual | The reference book / compositor's manual |
| Index page | The doorway / lobby |
| **Entry-review (NEW)** | **The desk inset — a clipboard view of one entry with stage-aware controls for graduating it.** Sits between the workbench (dashboard) and the galley (longform review). |

### Token inventory to preserve verbatim (already in `editorial-review.css :root`)

- **Type:** Fraunces (display), Newsreader (body), JetBrains Mono (code).
- **Paper / ink palette:** `--er-paper`, `--er-paper-2`, `--er-paper-3`, `--er-ink`, `--er-ink-soft`, `--er-faded`, `--er-faded-2`.
- **Marking pigments:** `--er-red-pencil`, `--er-red-soft`, `--er-proof-blue`, `--er-proof-blue-soft`, `--er-highlight`, `--er-highlight-soft`, `--er-stamp-green`, `--er-stamp-purple`.
- **SVG fractal-noise paper grain** (`body[data-review-ui="studio"|"shortform"]` background).
- **Stamp pattern** (`.er-stamp` family, rotated `-1.5deg`, letter-spaced uppercase, dashed/dotted/solid borders by state).
- **Button pattern** (`.er-btn` family, uppercase letterspaced, hover invert paper↔ink).
- **Container widths:** `--er-container-wide` (78rem), `--er-container-narrow` (56rem).

### What needs extending (not changing)

- `[data-review-ui="entry-review"]` joins the scope list (currently `studio|longform|shortform|manual`). Body-level treatment for entry-review aligns with `studio` + `shortform` (full-page paper background, noise grain).
- The `er-entry-*` class family gets visual rules per the entry-review sub-metaphor — designed by `/frontend-design:frontend-design` against the brief "stage-aware desk inset / clipboard view".
- Glossary tooltip pattern (§3) is new — a treatment that doesn't exist yet but must align with the marking-pigments / paper aesthetic.

### Explicit non-evolution

No font swaps, no palette adjustments, no new container widths, no spacing-scale changes. Existing tokens are the floor and the ceiling for this design pass. Future themes can deviate; this pass cannot.

---

## §3 — Glossary mechanism (#114 deliverable)

Architecture for the hover-tooltip glossary that lets the typesetting jargon stay distinctive without being a barrier.

### Term inventory (initial)

Final list authored in the glossary JSON.

**Typesetting / printing:**
- *press-check* — final pre-print review
- *galley* — a column proof of typeset copy
- *compositor* — the typesetter; here, the operator-and-agent pair driving the workflow
- *proof* — a draft for review
- *marginalia / margin notes* — notes written in the margins of a proof
- *stamp* — a status badge
- *kicker* — small label above a title
- *flat plan* — editorial layout-planning document
- *desk inset* — (new) the stage-aware control surface for one entry
- *dispatch* — moving a proof through pipeline stages
- *stet* — proofreading mark meaning "let it stand"
- *scrapbook* — research material kept alongside an article

**Skipped (everyday English, no gloss):** press, publishing, draft, review, edit, approve.

### Markup pattern

- Server emits term occurrences as `<span class="er-gloss" data-term="<key>">press-check</span>` from a helper (e.g., `gloss('press-check')` in the html template helpers).
- Term key is the canonical lookup key into the glossary JSON.
- The visible text inside the span is the term as it appears in copy (allowing inflection: *press-checks*, *pressed*, etc.).
- Designed by `/frontend-design:frontend-design`; the design brief specifies "dotted underline on a paper-colored aside that fits the marking-pigments aesthetic — feels like a footnote, not a hover-card."

### Content source

- `packages/studio/src/data/glossary.json` — single source of truth.
- Schema: `{ "<term-key>": { "term": "press-check", "gloss": "...", "seeAlso": ["proof", "galley"] } }`.
- Glossary section in the Manual (#114 deliverable) renders from the same JSON.
- New terms are added by editing the JSON; no code changes needed.

### Behavior

- Hover OR keyboard focus reveals tooltip.
- Esc dismisses; click-outside dismisses.
- Tooltip is keyboard-focusable for accessibility (the term span is `tabindex="0"`, `role="button"`, `aria-describedby` linking to a hidden description block).
- Tooltip position: above the term, flips to below near top edge. Designed by frontend-design.

### Surfaces

- Every studio surface includes the glossary client (added to `layout.ts` once — applies to dashboard, entry-review, longform review, shortform desk, content view, manual, index).
- CSS lives in `editorial-review.css` (loaded by all surfaces).
- Server-side helper `gloss()` is the only addition to per-surface page renderers.

### Manual integration (#114 deliverable)

- Manual gains a new section `Glossary` rendered from the same JSON.
- Each term in the glossary section has its own anchor (`#glossary-press-check`); tooltips also link to the anchor for "see full entry."

### Out-of-scope for §3

- Translation / i18n (single-language glossary for now).
- Per-user glossary preferences.
- Glossary-as-a-skill (operator-authored term additions via skill).

---

## §4 — Cross-surface patterns inventory

The COMPLETE list of patterns shared across surfaces. Single source of truth per pattern. Per-surface variation lives in the surface's own CSS module, not by forking the shared pattern.

### Existing patterns (preserve as-is)

| Pattern | Class family | Owner module | Used by |
|---|---|---|---|
| Pagehead (masthead, kicker, breadcrumb) | `er-pagehead-*` | `editorial-review.css` | dashboard, content view, scrapbook, manual, shortform, studio index, **+entry-review** (new) |
| Stamp (status badge) | `er-stamp`, `er-stamp-{open,in-review,iterating,approved,applied,cancelled}`, `er-stamp-big` | `editorial-review.css` | dashboard, longform review, shortform desk |
| Button | `er-btn`, `er-btn-{primary,approve,reject,small}` | `editorial-review.css` | every surface with actions |
| Type tokens | `--er-font-{display,body,mono}` | `editorial-review.css :root` | every surface |
| Color / pigment tokens | `--er-paper`, `--er-ink`, `--er-red-pencil`, `--er-proof-blue`, `--er-stamp-{green,purple}`, etc. | `editorial-review.css :root` | every surface |
| Container widths | `--er-container-{wide,narrow}` | `editorial-review.css :root` | every surface |
| Paper grain background | SVG fractal-noise on `body[data-review-ui="studio"\|"shortform"]` | `editorial-review.css` | dashboard, shortform desk, **+entry-review** (new) |
| Scoped reset | `[data-review-ui]` rules for `*`, `a`, `code`, `[hidden]` | `editorial-review.css` | every surface (already includes entry-review when added to scope list) |

### New patterns introduced by this design pass

| Pattern | Class family | Owner module | Used by |
|---|---|---|---|
| Glossary tooltip (§3) | `er-gloss` (term span), `er-gloss-tip` (tooltip card) | `editorial-review.css` | every surface |
| Entry-review desk inset | `er-entry-*` (whole family) | new file `entry-review.css` | entry-review only |

### Patterns that stay per-surface (NOT unified)

- **Empty states** — kept per-surface. Dashboard empty stages already use `data-empty-stage="..."` (from #112 fix); shortform desk has its own empty cell treatment. Forcing a unified empty-state pattern constrains frontend-design unnecessarily.
- **Action bar / decision strip** — kept per-surface. Entry-review controls (stage-aware) ≠ longform review decision strip (approve/iterate/reject) ≠ dashboard row actions. Each surface's controls are shaped by its content; unifying loses fit.
- **Layout structure** — each surface keeps its own metaphor-specific layout (corkboard for dashboard, galley for longform, matrix for shortform, file-tree-and-detail for content view, etc.). The chrome (pagehead, scope reset, tokens) is shared; the body is each surface's own.
- **Margin notes / annotations** — stay on longform review only for this design pass. (Adding them elsewhere is the #54 feature, explicitly out of scope.)

### Rule for new patterns added during implementation

- A pattern is "cross-surface" only if it appears on ≥2 surfaces *and* the surfaces don't have legitimate reasons to differ.
- New cross-surface patterns must be added to this inventory before being introduced.
- Per-surface variants of cross-surface patterns are forbidden — modify the shared owner if the existing pattern doesn't fit.

---

## §5 — Per-surface redesign chapters

For each surface: sub-metaphor (locked), what stays, what changes, issues addressed (some flagged moot-pending-verification), frontend-design brief. All visual design lands via `/frontend-design:frontend-design` against the briefs below; the chapters scope intent, not pixels.

### §5.1 Dashboard

*Sub-metaphor: day-of-shoot board / workbench.*

**Stays:** 8-stage pipeline (Phase 30); entry-uuid row links; status-stamp wrap (Phase 32 #117); locale dates (#109); compact empty stages (#112); version masthead (#111).

**Changes:**
- **#75** (Publish button 404 on PRDs) — verify Phase 30 dashboard rewrite didn't already remove it; if still present, rewire to entry-centric model.
- **#98** (scaffold button → dead `/api/dev/editorial-calendar/draft`) — almost certainly Phase 30 collateral; remove or rewire.
- **#99** (intake form silent on copy) — verify Phase 27's unified clipboard helper picks it up; integrate if not.
- **#105** (rename empty-slug no-op) — Phase 32 #124 deleted the orphaned rename-form; rename UX needs a redesigned home (likely entry-review surface, not dashboard) — disposition is a frontend-design decision.
- **#68** (state-signature polling 404) — confirmed pre-existing per Phase 32 journal; fix endpoint or kill polling.

**Issues in scope:** #75, #98, #99, #105, #68 (verify-then-redesign).

**Brief:** Day-of-shoot workbench. Stages laid out as columns; entries as cards. Action buttons match entry-centric model post-Phase-30 (no legacy publish/scaffold endpoints). Empty stages collapse to header.

### §5.2 Entry-review (NEW)

*Sub-metaphor: desk inset / clipboard view of one entry.*

**Needed:** complete CSS for `er-entry-*` family (#152 — currently 0 rules); stage badge variant (`er-entry-stage[data-stage]`); stage-aware control set already implemented in `entry-review.ts`; missing-entry 404 variant (`er-entry-shell--missing`).

**Issues in scope:** #152 (pure design work). Possibly #105 (if rename moves here).

**Brief:** Clipboard / desk inset on the press-check desk. Single entry under inspection: title, stage badge, UUID, artifact path. Stage-aware controls (approve / cancel / block / induct / save / iterate / reject buttons + history dropdown + induct-to selector) arranged as the er-entry-controls strip. Artifact body shown as monospace preview (read-only) or editable textarea. Read-only and mutable variants both designed. Missing-entry 404 variant.

### §5.3 Longform review (LEGACY)

*Sub-metaphor: galley proof + margin marking. Mounts inside production BlogLayout.*

**Stays:** BlogLayout host; `er-dispatch-*` family (review-viewport.css); margin-note authoring + display; approve/iterate/reject decision strip; voice-drift column; recent-proofs strip.

**Changes:**
- **#108** (destructive single-letter shortcuts) — require modifier (Cmd/Ctrl) or chord. Operator picks during impl.
- **#73** (no TOC view) — add collapsible TOC for long documents.
- **#74** (Approve clipboard race) — verify Phase 27 unified clipboard helper covers it; integrate if not.

**Issues in scope:** #73, #74 (verify), #108.

**Brief:** Galley proof. TOC pane that doesn't fight the BlogLayout. Approve/iterate/reject keybindings get a modifier. Clipboard interactions use the unified helper.

### §5.4 Shortform desk

*Sub-metaphor: coverage matrix (rows × platforms).*

**Stays:** matrix layout; compose button per empty cell; active-workflow link per filled cell.

**Changes:**
- **#72** (hard-coded reddit/linkedin/youtube/instagram) — platforms come from `.deskwork/config.json` (or sidecar).
- **#106** (empty-state references nonexistent "coverage matrix") — either build the matrix it promises (which is *this* surface — recursive) or rewrite the copy.

**Issues in scope:** #72, #106.

**Brief:** Coverage matrix. Rows = entries. Columns = configured platforms. Cell states: empty (compose btn) / in-progress (link to review) / published (stamp + URL). Empty-matrix copy never references unbuilt surfaces.

### §5.5 Content view + scrapbook

*Sub-metaphor: flat plan + scrapbook spread.*

**Stays:** file-tree nav; detail panel per file; scrapbook viewer (subsumed under content view per Phase 32).

**Changes:**
- **#71** (fabricates `/blog/<slug>` URL for non-website collections) — verify v0.8.x non-website-collection support fixed it; if not, gate on `host` presence.
- **#103** (content-detail panel reports "no frontmatter / no body" for files that have both) — verify whether Phase 32 #145 collateral fixed it; otherwise fix.

**Issues in scope:** #71 (verify), #103 (verify).

**Brief:** File tree with detail panel. Hierarchical paths (deep nesting works). Detail panel: artifact path, frontmatter table (when present), body preview, scrapbook items as image+caption cards. No fabricated URLs when no host configured.

### §5.6 Manual

*Sub-metaphor: reference book / compositor's manual.*

**Stays:** section-based layout; inline term highlighting (now powered by §3 glossary).

**Changes:**
- **#104** (legacy /editorial-* slash names) — verify Phase 30 Manual rewrite caught all of them; rewrite remaining to /deskwork:* + /dw-lifecycle:* equivalents.
- **NEW: Glossary section** — rendered from `glossary.json` (§3 deliverable). Each term has its own anchor.

**Issues in scope:** #104 (verify), #114 (glossary section deliverable).

**Brief:** Reference book. Add Glossary section after the Reference section. Glossary entries render with term, gloss, see-also chips, and anchor-link. Tooltips elsewhere link back to glossary anchors.

### §5.7 Index page

*Sub-metaphor: doorway / lobby.*

**Stays:** welcome copy; section listing.

**Changes:**
- **#107** (Longform / Scrapbook unlinked) — explicit links to: dashboard, longform review (entry surface or active-workflow listing), shortform desk, content view, manual.

**Issues in scope:** #107.

**Brief:** Doorway. One card per surface: name, one-line description, direct link. Link copy uses press-check vocabulary with glossary tooltips on first occurrence of each term.

---

## §6 — Issue coverage matrix

Every Category-A issue → where it's addressed in the spec. Verify-then-redesign items are flagged; the implementation phase 0 verification confirms whether they're moot or active.

| # | Title (abbrev) | Surface chapter | Status entering impl |
|---|---|---|---|
| #68 | dashboard polls dead `/state-signature` | §5.1 | ACTIVE — confirmed pre-existing per Phase 32 journal |
| #71 | content tree fabricates `/blog/<slug>` for non-website | §5.5 | ACTIVE (Phase 0 verified 2026-05-01) — source-level fabrication in `content.ts:400-404` and `content-detail.ts:302-307` not gated on `host` presence; dormant in this project (docs lack `slug` field) but real for any collection with slug-bearing docs |
| #72 | shortform desk hard-coded platforms | §5.4 | ACTIVE |
| #73 | longform review has no TOC | §5.3 | ACTIVE |
| #74 | longform Approve clipboard race | §5.3 | MOOT (Phase 0 verified 2026-05-01) — Phase 27 unified `copyOrShowFallback` is integrated in `editorial-review-client.ts:1462`, with explicit code comment citing #74 |
| #75 | dashboard Publish button 404 on PRDs | §5.1 | MOOT (Phase 0 verified 2026-05-01) — Phase 30 dashboard rewrite removed the Publish button; publishing is now CLI-only |
| #98 | dashboard scaffold button POSTs to dead endpoint | §5.1 | MOOT (Phase 0 verified 2026-05-01) — Phase 30 retired the button + endpoint (orphaned client handler at line 76 of editorial-studio-client.ts is unreachable) |
| #99 | intake form silent on copy click | §5.1 | MOOT (Phase 0 verified 2026-05-01) — new dashboard intake form (lines 356-407) uses `copyOrShowFallback` with input validation + fallback panel; explicit code comment cites #99 |
| #103 | content-detail panel false "no frontmatter / no body" | §5.5 | MOOT (Phase 0 verified 2026-05-01) — fixture file with both fields renders both correctly; Phase 32 #145 collateral fix |
| #104 | Manual uses legacy `/editorial-*` slash names | §5.6 | ACTIVE (Phase 0 verified 2026-05-01) — 7 legacy references remain in rendered manual: `/editorial-cross-link-review`, `/editorial-performance`, `/editorial-reddit-opportunities`, `/editorial-reddit-sync`, `/editorial-review-shortform`, `/editorial-social-review`, `/editorial-suggest` |
| #105 | dashboard rename empty-slug no-op | §5.1 / §5.2 | ACTIVE — Phase 32 #124 deleted the orphaned form; rename UX needs new home |
| #106 | shortform desk empty-state references nonexistent matrix | §5.4 | ACTIVE |
| #107 | Index page leaves Longform / Scrapbook unlinked | §5.7 | ACTIVE |
| #108 | longform review destructive single-letter shortcuts | §5.3 | ACTIVE |
| #114 | typesetting jargon without glossary | §3 + §5.6 | ACTIVE — addressed by glossary mechanism + Manual section |
| #152 | entry-review page ships unstyled | §5.2 | ACTIVE — pure design work |

**Issues confirmed already-fixed in v0.12.1 (no work needed):** #109, #110, #111, #112, #113, #117, #124, #143, #144, #145, #147, #148, #149, #150 — verified during Phase 32 release verification, closed by operator.

**Phase 0 of implementation:** verify the 6 VERIFY items against current code state before any redesign work; reclassify each as ACTIVE or MOOT, post comments on the corresponding GitHub issues, close the moot ones (operator's call per the closure rule).

---

## §7 — Frontend-design contract

The binding rule: every visual design output (HTML markup decisions, layout, CSS rules, component structure) for the surfaces in scope is produced via `/frontend-design:frontend-design`. The agent's role on visuals is providing the brief, integrating the output, and wiring server-side rendering — not making visual choices.

### When `/frontend-design:frontend-design` is invoked

- Once per surface chapter (§5.1 through §5.7).
- For the glossary tooltip pattern (§3) as a stand-alone invocation — produced first because every surface depends on it.
- Re-invoked for any surface whose initial output needs revision.

### Brief format passed to frontend-design

The brainstorming session's per-surface brief (from §5) is the seed. Each invocation packages:
- **Surface name + sub-metaphor** (e.g., "entry-review — desk inset / clipboard view").
- **Existing design language to preserve verbatim:** all tokens from §2, all cross-surface patterns from §4 listed under "Existing patterns".
- **What stays / what changes / issues addressed** (§5 chapter for that surface).
- **Class family to design** (e.g., `er-entry-*` for §5.2; `er-gloss` + `er-gloss-tip` for §3).
- **Anti-goals:** no new fonts; no palette adjustments; no new container widths; no spacing-scale changes; no theme-switching machinery; no margin-note features unless explicitly in brief.
- **Reference artifacts:** `editorial-review.css` as the design-language source; the existing surface's source HTML (where one exists) for context.

### Output expected from frontend-design

- HTML structure (or markup conventions) for the surface — usable directly in the page renderer (`packages/studio/src/pages/<surface>.ts`) or as a template fragment.
- CSS rules — appended to the appropriate stylesheet (`editorial-review.css` for cross-surface patterns; surface-specific stylesheets for surface-specific rules; new `entry-review.css` for the entry-review surface).
- Optional: client-side JS module (`plugins/deskwork-studio/public/src/<name>.ts`) when the surface has interactive behavior (e.g., glossary tooltip dismissal, TOC collapse).
- A short rationale per design choice (~1 paragraph each) so the agent can integrate without re-litigating.

### Agent's role on each frontend-design output

- Read the brief and output. Don't second-guess visual choices.
- Wire the markup into the page renderer. Adjust to fit server-side templating (HTML escaping, dynamic data, template helpers like `gloss()`).
- Wire the CSS into the right stylesheet. Don't refactor the design's CSS for "consistency" — it's by definition consistent with the brief.
- Wire the client JS via the existing `<script type="module">` pattern in `layout.ts`.
- Run `npm run dev` to confirm it renders; iterate the brief if the output doesn't fit (don't hand-edit the design output to make it fit).
- Forbidden: hand-writing CSS for any surface in scope. Forbidden: skipping `/frontend-design:frontend-design` because "the change is small."

### When `/frontend-design:frontend-design` is NOT invoked (allowed exceptions)

- Server-side route logic (e.g., adding `gloss()` helper to template helpers; wiring the glossary JSON; resolving `data-stage` colors to tokens).
- Bug fixes on already-styled surfaces that don't change the design (e.g., #74 clipboard race fix, #108 keybinding modifier change — these are interaction logic, not visual design).
- Verification work on VERIFY-status issues (Phase 0 of impl) — confirming current state via curl / DOM inspection, not redesigning anything.

### Failure mode to avoid

*"I'll just write a quick CSS rule to make it work."* That's the lame-design path the operator named. Even one such rule erodes the brief's authority. If the surface's design isn't right, re-invoke frontend-design with a refined brief.

---

## §8 — Implementation sequencing

Phased plan. Phase 0 verifies; Phase 1 lays foundation; Phases 2-8 redesign each surface. Each phase is implementable in dev mode (Phase 31 workflow). Releases happen when a meaningful chunk lands — operator decides which phase boundaries warrant a release.

| Phase | Scope | Surfaces / patterns | Issues | Frontend-design invocations |
|---|---|---|---|---|
| **0** | **Verification** — confirm or refute the 6 VERIFY-status issues against current code state | All surfaces | #71, #74, #75, #98, #99, #103, #104 | None (verification only) |
| **1** | **Glossary mechanism (§3)** — JSON schema, `gloss()` template helper, `er-gloss`/`er-gloss-tip` markup pattern, client tooltip JS | All surfaces (foundation) | #114 (mechanism part) | 1× (glossary tooltip pattern) |
| **2** | **Entry-review surface (§5.2)** — `er-entry-*` family, stage badge, control strip, artifact display, missing-entry 404 | entry-review | #152 | 1× (entry-review surface) |
| **3** | **Dashboard (§5.1)** — Phase 0 outputs drive: remove dead buttons, rewire active ones, fix polling endpoint or kill it, integrate clipboard helper if not already, redesign rename UX placement | dashboard | #68, #75, #98, #99, #105 (or rename moves to §5.2) | 1× (dashboard touchups; only invoked if Phase 0 reveals real visual changes) |
| **4** | **Longform review (§5.3)** — TOC, keybinding modifiers, clipboard fix | longform review | #73, #74, #108 | 1× (TOC pane; keybinding + clipboard are interaction-logic, no design invocation) |
| **5** | **Shortform desk (§5.4)** — config-driven platform list, empty-state copy fix | shortform desk | #72, #106 | 1× (shortform desk — config-driven matrix + copy) |
| **6** | **Content view + scrapbook (§5.5)** — gate `/blog/<slug>` on host presence, fix detail-panel false-negative | content view + scrapbook | #71, #103 | 0-1× (only if Phase 0 verification reveals visual changes; both look like server-side fixes) |
| **7** | **Manual (§5.6)** — slash-command rewrite to /deskwork:* + /dw-lifecycle:*, NEW glossary section rendered from glossary.json | manual | #104, #114 (Manual section) | 1× (Manual glossary section + revised section structure) |
| **8** | **Index page (§5.7)** — explicit links to longform / shortform / scrapbook / manual; copy with glossary tooltips | index page | #107 | 1× (index page card layout) |

**Total frontend-design invocations: 6-8** depending on Phase 0 outcomes.

### Suggested release cadence (operator's call)

- After Phase 2 — most visible win (entry-review goes from blank to designed); cuts v0.13.0.
- After Phase 4 — review surfaces fully addressed; cuts v0.13.x.
- After Phase 7 — content/manual sweep done; cuts v0.14.0.
- After Phase 8 — full design pass complete; cuts v0.14.x or hold for next-feature batching.

**Phase boundaries are pauseable.** The operator can pause between any phases without leaving the studio in a broken state — each phase ends with all tests green and that surface in working order. Mid-phase pause is fine but leaves the surface mid-redesign; ride to phase end where possible.

### Critical-path order rationale

- Phase 0 first: verification cheaper than re-design; reduces Phase 3-6 scope.
- Phase 1 before any surface: the glossary mechanism is a per-surface dependency.
- Phase 2 next: highest-value (operator's current friction); least uncertainty (pure design work, no verification needed).
- Phases 3-8 in dogfood-path order: dashboard (entry surface) → review surfaces → content → reference (manual + index).

---

## §9 — Testing approach

Per-phase testing follows the existing project conventions in `.claude/rules/testing.md`. Visual changes verified manually in the dev-mode browser; behavioral changes covered by vitest unit/integration tests; release-time covered by smoke gate.

| Test category | Tool | Phase coverage | What it catches |
|---|---|---|---|
| **Unit (vitest)** | `npm test --workspace @deskwork/<pkg>` | Every phase that adds template helpers, route handlers, or data-shape changes | `gloss()` template helper resolves correctly; route changes (#107 index links) return 200 + render expected anchors; entry-review surface renders styled markup; config-driven shortform platforms parse |
| **Integration (vitest + tmp fixtures)** | `npm test` against fixture project trees | Phases 3, 5, 6 (surfaces with state-mutating UI) | Dashboard buttons trigger correct entry-centric mutations; shortform compose flow round-trips; content tree gates `/blog/<slug>` on host |
| **Manual visual smoke** | `npm run dev` + browser at the magic-DNS URL | Every phase with visual changes | Each surface renders correctly with the press-check aesthetic; glossary tooltips work; keyboard navigation (TOC, shortcut modifiers) works; entry-review controls render per-stage correctly |
| **Release smoke (existing)** | `bash scripts/smoke-marketplace.sh` | Per release boundary (operator decision) | Every documented route returns 200 + scraped assets resolve, against the published-to-npm artifact |

### Per-phase test additions

- **Phase 1 (glossary):** unit tests for `gloss('press-check')` returning expected markup; client tooltip dismissal via Esc / click-outside (jsdom).
- **Phase 2 (entry-review):** routing test (already exists per `entry-review-routing.test.ts`); HTML-shape regression tests asserting `er-entry-*` classes are present and styled (CSS rule presence, not visual rendering).
- **Phase 3 (dashboard):** regression tests for any redesigned button (no 404, correct endpoint, correct mutation).
- **Phase 4 (longform):** TOC unit test (markdown headings → TOC items); keybinding test (single-letter without modifier is no-op; modifier+letter triggers action).
- **Phase 5 (shortform):** config-driven platform list (matrix renders configured platforms; empty-state copy doesn't reference unbuilt features).
- **Phase 6 (content view):** `/blog/<slug>` URL fabrication gated on host config presence; detail panel reports presence of frontmatter / body correctly.
- **Phase 7 (manual):** slash-command rewrite test (no `/editorial-*` references in rendered Manual HTML); glossary section anchors resolve.
- **Phase 8 (index):** four expected outbound links present.

**No new test infrastructure in CI** (per `.claude/rules/agent-discipline.md`). All new tests are vitest unit/integration that the existing `npm --workspaces test` line catches.

**Visual regression testing** (per-pixel snapshots): explicitly out of scope. Manual smoke is sufficient given the operator drives the dogfood; Playwright snapshots add CI weight without proportional value.

---

## §10 — Out-of-scope (boundary doc)

Bound by §1's non-goals. Repeated explicitly so the spec stands alone.

### Issues NOT in scope

- **Category B (CLI / skill prose UX):** #84, #65, #64, #62, #61, #60, #59, #58, #57.
- **Category C (dw-lifecycle plugin):** #115–#136 (parallel-plugin defect cluster).
- **Forward-looking features:** #54 (margin-note agent reply), #82 (voice catalog), #83 (mutation commits), #85 (version diff), #86 (Google Docs plugin), #87 (skinnable studio), #53 (install author prompt).
- **Server-side bugs:** #151 (CLI publish `publishedDate` field), #92 (Claude Code dispatch).
- **Architectural / install:** #102 (customize templates seam), #94 (Phase 26 npm-publish — already shipped), #89 (installed_plugins.json migration).
- **Process / playbook:** #133 (Phase 29 post-release acceptance — separate skill arc).
- **Performance:** #30 (content-tree caching) — only addressed if it surfaces as a UX blocker during impl.

### Architectural boundaries

- **Theme support:** explicit non-goal. CSS tokens stay where they are; no `[data-theme]` switching; no theme-author docs; no theme-token extraction beyond what existed pre-design-pass.
- **Stage-name renaming (#142):** design accommodates by using stage IDs internally (no hardcoded display strings in CSS or markup); does not drive renaming.
- **Audiocontrol.org dogfood:** explicit non-goal. The design pass is the precondition; the dogfood is post-design-pass payoff.
- **#54 margin-note agent reply:** out of scope even though it's a review-surface enhancement; bundling it with the design pass dilutes scope.

### Out-of-scope visual treatments

- Per-surface metaphor exploration (the seven sub-metaphors are locked in §2).
- Font swaps, palette adjustments, container-width changes, spacing-scale changes.
- Animation / motion design (the studio is a paper aesthetic; motion is anti-metaphor).
- Dark mode (it's a future theme — not part of this design pass).

### Out-of-scope code work

- Refactoring the existing surface code where it's not blocking the redesign (e.g., `editorial-review.css` is 2619 lines; it stays, no extraction work unless a phase needs a token to be tweaked and would otherwise duplicate).
- Adding telemetry / analytics.
- Per-user preferences / accounts (the studio has no auth; this stays).

---

## Source-of-truth references

- `.claude/CLAUDE.md` — project-level conventions (deskwork is a content-collection manager, not a website renderer).
- `.claude/rules/agent-discipline.md` — agent behavior rules referenced throughout (no closure without formal-release verification, no `--no-tailscale` unprompted, packaging-is-UX, etc.).
- `.claude/rules/testing.md` — test categories and the no-new-CI-infrastructure rule.
- `DEVELOPMENT.md` — dev-mode workflow (`npm run dev`, `node_modules/.bin/deskwork`, watch builds).
- `plugins/deskwork-studio/public/css/editorial-review.css` — the design-language source-of-truth (2619 lines). All tokens preserved verbatim by this design pass.

## Provenance

- Brainstorming session: 2026-05-01.
- Operator approval: §1 through §10 approved in turn during the session.
- Decisions locked in:
  - Scope: comprehensive design pass (Approach C of three).
  - Spec structure: one umbrella spec, phased plan (Approach 1 of three).
  - Vocabulary: keep typesetting jargon + add glossary tooltips (Approach B of three).
  - Theme support: explicit non-goal — operator's binding constraint.
  - Visual design tool: `/frontend-design:frontend-design` is binding for every surface.
- Bug filed during brainstorm: [#152](https://github.com/audiocontrol-org/deskwork/issues/152) — entry-review CSS deferred TODO from Phase 30.
