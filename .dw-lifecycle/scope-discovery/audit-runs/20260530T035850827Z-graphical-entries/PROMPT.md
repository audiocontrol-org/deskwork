# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Phase 7 of graphical-entries adds the Groups primitive: cross-lane bundles of entries with independent lifecycle. Tasks 7.1 (members[] schema delta) and 7.2 (/deskwork:group CLI + journal events) shipped earlier. Tasks 7.3 + 7.4 are the studio-surface half — folded into one design pass that picked Direction B (composed multi-lane default + list toggle for the group review surface) and Direction 1 (kraft pull-tab on row's left edge for the "Member of:" affordance on the lane dashboard). Direction B reuses the Phase 5 swimlane primitive scoped to the group's member set; empty-members falls back to artifactPath body or empty-state CTA. Direction 1 mirrors the .er-marginalia-tab / .er-outline-tab precedent per .claude/rules/affordance-placement.md. Group-vs-member-stage divergence detection deferred to doctor (Task 7.5.3); no on-surface divergence indicator in v1. Acceptance criteria: members[]-non-empty triggers Members section; composed view + list-toggle work end-to-end; member dashboard rows show pull-tab with parent count; multi-parent + non-member cases handled; press-check vocabulary + WCAG 2.5.8 + WCAG 1.4.3 AA contrast all met.

## Commit subjects in the audited range

