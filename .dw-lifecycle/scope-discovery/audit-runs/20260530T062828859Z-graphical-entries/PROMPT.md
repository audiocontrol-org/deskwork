# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Phase 2 of graphical-entries: pipeline template loader + override resolver + 5 preset templates (editorial / visual / feature-doc / qa-plan / blog-post). Introduces PipelineTemplate type + Zod schema with three invariant refinements (linearStages non-empty; lockedStages subset of linearStages; Cancelled reserved if present in offPipelineStages). loadPipelineTemplate(id, projectRoot) checks .deskwork/pipelines/<id>.json first then falls back to plugin defaults at packages/core/src/pipelines/. listAvailablePipelineTemplates returns the union, deduplicated. Foundational layer for all downstream phases (3-7) which read stages through templates rather than hardcoded literals. Acceptance criteria: each preset is loadable via loadPipelineTemplate; project overrides take precedence over plugin defaults; all five preset JSON files carry rationale fields. Audit focus: schema invariants, override-resolver edge cases, preset correctness, type-safety, no silent fallbacks.

## Commit subjects in the audited range

b40e656 feat(graphical-entries): Phase 2 — pipeline template loader + 5 preset templates


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

takes a `LaneBucket` shape that's bound to the dashboard's lane
machinery + focus state, which doesn't apply to the scoped
group-member-set view). Instead, `members-section.ts` rebuilds the
swim CHROME — `.er-members-swim` (header), `.er-members-stage`
(per-stage row), `.er-members-card` (per-member card) — using the
same press-check tokens and the same `stageGlyph()` lookup so the
visual signature matches Phase 5 without coupling the entry-review
surface to dashboard internals. The compositor walks the same
`template.linearStages` + `template.offPipelineStages` sequence the
dashboard swim does, so empty stages render with the same
`is-empty` modifier the dashboard convention names.

**Pull-tab affordance class** — `.er-row-member-tab` mirrors the
`.er-outline-tab` / `.er-marginalia-tab` shape per the
`.claude/rules/affordance-placement.md` § "Reference patterns in
this codebase" mandate. Vertical text via `writing-mode:
vertical-rl`, left-edge anchored, kraft accent color so it reads
distinct from stage (red-pencil) or action (proof-blue). The
expanded state inverts the colors (kraft fill, paper text) — same
inversion pattern the marginalia-tab uses on activation.

**Structural decisions made along the way**

1. `members` query param on the entry-review route — added to
   `EntryReviewQuery` and routed through `server.ts`'s
   `c.req.query('members')`. Default = composed per the picked
   direction; client controller flips + persists per-group via
   localStorage.
2. Missing-member rows — render as `.er-member-row--missing`
   instead of silently dropping. The doctor `group-member-missing`
   rule (Task 7.5.2) is the loud signal; the surface mirrors the
   same finding inline so operators see the broken reference
   without leaving the page.
3. Lane-stack (mobile) NOT wired with the pull-tab in this commit —
   the mobile lane-stack uses the list-body chrome, not the kanban
   `.er-row-shell`, so a sibling rendering pass against the list-body
   chrome is required. Track 2's spec-compliance review flagged this
   as HIGH because the picked Direction 1 mockup is mobile-first.
   Tracked as Step 7.3.5 in the workplan + GitHub issue #371; the
   feature is NOT closeout-ready until that step lands. Per the
   project's discipline rule, deferrals get both workplan + issue
   recording — see Track 2 review actions for the resolution path.
4. `loadLaneConfig` failures during member loading swallow rather
   than crash — a member with a stale lane id surfaces in the
   composed view as "unrouted" (rendered with the raw lane id) and
   in the list view's per-row meta. The list-mode test does NOT
   exercise this branch; the empty-members fallback test exercises
   the no-lane-resolution path indirectly through the bare-id
   default lane setup.
5. The composed view's `data-template-id` attribute drives the
   lane-accent color via CSS — no per-lane `class="lane-<id>"`
   coupling for non-default templates. This avoids the "we forgot
   to teach the CSS about lane X" failure mode the dashboard hit
   in pre-Task-5.2 days.

Workplan deltas + closing — Task 7.3.1, 7.3.2, 7.3.3, 7.3.4 ticked;
Task 7.4.1, 7.4.2, 7.4.3 ticked. Phase 7's remaining tasks (7.5
doctor rules + 7.6 studio group-management page + 7.7 iterate
semantics on groups + 7.8 integration tests) are explicitly out of
scope for this dispatch and remain open. Phase 7 parent issue (#306)
stays open until those tasks land. No GitHub `Closes` keyword on
the commit.

`Status` backfilled to `fixed-b642cd6` in the immediately-following
docs commit per the established two-commit pattern. (Note: the
backfill commit `3d670f5` originally wrote a markdown table format
that did NOT match the canonical `Status: fixed-<sha>` grep contract
— that's been corrected at the AUDIT-29 header above as part of the
Track 2 review actions; see AUDIT-30 below.)

### AUDIT-20260529-30 — review-action: cancelled `unsafe(laneClass)` HTML-injection risk in renderListRow

Finding-ID: AUDIT-20260529-30
Status:     fixed-cc45787
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:217-228`

`renderListRow` wrapped the lane-class composition in `unsafe(...)`,
bypassing the html-template's escaping. `member.lane` is Zod-typed as
`z.string().min(1)` (`packages/core/src/schema/entry.ts:172`) — NOT
regex-bound to the canonical lane-id charset. A malformed sidecar
with `lane: 'x" onclick="alert(1)'` would have broken out of the
class attribute when rendered.

Resolution: import `LANE_ID_REGEX` from `@deskwork/core/lanes` and
validate the lane id before composing the class. If it fails the
regex, fall back to `lane-unrouted` (same shape the loader uses for
genuinely-missing lane configs). The `unsafe(...)` wrapper is now
safe because the input is regex-validated against the canonical
charset.

Track 3 finding #1 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-31 — review-action: pull-tab width 22px failed WCAG 2.5.8 (24x24 minimum)

Finding-ID: AUDIT-20260529-31
Status:     fixed-cc45787
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:250`

`.er-row-member-tab` was 22px wide. WCAG 2.2 SC 2.5.8 (Target Size
Minimum, AA) requires 24x24 CSS pixels. The horizontal axis failed
by 2px. The spacing exception did not apply because the row
foreground is the immediate right neighbor at 4px clearance, well
under 24px.

Resolution: widened the tab from 22px to 24px; adjusted
`.er-row-shell.has-member-tab .er-row-fg`'s `padding-left` from 26px
to 28px to preserve the row's content layout. Both axes now meet
the WCAG floor.

Track 3 finding #2 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-32 — review-action: kraft-on-paper-2 text contrast 3.58:1 failed WCAG 1.4.3 AA

Finding-ID: AUDIT-20260529-32
Status:     fixed-cc45787
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:275-304`

