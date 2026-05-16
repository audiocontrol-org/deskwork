---
slug: studio-mobile-first
targetVersion: "0.19.0"
date: 2026-05-09
---

# studio-mobile-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the press-check mobile-first design language already shipped on entry-review (v0.17 + v0.18) to the remaining 6 studio surfaces (Dashboard, Shortform, Standalone scrapbook viewer, Content view, Help, Studio Index) plus the cross-cutting #242 Cancel affordance, in 4 sequenced cuts.

**Architecture:** Hybrid extraction strategy. Phase 1 builds Dashboard mobile-first using entry-review's patterns as-is (no upfront refactor). Phase 2 extracts a shared `mobile-shell` module (mobile-bar, mobile-sheet, press-check tokens, dual-viewport probe scaffolding) once Dashboard validates the abstraction shape, then applies it to Shortform. Phases 3-4 reuse the extracted primitives. Every phase is gated on `/frontend-design` (mockups → operator picks) and `/dw-lifecycle:review` (parallel reviewers → integrate or defer per the global rule in `agent-discipline.md`).

**Tech Stack:** TypeScript, Hono (server), CodeMirror 6 (editor), esbuild (client bundling), Playwright (probes), Vitest (unit/integration tests).

---

## Cross-cutting conventions (apply to every phase)

- **Mockups under `plugins/deskwork-studio/public/mockups/<surface>-N-<idiom>.html`** — mirrors the existing `mobile-1-bottom-sheet.html` / `editor-2-press-check-tabbar.html` / `scrapbook-1-fourth-tab.html` pattern. Index page (`mockups/index.html`) gains a section per phase.
- **Probe scripts under `scripts/probe-mobile-<surface>.mjs`** — mirrors the existing `probe-mobile-editor.mjs` / `probe-mobile-scrapbook.mjs` pattern. Each probe drives both phone (390×844) and desktop (1280×800) viewports.
- **Dual-viewport regression smoke updated per surface** — `scripts/smoke-er-viewport-regressions.mjs` (or a new `smoke-mobile-<surface>.mjs` if the surface diverges from the entry-review shape).
- **Press-check vocabulary preserved** — cream paper (`#F5F1E8`), JetBrains Mono kickers, Newsreader italic display, accent map (red-pencil `#B8362A`, proof-blue `#2A4B7C`, stamp-green `#2E5D45`, kraft `#8A7250`), paper-noise SVG texture.
- **Per-phase commit hygiene** — design mockups land in their own commit (`design(studio): ... mockups`); implementation in another (`feat(studio): ... mockup N`); review fixes in a third (`fix(studio): apply review findings on ...`).
- **State machine compliance** — every UI element + skill prose + journal/sidecar field that surfaces or branches on state must conform to `DESKWORK-STATE-MACHINE.md` (top-level). The state machine is the eight stages; review state is retired. Verbs (iterate / approve / cancel) are universal. Non-conformance is a bug.

---

## Phase 0 — State machine canonization → blocks Phase 1

Goal: lock the deskwork state machine spec in writing before any further redesign work. The 2026-04-30 pipeline redesign collapsed the calendar-stage and review-workflow state machines into ONE stage-driven state machine, but the migration left vestigial review-state code and documentation that keeps re-introducing the retired concept into mockups and skill prose. Until the canonical spec exists, every design pass relitigates first principles.

### Task 0.1: Draft `DESKWORK-STATE-MACHINE.md`

**Files:**
- Create: `DESKWORK-STATE-MACHINE.md` (top-level)

- [x] **Step 0.1.1:** Read the original spec (`docs/superpowers/specs/2026-04-30-deskwork-pipeline-redesign-design.md`) and the migration commits (`5687404`, `07ac8dc`, `c21b8b9`, `ca7f785`) to ground the document in the migration's stated intent.
- [x] **Step 0.1.2:** Draft the canonical spec covering: stages (8, the state machine), verbs (iterate / approve / cancel — universal), what reviewState was and why it's retired, what the current schema vestige is, the studio's surfacing rules, the commandments that derived violations must obey.
- [x] **Step 0.1.3:** Operator review + approval. Iterate until locked. *(Iterated to v5 via /deskwork:iterate; approved Drafting → Final via /deskwork:approve.)*
- [x] **Step 0.1.4:** Commit `docs(state-machine): canonical spec — DESKWORK-STATE-MACHINE.md`.
- [x] **Step 0.1.5:** Wire the document into the `session-start` skill so every session reads it before touching code, alongside `THESIS.md` and `DESIGN-STANDARDS.md` (path updated post-Phase-0.3).
- [ ] **Step 0.1.6:** Add a project rule (`.claude/rules/state-machine.md`) saying: read the state machine spec before any work that touches stage / verb / state semantics; deviations require updating the spec first. *(Surfaced in 2026-05-09 audit — never created. Pending.)*

### Task 0.2: Audit + destroy violations

Goal: with the spec locked, sweep the codebase + docs to find and remove every vestige of the retired review-state concept and any other deviation from the spec.