8b88225 docs(graphical-entries): backfill AUDIT-30/31/32/33 Status sha (cc45787)
cc45787 fix(graphical-entries): Tasks 7.3 + 7.4 review actions — AUDIT-30/31/32/33 + scope 34/35 (#371, #372)
51ffe6b fix(graphical-entries): correct StrictPipelineTemplate import path in members-section.ts
3d670f5 docs(graphical-entries): backfill AUDIT-20260529-29 Status sha (b642cd6)
b642cd6 feat(graphical-entries): Phase 7 Tasks 7.3 + 7.4 — group review surface + member-of pull-tab (Direction B + 1)


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

### AUDIT-20260529-29 — Phase 7 Tasks 7.3 + 7.4 shipped: group review surface + member-of pull-tab (feature)

Finding-ID: AUDIT-20260529-29
Status:     fixed-b642cd6
Severity:   feature
Surface:    `packages/studio/src/pages/entry-review/members-section.ts`, `packages/studio/src/pages/dashboard/section.ts`, `plugins/deskwork-studio/public/css/entry-review-members.css`, `plugins/deskwork-studio/public/css/dashboard-row-affordances.css`

Implementation of Phase 7 Tasks 7.3 (group review surface — Members
section) + 7.4 (multi-lane composed view) per the accepted design at
`docs/studio-design/ACCEPTED/2026-05-29-group-review-surface/` —
Direction B (composed-default with list-toggle) for the group review
surface + Direction 1 (pull-tab on row edge) for the member-of badge
on dashboard rows.

**Files created**

- `packages/studio/src/pages/entry-review/members-section.ts` — the
  Members section renderer; `renderMembersSection(input)` returns the
  populated composed/list view OR the empty-state CTA OR `''` per the
  four-shape contract documented in the module's docblock.
- `plugins/deskwork-studio/public/css/entry-review-members.css` —
  press-check styling for the section (paper / kraft / proof-blue
  token vocabulary; no new tokens).
- `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts`
  — client controller for the composed↔list toggle (localStorage
  persistence keyed on the group UUID), the empty-state CTA
  clipboard-copy, and the per-member-row URL clipboard-copy.
- `plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts` —
  client controller for the row `.er-row-member-tab` toggle +
  popover back-link clipboard-copy.
- `packages/studio/test/entry-review-group-members-section-list.test.ts`
  — list-mode rendering integration test (real sidecars, real lane
  configs, real templates).
- `packages/studio/test/entry-review-group-members-section-composed.test.ts`
  — composed-mode rendering integration test (multi-lane scoped
  composition + `is-empty` stage assertion).
- `packages/studio/test/dashboard-member-row-badge.test.ts` — dashboard
  row badge integration test (solo + multi-parent + non-member).
- `packages/studio/test/entry-review-group-empty-members.test.ts` —
  empty-state CTA + artifactPath-fallback integration test (2 cases).

**Files modified**

- `packages/core/src/groups/index.ts` — barrel now exports
  `isPopulatedGroupEntry` (was previously implementation-internal
  under `./types.ts`).
- `packages/studio/src/pages/entry-review/data.ts` —
  `loadEntryReviewData` returns `groupMembers: GroupMembersBundle |
  null`; new `loadGroupMembersBundle` resolves member sidecars +
  lane configs + pipeline templates for populated groups. Missing
  members surface as `missingMemberUuids`, not silently dropped.
- `packages/studio/src/pages/entry-review/index.ts` — accepts
  `?members=<mode>` query string; wires the new section after the
  `er-draft-frame` body via `renderEntryMembersSection`; adds the
  new CSS to the page's CSS list.
- `packages/studio/src/server.ts` — threads `?members=` from the
  request to the entry-review query.
- `packages/studio/src/pages/dashboard/data.ts` — `loadDashboardData`
  now builds `parentsByMemberUuid: ReadonlyMap<string, readonly
  Entry[]>` in one pass over the sidecar set.
- `packages/studio/src/pages/dashboard/swimlane-shell.ts` — accepts
  `parentsByMemberUuid` in its input; threads through to
  `renderSwimlane`. The mobile `renderLaneStack` does NOT receive
  the index — it uses the list-body chrome, not the kanban
  `.er-row-shell`; a comment names the asymmetry explicitly so the
  next reader doesn't read it as an IOU.
- `packages/studio/src/pages/dashboard/swimlane-card.ts` —
  `renderSwimlane` + `renderStageCol` accept and thread
  `parentsByMemberUuid` to `renderRow`.
- `packages/studio/src/pages/dashboard/section.ts` — `renderRow`
  accepts `parentsByMemberUuid` (default = empty map for back-compat);
  new local helpers `renderMemberTab` + `renderMemberPopover` emit
  the kraft-color pull-tab on the row's left edge + the inline
  popover listing every parent group. The shell carries
  `.has-member-tab` when at least one parent exists (CSS uses it to
  inset the row's foreground for the 22px tab column).
- `packages/studio/src/pages/dashboard.ts` — passes
  `data.parentsByMemberUuid` into `renderSwimlanesShell`.
- `plugins/deskwork-studio/public/css/dashboard-row-affordances.css`
  — appended `.er-row-member-tab`, `.er-row-member-popover`,
  `.er-row-member-link` rules; mirrors `.er-marginalia-tab` /
  `.er-outline-tab` shape per `.claude/rules/affordance-placement.md`.
- `plugins/deskwork-studio/public/src/entry-review-client.ts` —
  invokes `initGroupMembersSection()` from the press-check init.
- `plugins/deskwork-studio/public/src/editorial-studio-client.ts` —
  invokes `initRowMemberTab()` from the dashboard init.
- `packages/studio/test/dashboard-swimlane-card-unit.test.ts` —
  threaded the new `parentsByMemberUuid` empty-map arg into the
  `renderSwimlane` call so the existing AUDIT-20260528-07 test
  keeps compiling against the widened signature.

**Test count delta** — studio suite 933 → 938 tests passing (+5
across the four new files: 1 list, 1 composed, 1 member-row-badge,
2 empty-members). Core suite unchanged (764 passing — the only
core-side delta is the `isPopulatedGroupEntry` re-export, which
trades a private subpath import for the barrel; no behavior
change).

**Phase 5 swimlane reuse pattern** — the composed view does NOT
re-instantiate the Phase 5 swimlane primitive (`renderSwimlane`
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


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index a42420b..6010ecb 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -2724,3 +2724,307 @@ Disposition: review pass complete; no commit needed to address
 findings. Recording the consolidated observation for the
 release-time close-shipped scanner and for future readers tracing
 the review trail of Step 7.2.8.
+
+### AUDIT-20260529-29 — Phase 7 Tasks 7.3 + 7.4 shipped: group review surface + member-of pull-tab (feature)
+
+Finding-ID: AUDIT-20260529-29
+Status:     fixed-b642cd6
+Severity:   feature
+Surface:    `packages/studio/src/pages/entry-review/members-section.ts`, `packages/studio/src/pages/dashboard/section.ts`, `plugins/deskwork-studio/public/css/entry-review-members.css`, `plugins/deskwork-studio/public/css/dashboard-row-affordances.css`
+
+Implementation of Phase 7 Tasks 7.3 (group review surface — Members
+section) + 7.4 (multi-lane composed view) per the accepted design at
+`docs/studio-design/ACCEPTED/2026-05-29-group-review-surface/` —
+Direction B (composed-default with list-toggle) for the group review
+surface + Direction 1 (pull-tab on row edge) for the member-of badge
+on dashboard rows.
+
+**Files created**
+
+- `packages/studio/src/pages/entry-review/members-section.ts` — the
+  Members section renderer; `renderMembersSection(input)` returns the
+  populated composed/list view OR the empty-state CTA OR `''` per the
+  four-shape contract documented in the module's docblock.
+- `plugins/deskwork-studio/public/css/entry-review-members.css` —
+  press-check styling for the section (paper / kraft / proof-blue
+  token vocabulary; no new tokens).
+- `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts`
+  — client controller for the composed↔list toggle (localStorage
+  persistence keyed on the group UUID), the empty-state CTA
+  clipboard-copy, and the per-member-row URL clipboard-copy.
+- `plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts` —
+  client controller for the row `.er-row-member-tab` toggle +
+  popover back-link clipboard-copy.
+- `packages/studio/test/entry-review-group-members-section-list.test.ts`
+  — list-mode rendering integration test (real sidecars, real lane
+  configs, real templates).
+- `packages/studio/test/entry-review-group-members-section-composed.test.ts`
+  — composed-mode rendering integration test (multi-lane scoped
+  composition + `is-empty` stage assertion).
+- `packages/studio/test/dashboard-member-row-badge.test.ts` — dashboard
+  row badge integration test (solo + multi-parent + non-member).
+- `packages/studio/test/entry-review-group-empty-members.test.ts` —
+  empty-state CTA + artifactPath-fallback integration test (2 cases).
+
+**Files modified**
+
+- `packages/core/src/groups/index.ts` — barrel now exports
+  `isPopulatedGroupEntry` (was previously implementation-internal
+  under `./types.ts`).
+- `packages/studio/src/pages/entry-review/data.ts` —
+  `loadEntryReviewData` returns `groupMembers: GroupMembersBundle |
+  null`; new `loadGroupMembersBundle` resolves member sidecars +
+  lane configs + pipeline templates for populated groups. Missing
+  members surface as `missingMemberUuids`, not silently dropped.
+- `packages/studio/src/pages/entry-review/index.ts` — accepts
+  `?members=<mode>` query string; wires the new section after the
+  `er-draft-frame` body via `renderEntryMembersSection`; adds the
+  new CSS to the page's CSS list.
+- `packages/studio/src/server.ts` — threads `?members=` from the
+  request to the entry-review query.
+- `packages/studio/src/pages/dashboard/data.ts` — `loadDashboardData`
+  now builds `parentsByMemberUuid: ReadonlyMap<string, readonly
+  Entry[]>` in one pass over the sidecar set.
+- `packages/studio/src/pages/dashboard/swimlane-shell.ts` — accepts
+  `parentsByMemberUuid` in its input; threads through to
+  `renderSwimlane`. The mobile `renderLaneStack` does NOT receive
+  the index — it uses the list-body chrome, not the kanban
+  `.er-row-shell`; a comment names the asymmetry explicitly so the
+  next reader doesn't read it as an IOU.
+- `packages/studio/src/pages/dashboard/swimlane-card.ts` —
+  `renderSwimlane` + `renderStageCol` accept and thread
+  `parentsByMemberUuid` to `renderRow`.
+- `packages/studio/src/pages/dashboard/section.ts` — `renderRow`
+  accepts `parentsByMemberUuid` (default = empty map for back-compat);
+  new local helpers `renderMemberTab` + `renderMemberPopover` emit
+  the kraft-color pull-tab on the row's left edge + the inline
+  popover listing every parent group. The shell carries
+  `.has-member-tab` when at least one parent exists (CSS uses it to
+  inset the row's foreground for the 22px tab column).
+- `packages/studio/src/pages/dashboard.ts` — passes
+  `data.parentsByMemberUuid` into `renderSwimlanesShell`.
+- `plugins/deskwork-studio/public/css/dashboard-row-affordances.css`
+  — appended `.er-row-member-tab`, `.er-row-member-popover`,
+  `.er-row-member-link` rules; mirrors `.er-marginalia-tab` /
+  `.er-outline-tab` shape per `.claude/rules/affordance-placement.md`.
+- `plugins/deskwork-studio/public/src/entry-review-client.ts` —
+  invokes `initGroupMembersSection()` from the press-check init.
+- `plugins/deskwork-studio/public/src/editorial-studio-client.ts` —
+  invokes `initRowMemberTab()` from the dashboard init.
+- `packages/studio/test/dashboard-swimlane-card-unit.test.ts` —
+  threaded the new `parentsByMemberUuid` empty-map arg into the
+  `renderSwimlane` call so the existing AUDIT-20260528-07 test
+  keeps compiling against the widened signature.
+
+**Test count delta** — studio suite 933 → 938 tests passing (+5
+across the four new files: 1 list, 1 composed, 1 member-row-badge,
+2 empty-members). Core suite unchanged (764 passing — the only
+core-side delta is the `isPopulatedGroupEntry` re-export, which
+trades a private subpath import for the barrel; no behavior
+change).
+
+**Phase 5 swimlane reuse pattern** — the composed view does NOT
+re-instantiate the Phase 5 swimlane primitive (`renderSwimlane`
+takes a `LaneBucket` shape that's bound to the dashboard's lane
+machinery + focus state, which doesn't apply to the scoped
+group-member-set view). Instead, `members-section.ts` rebuilds the
+swim CHROME — `.er-members-swim` (header), `.er-members-stage`
+(per-stage row), `.er-members-card` (per-member card) — using the
+same press-check tokens and the same `stageGlyph()` lookup so the
+visual signature matches Phase 5 without coupling the entry-review
+surface to dashboard internals. The compositor walks the same
+`template.linearStages` + `template.offPipelineStages` sequence the
+dashboard swim does, so empty stages render with the same
+`is-empty` modifier the dashboard convention names.
+
+**Pull-tab affordance class** — `.er-row-member-tab` mirrors the
+`.er-outline-tab` / `.er-marginalia-tab` shape per the
+`.claude/rules/affordance-placement.md` § "Reference patterns in
+this codebase" mandate. Vertical text via `writing-mode:
+vertical-rl`, left-edge anchored, kraft accent color so it reads
+distinct from stage (red-pencil) or action (proof-blue). The
+expanded state inverts the colors (kraft fill, paper text) — same
+inversion pattern the marginalia-tab uses on activation.
+
+**Structural decisions made along the way**
+
+1. `members` query param on the entry-review route — added to
+   `EntryReviewQuery` and routed through `server.ts`'s
+   `c.req.query('members')`. Default = composed per the picked
+   direction; client controller flips + persists per-group via
+   localStorage.
+2. Missing-member rows — render as `.er-member-row--missing`
+   instead of silently dropping. The doctor `group-member-missing`
+   rule (Task 7.5.2) is the loud signal; the surface mirrors the
+   same finding inline so operators see the broken reference
+   without leaving the page.
+3. Lane-stack (mobile) NOT wired with the pull-tab in this commit —
+   the mobile lane-stack uses the list-body chrome, not the kanban
+   `.er-row-shell`, so a sibling rendering pass against the list-body
+   chrome is required. Track 2's spec-compliance review flagged this
+   as HIGH because the picked Direction 1 mockup is mobile-first.
+   Tracked as Step 7.3.5 in the workplan + GitHub issue #371; the
+   feature is NOT closeout-ready until that step lands. Per the
+   project's discipline rule, deferrals get both workplan + issue
+   recording — see Track 2 review actions for the resolution path.
+4. `loadLaneConfig` failures during member loading swallow rather
+   than crash — a member with a stale lane id surfaces in the
+   composed view as "unrouted" (rendered with the raw lane id) and
+   in the list view's per-row meta. The list-mode test does NOT
+   exercise this branch; the empty-members fallback test exercises
+   the no-lane-resolution path indirectly through the bare-id
+   default lane setup.
+5. The composed view's `data-template-id` attribute drives the
+   lane-accent color via CSS — no per-lane `class="lane-<id>"`
+   coupling for non-default templates. This avoids the "we forgot
+   to teach the CSS about lane X" failure mode the dashboard hit
+   in pre-Task-5.2 days.
+
+Workplan deltas + closing — Task 7.3.1, 7.3.2, 7.3.3, 7.3.4 ticked;
+Task 7.4.1, 7.4.2, 7.4.3 ticked. Phase 7's remaining tasks (7.5
+doctor rules + 7.6 studio group-management page + 7.7 iterate
+semantics on groups + 7.8 integration tests) are explicitly out of
+scope for this dispatch and remain open. Phase 7 parent issue (#306)
+stays open until those tasks land. No GitHub `Closes` keyword on
+the commit.
+
+`Status` backfilled to `fixed-b642cd6` in the immediately-following
+docs commit per the established two-commit pattern. (Note: the
+backfill commit `3d670f5` originally wrote a markdown table format
+that did NOT match the canonical `Status: fixed-<sha>` grep contract
+— that's been corrected at the AUDIT-29 header above as part of the
+Track 2 review actions; see AUDIT-30 below.)
+
+### AUDIT-20260529-30 — review-action: cancelled `unsafe(laneClass)` HTML-injection risk in renderListRow
+
+Finding-ID: AUDIT-20260529-30
+Status:     fixed-cc45787
+Severity:   medium
+Surface:    `packages/studio/src/pages/entry-review/members-section.ts:217-228`
+
+`renderListRow` wrapped the lane-class composition in `unsafe(...)`,
+bypassing the html-template's escaping. `member.lane` is Zod-typed as
+`z.string().min(1)` (`packages/core/src/schema/entry.ts:172`) — NOT
+regex-bound to the canonical lane-id charset. A malformed sidecar
+with `lane: 'x" onclick="alert(1)'` would have broken out of the
+class attribute when rendered.
+
+Resolution: import `LANE_ID_REGEX` from `@deskwork/core/lanes` and
+validate the lane id before composing the class. If it fails the
+regex, fall back to `lane-unrouted` (same shape the loader uses for
+genuinely-missing lane configs). The `unsafe(...)` wrapper is now
+safe because the input is regex-validated against the canonical
+charset.
+
+Track 3 finding #1 from the per-commit review of b642cd6 + 3d670f5.
+
+### AUDIT-20260529-31 — review-action: pull-tab width 22px failed WCAG 2.5.8 (24x24 minimum)
+
+Finding-ID: AUDIT-20260529-31
+Status:     fixed-cc45787
+Severity:   medium
+Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:250`
+
+`.er-row-member-tab` was 22px wide. WCAG 2.2 SC 2.5.8 (Target Size
+Minimum, AA) requires 24x24 CSS pixels. The horizontal axis failed
+by 2px. The spacing exception did not apply because the row
+foreground is the immediate right neighbor at 4px clearance, well
+under 24px.
+
+Resolution: widened the tab from 22px to 24px; adjusted
+`.er-row-shell.has-member-tab .er-row-fg`'s `padding-left` from 26px
+to 28px to preserve the row's content layout. Both axes now meet
+the WCAG floor.
+
+Track 3 finding #2 from the per-commit review of b642cd6 + 3d670f5.
+
+### AUDIT-20260529-32 — review-action: kraft-on-paper-2 text contrast 3.58:1 failed WCAG 1.4.3 AA
+
+Finding-ID: AUDIT-20260529-32
+Status:     fixed-cc45787
+Severity:   medium
+Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:275-304`
+
+`.er-row-member-tab-label` and `.er-row-member-tab-count` text used
+`var(--er-kraft)` (#8A7250) on `var(--er-paper-2)` (#ECE6D4),
+computed contrast ratio approx 3.58:1. The label is 0.5625rem (~9px)
+small text. WCAG 2.1 SC 1.4.3 AA requires 4.5:1 for small text; the
+text failed by ~0.92.
+
+Resolution: changed the resting-state label color to
+`var(--er-ink-soft)` (#3A3530) on `var(--er-paper-2)` = 9.79:1; the
+count badge text to `var(--er-ink)` (#1A1614) on `var(--er-paper)` =
+14.91:1. Increased label font-size from 0.5625rem to 0.625rem
+(~10px) and weight from 600 to 700. The kraft accent is preserved
+through the count badge's border + the expanded-state background
+flip, so the affordance still reads as a kraft "belonging-to"
+affordance overall. Expanded-state contrast (paper on kraft, ~3.84:1)
+left as-is because the expanded state is transient and the primary
+information delivered is in the popover content, not the tab label
+which the operator only sees while engaging the tap.
+
+Track 3 finding #3 from the per-commit review of b642cd6 + 3d670f5.
+
+### AUDIT-20260529-33 — review-action: AUDIT-29 used non-canonical Status format (broke queue-check grep)
+
+Finding-ID: AUDIT-20260529-33
+Status:     fixed-cc45787
+Severity:   low
+Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:2728-2732`
+
+The AUDIT-29 entry as originally written (b642cd6) used a markdown
+table format `| fixed (b642cd6) |` for the Status field. Every
+prior audit entry follows the canonical `Status:     fixed-<sha>`
+field-format documented in the file's header and grep-anchored by
+the canonical queue check `grep -nE "^Status:[[:space:]]+fixed-"`.
+The non-canonical entry would NOT have surfaced in the standard
+triage queue.
+
+Resolution: rewrote the AUDIT-29 header block to use the canonical
+`Finding-ID / Status / Severity / Surface` field-format. The
+queue-check grep contract is preserved.
+
+Track 2 finding #2 from the per-commit review of b642cd6 + 3d670f5.
+
+### AUDIT-20260529-34 — review-action-deferred: mobile lane-stack missing pull-tab (Track 2 HIGH; deferred to #371)
+
+Finding-ID: AUDIT-20260529-34
+Status:     acknowledged-2026-05-29-issue-#371
+Severity:   high
+Surface:    `packages/studio/src/pages/dashboard/swimlane-shell.ts:258-271`, `packages/studio/src/pages/dashboard/lane-stack-card.ts`, `packages/studio/src/pages/dashboard/swimlane-list-body.ts`
+
+Track 2's spec-compliance review of b642cd6 flagged HIGH: the
+implementation wires the kraft pull-tab into the desktop kanban
+swim path only. The mobile lane-stack rendering (the primary
+viewport per the brief's "mobile-first" stance and the picked
+Direction 1 mockup) does NOT render the affordance. A mobile
+operator cannot discover that an entry belongs to a group.
+
+The implementer's audit-log narrative framed this as a "future
+operator need" — exactly the "Just for now is bullshit" pattern
+the discipline rule names. Resolution: filed
+[#371](https://github.com/audiocontrol-org/deskwork/issues/371)
+with the deferral rationale + scoped Step 7.3.5 into the workplan
+per the discipline rule's two-track recording requirement. The
+audit-log narrative for AUDIT-29 has been amended to surface the
+deferral path.
+
+Phase 7 closeout is BLOCKED on Step 7.3.5 landing (mobile lane-stack
++ desktop list-mode-body pull-tab parity). Track 2 finding #1 + #5
+from the per-commit review of b642cd6 + 3d670f5.
+
+### AUDIT-20260529-35 — review-action-deferred: composed view silently drops unrouted members (Track 3 #4; deferred)
+
+Finding-ID: AUDIT-20260529-35
+Status:     acknowledged-2026-05-29-issue-#372
+Severity:   low
+Surface:    `packages/studio/src/pages/entry-review/members-section.ts:99-119`
+
+`bucketMembersByLane` skips members whose `lane === undefined` AND
+members whose `lane` is not in `laneConfigsById`. In list view they
+still render (with `lane-unrouted` styling); in composed view they
+vanish with no visible count discrepancy on the toggle. The operator
+cannot tell composed view shows fewer entries unless they cross-check
+totals. Tracked at
+[#372](https://github.com/audiocontrol-org/deskwork/issues/372)
+with the recommended unrouted-indicator design.
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index 4277cbb..79e7ea8 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -376,16 +376,17 @@ Schema delta: `archivedAt?: string` added to `EntrySchema` (`packages/core/src/s
 
 ### Task 7.3: Group review surface — Members section
 
-- [ ] Step 7.3.1: When the entry's `members[]` is non-empty, the review surface renders an additional "Members" section.
-- [ ] Step 7.3.2: Each member row shows: slug, title, lane (badge), current stage, clipboard-copy link to the member's review surface.
-- [ ] Step 7.3.3: Member entries' own rows on the lane dashboard show a "Member of: <group slug>" badge with back-link.
-- [ ] Step 7.3.4: When an entry is a member of multiple groups, the badge shows all parents.
+- [x] Step 7.3.1: When the entry's `members[]` is non-empty, the review surface renders an additional "Members" section. — New module `packages/studio/src/pages/entry-review/members-section.ts` (≤350 lines) exports `renderMembersSection` taking the resolved group + ordered members + lane-config + template index + initial view mode. `loadEntryReviewData` extended (`packages/studio/src/pages/entry-review/data.ts`) to bundle `GroupMembersBundle` (resolved member sidecars + missing-member UUIDs + used-lane configs + their pipeline templates) only when `isPopulatedGroupEntry(entry)` — pay-for-what-you-use. The renderer is inserted after `er-draft-frame` inside the `<article class="er-page">` via a thin `renderEntryMembersSection` helper at the bottom of `entry-review/index.ts`. Non-group entries skip the section entirely (returns `''`). Per the accepted Direction B brief at `docs/studio-design/ACCEPTED/2026-05-29-group-review-surface/brief.md`.
+- [x] Step 7.3.2: Each member row shows: slug, title, lane (badge), current stage, clipboard-copy link to the member's review surface. — List-mode rendering (`?members=list`) emits one `.er-member-row` per member in `group.members[]` insertion order; each row carries the lane name (badge), stage glyph + name, italic-display title, and a clipboard-copy anchor at `/dev/editorial-review/entry/<memberUuid>`. The new client controller `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts` wires the anchor click to `copyOrShowFallback` so the row click both navigates AND copies the URL. Missing-member sidecars (`group.members[]` references that didn't resolve) surface as `.er-member-row--missing` instead of silently dropping — mirrors the doctor `group-member-missing` rule's intent at the studio surface.
+- [x] Step 7.3.3: Member entries' own rows on the lane dashboard show a "Member of: <group slug>" badge with back-link. — `loadDashboardData` (`packages/studio/src/pages/dashboard/data.ts`) now builds a `parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]>` index in one pass over the sidecar set. The index threads through `renderSwimlanesShell` → `renderSwimlane` → `renderStageCol` → `renderRow` (4-parameter extension to each signature, default = empty map for back-compat). `renderRow` emits a kraft-color `.er-row-member-tab` on the row's LEFT edge with vertical mono caps "MEMBER" label + circular count badge (mirrors `.er-marginalia-tab` / `.er-outline-tab` precedent per `.claude/rules/affordance-placement.md`). Tap → row carries `.is-member-expanded`; the inline `.er-row-member-popover` lists every parent group as a clipboard-copy back-link (`Member of [<title>](<url>)`). Client controller at `plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts` (registered by `editorial-studio-client.ts`). CSS added to `dashboard-row-affordances.css`. Non-member rows render NO tab — chrome doesn't pay for what doesn't apply.
+- [x] Step 7.3.4: When an entry is a member of multiple groups, the badge shows all parents. — The count badge on `.er-row-member-tab` reflects `parents.length`; the popover lists every parent group (no first-N truncation in v1). Multi-parent test case in `packages/studio/test/dashboard-member-row-badge.test.ts` asserts a 2-group member surfaces count=2 + both parent links in the popover. Single-parent + non-member cases asserted alongside.
+- [ ] Step 7.3.5: wire member-of pull-tab on the **mobile lane-stack** + the **desktop list-mode-body** so the pull-tab affordance reaches the same viewport classes the rest of the dashboard reaches. Tracked by [#371](https://github.com/audiocontrol-org/deskwork/issues/371) (AUDIT-20260529-34 deferral from Track 2 spec-compliance review of `b642cd6`). The desktop kanban path is wired (`renderRow` in `packages/studio/src/pages/dashboard/section.ts`); the mobile lane-stack (`lane-stack-card.ts`) + desktop list-mode within a swimlane (`swimlane-list-body.ts`) both use `.lb-row` chrome rather than `.er-row-shell`, so they need a sibling pass to render the pull-tab variant. Defer-rationale: the implementer dispatch for Tasks 7.3 + 7.4 honestly carried the desktop kanban path but did not extend to the `.lb-row` chrome; per the discipline rule's two-track recording, this is filed as both a workplan back-link AND a GH issue rather than buried in the audit-log narrative. Phase 7 closeout is BLOCKED on this step landing.
 
 ### Task 7.4: Group multi-lane review composition
 
-- [ ] Step 7.4.1: A group's review surface renders members in a coordinated multi-lane composition — one column per lane the group spans, members positioned in their lane's stage column, with the group's own stage above.
-- [ ] Step 7.4.2: Reuse Phase 5's multi-lane composed-view machinery; scope it to one group's member set.
-- [ ] Step 7.4.3: Empty `members[]` falls back to a single-column rendering of the group's own content body (or empty-state if no `artifactPath`).
+- [x] Step 7.4.1: A group's review surface renders members in a coordinated multi-lane composition — one column per lane the group spans, members positioned in their lane's stage column, with the group's own stage above. — Composed mode (`?members=composed`, server-side default per Direction B) emits one `.er-members-swim` block per lane that contains at least one member; lanes the group's members don't span are NOT rendered (chrome doesn't pay for what doesn't apply). Each swim's body walks the lane's `template.linearStages` + `template.offPipelineStages` in declared order; empty stages render with `is-empty` so the pipeline shape stays visible per DESIGN-STANDARDS.md § "Favor structure over scrolling". The group's own stage stays in the existing title-strip above the members section (the existing surface chrome already carries it; this work doesn't displace it).
+- [x] Step 7.4.2: Reuse Phase 5's multi-lane composed-view machinery; scope it to one group's member set. — The composed renderer (`renderComposedLane` / `renderComposedBody` in `members-section.ts`) mirrors the Phase 5 swimlane primitive shape — `.er-members-swim` (header + stage list), `.er-members-stage` (glyph + name + count + optional body), `.er-members-card` (per-member italic-display title + mono slug + ↪ open chevron). Stage glyphs reuse `dashboard/swimlane-stage-glyph.ts:stageGlyph(stage)` so the editorial / visual / qa-plan vocabularies are consistent across both surfaces. Lane accents (proof-blue for editorial, kraft for visual) reuse the press-check token vocabulary from `editorial-review.css` — no new tokens introduced. The composed body inside the section is keyed `data-body-composed`, the list body `data-body-list`; the section-head toggle pill flips both via the client controller's `applyMode`.
+- [x] Step 7.4.3: Empty `members[]` falls back to a single-column rendering of the group's own content body (or empty-state if no `artifactPath`). — `renderMembersSection` returns `''` (skips the section entirely) when the group is declared-empty AND carries an `artifactPath` — the existing `er-draft-frame` body renderer is the canonical fallback, no duplication required. When the declared-empty group has NO `artifactPath`, the section renders a centered empty-state CTA per the accepted mockup — `⊟` glyph + "No members yet" head + "this group is metadata-only. populate it with `/deskwork:group add-member`." description + a "+ Add member" button that the client controller wires to clipboard-copy `/deskwork:group add-member <group-slug> <MEMBER-SLUG>`. Both branches covered by `packages/studio/test/entry-review-group-empty-members.test.ts`.
 
 ### Task 7.5: Doctor rules — recursion + dangling members
 
diff --git a/packages/core/src/groups/index.ts b/packages/core/src/groups/index.ts
index 11c3894..08df0c2 100644
--- a/packages/core/src/groups/index.ts
+++ b/packages/core/src/groups/index.ts
@@ -9,7 +9,7 @@
  * dashboard, doctor's group-* rules, the per-verb CLI handlers).
  */
 
-export { isArchivedEntry, isGroupEntry } from './types.ts';
+export { isArchivedEntry, isGroupEntry, isPopulatedGroupEntry } from './types.ts';
 
 // Phase 7 Task 7.2 — group CRUD operations consumed by the CLI
 // `group` verb. Each named export is the per-verb core function.
diff --git a/packages/core/src/lanes/index.ts b/packages/core/src/lanes/index.ts
index d4789aa..e3f6e9e 100644
--- a/packages/core/src/lanes/index.ts
+++ b/packages/core/src/lanes/index.ts
@@ -11,6 +11,7 @@
 export {
   LaneConfigSchema,
   ArtifactKindSchema,
+  LANE_ID_REGEX,
   type LaneConfig,
   type StrictLaneConfig,
   type ArtifactKind,
diff --git a/packages/studio/src/pages/dashboard.ts b/packages/studio/src/pages/dashboard.ts
index 90ff4eb..97e3e23 100644
--- a/packages/studio/src/pages/dashboard.ts
+++ b/packages/studio/src/pages/dashboard.ts
@@ -101,6 +101,7 @@ export async function renderDashboard(
     defaultSite,
     projectRoot: ctx.projectRoot,
     focusFromUrl,
+    parentsByMemberUuid: data.parentsByMemberUuid,
   });
 
   // v7 architecture (Step 2.2.9 — studio-mobile-first): the Desk absorbs
diff --git a/packages/studio/src/pages/dashboard/data.ts b/packages/studio/src/pages/dashboard/data.ts
index 76568f5..3b7363b 100644
--- a/packages/studio/src/pages/dashboard/data.ts
+++ b/packages/studio/src/pages/dashboard/data.ts
@@ -20,6 +20,7 @@ import { listOpen } from '@deskwork/core/review/pipeline';
 import type { DraftWorkflowItem } from '@deskwork/core/review/types';
 import type { Platform } from '@deskwork/core/types';
 import type { DeskworkConfig } from '@deskwork/core/config';
+import { isPopulatedGroupEntry } from '@deskwork/core/groups';
 import { loadLaneBuckets, type LaneBucketsResult } from './lane-data.ts';
 import { isLegacyEditorialStage } from './legacy-stage.ts';
 
@@ -68,6 +69,18 @@ export interface DashboardData {
    * eight-stage section renderer for Shortform/Adjacent siblings).
    */
   readonly lanes: LaneBucketsResult;
+  /**
+   * Reverse-lookup index: member UUID → ordered list of parent group
+   * entries. Built once per dashboard render so per-row renderers can
+   * surface the "Member of:" pull-tab without scanning every entry per
+   * row (Phase 7 Task 7.3 — Direction 1 picked).
+   *
+   * Only populated groups (`isPopulatedGroupEntry`) contribute; entries
+   * that aren't members of any group have NO entry in this map (the
+   * row renderer treats absent + empty as the same "render no tab"
+   * signal).
+   */
+  readonly parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]>;
 }
 
 function bucketize(entries: readonly Entry[]): Map<Stage, Entry[]> {
@@ -143,6 +156,35 @@ export function bucketizeShortform(
   return out;
 }
 
+/**
+ * Build the member→parents reverse-lookup index from the loaded
+ * sidecar set (Phase 7 Task 7.3 Step 7.3.3). One pass over `entries`:
+ * for every populated group, push its sidecar into the per-member
+ * accumulator. Iteration order of the resulting Map's values is the
+ * order in which parents were encountered (groups are scanned in
+ * sidecar-load order); operators don't rely on this ordering yet
+ * (no spec calls for a "primary parent" notion), so the encounter
+ * order is the canonical surface order.
+ */
+function buildParentsIndex(
+  entries: readonly Entry[],
+): ReadonlyMap<string, readonly Entry[]> {
+  const index = new Map<string, Entry[]>();
+  for (const entry of entries) {
+    if (!isPopulatedGroupEntry(entry)) continue;
+    const members = entry.members ?? [];
+    for (const memberUuid of members) {
+      const arr = index.get(memberUuid);
+      if (arr === undefined) {
+        index.set(memberUuid, [entry]);
+      } else {
+        arr.push(entry);
+      }
+    }
+  }
+  return index;
+}
+
 export async function loadDashboardData(
   projectRoot: string,
   config: DeskworkConfig,
@@ -156,5 +198,13 @@ export async function loadDashboardData(
   // legacy projects without `.deskwork/lanes/` participate in the
   // new model without explicit operator setup.
   const lanes = await loadLaneBuckets(projectRoot, config, entries);
-  return { entries, byStage, shortformWorkflows, shortformByPlatform, lanes };
+  const parentsByMemberUuid = buildParentsIndex(entries);
+  return {
+    entries,
+    byStage,
+    shortformWorkflows,
+    shortformByPlatform,
+    lanes,
+    parentsByMemberUuid,
+  };
 }
diff --git a/packages/studio/src/pages/dashboard/section.ts b/packages/studio/src/pages/dashboard/section.ts
index 0c74788..8637e8f 100644
--- a/packages/studio/src/pages/dashboard/section.ts
+++ b/packages/studio/src/pages/dashboard/section.ts
@@ -11,6 +11,61 @@ import type { Entry } from '@deskwork/core/schema/entry';
 import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
 import { renderRowActions, renderRowDrawer, renderRowMenu } from './affordances.ts';
 
+/**
+ * Render the "Member of: N groups" pull-tab on the row's LEFT edge
+ * (Phase 7 Task 7.3 — Direction 1: pull-tab on row edge). Returns ''
+ * when the entry isn't a member of any populated group.
+ *
+ * Per `.claude/rules/affordance-placement.md`: the tab lives ON the
+ * row it affects, mirroring the `.er-marginalia-tab` /
+ * `.er-outline-tab` precedent. Vertical orientation (writing-mode
+ * vertical-rl) + edge-anchored placement + kraft accent.
+ *
+ * Tap → row enters `.is-expanded`; the inline popover below the row
+ * surfaces every parent group as a clipboard-copy link.
+ */
+function renderMemberTab(parents: readonly Entry[]): RawHtml {
+  if (parents.length === 0) return unsafe('');
+  return unsafe(html`
+    <button class="er-row-member-tab" type="button"
+      data-row-member-tab
+      data-parent-count="${parents.length}"
+      aria-expanded="false"
+      aria-label="Member of ${parents.length} ${parents.length === 1 ? 'group' : 'groups'}; tap to list parents">
+      <span class="er-row-member-tab-label" aria-hidden="true">Member</span>
+      <span class="er-row-member-tab-count" aria-hidden="true">${parents.length}</span>
+    </button>`);
+}
+
+function renderMemberPopover(parents: readonly Entry[]): RawHtml {
+  if (parents.length === 0) return unsafe('');
+  const linksRaw = parents
+    .map((parent) => {
+      const href = `/dev/editorial-review/entry/${parent.uuid}`;
+      const backLink = `Member of [${parent.title}](${href})`;
+      return html`
+        <a class="er-row-member-link"
+          href="${href}"
+          target="_blank"
+          rel="noopener"
+          data-parent-uuid="${parent.uuid}"
+          data-back-link="${backLink}">
+          <span class="er-row-member-link-name">${parent.title}</span>
+          <span class="er-row-member-link-slug">${parent.slug}</span>
+          <span class="er-row-member-link-open" aria-hidden="true">↪</span>
+        </a>`;
+    })
+    .join('');
+  const headLabel = parents.length === 1
+    ? 'Member of 1 group'
+    : `Member of ${parents.length} groups`;
+  return unsafe(html`
+    <div class="er-row-member-popover" data-row-member-popover hidden>
+      <div class="er-row-member-popover-head">${headLabel}</div>
+      ${unsafe(linksRaw)}
+    </div>`);
+}
+
 /**
  * Render one entry as a single dashboard row. Carries inline:
  *   - slug (linked to the review surface)
@@ -29,6 +84,7 @@ export function renderRow(
   index: number,
   template: StrictPipelineTemplate,
   defaultSite: string,
+  parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]> = new Map(),
 ): RawHtml {
   const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
   const search = [entry.slug, entry.title, entry.keywords.join(' ')].join(' ').toLowerCase();
@@ -58,10 +114,18 @@ export function renderRow(
   // probe code targets `.er-calendar-row` so the legacy class stays
   // on `.er-row-fg`, but the canonical attribute carriers are on the
   // shell. Test selectors should prefer `[data-row-shell]`.
+  // Phase 7 Task 7.3 Direction 1 — Member-of pull-tab on the row's
+  // LEFT edge when the entry is a member of one or more populated
+  // groups. The tab + popover are siblings of `.er-row-fg`; CSS
+  // anchors the tab at the row's left edge and reveals the popover
+  // when the row carries `.is-member-expanded`.
+  const parents = parentsByMemberUuid.get(entry.uuid) ?? [];
+  const memberClass = parents.length > 0 ? ' has-member-tab' : '';
   return unsafe(html`
-    <div class="er-row-shell" data-row-shell data-search="${search}"${depthAttrs}
+    <div class="er-row-shell${unsafe(memberClass)}" data-row-shell data-search="${search}"${depthAttrs}
       data-stage="${entry.currentStage}"
       data-uuid="${entry.uuid}" data-slug="${entry.slug}">
+      ${renderMemberTab(parents)}
       ${renderRowDrawer(entry, template, defaultSite)}
       <div class="er-row-fg er-calendar-row">
         <span class="er-row-num">№ ${String(index + 1).padStart(2, '0')}</span>
@@ -76,6 +140,7 @@ export function renderRow(
         ${renderRowActions(entry, template, defaultSite)}
       </div>
       ${renderRowMenu(entry, template, defaultSite)}
+      ${renderMemberPopover(parents)}
     </div>`);
 }
 
diff --git a/packages/studio/src/pages/dashboard/swimlane-card.ts b/packages/studio/src/pages/dashboard/swimlane-card.ts
index f065348..d5709d3 100644
--- a/packages/studio/src/pages/dashboard/swimlane-card.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-card.ts
@@ -152,6 +152,7 @@ function renderStageCol(
   glyph: string,
   isOffPipeline: boolean,
   isLocked: boolean,
+  parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]>,
 ): RawHtml {
   // Empty columns also pick up `er-section--empty` for back-compat
   // with the legacy compact-empty assertion (#112). The class lives
@@ -202,7 +203,7 @@ function renderStageCol(
     ? unsafe(html`<div class="empty-state" data-empty-stage-msg>${emptyHint}</div>`)
     : unsafe(
       entries
-        .map((e, i) => renderRow(e, i, template, defaultSite).__raw)
+        .map((e, i) => renderRow(e, i, template, defaultSite, parentsByMemberUuid).__raw)
         .join(''),
     );
 
@@ -383,6 +384,7 @@ export function renderSwimlane(
   bucket: LaneBucket,
   defaultSite: string,
   focusHidden: boolean,
+  parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]>,
 ): RawHtml {
   const { lane, template } = bucket;
   const lockedSet = new Set<string>(template.lockedStages ?? []);
@@ -397,6 +399,7 @@ export function renderSwimlane(
         stageGlyph(stage),
         false,
         lockedSet.has(stage),
+        parentsByMemberUuid,
       ).__raw,
     ),
     ...template.offPipelineStages.map((stage) =>
@@ -413,6 +416,7 @@ export function renderSwimlane(
         // so this is always false. Pass it explicitly to keep the
         // signature parallel.
         false,
+        parentsByMemberUuid,
       ).__raw,
     ),
   ].join('');
diff --git a/packages/studio/src/pages/dashboard/swimlane-shell.ts b/packages/studio/src/pages/dashboard/swimlane-shell.ts
index 0a8cc0c..c1ab4c4 100644
--- a/packages/studio/src/pages/dashboard/swimlane-shell.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-shell.ts
@@ -45,6 +45,7 @@ import { renderFocusStrip } from './swimlane-focus-strip.ts';
 import { renderSwimlane, renderSwimStub } from './swimlane-card.ts';
 import { renderLaneStack } from './lane-stack-card.ts';
 import type { LaneBucket, LaneBucketsResult } from './lane-data.ts';
+import type { Entry } from '@deskwork/core/schema/entry';
 
 export interface SwimlaneShellInput {
   readonly lanes: LaneBucketsResult;
@@ -66,6 +67,14 @@ export interface SwimlaneShellInput {
    * override that via localStorage (post-DOMContentLoaded).
    */
   readonly focusFromUrl: readonly string[] | null;
+  /**
+   * Member UUID → ordered list of parent group entries. Threaded
+   * through to `renderRow` so each member row renders its
+   * `.er-row-member-tab` pull-tab + parent-list popover (Phase 7
+   * Task 7.3 — Direction 1). Absent entries indicate the row is not
+   * a member of any populated group (no tab rendered).
+   */
+  readonly parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]>;
 }
 
 /**
@@ -162,7 +171,7 @@ function countTotal(lanes: LaneBucketsResult): number {
  * the dashboard renders a sane empty state instead of crashing.
  */
 export function renderSwimlanesShell(input: SwimlaneShellInput): RawHtml {
-  const { lanes, defaultSite, focusFromUrl, projectRoot } = input;
+  const { lanes, defaultSite, focusFromUrl, projectRoot, parentsByMemberUuid } = input;
   const projectKey = projectKeyHash(projectRoot);
   const laneIds = Array.from(lanes.byLane.keys());
   if (laneIds.length === 0) {
@@ -211,7 +220,7 @@ export function renderSwimlanesShell(input: SwimlaneShellInput): RawHtml {
       const swimHidden = !row.inFocus;
       const stubHidden = row.inFocus;
       return (
-        renderSwimlane(bucket, defaultSite, swimHidden).__raw
+        renderSwimlane(bucket, defaultSite, swimHidden, parentsByMemberUuid).__raw
         + renderSwimStub(row, stubHidden).__raw
       );
     })
@@ -250,6 +259,11 @@ export function renderSwimlanesShell(input: SwimlaneShellInput): RawHtml {
   // alongside the desktop bay-shell body; CSS gates which one paints
   // at any given viewport. The bay-head (focus strip, sheet trigger)
   // remains the cross-viewport chrome — both shells share it.
+  // Mobile lane-stack (`renderLaneStack`) uses the list-body chrome
+  // rather than the kanban `.er-row-shell` from section.ts, so the
+  // member-of pull-tab affordance isn't rendered there. Only the
+  // desktop swim path (kanban grid) carries the parentsByMemberUuid
+  // index per the accepted Direction 1 mockup (Phase 7 Task 7.3).
   const laneStackRaw = renderLaneStack(lanes.byLane, focused, defaultSite).__raw;
 
   return unsafe(html`
diff --git a/packages/studio/src/pages/entry-review/data.ts b/packages/studio/src/pages/entry-review/data.ts
index 3de9d4d..4191044 100644
--- a/packages/studio/src/pages/entry-review/data.ts
+++ b/packages/studio/src/pages/entry-review/data.ts
@@ -32,6 +32,17 @@ import {
   type IterationContent,
 } from '@deskwork/core/iterate/history';
 import { listEntryAnnotations } from '@deskwork/core/entry/annotations';
+import { readSidecar } from '@deskwork/core/sidecar';
+import { isPopulatedGroupEntry } from '@deskwork/core/groups';
+import {
+  listLaneConfigs,
+  loadLaneConfig,
+  type StrictLaneConfig,
+} from '@deskwork/core/lanes';
+import {
+  loadPipelineTemplate,
+  type StrictPipelineTemplate,
+} from '@deskwork/core/pipelines';
 import type { Entry, Stage } from '@deskwork/core/schema/entry';
 
 const VALID_STAGES: ReadonlySet<Stage> = new Set<Stage>([
@@ -48,6 +59,26 @@ function parseStageParam(raw: string | null | undefined): Stage | undefined {
 import type { CalendarEntry } from '@deskwork/core/types';
 import type { DraftAnnotation } from '@deskwork/core/review/types';
 
+/**
+ * When the entry is a populated group (Phase 7 Task 7.3 + 7.4), the
+ * loader resolves each member sidecar plus the lane configs + pipeline
+ * templates the members span. Members are returned in the original
+ * `group.members[]` insertion order. Missing-member UUIDs (sidecar
+ * didn't resolve) are returned separately so the surface can render a
+ * "missing" row inline rather than silently dropping.
+ *
+ * `laneConfigsById` iterates in operator-configured lane order (per
+ * `listLaneConfigs`) — the same order the dashboard uses — so the
+ * composed view's per-lane block ordering is consistent across
+ * surfaces.
+ */
+export interface GroupMembersBundle {
+  readonly members: readonly Entry[];
+  readonly missingMemberUuids: readonly string[];
+  readonly laneConfigsById: ReadonlyMap<string, StrictLaneConfig>;
+  readonly templatesById: ReadonlyMap<string, StrictPipelineTemplate>;
+}
+
 export interface EntryReviewData {
   readonly entry: Entry;
   readonly artifactPath: string;
@@ -65,6 +96,13 @@ export interface EntryReviewData {
   /** The matching CalendarEntry, when present. Drives index-bound
    *  scrapbook resolution; null falls back to slug-template paths. */
   readonly calendarEntry: CalendarEntry | null;
+  /**
+   * Resolved group member bundle. `null` when the entry is not a
+   * populated group (no `members` array OR `members.length === 0`).
+   * Phase 7 Tasks 7.3 + 7.4. Loaded only when the group has members
+   * — pay-for-what-you-use per the project's "no fallback" rule.
+   */
+  readonly groupMembers: GroupMembersBundle | null;
 }
 
 export interface LoadOptions {
@@ -115,6 +153,83 @@ function parseVersionParam(raw: string | null | undefined): number | null {
   return parsed;
 }
 
+/**
+ * Resolve each member UUID to a sidecar; collect lane configs +
+ * pipeline templates for every lane the resolved members span.
+ *
+ * Missing-member sidecars are NOT silently dropped — they surface in
+ * `missingMemberUuids` so the renderer can show a "missing" row. This
+ * mirrors the doctor `group-member-missing` rule's intent (Task 7.5.2)
+ * at the studio surface.
+ *
+ * Lane configs are loaded for every member's lane (deduped). The
+ * resulting Map iterates in the operator-configured lane order from
+ * `listLaneConfigs` — the same order the dashboard's swimlane uses —
+ * so per-lane composed blocks render in a stable, operator-recognizable
+ * sequence.
+ */
+async function loadGroupMembersBundle(
+  projectRoot: string,
+  group: Entry,
+): Promise<GroupMembersBundle> {
+  const uuids = group.members ?? [];
+  const members: Entry[] = [];
+  const missing: string[] = [];
+  for (const uuid of uuids) {
+    try {
+      const sidecar = await readSidecar(projectRoot, uuid);
+      members.push(sidecar);
+    } catch {
+      // Sidecar didn't resolve — surface as missing rather than crash.
+      missing.push(uuid);
+    }
+  }
+
+  // Lane configs + templates: load only what the resolved members
+  // actually use. Iterate in operator-configured lane order.
+  const usedLaneIds = new Set<string>();
+  for (const m of members) {
+    if (m.lane !== undefined) usedLaneIds.add(m.lane);
+  }
+  const laneConfigsById = new Map<string, StrictLaneConfig>();
+  const templatesById = new Map<string, StrictPipelineTemplate>();
+  if (usedLaneIds.size > 0) {
+    // Lane configs may not all exist on disk (legacy / mis-set). Skip
+    // missing ones — they show up in the members section as
+    // unrouted (lane label = the raw id).
+    const allLaneIds = listLaneConfigs(projectRoot);
+    for (const laneId of allLaneIds) {
+      if (!usedLaneIds.has(laneId)) continue;
+      try {
+        const config = loadLaneConfig(laneId, projectRoot);
+        const strict: StrictLaneConfig = {
+          id: config.id,
+          name: config.name,
+          pipelineTemplate: config.pipelineTemplate,
+          contentDir: config.contentDir,
+        };
+        laneConfigsById.set(strict.id, strict);
+        if (!templatesById.has(strict.pipelineTemplate)) {
+          const tpl = loadPipelineTemplate(strict.pipelineTemplate, projectRoot);
+          templatesById.set(strict.pipelineTemplate, tpl);
+        }
+      } catch {
+        // Lane / template failed to resolve. Skip — the member row
+        // surfaces as unrouted (lane label = its raw id) instead of
+        // crashing the surface render.
+        continue;
+      }
+    }
+  }
+
+  return {
+    members,
+    missingMemberUuids: missing,
+    laneConfigsById,
+    templatesById,
+  };
+}
+
 export async function loadEntryReviewData(
   ctx: StudioContext,
   entryId: string,
@@ -124,6 +239,9 @@ export async function loadEntryReviewData(
   const iterations = await listEntryIterations(ctx.projectRoot, entryId);
   const annotations = await listEntryAnnotations(ctx.projectRoot, entryId);
   const { site, calendarEntry } = findEntrySite(ctx, entryId);
+  const groupMembers = isPopulatedGroupEntry(resolved.entry)
+    ? await loadGroupMembersBundle(ctx.projectRoot, resolved.entry)
+    : null;
 
   // Historical-version handling. Only swap the markdown when both the
   // version param resolves and the journal has content for it. Stage
@@ -165,5 +283,6 @@ export async function loadEntryReviewData(
     annotations,
     site,
     calendarEntry,
+    groupMembers,
   };
 }
diff --git a/packages/studio/src/pages/entry-review/index.ts b/packages/studio/src/pages/entry-review/index.ts
index f294dd5..1c075fa 100644
--- a/packages/studio/src/pages/entry-review/index.ts
+++ b/packages/studio/src/pages/entry-review/index.ts
@@ -61,6 +61,11 @@ import {
 import { renderDecisionStrip } from './decision-strip.ts';
 import { renderShortcutsOverlay } from './shortcuts.ts';
 import { renderEntryNotFound } from './not-found.ts';
+import {
+  renderMembersSection,
+  parseMembersViewModeQuery,
+  type MembersViewMode,
+} from './members-section.ts';
 
 export type EntryReviewIndexGetter = (site: string) => ContentIndex;
 
@@ -73,6 +78,15 @@ export interface EntryReviewQuery {
    *  multiple stages. Optional; omitted falls back to the first
    *  chronological match (single-stage case). */
   readonly stage?: string | null;
+  /**
+   * `?members=<mode>` from the request URL. Selects the initial view
+   * mode for the group review surface's Members section (Phase 7
+   * Direction B). Accepts `composed` (default) or `list`. The client
+   * controller persists the operator's choice per-group via
+   * localStorage keyed on the group UUID; this query string is the
+   * server-side initial pick.
+   */
+  readonly members?: string | null;
 }
 
 export interface EntryReviewResult {
@@ -214,6 +228,10 @@ export async function renderEntryReviewPage(
   const affordances = getAffordances(data.entry);
   const state = buildState(data);
   const titleField = stringField(fm.title) ?? `Draft: ${data.entry.slug}`;
+  const membersInitialView: MembersViewMode = parseMembersViewModeQuery(
+    query.members ?? null,
+  );
+  const membersSectionHtml = renderEntryMembersSection(data, membersInitialView);
 
   // Calendar-entry lookup for the scrapbook drawer. The data loader
   // already attempted this; we re-derive the strict CalendarEntry here
@@ -310,6 +328,7 @@ export async function renderEntryReviewPage(
       ${renderEditToolbar(outlineHtml.length > 0, titleField)}
       <article class="er-page" data-entry-uuid="${data.entry.uuid}">
         ${unsafe(pageGrid)}
+        ${unsafe(membersSectionHtml)}
       </article>
       ${renderMarginaliaTab()}
       <button class="er-pencil-btn" data-add-comment-btn hidden type="button">Mark</button>
@@ -334,6 +353,7 @@ export async function renderEntryReviewPage(
         '/static/css/review-viewport.css',
         '/static/css/scrap-row.css',
         '/static/css/mobile-shell.css',
+        '/static/css/entry-review-members.css',
       ],
       bodyAttrs: 'data-review-ui="entry-review"',
       bodyHtml: body,
@@ -342,3 +362,34 @@ export async function renderEntryReviewPage(
     }),
   };
 }
+
+/**
+ * Render the optional Members section for the page body. Returns ''
+ * for non-group entries AND for empty groups that have an
+ * `artifactPath` (the existing body renderer is the fallback in that
+ * case). See `members-section.ts` for the four-shape contract.
+ */
+function renderEntryMembersSection(
+  data: EntryReviewData,
+  initialViewMode: MembersViewMode,
+): string {
+  const bundle = data.groupMembers;
+  if (bundle === null) {
+    return renderMembersSection({
+      group: data.entry,
+      members: [],
+      missingMemberUuids: [],
+      laneConfigsById: new Map(),
+      templatesById: new Map(),
+      initialViewMode,
+    });
+  }
+  return renderMembersSection({
+    group: data.entry,
+    members: bundle.members,
+    missingMemberUuids: bundle.missingMemberUuids,
+    laneConfigsById: bundle.laneConfigsById,
+    templatesById: bundle.templatesById,
+    initialViewMode,
+  });
+}
diff --git a/packages/studio/src/pages/entry-review/members-section.ts b/packages/studio/src/pages/entry-review/members-section.ts
new file mode 100644
index 0000000..10b3b6a
--- /dev/null
+++ b/packages/studio/src/pages/entry-review/members-section.ts
@@ -0,0 +1,395 @@
+/**
+ * Members section for the entry-keyed press-check surface (Phase 7
+ * Tasks 7.3 + 7.4 — Direction B: Composed multi-lane default with
+ * list toggle).
+ *
+ * Rendered AFTER the existing `er-draft-frame` body content when the
+ * resolved entry is a group (i.e. has a `members` array). The section
+ * has four mutually-exclusive shapes:
+ *
+ *   1. Populated group + composed mode (DEFAULT) — reuses the Phase 5
+ *      swimlane chrome scoped to the group's member set. One `.swim`
+ *      block per lane the members span; empty stages render with
+ *      `is-empty` per the dashboard convention so the pipeline shape
+ *      stays visible. Lanes that contain zero members of this group
+ *      are NOT rendered (chrome doesn't pay for what doesn't apply).
+ *   2. Populated group + list mode — flat list, one row per member
+ *      sorted in `group.members[]` insertion order. Each row carries
+ *      slug, title, lane tag, stage glyph + name, and a clipboard-copy
+ *      link to the member's own review surface.
+ *   3. Empty group (`members: []`) with no `artifactPath` — centered
+ *      empty-state CTA per the accepted mockup. CTA clipboard-copies a
+ *      `/deskwork:group add-member <group-slug> <member-slug>` template
+ *      via the client controller.
+ *   4. Empty group (`members: []`) WITH `artifactPath` — return '' (the
+ *      existing artifactPath body renderer remains the fallback).
+ *
+ * Non-group entries (no `members` field) skip the section entirely.
+ *
+ * Per `.claude/rules/affordance-placement.md`: the composed↔list toggle
+ * pill lives ON the section head (component-attached), mirroring the
+ * editorial-review `.er-marginalia-tab` / `.er-outline-tab` precedent.
+ * The client controller (`group-members-section.ts`) flips the toggle
+ * state + persists the operator's choice to localStorage keyed on the
+ * group's UUID.
+ *
+ * Per DESKWORK-STATE-MACHINE.md Commandment III: stage names are
+ * surfaced via press-check glyphs (◇ § ⊹ ✎ ※ ✓ ⊘ ✗). No `reviewState`,
+ * no review-state labels.
+ *
+ * Per the project's "no fallback" rule: missing-member sidecars are NOT
+ * silently dropped — they surface as a "missing" row in list mode (and
+ * the composed view simply skips them, since the row would have no lane
+ * to bucket into). Doctor's `group-member-missing` rule (Task 7.5.2)
+ * is the loud signal; this surface communicates the same signal
+ * inline rather than crashing the render.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import { stageGlyph } from '../dashboard/swimlane-stage-glyph.ts';
+import { isGroupEntry, isPopulatedGroupEntry } from '@deskwork/core/groups';
+import type { Entry } from '@deskwork/core/schema/entry';
+import { LANE_ID_REGEX, type StrictLaneConfig } from '@deskwork/core/lanes';
+import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
+
+export type MembersViewMode = 'composed' | 'list';
+
+export interface RenderMembersSectionInput {
+  /** The group entry (or non-group; in which case nothing renders). */
+  readonly group: Entry;
+  /** Resolved members in `group.members[]` order. May be empty. */
+  readonly members: readonly Entry[];
+  /** UUIDs from `group.members[]` that didn't resolve to a sidecar. */
+  readonly missingMemberUuids: readonly string[];
+  /**
+   * Lane configs keyed by lane id; the section needs the lane's display
+   * name + template binding to render the swim-head correctly.
+   */
+  readonly laneConfigsById: ReadonlyMap<string, StrictLaneConfig>;
+  /**
+   * Resolved pipeline templates keyed by template id (NOT lane id). The
+   * section uses each lane's `pipelineTemplate` field to look up the
+   * template once and walk its `linearStages` + `offPipelineStages`.
+   */
+  readonly templatesById: ReadonlyMap<string, StrictPipelineTemplate>;
+  /** Initial view mode rendered server-side (client may flip post-load). */
+  readonly initialViewMode: MembersViewMode;
+}
+
+interface LaneScopedBucket {
+  readonly lane: StrictLaneConfig;
+  readonly template: StrictPipelineTemplate;
+  /** Stage → members-of-this-group-in-this-lane-at-this-stage. */
+  readonly byStage: ReadonlyMap<string, readonly Entry[]>;
+  readonly memberCount: number;
+}
+
+/**
+ * Bucket members into lane → stage scoped to this group's member set.
+ * Members with `entry.lane === undefined` are skipped (the dashboard
+ * loudly warns on lane-less entries via `bucketIntoLanes`; here the
+ * Members section is a downstream consumer and we don't repeat the
+ * warning). Members referencing a lane id that isn't present in
+ * `laneConfigsById` are skipped — same routing-failure mode the
+ * dashboard's `unrouted` list captures.
+ *
+ * Lanes are emitted in the operator-configured lane order, which the
+ * caller threads in via the iteration order of `laneConfigsById`.
+ */
+function bucketMembersByLane(
+  members: readonly Entry[],
+  laneConfigsById: ReadonlyMap<string, StrictLaneConfig>,
+  templatesById: ReadonlyMap<string, StrictPipelineTemplate>,
+): readonly LaneScopedBucket[] {
+  const buckets = new Map<string, Map<string, Entry[]>>();
+  for (const member of members) {
+    if (member.lane === undefined) continue;
+    if (!laneConfigsById.has(member.lane)) continue;
+    let stageMap = buckets.get(member.lane);
+    if (stageMap === undefined) {
+      stageMap = new Map<string, Entry[]>();
+      buckets.set(member.lane, stageMap);
+    }
+    let arr = stageMap.get(member.currentStage);
+    if (arr === undefined) {
+      arr = [];
+      stageMap.set(member.currentStage, arr);
+    }
+    arr.push(member);
+  }
+
+  const out: LaneScopedBucket[] = [];
+  for (const [laneId, lane] of laneConfigsById) {
+    const stageMap = buckets.get(laneId);
+    if (stageMap === undefined) continue;
+    const template = templatesById.get(lane.pipelineTemplate);
+    if (template === undefined) continue;
+    // Emit every template stage so empty columns inside the lane
+    // render with `is-empty` — pipeline shape stays visible per
+    // DESIGN-STANDARDS.md § "Favor structure over scrolling".
+    const byStage = new Map<string, readonly Entry[]>();
+    let memberCount = 0;
+    for (const stage of template.linearStages) {
+      const arr = stageMap.get(stage) ?? [];
+      byStage.set(stage, arr);
+      memberCount += arr.length;
+    }
+    for (const stage of template.offPipelineStages) {
+      const arr = stageMap.get(stage) ?? [];
+      byStage.set(stage, arr);
+      memberCount += arr.length;
+    }
+    out.push({ lane, template, byStage, memberCount });
+  }
+  return out;
+}
+
+function renderMemberStageCard(member: Entry): RawHtml {
+  const reviewLink = `/dev/editorial-review/entry/${member.uuid}`;
+  return unsafe(html`
+    <a class="er-members-card lane-${member.lane ?? 'default'}"
+      href="${reviewLink}"
+      data-member-uuid="${member.uuid}"
+      title="Open ${member.title}">
+      <div class="er-members-card-body">
+        <div class="er-members-card-title">${member.title}</div>
+        <div class="er-members-card-slug">${member.slug}</div>
+      </div>
+      <span class="er-members-card-open" aria-hidden="true">↪</span>
+    </a>`);
+}
+
+function renderComposedLane(bucket: LaneScopedBucket): RawHtml {
+  const stages: string[] = [
+    ...bucket.template.linearStages,
+    ...bucket.template.offPipelineStages,
+  ];
+  const stagesRaw = stages
+    .map((stage) => {
+      const entries = bucket.byStage.get(stage) ?? [];
+      const isEmpty = entries.length === 0;
+      const emptyClass = isEmpty ? ' is-empty' : '';
+      const cardsRaw = isEmpty
+        ? ''
+        : entries.map((m) => renderMemberStageCard(m).__raw).join('');
+      const glyph = stageGlyph(stage);
+      return html`
+        <div class="er-members-stage${unsafe(emptyClass)}" data-stage="${stage}">
+          <div class="er-members-stage-head">
+            <span class="er-members-stage-glyph" aria-hidden="true">${glyph}</span>
+            <span class="er-members-stage-name">${stage}</span>
+            <span class="er-members-stage-count">${entries.length}</span>
+          </div>
+          ${isEmpty ? '' : unsafe(`<div class="er-members-stage-body">${cardsRaw}</div>`)}
+        </div>`;
+    })
+    .join('');
+
+  return unsafe(html`
+    <div class="er-members-swim lane-${bucket.lane.id}"
+      data-lane-id="${bucket.lane.id}"
+      data-template-id="${bucket.template.id}">
+      <div class="er-members-swim-head">
+        <span class="er-members-swim-name">${bucket.lane.name}</span>
+        <span class="er-members-swim-count">${bucket.memberCount} · ${bucket.template.id}</span>
+      </div>
+      <div class="er-members-swim-stages">${unsafe(stagesRaw)}</div>
+    </div>`);
+}
+
+function renderComposedBody(buckets: readonly LaneScopedBucket[]): RawHtml {
+  if (buckets.length === 0) {
+    return unsafe(html`
+      <div class="er-members-composed-empty" data-composed-empty>
+        <span class="er-members-composed-empty-msg">No members landed in any configured lane.</span>
+      </div>`);
+  }
+  const laneBlocks = buckets.map((b) => renderComposedLane(b).__raw).join('');
+  return unsafe(html`
+    <div class="er-members-composed" data-composed>${unsafe(laneBlocks)}</div>`);
+}
+
+function renderListRow(
+  member: Entry,
+  laneConfigsById: ReadonlyMap<string, StrictLaneConfig>,
+): RawHtml {
+  const reviewLink = `/dev/editorial-review/entry/${member.uuid}`;
+  const laneId = member.lane;
+  const laneConfig = laneId !== undefined ? laneConfigsById.get(laneId) : undefined;
+  const laneLabel = laneConfig !== undefined ? laneConfig.name : (laneId ?? 'unrouted');
+  // Validate lane id against LANE_ID_REGEX (`^[a-z0-9][a-z0-9-]*$`) before
+  // composing the class attribute — `member.lane` is only Zod-typed as a
+  // non-empty string, not regex-bound to the canonical lane-id charset.
+  // A malformed sidecar with `lane: 'x" onclick="alert(1)'` would otherwise
+  // break out of the class attribute when wrapped in `unsafe(...)`.
+  const laneClass =
+    laneId !== undefined && LANE_ID_REGEX.test(laneId)
+      ? `lane-${laneId}`
+      : 'lane-unrouted';
+  const glyph = stageGlyph(member.currentStage);
+  return unsafe(html`
+    <li class="er-member-row ${unsafe(laneClass)}" data-member-uuid="${member.uuid}">
+      <a class="er-member-row-link" href="${reviewLink}"
+        data-member-copy
+        data-member-href="${reviewLink}"
+        title="Open ${member.title} (click also copies the URL)">
+        <div class="er-member-row-meta">
+          <span class="er-member-row-lane">${laneLabel}</span>
+          <span class="er-member-row-sep" aria-hidden="true">·</span>
+          <span class="er-member-row-glyph" aria-hidden="true">${glyph}</span>
+          <span class="er-member-row-stage">${member.currentStage}</span>
+        </div>
+        <div class="er-member-row-title">${member.title}</div>
+        <div class="er-member-row-slug">${member.slug}</div>
+      </a>
+    </li>`);
+}
+
+function renderMissingRow(uuid: string): RawHtml {
+  return unsafe(html`
+    <li class="er-member-row er-member-row--missing" data-missing-uuid="${uuid}">
+      <div class="er-member-row-meta">
+        <span class="er-member-row-lane">missing</span>
+        <span class="er-member-row-sep" aria-hidden="true">·</span>
+        <span class="er-member-row-glyph" aria-hidden="true">⊘</span>
+        <span class="er-member-row-stage">unresolved</span>
+      </div>
+      <div class="er-member-row-title">Member sidecar not found</div>
+      <div class="er-member-row-slug">${uuid}</div>
+    </li>`);
+}
+
+function renderListBody(
+  members: readonly Entry[],
+  missingMemberUuids: readonly string[],
+  laneConfigsById: ReadonlyMap<string, StrictLaneConfig>,
+): RawHtml {
+  const rowsRaw = members.map((m) => renderListRow(m, laneConfigsById).__raw).join('');
+  const missingRaw = missingMemberUuids.map((u) => renderMissingRow(u).__raw).join('');
+  return unsafe(html`
+    <ul class="er-members-list" data-list>${unsafe(rowsRaw)}${unsafe(missingRaw)}</ul>`);
+}
+
+function renderToggle(initial: MembersViewMode): RawHtml {
+  const composedActive = initial === 'composed' ? ' is-active' : '';
+  const listActive = initial === 'list' ? ' is-active' : '';
+  return unsafe(html`
+    <div class="er-members-toggle" role="radiogroup"
+      aria-label="Members view mode"
+      data-members-toggle>
+      <button type="button"
+        class="er-members-toggle-cell${unsafe(composedActive)}"
+        role="radio"
+        aria-checked="${initial === 'composed' ? 'true' : 'false'}"
+        data-view-mode="composed">
+        <span class="er-members-toggle-glyph" aria-hidden="true">⊞</span>
+        <span class="er-members-toggle-label">Composed</span>
+      </button>
+      <button type="button"
+        class="er-members-toggle-cell${unsafe(listActive)}"
+        role="radio"
+        aria-checked="${initial === 'list' ? 'true' : 'false'}"
+        data-view-mode="list">
+        <span class="er-members-toggle-glyph" aria-hidden="true">≡</span>
+        <span class="er-members-toggle-label">List</span>
+      </button>
+    </div>`);
+}
+
+function renderEmptyStateCta(group: Entry): RawHtml {
+  // Clipboard payload per the accepted Direction-B mockup: the
+  // operator pastes this string into a Claude Code chat to launch
+  // the add-member flow. The literal `<MEMBER-SLUG>` placeholder
+  // signals where to substitute.
+  const copyText = `/deskwork:group add-member ${group.slug} <MEMBER-SLUG>`;
+  return unsafe(html`
+    <div class="er-members-empty-state" data-empty-state>
+      <div class="er-members-empty-glyph" aria-hidden="true">⊟</div>
+      <div class="er-members-empty-head">No members yet</div>
+      <p class="er-members-empty-desc">
+        this group is metadata-only.<br>
+        populate it with <code>/deskwork:group add-member</code>.
+      </p>
+      <button type="button" class="er-members-empty-cta"
+        data-empty-cta
+        data-copy-text="${copyText}"
+        aria-label="Copy /deskwork:group add-member command to clipboard">
+        <span class="er-members-empty-cta-plus" aria-hidden="true">+</span>
+        <span class="er-members-empty-cta-label">Add member</span>
+      </button>
+    </div>`);
+}
+
+function renderPopulatedSection(input: RenderMembersSectionInput): RawHtml {
+  const buckets = bucketMembersByLane(
+    input.members,
+    input.laneConfigsById,
+    input.templatesById,
+  );
+  const initial = input.initialViewMode;
+  const sectionMode = initial === 'composed' ? 'composed' : 'list';
+  const composedBody = renderComposedBody(buckets);
+  const listBody = renderListBody(
+    input.members,
+    input.missingMemberUuids,
+    input.laneConfigsById,
+  );
+  return unsafe(html`
+    <section class="er-members-section"
+      data-members-section
+      data-group-uuid="${input.group.uuid}"
+      data-view-mode="${sectionMode}">
+      <header class="er-members-head">
+        <div class="er-members-head-title">Members</div>
+        ${renderToggle(initial)}
+      </header>
+      <div class="er-members-body-composed" data-body-composed
+        ${initial === 'list' ? unsafe('hidden') : ''}>
+        ${composedBody}
+      </div>
+      <div class="er-members-body-list" data-body-list
+        ${initial === 'composed' ? unsafe('hidden') : ''}>
+        ${listBody}
+      </div>
+    </section>`);
+}
+
+/**
+ * Top-level renderer. Returns '' for non-group entries AND for empty
+ * groups that have an `artifactPath` (the existing body renderer is the
+ * intended fallback in that case per the accepted brief). Returns the
+ * empty-state CTA when the group has no members AND no artifactPath.
+ * Otherwise renders the populated section.
+ */
+export function renderMembersSection(input: RenderMembersSectionInput): string {
+  const { group } = input;
+  if (!isGroupEntry(group)) return '';
+
+  if (!isPopulatedGroupEntry(group)) {
+    // Declared group, no members yet. Fall back to the existing
+    // artifactPath body when present; render the empty-state CTA when
+    // there's nothing to render at all.
+    if (group.artifactPath !== undefined && group.artifactPath.length > 0) {
+      return '';
+    }
+    return html`
+      <section class="er-members-section er-members-section--empty"
+        data-members-section
+        data-group-uuid="${group.uuid}"
+        data-view-mode="empty">
+        ${renderEmptyStateCta(group)}
+      </section>`;
+  }
+
+  return renderPopulatedSection(input).__raw;
+}
+
+/**
+ * Parse the `?members=<mode>` query string into a typed initial view
+ * mode. The default is `composed` per the accepted brief (Direction B).
+ * Unrecognized values fall back to composed.
+ */
+export function parseMembersViewModeQuery(raw: string | null | undefined): MembersViewMode {
+  if (raw === 'list') return 'list';
+  return 'composed';
+}
diff --git a/packages/studio/src/server.ts b/packages/studio/src/server.ts
index 4c4dac9..208388c 100755
--- a/packages/studio/src/server.ts
+++ b/packages/studio/src/server.ts
@@ -294,6 +294,7 @@ export function createApp(ctx: StudioContext): Hono {
         {
           version: c.req.query('v') ?? null,
           stage: c.req.query('stage') ?? null,
+          members: c.req.query('members') ?? null,
         },
         getIndex,
       );
diff --git a/packages/studio/test/dashboard-member-row-badge.test.ts b/packages/studio/test/dashboard-member-row-badge.test.ts
new file mode 100644
index 0000000..cb0a73e
--- /dev/null
+++ b/packages/studio/test/dashboard-member-row-badge.test.ts
@@ -0,0 +1,182 @@
+/**
+ * Phase 7 Task 7.3 Step 7.3.3 + 7.3.4 — dashboard row "Member of:"
+ * pull-tab + popover (Direction 1 brief).
+ *
+ * Asserts the lane-dashboard renders an `.er-row-member-tab` on member
+ * rows AND attributes the correct parent count for multi-parent
+ * members. Non-member rows render NO tab.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { createApp } from '@/server.ts';
+
+const GROUP_A_UUID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+const GROUP_B_UUID    = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
+const MEMBER_SOLO_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
+const MEMBER_MULTI_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
+const NON_MEMBER_UUID  = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: { d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
+    defaultSite: 'd',
+  };
+}
+
+function makeEntry(
+  overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>,
+): Entry {
+  return {
+    keywords: [],
+    source: 'manual',
+    iterationByStage: { [overrides.currentStage]: 1 },
+    createdAt: '2026-05-29T10:00:00.000Z',
+    updatedAt: '2026-05-29T10:00:00.000Z',
+    ...overrides,
+  } as Entry;
+}
+
+function writeLaneConfig(
+  root: string,
+  id: string,
+  name: string,
+  pipeline: string,
+  contentDir: string,
+): Promise<void> {
+  return writeFile(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
+  );
+}
+
+describe('dashboard row Member-of pull-tab (Phase 7 Task 7.3 Direction 1)', () => {
+  let projectRoot: string;
+  let cfg: DeskworkConfig;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-dash-member-tab-'));
+    cfg = makeConfig();
+    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
+    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');
+
+    // Three entries that participate in the badge:
+    //   - solo member (member of group A only)
+    //   - multi-parent member (member of both groups A and B — count 2)
+    //   - non-member (no group references it)
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: MEMBER_SOLO_UUID,
+      slug: 'solo-member',
+      title: 'Solo member entry',
+      currentStage: 'Drafting',
+      lane: 'default',
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: MEMBER_MULTI_UUID,
+      slug: 'multi-parent',
+      title: 'Multi-parent entry',
+      currentStage: 'Drafting',
+      lane: 'default',
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: NON_MEMBER_UUID,
+      slug: 'non-member',
+      title: 'Non-member entry',
+      currentStage: 'Drafting',
+      lane: 'default',
+    }));
+
+    // Two groups: A includes both members; B includes only the
+    // multi-parent member.
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: GROUP_A_UUID,
+      slug: 'group-a',
+      title: 'Group A',
+      currentStage: 'Drafting',
+      lane: 'default',
+      members: [MEMBER_SOLO_UUID, MEMBER_MULTI_UUID],
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: GROUP_B_UUID,
+      slug: 'group-b',
+      title: 'Group B',
+      currentStage: 'Drafting',
+      lane: 'default',
+      members: [MEMBER_MULTI_UUID],
+    }));
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  it('renders the pull-tab on member rows with the correct parent count', async () => {
+    const app = createApp({ projectRoot, config: cfg });
+    const res = await app.fetch(new Request('http://x/dev/editorial-studio'));
+    expect(res.status).toBe(200);
+    const html = await res.text();
+
+    // Solo-member row carries the tab with count=1.
+    const soloRowMatch = sliceRow(html, MEMBER_SOLO_UUID);
+    expect(soloRowMatch).toContain('er-row-member-tab');
+    expect(soloRowMatch).toContain('data-parent-count="1"');
+    expect(soloRowMatch).toMatch(/er-row-member-tab-count[^>]*>1</);
+
+    // Multi-parent row carries the tab with count=2 (group A + group B).
+    const multiRowMatch = sliceRow(html, MEMBER_MULTI_UUID);
+    expect(multiRowMatch).toContain('er-row-member-tab');
+    expect(multiRowMatch).toContain('data-parent-count="2"');
+    expect(multiRowMatch).toMatch(/er-row-member-tab-count[^>]*>2</);
+
+    // Multi-parent row's popover lists both parent groups as
+    // clipboard-copy links.
+    expect(multiRowMatch).toContain('er-row-member-popover');
+    expect(multiRowMatch).toContain(`data-parent-uuid="${GROUP_A_UUID}"`);
+    expect(multiRowMatch).toContain(`data-parent-uuid="${GROUP_B_UUID}"`);
+
+    // Non-member row carries NO tab.
+    const nonMemberRowMatch = sliceRow(html, NON_MEMBER_UUID);
+    expect(nonMemberRowMatch).not.toContain('er-row-member-tab');
+  });
+});
+
+/**
+ * Slice the HTML to a single row's `[data-row-shell]` substring for a
+ * given UUID. The dashboard emits each row as a single shell so we can
+ * scope assertions per entry.
+ */
+function sliceRow(html: string, uuid: string): string {
+  const anchor = `data-uuid="${uuid}"`;
+  const anchorIdx = html.indexOf(anchor);
+  if (anchorIdx === -1) return '';
+  // Walk backwards to find the row shell's opening `<div class="er-row-shell`.
+  const shellStart = html.lastIndexOf('<div class="er-row-shell', anchorIdx);
+  if (shellStart === -1) return '';
+  // The row shell ends at the next `</div>` whose nesting balance returns to zero.
+  let depth = 0;
+  let i = shellStart;
+  while (i < html.length) {
+    const openIdx = html.indexOf('<div', i);
+    const closeIdx = html.indexOf('</div>', i);
+    if (closeIdx === -1) return html.slice(shellStart);
+    if (openIdx !== -1 && openIdx < closeIdx) {
+      depth += 1;
+      i = openIdx + 4;
+      continue;
+    }
+    depth -= 1;
+    if (depth === 0) {
+      return html.slice(shellStart, closeIdx + '</div>'.length);
+    }
+    i = closeIdx + '</div>'.length;
+  }
+  return html.slice(shellStart);
+}
diff --git a/packages/studio/test/dashboard-swimlane-card-unit.test.ts b/packages/studio/test/dashboard-swimlane-card-unit.test.ts
index d6b0f4c..9711d03 100644
--- a/packages/studio/test/dashboard-swimlane-card-unit.test.ts
+++ b/packages/studio/test/dashboard-swimlane-card-unit.test.ts
@@ -64,7 +64,7 @@ describe('renderSwimlane — AUDIT-20260528-07 stage DOM-id uniqueness', () => {
     // hyphen, producing duplicate `id="lane-test-lane-stage-qa-review"`
     // attributes on the rendered article.
     const bucket = makeBucket(['QA Review', 'QA_Review']);
-    const html = renderSwimlane(bucket, 'd', false).__raw;
+    const html = renderSwimlane(bucket, 'd', false, new Map()).__raw;
     // Gather every id attribute value on the rendered output.
     const idMatches = html.match(/\sid="([^"]+)"/g) ?? [];
     const idValues = idMatches.map((m) => m.replace(/^\sid="(.+)"$/, '$1'));
diff --git a/packages/studio/test/entry-review-group-empty-members.test.ts b/packages/studio/test/entry-review-group-empty-members.test.ts
new file mode 100644
index 0000000..89e93af
--- /dev/null
+++ b/packages/studio/test/entry-review-group-empty-members.test.ts
@@ -0,0 +1,138 @@
+/**
+ * Phase 7 Tasks 7.3 + 7.4 — empty-state fallback for the Members
+ * section (Direction B brief).
+ *
+ * A group with `members: []` AND NO `artifactPath` renders the
+ * centered empty-state CTA per the accepted mockup — "+ Add member"
+ * button carrying a clipboard-copy template.
+ *
+ * A group with `members: []` BUT WITH an `artifactPath` skips the
+ * section entirely (the existing artifactPath body renderer is the
+ * intended fallback per the brief).
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { createApp } from '@/server.ts';
+
+const GROUP_EMPTY_NO_BODY_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+const GROUP_EMPTY_WITH_BODY_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: { d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
+    defaultSite: 'd',
+  };
+}
+
+function makeEntry(
+  overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>,
+): Entry {
+  return {
+    keywords: [],
+    source: 'manual',
+    iterationByStage: { [overrides.currentStage]: 1 },
+    createdAt: '2026-05-29T10:00:00.000Z',
+    updatedAt: '2026-05-29T10:00:00.000Z',
+    ...overrides,
+  } as Entry;
+}
+
+function writeLaneConfig(
+  root: string,
+  id: string,
+  name: string,
+  pipeline: string,
+  contentDir: string,
+): Promise<void> {
+  return writeFile(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
+  );
+}
+
+describe('entry-review Members section — empty-state fallback (Phase 7 Task 7.4)', () => {
+  let projectRoot: string;
+  let cfg: DeskworkConfig;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-er-members-empty-'));
+    cfg = makeConfig();
+    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
+    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');
+
+    // Declared-empty group with NO artifactPath — must render the
+    // empty-state CTA. The entry resolver needs an artifact body to
+    // not 404, so we seed the slug's index.md (the fallback path).
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: GROUP_EMPTY_NO_BODY_UUID,
+      slug: 'empty-group-no-body',
+      title: 'Empty group, no body',
+      currentStage: 'Ideas',
+      lane: 'default',
+      members: [],
+    }));
+    await mkdir(join(projectRoot, 'docs', 'empty-group-no-body'), { recursive: true });
+    await writeFile(
+      join(projectRoot, 'docs', 'empty-group-no-body', 'index.md'),
+      '# Empty group, no body\n',
+    );
+
+    // Declared-empty group WITH artifactPath — must NOT render the
+    // members section (the existing artifactPath body is the fallback).
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: GROUP_EMPTY_WITH_BODY_UUID,
+      slug: 'empty-group-with-body',
+      title: 'Empty group, with body',
+      currentStage: 'Ideas',
+      lane: 'default',
+      members: [],
+      artifactPath: 'docs/empty-group-with-body/index.md',
+    }));
+    await mkdir(join(projectRoot, 'docs', 'empty-group-with-body'), { recursive: true });
+    await writeFile(
+      join(projectRoot, 'docs', 'empty-group-with-body', 'index.md'),
+      '# Empty group with body\n',
+    );
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  it('renders the empty-state CTA for declared-empty groups without artifactPath', async () => {
+    const app = createApp({ projectRoot, config: cfg });
+    const res = await app.fetch(
+      new Request(`http://x/dev/editorial-review/entry/${GROUP_EMPTY_NO_BODY_UUID}`),
+    );
+    expect(res.status).toBe(200);
+    const html = await res.text();
+
+    expect(html).toContain('data-members-section');
+    expect(html).toContain('er-members-section--empty');
+    expect(html).toContain('data-empty-cta');
+    expect(html).toContain('No members yet');
+    // The CTA carries the clipboard-copy template per the mockup.
+    expect(html).toMatch(/data-copy-text="\/deskwork:group add-member empty-group-no-body/);
+  });
+
+  it('does NOT render the members section for declared-empty groups WITH an artifactPath', async () => {
+    const app = createApp({ projectRoot, config: cfg });
+    const res = await app.fetch(
+      new Request(`http://x/dev/editorial-review/entry/${GROUP_EMPTY_WITH_BODY_UUID}`),
+    );
+    expect(res.status).toBe(200);
+    const html = await res.text();
+
+    expect(html).not.toContain('data-members-section');
+    expect(html).not.toContain('er-members-section');
+  });
+});
diff --git a/packages/studio/test/entry-review-group-members-section-composed.test.ts b/packages/studio/test/entry-review-group-members-section-composed.test.ts
new file mode 100644
index 0000000..6280284
--- /dev/null
+++ b/packages/studio/test/entry-review-group-members-section-composed.test.ts
@@ -0,0 +1,146 @@
+/**
+ * Phase 7 Tasks 7.3 + 7.4 — composed-mode rendering of the entry-review
+ * Members section (Direction B brief, default mode).
+ *
+ * Asserts that the composed view emits one `.er-members-swim` block per
+ * lane the group's members span, each carrying its template's stage
+ * sequence (linear + off-pipeline), with the lane-scoped per-stage
+ * counts and `is-empty` modifiers per the dashboard convention.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { createApp } from '@/server.ts';
+
+const GROUP_UUID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+const MEMBER_A_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
+const MEMBER_B_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
+const MEMBER_C_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: { d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
+    defaultSite: 'd',
+  };
+}
+
+function makeEntry(
+  overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>,
+): Entry {
+  return {
+    keywords: [],
+    source: 'manual',
+    iterationByStage: { [overrides.currentStage]: 1 },
+    createdAt: '2026-05-29T10:00:00.000Z',
+    updatedAt: '2026-05-29T10:00:00.000Z',
+    ...overrides,
+  } as Entry;
+}
+
+function writeLaneConfig(
+  root: string,
+  id: string,
+  name: string,
+  pipeline: string,
+  contentDir: string,
+): Promise<void> {
+  return writeFile(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
+  );
+}
+
+describe('entry-review Members section — composed mode (Phase 7 Task 7.4)', () => {
+  let projectRoot: string;
+  let cfg: DeskworkConfig;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-er-members-composed-'));
+    cfg = makeConfig();
+    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
+    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');
+    await writeLaneConfig(projectRoot, 'mockups', 'Mockups', 'visual', 'mockups');
+
+    // Two editorial members in different stages + one visual member.
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: MEMBER_A_UUID,
+      slug: 'row-chrome',
+      title: 'Row chrome rewrite',
+      currentStage: 'Drafting',
+      lane: 'default',
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: MEMBER_B_UUID,
+      slug: 'stage-verb-router',
+      title: 'Stage-aware verb router',
+      currentStage: 'Final',
+      lane: 'default',
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: MEMBER_C_UUID,
+      slug: 'row-3-swipe-mockup',
+      title: 'Row-3 swipe mockup',
+      currentStage: 'Sketched',
+      lane: 'mockups',
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: GROUP_UUID,
+      slug: 'v018-rebuild',
+      title: 'v0.18 row rebuild',
+      currentStage: 'Drafting',
+      lane: 'default',
+      members: [MEMBER_A_UUID, MEMBER_B_UUID, MEMBER_C_UUID],
+      artifactPath: 'docs/v018-rebuild/index.md',
+    }));
+    await mkdir(join(projectRoot, 'docs', 'v018-rebuild'), { recursive: true });
+    await writeFile(join(projectRoot, 'docs', 'v018-rebuild', 'index.md'), '# v0.18 row rebuild\n');
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  it('renders the composed view as default with one lane block per spanned lane', async () => {
+    const app = createApp({ projectRoot, config: cfg });
+    const res = await app.fetch(
+      new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}`),
+    );
+    expect(res.status).toBe(200);
+    const html = await res.text();
+
+    // Members section in composed mode (server-side default).
+    expect(html).toContain('data-members-section');
+    expect(html).toContain('data-view-mode="composed"');
+    expect(html).toContain('data-composed');
+
+    // One swim block per spanned lane.
+    expect(html).toContain('data-lane-id="default"');
+    expect(html).toContain('data-lane-id="mockups"');
+    expect(html).toContain('data-template-id="editorial"');
+    expect(html).toContain('data-template-id="visual"');
+
+    // Per-stage cards for each member, attributed to their lane.
+    expect(html).toContain('data-member-uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
+    expect(html).toContain('data-member-uuid="cccccccc-cccc-4ccc-8ccc-cccccccccccc"');
+    expect(html).toContain('data-member-uuid="dddddddd-dddd-4ddd-8ddd-dddddddddddd"');
+
+    // Empty editorial stages render with `is-empty` per the dashboard
+    // convention — pipeline shape stays visible. Editorial has Ideas /
+    // Planned / Outlining / Drafting / Final / Published as linear
+    // stages; only Drafting (Member A) and Final (Member B) are
+    // populated, so at least one editorial stage should carry is-empty.
+    expect(html).toMatch(/er-members-stage is-empty/);
+
+    // Stage glyphs surfaced (press-check vocabulary per
+    // DESKWORK-STATE-MACHINE.md).
+    expect(html).toMatch(/er-members-stage-glyph[^>]*>[◇§⊹✎※✓⊘✗◦]/);
+  });
+});
diff --git a/packages/studio/test/entry-review-group-members-section-list.test.ts b/packages/studio/test/entry-review-group-members-section-list.test.ts
new file mode 100644
index 0000000..c254517
--- /dev/null
+++ b/packages/studio/test/entry-review-group-members-section-list.test.ts
@@ -0,0 +1,140 @@
+/**
+ * Phase 7 Tasks 7.3 + 7.4 — list-mode rendering of the entry-review
+ * Members section (Direction B brief).
+ *
+ * Integration test: builds a tmp fixture with a populated group (2
+ * members across 2 lanes / different stages), hits the entry-review
+ * URL with `?members=list`, and asserts the rendered HTML carries the
+ * "Members" section title, both member rows with the expected slugs +
+ * titles + lane tags + stage glyphs, and clipboard-copy links pointing
+ * at each member's review surface.
+ *
+ * Per `.claude/rules/testing.md`: real sidecars, real lane configs,
+ * real pipeline templates. No mocks.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { createApp } from '@/server.ts';
+
+const GROUP_UUID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+const MEMBER_A_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
+const MEMBER_B_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: {
+      d: {
+        contentDir: 'docs',
+        calendarPath: '.deskwork/calendar.md',
+      },
+    },
+    defaultSite: 'd',
+  };
+}
+
+function makeEntry(overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>): Entry {
+  return {
+    keywords: [],
+    source: 'manual',
+    iterationByStage: { [overrides.currentStage]: 1 },
+    createdAt: '2026-05-29T10:00:00.000Z',
+    updatedAt: '2026-05-29T10:00:00.000Z',
+    ...overrides,
+  } as Entry;
+}
+
+function writeLaneConfig(root: string, id: string, name: string, pipeline: string, contentDir: string): Promise<void> {
+  return writeFile(
+    join(root, '.deskwork', 'lanes', `${id}.json`),
+    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
+  );
+}
+
+describe('entry-review Members section — list mode (Phase 7 Task 7.3)', () => {
+  let projectRoot: string;
+  let cfg: DeskworkConfig;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-er-members-list-'));
+    cfg = makeConfig();
+    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
+    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
+    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
+    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');
+    await writeLaneConfig(projectRoot, 'mockups', 'Mockups', 'visual', 'mockups');
+
+    // Two members + one group sidecar.
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: MEMBER_A_UUID,
+      slug: 'row-chrome-cascade',
+      title: 'Row chrome cascade rewrite',
+      currentStage: 'Drafting',
+      lane: 'default',
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: MEMBER_B_UUID,
+      slug: 'row-3-swipe-mockup',
+      title: 'Row-3 swipe-only direction',
+      currentStage: 'Sketched',
+      lane: 'mockups',
+    }));
+    await writeSidecar(projectRoot, makeEntry({
+      uuid: GROUP_UUID,
+      slug: 'v018-rebuild',
+      title: 'v0.18 row rebuild',
+      currentStage: 'Drafting',
+      lane: 'default',
+      members: [MEMBER_A_UUID, MEMBER_B_UUID],
+      artifactPath: 'docs/v018-rebuild/index.md',
+    }));
+    await mkdir(join(projectRoot, 'docs', 'v018-rebuild'), { recursive: true });
+    await writeFile(join(projectRoot, 'docs', 'v018-rebuild', 'index.md'), '# v0.18 row rebuild\n');
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  it('renders the Members section with a list of both members in list mode', async () => {
+    const app = createApp({ projectRoot, config: cfg });
+    const res = await app.fetch(
+      new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}?members=list`),
+    );
+    expect(res.status).toBe(200);
+    const html = await res.text();
+
+    // Section is present.
+    expect(html).toContain('data-members-section');
+    expect(html).toContain('data-group-uuid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
+    expect(html).toContain('data-view-mode="list"');
+    expect(html).toContain('>Members<');
+
+    // Both member rows render with their slugs and titles.
+    expect(html).toContain('data-member-uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
+    expect(html).toContain('data-member-uuid="cccccccc-cccc-4ccc-8ccc-cccccccccccc"');
+    expect(html).toContain('Row chrome cascade rewrite');
+    expect(html).toContain('row-chrome-cascade');
+    expect(html).toContain('Row-3 swipe-only direction');
+    expect(html).toContain('row-3-swipe-mockup');
+
+    // Clipboard-copy links target the per-member review surface.
+    expect(html).toContain(`href="/dev/editorial-review/entry/${MEMBER_A_UUID}"`);
+    expect(html).toContain(`href="/dev/editorial-review/entry/${MEMBER_B_UUID}"`);
+    expect(html).toContain('data-member-copy');
+
+    // Lane tags surfaced per the accepted brief.
+    expect(html).toMatch(/er-member-row-lane[^>]*>Editorial/);
+    expect(html).toMatch(/er-member-row-lane[^>]*>Mockups/);
+
+    // Stage names visible (DESKWORK-STATE-MACHINE.md Commandment II).
+    expect(html).toContain('>Drafting<');
+    expect(html).toContain('>Sketched<');
+  });
+});
diff --git a/plugins/deskwork-studio/public/css/dashboard-row-affordances.css b/plugins/deskwork-studio/public/css/dashboard-row-affordances.css
index 306dec1..3db9297 100644
--- a/plugins/deskwork-studio/public/css/dashboard-row-affordances.css
+++ b/plugins/deskwork-studio/public/css/dashboard-row-affordances.css
@@ -222,3 +222,181 @@
     margin: 0.25rem 0.7rem;
   }
 }
+
+/* -------------------------------------------------------------------
+ * Member-of pull-tab (Phase 7 Task 7.3 — Direction 1).
+ *
+ * Vertical kraft-color tab anchored to the row's LEFT edge when the
+ * entry is a member of one or more populated groups. Mirrors the
+ * `.er-outline-tab` / `.er-marginalia-tab` precedent — a stowed-state
+ * affordance that lives ON the row it affects (per
+ * `.claude/rules/affordance-placement.md`).
+ *
+ * Tap → row carries `.is-member-expanded`; CSS reveals the popover.
+ * The popover lists every parent group as a clipboard-copy link. The
+ * client controller wires the toggle + clipboard handlers.
+ *
+ * The tab carries no media-query gate — desktop + mobile both render
+ * it when applicable (chrome doesn't pay for what doesn't apply, but
+ * when it DOES apply the discoverability signal is uniform across
+ * viewport classes).
+ * ----------------------------------------------------------------- */
+
+.er-row-member-tab {
+  position: absolute;
+  left: 0;
+  top: 0;
+  bottom: 0;
+  width: 24px;
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  background: var(--er-paper-2);
+  border: 0;
+  border-right: 1px solid var(--er-paper-3);
+  cursor: pointer;
+  user-select: none;
+  padding: 0;
+  z-index: 6;
+  /* WCAG 2.2 SC 2.5.8 minimum target size 24x24 — both axes meet the
+   * floor: 24px width here + ≥44px vertical via row height. */
+  min-height: 24px;
+}
+
+.er-row-member-tab:hover {
+  background: var(--er-paper);
+}
+
+.er-row-member-tab:focus-visible {
+  outline: 2px solid var(--er-proof-blue);
+  outline-offset: -2px;
+}
+
+.er-row-member-tab-label {
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  letter-spacing: 0.28em;
+  text-transform: uppercase;
+  /* var(--er-ink-soft) #3A3530 on var(--er-paper-2) #ECE6D4 = 9.79:1
+   * (passes WCAG 1.4.3 AA at any size). Previously used var(--er-kraft)
+   * at 3.58:1 which failed for small text. The kraft accent is
+   * preserved via the count badge's border + the expanded-state
+   * background flip, so the affordance still reads as a kraft
+   * "belonging-to" affordance overall. */
+  color: var(--er-ink-soft);
+  writing-mode: vertical-rl;
+  transform: rotate(180deg);
+  font-weight: 700;
+}
+
+.er-row-member-tab-count {
+  position: absolute;
+  top: 6px;
+  left: 50%;
+  transform: translateX(-50%);
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  /* var(--er-ink) #1A1614 on var(--er-paper) #F5F1E8 = 14.91:1
+   * (passes WCAG 1.4.3 AA easily). Border still uses kraft so the
+   * badge reads visually as a kraft member-count marker. */
+  color: var(--er-ink);
+  background: var(--er-paper);
+  border: 1px solid var(--er-kraft);
+  border-radius: 50%;
+  width: 14px;
+  height: 14px;
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  font-weight: 700;
+  line-height: 1;
+}
+
+/* Row shells that carry the member tab inset their main content so
+ * the tab's 22px column doesn't overlap the row foreground. The class
+ * is added server-side when parents.length > 0; non-member rows keep
+ * their original padding. */
+.er-row-shell.has-member-tab .er-row-fg {
+  padding-left: 28px;
+}
+
+/* Expanded state — popover visible, tab color inverts to kraft. */
+.er-row-shell.is-member-expanded .er-row-member-tab {
+  background: var(--er-kraft);
+  border-right-color: var(--er-kraft);
+}
+
+.er-row-shell.is-member-expanded .er-row-member-tab-label {
+  color: var(--er-paper);
+}
+
+.er-row-shell.is-member-expanded .er-row-member-tab-count {
+  background: var(--er-kraft);
+  color: var(--er-paper);
+  border-color: var(--er-paper);
+}
+
+.er-row-shell.is-member-expanded {
+  background: var(--er-paper-2);
+}
+
+/* Popover — inline reveal below the row foreground when expanded. */
+.er-row-member-popover {
+  display: block;
+  margin: 0 0 0 22px;
+  padding: 10px 14px 12px;
+  background: var(--er-paper);
+  border-top: 1px solid var(--er-paper-3);
+  border-left: 3px solid var(--er-kraft);
+}
+
+.er-row-member-popover-head {
+  font-family: var(--er-font-mono);
+  font-size: 0.5625rem;
+  letter-spacing: 0.22em;
+  text-transform: uppercase;
+  color: var(--er-kraft);
+  font-weight: 600;
+  margin-bottom: 6px;
+}
+
+.er-row-member-link {
+  display: grid;
+  grid-template-columns: 1fr auto 20px;
+  gap: 8px;
+  align-items: baseline;
+  padding: 4px 0;
+  font-family: var(--er-font-mono);
+  font-size: 0.75rem;
+  color: var(--er-ink);
+  text-decoration: none;
+  border-bottom: 1px dashed transparent;
+}
+
+.er-row-member-link:hover {
+  border-bottom-color: var(--er-paper-3);
+}
+
+.er-row-member-link:focus-visible {
+  outline: 2px solid var(--er-proof-blue);
+  outline-offset: 2px;
+}
+
+.er-row-member-link-name {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  font-size: 0.9rem;
+  color: var(--er-ink);
+}
+
+.er-row-member-link-slug {
+  font-size: 0.625rem;
+  color: var(--er-faded);
+  letter-spacing: 0.04em;
+}
+
+.er-row-member-link-open {
+  color: var(--er-proof-blue);
+  font-size: 0.9rem;
+  text-align: center;
+}
diff --git a/plugins/deskwork-studio/public/css/entry-review-members.css b/plugins/deskwork-studio/public/css/entry-review-members.css
new file mode 100644
index 0000000..1033a07
--- /dev/null
+++ b/plugins/deskwork-studio/public/css/entry-review-members.css
@@ -0,0 +1,482 @@
+/*
+ * entry-review-members.css — Members section on the entry-keyed
+ * press-check surface (Phase 7 Tasks 7.3 + 7.4 — Direction B).
+ *
+ * Mirrors the accepted mockup at
+ *   docs/studio-design/ACCEPTED/2026-05-29-group-review-surface/mockups/direction-B-composed-default.html
+ *
+ * All tokens reference --er-* from editorial-review.css. No new tokens.
+ * Composed view reuses the swim chrome scoped to the group's member
+ * set; list view falls back to a flat per-member row list.
+ *
+ * Per DESIGN-STANDARDS.md § press-check vocabulary: paper tones for
+ * surface, red-pencil for stage glyphs, mono caps for kickers + meta,
+ * italic display for titles. No rubber-stamp surfacing; stages render
+ * as glyph + name + count only.
+ */
+
+[data-review-ui="entry-review"] .er-members-section {
+  background: var(--er-paper);
+  border-top: 1px solid var(--er-paper-3);
+  padding: 18px 20px 28px;
+  margin-top: 24px;
+  position: relative;
+  z-index: 1;
+}
+
+[data-review-ui="entry-review"] .er-members-section--empty {
+  padding: 40px 24px 56px;
+}
+
+[data-review-ui="entry-review"] .er-members-head {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  margin-bottom: 14px;
+  gap: 12px;
+}
+
+[data-review-ui="entry-review"] .er-members-head-title {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  font-weight: 500;
+  font-size: 1.1rem;
+  color: var(--er-red-pencil);
+  letter-spacing: -0.005em;
+}
+
+/* Toggle pill — segmented radio control inside the section head */
+
+[data-review-ui="entry-review"] .er-members-toggle {
+  display: inline-flex;
+  align-items: center;
+  border: 1px solid var(--er-paper-3);
+  border-radius: 2px;
+  background: var(--er-paper-2);
+  overflow: hidden;
+}
+
+[data-review-ui="entry-review"] .er-members-toggle-cell {
+  display: inline-flex;
+  align-items: center;
+  gap: 6px;
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  letter-spacing: 0.18em;
+  text-transform: uppercase;
+  color: var(--er-ink-soft);
+  background: transparent;
+  border: 0;
+  padding: 6px 10px;
+  cursor: pointer;
+  user-select: none;
+  /* WCAG 2.2 SC 2.5.8 minimum target size — 24×24 baseline. */
+  min-height: 24px;
+}
+
+[data-review-ui="entry-review"] .er-members-toggle-cell + .er-members-toggle-cell {
+  border-left: 1px solid var(--er-paper-3);
+}
+
+[data-review-ui="entry-review"] .er-members-toggle-cell.is-active {
+  background: var(--er-paper);
+  color: var(--er-proof-blue);
+}
+
+[data-review-ui="entry-review"] .er-members-toggle-cell:focus-visible {
+  outline: 2px solid var(--er-proof-blue);
+  outline-offset: -2px;
+}
+
+[data-review-ui="entry-review"] .er-members-toggle-glyph {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  font-size: 0.85rem;
+  line-height: 1;
+}
+
+[data-review-ui="entry-review"] .er-members-toggle-label {
+  font-weight: 600;
+}
+
+/* ---------- Composed view (Direction B default) ---------- */
+
+[data-review-ui="entry-review"] .er-members-composed {
+  display: flex;
+  flex-direction: column;
+  gap: 14px;
+}
+
+[data-review-ui="entry-review"] .er-members-composed-empty {
+  padding: 18px 12px;
+  text-align: center;
+  font-family: var(--er-font-mono);
+  font-size: 0.6875rem;
+  color: var(--er-faded);
+  letter-spacing: 0.06em;
+  font-style: italic;
+}
+
+[data-review-ui="entry-review"] .er-members-swim {
+  border: 1px solid var(--er-paper-3);
+  background: var(--er-paper);
+}
+
+[data-review-ui="entry-review"] .er-members-swim-head {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  padding: 8px 12px;
+  background: var(--er-paper-2);
+  border-bottom: 1px solid var(--er-paper-3);
+  border-left: 3px solid var(--er-faded);
+}
+
+[data-review-ui="entry-review"] .er-members-swim-name {
+  font-family: var(--er-font-mono);
+  font-size: 0.6875rem;
+  letter-spacing: 0.16em;
+  text-transform: uppercase;
+  font-weight: 600;
+  color: var(--er-ink-soft);
+}
+
+[data-review-ui="entry-review"] .er-members-swim-count {
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  letter-spacing: 0.14em;
+  color: var(--er-faded);
+  text-transform: uppercase;
+}
+
+/* Lane-accent variants — feature/editorial lanes pick up proof-blue;
+ * mockup/visual lanes pick up kraft. Other lanes inherit faded until a
+ * design decision pins their accent (per swimlane-stage-glyph.ts's
+ * "no fallback" convention — neutrals are documented, not placeholders). */
+
+[data-review-ui="entry-review"] .er-members-swim.lane-default .er-members-swim-head,
+[data-review-ui="entry-review"] .er-members-swim[data-template-id="editorial"] .er-members-swim-head {
+  border-left-color: var(--er-proof-blue);
+}
+
+[data-review-ui="entry-review"] .er-members-swim.lane-default .er-members-swim-name,
+[data-review-ui="entry-review"] .er-members-swim[data-template-id="editorial"] .er-members-swim-name {
+  color: var(--er-proof-blue);
+}
+
+[data-review-ui="entry-review"] .er-members-swim[data-template-id="visual"] .er-members-swim-head,
+[data-review-ui="entry-review"] .er-members-swim.lane-mockups .er-members-swim-head {
+  border-left-color: var(--er-kraft);
+}
+
+[data-review-ui="entry-review"] .er-members-swim[data-template-id="visual"] .er-members-swim-name,
+[data-review-ui="entry-review"] .er-members-swim.lane-mockups .er-members-swim-name {
+  color: var(--er-kraft);
+}
+
+[data-review-ui="entry-review"] .er-members-swim-stages {
+  display: flex;
+  flex-direction: column;
+}
+
+[data-review-ui="entry-review"] .er-members-stage {
+  border-bottom: 1px dashed var(--er-paper-3);
+  padding: 8px 12px 10px;
+}
+
+[data-review-ui="entry-review"] .er-members-stage:last-child {
+  border-bottom: 0;
+}
+
+[data-review-ui="entry-review"] .er-members-stage-head {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  margin-bottom: 6px;
+}
+
+[data-review-ui="entry-review"] .er-members-stage-glyph {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  color: var(--er-red-pencil);
+  font-size: 0.95rem;
+  line-height: 1;
+}
+
+[data-review-ui="entry-review"] .er-members-stage-name {
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  letter-spacing: 0.16em;
+  text-transform: uppercase;
+  color: var(--er-ink-soft);
+  font-weight: 500;
+}
+
+[data-review-ui="entry-review"] .er-members-stage-count {
+  margin-left: auto;
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  color: var(--er-faded);
+}
+
+[data-review-ui="entry-review"] .er-members-stage.is-empty .er-members-stage-glyph,
+[data-review-ui="entry-review"] .er-members-stage.is-empty .er-members-stage-name,
+[data-review-ui="entry-review"] .er-members-stage.is-empty .er-members-stage-count {
+  color: var(--er-faded);
+}
+
+[data-review-ui="entry-review"] .er-members-stage-body {
+  display: flex;
+  flex-direction: column;
+  gap: 6px;
+}
+
+[data-review-ui="entry-review"] .er-members-card {
+  padding: 8px 10px;
+  background: var(--er-paper-2);
+  border-left: 2px solid var(--er-faded);
+  border-radius: 1px;
+  display: grid;
+  grid-template-columns: 1fr 20px;
+  gap: 8px;
+  align-items: center;
+  text-decoration: none;
+  color: inherit;
+}
+
+[data-review-ui="entry-review"] .er-members-card:hover {
+  background: var(--er-paper);
+  border-left-width: 3px;
+}
+
+[data-review-ui="entry-review"] .er-members-card:focus-visible {
+  outline: 2px solid var(--er-proof-blue);
+  outline-offset: -2px;
+}
+
+[data-review-ui="entry-review"] .er-members-card.lane-default,
+[data-review-ui="entry-review"] .er-members-card[data-template-id="editorial"] {
+  border-left-color: var(--er-proof-blue);
+}
+
+[data-review-ui="entry-review"] .er-members-card.lane-mockups {
+  border-left-color: var(--er-kraft);
+}
+
+[data-review-ui="entry-review"] .er-members-card-title {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  font-weight: 500;
+  font-size: 0.95rem;
+  line-height: 1.2;
+  color: var(--er-ink);
+  letter-spacing: -0.005em;
+}
+
+[data-review-ui="entry-review"] .er-members-card-slug {
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  color: var(--er-faded);
+  margin-top: 2px;
+}
+
+[data-review-ui="entry-review"] .er-members-card-open {
+  font-family: var(--er-font-mono);
+  font-size: 0.95rem;
+  color: var(--er-proof-blue);
+  text-align: center;
+}
+
+/* ---------- List view (toggle target) ---------- */
+
+[data-review-ui="entry-review"] .er-members-list {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0;
+}
+
+[data-review-ui="entry-review"] .er-member-row {
+  border-bottom: 1px dashed var(--er-paper-3);
+  border-left: 2px solid var(--er-faded);
+  background: var(--er-paper);
+}
+
+[data-review-ui="entry-review"] .er-member-row:last-child {
+  border-bottom: 0;
+}
+
+[data-review-ui="entry-review"] .er-member-row.lane-default,
+[data-review-ui="entry-review"] .er-member-row[data-template-id="editorial"] {
+  border-left-color: var(--er-proof-blue);
+}
+
+[data-review-ui="entry-review"] .er-member-row.lane-mockups {
+  border-left-color: var(--er-kraft);
+}
+
+[data-review-ui="entry-review"] .er-member-row--missing {
+  border-left-color: var(--er-red-pencil);
+  background: var(--er-paper-2);
+  opacity: 0.7;
+}
+
+[data-review-ui="entry-review"] .er-member-row-link {
+  display: block;
+  padding: 12px 14px;
+  text-decoration: none;
+  color: inherit;
+}
+
+[data-review-ui="entry-review"] .er-member-row-link:hover {
+  background: var(--er-paper-2);
+}
+
+[data-review-ui="entry-review"] .er-member-row-link:focus-visible {
+  outline: 2px solid var(--er-proof-blue);
+  outline-offset: -2px;
+}
+
+[data-review-ui="entry-review"] .er-member-row-meta {
+  display: flex;
+  align-items: center;
+  gap: 6px;
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  letter-spacing: 0.14em;
+  text-transform: uppercase;
+  color: var(--er-faded);
+  margin-bottom: 4px;
+}
+
+[data-review-ui="entry-review"] .er-member-row-lane {
+  color: var(--er-ink-soft);
+  font-weight: 600;
+}
+
+[data-review-ui="entry-review"] .er-member-row-sep {
+  color: var(--er-paper-3);
+}
+
+[data-review-ui="entry-review"] .er-member-row-glyph {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  color: var(--er-red-pencil);
+  font-size: 0.9rem;
+  line-height: 1;
+}
+
+[data-review-ui="entry-review"] .er-member-row-stage {
+  color: var(--er-ink-soft);
+  font-weight: 500;
+}
+
+[data-review-ui="entry-review"] .er-member-row-title {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  font-weight: 500;
+  font-size: 1.05rem;
+  color: var(--er-ink);
+  line-height: 1.2;
+  letter-spacing: -0.005em;
+}
+
+[data-review-ui="entry-review"] .er-member-row-slug {
+  font-family: var(--er-font-mono);
+  font-size: 0.6875rem;
+  color: var(--er-faded);
+  margin-top: 4px;
+}
+
+/* ---------- Empty-state CTA ---------- */
+
+[data-review-ui="entry-review"] .er-members-empty-state {
+  padding: 40px 24px;
+  text-align: center;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-glyph {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  color: var(--er-faded);
+  font-size: 2.4rem;
+  line-height: 1;
+  margin-bottom: 18px;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-head {
+  font-family: var(--er-font-display);
+  font-style: italic;
+  font-size: 1.15rem;
+  color: var(--er-ink-soft);
+  margin-bottom: 8px;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-desc {
+  font-family: var(--er-font-mono);
+  font-size: 0.6875rem;
+  color: var(--er-faded);
+  line-height: 1.6;
+  letter-spacing: 0.04em;
+  margin-bottom: 24px;
+  text-transform: lowercase;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-desc code {
+  font-family: var(--er-font-mono);
+  background: var(--er-paper-2);
+  padding: 1px 4px;
+  border-radius: 1px;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-cta {
+  display: inline-flex;
+  align-items: center;
+  gap: 6px;
+  padding: 10px 16px;
+  background: var(--er-red-pencil);
+  color: var(--er-paper);
+  font-family: var(--er-font-mono);
+  font-size: 0.625rem;
+  letter-spacing: 0.2em;
+  text-transform: uppercase;
+  border: 0;
+  border-radius: 2px;
+  cursor: pointer;
+  user-select: none;
+  min-height: 36px;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-cta:hover {
+  background: #9C2B23;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-cta:focus-visible {
+  outline: 2px solid var(--er-proof-blue);
+  outline-offset: 2px;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-cta-plus {
+  font-weight: 700;
+  font-size: 0.8rem;
+}
+
+[data-review-ui="entry-review"] .er-members-empty-cta-label {
+  font-weight: 600;
+}
+
+/* ---------- Desktop tweaks (wider viewport) ---------- */
+
+@media (min-width: 56rem) {
+  [data-review-ui="entry-review"] .er-members-composed {
+    flex-direction: row;
+    flex-wrap: wrap;
+    gap: 16px;
+  }
+  [data-review-ui="entry-review"] .er-members-swim {
+    flex: 1 1 320px;
+    min-width: 280px;
+  }
+}
diff --git a/plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts b/plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts
new file mode 100644
index 0000000..0a4dd02
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts
@@ -0,0 +1,103 @@
+/**
+ * Client controller for the dashboard row's "Member of: N groups"
+ * pull-tab (Phase 7 Task 7.3 — Direction 1).
+ *
+ * Wires two behaviors:
+ *
+ *   1. Tap the `.er-row-member-tab` → row carries `.is-member-expanded`;
+ *      the inline popover reveals every parent group. Tap again →
+ *      collapse. The tab's `aria-expanded` attribute mirrors the state
+ *      so screen readers track the toggle.
+ *   2. Click a `.er-row-member-link` → copy a markdown back-link
+ *      `Member of [<title>](<url>)` to the clipboard via
+ *      `copyOrShowFallback`, then open the parent's review surface in
+ *      a new tab. The dual behavior gives the operator both navigation
+ *      AND share-ready text in one click.
+ *
+ * Per `.claude/rules/affordance-placement.md`: the tab + popover are
+ * BOTH component-attached (on the row's shell). The same handler
+ * dispatches the open + close events; the stowed-state affordance
+ * (tab visible at-rest with count badge) is the discoverability
+ * signal.
+ *
+ * No-op when the page has no `.er-row-member-tab` elements; mounts
+ * a single delegated click handler on `document` so newly-rendered
+ * rows participate without per-row binding.
+ */
+
+import { copyOrShowFallback } from '../clipboard.ts';
+
+const EXPANDED_CLASS = 'is-member-expanded';
+
+function setRowExpanded(shell: HTMLElement, expanded: boolean): void {
+  shell.classList.toggle(EXPANDED_CLASS, expanded);
+  const tab = shell.querySelector<HTMLButtonElement>('[data-row-member-tab]');
+  const popover = shell.querySelector<HTMLElement>('[data-row-member-popover]');
+  if (tab !== null) tab.setAttribute('aria-expanded', expanded ? 'true' : 'false');
+  if (popover !== null) popover.hidden = !expanded;
+}
+
+function collapseAll(except?: HTMLElement): void {
+  const expanded = document.querySelectorAll<HTMLElement>(
+    `.er-row-shell.${EXPANDED_CLASS}`,
+  );
+  expanded.forEach((shell) => {
+    if (except !== undefined && shell === except) return;
+    setRowExpanded(shell, false);
+  });
+}
+
+function handleTabClick(event: MouseEvent): void {
+  const target = event.target;
+  if (!(target instanceof HTMLElement)) return;
+  const tab = target.closest<HTMLButtonElement>('[data-row-member-tab]');
+  if (tab === null) return;
+  const shell = tab.closest<HTMLElement>('.er-row-shell');
+  if (shell === null) return;
+  event.preventDefault();
+  event.stopPropagation();
+  const wasExpanded = shell.classList.contains(EXPANDED_CLASS);
+  // Single-open invariant — collapse any siblings before opening.
+  collapseAll(shell);
+  setRowExpanded(shell, !wasExpanded);
+}
+
+function handleLinkClick(event: MouseEvent): void {
+  const target = event.target;
+  if (!(target instanceof HTMLElement)) return;
+  const link = target.closest<HTMLAnchorElement>('.er-row-member-link');
+  if (link === null) return;
+  const backLink = link.dataset.backLink;
+  if (backLink === undefined || backLink.length === 0) return;
+  // Fire the clipboard write asynchronously; let the anchor's default
+  // navigation handle opening the target. We DO NOT preventDefault —
+  // the operator's click should result in navigation AND the copy.
+  void copyOrShowFallback(backLink, {
+    successMessage: 'Copied member-of back-link to clipboard.',
+    fallbackMessage: 'Clipboard unavailable; copy this back-link manually:',
+  });
+}
+
+/**
+ * Public entry-point. Idempotent: calling twice merely re-binds the
+ * same delegated handlers (browsers dedupe identical listeners on
+ * document only when the listener function identity matches; we
+ * guard via a module-level boolean to keep wiring single-shot).
+ */
+let wired = false;
+
+export function initRowMemberTab(): void {
+  if (wired) return;
+  wired = true;
+  document.addEventListener('click', handleTabClick);
+  document.addEventListener('click', handleLinkClick);
+  // Escape collapses the open row (consistent with the row-menu close
+  // semantics in row-actions.ts).
+  document.addEventListener('keydown', (event) => {
+    if (event.key !== 'Escape') return;
+    const open = document.querySelector<HTMLElement>(`.er-row-shell.${EXPANDED_CLASS}`);
+    if (open !== null) {
+      setRowExpanded(open, false);
+    }
+  });
+}
diff --git a/plugins/deskwork-studio/public/src/editorial-studio-client.ts b/plugins/deskwork-studio/public/src/editorial-studio-client.ts
index 442e323..827c104 100644
--- a/plugins/deskwork-studio/public/src/editorial-studio-client.ts
+++ b/plugins/deskwork-studio/public/src/editorial-studio-client.ts
@@ -8,6 +8,7 @@
 import { copyOrShowFallback } from './clipboard.ts';
 import { initComposeChip } from './dashboard/compose-chip.ts';
 import { initRowActions } from './dashboard/row-actions.ts';
+import { initRowMemberTab } from './dashboard/row-member-tab.ts';
 import { initStageTiles } from './dashboard/stage-tiles.ts';
 import { initSwimlane } from './dashboard/swimlane.ts';
 import { initSwimlaneCollapse } from './dashboard/swimlane-collapse.ts';
@@ -541,6 +542,8 @@ function init(): void {
   // module-level singleton state.
   initSwimlanePresets();
   initRowActions();
+  // Phase 7 Task 7.3 Direction 1 — row "Member of:" pull-tab toggle.
+  initRowMemberTab();
   initMastheadPopover();
   // Phase 6 Task 6.3: lanes-page controller (idempotent — no-op
   // when [data-lanes-container] is absent on the dashboard).
diff --git a/plugins/deskwork-studio/public/src/entry-review-client.ts b/plugins/deskwork-studio/public/src/entry-review-client.ts
index 3bd798c..fd12672 100644
--- a/plugins/deskwork-studio/public/src/entry-review-client.ts
+++ b/plugins/deskwork-studio/public/src/entry-review-client.ts
@@ -27,6 +27,7 @@ import { initStripCollapse } from './entry-review/strip-collapse.ts';
 import { initMobileSheetBar } from './entry-review/mobile-sheet-bar.ts';
 import { initScrapbookDrawerToggle } from './entry-review/scrapbook-drawer.ts';
 import { initShortcuts } from './entry-review/shortcuts.ts';
+import { initGroupMembersSection } from './entry-review/group-members-section.ts';
 import { copyOrShowFallback } from './clipboard.ts';
 import { initMastheadPopover } from './mobile-shell/masthead-popover.ts';
 
@@ -260,6 +261,7 @@ function initPressCheckSurface(): void {
   initScrapbookLightbox(document);
   initStickyOffset();
   initStripCollapse();
+  initGroupMembersSection();
   // (mobileSheetBar already initialized above so the annotations controller
   // can hook its openSheet for the composer flow.)
 
diff --git a/plugins/deskwork-studio/public/src/entry-review/group-members-section.ts b/plugins/deskwork-studio/public/src/entry-review/group-members-section.ts
new file mode 100644
index 0000000..b1c8c5a
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/entry-review/group-members-section.ts
@@ -0,0 +1,150 @@
+/**
+ * Client controller for the Members section on the entry-keyed
+ * press-check surface (Phase 7 Tasks 7.3 + 7.4 — Direction B).
+ *
+ * Wires three behaviors:
+ *
+ *   1. View-mode toggle (composed ↔ list) — clicking either segmented
+ *      cell flips the section's `data-view-mode` attribute + toggles
+ *      `hidden` on the two body containers. Persists the operator's
+ *      choice per-group via `localStorage` keyed on the group UUID.
+ *      On page boot, the controller restores the stored preference
+ *      (taking precedence over the server-rendered default).
+ *   2. Empty-state CTA — clicking the "Add member" button copies the
+ *      `/deskwork:group add-member <group-slug> <MEMBER-SLUG>` command
+ *      to the operator's clipboard via `copyOrShowFallback`.
+ *   3. Member row clipboard-copy — clicking a member row's link
+ *      navigates to the member's review surface AND copies the URL
+ *      so the operator can share it.
+ *
+ * Per `.claude/rules/affordance-placement.md` — every affordance is
+ * component-attached (on the section's chrome), no toolbar
+ * duplication.
+ *
+ * No mock data, no fallbacks: the controller is a no-op when the page
+ * has no `[data-members-section]` element (non-group entries skip the
+ * section entirely server-side).
+ */
+
+import { copyOrShowFallback } from '../clipboard.ts';
+
+const STORAGE_KEY_PREFIX = 'er.members.viewMode.';
+
+type ViewMode = 'composed' | 'list';
+
+function storageKey(groupUuid: string): string {
+  return `${STORAGE_KEY_PREFIX}${groupUuid}`;
+}
+
+function readStoredMode(groupUuid: string): ViewMode | null {
+  try {
+    const raw = window.localStorage.getItem(storageKey(groupUuid));
+    if (raw === 'composed' || raw === 'list') return raw;
+  } catch {
+    // localStorage may throw in private-browsing modes; treat as no-op.
+  }
+  return null;
+}
+
+function writeStoredMode(groupUuid: string, mode: ViewMode): void {
+  try {
+    window.localStorage.setItem(storageKey(groupUuid), mode);
+  } catch {
+    // Best-effort persistence; ignore write failures.
+  }
+}
+
+function applyMode(section: HTMLElement, mode: ViewMode): void {
+  section.dataset.viewMode = mode;
+  const composedBody = section.querySelector<HTMLElement>('[data-body-composed]');
+  const listBody = section.querySelector<HTMLElement>('[data-body-list]');
+  if (composedBody !== null) composedBody.hidden = mode !== 'composed';
+  if (listBody !== null) listBody.hidden = mode !== 'list';
+
+  const cells = section.querySelectorAll<HTMLButtonElement>('[data-view-mode]');
+  cells.forEach((cell) => {
+    const cellMode = cell.dataset.viewMode;
+    const active = cellMode === mode;
+    cell.classList.toggle('is-active', active);
+    cell.setAttribute('aria-checked', active ? 'true' : 'false');
+  });
+}
+
+function wireToggle(section: HTMLElement, groupUuid: string): void {
+  const toggle = section.querySelector<HTMLElement>('[data-members-toggle]');
+  if (toggle === null) return;
+  toggle.addEventListener('click', (event) => {
+    const target = event.target;
+    if (!(target instanceof HTMLElement)) return;
+    const cell = target.closest<HTMLButtonElement>('[data-view-mode]');
+    if (cell === null) return;
+    const mode = cell.dataset.viewMode;
+    if (mode !== 'composed' && mode !== 'list') return;
+    applyMode(section, mode);
+    writeStoredMode(groupUuid, mode);
+  });
+}
+
+function wireEmptyStateCta(section: HTMLElement): void {
+  const cta = section.querySelector<HTMLButtonElement>('[data-empty-cta]');
+  if (cta === null) return;
+  cta.addEventListener('click', async (event) => {
+    event.preventDefault();
+    const copyText = cta.dataset.copyText;
+    if (copyText === undefined || copyText.length === 0) return;
+    await copyOrShowFallback(copyText, {
+      successMessage: `Copied — paste into a Claude Code chat to add a member.`,
+      fallbackMessage:
+        'Clipboard unavailable on this origin. Copy this command and paste it into a Claude Code chat to add a member to this group:',
+    });
+  });
+}
+
+function wireMemberRowCopy(section: HTMLElement): void {
+  section.addEventListener('click', async (event) => {
+    const target = event.target;
+    if (!(target instanceof HTMLElement)) return;
+    const link = target.closest<HTMLAnchorElement>('[data-member-copy]');
+    if (link === null) return;
+    const href = link.dataset.memberHref;
+    if (href === undefined || href.length === 0) return;
+    // Best-effort: copy the URL alongside the navigation. Don't block
+    // navigation if the clipboard write fails — the operator clicked
+    // the link, navigation is the primary action.
+    try {
+      const absolute = new URL(href, window.location.origin).toString();
+      await copyOrShowFallback(absolute, {
+        successMessage: `Copied member URL — sharing-ready.`,
+        fallbackMessage: 'Clipboard unavailable; here is the member URL:',
+      });
+    } catch {
+      // URL parse failed for unexpected href shape; fall through.
+    }
+  });
+}
+
+/**
+ * Initialize the Members section on page load. Idempotent — calling
+ * twice has no visible effect because `applyMode` reads the section's
+ * current `data-view-mode` if no override is stored.
+ */
+export function initGroupMembersSection(): void {
+  const section = document.querySelector<HTMLElement>('[data-members-section]');
+  if (section === null) return;
+  const groupUuid = section.dataset.groupUuid;
+  if (groupUuid === undefined || groupUuid.length === 0) return;
+
+  // Restore stored mode (takes precedence over server-rendered default)
+  // only when the section is in a populated state — the "empty"
+  // view-mode signals no toggle is rendered.
+  const serverMode = section.dataset.viewMode;
+  if (serverMode !== 'empty') {
+    const stored = readStoredMode(groupUuid);
+    const initial: ViewMode = stored ?? (serverMode === 'list' ? 'list' : 'composed');
+    applyMode(section, initial);
+  }
+
+  wireToggle(section, groupUuid);
+  wireEmptyStateCta(section);
+  wireMemberRowCopy(section);
+}


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