`.er-row-member-tab-label` and `.er-row-member-tab-count` text used
`var(--er-kraft)` (#8A7250) on `var(--er-paper-2)` (#ECE6D4),
computed contrast ratio approx 3.58:1. The label is 0.5625rem (~9px)
small text. WCAG 2.1 SC 1.4.3 AA requires 4.5:1 for small text; the
text failed by ~0.92.

Resolution: changed the resting-state label color to
`var(--er-ink-soft)` (#3A3530) on `var(--er-paper-2)` = 9.79:1; the
count badge text to `var(--er-ink)` (#1A1614) on `var(--er-paper)` =
14.91:1. Increased label font-size from 0.5625rem to 0.625rem
(~10px) and weight from 600 to 700. The kraft accent is preserved
through the count badge's border + the expanded-state background
flip, so the affordance still reads as a kraft "belonging-to"
affordance overall. Expanded-state contrast (paper on kraft, ~3.84:1)
left as-is because the expanded state is transient and the primary
information delivered is in the popover content, not the tab label
which the operator only sees while engaging the tap.

Track 3 finding #3 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-33 — review-action: AUDIT-29 used non-canonical Status format (broke queue-check grep)

Finding-ID: AUDIT-20260529-33
Status:     fixed-cc45787
Severity:   low
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:2728-2732`

The AUDIT-29 entry as originally written (b642cd6) used a markdown
table format `| fixed (b642cd6) |` for the Status field. Every
prior audit entry follows the canonical `Status:     fixed-<sha>`
field-format documented in the file's header and grep-anchored by
the canonical queue check `grep -nE "^Status:[[:space:]]+fixed-"`.
The non-canonical entry would NOT have surfaced in the standard
triage queue.

Resolution: rewrote the AUDIT-29 header block to use the canonical
`Finding-ID / Status / Severity / Surface` field-format. The
queue-check grep contract is preserved.

Track 2 finding #2 from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-34 — review-action-deferred: mobile lane-stack missing pull-tab (Track 2 HIGH; deferred to #371)

Finding-ID: AUDIT-20260529-34
Status:     acknowledged-2026-05-29-issue-#371
Severity:   high
Surface:    `packages/studio/src/pages/dashboard/swimlane-shell.ts:258-271`, `packages/studio/src/pages/dashboard/lane-stack-card.ts`, `packages/studio/src/pages/dashboard/swimlane-list-body.ts`

Track 2's spec-compliance review of b642cd6 flagged HIGH: the
implementation wires the kraft pull-tab into the desktop kanban
swim path only. The mobile lane-stack rendering (the primary
viewport per the brief's "mobile-first" stance and the picked
Direction 1 mockup) does NOT render the affordance. A mobile
operator cannot discover that an entry belongs to a group.

The implementer's audit-log narrative framed this as a "future
operator need" — exactly the "Just for now is bullshit" pattern
the discipline rule names. Resolution: filed
[#371](https://github.com/audiocontrol-org/deskwork/issues/371)
with the deferral rationale + scoped Step 7.3.5 into the workplan
per the discipline rule's two-track recording requirement. The
audit-log narrative for AUDIT-29 has been amended to surface the
deferral path.

Phase 7 closeout is BLOCKED on Step 7.3.5 landing (mobile lane-stack
+ desktop list-mode-body pull-tab parity). Track 2 finding #1 + #5
from the per-commit review of b642cd6 + 3d670f5.

### AUDIT-20260529-35 — review-action-deferred: composed view silently drops unrouted members (Track 3 #4; deferred)

Finding-ID: AUDIT-20260529-35
Status:     acknowledged-2026-05-29-issue-#372
Severity:   low
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:99-119`

`bucketMembersByLane` skips members whose `lane === undefined` AND
members whose `lane` is not in `laneConfigsById`. In list view they
still render (with `lane-unrouted` styling); in composed view they
vanish with no visible count discrepancy on the toggle. The operator
cannot tell composed view shows fewer entries unless they cross-check
totals. Tracked at
[#372](https://github.com/audiocontrol-org/deskwork/issues/372)
with the recommended unrouted-indicator design.

### AUDIT-20260529-36 — popover renders visible at rest on every member row (cascade order defeats `hidden`)

Finding-ID: AUDIT-20260529-36 (cross-model: AUDIT-BARRAGE-claude-01)
Status:     fixed-ffce4ba
Severity:   high
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:347-354`, `packages/studio/src/pages/dashboard/section.ts:50` (`renderMemberPopover`)

`renderMemberPopover` emits `<div class="er-row-member-popover" data-row-member-popover hidden>`, and the client controller toggles visibility via `popover.hidden = !expanded` (`row-member-tab.ts` `setRowExpanded`). The intended design is collapsed-at-rest, expanded-on-tap. But the CSS rule `.er-row-member-popover { display: block; ... }` (same specificity 0,1,0 as `[hidden] { display: none }`, declared later by origin) WINS. The `hidden` attribute is inert; every member row's popover paints at all times.

The integration test (`dashboard-member-row-badge.test.ts`) only asserts `toContain('er-row-member-popover')` against the rendered HTML string — it never checks computed visibility. The test suite is green while the surface is functionally broken.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: drive visibility from the row-shell state class (e.g. `.er-row-shell:not(.is-member-expanded) .er-row-member-popover { display: none }` + `.er-row-shell.is-member-expanded .er-row-member-popover { display: block }`), AND extend the test to assert computed visibility via DOM (not string-contains) before declaring fixed. Per `.claude/rules/ui-verification.md`, the fix needs a live Playwright check before closing.

### AUDIT-20260529-37 — composed view has silent-drop vectors beyond AUDIT-35 (stage-not-in-template + partial-load lane configs)

Finding-ID: AUDIT-20260529-37 (cross-model: AUDIT-BARRAGE-claude-02)
Status:     fixed-fafc0e2
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:99-150` (`bucketMembersByLane`), `packages/studio/src/pages/entry-review/data.ts:188-210` (`loadGroupMembersBundle`)

AUDIT-35 acknowledged composed view silently drops members with `lane === undefined` or a lane absent from `laneConfigsById`. Two additional silent-drop vectors are NOT covered:

1. In `bucketMembersByLane`, a member is bucketed under `stageMap.get(member.currentStage)`, but the emitted `byStage` only walks `template.linearStages + template.offPipelineStages`. Any member whose `currentStage` is not in its lane's template (a legacy stage, or a custom-template omission) is pushed into `stageMap` but never read back — it vanishes from composed view AND from `memberCount`, so the swim-head count is wrong with no "missing" indicator. The same member renders fine in list view, producing an invisible composed↔list discrepancy distinct from AUDIT-35.

2. In `loadGroupMembersBundle`, the load order is `laneConfigsById.set(strict.id, strict)` BEFORE `loadPipelineTemplate(...)`. If the template load throws, the `catch { continue }` fires — but the lane config is already in `laneConfigsById` while its template is absent from `templatesById`. Back in `bucketMembersByLane`, members of that lane pass the `laneConfigsById.has(member.lane)` guard, get bucketed, then hit `const template = templatesById.get(...); if (template === undefined) continue;` — dropping EVERY member of that lane from composed view, silently, and invisible in list view.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: (a) only `laneConfigsById.set` after the template successfully resolves (move the set inside the try, below the template load); (b) in `bucketMembersByLane`, emit an "unbucketed members" tail (mirroring list view's unrouted styling) so stage/template mismatches surface rather than disappear.

### AUDIT-20260529-38 — member card + list-row lane-accent CSS keys on `data-template-id` attribute the markup never emits

Finding-ID: AUDIT-20260529-38 (cross-model: AUDIT-BARRAGE-claude-03)
Status:     fixed-5234182
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/entry-review-members.css:262-265,318-321`, `packages/studio/src/pages/entry-review/members-section.ts:152-167` (`renderMemberStageCard`), `:200-235` (`renderListRow`)

AUDIT-29 structural-decision #5 claimed: "The composed view's `data-template-id` attribute drives the lane-accent color via CSS — no per-lane `class="lane-<id>"` coupling for non-default templates. This avoids the 'we forgot to teach the CSS about lane X' failure mode."

The claim holds only for the swim HEAD (`.er-members-swim` carries `data-template-id`, and CSS at entry-review-members.css:218-241 keys on it). It is FALSE for the cards and list rows. `renderMemberStageCard` emits `<a class="er-members-card lane-${member.lane ?? 'default'}">` with NO `data-template-id`, and `renderListRow` emits `<li class="er-member-row lane-<id>">` likewise with no `data-template-id`. Yet the CSS includes `.er-members-card[data-template-id="editorial"]` (line 263) and `.er-member-row[data-template-id="editorial"]` (line 319) — dead selectors that NEVER match.

Functional consequence: a lane using the `editorial` template but whose id is NOT the literal `default` (e.g. an `essays` or `articles` lane) gets a proof-blue swim head but FADED cards and list rows, because the only card/row accent rules that fire are the hardcoded `.lane-default` / `.lane-mockups` literals. The accent is inconsistent within a single swim block, and the exact "forgot to teach CSS about lane X" failure mode #5 said it avoided is reintroduced one level down.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: emit `data-template-id="${bucket.template.id}"` on the card `<a>` and the list `<li>` (the data is already in scope via the bucket/template), so the template-keyed accent rules actually drive the color; the literal `.lane-<id>` rules can be retired.

### AUDIT-20260529-39 — corrupt member sidecars misreported as missing (silent fallback violation)

Finding-ID: AUDIT-20260529-39 (cross-model: AUDIT-BARRAGE-codex-01)
Status:     fixed-d7f1ea7
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183` (`loadGroupMembersBundle`)

`loadGroupMembersBundle` catches every `readSidecar` failure and records the UUID as missing. That conflates a genuinely absent sidecar with schema parse failures, permission errors, malformed JSON, or other storage bugs. The result is an inline "missing" row instead of an explicit render/load failure, which violates the project's "no silent fallbacks" discipline (`.claude/CLAUDE.md` § "Error Handling") and can hide data corruption from the operator.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (codex). Fix path: distinguish not-found errors from other `readSidecar` failures. Only absent sidecars should enter `missingMemberUuids`; validation, parse, and I/O failures should propagate with an actionable message (either throwing or surfacing as a distinct "corrupt" row class so the operator can distinguish the two states).

### AUDIT-20260529-40 — missing-member rows lose declared insertion order (list-mode contract violation)

Finding-ID: AUDIT-20260529-40 (cross-model: AUDIT-BARRAGE-codex-02)
Status:     fixed-b01eb21
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183`, `packages/studio/src/pages/entry-review/members-section.ts:263-271` (`renderListBody`)

The loader splits resolved members and missing UUIDs into separate arrays; `renderListBody` renders all resolved rows BEFORE all missing rows. A group declared as `[missing-a, real-b, missing-c]` displays as `[real-b, missing-a, missing-c]`, even though the brief's acceptance criterion says list mode preserves `group.members[]` insertion order.

This matters because the group membership list is operator-authored ordering — the operator's expectation is that members render in the order they added them, regardless of resolution state.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (codex). Fix path: introduce an ordered member-item structure that carries either `{kind: "resolved", entry}` or `{kind: "missing", uuid}` per original UUID position; `renderListBody` walks that sequence directly so insertion order is preserved end-to-end.

### AUDIT-20260529-41 — popover left margin (22px) misaligned with WCAG-widened tab (24px) — off-by-2px drift

Finding-ID: AUDIT-20260529-41 (cross-model: AUDIT-BARRAGE-claude-04)
Status:     fixed-2274781
Severity:   low
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:349` (`.er-row-member-popover { margin: 0 0 0 22px }`) vs `:250` (`.er-row-member-tab { width: 24px }`) and `:320` (`.has-member-tab .er-row-fg { padding-left: 28px }`)

AUDIT-31 widened `.er-row-member-tab` from 22px to 24px and bumped `.er-row-shell.has-member-tab .er-row-fg` padding-left from 26px to 28px to keep the foreground clear of the tab. The popover's left offset was NOT updated in lockstep: `.er-row-member-popover` still has `margin: 0 0 0 22px`. The popover now starts 2px inside the 24px tab column rather than flush with the row foreground, producing a small but visible left-edge misalignment.

The cross-rule drift the WCAG-fix commit introduced by touching the tab width without sweeping the dependent offsets. The 22/24/28 magic numbers should be derived from a single `--er-member-tab-width` token to prevent this class of regression.

Note: somewhat MOOT until AUDIT-20260529-36 is fixed, since the popover currently renders unconditionally — the misalignment is hidden behind the always-visible popover bug.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: align popover left margin with the tab column (24px) or the foreground inset (28px), and extract `--er-member-tab-width` as a token.

### AUDIT-20260529-42 — `initGroupMembersSection` wire helpers re-attach listeners on every call (docstring lies)

Finding-ID: AUDIT-20260529-42 (cross-model: AUDIT-BARRAGE-claude-05)
Status:     fixed-90be5c3
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts:104-150` (`initGroupMembersSection`, `wireToggle`, `wireEmptyStateCta`, `wireMemberRowCopy`)

The `initGroupMembersSection` docblock states "Idempotent — calling twice has no visible effect." That is true for `applyMode` (it reads current state) but NOT for the three `wire*` helpers: `wireToggle`, `wireEmptyStateCta`, and `wireMemberRowCopy` each call `addEventListener` unconditionally on every invocation. There is no module-level `wired` guard analogous to the one in the sibling `row-member-tab.ts` (which correctly guards with `let wired = false`).

If `initPressCheckSurface` ever runs twice (re-init after a partial DOM swap, or a future refresh path), the section accumulates duplicate listeners — clicking a member row would fire `copyOrShowFallback` twice (two clipboard writes + two toasts), and the toggle would double-write localStorage.

LOW severity because the current single call site doesn't trigger it, but the docstring asserts a property the code doesn't have.

Surfaced by audit-barrage run `20260530T035850827Z-graphical-entries` (claude). Fix path: mirror the `row-member-tab.ts` pattern with a module-level `wired = false` guard, OR bind via a `dataset` sentinel on the section element so re-init is a genuine no-op.

## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index 7c5cedd..2400e59 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -74,32 +74,32 @@ date: 2026-05-25
 
 ### Task 2.1: PipelineTemplate type + JSON schema
 
-- [ ] Step 2.1.1: Author the `PipelineTemplate` type at `packages/core/src/pipelines/types.ts` matching the PRD's interface (id, name, description, linearStages, lockedStages?, offPipelineStages).
-- [ ] Step 2.1.2: Author a Zod schema for `PipelineTemplate` at the same location; export schema + inferred type.
-- [ ] Step 2.1.3: Invariant tests: linearStages must be non-empty; lockedStages must be a subset of linearStages; `Cancelled` is reserved if present in offPipelineStages.
+- [x] Step 2.1.1: Author the `PipelineTemplate` type at `packages/core/src/pipelines/types.ts` matching the PRD's interface (id, name, description, linearStages, lockedStages?, offPipelineStages).
+- [x] Step 2.1.2: Author a Zod schema for `PipelineTemplate` at the same location; export schema + inferred type.
+- [x] Step 2.1.3: Invariant tests: linearStages must be non-empty; lockedStages must be a subset of linearStages; `Cancelled` is reserved if present in offPipelineStages.
 
 ### Task 2.2: Override resolver extension
 
-- [ ] Step 2.2.1: Locate the existing override-resolver infrastructure at `packages/core/src/overrides.ts` (THESIS Consequence 3 machinery).
-- [ ] Step 2.2.2: Add a `loadPipelineTemplate(id: string, projectRoot: string)` function that checks `<projectRoot>/.deskwork/pipelines/<id>.json` first, falls back to `packages/core/src/pipelines/<id>.json`.
-- [ ] Step 2.2.3: Add a `listAvailablePipelineTemplates(projectRoot: string)` function that returns every template found in project overrides + plugin defaults, de-duplicated by id.
-- [ ] Step 2.2.4: Unit tests covering override-takes-precedence + plugin-default-fallback + listing-deduplication.
+- [x] Step 2.2.1: Locate the existing override-resolver infrastructure at `packages/core/src/overrides.ts` (THESIS Consequence 3 machinery).
+- [x] Step 2.2.2: Add a `loadPipelineTemplate(id: string, projectRoot: string)` function that checks `<projectRoot>/.deskwork/pipelines/<id>.json` first, falls back to `packages/core/src/pipelines/<id>.json`.
+- [x] Step 2.2.3: Add a `listAvailablePipelineTemplates(projectRoot: string)` function that returns every template found in project overrides + plugin defaults, de-duplicated by id.
+- [x] Step 2.2.4: Unit tests covering override-takes-precedence + plugin-default-fallback + listing-deduplication.
 
 ### Task 2.3: Ship five preset templates
 
-- [ ] Step 2.3.1: Author `packages/core/src/pipelines/editorial.json` matching the legacy single-pipeline stage names exactly: linearStages `["Ideas","Planned","Outlining","Drafting","Final","Published"]`, lockedStages `["Final"]`, offPipelineStages `["Blocked","Cancelled"]`. Include a header comment block documenting the lifecycle rationale.
-- [ ] Step 2.3.2: Author `packages/core/src/pipelines/visual.json` (Sketched / Iterating / Approved / Shipped; locked: Approved; off: Blocked / Cancelled / Archived) with rationale.
-- [ ] Step 2.3.3: Author `packages/core/src/pipelines/feature-doc.json` (Defined / Drafting / Approved / Implemented / Complete; locked: Approved / Implemented; off: Blocked / Cancelled) with rationale.
-- [ ] Step 2.3.4: Author `packages/core/src/pipelines/qa-plan.json` (Drafted / Reviewed / Tested / Approved; locked: Reviewed; off: Blocked / Cancelled / Archived) with rationale.
-- [ ] Step 2.3.5: Author `packages/core/src/pipelines/blog-post.json` (Idea / Drafting / Edited / Published; locked: Edited; off: Blocked / Cancelled) with rationale.
-- [ ] Step 2.3.6: Validate each preset against the Zod schema in a unit test; assert all five load cleanly via the resolver.
+- [x] Step 2.3.1: Author `packages/core/src/pipelines/editorial.json` matching the legacy single-pipeline stage names exactly: linearStages `["Ideas","Planned","Outlining","Drafting","Final","Published"]`, lockedStages `["Final"]`, offPipelineStages `["Blocked","Cancelled"]`. Include a header comment block documenting the lifecycle rationale.
+- [x] Step 2.3.2: Author `packages/core/src/pipelines/visual.json` (Sketched / Iterating / Approved / Shipped; locked: Approved; off: Blocked / Cancelled / Archived) with rationale.
+- [x] Step 2.3.3: Author `packages/core/src/pipelines/feature-doc.json` (Defined / Drafting / Approved / Implemented / Complete; locked: Approved / Implemented; off: Blocked / Cancelled) with rationale.
+- [x] Step 2.3.4: Author `packages/core/src/pipelines/qa-plan.json` (Drafted / Reviewed / Tested / Approved; locked: Reviewed; off: Blocked / Cancelled / Archived) with rationale.
+- [x] Step 2.3.5: Author `packages/core/src/pipelines/blog-post.json` (Idea / Drafting / Edited / Published; locked: Edited; off: Blocked / Cancelled) with rationale.
+- [x] Step 2.3.6: Validate each preset against the Zod schema in a unit test; assert all five load cleanly via the resolver.
 
 **Acceptance Criteria:**
 
-- [ ] Each preset is loadable via `loadPipelineTemplate(id, anyProjectRoot)` and passes schema validation.
-- [ ] Project overrides at `<root>/.deskwork/pipelines/<id>.json` take precedence over the plugin default.
-- [ ] `listAvailablePipelineTemplates` returns the union of plugin defaults + project overrides with no duplicates.
-- [ ] All five preset JSON files carry header comments documenting their lifecycle rationale (operator-authored custom pipelines have a working exemplar to copy from).
+- [x] Each preset is loadable via `loadPipelineTemplate(id, anyProjectRoot)` and passes schema validation.
+- [x] Project overrides at `<root>/.deskwork/pipelines/<id>.json` take precedence over the plugin default.
+- [x] `listAvailablePipelineTemplates` returns the union of plugin defaults + project overrides with no duplicates.
+- [x] All five preset JSON files carry header comments documenting their lifecycle rationale (operator-authored custom pipelines have a working exemplar to copy from). [Note: JSON lacks `//` comments; rationale is carried as a top-level `"$rationale"` string field, ignored by the Zod schema via `.passthrough()` and documented in `loader.ts` JSDoc.]
 
 ## Phase 3: Lane data model + config loader + entry schema delta  ·  [#304](https://github.com/audiocontrol-org/deskwork/issues/304)
 
diff --git a/packages/core/package.json b/packages/core/package.json
index 602b6dc..cdc2aed 100644
--- a/packages/core/package.json
+++ b/packages/core/package.json
@@ -149,6 +149,10 @@
       "types": "./dist/paths.d.ts",
       "default": "./dist/paths.js"
     },
+    "./pipelines": {
+      "types": "./dist/pipelines/index.d.ts",
+      "default": "./dist/pipelines/index.js"
+    },
     "./rename-slug": {
       "types": "./dist/rename-slug.d.ts",
       "default": "./dist/rename-slug.js"
@@ -207,8 +211,8 @@
     }
   },
   "scripts": {
-    "build": "tsc -b tsconfig.build.json && cp src/*.mjs dist/ && mkdir -p dist/doctor/rules && cp src/doctor/rules/*.ts dist/doctor/rules/",
-    "prepack": "tsc -b tsconfig.build.json && cp src/*.mjs dist/ && mkdir -p dist/doctor/rules && cp src/doctor/rules/*.ts dist/doctor/rules/",
+    "build": "tsc -b tsconfig.build.json && cp src/*.mjs dist/ && mkdir -p dist/doctor/rules && cp src/doctor/rules/*.ts dist/doctor/rules/ && mkdir -p dist/pipelines && cp src/pipelines/*.json dist/pipelines/",
+    "prepack": "tsc -b tsconfig.build.json && cp src/*.mjs dist/ && mkdir -p dist/doctor/rules && cp src/doctor/rules/*.ts dist/doctor/rules/ && mkdir -p dist/pipelines && cp src/pipelines/*.json dist/pipelines/",
     "dev": "npm run build && tsc -b tsconfig.build.json --watch",
     "test": "vitest run",
     "test:watch": "vitest",
diff --git a/packages/core/src/index.ts b/packages/core/src/index.ts
index 29a1123..80bac3d 100644
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -25,3 +25,4 @@ export * as contentTree from './content-tree.ts';
 export * from './content-index.ts';
 export * as doctor from './doctor/index.ts';
 export * from './overrides.ts';
+export * as pipelines from './pipelines/index.ts';
diff --git a/packages/core/src/pipelines/blog-post.json b/packages/core/src/pipelines/blog-post.json
new file mode 100644
index 0000000..1c375d4
--- /dev/null
+++ b/packages/core/src/pipelines/blog-post.json
@@ -0,0 +1,9 @@
+{
+  "$rationale": "Blog-post pipeline — a four-stage simplification of the editorial flow for adopters who don't want the explicit Outlining / Planned bookkeeping but still want a content-lock gate before publication. Idea captures the seed; Drafting is the prose pass; Edited is the post-edit lock (copy frozen, awaiting publish); Published is the terminal commit. Edited mirrors the editorial template's Final lock — the iterate verb is refused here so a late inline edit can't sneak past the final review pass. Blocked / Cancelled apply.",
+  "id": "blog-post",
+  "name": "Blog Post",
+  "description": "Simplified four-stage pipeline for blog posts (Idea → Drafting → Edited → Published). Edited locks the copy before publication.",
+  "linearStages": ["Idea", "Drafting", "Edited", "Published"],
+  "lockedStages": ["Edited"],
+  "offPipelineStages": ["Blocked", "Cancelled"]
+}
diff --git a/packages/core/src/pipelines/editorial.json b/packages/core/src/pipelines/editorial.json
new file mode 100644
index 0000000..48bc156
--- /dev/null
+++ b/packages/core/src/pipelines/editorial.json
@@ -0,0 +1,9 @@
+{
+  "$rationale": "Editorial pipeline — the legacy single-pipeline workflow for blog posts, essays, and long-form writing. Stages exactly match the pre-feature `Stage` enum so a pre-graphical-entries project with no operator-authored config maps cleanly into this template (the auto-migration in Phase 4 attaches every existing entry to id=editorial without renaming stages). Ideas captures a raw note; Planned commits to writing it; Outlining is the structural pass; Drafting is the prose pass; Final is the pre-publication review lock (iterate refused, content immutable, awaiting publish verb); Published is the terminal stage with public commit + version assigned. Blocked / Cancelled are the off-pipeline cul-de-sacs.",
+  "id": "editorial",
+  "name": "Editorial",
+  "description": "Long-form writing pipeline (blog posts, essays, manuscripts). Mirrors the pre-graphical-entries single-pipeline lifecycle.",
+  "linearStages": ["Ideas", "Planned", "Outlining", "Drafting", "Final", "Published"],
+  "lockedStages": ["Final"],
+  "offPipelineStages": ["Blocked", "Cancelled"]
+}
diff --git a/packages/core/src/pipelines/feature-doc.json b/packages/core/src/pipelines/feature-doc.json
new file mode 100644
index 0000000..00af862
--- /dev/null
+++ b/packages/core/src/pipelines/feature-doc.json
@@ -0,0 +1,9 @@
+{
+  "$rationale": "Feature-doc pipeline — for engineering feature documentation (PRDs, design specs, ADRs, internal RFCs). Defined captures problem + scope agreed at the operator level; Drafting is the spec author's pass; Approved is the design-locked state (spec finalized, ready for implementation kickoff); Implemented is the doubly-locked state where the spec is committed AND the implementation has shipped (post-merge, post-release); Complete is the terminal stage (artifact retired or archived after its implementation lifecycle is fully closed out). Two locked stages because both Approved and Implemented are review-frozen: Approved freezes the spec text against re-iteration during build; Implemented freezes the post-ship state against drive-by edits. Cancel + Block apply to abandoned or paused work.",
+  "id": "feature-doc",
+  "name": "Feature Documentation",
+  "description": "Engineering feature documentation pipeline (PRDs, design specs, ADRs, internal RFCs). Approved locks the spec for implementation; Implemented locks the post-ship state.",
+  "linearStages": ["Defined", "Drafting", "Approved", "Implemented", "Complete"],
+  "lockedStages": ["Approved", "Implemented"],
+  "offPipelineStages": ["Blocked", "Cancelled"]
+}
diff --git a/packages/core/src/pipelines/index.ts b/packages/core/src/pipelines/index.ts
new file mode 100644
index 0000000..0e19ba9
--- /dev/null
+++ b/packages/core/src/pipelines/index.ts
@@ -0,0 +1,17 @@
+/**
+ * Pipeline templates — barrel export.
+ *
+ * `PipelineTemplate` + `PipelineTemplateSchema` define the per-template
+ * contract; `loadPipelineTemplate` + `listAvailablePipelineTemplates`
+ * resolve preset and override JSON files at runtime.
+ */
+
+export {
+  PipelineTemplateSchema,
+  type PipelineTemplate,
+} from './types.ts';
+
+export {
+  loadPipelineTemplate,
+  listAvailablePipelineTemplates,
+} from './loader.ts';
diff --git a/packages/core/src/pipelines/loader.ts b/packages/core/src/pipelines/loader.ts
new file mode 100644
index 0000000..1fa1648
--- /dev/null
+++ b/packages/core/src/pipelines/loader.ts
@@ -0,0 +1,166 @@
+/**
+ * Pipeline template loader + override-aware enumeration.
+ *
+ * Two functions, both sync:
+ *
+ *   - `loadPipelineTemplate(id, projectRoot)` resolves a template by id.
+ *     Checks `<projectRoot>/.deskwork/pipelines/<id>.json` first, then
+ *     falls back to the plugin's built-in defaults shipped next to this
+ *     file. Throws (never returns null / a fallback shape) when neither
+ *     source exists or when the JSON fails Zod validation.
+ *
+ *   - `listAvailablePipelineTemplates(projectRoot)` enumerates every id
+ *     visible to the operator, deduplicated with override-takes-
+ *     precedence semantics. Suitable for showing the operator a picker;
+ *     callers resolve each id through `loadPipelineTemplate` to get the
+ *     full template.
+ *
+ * Design notes:
+ *
+ *   - Sync I/O matches the override resolver's design (see
+ *     `../overrides.ts`). Templates are read on cold paths (project
+ *     bootstrap, picker enumeration) — no microtask overhead concerns
+ *     justify going async.
+ *
+ *   - No caching. The template is small and the readFile+parse pair is
+ *     cheap; cache invalidation across project-override file edits
+ *     would cost more than the read.
+ *
+ *   - The plugin-default fallback resolves files relative to THIS
+ *     module's location, NOT a project path. At runtime in dist/, the
+ *     JSON files live next to the compiled JS; the build script copies
+ *     `src/pipelines/*.json` into `dist/pipelines/`. The resolver uses
+ *     `import.meta.url` so both source-mode (tsx) and built-mode (node
+ *     dist/) work without configuration.
+ *
+ *   - JSON files may carry a top-level `"$rationale"` string as a
+ *     comments-in-JSON workaround; the schema's `.passthrough()`
+ *     ignores it. Operator-authored override templates can include or
+ *     omit the field freely.
+ */
+
+import { existsSync, readdirSync, readFileSync } from 'node:fs';
+import { dirname, join, basename } from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { PipelineTemplateSchema, type PipelineTemplate } from './types.ts';
+
+/**
+ * Directory shipping the plugin's built-in preset templates. The path
+ * is resolved relative to the compiled module's location (works in
+ * both source-mode and dist-mode without configuration).
+ */
+const PLUGIN_DEFAULTS_DIR = dirname(fileURLToPath(import.meta.url));
+
+/**
+ * Directory inside a project where operator overrides live.
+ */
+function projectOverridesDir(projectRoot: string): string {
+  return join(projectRoot, '.deskwork', 'pipelines');
+}
+
+/**
+ * Read + parse + Zod-validate a single JSON file into a
+ * `PipelineTemplate`. Throws with a descriptive message on every
+ * failure mode (file missing, JSON parse error, schema violation).
+ *
+ * The `expectedId` argument is the basename caller asked for; the
+ * loader verifies the JSON's `id` field matches so a misnamed file
+ * (e.g. `editorial.json` carrying `"id": "visual"`) fails loudly.
+ */
+function readAndValidate(path: string, expectedId: string): PipelineTemplate {
+  if (!existsSync(path)) {
+    throw new Error(`Pipeline template file not found: ${path}`);
+  }
+  const raw = readFileSync(path, 'utf8');
+  let parsed: unknown;
+  try {
+    parsed = JSON.parse(raw);
+  } catch (err) {
+    const detail = err instanceof Error ? err.message : String(err);
+    throw new Error(`Pipeline template at ${path} is not valid JSON: ${detail}`);
+  }
+  const result = PipelineTemplateSchema.safeParse(parsed);
+  if (!result.success) {
+    const issues = result.error.issues
+      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
+      .join('\n');
+    throw new Error(
+      `Pipeline template at ${path} failed Zod validation:\n${issues}`,
+    );
+  }
+  if (result.data.id !== expectedId) {
+    throw new Error(
+      `Pipeline template at ${path} declares id "${result.data.id}" but was loaded as "${expectedId}" — `
+      + `the JSON \`id\` field must equal the filename basename`,
+    );
+  }
+  return result.data;
+}
+
+/**
+ * Load a pipeline template by id. Tries the project override first,
+ * then falls back to the plugin's built-in defaults. Throws when
+ * neither exists OR when the JSON fails Zod validation.
+ *
+ * @param id - The template id (matches the JSON filename basename).
+ * @param projectRoot - Absolute path to the project root.
+ * @throws When both project override and plugin default are missing,
+ *   when the JSON fails to parse, when Zod validation fails, or when
+ *   the JSON's `id` field disagrees with the filename basename.
+ */
+export function loadPipelineTemplate(id: string, projectRoot: string): PipelineTemplate {
+  if (id.length === 0) {
+    throw new Error('loadPipelineTemplate requires a non-empty id');
+  }
+  // Override-takes-precedence: project path wins when present.
+  const overridePath = join(projectOverridesDir(projectRoot), `${id}.json`);
+  if (existsSync(overridePath)) {
+    return readAndValidate(overridePath, id);
+  }
+  const defaultPath = join(PLUGIN_DEFAULTS_DIR, `${id}.json`);
+  if (existsSync(defaultPath)) {
+    return readAndValidate(defaultPath, id);
+  }
+  throw new Error(
+    `Pipeline template "${id}" not found.\n`
+    + `  Searched project override: ${overridePath}\n`
+    + `  Searched plugin default:   ${defaultPath}`,
+  );
+}
+
+/**
+ * Enumerate every `.json` file in a directory and return their
+ * basenames (without the extension). Missing directory is treated as
+ * empty — neither the project nor the plugin defaults directory is
+ * required to exist for enumeration to succeed.
+ */
+function listJsonBasenames(dir: string): string[] {
+  if (!existsSync(dir)) {
+    return [];
+  }
+  return readdirSync(dir)
+    .filter((entry) => entry.endsWith('.json'))
+    .map((entry) => basename(entry, '.json'));
+}
+
+/**
+ * List every available pipeline template id, deduplicated by id with
+ * project overrides taking precedence over plugin defaults. The result
+ * is suitable for showing the operator a picker; resolve each id via
+ * `loadPipelineTemplate` to get the full template.
+ *
+ * The function does NOT validate any template — it just enumerates
+ * what's on disk. A malformed override JSON still appears in the list;
+ * the operator finds out about the malformation at load time.
+ *
+ * @param projectRoot - Absolute path to the project root.
+ */
+export function listAvailablePipelineTemplates(projectRoot: string): string[] {
+  const overrideIds = listJsonBasenames(projectOverridesDir(projectRoot));
+  const defaultIds = listJsonBasenames(PLUGIN_DEFAULTS_DIR);
+  // De-duplicate by id; overrides win, but for enumeration both sources
+  // contribute the same id to the same slot in the de-dup set, so
+  // precedence is moot until the operator calls loadPipelineTemplate.
+  const all = new Set<string>([...overrideIds, ...defaultIds]);
+  return [...all].sort();
+}
diff --git a/packages/core/src/pipelines/qa-plan.json b/packages/core/src/pipelines/qa-plan.json
new file mode 100644
index 0000000..db0c004
--- /dev/null
+++ b/packages/core/src/pipelines/qa-plan.json
@@ -0,0 +1,9 @@
+{
+  "$rationale": "QA-plan pipeline — for test plans and verification artifacts attached to features or releases. Drafted is the initial enumeration of cases; Reviewed is the locked state after peer / lead review (no further edits to the plan body without re-iteration); Tested is the executed state where each case has a recorded outcome; Approved is the terminal stage where the plan is ratified as the record of what was verified. Reviewed is the locked stage because between review and execution the plan must not silently mutate — otherwise the executed-vs-planned audit trail breaks. Archived joins Blocked / Cancelled in the off-pipeline set for retired plans superseded by newer test scopes.",
+  "id": "qa-plan",
+  "name": "QA Plan",
+  "description": "Test plan / verification pipeline (release QA, feature QA, regression batches). Reviewed locks the plan body before execution.",
+  "linearStages": ["Drafted", "Reviewed", "Tested", "Approved"],
+  "lockedStages": ["Reviewed"],
+  "offPipelineStages": ["Blocked", "Cancelled", "Archived"]
+}
diff --git a/packages/core/src/pipelines/types.ts b/packages/core/src/pipelines/types.ts
new file mode 100644
index 0000000..86f4efc
--- /dev/null
+++ b/packages/core/src/pipelines/types.ts
@@ -0,0 +1,135 @@
+/**
+ * Pipeline template — the per-pipeline definition that names the linear
+ * stages, the optional pre-terminal lock stages, and the off-pipeline
+ * cul-de-sacs (Blocked / Cancelled / Archived).
+ *
+ * Plugin-shipped preset templates live alongside this file as JSON.
+ * Operator overrides live at `<projectRoot>/.deskwork/pipelines/<id>.json`
+ * and take precedence — see `./loader.ts`.
+ *
+ * Per the graphical-entries PRD, verbs (iterate / approve / cancel /
+ * induct) are universal across templates and gated only on the entry's
+ * stage position within the template's linear list. The template itself
+ * does NOT carry verb-specific configuration; it carries the stage
+ * vocabulary the universal verb router consults.
+ *
+ * Invariants enforced by the Zod schema below:
+ *
+ *   - `id` is a non-empty string; conventionally lowercase kebab-case
+ *     matching the JSON filename basename (the loader validates that
+ *     match at load time, not the schema).
+ *   - `linearStages` is non-empty. Each entry is a non-empty string.
+ *     Stage-name uniqueness inside the array is required.
+ *   - The LAST element of `linearStages` is the terminal stage with
+ *     published semantics (immutable, version assigned at the publish
+ *     verb). The schema does not name a specific terminal stage — the
+ *     position carries the meaning.
+ *   - `lockedStages`, when present, is a subset of `linearStages` and
+ *     has no duplicate entries. The lock gates iterate; pre-terminal
+ *     review-freeze ("Final"-style) lives here.
+ *   - `offPipelineStages` is a (possibly empty) array of non-empty,
+ *     unique stage names. Stage names in `offPipelineStages` MUST NOT
+ *     overlap with `linearStages` — a stage is either linear OR
+ *     off-pipeline, never both.
+ *   - `Cancelled` is the reserved name for cancel-verb destination.
+ *     Templates SHOULD include it in `offPipelineStages`; the schema
+ *     does NOT require it (so operators can experiment with cancel-free
+ *     templates), but the cancel verb refuses with a configuration
+ *     error at runtime when the template lacks it. The schema-level
+ *     contract is just that IF `Cancelled` appears, it appears in
+ *     `offPipelineStages` and nowhere else.
+ *
+ * The on-disk JSON additionally permits a top-level `"$rationale"`
+ * string field as a stand-in for the JSON-with-comments convention
+ * (since RFC 8259 JSON disallows comments). The loader passes the field
+ * through the schema via `.passthrough()` and ignores it at runtime;
+ * it exists so the preset files can carry lifecycle documentation that
+ * survives `jq` / `cat` inspection. Custom operator-authored templates
+ * are free to include or omit the field.
+ */
+
+import { z } from 'zod';
+
+/**
+ * Cross-field invariant helper: every entry in `subset` exists in
+ * `superset`. Used by lockedStages-subset-of-linearStages.
+ */
+function isSubsetOf(subset: readonly string[], superset: readonly string[]): boolean {
+  const allowed = new Set(superset);
+  return subset.every((value) => allowed.has(value));
+}
+
+/**
+ * Cross-field invariant helper: every entry in `a` is absent from `b`.
+ * Used to enforce the no-overlap between linearStages and
+ * offPipelineStages.
+ */
+function isDisjointFrom(a: readonly string[], b: readonly string[]): boolean {
+  const other = new Set(b);
+  return a.every((value) => !other.has(value));
+}
+
+/**
+ * Array-of-non-empty-strings with no duplicate entries. The shape comes
+ * up three times in the schema (linearStages, lockedStages,
+ * offPipelineStages) so it lives here as a factory.
+ *
+ * `minLength` is configurable so the factory can express both "must
+ * have at least one entry" (linearStages) and "may be empty"
+ * (lockedStages, offPipelineStages).
+ *
+ * The returned schema chains `.refine()` for the uniqueness invariant,
+ * which produces a `ZodEffects` — we apply it as the LAST operation
+ * here so callers don't chain further `ZodArray` methods on top.
+ */
+function uniqueStringArray(label: string, minLength: number) {
+  return z.array(z.string().min(1, `${label} entries must be non-empty strings`))
+    .min(minLength, `${label} must contain at least ${minLength} entr${minLength === 1 ? 'y' : 'ies'}`)
+    .refine(
+      (values) => new Set(values).size === values.length,
+      { message: `${label} entries must be unique` },
+    );
+}
+
+export const PipelineTemplateSchema = z.object({
+  id: z.string().min(1, 'id must be a non-empty string'),
+  name: z.string().min(1, 'name must be a non-empty string'),
+  description: z.string().min(1, 'description must be a non-empty string'),
+  linearStages: uniqueStringArray('linearStages', 1),
+  lockedStages: uniqueStringArray('lockedStages', 0).optional(),
+  offPipelineStages: uniqueStringArray('offPipelineStages', 0),
+})
+  .passthrough()
+  .refine(
+    (template) =>
+      template.lockedStages === undefined
+      || isSubsetOf(template.lockedStages, template.linearStages),
+    { message: 'lockedStages must be a subset of linearStages', path: ['lockedStages'] },
+  )
+  .refine(
+    (template) => isDisjointFrom(template.offPipelineStages, template.linearStages),
+    {
+      message:
+        'offPipelineStages must not overlap with linearStages — a stage is either linear OR off-pipeline, not both',
+      path: ['offPipelineStages'],
+    },
+  )
+  .refine(
+    (template) => !template.linearStages.includes('Cancelled'),
+    {
+      message:
+        '"Cancelled" is a reserved off-pipeline stage name and must not appear in linearStages',
+      path: ['linearStages'],
+    },
+  );
+
+/**
+ * The type inferred from the Zod schema. Equivalent to the PRD's
+ * `PipelineTemplate` interface — the schema is the source of truth and
+ * the inferred type tracks it without manual duplication.
+ *
+ * Note: `passthrough()` widens the inferred type to allow arbitrary
+ * extra keys; runtime callers should treat the named fields as the
+ * contract and ignore any extras.
+ */
+export type PipelineTemplate = z.infer<typeof PipelineTemplateSchema>;
diff --git a/packages/core/src/pipelines/visual.json b/packages/core/src/pipelines/visual.json
new file mode 100644
index 0000000..77618ed
--- /dev/null
+++ b/packages/core/src/pipelines/visual.json
@@ -0,0 +1,9 @@
+{
+  "$rationale": "Visual pipeline — for graphical / design artifacts (diagrams, illustrations, mockups, asset cuts). Sketched is the initial rough; Iterating is the operator-feedback loop where successive revisions land; Approved is the pre-ship lock (the visual is accepted, awaiting integration into a publication target); Shipped is the terminal stage (asset committed, version assigned). The off-pipeline set adds Archived alongside Blocked / Cancelled — old asset cuts that are superseded but kept for provenance live there.",
+  "id": "visual",
+  "name": "Visual",
+  "description": "Graphical / design artifact pipeline (diagrams, illustrations, mockups). Approved is the pre-ship lock; Shipped is the terminal commit.",
+  "linearStages": ["Sketched", "Iterating", "Approved", "Shipped"],
+  "lockedStages": ["Approved"],
+  "offPipelineStages": ["Blocked", "Cancelled", "Archived"]
+}
diff --git a/packages/core/test/pipelines/loader.test.ts b/packages/core/test/pipelines/loader.test.ts
new file mode 100644
index 0000000..af6545d
--- /dev/null
+++ b/packages/core/test/pipelines/loader.test.ts
@@ -0,0 +1,237 @@
+/**
+ * loadPipelineTemplate + listAvailablePipelineTemplates tests.
+ *
+ * Each test uses a fresh tmp dir (mkdtempSync) for the projectRoot.
+ * Plugin defaults are the real preset files shipped alongside the
+ * loader — we don't mock the plugin side. That means tests of the
+ * override-takes-precedence path use a preset id that exists in the
+ * defaults (`editorial`) and overlay a different JSON for it; the
+ * loader must return the overridden content.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import {
+  loadPipelineTemplate,
+  listAvailablePipelineTemplates,
+} from '../../src/pipelines/loader.ts';
+
+describe('loadPipelineTemplate', () => {
+  let projectRoot: string;
+
+  beforeEach(() => {
+    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-loader-'));
+  });
+
+  afterEach(() => {
+    rmSync(projectRoot, { recursive: true, force: true });
+  });
+
+  it('loads a plugin-default preset when no override exists', () => {
+    const template = loadPipelineTemplate('editorial', projectRoot);
+    expect(template.id).toBe('editorial');
+    expect(template.linearStages).toEqual([
+      'Ideas',
+      'Planned',
+      'Outlining',
+      'Drafting',
+      'Final',
+      'Published',
+    ]);
+    expect(template.lockedStages).toEqual(['Final']);
+    expect(template.offPipelineStages).toEqual(['Blocked', 'Cancelled']);
+  });
+
+  it('prefers a project override over the plugin default for the same id', () => {
+    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
+    mkdirSync(overrideDir, { recursive: true });
+    const override = {
+      id: 'editorial',
+      name: 'Editorial (project override)',
+      description: 'Custom three-stage editorial flow for this project.',
+      linearStages: ['Draft', 'Review', 'Published'],
+      lockedStages: ['Review'],
+      offPipelineStages: ['Cancelled'],
+    };
+    writeFileSync(
+      join(overrideDir, 'editorial.json'),
+      JSON.stringify(override, null, 2),
+      'utf8',
+    );
+    const template = loadPipelineTemplate('editorial', projectRoot);
+    expect(template.name).toBe('Editorial (project override)');
+    expect(template.linearStages).toEqual(['Draft', 'Review', 'Published']);
+    expect(template.lockedStages).toEqual(['Review']);
+    expect(template.offPipelineStages).toEqual(['Cancelled']);
+  });
+
+  it('loads an operator-authored override that has no plugin-default counterpart', () => {
+    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
+    mkdirSync(overrideDir, { recursive: true });
+    const custom = {
+      id: 'newsletter',
+      name: 'Newsletter',
+      description: 'Newsletter issues — Draft → Sent.',
+      linearStages: ['Draft', 'Sent'],
+      offPipelineStages: ['Cancelled'],
+    };
+    writeFileSync(
+      join(overrideDir, 'newsletter.json'),
+      JSON.stringify(custom, null, 2),
+      'utf8',
+    );
+    const template = loadPipelineTemplate('newsletter', projectRoot);
+    expect(template.id).toBe('newsletter');
+    expect(template.linearStages).toEqual(['Draft', 'Sent']);
+  });
+
+  it('throws when neither project override nor plugin default exists', () => {
+    expect(() => loadPipelineTemplate('does-not-exist', projectRoot))
+      .toThrow(/not found/);
+  });
+
+  it('throws with both searched paths in the error when the id is unknown', () => {
+    expect(() => loadPipelineTemplate('does-not-exist', projectRoot))
+      .toThrow(/Searched project override/);
+    expect(() => loadPipelineTemplate('does-not-exist', projectRoot))
+      .toThrow(/Searched plugin default/);
+  });
+
+  it('throws on malformed JSON in an override', () => {
+    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
+    mkdirSync(overrideDir, { recursive: true });
+    writeFileSync(join(overrideDir, 'editorial.json'), '{ this is not valid json', 'utf8');
+    expect(() => loadPipelineTemplate('editorial', projectRoot))
+      .toThrow(/not valid JSON/);
+  });
+
+  it('throws on Zod-invalid override (missing required field)', () => {
+    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
+    mkdirSync(overrideDir, { recursive: true });
+    const invalid = {
+      id: 'editorial',
+      name: 'Editorial',
+      // description missing — required
+      linearStages: ['Ideas', 'Published'],
+      offPipelineStages: ['Cancelled'],
+    };
+    writeFileSync(
+      join(overrideDir, 'editorial.json'),
+      JSON.stringify(invalid, null, 2),
+      'utf8',
+    );
+    expect(() => loadPipelineTemplate('editorial', projectRoot))
+      .toThrow(/failed Zod validation/);
+  });
+
+  it('throws when the JSON id field disagrees with the filename basename', () => {
+    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
+    mkdirSync(overrideDir, { recursive: true });
+    const mismatched = {
+      id: 'visual',
+      name: 'Editorial',
+      description: 'wrong id inside an editorial.json file',
+      linearStages: ['Ideas', 'Published'],
+      offPipelineStages: ['Cancelled'],
+    };
+    writeFileSync(
+      join(overrideDir, 'editorial.json'),
+      JSON.stringify(mismatched, null, 2),
+      'utf8',
+    );
+    expect(() => loadPipelineTemplate('editorial', projectRoot))
+      .toThrow(/declares id "visual" but was loaded as "editorial"/);
+  });
+
+  it('throws on an empty id', () => {
+    expect(() => loadPipelineTemplate('', projectRoot))
+      .toThrow(/non-empty id/);
+  });
+});
+
+describe('listAvailablePipelineTemplates', () => {
+  let projectRoot: string;
+
+  beforeEach(() => {
+    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-list-'));
+  });
+
+  afterEach(() => {
+    rmSync(projectRoot, { recursive: true, force: true });
+  });
+
+  it('returns the plugin defaults when no project overrides exist', () => {
+    const ids = listAvailablePipelineTemplates(projectRoot);
+    // The five preset ids the workplan ships.
+    expect(ids).toEqual(
+      ['blog-post', 'editorial', 'feature-doc', 'qa-plan', 'visual'].sort(),
+    );
+  });
+
+  it('returns the same plugin defaults when .deskwork/ exists but pipelines/ subdir does not', () => {
+    mkdirSync(join(projectRoot, '.deskwork'), { recursive: true });
+    const ids = listAvailablePipelineTemplates(projectRoot);
+    expect(ids).toContain('editorial');
+    expect(ids).toContain('visual');
+  });
+
+  it('merges project overrides with plugin defaults, deduplicated by id', () => {
+    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
+    mkdirSync(overrideDir, { recursive: true });
+    // editorial: also exists as a plugin default (overlap — should dedup).
+    // newsletter: project-only (should appear in the list).
+    const editorialOverride = {
+      id: 'editorial',
+      name: 'Editorial (override)',
+      description: 'project override',
+      linearStages: ['Draft', 'Published'],
+      offPipelineStages: ['Cancelled'],
+    };
+    const newsletter = {
+      id: 'newsletter',
+      name: 'Newsletter',
+      description: 'project-only',
+      linearStages: ['Draft', 'Sent'],
+      offPipelineStages: ['Cancelled'],
+    };
+    writeFileSync(
+      join(overrideDir, 'editorial.json'),
+      JSON.stringify(editorialOverride, null, 2),
+      'utf8',
+    );
+    writeFileSync(
+      join(overrideDir, 'newsletter.json'),
+      JSON.stringify(newsletter, null, 2),
+      'utf8',
+    );
+
+    const ids = listAvailablePipelineTemplates(projectRoot);
+    // editorial appears exactly once despite existing in both sources.
+    expect(ids.filter((id) => id === 'editorial')).toHaveLength(1);
+    // newsletter appears (project-only).
+    expect(ids).toContain('newsletter');
+    // The plugin defaults still surface.
+    expect(ids).toContain('visual');
+    expect(ids).toContain('blog-post');
+  });
+
+  it('returns ids in stable sorted order', () => {
+    const ids = listAvailablePipelineTemplates(projectRoot);
+    const sorted = [...ids].sort();
+    expect(ids).toEqual(sorted);
+  });
+
+  it('ignores non-JSON files in the override directory', () => {
+    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
+    mkdirSync(overrideDir, { recursive: true });
+    writeFileSync(join(overrideDir, 'README.md'), '# notes\n', 'utf8');
+    writeFileSync(join(overrideDir, 'old-template.json.bak'), '{}', 'utf8');
+
+    const ids = listAvailablePipelineTemplates(projectRoot);
+    expect(ids).not.toContain('README');
+    expect(ids).not.toContain('old-template.json');
+    expect(ids).not.toContain('old-template');
+  });
+});
diff --git a/packages/core/test/pipelines/presets.test.ts b/packages/core/test/pipelines/presets.test.ts
new file mode 100644
index 0000000..aa2216a
--- /dev/null
+++ b/packages/core/test/pipelines/presets.test.ts
@@ -0,0 +1,108 @@
+/**
+ * Preset template validation.
+ *
+ * Asserts each shipped preset:
+ *   - loads cleanly via the resolver,
+ *   - passes Zod validation,
+ *   - matches the stage layout the PRD specifies (verbatim).
+ *
+ * The shipped values are the auto-migration target for pre-feature
+ * projects (editorial) and the documented adopter-facing contract for
+ * the other four — a silent drift here is exactly the failure mode the
+ * test catches.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtempSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import {
+  loadPipelineTemplate,
+  listAvailablePipelineTemplates,
+} from '../../src/pipelines/loader.ts';
+import { PipelineTemplateSchema } from '../../src/pipelines/types.ts';
+
+/**
+ * Expected shipped shape per preset (PRD § Preset templates).
+ * Keep this table in sync with the workplan + JSON.
+ */
+const EXPECTED_PRESETS: Record<
+  string,
+  {
+    linearStages: string[];
+    lockedStages: string[] | undefined;
+    offPipelineStages: string[];
+  }
+> = {
+  editorial: {
+    linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
+    lockedStages: ['Final'],
+    offPipelineStages: ['Blocked', 'Cancelled'],
+  },
+  visual: {
+    linearStages: ['Sketched', 'Iterating', 'Approved', 'Shipped'],
+    lockedStages: ['Approved'],
+    offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
+  },
+  'feature-doc': {
+    linearStages: ['Defined', 'Drafting', 'Approved', 'Implemented', 'Complete'],
+    lockedStages: ['Approved', 'Implemented'],
+    offPipelineStages: ['Blocked', 'Cancelled'],
+  },
+  'qa-plan': {
+    linearStages: ['Drafted', 'Reviewed', 'Tested', 'Approved'],
+    lockedStages: ['Reviewed'],
+    offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
+  },
+  'blog-post': {
+    linearStages: ['Idea', 'Drafting', 'Edited', 'Published'],
+    lockedStages: ['Edited'],
+    offPipelineStages: ['Blocked', 'Cancelled'],
+  },
+};
+
+describe('preset pipeline templates', () => {
+  let projectRoot: string;
+
+  beforeEach(() => {
+    // Empty project root — exercises the plugin-default-fallback path.
+    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-presets-'));
+  });
+
+  afterEach(() => {
+    rmSync(projectRoot, { recursive: true, force: true });
+  });
+
+  it('listAvailablePipelineTemplates includes all five preset ids', () => {
+    const ids = listAvailablePipelineTemplates(projectRoot);
+    for (const id of Object.keys(EXPECTED_PRESETS)) {
+      expect(ids).toContain(id);
+    }
+  });
+
+  for (const [id, expected] of Object.entries(EXPECTED_PRESETS)) {
+    describe(`preset: ${id}`, () => {
+      it('loads via the resolver and passes Zod validation', () => {
+        const template = loadPipelineTemplate(id, projectRoot);
+        // Re-validate explicitly so a future loader bug that skips the
+        // schema check still gets caught here.
+        const result = PipelineTemplateSchema.safeParse(template);
+        expect(result.success).toBe(true);
+      });
+
+      it('matches the PRD-specified stage layout', () => {
+        const template = loadPipelineTemplate(id, projectRoot);
+        expect(template.id).toBe(id);
+        expect(template.linearStages).toEqual(expected.linearStages);
+        expect(template.lockedStages).toEqual(expected.lockedStages);
+        expect(template.offPipelineStages).toEqual(expected.offPipelineStages);
+      });
+
+      it('has a non-empty name and description', () => {
+        const template = loadPipelineTemplate(id, projectRoot);
+        expect(template.name.length).toBeGreaterThan(0);
+        expect(template.description.length).toBeGreaterThan(0);
+      });
+    });
+  }
+});
diff --git a/packages/core/test/pipelines/types.test.ts b/packages/core/test/pipelines/types.test.ts
new file mode 100644
index 0000000..118365c
--- /dev/null
+++ b/packages/core/test/pipelines/types.test.ts
@@ -0,0 +1,174 @@
+/**
+ * PipelineTemplate Zod schema invariant tests.
+ *
+ * Each Zod refinement in `src/pipelines/types.ts` gets its own block
+ * here. Refinements share a single test surface but the failure modes
+ * are independent (subset, disjointness, reserved name) — we want each
+ * to fail loudly on its own when broken.
+ */
+
+import { describe, it, expect } from 'vitest';
+import { PipelineTemplateSchema } from '../../src/pipelines/types.ts';
+
+/**
+ * Helper: build a minimally-valid template, optionally overriding any
+ * field. Keeps the per-test fixtures focused on the field under test.
+ */
+function makeTemplate(overrides: Record<string, unknown> = {}): unknown {
+  return {
+    id: 'editorial',
+    name: 'Editorial',
+    description: 'Long-form writing pipeline.',
+    linearStages: ['Ideas', 'Planned', 'Drafting', 'Final', 'Published'],
+    lockedStages: ['Final'],
+    offPipelineStages: ['Blocked', 'Cancelled'],
+    ...overrides,
+  };
+}
+
+describe('PipelineTemplateSchema', () => {
+  describe('happy path', () => {
+    it('accepts a minimally-valid template', () => {
+      const result = PipelineTemplateSchema.safeParse(makeTemplate());
+      expect(result.success).toBe(true);
+    });
+
+    it('accepts a template that omits lockedStages (the field is optional)', () => {
+      const tpl = makeTemplate({ lockedStages: undefined });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(true);
+    });
+
+    it('accepts a template with empty offPipelineStages', () => {
+      // Per the schema: offPipelineStages can be empty (no cul-de-sacs).
+      // The cancel verb refuses at runtime if Cancelled is absent; the
+      // schema does not enforce its presence.
+      const tpl = makeTemplate({ offPipelineStages: [] });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(true);
+    });
+
+    it('passes through unknown top-level fields (e.g. $rationale)', () => {
+      const tpl = makeTemplate({ $rationale: 'why this pipeline exists' });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(true);
+    });
+  });
+
+  describe('required fields', () => {
+    it('rejects a missing id', () => {
+      const tpl = makeTemplate({ id: undefined });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('rejects an empty-string id', () => {
+      const tpl = makeTemplate({ id: '' });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('rejects a missing name', () => {
+      const tpl = makeTemplate({ name: undefined });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('rejects a missing description', () => {
+      const tpl = makeTemplate({ description: undefined });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+  });
+
+  describe('linearStages invariants', () => {
+    it('rejects an empty linearStages array', () => {
+      const tpl = makeTemplate({ linearStages: [] });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('rejects empty-string stage names', () => {
+      const tpl = makeTemplate({ linearStages: ['Ideas', '', 'Final', 'Published'] });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('rejects duplicate stage names in linearStages', () => {
+      const tpl = makeTemplate({ linearStages: ['Ideas', 'Drafting', 'Drafting', 'Published'] });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('rejects "Cancelled" inside linearStages (reserved name)', () => {
+      const tpl = makeTemplate({
+        linearStages: ['Ideas', 'Cancelled', 'Published'],
+        offPipelineStages: ['Blocked'],
+      });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+      if (!result.success) {
+        const messages = result.error.issues.map((issue) => issue.message);
+        expect(messages.some((m) => m.includes('reserved'))).toBe(true);
+      }
+    });
+  });
+
+  describe('lockedStages invariants', () => {
+    it('rejects lockedStages that are not a subset of linearStages', () => {
+      const tpl = makeTemplate({
+        linearStages: ['Ideas', 'Drafting', 'Published'],
+        lockedStages: ['Final'],
+      });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+      if (!result.success) {
+        const messages = result.error.issues.map((issue) => issue.message);
+        expect(messages.some((m) => m.includes('subset'))).toBe(true);
+      }
+    });
+
+    it('rejects duplicate entries inside lockedStages', () => {
+      const tpl = makeTemplate({
+        linearStages: ['Ideas', 'Drafting', 'Final', 'Published'],
+        lockedStages: ['Final', 'Final'],
+      });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('accepts an empty lockedStages array (workflow with no pre-terminal lock)', () => {
+      const tpl = makeTemplate({ lockedStages: [] });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(true);
+    });
+  });
+
+  describe('offPipelineStages invariants', () => {
+    it('rejects overlap between linearStages and offPipelineStages', () => {
+      const tpl = makeTemplate({
+        linearStages: ['Ideas', 'Drafting', 'Blocked', 'Published'],
+        lockedStages: [],
+        offPipelineStages: ['Blocked', 'Cancelled'],
+      });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+      if (!result.success) {
+        const messages = result.error.issues.map((issue) => issue.message);
+        expect(messages.some((m) => m.includes('overlap'))).toBe(true);
+      }
+    });
+
+    it('rejects duplicate entries inside offPipelineStages', () => {
+      const tpl = makeTemplate({ offPipelineStages: ['Blocked', 'Blocked', 'Cancelled'] });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(false);
+    });
+
+    it('accepts an Archived cul-de-sac alongside Blocked / Cancelled', () => {
+      const tpl = makeTemplate({ offPipelineStages: ['Blocked', 'Cancelled', 'Archived'] });
+      const result = PipelineTemplateSchema.safeParse(tpl);
+      expect(result.success).toBe(true);
+    });
+  });
+});


## What to look for

- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.

## Output format

For each finding you surface, emit ONE markdown block in this exact shape:

```
### <heading: one-line summary of the finding>

Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
Status:     open
Severity:   <blocking | high | medium | low | informational>
Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>

<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
```

Number the findings sequentially (`-01`, `-02`, ...). Use `blocking` only for issues that would break the feature's stated goals in obvious ways; `high` for correctness bugs adopters will hit; `medium` for design issues that compound over time; `low` for hygiene; `informational` for context you think the operator should see but isn't itself a bug.

## If you find nothing — say so explicitly

If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:

```
### No findings

Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
Status:     open
Severity:   informational
Surface:    (the entire diff)

I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
```

**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.

## Hard constraints

- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
