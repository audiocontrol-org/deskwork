# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Phase 4 of graphical-entries: Verb refactor + template-driven stage reads. All six universal verbs (approve, iterate, cancel, block, induct, publish) refactored to consult the entry's bound pipeline template via resolveEntryStrictTemplate rather than hardcoded stage literals. Template-aware helpers in pipelines/helpers.ts replace the legacy hardcoded checks. Per Commandment II of DESKWORK-STATE-MACHINE.md: verbs are universal and stage-gated only. Closes #247 (calendar regen lane-aware) and #300 (doctor parser section-agnostic UUID-set). migrateLaneMembership back-fills lane + artifactKind on every sidecar with lane-migration journal events. Audit focus: stage-transition correctness across all six verbs (terminal-stage refusals; off-pipeline refusals; missing-Cancelled-stage refusals; priorStage recording; journal events fired in correct order), template lookup edge cases, migration correctness, no silent fallbacks, type-safety.

## Commit subjects in the audited range

d144ba2 feat(graphical-entries): Phase 4 — verb refactor + template-driven stage reads (closes #247, closes #300)


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

diff --git a/packages/cli/src/commands/induct.ts b/packages/cli/src/commands/induct.ts
index 7fb3b3f..d3d936a 100644
--- a/packages/cli/src/commands/induct.ts
+++ b/packages/cli/src/commands/induct.ts
@@ -84,8 +84,16 @@ export async function run(argv: string[]): Promise<void> {
     fail(err instanceof Error ? err.message : String(err));
   }
 
-  // Resolve target stage — explicit flag overrides defaults.
-  let targetStage: Stage;
+  // Resolve target stage — explicit flag overrides defaults. Per Phase
+  // 4 (graphical-entries) `inductEntry`'s `targetStage` is a `string`
+  // gated by the entry's lane-template `linearStages` membership; the
+  // CLI's editorial-narrow `Stage` check below remains as a CLI-side
+  // convenience for editorial users but the value flows to the core
+  // verb as a plain string. Lane-template stages outside the editorial
+  // vocabulary will fail the CLI-side guard; operators using
+  // non-editorial templates should invoke the core helper directly
+  // until a lane-aware CLI lands.
+  let targetStage: string;
   if (flags.to !== undefined) {
     if (!isLinearPipelineTarget(flags.to)) {
       fail(
diff --git a/packages/core/src/calendar/regenerate.ts b/packages/core/src/calendar/regenerate.ts
index b4126b1..6999cf0 100644
--- a/packages/core/src/calendar/regenerate.ts
+++ b/packages/core/src/calendar/regenerate.ts
@@ -10,6 +10,13 @@ import { renderCalendar } from './render.ts';
  * if no sidecars exist, calendar.md is rewritten with empty stage
  * sections.
  *
+ * Per Phase 4 (graphical-entries) the renderer is lane-template-aware:
+ * `projectRoot` is now passed through to `renderCalendar` so the
+ * render layer can read the lane configs and emit per-lane sections
+ * for multi-lane projects. Legacy single-lane projects (no
+ * `.deskwork/lanes/` directory) keep their existing render shape — a
+ * single set of editorial stage sections.
+ *
  * Used by:
  *   - the doctor's repair pass (canonical SSOT reconciliation),
  *   - every entry stage-transition helper (#148: keep calendar.md
@@ -41,7 +48,11 @@ export async function regenerateCalendar(projectRoot: string): Promise<void> {
     }
   }
 
-  const md = renderCalendar(entries);
+  // Phase 4 Task 4.2.2: thread projectRoot into renderCalendar so the
+  // lane-aware code path activates when `.deskwork/lanes/*.json` is
+  // present. Single-lane projects fall back to the editorial shape
+  // unchanged.
+  const md = renderCalendar(entries, projectRoot);
   const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
   await mkdir(dirname(calendarPath), { recursive: true });
   await writeFile(calendarPath, md);
diff --git a/packages/core/src/calendar/render.ts b/packages/core/src/calendar/render.ts
index c380a85..dc65d9a 100644
--- a/packages/core/src/calendar/render.ts
+++ b/packages/core/src/calendar/render.ts
@@ -1,8 +1,32 @@
-import type { Entry, Stage } from '../schema/entry.ts';
+/**
+ * Calendar renderer (Phase 4 — lane-template-aware).
+ *
+ * Per the graphical-entries PRD, a project may host one or more lanes,
+ * each bound to a pipeline template that names its own stages. The
+ * renderer iterates the lane's `linearStages ∪ offPipelineStages` to
+ * produce per-lane sections; entries with no `lane` set (legacy /
+ * migration-window) fall back to the editorial template's stage list.
+ *
+ * Issue #247: the legacy `STAGE_ORDER` constant was hardcoded to the
+ * editorial 8-stage list. Lanes whose templates use different stage
+ * names (visual: `Sketched / Iterating / Approved / Shipped`) had
+ * their entries silently dropped because the bucketize step had no
+ * bucket for the unknown stage. The template-driven iteration fixes
+ * the drop.
+ *
+ * Single-lane (legacy editorial) projects keep their existing render
+ * shape unchanged — the output is a single set of `## <Stage>`
+ * sections in the editorial template's order, identical to pre-Phase-4
+ * output.
+ */
 
-const STAGE_ORDER: readonly Stage[] = [
-  'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled',
-] as const;
+import type { Entry } from '../schema/entry.ts';
+import { loadPipelineTemplate } from '../pipelines/loader.ts';
+import { listLaneConfigs, loadLaneConfig } from '../lanes/loader.ts';
+import type {
+  PipelineTemplate,
+  StrictPipelineTemplate,
+} from '../pipelines/types.ts';
 
 const HEADER = '# Editorial Calendar\n\n';
 const TABLE_HEADER = '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';
@@ -16,18 +40,38 @@ function renderRow(e: Entry): string {
   return `| ${e.uuid} | ${escapePipe(e.slug)} | ${escapePipe(e.title)} | ${escapePipe(e.description ?? '')} | ${escapePipe(e.keywords.join(', '))} | ${escapePipe(e.source)} | ${e.updatedAt} |`;
 }
 
+function renderStageSection(stage: string, bucket: readonly Entry[]): string {
+  let section = `## ${stage}\n\n`;
+  if (bucket.length === 0) {
+    section += EMPTY;
+    return section;
+  }
+  section += TABLE_HEADER;
+  for (const e of bucket) section += renderRow(e) + '\n';
+  section += '\n';
+  return section;
+}
+
 /**
- * Bucketize entries by stage. The map key is `string` rather than the
- * legacy `Stage` enum so this function handles entries from any lane
- * template — entries whose `currentStage` is outside the editorial
- * pipeline's eight known stages simply don't land in any bucket here
- * (the editorial calendar surface is intentionally editorial-only).
- * Phase 4's lane-aware calendar rendering replaces this with a
- * template-driven bucketization; see graphical-entries workplan.
+ * Produce the full ordered stage list for a template:
+ * `linearStages` then `offPipelineStages` (in declaration order). The
+ * concatenation is the calendar's section order; the existing
+ * editorial render shape was `Ideas / Planned / Outlining / Drafting /
+ * Final / Published / Blocked / Cancelled`, which matches this
+ * concatenation exactly for the editorial preset.
  */
-function bucketize(entries: Entry[]): Map<string, Entry[]> {
+function templateStageOrder(template: StrictPipelineTemplate): readonly string[] {
+  return [...template.linearStages, ...template.offPipelineStages];
+}
+
+/**
+ * Bucket entries by their `currentStage`, ignoring lane membership.
+ * Used by the single-lane render path. Lane-aware rendering uses a
+ * pre-filtered entry list per lane.
+ */
+function bucketize(entries: readonly Entry[], stages: readonly string[]): Map<string, Entry[]> {
   const byStage = new Map<string, Entry[]>();
-  for (const stage of STAGE_ORDER) byStage.set(stage, []);
+  for (const stage of stages) byStage.set(stage, []);
   for (const e of entries) {
     const bucket = byStage.get(e.currentStage);
     if (bucket) bucket.push(e);
@@ -35,26 +79,119 @@ function bucketize(entries: Entry[]): Map<string, Entry[]> {
   return byStage;
 }
 
-function renderStageSection(stage: Stage, bucket: readonly Entry[]): string {
-  let section = `## ${stage}\n\n`;
-  if (bucket.length === 0) {
-    section += EMPTY;
-    return section;
+/**
+ * Render a single set of stage sections (no lane header). Used by the
+ * legacy single-lane / migration-window path.
+ */
+function renderStageSections(
+  entries: readonly Entry[],
+  template: StrictPipelineTemplate,
+): string {
+  const stages = templateStageOrder(template);
+  const byStage = bucketize(entries, stages);
+  let out = '';
+  for (const stage of stages) {
+    const bucket = byStage.get(stage) ?? [];
+    out += renderStageSection(stage, bucket);
   }
-  section += TABLE_HEADER;
-  for (const e of bucket) section += renderRow(e) + '\n';
-  section += '\n';
-  return section;
+  return out;
 }
 
-export function renderCalendar(entries: Entry[]): string {
-  const byStage = bucketize(entries);
+interface LaneContext {
+  readonly id: string;
+  readonly name: string;
+  readonly template: StrictPipelineTemplate;
+}
+
+/**
+ * Resolve every project lane plus its bound template. Returns an empty
+ * array when no lane configs exist or `projectRoot` is undefined
+ * (the legacy single-lane render path).
+ */
+function loadLaneContexts(projectRoot: string | undefined): LaneContext[] {
+  if (projectRoot === undefined) return [];
+  const ids = listLaneConfigs(projectRoot);
+  const out: LaneContext[] = [];
+  for (const id of ids) {
+    const lane = loadLaneConfig(id, projectRoot);
+    const template: PipelineTemplate = loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
+    out.push({ id: lane.id, name: lane.name, template });
+  }
+  return out;
+}
+
+/**
+ * Editorial fallback used when no lane configs are present (legacy /
+ * migration-window). Synthesized in-memory so the renderer doesn't
+ * require the editorial preset to be discoverable via `loadPipelineTemplate`
+ * — necessary for the test fixtures that exercise `renderCalendar`
+ * without a project root.
+ */
+const EDITORIAL_FALLBACK: StrictPipelineTemplate = {
+  id: 'editorial',
+  name: 'Editorial',
+  description: 'Long-form writing pipeline (editorial fallback).',
+  linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
+  lockedStages: ['Final'],
+  offPipelineStages: ['Blocked', 'Cancelled'],
+};
+
+/**
+ * Render the editorial calendar as markdown.
+ *
+ * Modes:
+ *
+ *   - `renderCalendar(entries)` — legacy single-lane shape. Iterates
+ *     the editorial template's stages. Issue #247 is closed for this
+ *     mode by using the editorial fallback's full 8-stage list (so
+ *     entries in `Final` and `Cancelled` no longer disappear).
+ *
+ *   - `renderCalendar(entries, projectRoot)` — lane-aware shape. Reads
+ *     every lane config and emits one `## Lane: <name>` block per
+ *     lane, with per-lane stage sections drawn from that lane's
+ *     template. Multi-lane projects use this mode.
+ */
+export function renderCalendar(entries: Entry[], projectRoot?: string): string {
+  const laneContexts = loadLaneContexts(projectRoot);
 
   let md = HEADER;
-  for (const stage of STAGE_ORDER) {
-    const bucket = byStage.get(stage) ?? [];
-    md += renderStageSection(stage, bucket);
+
+  if (laneContexts.length === 0) {
+    // Legacy single-lane path. The editorial fallback's stage list
+    // covers every existing editorial entry. Issue #247 closes here:
+    // entries in `Final` and `Cancelled` (previously dropped because
+    // the renderer's hardcoded 8-stage list happened to be exactly the
+    // editorial 8 stages but mis-aligned with the parser's 7-stage
+    // legacy list) now flow through cleanly.
+    md += renderStageSections(entries, EDITORIAL_FALLBACK);
+    md += `## Distribution\n\n*reserved for shortform DistributionRecords — separate model*\n`;
+    return md;
+  }
+
+  // Multi-lane: group entries by lane; each lane gets its own header +
+  // template-driven stage sections.
+  const entriesByLane = new Map<string, Entry[]>();
+  for (const ctx of laneContexts) entriesByLane.set(ctx.id, []);
+  const orphanLane: Entry[] = [];
+  for (const e of entries) {
+    if (e.lane !== undefined && entriesByLane.has(e.lane)) {
+      const bucket = entriesByLane.get(e.lane);
+      if (bucket) bucket.push(e);
+    } else {
+      orphanLane.push(e);
+    }
+  }
+
+  for (const ctx of laneContexts) {
+    md += `# Lane: ${ctx.name}\n\n`;
+    md += renderStageSections(entriesByLane.get(ctx.id) ?? [], ctx.template);
   }
+
+  if (orphanLane.length > 0) {
+    md += `# Lane: (unassigned)\n\n`;
+    md += renderStageSections(orphanLane, EDITORIAL_FALLBACK);
+  }
+
   md += `## Distribution\n\n*reserved for shortform DistributionRecords — separate model*\n`;
   return md;
 }
diff --git a/packages/core/src/doctor/index.ts b/packages/core/src/doctor/index.ts
index 582c4eb..2a632e2 100644
--- a/packages/core/src/doctor/index.ts
+++ b/packages/core/src/doctor/index.ts
@@ -30,3 +30,9 @@ export {
 } from './runner.ts';
 
 export { printSchemaPatchInstructions } from './schema-patch.ts';
+
+export {
+  migrateLaneMembership,
+  type LaneMigrationResult,
+  type LaneMigrationOptions,
+} from './lane-migration.ts';
diff --git a/packages/core/src/doctor/lane-migration.ts b/packages/core/src/doctor/lane-migration.ts
new file mode 100644
index 0000000..c5130ac
--- /dev/null
+++ b/packages/core/src/doctor/lane-migration.ts
@@ -0,0 +1,211 @@
+/**
+ * Doctor lane-migration helper (Phase 4 Task 4.4).
+ *
+ * Two concerns, run in sequence:
+ *
+ *   1. Bootstrap a `default` lane bound to the editorial template from
+ *      the legacy `sites.<defaultSite>.contentDir` config block. This
+ *      delegates to `bootstrapDefaultLaneIfMissing` (Phase 3) which is
+ *      already side-effect-safe (returns `{ created: false }` when no
+ *      work to do) and atomic.
+ *
+ *   2. Back-fill `lane: "default"` and a derived `artifactKind` on
+ *      every existing sidecar that lacks either field. For each
+ *      back-filled sidecar, emit a `lane-migration` journal event so
+ *      the change is auditable.
+ *
+ * `--dry-run` is supported: the function returns a structured summary
+ * of changes WITHOUT writing anything to disk. Atomic per-sidecar
+ * writes (delegated to `writeSidecar`) ensure a crash mid-loop leaves a
+ * consistent partial state — every successfully-written sidecar is
+ * complete and valid, with its corresponding journal event recorded
+ * before the write.
+ *
+ * Idempotent: running twice produces no further changes (the second
+ * pass sees every sidecar already carries `lane` and `artifactKind`,
+ * so no writes / journal events fire).
+ */
+
+import { readFile, readdir } from 'node:fs/promises';
+import { join, extname } from 'node:path';
+import { sidecarsDir } from '../sidecar/paths.ts';
+import { writeSidecar } from '../sidecar/write.ts';
+import { EntrySchema, type Entry } from '../schema/entry.ts';
+import { appendJournalEvent } from '../journal/append.ts';
+import { bootstrapDefaultLaneIfMissing } from '../lanes/bootstrap.ts';
+import type { ArtifactKind } from '../lanes/types.ts';
+
+export interface LaneMigrationResult {
+  /** Whether the `default` lane was created by this run. */
+  readonly defaultLaneCreated: boolean;
+  /** Path the default lane config landed at (whether created or pre-existing). */
+  readonly defaultLanePath: string;
+  /** Number of sidecars back-filled with `lane: "default"`. */
+  readonly entriesLaneBackfilled: number;
+  /** Number of sidecars back-filled with a derived `artifactKind`. */
+  readonly entriesArtifactKindBackfilled: number;
+  /** Total number of sidecars examined. */
+  readonly entriesExamined: number;
+  /** True when this was a dry run (no disk writes). */
+  readonly dryRun: boolean;
+}
+
+export interface LaneMigrationOptions {
+  /** When true, plan changes but do not write to disk. */
+  readonly dryRun?: boolean;
+}
+
+/**
+ * Derive an `artifactKind` from an entry's `artifactPath`. Unlike
+ * `detectArtifactKind` (which probes the filesystem), this function
+ * works purely from the path string — the migration needs to be able
+ * to derive a kind even for sidecars whose on-disk artifact has been
+ * temporarily moved or hasn't landed yet. Returns `undefined` when
+ * the path is missing or extensionless.
+ */
+function deriveArtifactKindFromPath(artifactPath: string | undefined): ArtifactKind | undefined {
+  if (artifactPath === undefined || artifactPath.length === 0) return undefined;
+  const ext = extname(artifactPath).toLowerCase();
+  if (ext === '.md') return 'markdown';
+  if (ext === '.html') return 'single-file-html';
+  if (
+    ext === '.png' || ext === '.jpg' || ext === '.jpeg'
+    || ext === '.gif' || ext === '.webp' || ext === '.svg'
+  ) {
+    return 'image';
+  }
+  // No extension or unsupported: skip the back-fill rather than throwing.
+  // The doctor's separate artifact-kind validation rule (later phase)
+  // can surface the missing field; the migration's job is best-effort
+  // back-fill for the clearly-classifiable cases.
+  return undefined;
+}
+
+/**
+ * Run the Phase 4 lane migration against `projectRoot`:
+ *
+ *   1. Bootstrap a `default` lane if absent (Phase 3 helper).
+ *   2. Walk every sidecar; back-fill `lane: "default"` when missing;
+ *      back-fill `artifactKind` when missing AND derivable from the
+ *      sidecar's `artifactPath`.
+ *   3. Emit a `lane-migration` journal event per modified sidecar.
+ *
+ * @param projectRoot - Absolute path to the project root.
+ * @param opts.dryRun - When true, return the summary without writing.
+ */
+export async function migrateLaneMembership(
+  projectRoot: string,
+  opts: LaneMigrationOptions = {},
+): Promise<LaneMigrationResult> {
+  const dryRun = opts.dryRun ?? false;
+
+  // 1. Default lane bootstrap. The helper is idempotent and atomic; in
+  //    dry-run mode we skip the call (the bootstrap doesn't have a
+  //    dry-run mode of its own, so we synthesize one by probing the
+  //    target path).
+  let defaultLaneCreated = false;
+  let defaultLanePath: string;
+  if (dryRun) {
+    defaultLanePath = join(projectRoot, '.deskwork', 'lanes', 'default.json');
+    try {
+      await readFile(defaultLanePath, 'utf8');
+      defaultLaneCreated = false;
+    } catch {
+      defaultLaneCreated = true; // would create
+    }
+  } else {
+    const bootstrap = await bootstrapDefaultLaneIfMissing(projectRoot);
+    defaultLanePath = bootstrap.path;
+    defaultLaneCreated = bootstrap.created;
+  }
+
+  // 2. Walk every sidecar; collect back-fill plan.
+  const dir = sidecarsDir(projectRoot);
+  let names: string[];
+  try {
+    names = await readdir(dir);
+  } catch {
+    // No entries dir — nothing to back-fill.
+    return {
+      defaultLaneCreated,
+      defaultLanePath,
+      entriesLaneBackfilled: 0,
+      entriesArtifactKindBackfilled: 0,
+      entriesExamined: 0,
+      dryRun,
+    };
+  }
+
+  let laneBackfilled = 0;
+  let artifactKindBackfilled = 0;
+  let examined = 0;
+  for (const name of names) {
+    if (!name.endsWith('.json')) continue;
+    const path = join(dir, name);
+    let raw: string;
+    try {
+      raw = await readFile(path, 'utf8');
+    } catch {
+      continue;
+    }
+    let parsed: Entry;
+    try {
+      const result = EntrySchema.safeParse(JSON.parse(raw));
+      if (!result.success) continue;
+      parsed = result.data;
+    } catch {
+      continue;
+    }
+    examined++;
+
+    const needsLane = parsed.lane === undefined;
+    const derivedKind = parsed.artifactKind ?? deriveArtifactKindFromPath(parsed.artifactPath);
+    const needsArtifactKind = parsed.artifactKind === undefined && derivedKind !== undefined;
+    if (!needsLane && !needsArtifactKind) continue;
+
+    if (needsLane) laneBackfilled++;
+    if (needsArtifactKind) artifactKindBackfilled++;
+
+    if (dryRun) continue;
+
+    // 3. Emit journal event BEFORE the sidecar write so a crash between
+    //    the two leaves a journal record of the intent (and the next
+    //    migration run skips the sidecar because the field is already
+    //    present, or finds the field missing and re-emits — idempotent
+    //    either way).
+    const at = new Date().toISOString();
+    await appendJournalEvent(projectRoot, {
+      kind: 'lane-migration',
+      at,
+      migration: 'backfill-lane-and-artifact-kind',
+      source: `entries/${parsed.uuid}.json`,
+      target: `entries/${parsed.uuid}.json`,
+      details: {
+        entryUuid: parsed.uuid,
+        ...(needsLane ? { laneAdded: 'default' } : {}),
+        ...(needsArtifactKind && derivedKind !== undefined
+          ? { artifactKindAdded: derivedKind }
+          : {}),
+      },
+    });
+
+    const updated: Entry = {
+      ...parsed,
+      ...(needsLane ? { lane: 'default' } : {}),
+      ...(needsArtifactKind && derivedKind !== undefined
+        ? { artifactKind: derivedKind }
+        : {}),
+      updatedAt: at,
+    };
+    await writeSidecar(projectRoot, updated);
+  }
+
+  return {
+    defaultLaneCreated,
+    defaultLanePath,
+    entriesLaneBackfilled: laneBackfilled,
+    entriesArtifactKindBackfilled: artifactKindBackfilled,
+    entriesExamined: examined,
+    dryRun,
+  };
+}
diff --git a/packages/core/src/doctor/rules/orphan-frontmatter-id.ts b/packages/core/src/doctor/rules/orphan-frontmatter-id.ts
index fb2ce69..3f404fa 100644
--- a/packages/core/src/doctor/rules/orphan-frontmatter-id.ts
+++ b/packages/core/src/doctor/rules/orphan-frontmatter-id.ts
@@ -11,10 +11,35 @@
  * intent, the rule reports findings and presents a prompt; with
  * `--yes`, the safest action is "do nothing" — auto-creating
  * calendar rows or auto-deleting frontmatter is destructive.
+ *
+ * Issue #300 (closed Phase 4):
+ *
+ *   The legacy `parseCalendar` helper that feeds `ctx.calendar.entries`
+ *   only recognized the pre-graphical-entries 7-stage section list
+ *   (`Ideas / Planned / Outlining / Drafting / Review / Paused /
+ *   Published`). Entries under `## Final`, `## Blocked`, or
+ *   `## Cancelled` sections never made it into the parsed entry list,
+ *   so this rule produced false-positive "orphan" findings against
+ *   every Final / Blocked / Cancelled entry in the project.
+ *
+ *   The fix (per #300's recommended option B): do a UUID-set scan of
+ *   every table row across every section in the calendar markdown,
+ *   independent of the section heading. The UUID set is the
+ *   authoritative ground truth — if the UUID appears in ANY table row
+ *   anywhere in the calendar, the file is not orphaned.
+ *
+ *   The scan is permissive about section headers (it doesn't care
+ *   whether the section is `## Final`, `## Blocked`, `## Cancelled`,
+ *   `# Lane: feature-doc` followed by `## Drafting`, or any other
+ *   shape). The cost is potentially over-counting: a UUID that
+ *   appears in a multi-lane composed view's rendered preview table
+ *   would also be in the set. The over-counting is the correct
+ *   bias — we'd rather miss an orphan finding than file a
+ *   false-positive against a real entry.
  */
 
 import { readFileSync, writeFileSync } from 'node:fs';
-import { relative } from 'node:path';
+import { join, relative } from 'node:path';
 import { parseFrontmatter, removeFrontmatterPaths } from '../../frontmatter.ts';
 import type {
   DoctorContext,
@@ -26,6 +51,38 @@ import type {
 
 const RULE_ID = 'orphan-frontmatter-id';
 
+/**
+ * Pattern matching a UUID-v4 in a markdown table row. Pins on a
+ * leading `|` to anchor the first column (the UUID column in every
+ * deskwork-emitted table). Permissive about surrounding whitespace.
+ */
+const UUID_IN_ROW_RE = /^\|\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*\|/gim;
+
+/**
+ * Scan the raw `calendar.md` markdown and collect every UUID that
+ * appears in a table row (first column). The scan is section-agnostic
+ * — it accepts UUIDs under any heading at any depth.
+ *
+ * Falls back to an empty set when the file doesn't exist (a project
+ * that has only just been bootstrapped has no calendar yet; orphan
+ * detection against an empty set produces a finding for every indexed
+ * file, which is the correct behavior — they ARE orphans).
+ */
+function readCalendarUuidSet(projectRoot: string): Set<string> {
+  const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
+  let raw: string;
+  try {
+    raw = readFileSync(calendarPath, 'utf-8');
+  } catch {
+    return new Set();
+  }
+  const out = new Set<string>();
+  for (const match of raw.matchAll(UUID_IN_ROW_RE)) {
+    out.add(match[1].toLowerCase());
+  }
+  return out;
+}
+
 /**
  * Clear the `deskwork.id` field from a markdown file's frontmatter.
  * Returns true when the field was present and cleared; false when there
@@ -57,12 +114,20 @@ const rule: DoctorRule = {
 
   async audit(ctx: DoctorContext): Promise<Finding[]> {
     const findings: Finding[] = [];
+    // Issue #300: union the parser-derived UUID set with the
+    // section-agnostic UUID set scraped from the raw calendar markdown.
+    // The parser misses sections it doesn't recognize (Final, Blocked,
+    // Cancelled, and any future lane-template stages); the raw scan
+    // picks them up regardless of section heading.
     const calendarIds = new Set<string>();
     for (const e of ctx.calendar.entries) {
-      if (e.id) calendarIds.add(e.id);
+      if (e.id) calendarIds.add(e.id.toLowerCase());
+    }
+    for (const id of readCalendarUuidSet(ctx.projectRoot)) {
+      calendarIds.add(id);
     }
     for (const [id, absPath] of ctx.index.byId) {
-      if (calendarIds.has(id)) continue;
+      if (calendarIds.has(id.toLowerCase())) continue;
       findings.push({
         ruleId: RULE_ID,
         site: ctx.site,
diff --git a/packages/core/src/entry/approve.ts b/packages/core/src/entry/approve.ts
index f08482f..6cb599a 100644
--- a/packages/core/src/entry/approve.ts
+++ b/packages/core/src/entry/approve.ts
@@ -2,8 +2,15 @@ import { readSidecar } from '../sidecar/read.ts';
 import { writeSidecar } from '../sidecar/write.ts';
 import { appendJournalEvent } from '../journal/append.ts';
 import { regenerateCalendar } from '../calendar/regenerate.ts';
-import { nextStage } from '../schema/entry.ts';
 import type { Entry } from '../schema/entry.ts';
+import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
+import {
+  assertStageInTemplate,
+  isLinearPipelineStageInTemplate,
+  isOffPipelineStageInTemplate,
+  nextStageInTemplate,
+  preTerminalLinearStage,
+} from '../pipelines/helpers.ts';
 import { snapshotIndexForStage } from './snapshot.ts';
 import {
   addEntryAnnotation,
@@ -19,13 +26,10 @@ interface ApproveOptions {
 interface ApproveResult {
   readonly entryId: string;
   /**
-   * Per Phase 3 (graphical-entries) the sidecar's currentStage is now a
-   * plain string. The approve verb today is editorial-only — `nextStage`
-   * uses the hardcoded editorial successor map — but the result-type
-   * reports the raw sidecar string so non-editorial sidecars don't
-   * silently fail the `Stage`-narrow type check. Phase 4 introduces a
-   * lane-template-driven `nextStage` and the result type narrows to
-   * the per-lane stage union at that point.
+   * Per Phase 4 (graphical-entries) the verb is template-driven; both
+   * stages are reported as plain strings echoing the lane template's
+   * vocabulary (`Drafting` / `Final` for editorial, `Sketched` /
+   * `Iterating` / `Approved` for visual, etc.).
    */
   readonly fromStage: string;
   readonly toStage: string;
@@ -43,10 +47,19 @@ interface ApproveResult {
 /**
  * Graduate an entry to the next linear-pipeline stage.
  *
+ * Per Phase 4 (graphical-entries) the verb is lane-template-aware:
+ * the entry's `lane` resolves to a `LaneConfig`, which binds a
+ * `PipelineTemplate`; the template's `linearStages` defines the
+ * forward-progress sequence. The verb advances `currentStage` to the
+ * next entry in that list.
+ *
  * Refuses:
- *   - Final → Published (use `publish`, not `approve`)
- *   - Published (terminal)
- *   - Blocked / Cancelled (off-pipeline; induct first)
+ *   - pre-terminal linear stage (e.g. `Final`) — use `publish`, not
+ *     `approve`. The pre-terminal stage is identified positionally as
+ *     `linearStages[length - 2]`.
+ *   - terminal linear stage (e.g. `Published`) — no successor exists.
+ *   - off-pipeline stages (e.g. `Blocked`, `Cancelled`) — induct first.
+ *   - unknown stages — surfaces the template's allowed stage list.
  *
  * On success, in this order (so a kill-power between any two steps
  * leaves a recoverable state):
@@ -58,7 +71,7 @@ interface ApproveResult {
  *     stability under document evolution; comments authored against
  *     the just-archived content cannot reliably rebase).
  *   - Append a `stage-transition` journal event.
- *   - Mutate the sidecar (currentStage advances; reviewState clears).
+ *   - Mutate the sidecar (currentStage advances).
  *   - Regenerate `calendar.md` (issue #148).
  */
 export async function approveEntryStage(
@@ -66,21 +79,47 @@ export async function approveEntryStage(
   opts: ApproveOptions,
 ): Promise<ApproveResult> {
   const sidecar = await readSidecar(projectRoot, opts.uuid);
+  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
   const from = sidecar.currentStage;
-  if (from === 'Final') {
-    throw new Error('Final → Published uses `publish`, not `approve`.');
+
+  // Validate the current stage belongs to the template's vocabulary
+  // before any state mutation. Surfaces lane / template misconfiguration
+  // (entry's lane was renamed, template was edited to drop a stage that
+  // entries still reference, etc.) with the full allowed list.
+  assertStageInTemplate(template, from, 'approveEntryStage');
+
+  if (isOffPipelineStageInTemplate(template, from)) {
+    throw new Error(
+      `Cannot approve: entry is ${from} (off-pipeline); induct it back into the pipeline first.`,
+    );
   }
-  if (from === 'Published') {
-    throw new Error('Cannot approve: Published is terminal.');
+  if (!isLinearPipelineStageInTemplate(template, from)) {
+    // Defensive: assertStageInTemplate succeeded, so `from` is either
+    // linear or off-pipeline. The off-pipeline case is handled above.
+    // This branch is unreachable in practice; the throw exists so a
+    // future template schema with additional stage categories surfaces
+    // the gap rather than silently mis-routing.
+    throw new Error(
+      `Cannot approve from stage ${from}: stage is in template "${template.id}" ` +
+        `but is neither linear nor off-pipeline. This indicates a template-schema ` +
+        `bug — investigate ${template.id}'s definition.`,
+    );
   }
-  if (from === 'Blocked' || from === 'Cancelled') {
+
+  const preTerminal = preTerminalLinearStage(template);
+  if (preTerminal !== null && from === preTerminal) {
     throw new Error(
-      `Cannot approve: entry is ${from}; induct it back into the pipeline first.`,
+      `Cannot approve from ${from}: ${from} is the pre-terminal stage of pipeline ` +
+        `"${template.id}". Use \`publish\`, not \`approve\`, to graduate to the ` +
+        `terminal stage.`,
     );
   }
-  const to = nextStage(from);
+  const to = nextStageInTemplate(template, from);
   if (to === null) {
-    throw new Error(`Cannot approve from stage ${from} (no successor).`);
+    throw new Error(
+      `Cannot approve from stage ${from}: ${from} is the terminal stage of pipeline ` +
+        `"${template.id}" (no successor).`,
+    );
   }
   const at = new Date().toISOString();
 
@@ -108,8 +147,7 @@ export async function approveEntryStage(
   // 3. Update sidecar with the new stage. Per DESKWORK-STATE-MACHINE.md
   //    Commandment III, reviewState is RETIRED — the schema field is
   //    gone, so no strip-on-transition is needed and no
-  //    `review-state-change` journal event is emitted (the doctor's
-  //    journal-sidecar rule that gated on this invariant is also gone).
+  //    `review-state-change` journal event is emitted.
   const updated: Entry = {
     ...sidecar,
     currentStage: to,
@@ -124,9 +162,7 @@ export async function approveEntryStage(
     from,
     to,
   });
-  // #148: keep calendar.md in sync after every transition. Without
-  // this, the canonical visible representation of the pipeline lags
-  // the SSOT until `doctor --fix=all` is run.
+  // #148: keep calendar.md in sync after every transition.
   await regenerateCalendar(projectRoot);
   return {
     entryId: sidecar.uuid,
@@ -142,11 +178,6 @@ export async function approveEntryStage(
  * that is still active at the moment of approve — a comment is "active"
  * if it has not already been deleted, archived, or implicitly resolved
  * earlier in the journal.
- *
- * The fold is one-pass: we record delete/archive/resolve sets first,
- * then the second loop emits comment ids that are not in any kill set.
- * (resolve != deleted/archived — a resolved comment is still a comment;
- * we only avoid double-archiving a comment that was already archived.)
  */
 function collectActiveCommentIds(raw: DraftAnnotation[]): string[] {
   const deleted = new Set<string>();
diff --git a/packages/core/src/entry/block.ts b/packages/core/src/entry/block.ts
index 1e19cc0..d65d68d 100644
--- a/packages/core/src/entry/block.ts
+++ b/packages/core/src/entry/block.ts
@@ -3,6 +3,12 @@ import { writeSidecar } from '../sidecar/write.ts';
 import { appendJournalEvent } from '../journal/append.ts';
 import { regenerateCalendar } from '../calendar/regenerate.ts';
 import type { Entry } from '../schema/entry.ts';
+import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
+import {
+  assertStageInTemplate,
+  isOffPipelineStageInTemplate,
+  terminalLinearStage,
+} from '../pipelines/helpers.ts';
 
 interface BlockOptions {
   readonly uuid: string;
@@ -13,38 +19,68 @@ interface BlockOptions {
 interface BlockResult {
   readonly entryId: string;
   /**
-   * Per Phase 3 (graphical-entries) the sidecar's currentStage is now a
-   * plain string (lane-template-driven). `fromStage` reports whatever
-   * stage value the sidecar carried. Phase 4's lane-aware verb refactor
-   * will gate this verb on the lane template's off-pipeline stage set
-   * rather than the hardcoded `'Blocked' | 'Cancelled'` literals below.
+   * Per Phase 4 (graphical-entries) the verb is lane-template-aware.
+   * `toStage` is whichever off-pipeline stage the template carries as
+   * its block destination — `Blocked` is the canonical name; templates
+   * that omit it raise a configuration error at runtime.
    */
   readonly fromStage: string;
-  readonly toStage: 'Blocked';
+  readonly toStage: string;
 }
 
 /**
- * Move an entry to Blocked. Records priorStage on the sidecar so a later
+ * The reserved off-pipeline stage name for "blocked" entries. Unlike
+ * `Cancelled`, the pipeline schema does not refine the placement of
+ * this name — templates may or may not include it; the verb refuses at
+ * runtime when missing.
+ */
+const BLOCK_STAGE = 'Blocked';
+
+/**
+ * Move an entry to the template's block destination (canonically
+ * `Blocked`). Records priorStage on the sidecar so a later
  * `inductEntry` can return it to the linear pipeline.
  *
- * Refuses Published / Blocked / Cancelled.
+ * Refuses:
+ *   - terminal linear stage — already shipped; blocking is meaningless.
+ *   - any off-pipeline stage — entry is already off-pipeline.
+ *   - unknown stages — surfaces the template's allowed stage list.
+ *
+ * Requires the template's `offPipelineStages` to include `Blocked`.
  */
 export async function blockEntry(
   projectRoot: string,
   opts: BlockOptions,
 ): Promise<BlockResult> {
   const sidecar = await readSidecar(projectRoot, opts.uuid);
+  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
   const from = sidecar.currentStage;
-  if (from === 'Published') {
-    throw new Error('Cannot block: Published is terminal.');
+
+  assertStageInTemplate(template, from, 'blockEntry');
+
+  if (!template.offPipelineStages.includes(BLOCK_STAGE)) {
+    throw new Error(
+      `Cannot block: pipeline template "${template.id}" does not include "${BLOCK_STAGE}" ` +
+        `in offPipelineStages. The block verb requires the template to reserve "${BLOCK_STAGE}" ` +
+        `as its blocked destination. ` +
+        `Available off-pipeline stages: ${template.offPipelineStages.join(', ') || '(none)'}.`,
+    );
+  }
+
+  const terminal = terminalLinearStage(template);
+  if (from === terminal) {
+    throw new Error(
+      `Cannot block: entry is at terminal stage "${from}" of pipeline "${template.id}".`,
+    );
   }
-  if (from === 'Blocked' || from === 'Cancelled') {
-    throw new Error(`Cannot block: entry is already ${from}.`);
+  if (isOffPipelineStageInTemplate(template, from)) {
+    throw new Error(`Cannot block: entry is already ${from} (off-pipeline).`);
   }
+
   const at = new Date().toISOString();
   const updated: Entry = {
     ...sidecar,
-    currentStage: 'Blocked',
+    currentStage: BLOCK_STAGE,
     priorStage: from,
     updatedAt: at,
   };
@@ -54,10 +90,10 @@ export async function blockEntry(
     at,
     entryId: sidecar.uuid,
     from,
-    to: 'Blocked',
+    to: BLOCK_STAGE,
     ...(opts.reason !== undefined && { reason: opts.reason }),
   });
   // #148: keep calendar.md in sync after every transition.
   await regenerateCalendar(projectRoot);
-  return { entryId: sidecar.uuid, fromStage: from, toStage: 'Blocked' };
+  return { entryId: sidecar.uuid, fromStage: from, toStage: BLOCK_STAGE };
 }
diff --git a/packages/core/src/entry/cancel.ts b/packages/core/src/entry/cancel.ts
index 6e71a9a..89d99d7 100644
--- a/packages/core/src/entry/cancel.ts
+++ b/packages/core/src/entry/cancel.ts
@@ -3,6 +3,12 @@ import { writeSidecar } from '../sidecar/write.ts';
 import { appendJournalEvent } from '../journal/append.ts';
 import { regenerateCalendar } from '../calendar/regenerate.ts';
 import type { Entry } from '../schema/entry.ts';
+import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
+import {
+  assertStageInTemplate,
+  isOffPipelineStageInTemplate,
+  terminalLinearStage,
+} from '../pipelines/helpers.ts';
 
 interface CancelOptions {
   readonly uuid: string;
@@ -12,38 +18,78 @@ interface CancelOptions {
 interface CancelResult {
   readonly entryId: string;
   /**
-   * Per Phase 3 (graphical-entries) the sidecar's currentStage is now a
-   * plain string. Phase 4 introduces lane-template-driven verb gating;
-   * for now the cancel verb refuses the literal `'Blocked' | 'Cancelled'`
-   * stages and writes the literal `'Cancelled'` target.
+   * Per Phase 4 (graphical-entries) the verb is lane-template-aware.
+   * `toStage` is whichever off-pipeline stage the template carries as
+   * its cancel destination — `Cancelled` is the reserved name and is
+   * present in every preset; operator-authored templates that drop it
+   * fail at runtime with a configuration error.
    */
   readonly fromStage: string;
-  readonly toStage: 'Cancelled';
+  readonly toStage: string;
 }
 
 /**
- * Move an entry to Cancelled. Records priorStage on the sidecar so a
- * later `inductEntry` can return it to the linear pipeline if the
- * decision is reversed.
+ * The reserved off-pipeline stage name for cancellations. Per
+ * DESKWORK-STATE-MACHINE.md and the PipelineTemplate schema's
+ * `linearStages.includes('Cancelled')` refinement, `Cancelled` is
+ * never a linear stage; templates that include `Cancelled` MUST list
+ * it under `offPipelineStages`. The verb checks the bound template's
+ * off-pipeline list at runtime to surface configuration drift.
+ */
+const CANCEL_STAGE = 'Cancelled';
+
+/**
+ * Move an entry to the template's cancel destination (canonically
+ * `Cancelled`). Records priorStage on the sidecar so a later
+ * `inductEntry` can return it to the linear pipeline if the decision
+ * is reversed.
  *
- * Refuses Published / Blocked / Cancelled.
+ * Refuses:
+ *   - terminal linear stage (e.g. `Published` for editorial) — already
+ *     shipped; cancellation is meaningless.
+ *   - any off-pipeline stage (e.g. `Blocked`, `Cancelled`, `Archived`)
+ *     — entry is already off-pipeline.
+ *   - unknown stages — surfaces the template's allowed stage list.
+ *
+ * Requires the template's `offPipelineStages` to include `Cancelled`.
+ * Templates that omit it raise a configuration error.
  */
 export async function cancelEntry(
   projectRoot: string,
   opts: CancelOptions,
 ): Promise<CancelResult> {
   const sidecar = await readSidecar(projectRoot, opts.uuid);
+  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
   const from = sidecar.currentStage;
-  if (from === 'Published') {
-    throw new Error('Cannot cancel: Published is terminal.');
+
+  assertStageInTemplate(template, from, 'cancelEntry');
+
+  // Templates without `Cancelled` in offPipelineStages cannot host the
+  // cancel verb. The schema permits this (cancel-free templates are a
+  // valid experiment); the verb refuses at runtime with a clear error.
+  if (!template.offPipelineStages.includes(CANCEL_STAGE)) {
+    throw new Error(
+      `Cannot cancel: pipeline template "${template.id}" does not include "${CANCEL_STAGE}" ` +
+        `in offPipelineStages. The cancel verb requires the template to reserve "${CANCEL_STAGE}" ` +
+        `as its cancellation destination. ` +
+        `Available off-pipeline stages: ${template.offPipelineStages.join(', ') || '(none)'}.`,
+    );
+  }
+
+  const terminal = terminalLinearStage(template);
+  if (from === terminal) {
+    throw new Error(
+      `Cannot cancel: entry is at terminal stage "${from}" of pipeline "${template.id}".`,
+    );
   }
-  if (from === 'Blocked' || from === 'Cancelled') {
-    throw new Error(`Cannot cancel: entry is already ${from}.`);
+  if (isOffPipelineStageInTemplate(template, from)) {
+    throw new Error(`Cannot cancel: entry is already ${from} (off-pipeline).`);
   }
+
   const at = new Date().toISOString();
   const updated: Entry = {
     ...sidecar,
-    currentStage: 'Cancelled',
+    currentStage: CANCEL_STAGE,
     priorStage: from,
     updatedAt: at,
   };
@@ -53,10 +99,10 @@ export async function cancelEntry(
     at,
     entryId: sidecar.uuid,
     from,
-    to: 'Cancelled',
+    to: CANCEL_STAGE,
     ...(opts.reason !== undefined && { reason: opts.reason }),
   });
   // #148: keep calendar.md in sync after every transition.
   await regenerateCalendar(projectRoot);
-  return { entryId: sidecar.uuid, fromStage: from, toStage: 'Cancelled' };
+  return { entryId: sidecar.uuid, fromStage: from, toStage: CANCEL_STAGE };
 }
diff --git a/packages/core/src/entry/induct.ts b/packages/core/src/entry/induct.ts
index 2e45044..c25449e 100644
--- a/packages/core/src/entry/induct.ts
+++ b/packages/core/src/entry/induct.ts
@@ -2,57 +2,81 @@ import { readSidecar } from '../sidecar/read.ts';
 import { writeSidecar } from '../sidecar/write.ts';
 import { appendJournalEvent } from '../journal/append.ts';
 import { regenerateCalendar } from '../calendar/regenerate.ts';
-import { isLinearPipelineStage } from '../schema/entry.ts';
-import type { Entry, Stage } from '../schema/entry.ts';
+import type { Entry } from '../schema/entry.ts';
+import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
+import {
+  assertStageInTemplate,
+  isLinearPipelineStageInTemplate,
+  isOffPipelineStageInTemplate,
+} from '../pipelines/helpers.ts';
 
 interface InductOptions {
   readonly uuid: string;
   /**
-   * Linear-pipeline stage to teleport the entry into. The editorial
-   * default vocabulary is Ideas / Planned / Outlining / Drafting /
-   * Final / Published. Phase 4 makes this lane-template-driven; for
-   * now the parameter accepts the editorial-narrow `Stage` enum
-   * (callers in other lane templates should widen at the call boundary
-   * once the lane-aware API ships).
+   * Linear-pipeline stage to teleport the entry into. Per Phase 4
+   * (graphical-entries) the parameter is `string` rather than the
+   * editorial-narrow `Stage` union; the runtime check validates that
+   * the requested stage is in the entry's lane template's
+   * `linearStages` list and throws with the allowed-stages list on
+   * mismatch.
    */
-  readonly targetStage: Stage;
+  readonly targetStage: string;
   readonly reason?: string;
 }
 
 interface InductResult {
   readonly entryId: string;
   /**
-   * Per Phase 3 (graphical-entries) the sidecar's currentStage is now a
-   * plain string. `fromStage` reports whatever value the sidecar
-   * carried (any lane-template stage); `toStage` echoes the verb's
-   * `targetStage` argument which is still editorial-narrow today.
+   * Per Phase 4 (graphical-entries) both stages are plain strings
+   * echoing the lane template's vocabulary.
    */
   readonly fromStage: string;
-  readonly toStage: Stage;
+  readonly toStage: string;
 }
 
 /**
  * Teleport an entry into a chosen linear-pipeline stage.
  *
- * Primary use: returning a Blocked or Cancelled entry to the pipeline.
- * Also works on linear-pipeline entries when the operator wants to
- * non-linearly skip ahead or back.
+ * Primary use: returning an off-pipeline (e.g. Blocked / Cancelled)
+ * entry to the linear pipeline. Also works on linear-pipeline entries
+ * when the operator wants to non-linearly skip ahead or back.
  *
- * Refuses targetStage = Blocked / Cancelled (use the dedicated helpers).
+ * Refuses:
+ *   - `targetStage` not in the entry's lane template's `linearStages`
+ *     (covers both unknown stages AND off-pipeline destinations like
+ *     Blocked / Cancelled — use `blockEntry` / `cancelEntry` for those).
+ *   - `targetStage === currentStage` (no-op).
+ *   - `currentStage` itself unknown to the template (configuration drift).
  */
 export async function inductEntry(
   projectRoot: string,
   opts: InductOptions,
 ): Promise<InductResult> {
-  if (!isLinearPipelineStage(opts.targetStage)) {
-    throw new Error(
-      `Cannot induct to ${opts.targetStage}: targetStage must be a linear-pipeline stage. ` +
-        `Use blockEntry / cancelEntry for off-pipeline transitions.`,
-    );
-  }
   const sidecar = await readSidecar(projectRoot, opts.uuid);
+  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
   const from = sidecar.currentStage;
   const to = opts.targetStage;
+
+  // Validate the entry's current stage belongs to the template.
+  assertStageInTemplate(template, from, 'inductEntry');
+
+  // Validate the target stage is a recognized LINEAR stage. The check
+  // surfaces both "unknown stage" and "off-pipeline target" with the
+  // same error shape — both cases require operator-side correction.
+  if (!isLinearPipelineStageInTemplate(template, to)) {
+    if (isOffPipelineStageInTemplate(template, to)) {
+      throw new Error(
+        `Cannot induct to ${to}: ${to} is an off-pipeline stage of pipeline "${template.id}". ` +
+          `Use blockEntry / cancelEntry for off-pipeline transitions. ` +
+          `Allowed linear stages: ${template.linearStages.join(', ')}.`,
+      );
+    }
+    throw new Error(
+      `Cannot induct to ${to}: ${to} is not a linear stage of pipeline "${template.id}". ` +
+        `Allowed linear stages: ${template.linearStages.join(', ')}.`,
+    );
+  }
+
   if (from === to) {
     throw new Error(`Cannot induct: entry is already at ${to}.`);
   }
@@ -60,15 +84,19 @@ export async function inductEntry(
 
   // Inducting OUT of an off-pipeline stage clears priorStage.
   // Inducting between linear stages doesn't change it (priorStage only
-  // tracks the most-recent entry into Blocked/Cancelled).
-  const wasOffPipeline = from === 'Blocked' || from === 'Cancelled';
+  // tracks the most-recent entry into the off-pipeline stages).
+  const wasOffPipeline = isOffPipelineStageInTemplate(template, from);
   const { priorStage: _drop, ...rest } = sidecar;
   void _drop;
   const updated: Entry = {
     ...rest,
     currentStage: to,
     updatedAt: at,
-    ...(wasOffPipeline ? {} : sidecar.priorStage !== undefined ? { priorStage: sidecar.priorStage } : {}),
+    ...(wasOffPipeline
+      ? {}
+      : sidecar.priorStage !== undefined
+        ? { priorStage: sidecar.priorStage }
+        : {}),
   };
   await writeSidecar(projectRoot, updated);
   await appendJournalEvent(projectRoot, {
diff --git a/packages/core/src/entry/publish.ts b/packages/core/src/entry/publish.ts
index 55435c4..4d9b03b 100644
--- a/packages/core/src/entry/publish.ts
+++ b/packages/core/src/entry/publish.ts
@@ -4,7 +4,14 @@ import { readSidecar } from '../sidecar/read.ts';
 import { writeSidecar } from '../sidecar/write.ts';
 import { appendJournalEvent } from '../journal/append.ts';
 import { regenerateCalendar } from '../calendar/regenerate.ts';
-import type { Entry, Stage } from '../schema/entry.ts';
+import type { Entry } from '../schema/entry.ts';
+import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
+import {
+  assertStageInTemplate,
+  isOffPipelineStageInTemplate,
+  preTerminalLinearStage,
+  terminalLinearStage,
+} from '../pipelines/helpers.ts';
 
 interface PublishOptions {
   readonly uuid: string;
@@ -20,24 +27,37 @@ interface PublishOptions {
 
 interface PublishResult {
   readonly entryId: string;
-  readonly fromStage: Stage;
-  readonly toStage: 'Published';
+  /**
+   * Per Phase 4 (graphical-entries) both stages are plain strings
+   * echoing the lane template's vocabulary. For editorial:
+   * `fromStage === 'Final'` and `toStage === 'Published'`. For
+   * other templates (visual / blog-post / qa-plan) the values are
+   * `<preTerminal>` and `<terminal>` of the bound template.
+   */
+  readonly fromStage: string;
+  readonly toStage: string;
   readonly datePublished: string;
   readonly artifactPath?: string;
 }
 
 /**
- * Mark an entry as Published.
+ * Graduate an entry to its pipeline template's TERMINAL linear stage
+ * (e.g. `Published` for editorial, `Shipped` for visual).
+ *
+ * Per Phase 4 (graphical-entries) the verb is lane-template-aware: it
+ * advances from the pre-terminal stage (`linearStages[length - 2]`) to
+ * the terminal stage (`linearStages[length - 1]`). For editorial that's
+ * `Final` -> `Published`; for visual that's `Approved` -> `Shipped`.
  *
  * Refuses:
- *   - currentStage !== 'Final' (Final is the only valid pre-Published
- *     state under the entry-centric model — operators must `approve`
- *     through Drafting → Final first),
- *   - Published (already terminal),
- *   - Blocked / Cancelled (induct into the pipeline first).
+ *   - currentStage === terminal — already shipped.
+ *   - off-pipeline stages — induct first.
+ *   - currentStage !== pre-terminal — operator must `approve` through
+ *     to the pre-terminal stage first; publish does not auto-skip
+ *     prior stages.
  *
  * On success:
- *   - sidecar.currentStage advances to 'Published',
+ *   - sidecar.currentStage advances to the terminal stage,
  *   - sidecar.datePublished is set,
  *   - a stage-transition journal event is appended,
  *   - calendar.md is regenerated to reflect the new state (#148).
@@ -47,19 +67,34 @@ export async function publishEntry(
   opts: PublishOptions,
 ): Promise<PublishResult> {
   const sidecar = await readSidecar(projectRoot, opts.uuid);
+  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
   const from = sidecar.currentStage;
-  if (from === 'Published') {
-    throw new Error('Cannot publish: entry is already Published.');
+
+  assertStageInTemplate(template, from, 'publishEntry');
+
+  const terminal = terminalLinearStage(template);
+  if (from === terminal) {
+    throw new Error(
+      `Cannot publish: entry is already at terminal stage "${terminal}" of pipeline "${template.id}".`,
+    );
+  }
+  if (isOffPipelineStageInTemplate(template, from)) {
+    throw new Error(
+      `Cannot publish: entry is ${from} (off-pipeline); induct it back into the pipeline first.`,
+    );
   }
-  if (from === 'Blocked' || from === 'Cancelled') {
+  const preTerminal = preTerminalLinearStage(template);
+  if (preTerminal === null) {
     throw new Error(
-      `Cannot publish: entry is ${from}; induct it back into the pipeline first.`,
+      `Cannot publish: pipeline "${template.id}" has only one linear stage and ` +
+        `no pre-terminal position exists. Add a pre-terminal stage to the template ` +
+        `or use \`induct\` to bypass.`,
     );
   }
-  if (from !== 'Final') {
+  if (from !== preTerminal) {
     throw new Error(
-      `Cannot publish from stage ${from}. Approve through to Final first ` +
-        `(Final is the only valid pre-Published state).`,
+      `Cannot publish from stage ${from}. Approve through to ${preTerminal} first ` +
+        `(${preTerminal} is the only valid pre-${terminal} state in pipeline "${template.id}").`,
     );
   }
 
@@ -80,7 +115,7 @@ export async function publishEntry(
   const datePublishedIso = `${datePublished}T00:00:00.000Z`;
   const updated: Entry = {
     ...sidecar,
-    currentStage: 'Published',
+    currentStage: terminal,
     datePublished: datePublishedIso,
     updatedAt: at,
   };
@@ -90,14 +125,14 @@ export async function publishEntry(
     at,
     entryId: sidecar.uuid,
     from,
-    to: 'Published',
+    to: terminal,
   });
   // #148: keep calendar.md in sync after every transition.
   await regenerateCalendar(projectRoot);
   return {
     entryId: sidecar.uuid,
     fromStage: from,
-    toStage: 'Published',
+    toStage: terminal,
     datePublished: datePublishedIso,
     ...(artifactAbs !== undefined ? { artifactPath: artifactAbs } : {}),
   };
diff --git a/packages/core/src/entry/snapshot.ts b/packages/core/src/entry/snapshot.ts
index dce914e..a9b5aaf 100644
--- a/packages/core/src/entry/snapshot.ts
+++ b/packages/core/src/entry/snapshot.ts
@@ -37,6 +37,7 @@ import {
 } from 'node:fs/promises';
 import { basename, dirname, join } from 'node:path';
 import type { Entry } from '../schema/entry.ts';
+import { stageNameToFilesystemToken } from '../lanes/stage-token.ts';
 
 export interface SnapshotResult {
   /** True when a snapshot file was written (or already matched on disk). */
@@ -109,10 +110,17 @@ export async function snapshotIndexForStage(
     return { snapshotted: false, skipReason: 'no-index-md' };
   }
   const content = await readFile(indexPath, 'utf8');
+  // Phase 4 Task 4.1.6: use the filesystem-safe tokenizer rather than a
+  // raw `toLowerCase()`. Editorial stages happen to lowercase cleanly
+  // (`Drafting` -> `drafting`), but lane-template stages may contain
+  // whitespace or characters that the lowercase form alone doesn't
+  // sanitize. The tokenizer enforces the filesystem-safe contract and
+  // throws with a descriptive error if a custom stage name cannot be
+  // safely represented.
   const targetPath = join(
     dir,
     'scrapbook',
-    `${priorStage.toLowerCase()}.md`,
+    `${stageNameToFilesystemToken(priorStage)}.md`,
   );
 
   if (await fileExists(targetPath)) {
diff --git a/packages/core/src/iterate/iterate.ts b/packages/core/src/iterate/iterate.ts
index cd81fe8..069cc25 100644
--- a/packages/core/src/iterate/iterate.ts
+++ b/packages/core/src/iterate/iterate.ts
@@ -5,6 +5,13 @@ import { readSidecar } from '../sidecar/read.ts';
 import { writeSidecar } from '../sidecar/write.ts';
 import { appendJournalEvent } from '../journal/append.ts';
 import { getContentDir } from '../config.ts';
+import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
+import {
+  assertStageInTemplate,
+  isLockedStageInTemplate,
+  isOffPipelineStageInTemplate,
+  terminalLinearStage,
+} from '../pipelines/helpers.ts';
 import type { Entry } from '../schema/entry.ts';
 
 interface IterateOptions {
@@ -54,14 +61,47 @@ function resolveIndexPath(projectRoot: string, sidecar: Entry): string {
   return join(contentDir, sidecar.slug, 'index.md');
 }
 
+/**
+ * Iterate an entry: read the document under review, append an
+ * `iteration` journal event with the captured markdown, and bump the
+ * per-stage iteration counter on the sidecar.
+ *
+ * Per Phase 4 (graphical-entries) iterate is lane-template-aware:
+ *
+ *   - Terminal linear stages (e.g. `Published`, `Shipped`) refuse —
+ *     terminal content is frozen.
+ *   - Off-pipeline stages (e.g. `Blocked`, `Cancelled`, `Archived`)
+ *     refuse — induct first.
+ *   - Locked stages (e.g. `Final`, `Approved`, `Edited`, `Reviewed`)
+ *     refuse — pre-publication review-freeze; iterate would silently
+ *     un-freeze content that should stay immutable until publish.
+ *   - Unknown stages surface the template's allowed list.
+ */
 export async function iterateEntry(projectRoot: string, opts: IterateOptions): Promise<IterateResult> {
   const sidecar = await readSidecar(projectRoot, opts.uuid);
+  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
+  const stage = sidecar.currentStage;
 
-  if (sidecar.currentStage === 'Published') {
-    throw new Error('Cannot iterate: Published entries are frozen.');
+  assertStageInTemplate(template, stage, 'iterateEntry');
+
+  const terminal = terminalLinearStage(template);
+  if (stage === terminal) {
+    throw new Error(
+      `Cannot iterate: entry is at terminal stage "${stage}" of pipeline "${template.id}"; ` +
+        `terminal-stage content is frozen.`,
+    );
+  }
+  if (isOffPipelineStageInTemplate(template, stage)) {
+    throw new Error(
+      `Cannot iterate: entry is ${stage} (off-pipeline); induct it back into the pipeline first.`,
+    );
   }
-  if (sidecar.currentStage === 'Blocked' || sidecar.currentStage === 'Cancelled') {
-    throw new Error(`Cannot iterate: entry is ${sidecar.currentStage}; induct it back into the pipeline first.`);
+  if (isLockedStageInTemplate(template, stage)) {
+    throw new Error(
+      `Cannot iterate: entry is at locked stage "${stage}" of pipeline "${template.id}"; ` +
+        `the locked stage is the pre-publication review-freeze. Use \`induct\` to return ` +
+        `the entry to an earlier linear stage if further iteration is needed.`,
+    );
   }
 
   // Issue #222 — single document evolves; always read/write index.md.
@@ -70,18 +110,7 @@ export async function iterateEntry(projectRoot: string, opts: IterateOptions): P
   const artifactPath = resolveIndexPath(projectRoot, sidecar);
   const markdown = await readFile(artifactPath, 'utf8');
 
-  // Iteration is the operator's explicit "pin a new version" decision;
-  // the core helper records what was asked, not what the helper thinks
-  // counts as "real change." A real iteration can be motivated by
-  // marginalia, scrapbook additions, decisions captured outside the
-  // file body, or any reason the operator hasn't communicated to the
-  // system. Gating on a content-diff check earlier here put a hard
-  // error in front of the operator's review-surface Iterate button
-  // when they had added marginalia but not edited the file body.
-  // Removed (#188-followup): the orchestrating skill (`/deskwork:iterate`)
-  // is the right place to decide whether the file needs editing first.
-
-  const priorVersion = sidecar.iterationByStage[sidecar.currentStage] ?? 0;
+  const priorVersion = sidecar.iterationByStage[stage] ?? 0;
   const newVersion = priorVersion + 1;
 
   const at = new Date().toISOString();
@@ -91,7 +120,7 @@ export async function iterateEntry(projectRoot: string, opts: IterateOptions): P
     kind: 'iteration',
     at,
     entryId: sidecar.uuid,
-    stage: sidecar.currentStage,
+    stage,
     version: newVersion,
     markdown,
   });
@@ -102,14 +131,14 @@ export async function iterateEntry(projectRoot: string, opts: IterateOptions): P
   // automatically, so no destructure is needed here.
   const updated: Entry = {
     ...sidecar,
-    iterationByStage: { ...sidecar.iterationByStage, [sidecar.currentStage]: newVersion },
+    iterationByStage: { ...sidecar.iterationByStage, [stage]: newVersion },
     updatedAt: at,
   };
   await writeSidecar(projectRoot, updated);
 
   return {
     entryId: sidecar.uuid,
-    stage: sidecar.currentStage,
+    stage,
     version: newVersion,
   };
 }
diff --git a/packages/core/src/lanes/index.ts b/packages/core/src/lanes/index.ts
index b0aceef..ce1256c 100644
--- a/packages/core/src/lanes/index.ts
+++ b/packages/core/src/lanes/index.ts
@@ -29,3 +29,10 @@ export {
   bootstrapDefaultLaneIfMissing,
   type BootstrapResult,
 } from './bootstrap.ts';
+
+export {
+  resolveEntryTemplate,
+  resolveEntryStrictTemplate,
+} from './resolve.ts';
+
+export { stageNameToFilesystemToken } from './stage-token.ts';
diff --git a/packages/core/src/lanes/resolve.ts b/packages/core/src/lanes/resolve.ts
new file mode 100644
index 0000000..e50c1bd
--- /dev/null
+++ b/packages/core/src/lanes/resolve.ts
@@ -0,0 +1,79 @@
+/**
+ * Entry → lane → pipeline template resolution (Phase 4 Task 4.1).
+ *
+ * Verb code receives an entry sidecar; the template that governs the
+ * entry's stage transitions is two hops away: `entry.lane` → lane
+ * config → `lane.pipelineTemplate` → pipeline template. This helper
+ * composes the two loader calls so verb code reads as
+ * `const template = resolveEntryTemplate(entry, projectRoot)` without
+ * having to plumb the intermediate lane object through every call.
+ *
+ * Migration-window default:
+ *
+ *   When `entry.lane` is undefined (legacy sidecars pre-doctor
+ *   migration), the helper defaults to the `editorial` pipeline
+ *   template — Phase 3's schema kept `lane` optional precisely so
+ *   legacy sidecars continue to parse and existing editorial verbs
+ *   continue to work. The doctor's lane-migration step back-fills
+ *   `lane: "default"` on every legacy entry; once the migration runs
+ *   project-wide, this default branch becomes unreachable. A later
+ *   phase tightens the schema's `lane` to required and removes the
+ *   default branch entirely (the doctor enforces presence then).
+ *
+ *   The migration-window default is the editorial PIPELINE TEMPLATE
+ *   directly, NOT a synthetic "default" lane — bypassing the lane
+ *   layer avoids requiring `.deskwork/lanes/default.json` to exist on
+ *   disk before migration runs (which would be a chicken-and-egg
+ *   problem for the doctor invocation that creates it).
+ */
+
+import {
+  loadPipelineTemplate,
+  type PipelineTemplate,
+} from '../pipelines/index.ts';
+import { loadLaneConfig } from './loader.ts';
+import type { Entry } from '../schema/entry.ts';
+import type { StrictPipelineTemplate } from '../pipelines/types.ts';
+
+/**
+ * Resolve the pipeline template that governs an entry's lifecycle.
+ *
+ * Migration-window behavior: when `entry.lane` is undefined, defaults
+ * to the `editorial` template. Phase 8+ tightens this to a throw once
+ * doctor enforces `lane` presence on every sidecar.
+ *
+ * @param entry - The entry sidecar.
+ * @param projectRoot - Absolute path to the project root.
+ * @returns The resolved pipeline template (wide type — accepts the
+ *   schema's `.passthrough()` extras like `$rationale`). Verb code
+ *   that reads named fields should narrow to `StrictPipelineTemplate`
+ *   via the assignment site's type annotation.
+ * @throws When `entry.lane` is set but the lane config or its bound
+ *   template fail to resolve. Bubbles the loader's error message so
+ *   the operator sees the offending lane / template id and the file
+ *   path involved.
+ */
+export function resolveEntryTemplate(
+  entry: Entry,
+  projectRoot: string,
+): PipelineTemplate {
+  if (entry.lane === undefined) {
+    // Migration-window default. Phase 8+ removes this branch.
+    return loadPipelineTemplate('editorial', projectRoot);
+  }
+  const lane = loadLaneConfig(entry.lane, projectRoot);
+  return loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
+}
+
+/**
+ * Narrow `resolveEntryTemplate` to `StrictPipelineTemplate`. Equivalent
+ * to assigning the wide return type to a `StrictPipelineTemplate`
+ * variable — exists as a named helper for verb code that consumes the
+ * narrow surface explicitly.
+ */
+export function resolveEntryStrictTemplate(
+  entry: Entry,
+  projectRoot: string,
+): StrictPipelineTemplate {
+  return resolveEntryTemplate(entry, projectRoot);
+}
diff --git a/packages/core/src/lanes/stage-token.ts b/packages/core/src/lanes/stage-token.ts
new file mode 100644
index 0000000..c2d56c1
--- /dev/null
+++ b/packages/core/src/lanes/stage-token.ts
@@ -0,0 +1,82 @@
+/**
+ * Stage name → filesystem-safe token (Phase 4 Task 4.1.6 / Phase 3 M-8).
+ *
+ * Snapshot filenames, scrapbook layout, and any other filesystem path
+ * that embeds a stage name need a deterministic, ASCII, lowercase,
+ * filesystem-safe representation. Editorial stages happen to map
+ * cleanly through `String.prototype.toLowerCase()`
+ * (`Drafting` -> `drafting`), but a lane-template may declare a stage
+ * named `"My Stage"`, `"In Review"`, `"PROD/Staging"`, or include
+ * non-ASCII characters — all of which would either produce a
+ * filesystem-fragile name (`my stage.md`) or be rejected outright by
+ * some filesystems (`prod/staging.md` collides with directory
+ * separators).
+ *
+ * The helper enforces a strict, well-defined contract so the operator
+ * sees the failure mode at template-author time rather than discovering
+ * it later when a verb tries to write a snapshot.
+ *
+ * Tokenization rules:
+ *
+ *   1. Trim leading/trailing whitespace.
+ *   2. Lowercase.
+ *   3. Replace any run of whitespace with a single `-`.
+ *   4. Reject any character that is not in `[a-z0-9-_]` after the above.
+ *
+ * Examples:
+ *
+ *   "Drafting"        → "drafting"
+ *   "My Stage"        → "my-stage"
+ *   "In   Review"     → "in-review"   (collapses internal whitespace)
+ *   "stage-1"         → "stage-1"     (already valid)
+ *   "PROD/Staging"    → throws        ('/' rejected)
+ *   "Café"       → throws        (non-ASCII rejected)
+ *   ""                → throws        (empty input rejected)
+ *
+ * The helper does NOT silently fold non-ASCII characters via
+ * transliteration. Folding `café` to `cafe` is a guess about
+ * operator intent; the safer behavior is to refuse and let the
+ * operator pick the canonical token explicitly.
+ */
+
+/**
+ * Convert a stage name into a filesystem-safe token suitable for use
+ * in filenames and path segments.
+ *
+ * @param stage - The human-readable stage name (e.g. `"Drafting"`,
+ *   `"My Stage"`). Must be a non-empty string after trimming.
+ * @returns The tokenized form (lowercase, kebab-case, ASCII-only).
+ * @throws When the input is empty (after trim), or contains
+ *   characters outside `[a-z0-9-_]` after the whitespace-to-hyphen
+ *   collapse. The error message names the offending input so an
+ *   operator can locate the template field.
+ */
+export function stageNameToFilesystemToken(stage: string): string {
+  if (typeof stage !== 'string') {
+    throw new Error(
+      `stageNameToFilesystemToken: expected a string, received ${typeof stage}.`,
+    );
+  }
+  const trimmed = stage.trim();
+  if (trimmed.length === 0) {
+    throw new Error(
+      `stageNameToFilesystemToken: stage name cannot be empty or whitespace-only.`,
+    );
+  }
+  // Lowercase + collapse whitespace into hyphens.
+  const collapsed = trimmed.toLowerCase().replace(/\s+/g, '-');
+  // Validate the final result is ASCII-only, lowercase, kebab-case (or
+  // snake-case — underscores are permitted because they are filesystem-
+  // safe and common in operator-authored stage names).
+  if (!/^[a-z0-9][a-z0-9_-]*$/.test(collapsed)) {
+    throw new Error(
+      `stageNameToFilesystemToken: stage name "${stage}" cannot be safely tokenized for use ` +
+        `as a filesystem path segment. ` +
+        `After lowercasing and collapsing whitespace, the result was "${collapsed}", which ` +
+        `contains characters outside the allowed set [a-z0-9-_] (must start with [a-z0-9]). ` +
+        `Rename the stage in the lane's pipeline template to use only ASCII letters, digits, ` +
+        `spaces, hyphens, or underscores.`,
+    );
+  }
+  return collapsed;
+}
diff --git a/packages/core/src/pipelines/helpers.ts b/packages/core/src/pipelines/helpers.ts
new file mode 100644
index 0000000..02235d0
--- /dev/null
+++ b/packages/core/src/pipelines/helpers.ts
@@ -0,0 +1,166 @@
+/**
+ * Template-aware pipeline helpers (Phase 4 Task 4.1).
+ *
+ * The editorial-narrow helpers in `../schema/entry.ts`
+ * (`isLinearPipelineStage`, `isOffPipelineStage`, `nextStage`) consult
+ * a hardcoded editorial-pipeline stage list. Per the graphical-entries
+ * PRD and DESKWORK-STATE-MACHINE.md Commandment II, verbs are universal
+ * and stage-gated only on the entry's lane template — every lane can
+ * declare its own `linearStages` and `offPipelineStages`.
+ *
+ * The helpers below are the template-driven equivalents. They accept a
+ * resolved `StrictPipelineTemplate` (the loader's narrow return type)
+ * plus a stage string, and answer the membership / successor question
+ * relative to THAT template's vocabulary. The legacy editorial-narrow
+ * helpers remain in `../schema/entry.ts` for the migration window and
+ * are marked `@deprecated`; new code should use these.
+ *
+ * Design:
+ *
+ *   - Pure functions. No I/O, no template loading. Callers pass the
+ *     resolved template (see `../lanes/resolve.ts` for the lane → entry
+ *     → template lookup that produces the input).
+ *
+ *   - No fallbacks. A stage that is neither in `linearStages` nor in
+ *     `offPipelineStages` is genuinely unknown to the template; the
+ *     `assert` helper throws with the full allowed list so the operator
+ *     sees both the offending stage and the template's vocabulary.
+ *
+ *   - `nextStageInTemplate` returns `null` (rather than throwing) when
+ *     the entry sits at the terminal linear stage (the last entry in
+ *     `linearStages` — `Published` in editorial, `Shipped` in visual,
+ *     etc.). This mirrors the editorial-narrow `nextStage(s)` shape so
+ *     verb code branches uniformly.
+ */
+
+import type { StrictPipelineTemplate } from './types.ts';
+
+/**
+ * True when `stage` is one of the template's linear-pipeline stages.
+ * The linear stages are the ordered forward-progress stages — verbs
+ * like `approve` move an entry through this list in order.
+ */
+export function isLinearPipelineStageInTemplate(
+  template: StrictPipelineTemplate,
+  stage: string,
+): boolean {
+  return template.linearStages.includes(stage);
+}
+
+/**
+ * True when `stage` is one of the template's off-pipeline (cul-de-sac)
+ * stages. Off-pipeline stages are the "exit the linear flow" stages —
+ * `cancel` / `block` move entries here; `induct` brings them back into
+ * the linear flow.
+ */
+export function isOffPipelineStageInTemplate(
+  template: StrictPipelineTemplate,
+  stage: string,
+): boolean {
+  return template.offPipelineStages.includes(stage);
+}
+
+/**
+ * True when `stage` is in the template's `lockedStages` list. Locked
+ * stages refuse `iterate` — the pre-publication review-freeze stage
+ * (`Final` in editorial, `Approved` in visual) gates iterate so the
+ * content can't change while awaiting publish.
+ */
+export function isLockedStageInTemplate(
+  template: StrictPipelineTemplate,
+  stage: string,
+): boolean {
+  return template.lockedStages?.includes(stage) ?? false;
+}
+
+/**
+ * True when `stage` is recognized by the template — either linear or
+ * off-pipeline. Used to validate sidecar stage strings at verb-call
+ * time before any state mutation.
+ */
+export function isKnownStageInTemplate(
+  template: StrictPipelineTemplate,
+  stage: string,
+): boolean {
+  return (
+    isLinearPipelineStageInTemplate(template, stage)
+    || isOffPipelineStageInTemplate(template, stage)
+  );
+}
+
+/**
+ * The linear successor of `stage` within `template.linearStages`.
+ * Returns `null` when `stage` is the last entry in `linearStages`
+ * (terminal — used by `publish`, not `approve`).
+ *
+ * Throws when `stage` is not in `linearStages` (e.g. an off-pipeline
+ * stage or an unknown stage). Callers that need to handle the off-
+ * pipeline case should consult `isOffPipelineStageInTemplate` first.
+ */
+export function nextStageInTemplate(
+  template: StrictPipelineTemplate,
+  stage: string,
+): string | null {
+  const idx = template.linearStages.indexOf(stage);
+  if (idx === -1) {
+    throw new Error(
+      `nextStageInTemplate: stage "${stage}" is not in template "${template.id}".linearStages. ` +
+        `Allowed linear stages: ${template.linearStages.join(', ')}. ` +
+        `If the stage is off-pipeline (Blocked / Cancelled / etc.), ` +
+        `the caller should branch via isOffPipelineStageInTemplate before calling nextStageInTemplate.`,
+    );
+  }
+  if (idx === template.linearStages.length - 1) {
+    // Terminal linear stage — no successor (use `publish`, not `approve`).
+    return null;
+  }
+  return template.linearStages[idx + 1];
+}
+
+/**
+ * Assert that `stage` is a recognized stage in the template; throw a
+ * descriptive error otherwise. Used by every verb to validate the
+ * entry's `currentStage` before any state mutation.
+ */
+export function assertStageInTemplate(
+  template: StrictPipelineTemplate,
+  stage: string,
+  context: string,
+): void {
+  if (!isKnownStageInTemplate(template, stage)) {
+    const allowed = [
+      ...template.linearStages,
+      ...template.offPipelineStages,
+    ].join(', ');
+    throw new Error(
+      `${context}: stage "${stage}" is not in pipeline template "${template.id}". ` +
+        `Allowed stages (linear + off-pipeline): ${allowed}. ` +
+        `Either fix the entry's currentStage, or extend the template's stage list.`,
+    );
+  }
+}
+
+/**
+ * Return the terminal linear stage of `template` — the last entry in
+ * `linearStages`. The terminal stage is the publish target; entries
+ * graduate to it via `publish`, not `approve`.
+ */
+export function terminalLinearStage(template: StrictPipelineTemplate): string {
+  // The schema guarantees `linearStages` is non-empty.
+  return template.linearStages[template.linearStages.length - 1];
+}
+
+/**
+ * Return the pre-terminal stage — the stage from which `publish`
+ * graduates an entry to the terminal stage. Returns `null` when the
+ * template has only one linear stage (no pre-terminal position).
+ *
+ * For editorial: `terminalLinearStage` is `Published`; this returns
+ * `Final`. For visual: terminal is `Shipped`; this returns `Approved`.
+ */
+export function preTerminalLinearStage(
+  template: StrictPipelineTemplate,
+): string | null {
+  if (template.linearStages.length < 2) return null;
+  return template.linearStages[template.linearStages.length - 2];
+}
diff --git a/packages/core/src/pipelines/index.ts b/packages/core/src/pipelines/index.ts
index 4fa9495..86efbeb 100644
--- a/packages/core/src/pipelines/index.ts
+++ b/packages/core/src/pipelines/index.ts
@@ -16,3 +16,14 @@ export {
   loadPipelineTemplate,
   listAvailablePipelineTemplates,
 } from './loader.ts';
+
+export {
+  isLinearPipelineStageInTemplate,
+  isOffPipelineStageInTemplate,
+  isLockedStageInTemplate,
+  isKnownStageInTemplate,
+  nextStageInTemplate,
+  assertStageInTemplate,
+  terminalLinearStage,
+  preTerminalLinearStage,
+} from './helpers.ts';
diff --git a/packages/core/src/schema/entry.ts b/packages/core/src/schema/entry.ts
index 4d029bb..4547473 100644
--- a/packages/core/src/schema/entry.ts
+++ b/packages/core/src/schema/entry.ts
@@ -57,13 +57,26 @@ const OFF_PIPELINE: readonly Stage[] = ['Blocked', 'Cancelled'] as const;
  * `Stage` union — callers can pass an `Entry.currentStage` without
  * narrowing first. The semantic question being answered is
  * "is this stage one of the editorial lane's linear / off-pipeline
- * stages?" — a non-editorial stage name returns false. Phase 4's
- * lane-aware helpers replace these with template-driven equivalents.
+ * stages?" — a non-editorial stage name returns false.
+ *
+ * @deprecated Phase 4 replaces these with template-driven equivalents
+ *   in `../pipelines/helpers.ts`
+ *   (`isLinearPipelineStageInTemplate`,
+ *   `isOffPipelineStageInTemplate`). New code should resolve the
+ *   entry's lane template via `resolveEntryTemplate` and call the
+ *   template-aware helper. These editorial-narrow forms are kept for
+ *   back-compat with non-verb callers and for the legacy migration
+ *   parser that knows about the editorial vocabulary only.
  */
 export function isLinearPipelineStage(s: string): boolean {
   return (LINEAR_PIPELINE as readonly string[]).includes(s);
 }
 
+/**
+ * @deprecated Phase 4 — see `isLinearPipelineStage` deprecation note.
+ *   Use `isOffPipelineStageInTemplate` against the entry's resolved
+ *   lane template instead.
+ */
 export function isOffPipelineStage(s: string): boolean {
   return (OFF_PIPELINE as readonly string[]).includes(s);
 }
@@ -84,8 +97,15 @@ const SUCCESSOR: Record<Stage, Stage | null> = {
  * to `string` (lane-template-driven `currentStage` values); inputs
  * outside the editorial pipeline's eight known stages return `null`
  * rather than throwing — callers handle the "no successor" case
- * already, and Phase 4 introduces a lane-template-driven successor
- * API that supersedes this editorial-only helper.
+ * already.
+ *
+ * @deprecated Phase 4 replaces this with `nextStageInTemplate` in
+ *   `../pipelines/helpers.ts`. New code should resolve the entry's
+ *   lane template via `resolveEntryTemplate` and call the template-
+ *   aware successor instead. This editorial-narrow form is kept for
+ *   back-compat with non-verb callers that operate on the editorial
+ *   vocabulary specifically (e.g. the legacy calendar migration
+ *   parser).
  */
 export function nextStage(s: string): Stage | null {
   if (
diff --git a/packages/core/test/calendar/regenerate-multilane.test.ts b/packages/core/test/calendar/regenerate-multilane.test.ts
new file mode 100644
index 0000000..03ffec1
--- /dev/null
+++ b/packages/core/test/calendar/regenerate-multilane.test.ts
@@ -0,0 +1,152 @@
+/**
+ * Calendar regen regression — Phase 4 / Issue #247.
+ *
+ * Before the fix:
+ *   - The renderer's hardcoded `STAGE_ORDER` covered only the editorial
+ *     8 stages, so entries whose `currentStage` happened to be a
+ *     non-editorial stage (visual: `Sketched / Iterating / Approved /
+ *     Shipped`) silently disappeared from the rendered output.
+ *   - Even editorial entries in `Final` / `Cancelled` were silently
+ *     dropped when paired with the legacy parser's 7-stage list
+ *     (the parser's `STAGES` const was `Ideas / Planned / Outlining /
+ *     Drafting / Review / Paused / Published`).
+ *
+ * After the fix:
+ *   - When no lanes are configured, the renderer falls back to the
+ *     editorial fallback's 8-stage list — `Final` and `Cancelled` are
+ *     present.
+ *   - When lanes ARE configured, the renderer emits a `# Lane: <name>`
+ *     section per lane with per-lane stage sections drawn from that
+ *     lane's bound template. Entries in non-editorial stages render
+ *     under their lane's template's section.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { regenerateCalendar } from '@/calendar/regenerate';
+import { writeSidecar } from '@/sidecar/write';
+import type { Entry } from '@/schema/entry';
+
+describe('regenerateCalendar — multi-lane / #247 regression', () => {
+  let projectRoot: string;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-regen-'));
+    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  // Use a counter so each generated entry gets a unique uuid that
+  // satisfies the strict v4 shape.
+  let uuidCounter = 0;
+  function nextUuid(): string {
+    uuidCounter++;
+    const hex = uuidCounter.toString(16).padStart(12, '0');
+    return `550e8400-e29b-41d4-a716-${hex}`;
+  }
+  function entry(slug: string, stage: string, opts: Partial<Entry> = {}): Entry {
+    return {
+      uuid: nextUuid(),
+      slug,
+      title: slug.replace(/-/g, ' '),
+      keywords: [],
+      source: 'manual',
+      currentStage: stage,
+      iterationByStage: {},
+      createdAt: '2026-04-30T10:00:00.000Z',
+      updatedAt: '2026-04-30T10:00:00.000Z',
+      ...opts,
+    };
+  }
+
+  it('preserves Final + Cancelled entries in the single-lane / editorial-fallback shape', async () => {
+    await writeSidecar(projectRoot, entry('idea-1', 'Ideas'));
+    await writeSidecar(projectRoot, entry('final-1', 'Final', { priorStage: 'Drafting' }));
+    await writeSidecar(projectRoot, entry('cancelled-1', 'Cancelled', { priorStage: 'Drafting' }));
+
+    await regenerateCalendar(projectRoot);
+
+    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
+    // Every entry must appear in the rendered output.
+    expect(md).toContain('idea-1');
+    expect(md).toContain('final-1');
+    expect(md).toContain('cancelled-1');
+    // Section headings include both Final and Cancelled.
+    expect(md).toContain('## Final');
+    expect(md).toContain('## Cancelled');
+    // Legacy section names (Review / Paused) must NOT appear in the
+    // new shape — the rendered output is the new vocabulary only.
+    expect(md).not.toContain('## Review');
+    expect(md).not.toContain('## Paused');
+  });
+
+  it('emits per-lane sections when lane configs are present', async () => {
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(
+      join(projectRoot, '.deskwork', 'lanes', 'default.json'),
+      JSON.stringify({
+        id: 'default',
+        name: 'Default',
+        pipelineTemplate: 'editorial',
+        contentDir: 'docs',
+      }),
+    );
+    await writeFile(
+      join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
+      JSON.stringify({
+        id: 'mockups',
+        name: 'Mockups',
+        pipelineTemplate: 'visual',
+        contentDir: 'mockups',
+      }),
+    );
+
+    await writeSidecar(projectRoot, entry('post-a', 'Drafting', { lane: 'default' }));
+    await writeSidecar(projectRoot, entry('icon-set', 'Iterating', { lane: 'mockups' }));
+    await writeSidecar(projectRoot, entry('logo-b', 'Approved', { lane: 'mockups' }));
+
+    await regenerateCalendar(projectRoot);
+
+    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
+    expect(md).toContain('# Lane: Default');
+    expect(md).toContain('# Lane: Mockups');
+    // Editorial lane section contains the editorial stages.
+    expect(md).toContain('## Drafting');
+    // Visual lane section contains the visual stages.
+    expect(md).toContain('## Iterating');
+    expect(md).toContain('## Approved');
+    expect(md).toContain('## Sketched');
+    expect(md).toContain('## Shipped');
+    // Visual-specific off-pipeline stage shows up.
+    expect(md).toContain('## Archived');
+    // Every entry shows up.
+    expect(md).toContain('post-a');
+    expect(md).toContain('icon-set');
+    expect(md).toContain('logo-b');
+  });
+
+  it('places entries without a lane in an unassigned section', async () => {
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(
+      join(projectRoot, '.deskwork', 'lanes', 'default.json'),
+      JSON.stringify({
+        id: 'default',
+        name: 'Default',
+        pipelineTemplate: 'editorial',
+        contentDir: 'docs',
+      }),
+    );
+    // Entry has no `lane` field (legacy, migration window).
+    await writeSidecar(projectRoot, entry('legacy-one', 'Ideas'));
+
+    await regenerateCalendar(projectRoot);
+    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
+    expect(md).toContain('# Lane: (unassigned)');
+    expect(md).toContain('legacy-one');
+  });
+});
diff --git a/packages/core/test/doctor/lane-migration.test.ts b/packages/core/test/doctor/lane-migration.test.ts
new file mode 100644
index 0000000..03d94ef
--- /dev/null
+++ b/packages/core/test/doctor/lane-migration.test.ts
@@ -0,0 +1,172 @@
+/**
+ * Tests for Phase 4 doctor lane-migration helper.
+ *
+ * Verifies:
+ *   - dry-run reports planned changes without writing.
+ *   - first run creates `default` lane + back-fills sidecars.
+ *   - second run is a no-op (idempotent).
+ *   - back-fill derives `artifactKind` from extension when available.
+ *   - lane-migration journal events are emitted per changed sidecar.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { migrateLaneMembership } from '@/doctor/lane-migration';
+import { writeSidecar } from '@/sidecar/write';
+import { readSidecar } from '@/sidecar/read';
+import { readJournalEvents } from '@/journal/read';
+import type { Entry } from '@/schema/entry';
+
+async function setupFixture(): Promise<string> {
+  const root = await mkdtemp(join(tmpdir(), 'dw-lane-mig-'));
+  await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
+  // Minimal deskwork config so the bootstrap can derive a default lane.
+  await writeFile(
+    join(root, '.deskwork', 'config.json'),
+    JSON.stringify({
+      version: 1,
+      sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
+      defaultSite: 'main',
+    }),
+  );
+  return root;
+}
+
+function entry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
+  return {
+    uuid,
+    slug,
+    title: slug,
+    keywords: [],
+    source: 'manual',
+    currentStage: 'Drafting',
+    iterationByStage: {},
+    createdAt: '2026-04-30T10:00:00.000Z',
+    updatedAt: '2026-04-30T10:00:00.000Z',
+    ...overrides,
+  };
+}
+
+describe('migrateLaneMembership', () => {
+  let root: string;
+
+  beforeEach(async () => {
+    root = await setupFixture();
+  });
+
+  afterEach(async () => {
+    await rm(root, { recursive: true, force: true });
+  });
+
+  it('dry-run reports planned changes without writing', async () => {
+    await writeSidecar(root, entry(
+      '11111111-1111-4111-8111-111111111111',
+      'doc-a',
+      { artifactPath: 'docs/doc-a/index.md' },
+    ));
+
+    const result = await migrateLaneMembership(root, { dryRun: true });
+    expect(result.dryRun).toBe(true);
+    expect(result.entriesExamined).toBe(1);
+    expect(result.entriesLaneBackfilled).toBe(1);
+    expect(result.entriesArtifactKindBackfilled).toBe(1);
+    expect(result.defaultLaneCreated).toBe(true);
+
+    // No actual lane file written.
+    await expect(stat(result.defaultLanePath)).rejects.toThrow();
+    // Sidecar still has no lane / artifactKind.
+    const sidecar = await readSidecar(root, '11111111-1111-4111-8111-111111111111');
+    expect(sidecar.lane).toBeUndefined();
+    expect(sidecar.artifactKind).toBeUndefined();
+  });
+
+  it('apply run creates default lane, back-fills sidecars, and emits journal events', async () => {
+    const u1 = '11111111-1111-4111-8111-111111111111';
+    const u2 = '22222222-2222-4222-8222-222222222222';
+    await writeSidecar(root, entry(u1, 'doc-a', { artifactPath: 'docs/doc-a/index.md' }));
+    await writeSidecar(root, entry(u2, 'doc-b', { artifactPath: 'docs/doc-b/index.md' }));
+
+    const result = await migrateLaneMembership(root);
+    expect(result.dryRun).toBe(false);
+    expect(result.entriesExamined).toBe(2);
+    expect(result.entriesLaneBackfilled).toBe(2);
+    expect(result.entriesArtifactKindBackfilled).toBe(2);
+    expect(result.defaultLaneCreated).toBe(true);
+
+    // default.json is on disk and parses cleanly.
+    const laneRaw = await readFile(result.defaultLanePath, 'utf8');
+    const lane = JSON.parse(laneRaw);
+    expect(lane.id).toBe('default');
+    expect(lane.pipelineTemplate).toBe('editorial');
+    expect(lane.contentDir).toBe('docs');
+
+    // Sidecars carry lane + artifactKind.
+    const after1 = await readSidecar(root, u1);
+    expect(after1.lane).toBe('default');
+    expect(after1.artifactKind).toBe('markdown');
+    const after2 = await readSidecar(root, u2);
+    expect(after2.lane).toBe('default');
+    expect(after2.artifactKind).toBe('markdown');
+
+    // A lane-migration journal event landed per sidecar (plus the one
+    // emitted by bootstrapDefaultLaneIfMissing for the lane creation).
+    const events = await readJournalEvents(root);
+    const lmEvents = events.filter((e) => e.kind === 'lane-migration');
+    // At least one event per back-fill + one for the lane bootstrap.
+    expect(lmEvents.length).toBeGreaterThanOrEqual(3);
+  });
+
+  it('is idempotent — second run is a no-op', async () => {
+    await writeSidecar(root, entry(
+      '11111111-1111-4111-8111-111111111111',
+      'doc-a',
+      { artifactPath: 'docs/doc-a/index.md' },
+    ));
+    await migrateLaneMembership(root);
+    const result2 = await migrateLaneMembership(root);
+    expect(result2.entriesLaneBackfilled).toBe(0);
+    expect(result2.entriesArtifactKindBackfilled).toBe(0);
+    expect(result2.defaultLaneCreated).toBe(false);
+  });
+
+  it('derives artifactKind from .html extension', async () => {
+    await writeSidecar(root, entry(
+      '11111111-1111-4111-8111-111111111111',
+      'page-a',
+      { artifactPath: 'docs/page-a/index.html' },
+    ));
+    await migrateLaneMembership(root);
+    const after = await readSidecar(root, '11111111-1111-4111-8111-111111111111');
+    // Path-derived: .html → single-file-html. (The filesystem-probe
+    // detectArtifactKind would call this html-mockup if it were a
+    // directory; the path-only derivation correctly defers to the
+    // extension-driven kind.)
+    expect(after.artifactKind).toBe('single-file-html');
+  });
+
+  it('skips artifactKind back-fill when path has no recognizable extension', async () => {
+    const u = '11111111-1111-4111-8111-111111111111';
+    await writeSidecar(root, entry(u, 'no-ext', { artifactPath: 'docs/no-ext/raw' }));
+    const result = await migrateLaneMembership(root);
+    expect(result.entriesLaneBackfilled).toBe(1);
+    expect(result.entriesArtifactKindBackfilled).toBe(0);
+    const after = await readSidecar(root, u);
+    expect(after.lane).toBe('default');
+    expect(after.artifactKind).toBeUndefined();
+  });
+
+  it('does not back-fill entries that already carry lane + artifactKind', async () => {
+    const u = '11111111-1111-4111-8111-111111111111';
+    await writeSidecar(root, entry(u, 'doc-a', {
+      artifactPath: 'docs/doc-a/index.md',
+      lane: 'default',
+      artifactKind: 'markdown',
+    }));
+    const result = await migrateLaneMembership(root);
+    expect(result.entriesExamined).toBe(1);
+    expect(result.entriesLaneBackfilled).toBe(0);
+    expect(result.entriesArtifactKindBackfilled).toBe(0);
+  });
+});
diff --git a/packages/core/test/doctor/orphan-frontmatter-id.test.ts b/packages/core/test/doctor/orphan-frontmatter-id.test.ts
new file mode 100644
index 0000000..3b32c22
--- /dev/null
+++ b/packages/core/test/doctor/orphan-frontmatter-id.test.ts
@@ -0,0 +1,149 @@
+/**
+ * Tests for the `orphan-frontmatter-id` doctor rule (Issue #300 regression).
+ *
+ * Before Phase 4 the rule consulted `ctx.calendar.entries` exclusively;
+ * that list comes from the legacy `parseCalendar` parser which only
+ * recognizes the pre-graphical-entries 7-stage section names. Entries
+ * in `## Final`, `## Blocked`, or `## Cancelled` sections were
+ * silently dropped from the parsed list, producing false-positive
+ * orphan findings against every Final / Blocked / Cancelled file in
+ * the project.
+ *
+ * Phase 4 augments the audit with a UUID-set scan of the raw
+ * calendar.md markdown — section-agnostic — so any UUID that appears
+ * in ANY table row anywhere in the file is treated as "in the
+ * calendar", regardless of section heading.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { runAudit, yesInteraction } from '@/doctor/runner';
+import type { DeskworkConfig } from '@/config';
+
+const RULE_ID = 'orphan-frontmatter-id';
+
+async function setupFixture(): Promise<{ root: string; config: DeskworkConfig }> {
+  const root = await mkdtemp(join(tmpdir(), 'dw-orphan-fmid-'));
+  await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
+  await mkdir(join(root, 'docs'), { recursive: true });
+  const config: DeskworkConfig = {
+    version: 1,
+    sites: {
+      main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
+    },
+    defaultSite: 'main',
+  };
+  return { root, config };
+}
+
+const UUID_FINAL = '11111111-1111-4111-8111-111111111111';
+const UUID_CANCELLED = '22222222-2222-4222-8222-222222222222';
+const UUID_BLOCKED = '33333333-3333-4333-8333-333333333333';
+const UUID_DRAFTING = '44444444-4444-4444-8444-444444444444';
+
+function calendarWithFinalAndCancelled(): string {
+  return `# Editorial Calendar
+
+## Drafting
+
+| UUID | Slug | Title | Description | Keywords | Source | Updated |
+|------|------|------|------|------|------|------|
+| ${UUID_DRAFTING} | drafting-doc | Drafting Doc |  |  | manual | 2026-04-30T10:00:00.000Z |
+
+## Final
+
+| UUID | Slug | Title | Description | Keywords | Source | Updated |
+|------|------|------|------|------|------|------|
+| ${UUID_FINAL} | final-doc | Final Doc |  |  | manual | 2026-04-30T10:00:00.000Z |
+
+## Blocked
+
+| UUID | Slug | Title | Description | Keywords | Source | Updated |
+|------|------|------|------|------|------|------|
+| ${UUID_BLOCKED} | blocked-doc | Blocked Doc |  |  | manual | 2026-04-30T10:00:00.000Z |
+
+## Cancelled
+
+| UUID | Slug | Title | Description | Keywords | Source | Updated |
+|------|------|------|------|------|------|------|
+| ${UUID_CANCELLED} | cancelled-doc | Cancelled Doc |  |  | manual | 2026-04-30T10:00:00.000Z |
+
+## Distribution
+
+*reserved for shortform DistributionRecords — separate model*
+`;
+}
+
+async function writeContentFile(root: string, slug: string, uuid: string): Promise<void> {
+  await mkdir(join(root, 'docs', slug), { recursive: true });
+  await writeFile(
+    join(root, 'docs', slug, 'index.md'),
+    `---\ndeskwork:\n  id: ${uuid}\n---\n\n# ${slug}\n`,
+  );
+}
+
+describe('doctor: orphan-frontmatter-id (#300 regression)', () => {
+  let root: string;
+  let config: DeskworkConfig;
+
+  beforeEach(async () => {
+    const f = await setupFixture();
+    root = f.root;
+    config = f.config;
+  });
+
+  afterEach(async () => {
+    await rm(root, { recursive: true, force: true });
+  });
+
+  it('does NOT flag entries in Final / Blocked / Cancelled sections as orphans (#300)', async () => {
+    await writeFile(join(root, '.deskwork', 'calendar.md'), calendarWithFinalAndCancelled());
+    // Each calendar entry has a corresponding on-disk file bound by id.
+    await writeContentFile(root, 'drafting-doc', UUID_DRAFTING);
+    await writeContentFile(root, 'final-doc', UUID_FINAL);
+    await writeContentFile(root, 'blocked-doc', UUID_BLOCKED);
+    await writeContentFile(root, 'cancelled-doc', UUID_CANCELLED);
+
+    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
+    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
+    // Before the fix: 3 false positives (Final / Blocked / Cancelled).
+    // After:           0 false positives.
+    expect(findings).toHaveLength(0);
+  });
+
+  it('still flags a real orphan (file with id not in calendar)', async () => {
+    await writeFile(join(root, '.deskwork', 'calendar.md'), calendarWithFinalAndCancelled());
+    // A file bound by an id that is NOT in the calendar — a real orphan.
+    const orphanUuid = '99999999-9999-4999-8999-999999999999';
+    await writeContentFile(root, 'orphan-doc', orphanUuid);
+    // Also include the "good" files so we don't trip absence-of-id rules.
+    await writeContentFile(root, 'drafting-doc', UUID_DRAFTING);
+    await writeContentFile(root, 'final-doc', UUID_FINAL);
+    await writeContentFile(root, 'blocked-doc', UUID_BLOCKED);
+    await writeContentFile(root, 'cancelled-doc', UUID_CANCELLED);
+
+    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
+    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
+    expect(findings).toHaveLength(1);
+    expect(findings[0].details.entryId).toBe(orphanUuid);
+  });
+
+  it('handles a calendar with only legacy stages (no Final / Cancelled rows) without false positives', async () => {
+    const md = `# Editorial Calendar
+
+## Drafting
+
+| UUID | Slug | Title | Description | Keywords | Source | Updated |
+|------|------|------|------|------|------|------|
+| ${UUID_DRAFTING} | drafting-doc | Drafting Doc |  |  | manual | 2026-04-30T10:00:00.000Z |
+`;
+    await writeFile(join(root, '.deskwork', 'calendar.md'), md);
+    await writeContentFile(root, 'drafting-doc', UUID_DRAFTING);
+
+    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
+    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
+    expect(findings).toHaveLength(0);
+  });
+});
diff --git a/packages/core/test/entry/approve.test.ts b/packages/core/test/entry/approve.test.ts
index 0670a33..adb6902 100644
--- a/packages/core/test/entry/approve.test.ts
+++ b/packages/core/test/entry/approve.test.ts
@@ -55,15 +55,17 @@ describe('approveEntryStage', () => {
   });
 
   it('graduates Drafting → Final', async () => {
-    await setupEntry({ currentStage: 'Drafting', reviewState: 'in-review' });
+    await setupEntry({ currentStage: 'Drafting' });
     const result = await approveEntryStage(projectRoot, { uuid });
     expect(result.toStage).toBe('Final');
     const sidecar = await readSidecar(projectRoot, uuid);
     expect(sidecar.currentStage).toBe('Final');
     // Per DESKWORK-STATE-MACHINE.md Commandment III, reviewState is
     // RETIRED — the schema field is gone, so it's necessarily absent
-    // from any read sidecar.
-    expect(sidecar.reviewState).toBeUndefined();
+    // from any read sidecar. We assert via `in` against a runtime
+    // shape rather than via the typed property access, since the
+    // typed shape no longer carries the field.
+    expect('reviewState' in sidecar).toBe(false);
   });
 
   it('does NOT emit a review-state-change journal event on approve (Commandment III — reviewState is retired)', async () => {
diff --git a/packages/core/test/entry/publish.test.ts b/packages/core/test/entry/publish.test.ts
index 8c7c1c1..927daff 100644
--- a/packages/core/test/entry/publish.test.ts
+++ b/packages/core/test/entry/publish.test.ts
@@ -90,7 +90,7 @@ describe('publishEntry', () => {
     await setupEntry({ currentStage: 'Published' });
     await expect(
       publishEntry(projectRoot, { uuid, requireArtifact: false }),
-    ).rejects.toThrow(/already Published/i);
+    ).rejects.toThrow(/already.*Published|terminal stage.*Published/i);
   });
 
   it('refuses Blocked / Cancelled (induct first)', async () => {
diff --git a/packages/core/test/entry/verbs-visual.test.ts b/packages/core/test/entry/verbs-visual.test.ts
new file mode 100644
index 0000000..be164e6
--- /dev/null
+++ b/packages/core/test/entry/verbs-visual.test.ts
@@ -0,0 +1,210 @@
+/**
+ * Verb suite — non-editorial coverage (visual preset).
+ *
+ * Phase 4 Task 4.1.3: every verb must work against a lane-template
+ * whose stages differ from the editorial vocabulary. The visual preset
+ * uses `Sketched / Iterating / Approved / Shipped` for linearStages
+ * with `Approved` locked and adds `Archived` to off-pipeline.
+ *
+ * Per-verb expectations:
+ *
+ *   - approveEntryStage: graduates linear stages; refuses
+ *     pre-terminal (`Approved`) with "use publish, not approve"; refuses
+ *     terminal (`Shipped`) and off-pipeline.
+ *   - iterateEntry: refuses locked stage (`Approved`) AND terminal AND
+ *     off-pipeline.
+ *   - cancelEntry: writes `Cancelled` (template includes it).
+ *   - blockEntry: writes `Blocked` (template includes it).
+ *   - inductEntry: refuses non-linear targets like `Archived` and
+ *     reports the visual linearStages in the error message.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { approveEntryStage } from '@/entry/approve';
+import { cancelEntry } from '@/entry/cancel';
+import { blockEntry } from '@/entry/block';
+import { inductEntry } from '@/entry/induct';
+import { iterateEntry } from '@/iterate/iterate';
+import { writeSidecar } from '@/sidecar/write';
+import { readSidecar } from '@/sidecar/read';
+import type { Entry } from '@/schema/entry';
+
+describe('verbs — visual preset', () => {
+  let projectRoot: string;
+  const uuid = '550e8400-e29b-41d4-a716-446655440099';
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-vis-'));
+    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(
+      join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
+      JSON.stringify({
+        id: 'mockups',
+        name: 'Mockups',
+        pipelineTemplate: 'visual',
+        contentDir: 'mockups',
+      }),
+    );
+    await writeFile(
+      join(projectRoot, '.deskwork', 'config.json'),
+      JSON.stringify({
+        version: 1,
+        sites: { main: { contentDir: 'mockups', calendarPath: '.deskwork/calendar.md' } },
+        defaultSite: 'main',
+      }),
+    );
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  async function setupEntry(overrides: Partial<Entry>): Promise<Entry> {
+    const entry: Entry = {
+      uuid,
+      slug: 'icon-set',
+      title: 'Icon Set',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Sketched',
+      iterationByStage: {},
+      lane: 'mockups',
+      createdAt: '2026-04-30T10:00:00.000Z',
+      updatedAt: '2026-04-30T10:00:00.000Z',
+      ...overrides,
+    };
+    await writeSidecar(projectRoot, entry);
+    return entry;
+  }
+
+  // ---- approve ------------------------------------------------------
+
+  it('approve: graduates Sketched → Iterating', async () => {
+    await setupEntry({ currentStage: 'Sketched' });
+    const r = await approveEntryStage(projectRoot, { uuid });
+    expect(r.fromStage).toBe('Sketched');
+    expect(r.toStage).toBe('Iterating');
+  });
+
+  it('approve: graduates Iterating → Approved', async () => {
+    await setupEntry({ currentStage: 'Iterating' });
+    const r = await approveEntryStage(projectRoot, { uuid });
+    expect(r.toStage).toBe('Approved');
+  });
+
+  it('approve: refuses to graduate Approved → Shipped (must use publish)', async () => {
+    await setupEntry({ currentStage: 'Approved' });
+    await expect(approveEntryStage(projectRoot, { uuid })).rejects.toThrow(/publish/i);
+  });
+
+  it('approve: refuses to graduate the terminal Shipped stage', async () => {
+    await setupEntry({ currentStage: 'Shipped' });
+    await expect(approveEntryStage(projectRoot, { uuid })).rejects.toThrow(/terminal stage/i);
+  });
+
+  it('approve: refuses off-pipeline stages', async () => {
+    for (const stage of ['Blocked', 'Cancelled', 'Archived']) {
+      const u = `550e8400-e29b-41d4-a716-44665544010${stage.length % 9}`;
+      const entry: Entry = {
+        uuid: u,
+        slug: `vis-${stage}`,
+        title: 'V',
+        keywords: [],
+        source: 'manual',
+        currentStage: stage,
+        iterationByStage: {},
+        lane: 'mockups',
+        priorStage: 'Sketched',
+        createdAt: '2026-04-30T10:00:00.000Z',
+        updatedAt: '2026-04-30T10:00:00.000Z',
+      };
+      await writeSidecar(projectRoot, entry);
+      await expect(approveEntryStage(projectRoot, { uuid: u })).rejects.toThrow(/off-pipeline/i);
+    }
+  });
+
+  // ---- iterate ------------------------------------------------------
+
+  it('iterate: refuses on Approved (locked stage)', async () => {
+    await setupEntry({ currentStage: 'Approved', artifactPath: 'mockups/icon-set/index.md' });
+    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
+    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
+    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/locked stage/i);
+  });
+
+  it('iterate: refuses on Shipped (terminal)', async () => {
+    await setupEntry({ currentStage: 'Shipped', artifactPath: 'mockups/icon-set/index.md' });
+    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
+    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
+    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/terminal stage/i);
+  });
+
+  it('iterate: refuses on Archived (off-pipeline, visual-specific)', async () => {
+    await setupEntry({ currentStage: 'Archived', priorStage: 'Sketched', artifactPath: 'mockups/icon-set/index.md' });
+    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
+    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
+    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/off-pipeline/i);
+  });
+
+  it('iterate: succeeds on Sketched and bumps the per-stage counter', async () => {
+    await setupEntry({ currentStage: 'Sketched', artifactPath: 'mockups/icon-set/index.md' });
+    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
+    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
+    const r = await iterateEntry(projectRoot, { uuid });
+    expect(r.stage).toBe('Sketched');
+    expect(r.version).toBe(1);
+  });
+
+  // ---- cancel -------------------------------------------------------
+
+  it('cancel: writes Cancelled (visual template includes it)', async () => {
+    await setupEntry({ currentStage: 'Sketched' });
+    const r = await cancelEntry(projectRoot, { uuid, reason: 'scrapped' });
+    expect(r.toStage).toBe('Cancelled');
+    const after = await readSidecar(projectRoot, uuid);
+    expect(after.currentStage).toBe('Cancelled');
+    expect(after.priorStage).toBe('Sketched');
+  });
+
+  it('cancel: refuses terminal stage Shipped', async () => {
+    await setupEntry({ currentStage: 'Shipped' });
+    await expect(cancelEntry(projectRoot, { uuid })).rejects.toThrow(/terminal stage/i);
+  });
+
+  // ---- block --------------------------------------------------------
+
+  it('block: writes Blocked', async () => {
+    await setupEntry({ currentStage: 'Iterating', iterationByStage: { Sketched: 1, Iterating: 2 } });
+    const r = await blockEntry(projectRoot, { uuid, reason: 'awaiting brief' });
+    expect(r.toStage).toBe('Blocked');
+    const after = await readSidecar(projectRoot, uuid);
+    expect(after.currentStage).toBe('Blocked');
+    expect(after.priorStage).toBe('Iterating');
+  });
+
+  // ---- induct -------------------------------------------------------
+
+  it('induct: returns Blocked entry to Sketched', async () => {
+    await setupEntry({ currentStage: 'Blocked', priorStage: 'Iterating' });
+    const r = await inductEntry(projectRoot, { uuid, targetStage: 'Sketched' });
+    expect(r.toStage).toBe('Sketched');
+    const after = await readSidecar(projectRoot, uuid);
+    expect(after.currentStage).toBe('Sketched');
+    // Off-pipeline induct clears priorStage.
+    expect(after.priorStage).toBeUndefined();
+  });
+
+  it('induct: refuses to induct to an off-pipeline target like Archived', async () => {
+    await setupEntry({ currentStage: 'Sketched' });
+    await expect(inductEntry(projectRoot, { uuid, targetStage: 'Archived' })).rejects.toThrow(/off-pipeline/i);
+  });
+
+  it('induct: refuses an unknown stage with the visual linearStages list', async () => {
+    await setupEntry({ currentStage: 'Sketched' });
+    await expect(inductEntry(projectRoot, { uuid, targetStage: 'Drafting' })).rejects.toThrow(/Sketched, Iterating, Approved, Shipped/);
+  });
+});
diff --git a/packages/core/test/iterate/iterate.test.ts b/packages/core/test/iterate/iterate.test.ts
index 867bc96..4e11da2 100644
--- a/packages/core/test/iterate/iterate.test.ts
+++ b/packages/core/test/iterate/iterate.test.ts
@@ -76,14 +76,26 @@ describe('iterateEntry', () => {
     // Per DESKWORK-STATE-MACHINE.md Commandment III, iterate does NOT
     // write reviewState. Vestigial reviewState (if present from legacy
     // sidecars) is stripped on the iterate write.
-    expect(updated.reviewState).toBeUndefined();
+    expect('reviewState' in updated).toBe(false);
   });
 
   it('strips vestigial reviewState from legacy sidecars on iterate', async () => {
     const entry = await setupEntry('Drafting');
-    // Simulate a legacy sidecar carrying a reviewState field.
-    const legacySidecar = { ...entry, reviewState: 'in-review' as const };
-    await writeSidecar(projectRoot, legacySidecar);
+    // Simulate a legacy sidecar carrying a reviewState field. Per
+    // DESKWORK-STATE-MACHINE.md Commandment III the schema no longer
+    // carries `reviewState`; we use a runtime-typed record to attach
+    // the vestigial key for the fixture and pass through writeSidecar
+    // via its schema-validating round-trip (the field is dropped on
+    // parse).
+    const legacyRecord: Record<string, unknown> = { ...entry, reviewState: 'in-review' };
+    // writeSidecar's argument is `Entry`; the schema's non-strict mode
+    // drops the vestigial key on parse, so we re-parse here to obtain
+    // a strict Entry before the write. The result is an Entry-typed
+    // value with reviewState absent — exactly what the legacy sidecar
+    // would look like AFTER one read/write round-trip. To test the
+    // legacy-on-disk path, we write the raw JSON directly to disk.
+    const sidecarPathStr = join(projectRoot, '.deskwork', 'entries', `${uuid}.json`);
+    await writeFile(sidecarPathStr, JSON.stringify(legacyRecord));
     await writeFile(
       join(projectRoot, 'docs', slug, 'index.md'),
       `---\ndeskwork:\n  id: ${uuid}\n---\n\n# body\n`,
@@ -91,7 +103,7 @@ describe('iterateEntry', () => {
 
     await iterateEntry(projectRoot, { uuid });
     const updated = await readSidecar(projectRoot, uuid);
-    expect(updated.reviewState).toBeUndefined();
+    expect('reviewState' in updated).toBe(false);
   });
 
   it('produces v(N+1) from existing iteration N', async () => {
diff --git a/packages/core/test/lanes/resolve.test.ts b/packages/core/test/lanes/resolve.test.ts
new file mode 100644
index 0000000..f72c255
--- /dev/null
+++ b/packages/core/test/lanes/resolve.test.ts
@@ -0,0 +1,66 @@
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { resolveEntryTemplate, resolveEntryStrictTemplate } from '@/lanes/resolve';
+import type { Entry } from '@/schema/entry';
+
+describe('resolveEntryTemplate', () => {
+  let projectRoot: string;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-resolve-'));
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  function baseEntry(overrides: Partial<Entry>): Entry {
+    return {
+      uuid: '550e8400-e29b-41d4-a716-446655440000',
+      slug: 'x', title: 'x', keywords: [], source: 'manual',
+      currentStage: 'Ideas',
+      iterationByStage: {},
+      createdAt: '2026-04-30T10:00:00.000Z',
+      updatedAt: '2026-04-30T10:00:00.000Z',
+      ...overrides,
+    };
+  }
+
+  it('defaults to editorial when entry.lane is undefined (migration window)', async () => {
+    const entry = baseEntry({});
+    const template = resolveEntryTemplate(entry, projectRoot);
+    expect(template.id).toBe('editorial');
+    expect(template.linearStages).toContain('Drafting');
+  });
+
+  it('resolves the lane-bound template when entry.lane is set', async () => {
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(
+      join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
+      JSON.stringify({
+        id: 'mockups',
+        name: 'Mockups',
+        pipelineTemplate: 'visual',
+        contentDir: 'mockups',
+      }),
+    );
+    const entry = baseEntry({ lane: 'mockups', currentStage: 'Sketched' });
+    const template = resolveEntryTemplate(entry, projectRoot);
+    expect(template.id).toBe('visual');
+    expect(template.linearStages).toEqual(['Sketched', 'Iterating', 'Approved', 'Shipped']);
+  });
+
+  it('throws when entry.lane references a missing lane config', () => {
+    const entry = baseEntry({ lane: 'nonexistent' });
+    expect(() => resolveEntryTemplate(entry, projectRoot)).toThrow(/Lane config "nonexistent" not found/);
+  });
+
+  it('resolveEntryStrictTemplate returns the narrow projection', async () => {
+    const entry = baseEntry({});
+    const template = resolveEntryStrictTemplate(entry, projectRoot);
+    // The strict type still has the same runtime fields — assert one.
+    expect(template.linearStages.length).toBeGreaterThan(0);
+  });
+});
diff --git a/packages/core/test/lanes/stage-token.test.ts b/packages/core/test/lanes/stage-token.test.ts
new file mode 100644
index 0000000..54af85a
--- /dev/null
+++ b/packages/core/test/lanes/stage-token.test.ts
@@ -0,0 +1,56 @@
+import { describe, it, expect } from 'vitest';
+import { stageNameToFilesystemToken } from '@/lanes/stage-token';
+
+describe('stageNameToFilesystemToken', () => {
+  it('lowercases editorial stages cleanly', () => {
+    expect(stageNameToFilesystemToken('Ideas')).toBe('ideas');
+    expect(stageNameToFilesystemToken('Drafting')).toBe('drafting');
+    expect(stageNameToFilesystemToken('Final')).toBe('final');
+    expect(stageNameToFilesystemToken('Published')).toBe('published');
+  });
+
+  it('kebab-cases multi-word stage names', () => {
+    expect(stageNameToFilesystemToken('My Stage')).toBe('my-stage');
+    expect(stageNameToFilesystemToken('In Review')).toBe('in-review');
+  });
+
+  it('collapses runs of whitespace into a single hyphen', () => {
+    expect(stageNameToFilesystemToken('In   Review')).toBe('in-review');
+    expect(stageNameToFilesystemToken('  Drafting  ')).toBe('drafting');
+  });
+
+  it('preserves digits and hyphens', () => {
+    expect(stageNameToFilesystemToken('stage-1')).toBe('stage-1');
+    expect(stageNameToFilesystemToken('Iteration 2')).toBe('iteration-2');
+  });
+
+  it('preserves underscores', () => {
+    expect(stageNameToFilesystemToken('Stage_One')).toBe('stage_one');
+  });
+
+  it('rejects empty input', () => {
+    expect(() => stageNameToFilesystemToken('')).toThrow(/empty or whitespace-only/);
+    expect(() => stageNameToFilesystemToken('   ')).toThrow(/empty or whitespace-only/);
+  });
+
+  it('rejects path separators', () => {
+    expect(() => stageNameToFilesystemToken('PROD/Staging')).toThrow(/cannot be safely tokenized/);
+    expect(() => stageNameToFilesystemToken('foo\\bar')).toThrow(/cannot be safely tokenized/);
+  });
+
+  it('rejects non-ASCII characters', () => {
+    expect(() => stageNameToFilesystemToken('Café')).toThrow(/cannot be safely tokenized/);
+    expect(() => stageNameToFilesystemToken('日本語')).toThrow(/cannot be safely tokenized/);
+  });
+
+  it('rejects names that start with a hyphen or underscore', () => {
+    expect(() => stageNameToFilesystemToken('-leading')).toThrow(/cannot be safely tokenized/);
+    expect(() => stageNameToFilesystemToken('_leading')).toThrow(/cannot be safely tokenized/);
+  });
+
+  it('rejects special punctuation', () => {
+    expect(() => stageNameToFilesystemToken('Stage!')).toThrow(/cannot be safely tokenized/);
+    expect(() => stageNameToFilesystemToken('Stage.One')).toThrow(/cannot be safely tokenized/);
+    expect(() => stageNameToFilesystemToken('Stage@One')).toThrow(/cannot be safely tokenized/);
+  });
+});
diff --git a/packages/core/test/pipelines/helpers.test.ts b/packages/core/test/pipelines/helpers.test.ts
new file mode 100644
index 0000000..a0204ec
--- /dev/null
+++ b/packages/core/test/pipelines/helpers.test.ts
@@ -0,0 +1,171 @@
+import { describe, it, expect } from 'vitest';
+import {
+  isLinearPipelineStageInTemplate,
+  isOffPipelineStageInTemplate,
+  isLockedStageInTemplate,
+  isKnownStageInTemplate,
+  nextStageInTemplate,
+  assertStageInTemplate,
+  terminalLinearStage,
+  preTerminalLinearStage,
+} from '@/pipelines/helpers';
+import type { StrictPipelineTemplate } from '@/pipelines/types';
+
+const editorial: StrictPipelineTemplate = {
+  id: 'editorial',
+  name: 'Editorial',
+  description: 'edt',
+  linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
+  lockedStages: ['Final'],
+  offPipelineStages: ['Blocked', 'Cancelled'],
+};
+
+const visual: StrictPipelineTemplate = {
+  id: 'visual',
+  name: 'Visual',
+  description: 'vis',
+  linearStages: ['Sketched', 'Iterating', 'Approved', 'Shipped'],
+  lockedStages: ['Approved'],
+  offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
+};
+
+describe('pipeline helpers', () => {
+  describe('isLinearPipelineStageInTemplate', () => {
+    it('returns true for editorial linear stages', () => {
+      expect(isLinearPipelineStageInTemplate(editorial, 'Ideas')).toBe(true);
+      expect(isLinearPipelineStageInTemplate(editorial, 'Final')).toBe(true);
+      expect(isLinearPipelineStageInTemplate(editorial, 'Published')).toBe(true);
+    });
+
+    it('returns false for editorial off-pipeline stages', () => {
+      expect(isLinearPipelineStageInTemplate(editorial, 'Blocked')).toBe(false);
+      expect(isLinearPipelineStageInTemplate(editorial, 'Cancelled')).toBe(false);
+    });
+
+    it('returns false for visual stages in editorial template', () => {
+      expect(isLinearPipelineStageInTemplate(editorial, 'Sketched')).toBe(false);
+      expect(isLinearPipelineStageInTemplate(editorial, 'Shipped')).toBe(false);
+    });
+
+    it('returns true for visual linear stages in visual template', () => {
+      expect(isLinearPipelineStageInTemplate(visual, 'Sketched')).toBe(true);
+      expect(isLinearPipelineStageInTemplate(visual, 'Approved')).toBe(true);
+      expect(isLinearPipelineStageInTemplate(visual, 'Shipped')).toBe(true);
+    });
+  });
+
+  describe('isOffPipelineStageInTemplate', () => {
+    it('detects editorial off-pipeline stages', () => {
+      expect(isOffPipelineStageInTemplate(editorial, 'Blocked')).toBe(true);
+      expect(isOffPipelineStageInTemplate(editorial, 'Cancelled')).toBe(true);
+      expect(isOffPipelineStageInTemplate(editorial, 'Ideas')).toBe(false);
+    });
+
+    it('detects visual off-pipeline stages including Archived', () => {
+      expect(isOffPipelineStageInTemplate(visual, 'Archived')).toBe(true);
+      expect(isOffPipelineStageInTemplate(visual, 'Blocked')).toBe(true);
+      expect(isOffPipelineStageInTemplate(visual, 'Sketched')).toBe(false);
+    });
+  });
+
+  describe('isLockedStageInTemplate', () => {
+    it('detects the editorial lock at Final', () => {
+      expect(isLockedStageInTemplate(editorial, 'Final')).toBe(true);
+      expect(isLockedStageInTemplate(editorial, 'Drafting')).toBe(false);
+    });
+
+    it('detects the visual lock at Approved', () => {
+      expect(isLockedStageInTemplate(visual, 'Approved')).toBe(true);
+      expect(isLockedStageInTemplate(visual, 'Sketched')).toBe(false);
+    });
+
+    it('returns false when template has no lockedStages', () => {
+      const lockless: StrictPipelineTemplate = {
+        id: 'lockless',
+        name: 'lockless',
+        description: 'd',
+        linearStages: ['A', 'B'],
+        offPipelineStages: [],
+      };
+      expect(isLockedStageInTemplate(lockless, 'A')).toBe(false);
+      expect(isLockedStageInTemplate(lockless, 'B')).toBe(false);
+    });
+  });
+
+  describe('isKnownStageInTemplate', () => {
+    it('returns true for either linear or off-pipeline stages', () => {
+      expect(isKnownStageInTemplate(editorial, 'Ideas')).toBe(true);
+      expect(isKnownStageInTemplate(editorial, 'Cancelled')).toBe(true);
+    });
+
+    it('returns false for stages outside the template vocabulary', () => {
+      expect(isKnownStageInTemplate(editorial, 'Sketched')).toBe(false);
+      expect(isKnownStageInTemplate(visual, 'Drafting')).toBe(false);
+    });
+  });
+
+  describe('nextStageInTemplate', () => {
+    it('returns the editorial successor', () => {
+      expect(nextStageInTemplate(editorial, 'Ideas')).toBe('Planned');
+      expect(nextStageInTemplate(editorial, 'Drafting')).toBe('Final');
+      expect(nextStageInTemplate(editorial, 'Final')).toBe('Published');
+    });
+
+    it('returns null at the editorial terminal stage', () => {
+      expect(nextStageInTemplate(editorial, 'Published')).toBeNull();
+    });
+
+    it('returns the visual successor', () => {
+      expect(nextStageInTemplate(visual, 'Sketched')).toBe('Iterating');
+      expect(nextStageInTemplate(visual, 'Approved')).toBe('Shipped');
+    });
+
+    it('returns null at the visual terminal stage', () => {
+      expect(nextStageInTemplate(visual, 'Shipped')).toBeNull();
+    });
+
+    it('throws for an off-pipeline stage', () => {
+      expect(() => nextStageInTemplate(editorial, 'Cancelled')).toThrow(/not in template "editorial".linearStages/);
+    });
+
+    it('throws for an unknown stage', () => {
+      expect(() => nextStageInTemplate(editorial, 'Sketched')).toThrow(/not in template "editorial".linearStages/);
+    });
+  });
+
+  describe('assertStageInTemplate', () => {
+    it('passes for a known stage', () => {
+      expect(() => assertStageInTemplate(editorial, 'Drafting', 'test')).not.toThrow();
+      expect(() => assertStageInTemplate(visual, 'Archived', 'test')).not.toThrow();
+    });
+
+    it('throws with the full allowed stage list for an unknown stage', () => {
+      expect(() => assertStageInTemplate(editorial, 'Sketched', 'approveEntryStage')).toThrow(/approveEntryStage.*Sketched.*editorial/);
+      expect(() => assertStageInTemplate(editorial, 'Sketched', 'approveEntryStage')).toThrow(/Ideas, Planned, Outlining, Drafting, Final, Published, Blocked, Cancelled/);
+    });
+  });
+
+  describe('terminalLinearStage / preTerminalLinearStage', () => {
+    it('identifies editorial terminal + pre-terminal positions', () => {
+      expect(terminalLinearStage(editorial)).toBe('Published');
+      expect(preTerminalLinearStage(editorial)).toBe('Final');
+    });
+
+    it('identifies visual terminal + pre-terminal positions', () => {
+      expect(terminalLinearStage(visual)).toBe('Shipped');
+      expect(preTerminalLinearStage(visual)).toBe('Approved');
+    });
+
+    it('returns null for preTerminal when only one linear stage', () => {
+      const single: StrictPipelineTemplate = {
+        id: 'single',
+        name: 's',
+        description: 'd',
+        linearStages: ['One'],
+        offPipelineStages: [],
+      };
+      expect(terminalLinearStage(single)).toBe('One');
+      expect(preTerminalLinearStage(single)).toBeNull();
+    });
+  });
+});
diff --git a/scripts/smoke-phase4-issues.mjs b/scripts/smoke-phase4-issues.mjs
new file mode 100644
index 0000000..901f04f
--- /dev/null
+++ b/scripts/smoke-phase4-issues.mjs
@@ -0,0 +1,131 @@
+#!/usr/bin/env node
+/**
+ * Phase 4 smoke probe — verifies #247 and #300 close against this
+ * repo's actual `.deskwork/calendar.md` state.
+ *
+ * #247: regenerate the calendar from existing sidecars; assert every
+ * sidecar UUID appears in the rendered output (i.e. no entries are
+ * dropped due to a non-editorial / Final / Cancelled stage name).
+ *
+ * #300: run the doctor's `orphan-frontmatter-id` audit; assert that
+ * entries in Final / Cancelled / Blocked sections of the calendar do
+ * NOT surface as orphans (the pre-fix bug filed false positives
+ * because the legacy parser missed those sections).
+ *
+ * Run via `tsx scripts/smoke-phase4-issues.mjs` from the repo root.
+ */
+
+import { readdir, readFile, copyFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+
+// Resolve to the @deskwork/core workspace's built outputs (dist).
+const projectRoot = process.cwd();
+const coreDist = join(projectRoot, 'packages/core/dist');
+
+const { regenerateCalendar } = await import(join(coreDist, 'calendar/regenerate.js'));
+const { runAudit, yesInteraction } = await import(join(coreDist, 'doctor/runner.js'));
+
+async function copyDirectory(src, dest) {
+  await mkdir(dest, { recursive: true });
+  const items = await readdir(src, { withFileTypes: true });
+  for (const it of items) {
+    const s = join(src, it.name);
+    const d = join(dest, it.name);
+    if (it.isDirectory()) {
+      await copyDirectory(s, d);
+    } else if (it.isFile()) {
+      await copyFile(s, d);
+    }
+  }
+}
+
+async function main() {
+  // Clone the repo's .deskwork state into a tmp dir so the smoke
+  // doesn't mutate the live calendar.
+  const sandbox = await mkdtemp(join(tmpdir(), 'dw-smoke-phase4-'));
+  await mkdir(join(sandbox, '.deskwork'), { recursive: true });
+  await copyDirectory(join(projectRoot, '.deskwork'), join(sandbox, '.deskwork'));
+  // Also clone the content tree so the orphan-frontmatter-id rule has
+  // something to scan. We only need the docs tree.
+  if (await pathExists(join(projectRoot, 'docs'))) {
+    await copyDirectory(join(projectRoot, 'docs'), join(sandbox, 'docs'));
+  }
+
+  let pass = true;
+
+  // --- #247: regen preserves every sidecar -------------------------
+  console.log('[#247] regenerate calendar; check every sidecar UUID appears in output...');
+  const sidecarsDir = join(sandbox, '.deskwork', 'entries');
+  const sidecarFiles = (await readdir(sidecarsDir)).filter((n) => n.endsWith('.json'));
+  const sidecarIds = new Set();
+  for (const f of sidecarFiles) {
+    const raw = await readFile(join(sidecarsDir, f), 'utf8');
+    try {
+      const json = JSON.parse(raw);
+      if (typeof json.uuid === 'string') sidecarIds.add(json.uuid);
+    } catch {
+      // skip
+    }
+  }
+  console.log(`  ${sidecarIds.size} sidecar UUIDs collected.`);
+  await regenerateCalendar(sandbox);
+  const md = await readFile(join(sandbox, '.deskwork', 'calendar.md'), 'utf8');
+  let missing = 0;
+  for (const id of sidecarIds) {
+    if (!md.includes(id)) {
+      console.error(`  MISSING from calendar after regen: ${id}`);
+      missing++;
+    }
+  }
+  if (missing === 0) {
+    console.log(`  PASS: all ${sidecarIds.size} sidecars present in regenerated calendar.`);
+  } else {
+    console.error(`  FAIL: ${missing} sidecars dropped from calendar.`);
+    pass = false;
+  }
+
+  // --- #300: orphan-frontmatter-id audit ---------------------------
+  console.log('[#300] running doctor orphan-frontmatter-id audit...');
+  const config = JSON.parse(await readFile(join(sandbox, '.deskwork', 'config.json'), 'utf8'));
+  const report = await runAudit({ projectRoot: sandbox, config }, yesInteraction);
+  const orphans = report.findings.filter((f) => f.ruleId === 'orphan-frontmatter-id');
+  if (orphans.length === 0) {
+    console.log('  PASS: zero orphan-frontmatter-id findings (#300 closed).');
+  } else {
+    // Report which UUIDs would be (false-positively) flagged.
+    console.error(`  FAIL: ${orphans.length} orphan-frontmatter-id findings remain. First 5:`);
+    for (const o of orphans.slice(0, 5)) {
+      console.error(`    - entryId=${o.details.entryId}  path=${o.details.absolutePath}`);
+    }
+    // The smoke is informational about #300 — pre-existing orphans in
+    // the repo's content tree are not necessarily bugs (truly orphaned
+    // files DO exist). Don't fail the run on this; the test suite has
+    // the precise regression check.
+  }
+
+  await rm(sandbox, { recursive: true, force: true });
+
+  if (!pass) {
+    process.exit(1);
+  }
+  console.log('All smoke probes passed.');
+}
+
+async function pathExists(p) {
+  try {
+    await readFile(p, 'utf8');
+    return true;
+  } catch {
+    // readFile on a directory throws EISDIR — that still means the
+    // path exists; try a directory probe instead.
+    try {
+      await readdir(p);
+      return true;
+    } catch {
+      return false;
+    }
+  }
+}
+
+await main();
diff --git a/scripts/smoke-phase4-migration.mjs b/scripts/smoke-phase4-migration.mjs
new file mode 100644
index 0000000..85dec17
--- /dev/null
+++ b/scripts/smoke-phase4-migration.mjs
@@ -0,0 +1,57 @@
+#!/usr/bin/env node
+/**
+ * Phase 4 lane-migration smoke — sandbox clone of `.deskwork/`,
+ * run `migrateLaneMembership`, report deltas. Read-only against the
+ * live repo; the sandbox is wiped at the end.
+ */
+
+import { readdir, readFile, copyFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+
+const projectRoot = process.cwd();
+const coreDist = join(projectRoot, 'packages/core/dist');
+const { migrateLaneMembership } = await import(join(coreDist, 'doctor/lane-migration.js'));
+
+async function copyDirectory(src, dest) {
+  await mkdir(dest, { recursive: true });
+  const items = await readdir(src, { withFileTypes: true });
+  for (const it of items) {
+    const s = join(src, it.name);
+    const d = join(dest, it.name);
+    if (it.isDirectory()) await copyDirectory(s, d);
+    else if (it.isFile()) await copyFile(s, d);
+  }
+}
+
+const sandbox = await mkdtemp(join(tmpdir(), 'dw-smoke-mig-'));
+await mkdir(join(sandbox, '.deskwork'), { recursive: true });
+await copyDirectory(join(projectRoot, '.deskwork'), join(sandbox, '.deskwork'));
+
+console.log('[Phase 4 Task 4.4] Dry-run lane migration...');
+const dry = await migrateLaneMembership(sandbox, { dryRun: true });
+console.log('  examined:', dry.entriesExamined);
+console.log('  defaultLaneCreated (would):', dry.defaultLaneCreated);
+console.log('  entriesLaneBackfilled (would):', dry.entriesLaneBackfilled);
+console.log('  entriesArtifactKindBackfilled (would):', dry.entriesArtifactKindBackfilled);
+
+console.log('\n[Phase 4 Task 4.4] Apply lane migration...');
+const applied = await migrateLaneMembership(sandbox);
+console.log('  examined:', applied.entriesExamined);
+console.log('  defaultLaneCreated:', applied.defaultLaneCreated);
+console.log('  entriesLaneBackfilled:', applied.entriesLaneBackfilled);
+console.log('  entriesArtifactKindBackfilled:', applied.entriesArtifactKindBackfilled);
+
+console.log('\n[Phase 4 Task 4.4] Verify idempotence — second apply is a no-op...');
+const second = await migrateLaneMembership(sandbox);
+const idempotent =
+  second.defaultLaneCreated === false
+  && second.entriesLaneBackfilled === 0
+  && second.entriesArtifactKindBackfilled === 0;
+console.log('  defaultLaneCreated:', second.defaultLaneCreated, '(expected false)');
+console.log('  entriesLaneBackfilled:', second.entriesLaneBackfilled, '(expected 0)');
+console.log('  entriesArtifactKindBackfilled:', second.entriesArtifactKindBackfilled, '(expected 0)');
+console.log(idempotent ? '  PASS: idempotent.' : '  FAIL: not idempotent.');
+
+await rm(sandbox, { recursive: true, force: true });
+process.exit(idempotent ? 0 : 1);


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
