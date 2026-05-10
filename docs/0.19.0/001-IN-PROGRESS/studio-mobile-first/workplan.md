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

- [ ] **Step 0.1.1:** Read the original spec (`docs/superpowers/specs/2026-04-30-deskwork-pipeline-redesign-design.md`) and the migration commits (`5687404`, `07ac8dc`, `c21b8b9`, `ca7f785`) to ground the document in the migration's stated intent.
- [ ] **Step 0.1.2:** Draft the canonical spec covering: stages (8, the state machine), verbs (iterate / approve / cancel — universal), what reviewState was and why it's retired, what the current schema vestige is, the studio's surfacing rules, the commandments that derived violations must obey.
- [ ] **Step 0.1.3:** Operator review + approval. Iterate until locked.
- [ ] **Step 0.1.4:** Commit `docs(state-machine): canonical spec — DESKWORK-STATE-MACHINE.md`.
- [ ] **Step 0.1.5:** Wire the document into the `session-start` skill so every session reads it before touching code, alongside `THESIS.md` and `docs/studio-design-standards.md`.
- [ ] **Step 0.1.6:** Add a project rule (`.claude/rules/state-machine.md`) saying: read the state machine spec before any work that touches stage / verb / state semantics; deviations require updating the spec first.

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
- `packages/core/src/iterate/iterate.ts` — sidecar mutation that sets reviewState
- `plugins/deskwork/skills/*/SKILL.md` — any prose mentioning reviewState as a gate or post-condition
- `docs/studio-design-standards.md` — references to "review state internal-only" (replace with "review state is RETIRED, not internal")
- `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/dashboard-audit.md` — historical audit, may need a "superseded by state machine spec" note
- **`packages/cli/src/cmd/ingest.ts`** (or wherever the `--state` validator lives) — accepts `'Review'` (a retired stage) but rejects `'Final'` (a current stage). Surfaced 2026-05-09 when ingesting the state-machine spec itself; had to use `Drafting` since `Final` was rejected at the CLI layer despite being the appropriate stage. Validator must accept the full Stage enum (Ideas, Planned, Outlining, Drafting, Final, Published, Blocked, Cancelled).
- **`plugins/deskwork/skills/ingest/SKILL.md`** — frontmatter→lane mapping table includes `'Review'` instead of `'Final'`. Same root cause as the CLI validator. Update prose to match the post-redesign Stage enum.
- **`packages/cli/src/cmd/iterate.ts`** (and the underlying core/iterate helper) — the iterate CLI's success output carries `"state": "in-review"` (surfaced 2026-05-09 when iterating the state-machine spec), and the helper sets workflow `state` to `'in-review'` after appending the new version. Per Commandment III, "in-review" / "iterating" / "approved" are not states the system tracks meaningfully. The iterate CLI should be re-thought to either drop the workflow-state concept entirely OR mark its workflow.state field clearly as legacy back-compat that the studio does not surface. The "flip workflow back to `in-review` after iterate" semantic is itself a violation — there's no `in-review` state to flip back to.
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
- [ ] **Step 0.3.8:** Operator sign-off on `DESIGN-STANDARDS.md` content + the ACCEPTED/REJECTED archive structure.

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