**Files (preliminary inventory — expand during audit):**
- `packages/core/src/schema/entry.ts` — `ReviewState` type, `reviewState` field on Entry
- `packages/studio/src/pages/dashboard/affordances.ts` — `REVIEW_STATE_LABELS`, `renderReviewStateBadge`
- `packages/studio/src/pages/dashboard/affordances.ts` — iterate-button gating on `reviewState === 'iterating'` (Commandment II violation — verb gated on retired state)
- `packages/studio/src/pages/dashboard/press-queue.ts` — already removed from dashboard.ts but module still in tree (review-state-driven; delete)
- `packages/studio/src/pages/index.ts` — "in-review" caption text + sidecar filter
- `packages/studio/src/pages/help.ts` — manual prose mentioning review state
- `packages/core/src/journal/` — `review-state-change` event kind + bookkeeping
- ~~`packages/core/src/iterate/iterate.ts` — sidecar mutation that sets reviewState~~ — **CLOSED** in 5a4584b (Step 1.6.1). iterate.ts now strips vestigial reviewState on write and does not emit review-state-change events.
- `plugins/deskwork/skills/*/SKILL.md` — any prose mentioning reviewState as a gate or post-condition
- `docs/studio-design-standards.md` — references to "review state internal-only" (replace with "review state is RETIRED, not internal")
- `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/dashboard-audit.md` — historical audit, may need a "superseded by state machine spec" note
- **`packages/cli/src/cmd/ingest.ts`** (or wherever the `--state` validator lives) — accepts `'Review'` (a retired stage) but rejects `'Final'` (a current stage). Surfaced 2026-05-09 when ingesting the state-machine spec itself; had to use `Drafting` since `Final` was rejected at the CLI layer despite being the appropriate stage. Validator must accept the full Stage enum (Ideas, Planned, Outlining, Drafting, Final, Published, Blocked, Cancelled).
- **`plugins/deskwork/skills/ingest/SKILL.md`** — frontmatter→lane mapping table includes `'Review'` instead of `'Final'`. Same root cause as the CLI validator. Update prose to match the post-redesign Stage enum.
- ~~**`packages/cli/src/cmd/iterate.ts`** (and the underlying core/iterate helper)~~ — **CLOSED** in 5a4584b (Step 1.6.1). The iterate CLI's emit() output no longer carries the `state` field; the underlying helper no longer writes `reviewState` to the sidecar; the review-state-change journal-event emit on iterate is removed entirely.
- **`plugins/deskwork/skills/iterate/SKILL.md`** — describes the workflow state machine ("Transitions the workflow back to `in-review` so the operator can review the new version"). This vocabulary needs to align with the spec: the agent rewrites the file in response to marginalia, period. There is no "review state" that gets flipped.
- **Public versioning is committed in the spec but not implemented.** Per DESKWORK-STATE-MACHINE.md § Versioning (added v3 on 2026-05-09): every Publish event must assign a new public version (v1, v2, …) separate from the internal iteration counter. Add a `publicVersion: number` (or equivalent) field to the entry sidecar, increment it in `approveEntryStage` when transitioning to Published, surface it on read paths (studio's Published stage view, any external-reference path). The internal iteration counter stays as it is; the new public version is a parallel monotonic counter on Publish events.
- **The `publish` verb (skill prose + CLI subcommand)** — should be reframed or removed per the v2 spec update. Currently `publish` is a separate CLI subcommand with separate semantics. Per the spec, `publish` is an optional clarity-alias for `approve` at the Final → Published transition, not a separate operation. Either: (a) delete the `publish` subcommand and have `approve` handle Final → Published directly, OR (b) keep `publish` as a thin alias that calls the same `approveEntryStage` helper at Final → Published. Either way, the operational semantics of approve and publish at that transition MUST be identical.
- **Naming alignment — `revision` and `version` per v4 spec.** The existing code's `iterationByStage` field is the closest thing to "revision" today; either rename to `revision` / `revisions` or document the mapping explicitly in code comments + journal-event vocabulary. New code MUST use the v4 spec's names.
- **Scheme-override mechanism for versioning** — design TBD. Options to evaluate during audit: (1) `.deskwork/config.json` `versionScheme` field per site; (2) per-entry frontmatter `version-scheme:` declaration; (3) operator-extensible scheme registry under `.deskwork/schemes/<name>.ts` with entry-points. Default scheme stays monotonic integer (`v1`, `v2`, ...) — no setup required. Operators who want semver / date-based / custom override at site or entry granularity.
- **`/deskwork:revert <slug> --to-revision N` verb (skill + CLI)** — reserved in the v4 spec. Reverting copies the content of revision N into a new revision (append-only history). Implementation: read the revision-N snapshot from journal, write to disk as the current state, bump revision counter. Studio surfacing: a "Revert to this revision" affordance on the View History row for revision N.
- **Studio "View History" surface** — reserved in the v4 spec. Lists revisions for an entry with timestamp, summary of changes, who originated (agent vs operator), and a Revert affordance per row. Linked from the entry-review surface (likely a sheet or a separate route `/dev/editorial-review/entry/<uuid>/history`).
- **`plugins/deskwork/skills/approve/SKILL.md`** — Step 3's stage-gate language refuses approve on Final: *"If Final: refuse: 'use /deskwork:publish for Final → Published.'"* Per Commandment II + IX (DESKWORK-STATE-MACHINE.md v4): approve is universal across every linear-pipeline transition including Final → Published; `publish` is an optional alias, not a separate operation. The skill prose needs to drop the Final-refusal branch and let approve handle Final → Published natively (assigning a version per the operator's scheme as documented in the spec).
- **`packages/core/src/iterate/iterate.ts` (or wherever approve's helper lives) — Final → Published path missing.** The CLI helper currently has no implementation for Final → Published because the skill prose refused that transition. With the spec change, the CLI must support the transition, including: (a) running the version assignment per the operator's scheme (default monotonic int); (b) writing the version to the entry's sidecar; (c) journaling a `stage-transition` event with the assigned version captured in metadata.
- **The approve helper's `<dir>/index.md` snapshot assumption** — surfaced 2026-05-09 when approving DESKWORK-STATE-MACHINE.md (artifactPath at top-level, NOT `<dir>/index.md`). The snapshot was silently skipped because `index.md` didn't exist. Generalize: snapshot whatever file `entry.artifactPath` points at, to `<dirname-of-artifactPath>/scrapbook/<priorStage>.md` (or wherever the per-entry scrapbook is). Files at the project root need the snapshot in the project root's scrapbook (e.g., `./scrapbook/drafting.md`) — that may not be the right location either. Audit + design.
- **Revision metadata fields** — per v5 spec: every revision records who originated it (agent vs operator) and when. The current journal events don't carry "originator" consistently. Add `originator: 'agent' | 'operator'` (or similar) to the revision-bumping journal events; populate from the source verb (iterate=agent, save=operator, etc.).

- [ ] **Step 0.2.1:** Grep pass: `git grep -nE 'reviewState|ReviewState|in-review|in_review|iterating|review-state'` produces the violation candidate list.
- [ ] **Step 0.2.2:** Categorize each hit: REMOVE (UI/skill surfacing), MIGRATE (data persistence — back-compat one-shot), or KEEP (legitimate journal-event historical record).
- [ ] **Step 0.2.3:** Remove the REMOVE category. Each removal is a focused commit with a citation back to the spec.
- [ ] **Step 0.2.4:** Run all tests + the dual-viewport smoke + a manual walk of `/dev/editorial-studio`. State machine spec should pass at 100%; no UI surfacing or skill gates remain on review state.
- [ ] **Step 0.2.5:** Update `docs/studio-design-standards.md` § Review state to point at `DESKWORK-STATE-MACHINE.md` as the canonical record and reframe the section ("review state is retired" not "internal-only").

### Task 0.3: Promote `DESIGN-STANDARDS.md` to canonical + establish design proposal record-keeping

Goal: with the state machine canonized + violations cleaned, do the same for design. The current `docs/studio-design-standards.md` becomes a holy document at top-level (peer to `THESIS.md` and `DESKWORK-STATE-MACHINE.md`). Establish a proposal-archive pattern at `docs/studio-design/ACCEPTED/` and `REJECTED/` so design decisions are durable and traceable.

**Files:**
- Create: `DESIGN-STANDARDS.md` (top-level — `git mv` from `docs/studio-design-standards.md` so it's a rename, not a copy + delete)
- Create: `docs/studio-design/ACCEPTED/` (directory)
- Create: `docs/studio-design/REJECTED/` (directory)
- Create: `docs/studio-design/README.md` (explains the contract + index)
- Modify: `.claude/rules/studio-design-standards.md` → `git mv` to `.claude/rules/design-standards.md`; update to point at the new top-level doc + describe the ACCEPTED/REJECTED contract
- Modify: `.claude/skills/session-start/SKILL.md` — read `DESIGN-STANDARDS.md` (top-level) instead of `docs/studio-design-standards.md`
- Modify: `plugins/deskwork-studio/public/mockups/index.html` — link to the proposal archive instead of inline cards

**Reachability:** the document-root serveStatic added in commit `a916001` already serves any top-level file at `/<filename>`. `DESIGN-STANDARDS.md` will be reachable at `/DESIGN-STANDARDS.md` automatically — no symlink, no copy. Same for any future top-level holy doc.

**The proposal-archive contract (each entry MUST have):**
- A directory under `ACCEPTED/` or `REJECTED/` named `<YYYY-MM-DD>-<slug>/`
- A visual representation: either an HTML/CSS file directly inside the entry directory, OR (when the visual lives elsewhere in the tree, like an existing mockup file) a relative-path reference in the brief — **never a copy of the file**. The single source of truth lives at one path; the brief points at it.
- A `brief.md` containing: what the proposal is, why accepted or rejected, when (date + commit), and a reference back to the motivating feature documentation (e.g. `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/`)

**Sub-steps:**

- [x] **Step 0.3.1:** `git mv docs/studio-design-standards.md DESIGN-STANDARDS.md`. Update internal cross-references in the file (it currently mentions itself by the old path). Add a "Proposal archive" section pointing at `docs/studio-design/`. Update all references in other files (`.claude/rules/`, session-start skill, etc.) to the new path. *(Landed in 45952fd; cross-refs updated in session-start skill, DESKWORK-STATE-MACHINE.md, dashboard-mobile.css, three row mockups.)*
- [x] **Step 0.3.2:** Create `docs/studio-design/{ACCEPTED,REJECTED}/` with a top-level `README.md` documenting the contract. *(Landed in 7471ca2.)*
- [x] **Step 0.3.3:** Migrate existing decisions into the archive. Each entry's visual representation is a **reference** to the canonical mockup file (in `plugins/deskwork-studio/public/mockups/` or `mockups/retired/`), NEVER a copy. Brief specifies the relative path. *(Landed in 7471ca2 — 14 entries: 4 ACCEPTED, 10 REJECTED.)* Examples to seed:
  - `ACCEPTED/2026-05-09-collapsible-stage-tiles/brief.md` — operator picked Compact 1; visual ref → `plugins/deskwork-studio/public/mockups/retired/dashboard-compact-1-collapsible.html` for the original mockup, plus a screenshot of the live implementation if useful; brief explains scroll-cost reduction, structure-over-scrolling principle, link to the studio-mobile-first feature dir.
  - `ACCEPTED/2026-05-09-floating-compose-chip-fab/brief.md` — picked from 1c; visual ref → the retired 1c mockup; brief explains rationale + feature link.
  - `ACCEPTED/2026-05-09-distribution-as-stage-tile/brief.md` — brief + feature link; visual = inline screenshot of the live tile.
  - `ACCEPTED/2026-05-09-press-queue-removed/brief.md` — brief explaining review-state-driven rationale; no visual needed (it's a removal).
  - `REJECTED/2026-05-09-rotated-rubber-stamps-on-mobile/brief.md` — visual ref → `mockups/retired/dashboard-1-press-tabs.html`; brief = relitigated three times, vertical-stack visual noise, retired in favor of structure.
  - `REJECTED/2026-05-09-filing-tab-stamps-on-mobile/brief.md` — visual ref → `mockups/retired/dashboard-1c-filing-tab-fab.html`; brief = same root cause; the rubber-stamp conceit retired in all forms.
  - `REJECTED/2026-05-09-letterpress-tag-stamps/brief.md` — visual ref → 1b; brief.
  - `REJECTED/2026-05-09-rule-bracketed-stamps/brief.md` — visual ref → 1d; brief.
  - `REJECTED/2026-05-09-card-stream-no-tabs/brief.md` — visual ref → 2; brief.
  - `REJECTED/2026-05-09-folio-dock-hybrid/brief.md` — visual ref → 3; brief.
  - `REJECTED/2026-05-09-density-toggle-with-empty-stage-collapse/brief.md` — visual ref → compact-2; brief.
  - `REJECTED/2026-05-09-attention-first-no-section-heads/brief.md` — visual ref → compact-3; brief.
  - `REJECTED/2026-05-09-pipeline-press-folio-tabbar/brief.md` — visual ref → 1c (the tabbar shipped in mockup); brief = "Press" tab depended on retired review state.
  - `REJECTED/2026-05-09-stage-filter-chips/brief.md` — brief = operator never used.
- [x] **Step 0.3.4:** `git mv plugins/deskwork-studio/public/mockups/retired/*` into the appropriate REJECTED entry directories — each retired mockup file's new home is its REJECTED archive entry, NEVER duplicated. Update REJECTED brief.md files to reference `mockup.html` (the moved file) directly. Remove the now-empty `mockups/retired/` directory and its README. *(Landed in ad79421 — 9 mockup files migrated via git mv; 8 to REJECTED, 1 (compact-1) to ACCEPTED. retired/ directory + README removed.)*
- [x] **Step 0.3.5:** Update `mockups/index.html` to be a redirect / index pointing at `docs/studio-design/` rather than its current grid of cards. *(Landed in 7471ca2 — Retired Dashboard mockups section replaced with Design proposal archive section pointing at docs/studio-design/. Active mockup sections preserved as they are still active mockup-pick surfaces.)*
- [x] **Step 0.3.6:** `git mv .claude/rules/studio-design-standards.md .claude/rules/design-standards.md`. Update content to reference the new top-level doc + describe the ACCEPTED/REJECTED contract for the operational rule. *(Landed in 45952fd — rule rewritten with proposal-archive contract section + scan-REJECTED-before-proposing pre-implementation gate.)*
- [x] **Step 0.3.7:** ~~Symlink for studio access~~ — superseded. The document-root serveStatic in `a916001` already serves `DESIGN-STANDARDS.md` at `/DESIGN-STANDARDS.md`; nothing extra needed. *(Verified post-migration: /DESIGN-STANDARDS.md, /docs/studio-design/README.md, /docs/studio-design/ACCEPTED/<entry>/brief.md all return 200.)*
- [x] **Step 0.3.8:** Operator sign-off on `DESIGN-STANDARDS.md` content + the ACCEPTED/REJECTED archive structure. *(Operator approved 5 docs Drafting → Final via /deskwork:approve: design-standards (d55d5c0), design-archive-contract (e9923d6), design-standards-rule (e20ade1), accepted-press-queue-removed + rejected-filing-tab-stamps (df90c1f).)*

**Acceptance for Phase 0:**
- `DESKWORK-STATE-MACHINE.md` exists at top-level and is operator-approved
- No UI surfaces review state on any studio page (mobile or desktop)
- No skill prose gates on review state
- The journal-event record may keep historical `review-state-change` events for backward compat but no NEW events of that kind are emitted
- The schema's `ReviewState` type is removed OR explicitly marked `@deprecated — vestigial for sidecar back-compat only`
- `DESIGN-STANDARDS.md` exists at top-level (renamed from `docs/studio-design-standards.md`) and is operator-approved
- `docs/studio-design/ACCEPTED/` and `REJECTED/` directories exist and contain entries for every design decision made through 2026-05-09 (each with visual reference + brief + feature reference; **no copied files**)
- `.claude/rules/design-standards.md` enforces the ACCEPTED/REJECTED contract
- Both holy docs reachable on phone via the document-root serveStatic at `/DESKWORK-STATE-MACHINE.md` and `/DESIGN-STANDARDS.md` (committed `a916001`)
- Phase 1 cannot resume until Phase 0 is signed off

---

## Phase 1 — Dashboard mobile-first → v0.19

**Goal:** `/dev/editorial-studio` (the press-check landing) walks cleanly on phone with thumb-reach affordances. Closes #236, #237, #238, #243.

### Task 1.1: Mockup the Dashboard mobile surface

**Files:**
- Create: `plugins/deskwork-studio/public/mockups/dashboard-1-<idiom>.html` (×2-3)
- Modify: `plugins/deskwork-studio/public/mockups/index.html` (add new section)

- [x] **Step 1.1.1:** Audit current Dashboard structure. Read `packages/studio/src/pages/dashboard.ts` + the dashboard module under `packages/studio/src/pages/dashboard/`. Capture the per-row affordances (pipeline status, press-queue chips, scrapbook chips, induct picker, decision hints). *(Landed in 6616959 — `dashboard-audit.md`.)*
- [x] **Step 1.1.2:** Walk the existing `/dev/editorial-studio` on phone via Tailscale. Capture the friction (which #236-#243 symptoms reproduce). Take screenshots if useful — store under `<dashboard-entry>/scrapbook/` per the THESIS adjacent-assets pattern.
- [x] **Step 1.1.3:** Invoke `frontend-design:frontend-design` to produce 2-3 dashboard mockups. Honor the press-check vocabulary; explore: (a) bottom-tab-bar with Pipeline/Press-queue/Scrapbook tabs, (b) a "card stream" with no tabs (pipeline rows are the primary affordance), (c) hybrid TBD via mockup. *(Multiple rounds: dedf7df, d6336f8, ddd474b. All retired mockups now in `docs/studio-design/REJECTED/`; the picked direction is filed under `ACCEPTED/2026-05-09-collapsible-stage-tiles/`.)*
- [x] **Step 1.1.4:** Update `mockups/index.html` with a new "Dashboard mobile-first [Active]" section + per-mockup cards. *(Updated alongside mockup commits; later rewritten in 7471ca2 to point at the design archive.)*
- [x] **Step 1.1.5:** Commit:

```bash
git add plugins/deskwork-studio/public/mockups/dashboard-*.html plugins/deskwork-studio/public/mockups/index.html
git commit -m "design(studio): three dashboard mobile direction mockups (HTML, no code)"
```

- [x] **Step 1.1.6:** Operator walks the mockups on phone. Operator picks one. **STOP for operator pick.** *(Operator picked Compact-1 collapsible-stage-tiles + Dashboard-1c filing-tab/FAB chrome direction. See ACCEPTED archive entries.)*

### Task 1.2: Implement the picked Dashboard mockup

**Files:**
- Modify: `packages/studio/src/pages/dashboard.ts`
- Modify: `packages/studio/src/pages/dashboard/*.ts` (specific files determined by mockup pick)
- Modify: `plugins/deskwork-studio/public/css/editorial-studio.css` (or a new dashboard-mobile.css if the existing file balloons past 500 lines)
- Possibly create: `plugins/deskwork-studio/public/src/dashboard/mobile-bar.ts` (client controller for dashboard-specific tab interactions, copying patterns from `entry-review/mobile-sheet-bar.ts`)

- [x] **Step 1.2.1:** Pull patterns from `packages/studio/src/pages/entry-review/mobile-bar.ts` and `plugins/deskwork-studio/public/src/entry-review/mobile-sheet-bar.ts`. Adapt to dashboard's data shape (rows-of-entries vs. one-entry). *(Landed across 70664f6 / 15cd8eb / f1db25d; the dashboard's chrome did NOT end up using the mobile-bar/sheet pattern. Compact-1's collapsible stage tiles + a floating-Compose FAB+sheet won the design pass instead, so the dashboard ships its own client controllers (`stage-tiles.ts`, `compose-chip.ts`) inspired by but not reusing entry-review's mobile-bar. Phase 2's mobile-shell extraction will reconcile.)*
- [x] **Step 1.2.2:** Implement the mockup-picked layout. CSS additions go in `editorial-studio.css`; if it crosses 500 lines, split. *(Split: a new `dashboard-mobile.css` carries the v0.19 mobile rules; `editorial-studio.css` stays the desktop scaffold.)*
- [x] **Step 1.2.3:** Wire any client-side tab/sheet behavior to mirror `mobile-sheet-bar.ts`'s patterns (matchMedia gate, sheet host, drag-handle dismiss, MutationObserver-driven count badges). *(Compose-chip controller mirrors mobile-sheet-bar's matchMedia gate + drag-dismiss + sheet-host pattern. Stage-tiles uses matchMedia + collapse-state attrs; no MutationObserver needed since counts are server-rendered.)*
- [x] **Step 1.2.4:** Boot dev studio: `npm run dev`. Walk the changes against `http://orion-m4:<port>/dev/editorial-studio` on phone via Tailscale.
- [x] **Step 1.2.5:** Commit:

```bash
git add packages/studio/src/pages/dashboard.ts packages/studio/src/pages/dashboard/ plugins/deskwork-studio/public/css/editorial-studio.css plugins/deskwork-studio/public/src/dashboard/
git commit -m "feat(studio): dashboard mobile-first — Mockup N"
```

### Task 1.3: Probes + dual-viewport smoke

**Files:**
- Create: `scripts/probe-mobile-dashboard.mjs`
- Modify: `scripts/smoke-er-viewport-regressions.mjs` (or create `scripts/smoke-mobile-dashboard.mjs` if dashboard diverges from entry-review's invariants)

- [x] **Step 1.3.1:** Write `scripts/probe-mobile-dashboard.mjs` mirroring `probe-mobile-editor.mjs` structure. Assert the operator path: tab swap, sheet open with content, count badges live, no horizontal scroll at 390×844, mobile chrome hidden at 1280×800. *(Wrote 16 assertions covering stage-tile expand/collapse, single-expand invariant, FAB visibility + sheet open/close, no-overflow at both viewports, mobile chrome hidden at desktop.)*
- [x] **Step 1.3.2:** Run probe, fix any failing assertions:

```bash
node scripts/probe-mobile-dashboard.mjs
```

Expected: 0 failures. *(0 failures on first run — implementation matches mockup contract.)*
- [x] **Step 1.3.3:** Update `scripts/smoke-er-viewport-regressions.mjs` to include `/dev/editorial-studio` in its walked surfaces. Run to confirm green:

```bash
node scripts/smoke-er-viewport-regressions.mjs
```

Expected: 0 failures across all probes. *(0 failures across 8 probes — 3 entries × 2 viewports + dashboard × 2 viewports. Strip-height invariant gated to entry-review surface so dashboard's lack of `.er-strip` doesn't false-fail.)*
- [x] **Step 1.3.4:** Commit. *(Landed in 9561622.)*

```bash
git add scripts/probe-mobile-dashboard.mjs scripts/smoke-er-viewport-regressions.mjs
git commit -m "test(studio): probe + smoke for dashboard mobile-first"
```

### Task 1.4: /dw-lifecycle:review

- [x] **Step 1.4.1:** Invoke `/dw-lifecycle:review` per the global rule. Dispatch parallel reviewers (correctness/security + architecture/conventions). Pass the relevant commit range. *(Dispatched code-reviewer + architect-reviewer over `817dde5..HEAD`. Both returned categorized findings.)*
- [x] **Step 1.4.2:** Triage findings per `superpowers:receiving-code-review` discipline. Push back on wrong findings with code/measurement evidence. *(3 reviewer findings withdrawn after deeper analysis: rapid-toggle race in compose-chip — `if (!isOpen)` guard handles it; type concern at dashboard.ts:120 — convention is consistent across codebase; mouse/touch double-fire in compose-chip — `dragging` guard + Playwright behavior verify safe.)*
- [x] **Step 1.4.3:** Apply verified findings inline. Any deferred fix MUST get BOTH a workplan entry AND a GitHub issue per the global rule. *(4 findings applied in commit b4de035: stale docstrings rewritten in dashboard.ts and section.ts; 195-line orphan press-queue CSS deleted from editorial-studio.css; dead .er-press-queue hide rule removed from dashboard-mobile.css; .er-layout "for now" wrapper removed from dashboard.ts; renderStatusCell no-op inlined and deleted. 1 finding deferred — drag-handler duplication between compose-chip and entry-review's mobile-sheet-bar — already tracked under Phase 2 mobile-shell extraction in this workplan, no new GitHub issue needed.)*
- [x] **Step 1.4.4:** Commit fix-up. *(Landed in b4de035.)*

```bash
git add <fixed-files>
git commit -m "fix(studio): apply review findings on dashboard mobile-first"
```

### Task 1.5: Release v0.19 + verify on iPhone + close issues

- [x] **Step 1.5.1:** ~~Run `/release` (operator-driven). Picks v0.19.0. Atomic-pushes to main + branch + tag.~~ *(Bundled with Task 1.8 + 1.8b and shipped as v0.20.0 on 2026-05-11 — tag `v0.20.0` (`64c7b29`), `@deskwork/{core,cli,studio}@0.20.0` published to npm.)*
- [x] **Step 1.5.2:** ~~Operator runs `/plugin marketplace update deskwork` against an iPhone-walked install. Confirms #236, #237, #238, #243 symptoms are gone.~~ *(Operator walked v0.20.0 marketplace install on phone 2026-05-11: "Looks good. I'd say that's done.")*
- [x] **Step 1.5.3:** ~~Post fix-landed comments on #236, #237, #238, #243 referencing v0.19.0 + commits.~~ *(Posted 2026-05-12 referencing v0.20.0 — comment IDs 4427437325 / 4427437402 / 4427437466 / 4427437537. Each cites commit + file:line + operator-walk quote.)*
- [x] **Step 1.5.4:** ~~Close #236, #237, #238, #243 with `--reason completed`.~~ *(Closed 2026-05-12 with `--reason completed` after operator authorization "close the issues".)*

**Acceptance:**
- Dashboard walks on phone without horizontal scroll
- Press-check vocabulary preserved
- Probe + smoke green
- #236, #237, #238, #243 closed against v0.20.0 install

### Task 1.7.5 — CLI dispatcher gap: missing subcommands for block / cancel / induct (prereq for 1.8)

**Goal:** close a gap surfaced by Task 1.8's Step 1.8.1 verification: the `/deskwork:block`, `/deskwork:cancel`, and `/deskwork:induct` skills exist and their core helpers exist (`packages/core/src/entry/{block,cancel,induct}.ts`), but the CLI dispatcher in `packages/cli/src/dispatch.ts` doesn't route those verbs. Running `deskwork block <uuid>` returns *"unknown subcommand"*; the same for `cancel` and `induct`. When an agent receives a pasted `/deskwork:block <slug>` from the dashboard's (about-to-be-added) Block button and tries to invoke the helper atomically, it has to walk the skill steps manually via Read/Write/journal-append instead of dispatching `deskwork block <uuid>`. The UI clipboard-copy works regardless; the receiving-agent's downstream execution is degraded.

Task 1.8 ships the UI buttons that invite the operator to use these verbs. Shipping the surface before the atomic CLI plumbing is the *"ship the surface, defer the plumbing"* pattern that bites in the next session. This task closes the plumbing so 1.8 lands honest.

**Decision (2026-05-11):** Operator framed it as a UX principle — *"UX is the goal of this feature, so bad UX must be remedied"*. The receiving-agent's manual-step-walking IS the bad UX. **Option A picked: fold 1.7.5 into 1.8** — both ship together as v0.20.0. The CLI work executes BEFORE the UI work in 1.8 (sub-steps 1.7.5.1-1.7.5.9 run first; then 1.8.2 onwards). Rationale: shipping v0.19.2 with CLI subcommands but no adopter-visible UI is low signal-to-noise; single coherent v0.20.0 lands the full round-trip together. The 1.7.5 sub-steps stay numbered as 1.7.5.* (not renumbered into 1.8.*) so this gap is auditable as its own discrete fix in the commit history; the release is what bundles them.

**Files:**
- Modify: `packages/cli/src/dispatch.ts` — route `block`, `cancel`, `induct` subcommands to thin CLI wrappers around their existing core helpers.
- Create: `packages/cli/src/commands/block.ts` — thin wrapper invoking `blockEntry` from `@deskwork/core/entry/block`.
- Create: `packages/cli/src/commands/cancel.ts` — thin wrapper invoking `cancelEntry`.
- Create: `packages/cli/src/commands/induct.ts` — thin wrapper invoking `inductEntry`. Must handle the `--to <Stage>` flag (per the skill's input shape) and the default-stage logic (Blocked → priorStage, Cancelled → priorStage, Final → Drafting, pipeline → require explicit `--to`).
- Modify: `packages/cli/src/dispatch.ts` help-output — list the new subcommands alongside `approve`, `iterate`, etc.
- Create / modify: tests under `packages/cli/test/commands/` mirroring the existing `approve.test.ts` / `iterate.test.ts` patterns — assert exit codes, sidecar mutations, journal events, doctor compatibility for each verb.

**Sub-steps:**

- [x] **Step 1.7.5.1:** ~~Read dispatch.ts + approve.ts + iterate.ts to identify the canonical thin-wrapper shape.~~ *(Done — pattern: `parseArgs(argv, KNOWN_FLAGS)` → resolve slug/uuid via `resolveEntryUuid` → call core helper → `emit()` JSON / `fail()` on error.)*
- [x] **Step 1.7.5.2:** ~~Implement `commands/block.ts`.~~ *(Done — 79 lines, calls `blockEntry`, emits `{ entryId, site, slug, fromStage, toStage: 'Blocked', reason? }`.)*
- [x] **Step 1.7.5.3:** ~~Implement `commands/cancel.ts`.~~ *(Done — parallel shape to block, calls `cancelEntry`.)*
- [x] **Step 1.7.5.4:** ~~Implement `commands/induct.ts`.~~ *(Done — 144 lines with default-stage logic in the CLI wrapper before calling `inductEntry`. Validates `--to` is a linear-pipeline stage; Blocked/Cancelled targets refused.)*
- [x] **Step 1.7.5.5:** ~~Register the new subcommands in `cli.ts`.~~ *(Done — SUBCOMMANDS map updated; help-output moves block/cancel/induct from 'Skill-only verbs' to 'Pipeline' section alongside iterate/approve/publish. status stays in Skill-only as planned.)*
- [x] **Step 1.7.5.6:** ~~Tests mirror approve-entry-centric.test.ts shape.~~ *(Done — block: 4 tests (happy path + already-Blocked refusal + Published-terminal refusal + --reason passthrough); cancel: 4 tests (parallel); induct: 7 tests (Blocked→priorStage default; Cancelled→priorStage default; Final→Drafting default; refuse pipeline-stage without --to; explicit --to backward; refuse --to Blocked; refuse --to Cancelled). Total 15 new tests.)*
- [x] **Step 1.7.5.7:** ~~Run `npm --workspace @deskwork/cli test`.~~ *(Done — 211 passed / 29 skipped pre-existing. Typecheck clean.)*
- [x] **Step 1.7.5.8:** ~~Manual end-to-end.~~ Subsumed by Step 1.7.5.7 — the spawnSync tests in 1.7.5.6 do exactly the same workflow (create temp project + sidecar; run actual `deskwork block` binary; assert post-state). Per the workplan's verification rule: tests using the real binary are the canonical evidence; a separate manual run would just repeat what 1.7.5.7 already proved.
- [x] **Step 1.7.5.9:** ~~Commit.~~ *(Landed in 20ca3e4 — `feat(cli): add block / cancel / induct subcommands (Task 1.8 prereq, 1.7.5 folded)`. Folded per Option A; will release with Task 1.8 as v0.20.0.)*

Also: the three SKILL.md files (`plugins/deskwork/skills/{block,cancel,induct}/SKILL.md`) were updated to direct agents to use the new CLI commands atomically (mirroring approve's skill prose: "Run `deskwork <verb> <uuid>` (the underlying CLI helper). <Verb> is now an atomic operation that..."). Error-message quotes in each SKILL.md match the CLI's actual stderr so adopters recognize them in session output.

**Acceptance:**
- `deskwork block <slug>` / `deskwork cancel <slug>` / `deskwork induct <slug> --to <Stage>` all execute the documented sidecar mutation + journal event + doctor validation.
- `deskwork --help` lists the new subcommands.
- CLI test suite green: `npm --workspace @deskwork/cli test` passes (new tests + existing tests).
- An agent receiving a pasted `/deskwork:block <slug>` can dispatch `deskwork block <uuid>` atomically instead of walking skill steps manually.

**Out of scope:**
- `status` CLI subcommand. The `/deskwork:status` skill is read-only and doesn't surface as a dashboard button in Task 1.8. If a `deskwork status` CLI gets added later, it's a separate task; not blocking 1.8.
- Refactoring the dispatch.ts to use a different routing pattern. Stay consistent with the existing approve/iterate shape.

---

### Task 1.8 — Row affordance redesign (overflow + swipe + full verb vocabulary) → v0.20.0

**Goal:** close the row-affordance pick gate that was implicitly skipped during Phase 1 (Task 1.1.6 conflated the dashboard chrome pick with the per-row affordance pick). Implement the operator-approved Row 4 hybrid: clean at-rest row, swipe-drawer + ⋮ menu on mobile, inline iterate/approve chips + ⋮ menu on desktop, full stage-aware verb vocabulary including the previously-missing `iterate`, `block`, and `induct…` (omnidirectional). Replaces the v0.19 dashboard's stacked-outlined-button row chrome.

**Design source of truth:** [`docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md`](../../studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md) (visual: [`plugins/deskwork-studio/public/mockups/dashboard-row-4-overflow-plus-swipe.html`](../../../../plugins/deskwork-studio/public/mockups/dashboard-row-4-overflow-plus-swipe.html)).

**Files:**
- Modify: `packages/studio/src/pages/dashboard/affordances.ts` — stage-aware verb-set rendering (add block + induct-anywhere; current code surfaces induct only on Blocked/Cancelled).
- Modify: `packages/studio/src/pages/dashboard/section.ts` — row markup adopts the ⋮ button + drawer-host shape; remove the stacked inline button block on mobile breakpoints.
- Create: `plugins/deskwork-studio/public/src/dashboard/row-actions.ts` — client controller for the swipe-drawer gesture (matchMedia phone-only) AND the ⋮ menu popover (open/close, click-outside, escape key, accessible focus management).
- Modify: `plugins/deskwork-studio/public/css/dashboard-mobile.css` — swipe-drawer + ⋮-menu chrome; replace the stacked-outlined-button mobile rules.
- Modify: `plugins/deskwork-studio/public/css/editorial-studio.css` — desktop row chrome adopts inline-chips-plus-⋮ pattern.
- Verify (do not modify unless gaps found): `/deskwork:block` skill + `packages/core/src/entry/block.ts` helper. The skill is documented; the CLI helper should already exist. If a gap surfaces, file it as a separate task (do not silently widen this one).
- Modify: `scripts/probe-mobile-dashboard.mjs` — assert: row has no stacked inline buttons at-rest; ⋮ button visible; tap ⋮ opens menu; swipe-left reveals drawer; drawer/menu contain stage-aware verbs.
- Modify: `scripts/smoke-er-viewport-regressions.mjs` — pick up dashboard rows under the new chrome (existing invariants should still pass; this is precautionary).

**Sub-steps:**

- [x] **Step 1.8.1:** ~~Verify `/deskwork:block` round-trip works end-to-end~~ → **Gap surfaced + scoped as Task 1.7.5** (prereq, above). Folded into Task 1.8 per operator decision 2026-05-11 (Option A: single v0.20.0 release). Task 1.7.5 sub-steps execute BEFORE Step 1.8.2 begins. Verification command that surfaced the gap: `node_modules/.bin/deskwork block --help` → `unknown subcommand: block`.
- [x] **Step 1.8.2:** ~~Update `affordances.ts` — render the full stage-aware verb set per the brief's table.~~ *(Landed in 4063cae. Refactored from flat-button-strip rendering into a stage-aware verb-set abstraction with three output surfaces — `renderRowActions` (inline chips + ⋮), `renderRowDrawer` (top-N drawer chips), `renderRowMenu` (full set with grouped dividers). block + induct surfaced on active stages; all verbs route via clipboard-copy of /deskwork:<verb> <slug>.)*
- [x] **Step 1.8.3:** ~~Update `section.ts` — row markup adopts the new shape.~~ *(Landed in 4063cae. Row markup is now <er-row-shell> containing <er-row-drawer> + <er-row-fg.er-calendar-row> + <er-row-menu hidden>. data-* attrs canonical on the shell; refined in b47b6ac.)*
- [x] **Step 1.8.4:** ~~Implement `row-actions.ts` client controller.~~ *(Landed in 4063cae. Handles ⋮ menu open/close, click-outside dismiss, Escape, arrow-key navigation, matchMedia phone-only swipe-gesture with axis-locking, open-one-at-a-time invariant across all rows.)*
- [x] **Step 1.8.5:** ~~CSS for mobile chrome.~~ *(Landed in 4063cae; extracted into dashboard-row-affordances.css in b47b6ac per CSS file-size discipline. dashboard-mobile.css 656 → 471 lines.)*
- [x] **Step 1.8.6:** ~~CSS for desktop chrome.~~ *(Landed in 4063cae; cancel/block/scrapbook accent rules added in b47b6ac per review.)*
- [x] **Step 1.8.7:** ~~Update `probe-mobile-dashboard.mjs`.~~ *(Landed in df71d3b. 28 assertions total (was 16): adds row-shell structure check, no-stacked-buttons v0.19 regression check, no-inline-chip mobile check, ⋮ menu open/close, stage-aware verb-set rendering, click-outside dismiss, desktop inline-chip visibility + drawer:display:none.)*
- [x] **Step 1.8.8:** ~~Run dual-viewport smoke.~~ *(0 failures across 8 probes: 3 entries × 2 viewports + dashboard × 2 viewports.)*
- [x] **Step 1.8.9:** ~~Operator visual walk against the workspace dev studio on phone via Tailscale.~~ *(Done 2026-05-11. Walk surfaced 7 real-device bugs the Chromium probe missed: menu cmd hint wrapping, FAB z-index over menu, iOS sticky-hover making row fg transparent and bleeding drawer chips through, missing `--er-kraft` token rendering scrapbook/block/view/induct chips invisible, FAB occluding the trailing drawer chip, no swipe-right-or-tap close gesture, ⋮ button at 1.21:1 contrast. Each fixed in its own commit; spec probe extended to assert the spec's visible promises rather than implementation mechanism after the operator caught a "17/17 spec assertions pass" false-positive. See DEVELOPMENT-NOTES 2026-05-11 entry.)*
- [x] **Step 1.8.10:** ~~`/dw-lifecycle:review` — dispatch parallel reviewers.~~ *(Done. Dispatched code-reviewer + architect-reviewer in parallel against `6ef72e6..HEAD`. Findings triaged: 5 applied in b47b6ac, 1 deferred with GitHub issue #246 (pre-existing /deskwork:approve refuses Final — couples with deferred public-versioning work).)*
- [x] **Step 1.8.11:** ~~Commit.~~ *(Per-phase commit hygiene: 20ca3e4 feat(cli) [Task 1.7.5 folded]; 4063cae feat(studio); df71d3b test(studio); b47b6ac fix(studio); 64a77f1 design(studio) [mockup retirement].)*
- [x] **Step 1.8.12:** ~~Retire the three superseded direction mockups into REJECTED archive entries.~~ *(Landed in 64a77f1. REJECTED/2026-05-11-row-{1,2,3}-* entries each with brief.md + mockup.html (git mv'd from public/mockups/). mockups/index.html updated to point at the picked Row 4 + cross-link the REJECTED entries.)*
- [x] **Step 1.8.13:** ~~Release v0.20.0 via `/release`.~~ *(Done 2026-05-11. Tag `v0.20.0` (64c7b29). @deskwork/{core,cli,studio}@0.20.0 published to npm. Marketplace smoke passed. GitHub release: https://github.com/audiocontrol-org/deskwork/releases/tag/v0.20.0)*
- [x] **Step 1.8.14:** ~~Operator iPhone walk against the marketplace-installed v0.20.0.~~ *(Done 2026-05-11. Operator: "Looks good. I'd say that's done." After `/plugin marketplace update deskwork` + Claude Code restart, dw-lifecycle install fix-up was needed (cache lagged at 0.17.1 — `/plugin install dw-lifecycle@deskwork` resolved it).)*

**Acceptance:**
- Mobile dashboard rows: clean at-rest, no stacked inline buttons, trailing ⋮ visible
- Mobile swipe-left reveals the stage-aware drawer; swipe-right or tap-outside closes
- Tap ⋮ opens menu with full stage-aware verb set; tap-outside or Escape closes
- Block + induct affordances reachable on all applicable stages on both mobile and desktop
- Desktop: inline iterate / approve chips + ⋮ menu for secondaries (no stacked outlined buttons)
- All verbs route via clipboard-copy of `/deskwork:<verb> <slug>` (THESIS Consequence 2 preserved)
- Probe + smoke green
- v0.20.0 released and walked on iPhone

**Out of scope:**
- Mobile-shell extraction — that's Phase 2. The row-actions controller may end up extracted there; for now it lives in dashboard's own client tree.
- Touch-gesture refinements beyond the basic swipe (multi-finger gestures, customizable swipe thresholds, etc.).
- Custom keyboard shortcuts for the menu beyond the standard arrow-key navigation + Escape.

### Task 1.8b — Accessibility contrast standard + ⋮ overflow fix (mid-flight, bundled into v0.20.0)

**Goal:** add an Accessibility / Contrast section to `DESIGN-STANDARDS.md` (codifying WCAG 2.1 AA as the floor) and fix the row ⋮ overflow button that shipped at 1.21:1 contrast (operator-confirmed unusable on phone). Triggered by operator question mid-walk: *"Don't we have accessibility standards in the design standards?"* — we didn't. Now we do.

**Files:**
- Modify: `DESIGN-STANDARDS.md` — append `## Accessibility — Contrast` section + change-log entry.
- Modify: `plugins/deskwork-studio/public/css/dashboard-row-affordances.css` — `.er-row-overflow` color → `var(--er-ink-soft)` (11.06:1).
- Modify: `plugins/deskwork-studio/public/css/editorial-studio.css` — desktop `.er-row-overflow` color → `var(--er-ink-soft)` (matching mobile for consistency).
- Modify: `plugins/deskwork-studio/public/css/dashboard-mobile.css` — empty-stage-tile chevron from `--er-paper-3` (1.21:1) → `--er-faded` (3.53:1, sibling regression caught during audit).
- Create: `plugins/deskwork-studio/public/mockups/row-overflow-contrast.html` — three directions (A/B/C) with WCAG ratios, proposed standard text, side-by-side comparison.
- Create: `docs/studio-design/ACCEPTED/2026-05-11-row-overflow-contrast-B-ink-soft/brief.md`.
- Create: `docs/studio-design/REJECTED/2026-05-11-row-overflow-contrast-A-faded/brief.md`.
- Create: `docs/studio-design/REJECTED/2026-05-11-row-overflow-contrast-C-press-mark-ring/brief.md`.
- Modify: `plugins/deskwork-studio/public/mockups/index.html` — card for Direction B picked.
- Modify: `scripts/probe-spec-compliance.mjs` — WCAG 2.1 relative-luminance + contrast-ratio helpers; per-affordance audit (⋮ overflow, drawer chip glyph + label, menu glyph + label + cmd hint).

**Sub-steps:**

- [x] **Step 1.8b.1:** ~~Run `/frontend-design` to produce contrast directions.~~ *(Landed in f8484c2 within the same workplan-1.8 release commit train. Three directions: A faded glyph 3.53:1, B ink-soft glyph 11.06:1, C press-mark ring 3.53:1+3.53:1. Operator picked B for headroom and visual consistency with section heads.)*
- [x] **Step 1.8b.2:** ~~Add `DESIGN-STANDARDS.md` § Accessibility / Contrast.~~ *(Landed in f8484c2. Codifies 4.5:1 body / 3:1 large / 3:1 non-text UI / 3:1 ornamental press-check chrome with WCAG criterion citations. Change-log entry added.)*
- [x] **Step 1.8b.3:** ~~Apply Direction B to `.er-row-overflow` on mobile + desktop.~~ *(Landed in f8484c2. Both viewports now at 11.06:1.)*
- [x] **Step 1.8b.4:** ~~Audit other affordances; fix sibling regressions.~~ *(Landed in f8484c2. Empty-stage-tile chevron was the same broken `--er-paper-3` foreground pattern; fixed at the same time.)*
- [x] **Step 1.8b.5:** ~~File ACCEPTED + REJECTED archive entries per design-standards rule.~~ *(Landed in f8484c2.)*
- [x] **Step 1.8b.6:** ~~Extend spec probe with WCAG contrast assertions per affordance.~~ *(Landed in f8484c2. 139/139 assertions pass on real WebKit at iPhone 14 viewport, up from 97/97; +42 contrast assertions. Per-stage drawer chip glyph + label vs chip bg; per-menu-item glyph + label + cmd hint vs menu bg; ⋮ overflow vs row fg.)*
- [x] **Step 1.8b.7:** ~~Commit.~~ *(Landed in f8484c2 — `feat(studio): land accessibility contrast standard + fix row ⋮ button`. Shipped as part of v0.20.0.)*

**Acceptance:**
- `DESIGN-STANDARDS.md` has an Accessibility / Contrast section with WCAG 2.1 AA minimums and "how to apply" guidance
- Row ⋮ overflow at ≥3:1 contrast on both viewports (actual: 11.06:1)
- Spec probe asserts WCAG contrast for every affordance the brief promises; passes 139/139
- ACCEPTED + REJECTED archive entries filed for each contrast direction considered

**Out of scope:**
- Wider studio audit (entry-review surface, scrapbook viewer, content view) — file as a separate task if/when needed. Phase 2/3 surfaces will inherit the new standard.

### Task 1.6 — Audit-driven remediations (Phase 0 / Phase 1 cleanup)

**Goal:** address gaps surfaced by the 2026-05-09 implementation audit. The audit was right about real gaps in the Phase 0 conformance sweep + feature-status doc rot; one finding was mis-characterized and is excluded here. Each item below is a concrete action that closes one audit finding.

The audit's full report lives at [`./2026-05-09-implementation-audit.md`](./2026-05-09-implementation-audit.md). Findings the operator/agent agreed to ACT on are listed below; findings rejected after verification are listed under "Audit findings rejected" at the end.

**Files:**
- Modify: `packages/core/src/iterate/iterate.ts`
- Modify: `packages/core/src/iterate/iterate.test.ts` (and any other tests asserting `reviewState: 'in-review'` after iterate)
- Modify: `README.md` (top-level — fix the lifecycle stage list)
- Create: `.claude/rules/state-machine.md`
- Modify: `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/README.md` (replace placeholder with real status)
- Modify: this workplan (Phase 4 reshape — see Step 1.6.7)

**Sub-steps:**

- [x] **Step 1.6.1:** Drop the `reviewState: 'in-review'` writes from `packages/core/src/iterate/iterate.ts`. *(Landed in 5a4584b. iterate.ts now strips vestigial reviewState via destructuring and does not emit the review-state-change journal event. CLI emit() drops the `state` field. Test suite swept: 1 iterate test rewrite + 1 new strip-vestigial test + 4 stale studio tests rewritten — total 7 tests touched, all green. 532 core / 196 cli / 430 studio tests pass.)*
- [x] **Step 1.6.2:** Update `README.md:19` — replace the lifecycle list `Ideas → Planned → Outlining → Drafting → Review → Published` with the post-redesign 8-stage list. *(Landed in c4ffa64. README now cites DESKWORK-STATE-MACHINE.md as canonical and lists eight stages + universal verbs.)*
- [x] **Step 1.6.3:** Create `.claude/rules/state-machine.md`. Step 0.1.6 was specced but never written. *(Landed in 785b42a. Rule mirrors design-standards.md's pattern: read-before-write, cite-Commandment-in-commit-message, anti-patterns refused. Pre-implementation gate explicit.)*
- [x] **Step 1.6.4:** Replace the feature `README.md` placeholder content with a real status table reflecting actual phase progress. *(Landed in bc1056a. README now has phase status table with Phase 0.1-0.3, 1.1-1.6, 2-4; issue cross-reference table; key-links section pointing at canonical docs + design archive.)*
  - Phase 0.1 — Complete (DESKWORK-STATE-MACHINE.md Final)
  - Phase 0.2 — Complete except cascading inventory (tracked in Task 0.2 footnote)
  - Phase 0.3 — Complete (DESIGN-STANDARDS.md Final, archive established, operator-approved)
  - Phase 1.1 — Complete
  - Phase 1.2 — Complete
  - Phase 1.3 — Complete
  - Phase 1.4 — Complete
  - Phase 1.5 — Pending operator-driven release
  - Phase 1.6 — In progress (this task)
  - Phase 2/3/4 — Not started
- [x] **Step 1.6.5:** ~~Promote the iterate.ts violation onto the Phase 0.2 inventory's "address now" list (currently it's in the deferred-cascade pile).~~ Subsumed by Step 1.6.1's commit 5a4584b — the violation was fixed directly rather than first being promoted on the inventory. Phase 0.2 inventory entries for iterate.ts (workplan lines 58, 64) updated to mark CLOSED with the commit reference.
- [x] **Step 1.6.6:** Re-narrate **Phase 4** to reflect that the Cancel verb is no longer a future cross-cutting affordance — it ships as a stage-conditional verb on dashboard rows + entry-review decision strip in v0.19. *(Landed in b2b93e2. Phase 4 header retitled, preamble re-narrated with audit citation, Task 4.3 reshaped from 'design + apply' to 'audit residual scope + complete', per-surface walk added, cross-cutting cancel-affordance probe dropped in favor of per-surface probes, acceptance criteria reworded.)*
- [x] **Step 1.6.7:** Commit each of the above as its own focused commit (per the per-phase commit-hygiene convention at the top of this workplan). *(Landed across six focused commits: 5a4584b 1.6.1 / c4ffa64 1.6.2 / 785b42a 1.6.3 / bc1056a 1.6.4 / 54355e9 1.6.5 / b2b93e2 1.6.6. Each commit message cites the relevant Commandment or audit finding it addresses.)*

### Task 1.7 — Final reviewState retirement (close the schema + journal cascade)

**Goal:** Land the residual `ReviewState` schema-type removal + `review-state-change` journal-event-emit removal so v0.19 closes the review-state retirement story end-to-end. The audit caught the contradiction (canonical doc says retired; schema type still defined; approve.ts still emits review-state-change events); Task 1.6 closed the iterate.ts side, this task closes the rest.

**Scope decisions:**

- **Schema field `entry.reviewState`** — REMOVED. zod's default is non-strict-keys, so existing on-disk sidecars carrying a `reviewState` field still parse cleanly (the field is silently dropped on read, then absent on next write).
- **Schema type `ReviewState`** — REMOVED. No code outside the migration tool references it after this task.
- **Journal event kind `review-state-change`** — KEPT in the union schema for *historical* read compat (journals on disk still carry these events) but no NEW code path emits one. The schema entry effectively becomes "legacy event kind, do not emit." This is the analogue of how the schema's `Review` stage-name remains in legacy data shapes without being a current stage.
- **`approve.ts` reviewState clear-and-emit** — REMOVED. With the schema field gone, the strip-on-transition is a no-op; the conditional `review-state-change.to=null` emit existed only to keep the doctor's journal-sidecar invariant green, and that invariant is also being removed (next bullet).
- **Doctor `validate-journal-sidecar` reviewState comparison** — REMOVED. With sidecar.reviewState gone there's nothing to compare against; the rule is dead. Note: the rule's *stage-transition* check stays.
- **`doctor/migrate.ts` reviewState read** — REMOVED. The migration tool no longer derives `entry.reviewState` from journal events because there's no field to derive into. The migration tool still works for the rest of the legacy → entry-centric conversion.
- **`entry/create.ts` reviewState param** — REMOVED. The optional `reviewState?: ReviewState` param on `createEntry` is dead; nothing should pass it post-spec.

**Files:**
- Modify: `packages/core/src/schema/entry.ts` (drop type + enum + field)
- Modify: `packages/core/src/iterate/iterate.ts` (drop destructure that targeted the now-gone field)
- Modify: `packages/core/src/entry/approve.ts` (drop strip + conditional emit)
- Modify: `packages/core/src/entry/create.ts` (drop reviewState param + spread)
- Modify: `packages/core/src/doctor/migrate.ts` (drop reviewState derivation + helper)
- Modify: `packages/core/src/doctor/validate.ts` (drop journal-sidecar reviewState comparison)
- Modify: `packages/cli/src/commands/iterate.ts` (docstring sweep)
- Touch: `packages/core/src/schema/journal-events.ts` only to add a deprecation comment to `ReviewStateChangeEvent` — schema kept for historical reads.
- Update tests across `packages/core/test/` for behavior changes.

**Sub-steps:**

- [x] **Step 1.7.1:** Schema-side removal. *(Landed in f6f845a. Type, enum, and field all dropped from entry.ts. zod's non-strict read confirmed working — existing on-disk sidecars carrying vestigial `reviewState` parse cleanly.)*
- [x] **Step 1.7.2:** approve.ts + iterate.ts adjustments. *(Landed in f6f845a.)*
- [x] **Step 1.7.3:** create.ts cleanup. *(Landed in f6f845a.)*
- [x] **Step 1.7.4:** Doctor migrate.ts cleanup. *(Landed in f6f845a. Including `translateLegacyState` removal — turned out to have no other callers, so deleted entirely.)*
- [x] **Step 1.7.5:** Doctor validate.ts cleanup. *(Landed in f6f845a. Stage-transition invariant preserved.)*
- [x] **Step 1.7.6:** ~~Add deprecation comment to `journal-events.ts` `ReviewStateChangeEvent`.~~ Skipped — the schema is unmodified (kept for historical reads as planned), and the event kind's role as legacy-only is now codified by `.claude/rules/state-machine.md` ("Anti-patterns refused: writing reviewState"). A comment in journal-events.ts adds noise without changing behavior; the rule is the durable record.
- [x] **Step 1.7.7:** CLI iterate.ts docstring sweep. *(Landed in f6f845a.)*
- [x] **Step 1.7.8:** Test suite sweep. *(Landed in f6f845a — 3 failing tests rewritten: approve.test.ts #215 emit-on-clear, migrate.test.ts #141 reviewState read, validate-journal-sidecar.test.ts mismatch flag. Workspace tests: core 530/530, cli 196/196, studio 430/430.)*
- [x] **Step 1.7.9:** `deskwork doctor` post-cleanup. *(Verified: the 4 pre-existing `journal-sidecar [...]: latest review-state-change.to=in-review does not match sidecar reviewState=null` warnings are gone. Remaining 10 findings are pre-existing missing/orphan frontmatter-id issues unrelated to this task.)*
- [x] **Step 1.7.10:** Commit. *(Landed as one focused commit f6f845a — schema removal + cascade is tightly coupled and makes a coherent reviewer-readable diff.)*

**Acceptance:**
- `ReviewState` type no longer exported from `@deskwork/core/schema/entry`
- `entry.reviewState` no longer in the EntrySchema
- No code path emits `review-state-change` journal events
- The historical event kind reads cleanly from existing journals on disk
- All workspace tests green
- `deskwork doctor` reports no regressions; the prior journal-sidecar warnings about review-state are gone

**Out of scope (explicit):**
- Cleaning legacy `reviewState` fields from already-on-disk sidecars. The doctor's existing migration is responsible for legacy data; we don't ship a one-shot cleaner for it because the field is silently dropped on next write.
- Removing the historical `review-state-change` event kind from the journal schema. Historical reads must continue to work.

---

**Audit findings rejected after verification:**

- *"`approve.ts` still persists and journals review-state semantics."* Mis-characterized. `approve.ts:99-103` deletes `reviewState` from the sidecar on stage transition (`const { reviewState: _drop, ...rest } = sidecar`) and journals the prior value for audit. That's the *correct* post-spec behavior — approve cleans up vestigial state. No fix needed.
- *"Step 0.3.8 is unchecked."* Stale at audit time. Operator HAS signed off via 5 `/deskwork:approve` invocations (commits d55d5c0, e9923d6, e20ade1, df90c1f); workplan checkbox is now ticked.
- *"Phase 1.4 not yet recorded."* The audit was written before Phase 1.4 ran. Phase 1.4 is now complete (commits 9561622 + b4de035); workplan reflects this.
- *"Cancel landed before Phase 4 — out of order."* Mis-framed. Cancel ships as a stage-conditional verb per Commandment II; integrating it during Phase 1 is correct. The Phase 4 plan is what's stale (Step 1.6.6 addresses).

---

## Phase 2 — Extract `mobile-shell` + Shortform desk → v0.22

> **Target version note:** Originally scoped as v0.21. While studio-mobile-first
> was in progress, the parallel `feature/command-shortcuts` branch released
> v0.21.0 (dw-lifecycle command shortcuts + CLI off-pipeline transitions). Phase 2
> shifts to v0.22.0; historical commit messages preserve the v0.21 references
> as written.

**Goal:** Pull the **genuinely shared** mobile primitives into a small shared module, then build Shortform as a new mobile-first surface. Closes #244.

**Audit-driven re-scope (2026-05-12):** The original Phase 2 framing assumed (a) the dashboard had a `mobile-bar` equivalent to entry-review and (b) the three "sheet-like" patterns shared one abstraction. Neither is true — see [`2026-05-12-mobile-shell-audit.md`](./2026-05-12-mobile-shell-audit.md). The dashboard's stage-tiles are an in-flow navigation idiom, not a fixed bar. The row-actions per-row swipe drawer is a different gesture model than the slide-up sheet shared by `mobile-sheet-bar.ts` + `compose-chip.ts`. Task 2.1 is re-scoped to the narrow, evidence-grounded extraction (operator-approved Direction A). Server-side bar/sheet templates are deferred to Task 2.2 when Shortform mockups give a concrete consumer shape — designing API against a hypothetical consumer is exactly the over-abstraction `THESIS.md` rejects.

### Task 2.1: Narrow extraction — probe helpers + slide-up sheet controller

**Files:**
- Create: `scripts/lib/mobile-probe-helpers.mjs` (shared probe helpers — `ping`, `assert`, `bootBrowser`, `pickEntry`, `summarizeResults`; pure deduplication, zero surface-specific logic)
- Create: `plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts` (parameterized slide-up sheet controller — drag-handle, scrim, close-btn, Escape, slot dispatch optional)
- Modify: `plugins/deskwork-studio/public/src/entry-review/mobile-sheet-bar.ts` — consume the shared controller, drop the ~60 lines of duplicated gesture code
- Modify: `plugins/deskwork-studio/public/src/dashboard/compose-chip.ts` — consume the shared controller, drop the ~40 lines of duplicated gesture code
- Modify: `scripts/probe-mobile-editor.mjs`, `scripts/probe-mobile-scrapbook.mjs`, `scripts/probe-mobile-dashboard.mjs` — consume the shared probe helpers, drop the duplicated `ping`/`assert`/`bootBrowser` definitions

**Out of scope (deferred to Task 2.2 — operator-approved Direction A):**
- Server-side `renderMobileBar(config)` / `renderMobileSheet(config)` templates — designed when Task 2.2's Shortform consumer shape is concrete, not before
- Stage-tiles abstraction — different idiom from a tab bar, not shared
- Row-actions swipe-drawer abstraction — different gesture model, not shared
- Cross-surface CSS extraction (`mobile-shell.css`) — press-check tokens already cascade from `editorial-review.css`'s root vars; no JS-layer extraction needed
- Breakpoint alignment (entry-review uses `48rem`/768px; dashboard uses `600px`) — captured as a parked decision below; not blocking Task 2.1 because the narrow extraction does not introduce new shared CSS

**Sub-steps:**

- [x] **Step 2.1.1:** ~~Audit entry-review's `mobile-bar.ts`, `mobile-sheet-bar.ts`, the press-check CSS block, and Phase 1's dashboard mobile-bar. Identify the shared core vs. surface-specific config.~~ *(Landed 2026-05-12 in commit `c920fc2` — `2026-05-12-mobile-shell-audit.md`. Dashboard never had a mobile-bar; three sheet-like patterns are two idioms; probe helpers are pure duplication.)*
- [x] **Step 2.1.2:** ~~Design the `mobile-shell` public API.~~ *(Operator picked Direction A 2026-05-12: narrow extraction only. Server bar/sheet templates deferred to Task 2.2.)*
- [ ] **Step 2.1.3:** Extract probe helpers to `scripts/lib/mobile-probe-helpers.mjs`. Migrate the three existing probes to consume it. Run each probe to confirm green:
  ```bash
  node scripts/probe-mobile-editor.mjs && node scripts/probe-mobile-scrapbook.mjs && node scripts/probe-mobile-dashboard.mjs
  ```
- [ ] **Step 2.1.4:** Write failing tests for the sheet controller (matchMedia gate, drag-to-dismiss threshold past 80px, Escape closes, click-outside closes via scrim, open/isOpen/close API surface):
  ```bash
  npm test --workspace @deskwork/studio -- --run mobile-shell
  ```
  Expected: FAIL (module doesn't exist yet).
- [ ] **Step 2.1.5:** Implement `plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts` exposing `createSlideUpSheet(opts: { sheetEl, bodyOpenClass, handleEl?, closeBtnEl?, scrimEl?, dragDismissPx?, slideMs?, onClose? })`. Pass tests.
- [ ] **Step 2.1.6:** Migrate `mobile-sheet-bar.ts` to consume the shared controller. Existing `probe-mobile-editor.mjs` and `probe-mobile-scrapbook.mjs` MUST still pass — they are the regression net for the migration. Drop the ~60 lines of duplicated gesture code from `mobile-sheet-bar.ts`.
- [ ] **Step 2.1.7:** Migrate `compose-chip.ts` to consume the shared controller. Existing `probe-mobile-dashboard.mjs` MUST still pass. Drop the ~40 lines of duplicated gesture code from `compose-chip.ts`.
- [ ] **Step 2.1.8:** Run all probes + smoke + workspace tests:
  ```bash
  node scripts/probe-mobile-editor.mjs && node scripts/probe-mobile-scrapbook.mjs && node scripts/probe-mobile-dashboard.mjs && node scripts/smoke-er-viewport-regressions.mjs && npm test --workspaces
  ```
  Expected: all green.
- [ ] **Step 2.1.9:** Commit per the per-phase commit-hygiene convention:
  - `refactor(scripts): extract mobile-shell probe helpers` (Step 2.1.3)
  - `test(studio): mobile-shell sheet-controller failing tests` (Step 2.1.4)
  - `feat(studio): mobile-shell sheet-controller — slide-up sheet primitive` (Step 2.1.5)
  - `refactor(studio): migrate entry-review mobile-sheet-bar to mobile-shell controller` (Step 2.1.6)
  - `refactor(studio): migrate dashboard compose-chip to mobile-shell controller` (Step 2.1.7)

**Parked decision (not blocking Task 2.1):**

- **Breakpoint alignment.** Entry-review uses `(max-width: 48rem)` = 768px; dashboard uses `(max-width: 600px)`. A cross-surface CSS extraction would need to resolve this — surface this when/if Task 2.2 or Task 2.3 introduces shared CSS. Until then, both breakpoints stay where they are (and the audit confirms this is fine for Direction A; the JS controller doesn't gate on either breakpoint — its consumers do).

**Out-of-band findings flagged for separate cleanup:**

- `plugins/deskwork-studio/public/src/entry-review/mobile-actions-slot.ts:64` surfaces a `reject` verb (`/deskwork:reject <slug>` clipboard-copy). `reject` is not in `DESKWORK-STATE-MACHINE.md` — Commandment II violation. Filed as [#260](https://github.com/audiocontrol-org/deskwork/issues/260). NOT Task 2.1 work — separate state-machine compliance commit.
- `mobile-shell/sheet-controller.ts` returns a controller with no `destroy()` method. Listeners on `document` (mousemove, mouseup, keydown) are attached once per instance and never removed. Not a current bug — both consumers are page singletons — but the API will leak if a third consumer instantiates dynamically. Filed as [#261](https://github.com/audiocontrol-org/deskwork/issues/261). Surfaced by `/dw-lifecycle:review` on commits `275b8fa..c661a5a`.

**Acceptance for Task 2.1:**
- `scripts/lib/mobile-probe-helpers.mjs` exists and is consumed by all three existing probes
- `plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts` exists with tested API
- `mobile-sheet-bar.ts` and `compose-chip.ts` consume the shared controller (no duplicated gesture code)
- All probes + smoke + workspace tests green
- No regressions on entry-review or dashboard surfaces (validated by existing probes)

### Task 2.2: Mockup + implement Shortform mobile-first (re-scoped to v7 cross-cutting architecture, 2026-05-12)

**v7 architecture re-scope (2026-05-12):** During Task 2.2.2 the operator and agent worked through seven mockup refinements (v1→v7) of the cross-cutting bar. The operator approved v7's "Desk as hub" star-nav architecture, which expands Task 2.2's scope from "Shortform mobile-first" to "v7 cross-cutting architecture + Shortform implementation atop it." Sub-steps 2.2.5–2.2.10 are restructured to reflect this. Mockups: [`cross-bar-2-refined-v7-masthead-fixes.html`](../../../../plugins/deskwork-studio/public/mockups/cross-bar-2-refined-v7-masthead-fixes.html) (the architecture) + [`desk-states-v7.html`](../../../../plugins/deskwork-studio/public/mockups/desk-states-v7.html) (the Desk's full IA under v7).

**The v7 architecture in one paragraph:** Star navigation — the Desk (`/dev/editorial-studio`) is the hub; every other surface is a leaf reached BY navigating from the Desk. Every non-Desk surface carries a `←` glyph (leftmost masthead) and a `⋮` glyph (rightmost masthead). The Desk absorbs the Shortform desk's content as a Shortform-by-platform section + reserves Adjacent-tools tiles for Phase 3 (Folio + Files). The bar has zero nav region — pure 1-6 contextual cells. The masthead `⋮` opens a popover anchored under the glyph (same idiom as v0.20 row ⋮, NOT the Phase 2.1 slide-up sheet primitive — top-anchored affordances reveal popovers, not sheets).

**Files (revised):**
- Modify: `DESIGN-STANDARDS.md` (add `§ Studio navigation model` + `§ Desk information architecture` sections)
- Create: `docs/studio-design/ACCEPTED/2026-05-12-cross-bar-2-star-nav-desk-as-hub/` (archive entry)
- Create: `docs/studio-design/REJECTED/2026-05-12-cross-bar-1-nav-strip-plus-action/` + REJECTED entries for cross-bar 3, cross-bar 2 refinements v1/v2/v3/v5/v6
- Create: `packages/studio/src/pages/masthead.ts` (universal masthead chrome — back-link + ⋮ menu)
- Create: `plugins/deskwork-studio/public/src/mobile-shell/masthead-popover.ts` (new client primitive — popover anchored under masthead ⋮; not the slide-up sheet)
- Refactor: `packages/studio/src/pages/entry-review/mobile-bar.ts` → `packages/studio/src/pages/mobile-bar.ts` (universal; drop nav region; cap 6 cells)
- Modify: `packages/studio/src/pages/dashboard.ts` (add Shortform-by-platform section + Adjacent-tools placeholder tiles)
- Modify: `packages/studio/src/pages/shortform-review.ts` (use new masthead + mobile-bar; address audit findings G.1-G.6)
- Modify: `plugins/deskwork-studio/public/src/editorial-review-client.ts` (remove `postDecision` POST chain per THESIS Cons. 2 fix)
- Modify: `plugins/deskwork-studio/public/css/editorial-review.css` (retire `[data-review-ui="longform"]` scoped selectors that now apply to all surfaces; drop dead `.er-galley` CSS)
- Create: `plugins/deskwork-studio/public/css/mobile-shell.css` (new file for masthead + bar + menu-popover CSS)

- [x] **Step 2.2.1:** ~~Audit `/dev/editorial-review-shortform`. Identify the data shape (shortform entries vs. longform), and the open #244 (TOC drawer per #169) requirements.~~ *(Landed 2026-05-12 in `2026-05-12-shortform-audit.md`. Surfaces have zero mobile CSS scoped to shortform; both pages carry Commandment III stamps; `editorial-review-client.ts:1619` POSTs state mutations (THESIS violation). TOC infrastructure is one call away (`rehype-slug` already runs in `renderMarkdownToHtml`). `sheet-controller` is ready to consume; `renderMobileBar` would need parameterization to share. Six out-of-band findings catalogued for separate triage.)*
- [x] **Step 2.2.2:** ~~Invoke `/frontend-design` for Shortform mockups. Honor press-check; explore: tab bar with TOC tab (closing #244), hybrid card-stream, etc.~~ *(Landed 2026-05-12. Three direction shortform mockups + seven cross-bar refinement mockups (v1→v7) + desk-states mockup. Architecture settled at v7: Desk-as-hub star nav, zero-nav-region bar, masthead ←/⋮ chrome.)*
- [x] **Step 2.2.3:** ~~Update `mockups/index.html`. Commit `design(studio): three shortform direction mockups (HTML, no code)`.~~ *(Landed 2026-05-12. Gallery index updated through v7 + desk-states.)*
- [x] **Step 2.2.4:** ~~Operator picks. **STOP for pick.**~~ *(2026-05-12: operator approved v7 architecture — "Desk as hub" star nav; v7 masthead chrome (← leftmost + ⋮ rightmost, popover-not-sheet); desk-states v7 (all 8 longform stages + 4 shortform platforms + 2 future tiles, single-expand within section, independent across sections). Shortform contextual region pick (Shortform-1/2/3) still pending — folded into Step 2.2.10.)*
- [x] **Step 2.2.5: ~~Land v7 architecture in standards + archive.~~** *(Landed 2026-05-12. Added `§ Studio navigation model` + `§ Desk information architecture` sections to `DESIGN-STANDARDS.md`. Marked Bottom-tabbar + Per-row-affordance parked decisions RESOLVED. Filed ACCEPTED archive entry at `docs/studio-design/ACCEPTED/2026-05-12-cross-bar-2-star-nav-desk-as-hub/` + 7 REJECTED entries covering cross-bar 1, cross-bar 3, and cross-bar 2 refinements v1, v2, v3, v5, v6 — each `brief.md` references its source mockup file. Change log appended.)*
- [x] **Step 2.2.6: ~~Extract `renderMasthead()` universal chrome.~~** *(Landed 2026-05-12. Helper at `packages/studio/src/pages/masthead.ts` exposes `renderMasthead({ kicker | kickerHtml, slug | title, metaInline, isHub, menuTriggerId })`. CSS at `plugins/deskwork-studio/public/css/mobile-shell.css` (mobile-only at ≤600px; desktop refinement deferred). Three consumers migrated: dashboard (`isHub: true`), entry-review longform (slug-shaped), shortform-review (kickerHtml carries platform tag). Existing strip + folio chrome left intact below the new masthead — retirements scoped to Step 2.2.8. 14 smoke tests added (`packages/studio/test/masthead-smoke.test.ts`) cover helper-unit contract + dashboard/entry-review surface emission. All 463 studio tests pass; build typecheck clean; plugin validates.)*
  - Create `packages/studio/src/pages/masthead.ts` exposing `renderMasthead(opts)`:
    ```ts
    renderMasthead({
      kicker: string,                                     // mono caps, red
      slug?: string,                                      // mono, when slug-shaped surface
      title?: string,                                     // italic display, when title-shaped surface
      metaInline?: string,                                // optional inline meta after sep
      isHub: boolean,                                     // true on Desk; suppresses back-link
    })
    ```
  - Back-link: single italic-display `←` in `--er-proof-blue` (8.13:1 vs paper), 24px visual / 44px tap target via padding+margin; absent only when `isHub: true`.
  - Menu glyph: mono `⋮` in `--er-ink-soft` (8.92:1), 24px visual / 44px tap target; same idiom as v0.20 row overflow.
  - Masthead height 102px on mobile (was 82px in entry-review's chrome); `align-items: center` so glyphs flank text stack without overlapping border-bottom rule.
  - Replace existing masthead chrome on entry-review longform (`entry-review/index.ts`), shortform review (`shortform-review.ts`), dashboard (`dashboard.ts`) with universal `renderMasthead` consumption.
  - Commit: `feat(studio): renderMasthead universal chrome (v7 ← + ⋮)`.
- [x] **Step 2.2.7: ~~Implement masthead ⋮ popover menu primitive.~~** *(Landed 2026-05-12 in `7e03d57` + review fixes in `83ca3a5`. ARIA role downgraded `menu` → `dialog` per review — settings panel pattern, not menubar. WCAG 2.4.7 Focus Visible violation fixed by splitting `:hover` and `:focus-visible` blocks across three masthead controls (back, menu, popover-item). Configure (Phase 4) placeholder gets `tabindex="-1"` so keyboard tab order skips the non-interactive item. About-modal destination deferred to [#262](https://github.com/audiocontrol-org/deskwork/issues/262); current placeholder links to `/dev/editorial-help`. Idempotency sentinel on the popover element prevents double-wiring on re-init.)*
  - Create `plugins/deskwork-studio/public/src/mobile-shell/masthead-popover.ts` exposing `createMastheadPopover({ triggerEl, popoverEl, scrimEl, onClose })`.
  - NOT the Phase 2.1 `createSlideUpSheet` — popovers are different. Position absolute, anchored under trigger, up-arrow CSS-rendered at trigger's x-coord. Dismiss patterns: scrim tap, trigger tap-again, Escape. Active state: trigger gets `.popover-open` class (color shifts to `--er-red-pencil`).
  - Server-side popover content rendered alongside masthead by `renderMastheadMenu()` helper: three sections (Operator help [Manual + Keyboard shortcuts], Configure [placeholder for Phase 4], Connect [File an issue → github new tab + About → in-studio about pane]).
  - Wire menu sections to existing destinations: Manual → `/dev/editorial-help`; Keyboard shortcuts → existing `?` overlay on entry-review (move to universal shortcut overlay primitive); File an issue → `https://github.com/audiocontrol-org/deskwork/issues/new` in new tab; About → small in-studio modal with version + license + thesis link.
  - Configure entry remains dimmed (Phase 4 placeholder).
  - Commit: `feat(studio): masthead ⋮ popover menu (v7 — Manual / Shortcuts / File-issue / About)`.
- [x] **Step 2.2.8: ~~Refactor `renderMobileBar()` — drop nav region.~~** *(Landed 2026-05-12. `packages/studio/src/pages/mobile-bar.ts` exposes the universal `renderMobileBar({ contextual: readonly Cell[] })` with a `Cell` discriminated-action API (`{kind:'sheet',name}` or `{kind:'direct',action}`). Entry-review-specific helpers (`renderMobileSheet`, `renderStripModeSegment`, `renderStripEditExit`, `getEntryReviewBarCells`) split into `packages/studio/src/pages/entry-review/mobile-sheet.ts`. Entry-review consumer at `index.ts:318` passes its 6 cells via `getEntryReviewBarCells()`. CSS `[data-review-ui="longform"]` predicates were ALREADY absent on `.er-mobile-bar` / `.er-mobile-tab*` selectors — the audit step (`2026-05-12-mobile-bar-audit`) confirmed the workplan's CSS-removal directive was preemptive; the rules at `editorial-review.css:3742-3768` that DO carry the predicate hide longform-specific siblings (marginalia/outline tabs, strip-right) and are correctly scoped. 25 new spec-derived smoke tests at `packages/studio/test/mobile-bar-smoke.test.ts` cover throw conditions, attribute shape, ARIA gating, mode classes, count badges, modifier classes, and verbatim back-compat emission for all 6 entry-review cells. All 500/500 studio tests pass (+25 from 475). `tsc --noEmit` clean. Live probes all green: probe-mobile-editor (23 assertions), probe-mobile-scrapbook (10), probe-mobile-dashboard (24) — 57 assertions across three surfaces confirm bytes-equivalent markup to the pre-refactor hardcoded chrome.)*
- [x] **Step 2.2.9: ~~Implement Desk's Shortform-by-platform + Adjacent-tools sections.~~** *(Landed 2026-05-12. The Desk now renders three sections on mobile per `desk-states-v7.html`: Longform pipeline (existing 8 stages + Distribution), Shortform · by platform (new — 4 platform tiles LinkedIn/Reddit/YouTube/Instagram with colored badges, all rendered even at zero count per the empty-state-as-pipeline-shape principle), and Adjacent tools (new — 2 inert Folio + Files future tiles with `aria-disabled=true` + "phase 3" tag). New files: `packages/studio/src/pages/dashboard/shortform-section.ts` (202 lines), `packages/studio/src/pages/dashboard/adjacent-section.ts` (67 lines), `plugins/deskwork-studio/public/css/dashboard-desk-sections.css` (358 lines). Modified: `dashboard.ts` (wires the new sections + dual-count masthead meta), `dashboard/data.ts` (extends DashboardData with `shortformWorkflows` + `shortformByPlatform`; takes `ctx.config`), `dashboard/section.ts` (adds `data-stage-section-group="longform"` for partitioned single-expand), `dashboard/stage-tiles.ts` client controller (single-expand now scoped per `data-stage-section-group` so longform + shortform expand independently). Per Commandment III: rows do NOT render `.er-stamp` chrome (asserted in tests). Per THESIS Cons. 2: rows are navigation-only (no `<button>`, no `data-action`, no `data-copy` in shortform-row markup — `⋮` is an `<a>` linking to `/dev/editorial-review/<workflow.id>`; the v0.20 stage-aware row popover lands in Step 2.2.10 once shortform verb-routing is fixed). Empty-state contrast bumped from `--er-faded` (3.48:1, fails 4.5:1) to `--er-ink-soft` (8.92:1) for body labels per desk-states-v7 a11y audit; ornamental chrome (glyphs + chevrons) stays at `--er-faded` (3.53:1, passes ornamental floor). Stage tile + platform tile + future tile min-height all at 44px (WCAG 2.5.5). 543/543 studio tests pass (+43 from 500). tsc clean. Live `probe-mobile-dashboard.mjs` regresses zero existing v0.20 row-affordance assertions. Visual verification at 390×844 confirms all 6 new tiles + 2 section heads render correctly; desktop chrome unchanged (the v7 mobile sections are gated to `@media (max-width: 600px)` because desktop refinement is out-of-scope for this feature branch). NOTE: the future-tile is the new bottom-of-page element; the Compose FAB sits on top of it at the bottom-right corner (z-index 65 vs static), which is acceptable because future-tiles are non-interactive.)*
- [x] **Step 2.2.10: ~~Implement shortform review surface using v7 universal chrome + address audit findings.~~** *(Landed 2026-05-13. `packages/studio/src/pages/shortform-review.ts` consumes the universal `renderMobileBar({ contextual: getShortformBarCells({ tocEntries, versions }) })` + new shortform-specific sheet host `renderShortformMobileSheet(...)` (in `packages/studio/src/pages/shortform-review-mobile-sheet.ts`). `er-strip` chrome + `renderControlsRight` + `renderShortcutsOverlay` + `renderEditToolbar` all removed. G.1: `er-stamp` markup removed from both `shortform.ts:85` (desk row) and `shortform-review.ts:329` (review hero strip). G.2: `renderControlsRight()` deleted — verbs are stage-gated only in the new server-rendered Actions slot. G.3: `postDecision()` / `ensureInReview()` / `postRejectAnnotation()` POST chain removed from `editorial-review-client.ts:1619`; the decision handlers are clipboard-copy only per THESIS Cons. 2. G.4 (issue #260): `data-action="reject"` → `data-action="cancel"`; the inline rejection-reason composer + `r-r` keyboard chord retired (cancel is terminal). G.5: shortform iterate command now carries `--platform <p> [--channel <c>]` per `state.workflow.platform`/`channel`. G.6: 80 lines of dead `.er-galley` CSS deleted from `editorial-review.css:941-1022`. Client-side: new slim `initShortformReview(state, workflowId, versionNum)` dispatched when `[data-review-ui="shortform"]` is on the shell, wiring decision-button clipboard-copy + universal mobile bar/sheet open-close + auto-refresh poll; longform path unchanged. Probes: `scripts/probe-mobile-shortform.mjs` exercises 17 spec-derived assertions (page status; masthead chrome; bar cell composition; Actions sheet opens; three verbs present with `cancel` not `reject`; no `.er-stamp` / `.er-pending-state`; no horizontal scroll; desktop hides mobile chrome). `scripts/lib/mobile-probe-helpers.mjs` `parseProbeArgs` extended with `--workflow-id` (also supports `--flag=value` form). Workspace tests: 562/562 pass (+15 from 547). Existing probes still green: probe-mobile-editor (23), probe-mobile-scrapbook (10), probe-mobile-dashboard (24), smoke-er-viewport-regressions (12/12).)*

  **Per `DESIGN-STANDARDS.md` § Universal bar contract (settled 2026-05-13), shortform consumes the universal `renderMobileBar` primitive — there is no per-surface idiom pick.** The per-surface design variable is *which cells* the bar carries, not what shape the bar takes. The three pre-v7 shortform-bespoke mockups (Shortform-1/2/3) are archived under `docs/studio-design/REJECTED/2026-05-12-shortform-{1,2,3}-*/` with briefs noting their supersession. Do not re-litigate the chrome shape.

  **The cells to pass to `renderMobileBar`:** derived mechanically from the surface's stage-gated verb set + #244 closure + the workflow's auxiliary surfaces. Concretely:

    1. `{kind:'sheet', name:'toc'}` — TOC sheet (h2/h3/h4 entries from the rendered body). **Hidden when fewer than 2 entries exist** (cell omitted from the `Cell[]`, not rendered-and-disabled). Closes #244 by carrying the same TOC behavior as the entry-review longform surface. Cell label: `TOC · N` where N is the entry count.
    2. `{kind:'sheet', name:'versions'}` — Versions sheet (revision history per `DESKWORK-STATE-MACHINE.md` § Versions and revisions). **Hidden when only one revision exists**. Cell label: `Versions · N`.
    3. `{kind:'sheet', name:'actions'}` — Actions sheet listing the stage-gated verbs (Iterate / Approve / Cancel as clipboard-copy buttons). Always present on an active workflow. Cell label: `Actions`.

  The cell ordering and the conditional-omission logic for cells 1+2 are surface-level decisions, not chrome shape. Implementation in `shortform-review.ts` constructs the `Cell[]` and passes it to `renderMobileBar({ contextual })`. No bespoke chrome wrapper, no FAB trigger, no surface-specific sticky strip.

  **Update `packages/studio/src/pages/shortform-review.ts`** to use `renderMasthead` (new) + `renderMobileBar` (new universal) with the cells above. Remove existing `er-strip` chrome.

  **Address out-of-band findings G.1-G.6 from Task 2.2.1 audit (see `2026-05-12-shortform-audit.md`):**

    - G.1 Commandment III state-stamps (`shortform.ts:85` + `shortform-review.ts:313`): remove the `<span class="er-stamp er-stamp-${state}">` markup; state is no longer surfaced as a label.
    - G.2 Commandment I/II state-based branching: refactor `renderControlsRight()` to render verbs unconditionally (iterate / approve / cancel) — verb visibility is stage-gated only, not state-gated. **Pending-state pills** (`"awaiting apply…"` / `"agent iterating…"`) are review-state surfacing per Commandment III and are removed entirely; they do not move elsewhere. (Note: shortform-review.ts file header documents intentional deferral of the legacy state machine — for this step verify the actual code touches Commandment violations and not the deferred state-machine migration; defer the broader migration to a separate task if its scope expands the diff.)
    - G.3 THESIS Cons. 2 violation: remove `postDecision()` POST chain from `editorial-review-client.ts:1619-1764`. Verbs become clipboard-copy only — no state mutation from button clicks. Server endpoint `/api/dev/editorial-review/decision` can stay for now (other callers may exist) but the client must not invoke it from the shortform/longform decision handlers.
    - G.4 Reject verb violation (matches issue [#260](https://github.com/audiocontrol-org/deskwork/issues/260)): replace `data-action="reject"` with `data-action="cancel"`; copy `/deskwork:cancel` instead of `/deskwork:reject`. Update keyboard shortcut from `r` to `c` (or retire — `cancel` doesn't need a double-tap shortcut).
    - G.5 Iterate `--platform` / `--channel` flags: update `pendingSkillCmd()` and the iterate handler at `editorial-review-client.ts:1734-1739` to include `--platform ${workflow.platform} --channel ${workflow.channel}` when `contentKind === 'shortform'`.
    - G.6 Dead `.er-galley` CSS at `editorial-review.css:941-1022`: delete the ~80 dead lines.

  **Cell-API fit check resolution:** the universal bar contract makes the question of *"do pending pills move out, or does Cell gain an info arm"* moot — pending pills are review-state surfacing per Commandment III and are REMOVED (not moved). The `Cell` API stays as-is (`{kind:'sheet'}` + `{kind:'direct'}`). No new arm.

  Probe extension: `mobile-probe-helpers.mjs` `parseProbeArgs` add `--workflow-id` parameter for shortform-specific probe URL pattern (`/dev/editorial-review/<workflow-id>`).

  Commit: `feat(studio): shortform review surface — v7 universal chrome + state-machine compliance (G.1-G.6)`.

  **Review deferrals (filed 2026-05-13 after `/dw-lifecycle:review` cycle on ce0eb9f + bf50ffc + ab955f7):**
  - [ ] **Step 2.2.10-f1:** Delete confirmed-dead longform body from `editorial-review-client.ts` + migrate the two coupled tests (`review-marginalia-behavior.test.ts`, `review-scrapbook-drawer.test.ts`) to point at `entry-review-client.ts` where the longform behavior actually ships. Drops the file from 2244 lines to ~430 (below the 300–500 cap). Filed as [#264](https://github.com/audiocontrol-org/deskwork/issues/264). Deferred from this commit because the test-migration is non-trivial scope expansion.
  - [ ] **Step 2.2.10-f2:** Add JSDOM unit tests for `initShortformMobileSheet` (open/close/toggle, slot switching, KICKERS header config, drag-race guard). Pairs with the existing `mobile-shell-sheet-controller.test.ts` pattern. Filed as [#265](https://github.com/audiocontrol-org/deskwork/issues/265). Deferred because Playwright probe coverage is already in place; unit tests are belt-and-suspenders.

### Task 2.3: Probes + smoke (v7 multi-surface)

**Files:**
- Create: `scripts/probe-mobile-shortform.mjs`
- Create: `scripts/probe-mobile-desk.mjs` (new — covers Shortform-by-platform section + Adjacent-tools tiles)
- Modify: `scripts/probe-mobile-dashboard.mjs` (existing — extend with v7 masthead + ⋮ popover assertions)
- Modify: `scripts/lib/mobile-probe-helpers.mjs` (add `--workflow-id` arg parser, masthead chrome assertions)
- Modify: `scripts/smoke-er-viewport-regressions.mjs`

- [x] **Step 2.3.1:** Extend `mobile-probe-helpers.mjs` with shared masthead chrome assertions (back-link visible on non-Desk surfaces, ⋮ glyph visible on every surface, popover opens on ⋮ tap, popover anchored under glyph, dismisses correctly). *(Landed in `a1407e1`: `assertMastheadChrome(page, isHub, failures)` + `assertMastheadMenuPopover(page, failures)`; helpers used by probe-mobile-shortform.mjs (refactored), probe-mobile-dashboard.mjs (Step 2.3.4), and probe-mobile-desk.mjs (Step 2.3.3).)*
- [x] **Step 2.3.2:** Write `probe-mobile-shortform.mjs` for the shortform review surface — exercises Iter/Apprv/Canc via the universal `renderMobileBar`'s Actions sheet cell. Assert TOC drawer behavior (#244), the conditional-cell omission rules (TOC cell hidden when <2 headings; Versions cell hidden when <2 revisions), no horizontal scroll, masthead chrome present. *(Landed in `ce0eb9f` during Step 2.2.10 — 17 spec-derived assertions, dual-viewport, auto-discovers a workflow via `/dev/editorial-review-shortform` when `--workflow-id` omitted.)*
- [x] **Step 2.3.3:** Write `probe-mobile-desk.mjs` for the Desk's Shortform-by-platform section expansion + Adjacent-tools tile presence. *(Landed in `a1407e1`: phone + desktop viewports; asserts 8 longform tiles + 4 shortform platform tiles + 2 adjacent future tiles; verifies empty-state muted-palette contract (opacity===1; chevron visibility:hidden); verifies independent single-expand across longform/shortform sections. Surfaced + fixed one spec/CSS divergence: `dashboard-mobile.css:430` was coloring empty-tile chevron `--er-faded` instead of `visibility:hidden` per § Empty-state rendering.)*
- [x] **Step 2.3.4:** Extend `probe-mobile-dashboard.mjs` for v7 masthead + ⋮ popover (replaces the v0.19 floating ? overlay). *(Landed in `a1407e1`: phone block now asserts Desk-isHub masthead + popover open/close cycle; desktop block asserts masthead `display:none`. Factored v0.20 row-affordance chrome into new `scripts/lib/row-affordance-probe.mjs` (182 lines) to keep `probe-mobile-dashboard.mjs` under the 500-line cap (was 516; now 380).)*
- [x] **Step 2.3.5:** Run all probes + smoke; fix until green. *(Verified at `a1407e1`. All probes pass at dev studio on http://localhost:47322: probe-mobile-shortform=0 fail, probe-mobile-desk=0 fail, probe-mobile-dashboard=0 fail (51 assertions), probe-mobile-editor=0 fail, probe-mobile-scrapbook=0 fail. Smoke at 14/14 probes passing.)*
- [x] **Step 2.3.6:** Update `smoke-er-viewport-regressions.mjs` to walk all v7 surfaces. *(Landed in `a1407e1`: shortform-review surface added; auto-discovers an open shortform workflow via `/dev/editorial-review-shortform`; gracefully skips with a `[skip]` log line if no shortform workflow exists in the project. Strip-height invariant remains entry-review-specific (skipped on shortform per Step 2.2.10 retirement of the entry-review strip on the shortform surface).)*
- [x] **Step 2.3.7:** Commit `test(studio): probes + smoke for v7 architecture (shortform + desk + dashboard + entry-review)`. *(Landed in `a1407e1`.)*

  **Review deferrals (filed 2026-05-13 after `/dw-lifecycle:review` cycle on `a1407e1` + `f2c9cad` + `96e3f00`):**
  - [ ] **Step 2.3-f1:** Retire `DraftWorkflowState` schema vocabulary — the workflow-record `state` field still uses the legacy `'open' | 'in-review' | 'iterating' | 'approved' | 'applied' | 'cancelled'` union retired by `DESKWORK-STATE-MACHINE.md` Commandments III + VI. Surfaced when the Step 2.3 probe fixture had to use `"in-review"` for an active shortform workflow because the schema offers no non-retired vocabulary for that case. Filed as [#266](https://github.com/audiocontrol-org/deskwork/issues/266). The accompanying fixture-pattern question (committed-fixture vs. seed-and-clean) is conceptually folded into this work — when the vocabulary retirement lands, the probe fixture either gets the new vocabulary or is redesigned as seed-and-clean. Deferred from v0.22 because the retirement work touches core schema + handler migrations across longform AND shortform call sites; out of scope for a release-gate task.

### Task 2.4: /dw-lifecycle:review + release v0.22 (v7 architecture shift)

- [x] **Step 2.4.1:** Invoke `/dw-lifecycle:review`. The architecture pass is substantial — likely 3-4 reviewer dispatches in parallel covering: (a) v7 architecture standards + archive (correctness/conventions), (b) renderMasthead + popover (TypeScript/UI), (c) Desk Shortform absorbing (architecture/data-flow), (d) shortform review G.1-G.6 fixes (state-machine compliance). *(Resolved via DISTRIBUTED per-step reviews per the `agent-discipline.md` "Use /dw-lifecycle:review after every implementation step" rule: (a) `aafb0fe`; (b) `b9a1d40`+`aba7162` / `7e03d57`+`83ca3a5`; (c) `ffd8b53`+`00b43dc`; (d) `ce0eb9f`+`bf50ffc`+`ab955f7`. Probes+smoke (Task 2.3) reviewed in `a1407e1`+`f2c9cad`+`96e3f00`. Every feature commit since v0.20.0 carries at least one paired review-fix commit.)*
- [x] **Step 2.4.2:** Apply fixes; commit `fix(studio): apply review findings on v7 architecture + shortform implementation`. *(All per-step review findings already applied across the feature → review-fix commit pairs above. No outstanding backlog. Deferred items with both-track recording: #264 (dead longform body); #265 (controller unit tests); #266 (DraftWorkflowState retirement).)*
- [ ] **Step 2.4.3:** Run `/release` for v0.22.0.
- [ ] **Step 2.4.4:** iPhone walk. Confirm: (a) #244 symptoms gone on both review surfaces; (b) star nav works (← Desk returns from every leaf); (c) ⋮ popover anchored correctly; (d) Desk Shortform section visible + expandable; (e) no strikethrough on any masthead.
- [ ] **Step 2.4.5:** Close issues with `--reason completed`: #244 (TOC drawer), #260 (`reject` verb violation — fixed in G.4), and any G.1-G.6 issues filed during implementation.

**Walk-driven batched remediation (v0.22.1 patch — fixes applied immediately per the apply-now-batch-ship discipline; shipping batched once the iPhone walk surfaces all post-release findings):**

- [x] **Step 2.4-f1 (#268):** Sheet drag-handle on touch — entry-review + shortform sheets' `.er-mobile-sheet-handle` was missing `touch-action: none`; swipe-down scrolled the page instead of dismissing the sheet. Fix: add `touch-action: none` to the shared CSS rule + document the contract on `sheet-controller.ts`'s `handleEl` JSDoc. Landed in `1b2a52d`.
- [x] **Step 2.4-f2 (#269):** Composer-focus on mobile — new-note flow rendered the composer with the sheet body's `scrollTop` preserved from a previous viewing session, hiding the input controls; if Notes was already open when Mark clicked, `openSheet('notes')` toggle-closed it. Fix: add `requestComposerFocus()` to `MobileSheetBarController` (idempotent open + scrollTop reset) and rewire `unstowMarginalia` to use it. `mobile-sheet-bar.ts` reaches 502 lines after; refactor tracked as [#270](https://github.com/audiocontrol-org/deskwork/issues/270). Landed in `3acc404`.
- [x] **Step 2.4-f3 (#200 + #271):** Marginalia anchor persistence — replaced the `indexOf`-once-or-null algorithm with the **complete W3C TextQuoteSelector model**: exact match → prefix/suffix disambiguation (character-boundary scoring, 3-char minimum, tie-rejection) → diff-match-patch fuzzy fallback (Bitap, Match_Threshold 0.4, location-aware). Schema gained optional `anchorPrefix`/`anchorSuffix` fields (~64 chars per side); `rebaseAnchor` signature gained optional `originalStart` to enable the fuzzy path. All three of operator's reported failure modes ("correct anchor", "re-anchored to wrong text", "anchor disappeared though text is present") covered. The Phase 1/Phase 2 split I initially shipped was the wrong call (operator caught it); reversed by landing the fuzzy fallback in the same remediation batch. `diff-match-patch` added as a runtime dep on `@deskwork/studio`. Landed in `9ecc75a` (exact + prefix/suffix) + `bca51ba` (fuzzy fallback).

### Task 2.5: Cross-cutting accessibility cleanup (lower priority — separable commit)

**Surfaced during Task 2.2's desk-states a11y audit (2026-05-12). Items that affect MULTIPLE surfaces and are best handled in a single pass rather than per-surface. Can ship as part of v0.22 OR be deferred to a v0.22.1 patch — operator pick.**

**Files:**
- Modify: `plugins/deskwork-studio/public/css/editorial-review.css` (dashed `--paper-3` hairlines → `--kraft` dashed)
- Modify: `plugins/deskwork-studio/public/css/editorial-studio.css` (compose-chip + dashboard row min-height)
- Modify: `packages/studio/src/pages/dashboard.ts` (stage tile min-height 42 → 44px)
- Modify: cross-bar mockup files (v6 + v7) to apply same `--ink-soft` substitution for body-text-class `--faded` usage

- [ ] **Step 2.5.1:** Bump dashed `--paper-3` hairline dividers to `--kraft` dashed (4.08:1 vs paper) across all surfaces. Affects `.er-row`, `.dx-stage-tile`, `.desk-row`, and any other dashed-divider rule. The paper-3 hairlines fail the 3:1 ornamental floor; switching to kraft fixes them uniformly. Commit: `style(studio): bump dashed hairlines to --kraft (a11y 3:1 floor)`.
- [ ] **Step 2.5.2:** Bump stage tile min-height from 42px to 44px (WCAG 2.5.5 tap target). Bump Compose chip min-height from ~38px to 44px (same criterion). These are v0.19 inheritances. Commit: `style(studio): tap targets ≥44px for stage tiles + compose chip`.
- [ ] **Step 2.5.3:** Sweep cross-bar mockups (v6 + v7) for `--faded` body-text usage; apply same `--ink-soft` substitution as desk-states-v7. The mockups are reference artifacts, not shipped code — but they should match the standard so future readers don't copy the broken pattern. Commit: `fix(mockup): cross-bar mockups apply --ink-soft body-text substitution`.

### Task 2.6: Capabilities-as-contracts methodology post-mortem (Phase 2 retrospective)

**Why this task exists:** During Phase 2 the operator surfaced the [`CAPABILITIES-AS-CONTRACTS.md`](./references/capabilities-as-contracts.md) essay (verbatim snapshot in `references/`) — a methodology for refactoring evolving GUIs without regression via three artifacts (capability inventory, test-name protocol, atomic-primitive design system) plus a three-track verification pattern and a workplan-as-defensive-contract discipline. The operator's framing: *"by the end of this redesign process, we will have a stronger sense of what the UI capabilities contract should be."* This task captures that reassessment at the end of Phase 2 rather than during, when adoption would have derailed the active work.

**Why the timing matters:** Phase 2 deliberately churned the studio's chrome (v1→v7 cross-bar refinements + desk-states + masthead + ⋮ popover + Desk Shortform-by-platform absorption). Adopting a capability-inventory methodology *during* that churn would have produced an inventory that needed rewriting per refinement pass. Reassessing *after* the chrome has settled and shipped (v0.22 released, the iPhone walk done, the redesign in operator's hands) means the post-mortem has the full data: which artifacts would have caught the HMR reload-storm regression, which would have improved the masthead extraction's verification quality, which would have made the cross-bar mockup arc more navigable.

**Specific phase-2 experience the post-mortem must evaluate:**

- The HMR reload-storm regression I shipped + claimed verified via `curl` (commits `b9a1d40` / `aba7162` claimed verified; commit `e6deafb` fixed the actual cause). Would Track 1 of the essay's three-track verification pattern (orchestrator independently re-runs the load-bearing test gate, including Playwright for UI-touching changes) have prevented this? What would the rule look like inside `/dw-lifecycle:review`?
- The masthead extraction's `--er-faded` body-text contrast failure caught only in the review pass after the commit had landed. Would a capability inventory row `D-MASTHEAD-XX: kicker meta text is readable at WCAG AA` with a test citation have caught this before commit?
- The v1→v7 cross-bar refinement arc (7 refinement passes + a Desk-states elaboration + an a11y audit). Would a capability inventory + test-name protocol have made each refinement step's diff smaller and more reviewable?
- The Phase 2 architecture re-scope (the workplan grew from "Shortform mobile-first" to "v7 cross-cutting architecture"). Would the essay's workplan-as-defensive-contract principles have surfaced this scope expansion earlier?

**Files:**
- Read: [`./references/capabilities-as-contracts.md`](./references/capabilities-as-contracts.md) (snapshot landed 2026-05-12 with Task 2.6 introduction)
- Create: `./capabilities-contracts-postmortem.md` — the post-mortem document

- [ ] **Step 2.6.1:** Re-read the snapshot end-to-end. Cross-reference each of the essay's five artifacts (inventory, test-name protocol, atomic-primitive design system, three-track verification pattern, workplan as defensive contract) against the phase-2 experience. For each artifact: (a) what's already in place in deskwork-studio's current practice (cite specific files), (b) what gap the artifact would close, (c) the specific phase-2 incident that would have been caught or avoided.

- [ ] **Step 2.6.2:** Draft a proposed capability-inventory shape for deskwork-studio. Not a full inventory — a SHAPE: ID-prefix conventions (e.g. `D-DESK-`, `D-MASTHEAD-`, `D-REVIEW-`, `D-SHORTFORM-`); status column values + meanings; columns + their semantics; how it would relate to `DESKWORK-STATE-MACHINE.md` (which already enumerates state-machine verbs/stages — a partial capability artifact) and `DESIGN-STANDARDS.md` (which already enumerates the design vocabulary — another partial artifact). Sketch ~10 representative rows covering the v7 architecture so the operator can see what an actual inventory entry would look like.

- [ ] **Step 2.6.3:** Make adoption decisions per artifact. Per the essay's §10 ("How to Retrofit") and §9 ("When This Methodology Doesn't Apply"), categorize each artifact as:
  - **Adopt now** — bring into Phase 3's workplan + open implementation issues.
  - **Adopt incrementally** — touch-when-you-touch on new work, e.g. test-name protocol on new tests only.
  - **Defer** — record the artifact as a candidate but skip until a later phase triggers it.
  - **Decline** — the artifact's shape doesn't fit deskwork-studio for the reasons captured in §9 of the essay.
  
  Each decision must be backed by ≥1 specific phase-2 reference (incident, file, commit, or rule) that informs it.

- [ ] **Step 2.6.4:** Apply any "Adopt now" findings:
  - If the three-track verification pattern is adopted: edit `/dw-lifecycle:review` SKILL.md to require Track 1 (orchestrator independent test re-run, INCLUDING Playwright for UI-touching changes) before reviewer dispatch.
  - If the test-name protocol is adopted on new tests: add a one-paragraph rule to `.claude/rules/agent-discipline.md` or a new section in `DESIGN-STANDARDS.md`.
  - If an inventory shape is adopted: file a GitHub issue for the initial build-out (probably a Phase 3 task).
  - Each adoption gets a commit; reference Task 2.6 in the commit message.

- [ ] **Step 2.6.5:** Update `agent-discipline.md` with the procedural lessons from phase 2 regardless of which artifacts are adopted:
  - The "curl is not browser verification" lesson (companion to the existing `ui-verification.md` rule — the existing rule was right; the failure was that I didn't apply it).
  - The "shipped a regression then asked operator to walk it" failure mode + how to avoid it.
  - Any other phase-2 incident that produced a durable lesson worth keeping.

**Proven complete when (per the essay's "observable gate" principle):**
- `docs/0.19.0/.../studio-mobile-first/capabilities-contracts-postmortem.md` exists and is operator-reviewed.
- Every artifact in the essay has a row in the post-mortem's summary table with an adoption disposition AND a phase-2 reference.
- Any "Adopt now" decisions have either (a) a corresponding commit on this branch OR (b) a filed GitHub issue with a phase-3-scope label.
- `agent-discipline.md` carries the procedural lessons from phase 2 regardless of adoption decisions.

**Out of scope for Task 2.6 (deferred to a later phase if any artifact is adopted):**
- Building the actual full capability inventory (~30-50 rows for the studio's current surfaces).
- Renaming existing tests to the test-name protocol (touch-when-you-touch is the cheaper path).
- Authoring a per-primitive reference doc derived from `DESIGN-STANDARDS.md`.

**When to run this task:** AFTER Task 2.4 (release v0.22) is complete and the operator has walked the redesign on phone. The post-mortem needs the full Phase 2 experience — including how the release went — to be useful. Task 2.5 (a11y cleanup) and Task 2.6 (post-mortem) can run in either order or in parallel; they're independent.

**Acceptance (revised for v7 scope):**
- `DESIGN-STANDARDS.md` carries `§ Studio navigation model` + `§ Universal bar contract` + `§ Desk information architecture` sections per v7 + desk-states-v7 specs + the 2026-05-13 universal-bar codification.
- ACCEPTED archive entry filed for the picked architecture; REJECTED entries filed for cross-bar 1/3 + cross-bar 2 refinements v1/v2/v3/v5/v6 + the three pre-v7 shortform-bespoke idioms (Shortform-1/2/3).
- `renderMasthead()` + `createMastheadPopover()` shipped as universal chrome; every non-Desk surface carries `← Desk` (leftmost) + `⋮` (rightmost). Both glyphs vertically centered; no border-rule strikethrough.
- `renderMobileBar()` refactored to universal API (zero nav region, 1-6 contextual cells); entry-review longform's bar consumes new API without regression.
- Desk page renders 3 sections: longform pipeline (8 stage tiles) + shortform-by-platform (4 platform tiles, expand inline) + adjacent-tools (2 dimmed placeholders).
- Shortform review surface renders v7 universal chrome — `renderMasthead` + `renderMobileBar` consuming a TOC / Versions / Actions `Cell[]` derived per `§ Universal bar contract`. No bespoke per-surface bar shape. Audit findings G.1-G.6 addressed.
- All prior phases' probes still green; new probes cover Desk Shortform expansion + masthead popover + shortform universal-bar cell composition.
- Shortform walks on phone; #244 closed.
- Release notes name "v7 cross-cutting nav architecture" as the v0.22 architectural shift (not just shortform mobile-first — broader).
- Standards rule update: `.claude/rules/design-standards.md` references the new `§ Studio navigation model` + `§ Universal bar contract` sections as enforceable.

---

## Phase 3 — Standalone scrapbook viewer + Content view → v0.23

**Goal:** Two reading-shaped surfaces get mobile-first treatment. May or may not use the bottom-tab-bar idiom — mockups confirm.

### Task 3.1: Mockup + implement Standalone scrapbook viewer

**Files:**
- Create: `plugins/deskwork-studio/public/mockups/scrapbook-viewer-N-<idiom>.html` (×2-3)
- Modify: `plugins/deskwork-studio/public/mockups/index.html`
- Modify: `packages/studio/src/pages/scrapbook.ts` (or `packages/studio/src/pages/scrapbook/*.ts`)
- Modify: `plugins/deskwork-studio/public/css/scrapbook.css`

- [ ] **Step 3.1.1:** Audit `/dev/scrapbook/<site>/<path>`. Capture the per-kind item rendering (image, PDF, audio, text), the metadata strip, the navigation back to the entry-review surface.
- [ ] **Step 3.1.2:** Invoke `/frontend-design`. Explore: pure typography-and-grid (no tab bar), bottom-tab-bar with Items / Filters / Cancel, hybrid.
- [ ] **Step 3.1.3:** Update mockups index. Commit design.
- [ ] **Step 3.1.4:** Operator picks. **STOP.**
- [ ] **Step 3.1.5:** Implement. Commit feat.

### Task 3.2: Mockup + implement Content view

**Files:**
- Create: `plugins/deskwork-studio/public/mockups/content-view-N-<idiom>.html` (×2-3)
- Modify: `plugins/deskwork-studio/public/mockups/index.html`
- Modify: `packages/studio/src/pages/content.ts` + `packages/studio/src/pages/content-detail.ts`
- Modify: `plugins/deskwork-studio/public/css/content.css`

- [ ] **Step 3.2.1:** Audit `/dev/content/<site>/<path>`. Capture the article rendering, the figure / scrap-row markers, the back-to-collection navigation.
- [ ] **Step 3.2.2:** Invoke `/frontend-design`. Explore similar to Task 3.1.
- [ ] **Step 3.2.3:** Operator picks. **STOP.**
- [ ] **Step 3.2.4:** Implement. Commit feat.

### Task 3.3: Probes + smoke + review

- [ ] **Step 3.3.1:** Write `probe-mobile-scrapbook-viewer.mjs` and `probe-mobile-content-view.mjs`.
- [ ] **Step 3.3.2:** Run + fix until green.
- [ ] **Step 3.3.3:** Update smoke for both surfaces.
- [ ] **Step 3.3.4:** Commit tests.
- [ ] **Step 3.3.5:** `/dw-lifecycle:review` (one combined dispatch covering both surfaces). Apply / defer / push back.
- [ ] **Step 3.3.6:** Release v0.23.0. iPhone walks for both surfaces.

**Acceptance:**
- Standalone scrapbook viewer + Content view walk on phone
- Press-check vocabulary preserved on both
- Probe + smoke green for both
- v0.23.0 shipped + verified on iPhone

---

## Phase 4 — Editorial Help + Studio Index + #242 Cancel residual scope → v0.24

**Goal:** Static doc pages get typography + layout treatment; the Cancel verb's coverage gets audited and completed on the surfaces that didn't get it during Phase 1.

**Cancel scope re-narration (post-2026-05-09 audit, per Step 1.6.6):** The original Phase 4 plan treated Cancel as a future cross-cutting affordance to design and apply uniformly. That framing turned out to be wrong: Cancel ships as a stage-conditional verb on dashboard rows (`packages/studio/src/pages/dashboard/affordances.ts`) and on the entry-review decision strip (`packages/studio/src/pages/entry-review/decision-strip.ts`) in v0.19, integrated during Phase 1 work. That's the correct shape per `DESKWORK-STATE-MACHINE.md` Commandment II ("verbs are universal and stage-gated"). What remains for Phase 4 is the **residual surface audit** — which surfaces still lack a Cancel verb (or equivalent affordance), and which should they have. Phase 4 is no longer about "design a cross-cutting cancel pattern;" it's about "verify Cancel coverage on Help, Index, Standalone scrapbook viewer, Content view, and add it where genuinely missing — but only on surfaces where Cancel is semantically meaningful." Some surfaces (the Help docs) may not need a Cancel verb at all.

### Task 4.1: Mockup + implement Editorial Help / Manual

**Files:**
- Create: `plugins/deskwork-studio/public/mockups/help-N-<idiom>.html` (×2-3)
- Modify: `plugins/deskwork-studio/public/mockups/index.html`
- Modify: `packages/studio/src/pages/help.ts`
- Modify: `plugins/deskwork-studio/public/css/editorial-help.css`

- [ ] **Step 4.1.1:** Audit `/dev/editorial-help`. Capture the section structure + glossary cross-references.
- [ ] **Step 4.1.2:** Invoke `/frontend-design`. Reading-surface treatment: typography + layout + paragraph rhythm. Likely no bottom-tab-bar.
- [ ] **Step 4.1.3:** Operator picks. **STOP.**
- [ ] **Step 4.1.4:** Implement + commit feat.

### Task 4.2: Mockup + implement Studio Index

**Files:**
- Create: `plugins/deskwork-studio/public/mockups/index-page-N-<idiom>.html` (×2-3)
- Modify: `plugins/deskwork-studio/public/mockups/index.html`
- Modify: `packages/studio/src/pages/index.ts`

- [ ] **Step 4.2.1:** Audit `/dev/`. Capture the entry-point affordances.
- [ ] **Step 4.2.2:** Invoke `/frontend-design`. Likely lightweight chrome + clear navigation.
- [ ] **Step 4.2.3:** Operator picks. **STOP.**
- [ ] **Step 4.2.4:** Implement + commit feat.

### Task 4.3: #242 Cancel residual scope audit + completion

**Already shipped (Phase 1):**
- Dashboard rows — stage-conditional `cancel ⊘` button on every active-stage row, copies `/deskwork:cancel <slug>` (`packages/studio/src/pages/dashboard/affordances.ts:89`).
- Entry-review decision strip — Cancel button on the fixed strip alongside Approve / Iterate (`packages/studio/src/pages/entry-review/decision-strip.ts:150`).
- ✕ Done button on entry-review edit mode (v0.18; not technically Cancel but adjacent).

**Files (residual scope):**
- Modify: per-surface client + server modules for any surface where a Cancel verb is genuinely needed and currently absent.

- [ ] **Step 4.3.1:** Walk each remaining surface and decide whether Cancel is semantically meaningful there:
  - **Studio Index (`/dev/`)** — read-only navigation. No Cancel verb needed; close-tab is the cancel.
  - **Editorial Help (`/dev/editorial-help`)** — read-only manual. No Cancel verb needed.
  - **Standalone scrapbook viewer (`/dev/scrapbook/<site>/<path>`)** — entry-aware. The viewer's mutation surface is the per-item add/remove; a Cancel verb at the *entry* level makes sense if/when this viewer surfaces entry chrome. Decide during Phase 3 mockups.
  - **Content view (`/dev/content`)** — read-only browse. No Cancel verb at the surface level; per-entry Cancel happens via the entry-review surface.
  - **Shortform desk** — has its own decision affordances; Cancel applicability is part of Phase 2.
- [ ] **Step 4.3.2:** For surfaces where Cancel IS missing AND IS semantically meaningful (decision: list determined by Step 4.3.1), invoke `/frontend-design` if the affordance shape isn't already settled by the dashboard / entry-review precedents. Otherwise apply the existing pattern directly (button on row chrome / decision strip — not a separate "cross-cutting cancel design").
- [ ] **Step 4.3.3:** Apply the Cancel verb to the surfaces identified in 4.3.1 and 4.3.2; per-surface commits or one rollup.

### Task 4.4: Probes + smoke + review

- [ ] **Step 4.4.1:** Write `probe-mobile-help.mjs`, `probe-mobile-index.mjs`. The originally-planned `probe-mobile-cancel-affordance.mjs` is no longer needed as a single cross-cutting probe — Cancel coverage on dashboard + entry-review is already covered by `probe-mobile-dashboard.mjs` (Phase 1) and `probe-mobile-editor.mjs` (v0.18). Per-surface Cancel coverage on any newly-added Phase 4 surface goes in that surface's own probe.
- [ ] **Step 4.4.2:** Run + fix until green.
- [ ] **Step 4.4.3:** Update smoke.
- [ ] **Step 4.4.4:** Commit tests.
- [ ] **Step 4.4.5:** `/dw-lifecycle:review`.
- [ ] **Step 4.4.6:** Release v0.24.0.
- [ ] **Step 4.4.7:** iPhone walks for Help, Index, and Cancel-on-each-surface.
- [ ] **Step 4.4.8:** Close #242 with verification narrative.

**Acceptance:**
- Help + Index walk on phone with press-check typography
- Every interactive surface where Cancel is semantically meaningful has a phone-visible Cancel verb (dashboard + entry-review already shipped in Phase 1; remaining surfaces audited and addressed per Step 4.3.1)
- Probe + smoke green
- #242 closed against v0.24.0 install — verification narrative covers ALL surfaces with Cancel, not just those added in Phase 4

---

## Out of scope (explicit)

- Server-side architectural changes (no THESIS Consequence violations introduced)
- Calendar / sidecar schema changes
- New skill verbs
- Editor mode changes (already mobile-first per v0.18)
- The post-1.0 maturity stance / release process

## Feature-level acceptance criteria

- All 6 surfaces walk on phone without horizontal scroll
- All interactive surfaces have thumb-reach affordances
- Press-check vocabulary preserved across every surface
- #236, #237, #238, #242, #243, #244 closed, verified on real iPhone post-release
- Each phase has its own `/frontend-design` mockup cycle on record
- Each phase has its own `/dw-lifecycle:review` dispatch + integration narrative
- Each phase has its own dual-viewport regression smoke + interactive probe
- `mobile-shell` shared module shipped in Phase 2 and consumed by all subsequent phases

## Self-review notes (for the implementer)

- **Phase 1 → Phase 2 dependency:** Phase 2 extraction depends on Phase 1 having shipped + been validated on real iPhone. Don't begin extraction until v0.19 is verified.
- **Mockup-pick gates are non-skippable.** Every "STOP for pick" step requires an operator response. Even in auto mode, pause there and surface the mockup URLs.
- **Probe naming:** `probe-mobile-<surface>.mjs` for surface-specific probes; `smoke-er-viewport-regressions.mjs` for the cross-surface invariants smoke.
- **CSS file size discipline:** any single CSS file > 500 lines triggers an extraction (split by surface or token category).