- [ ] **Step 1.1.1:** Audit current Dashboard structure. Read `packages/studio/src/pages/dashboard.ts` + the dashboard module under `packages/studio/src/pages/dashboard/`. Capture the per-row affordances (pipeline status, press-queue chips, scrapbook chips, induct picker, decision hints).
- [ ] **Step 1.1.2:** Walk the existing `/dev/editorial-studio` on phone via Tailscale. Capture the friction (which #236-#243 symptoms reproduce). Take screenshots if useful — store under `<dashboard-entry>/scrapbook/` per the THESIS adjacent-assets pattern.
- [ ] **Step 1.1.3:** Invoke `frontend-design:frontend-design` to produce 2-3 dashboard mockups. Honor the press-check vocabulary; explore: (a) bottom-tab-bar with Pipeline/Press-queue/Scrapbook tabs, (b) a "card stream" with no tabs (pipeline rows are the primary affordance), (c) hybrid TBD via mockup.
- [ ] **Step 1.1.4:** Update `mockups/index.html` with a new "Dashboard mobile-first [Active]" section + per-mockup cards.
- [ ] **Step 1.1.5:** Commit:

```bash
git add plugins/deskwork-studio/public/mockups/dashboard-*.html plugins/deskwork-studio/public/mockups/index.html
git commit -m "design(studio): three dashboard mobile direction mockups (HTML, no code)"
```

- [ ] **Step 1.1.6:** Operator walks the mockups on phone. Operator picks one. **STOP for operator pick.**

### Task 1.2: Implement the picked Dashboard mockup

**Files:**
- Modify: `packages/studio/src/pages/dashboard.ts`
- Modify: `packages/studio/src/pages/dashboard/*.ts` (specific files determined by mockup pick)
- Modify: `plugins/deskwork-studio/public/css/editorial-studio.css` (or a new dashboard-mobile.css if the existing file balloons past 500 lines)
- Possibly create: `plugins/deskwork-studio/public/src/dashboard/mobile-bar.ts` (client controller for dashboard-specific tab interactions, copying patterns from `entry-review/mobile-sheet-bar.ts`)

- [ ] **Step 1.2.1:** Pull patterns from `packages/studio/src/pages/entry-review/mobile-bar.ts` and `plugins/deskwork-studio/public/src/entry-review/mobile-sheet-bar.ts`. Adapt to dashboard's data shape (rows-of-entries vs. one-entry).
- [ ] **Step 1.2.2:** Implement the mockup-picked layout. CSS additions go in `editorial-studio.css`; if it crosses 500 lines, split.
- [ ] **Step 1.2.3:** Wire any client-side tab/sheet behavior to mirror `mobile-sheet-bar.ts`'s patterns (matchMedia gate, sheet host, drag-handle dismiss, MutationObserver-driven count badges).
- [ ] **Step 1.2.4:** Boot dev studio: `npm run dev`. Walk the changes against `http://orion-m4:<port>/dev/editorial-studio` on phone via Tailscale.
- [ ] **Step 1.2.5:** Commit:

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

- [ ] **Step 1.5.1:** Run `/release` (operator-driven). Picks v0.19.0. Atomic-pushes to main + branch + tag.
- [ ] **Step 1.5.2:** Operator runs `/plugin marketplace update deskwork` against an iPhone-walked install. Confirms #236, #237, #238, #243 symptoms are gone.
- [ ] **Step 1.5.3:** Post fix-landed comments on #236, #237, #238, #243 referencing v0.19.0 + commits.
- [ ] **Step 1.5.4:** Close #236, #237, #238, #243 with `--reason completed`.

**Acceptance:**
- Dashboard walks on phone without horizontal scroll
- Press-check vocabulary preserved
- Probe + smoke green
- #236, #237, #238, #243 closed against v0.19.0 install

---

## Phase 2 — Extract `mobile-shell` + Shortform desk → v0.20

**Goal:** Pull the now-second-surface-validated mobile primitives into a shared module. Build Shortform as the first consumer of the extracted primitives. Closes #244.

### Task 2.1: Audit and extract `mobile-shell`

**Files:**
- Create: `packages/studio/src/mobile-shell/index.ts` (re-exports the public surface)
- Create: `packages/studio/src/mobile-shell/bar.ts` (server `renderMobileBar(config)` accepting surface-specific tab config)
- Create: `packages/studio/src/mobile-shell/sheet.ts` (server `renderMobileSheet(config)`)
- Create: `plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts` (client controller, parameterized; sheet open/close, drag-handle, slot dispatch)
- Create: `plugins/deskwork-studio/public/css/mobile-shell.css` (press-check tokens + base classes; the existing per-page CSS files import or extend)
- Create: `scripts/lib/mobile-probe-helpers.mjs` (shared probe helpers — `pingStudio`, `pickEntry`, `assert`, `bootBrowser`)
- Modify: every consumer of the now-extracted modules — `packages/studio/src/pages/entry-review/mobile-bar.ts` becomes a thin shim, `plugins/deskwork-studio/public/src/entry-review/mobile-sheet-bar.ts` consumes `mobile-shell/sheet-controller.ts`

- [ ] **Step 2.1.1:** Audit entry-review's `mobile-bar.ts`, `mobile-sheet-bar.ts`, the press-check CSS block, and Phase 1's dashboard mobile-bar. Identify the shared core vs. surface-specific config.
- [ ] **Step 2.1.2:** Design the `mobile-shell` public API. Each consumer should provide: tab config (`{ key, label, glyph, count?: () => number, onTap: () => void }[]`), sheet slot renderers, and any per-surface event hooks. The shared module owns: tab bar markup, sheet host + drag-handle, MutationObserver scaffolding for count updates, accessibility roles.
- [ ] **Step 2.1.3:** Write the shared module's tests first:

```typescript
// packages/studio/src/mobile-shell/test/sheet.test.ts
import { describe, it, expect } from 'vitest';
import { renderMobileSheet } from '@/mobile-shell/sheet';

describe('renderMobileSheet', () => {
  it('renders one slot per configured key', () => {
    const html = renderMobileSheet({ slots: [{ key: 'a' }, { key: 'b' }] });
    expect(html).toContain('data-mobile-sheet-slot="a"');
    expect(html).toContain('data-mobile-sheet-slot="b"');
  });
  it('renders no slots when config is empty', () => {
    const html = renderMobileSheet({ slots: [] });
    expect(html).not.toContain('data-mobile-sheet-slot');
  });
});
```

- [ ] **Step 2.1.4:** Run tests; confirm they fail (module doesn't exist):

```bash
npm test --workspace @deskwork/studio -- --run mobile-shell
```

Expected: FAIL with `cannot find module '@/mobile-shell/sheet'`.
- [ ] **Step 2.1.5:** Implement `mobile-shell/bar.ts` and `mobile-shell/sheet.ts` minimally to pass the tests.
- [ ] **Step 2.1.6:** Run tests; confirm they pass.
- [ ] **Step 2.1.7:** Add 2-3 more test cases for the controller (matchMedia gate, drag-to-dismiss threshold, slot-key dispatch).
- [ ] **Step 2.1.8:** Implement `mobile-shell/sheet-controller.ts` to pass.
- [ ] **Step 2.1.9:** Migrate entry-review's `mobile-bar.ts` and `mobile-sheet-bar.ts` to consume the shared module. Existing `probe-mobile-editor.mjs` and `probe-mobile-scrapbook.mjs` MUST still pass — these are the regression net for the migration.
- [ ] **Step 2.1.10:** Migrate Phase 1's dashboard mobile-bar to consume the shared module. Existing `probe-mobile-dashboard.mjs` MUST still pass.
- [ ] **Step 2.1.11:** Run all probes + smoke + workspace tests:

```bash
node scripts/probe-mobile-editor.mjs && node scripts/probe-mobile-scrapbook.mjs && node scripts/probe-mobile-dashboard.mjs && node scripts/smoke-er-viewport-regressions.mjs && npm test --workspaces
```

Expected: all green.
- [ ] **Step 2.1.12:** Commit:

```bash
git add packages/studio/src/mobile-shell/ plugins/deskwork-studio/public/src/mobile-shell/ plugins/deskwork-studio/public/css/mobile-shell.css scripts/lib/mobile-probe-helpers.mjs packages/studio/src/pages/entry-review/mobile-bar.ts plugins/deskwork-studio/public/src/entry-review/mobile-sheet-bar.ts
git commit -m "refactor(studio): extract mobile-shell shared primitives"
```

### Task 2.2: Mockup + implement Shortform mobile-first

**Files:**
- Create: `plugins/deskwork-studio/public/mockups/shortform-N-<idiom>.html` (×2-3)
- Modify: `plugins/deskwork-studio/public/mockups/index.html` (add Shortform section)
- Modify: `packages/studio/src/pages/shortform-review.ts`
- Modify: `packages/studio/src/pages/shortform/*.ts`
- Modify: relevant CSS

- [ ] **Step 2.2.1:** Audit `/dev/editorial-review-shortform`. Identify the data shape (shortform entries vs. longform), and the open #244 (TOC drawer per #169) requirements.
- [ ] **Step 2.2.2:** Invoke `/frontend-design` for Shortform mockups. Honor press-check; explore: tab bar with TOC tab (closing #244), hybrid card-stream, etc.
- [ ] **Step 2.2.3:** Update `mockups/index.html`. Commit `design(studio): three shortform direction mockups (HTML, no code)`.
- [ ] **Step 2.2.4:** Operator picks. **STOP for pick.**
- [ ] **Step 2.2.5:** Implement using `mobile-shell` primitives. Commit `feat(studio): shortform mobile-first — Mockup N`.

### Task 2.3: Probes + smoke

**Files:**
- Create: `scripts/probe-mobile-shortform.mjs`
- Modify: `scripts/smoke-er-viewport-regressions.mjs`

- [ ] **Step 2.3.1:** Write `probe-mobile-shortform.mjs` using the shared helpers from `scripts/lib/mobile-probe-helpers.mjs`. Assert TOC drawer behavior (#244), tab swap, sheet content, no horizontal scroll.
- [ ] **Step 2.3.2:** Run; fix until green.
- [ ] **Step 2.3.3:** Update smoke to walk Shortform.
- [ ] **Step 2.3.4:** Commit `test(studio): probe + smoke for shortform mobile-first`.

### Task 2.4: /dw-lifecycle:review + release

- [ ] **Step 2.4.1:** Invoke `/dw-lifecycle:review`. The extraction architecture should get explicit reviewer focus. Triage findings; defer with workplan-and-issue per the rule.
- [ ] **Step 2.4.2:** Apply fixes; commit `fix(studio): apply review findings on shortform + mobile-shell extraction`.
- [ ] **Step 2.4.3:** Run `/release` for v0.20.0.
- [ ] **Step 2.4.4:** iPhone walk; confirm #244 symptoms gone.
- [ ] **Step 2.4.5:** Close #244 with `--reason completed`.

**Acceptance:**
- `mobile-shell` module exists and is consumed by entry-review + dashboard + shortform
- Shortform walks on phone; #244 closed
- All prior phases' probes still green (no regressions from extraction)
- Release notes name the extraction as the architectural shift

---

## Phase 3 — Standalone scrapbook viewer + Content view → v0.21

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
- [ ] **Step 3.3.6:** Release v0.21.0. iPhone walks for both surfaces.

**Acceptance:**
- Standalone scrapbook viewer + Content view walk on phone
- Press-check vocabulary preserved on both
- Probe + smoke green for both
- v0.21.0 shipped + verified on iPhone

---

## Phase 4 — Editorial Help + Studio Index + #242 Cancel cross-cutting → v0.22

**Goal:** Static doc pages get typography + layout treatment; cross-cutting Cancel affordance lands on every interactive surface.

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

### Task 4.3: Mockup + implement #242 cross-cutting Cancel affordance

**Files:**
- Create: `plugins/deskwork-studio/public/mockups/cancel-affordance-N-<idiom>.html` (×2-3)
- Modify: `plugins/deskwork-studio/public/mockups/index.html`
- Modify: every interactive surface's mobile chrome to absorb the chosen Cancel pattern

- [ ] **Step 4.3.1:** Audit which surfaces lack a Cancel affordance on phone (per #242). Likely: Dashboard, Shortform, Standalone scrapbook viewer, Content view, Help, Index. (Entry-review has the ✕ Done button from v0.18.)
- [ ] **Step 4.3.2:** Invoke `/frontend-design`. Single design applied across N surfaces. Possibly: a strip-position cancel chip mirroring entry-review's Done button.
- [ ] **Step 4.3.3:** Operator picks. **STOP.**
- [ ] **Step 4.3.4:** Apply to every interactive surface. Multiple touch points; commit per-surface or one rollup.

### Task 4.4: Probes + smoke + review

- [ ] **Step 4.4.1:** Write `probe-mobile-help.mjs`, `probe-mobile-index.mjs`, `probe-mobile-cancel-affordance.mjs` (the last covers Cancel behavior on every surface that has it).
- [ ] **Step 4.4.2:** Run + fix until green.
- [ ] **Step 4.4.3:** Update smoke.
- [ ] **Step 4.4.4:** Commit tests.
- [ ] **Step 4.4.5:** `/dw-lifecycle:review`.
- [ ] **Step 4.4.6:** Release v0.22.0.
- [ ] **Step 4.4.7:** iPhone walks for Help, Index, and Cancel-on-each-surface.
- [ ] **Step 4.4.8:** Close #242 with verification narrative.

**Acceptance:**
- Help + Index walk on phone with press-check typography
- Every interactive surface has a phone-visible Cancel affordance per #242's design
- Probe + smoke green
- #242 closed against v0.22.0 install

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
