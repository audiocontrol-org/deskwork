I walked the diff focusing on the server renderers (`members-section.ts`, `dashboard/section.ts`, `dashboard/data.ts`, `entry-review/data.ts`), the two CSS files, and the client controllers, paying particular attention to the CSS cascade interaction with the `hidden` attribute, the composed-view bucketing logic's silent-drop vectors beyond the already-filed AUDIT-35, and the lane-accent claims in AUDIT-29's structural-decision #5.

### Popover `hidden` attribute is defeated by `.er-row-member-popover { display: block }` — popover renders visible at rest on every member row

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:347-354`, `packages/studio/src/pages/dashboard/section.ts:50` (`renderMemberPopover`)

`renderMemberPopover` emits `<div class="er-row-member-popover" data-row-member-popover hidden>` (section.ts ~line 50), and the client controller toggles visibility via `popover.hidden = !expanded` (`row-member-tab.ts` `setRowExpanded`). The intended design — confirmed by the section.ts docblock ("CSS … reveals the popover when the row carries `.is-member-expanded`") and the whole pull-tab "stowed-state affordance" framing — is that the popover is hidden until the tab is tapped. But the CSS rule `.er-row-member-popover { display: block; ... }` (dashboard-row-affordances.css:347) unconditionally sets `display: block`. The UA stylesheet's `[hidden] { display: none }` has equal specificity (0,1,0) to the class selector, so the author rule wins by origin/order. **The `hidden` attribute is inert; the popover paints `display: block` at all times.**

The result: every member row renders its full parent-list popover (kraft left-border, "Member of N groups" head, every parent link) directly below the row foreground on initial load, defeating the entire collapse/expand affordance. There is no `.er-row-shell:not(.is-member-expanded) .er-row-member-popover { display: none }` rule anywhere in the diff to gate it. The integration test (`dashboard-member-row-badge.test.ts`) only asserts `toContain('er-row-member-popover')` in the HTML string — it never checks computed visibility — so the suite is green while the surface is broken. A fix: drive visibility from the row-shell state class (`.er-row-shell .er-row-member-popover { display: none }` + `.er-row-shell.is-member-expanded .er-row-member-popover { display: block }`) and drop the reliance on the `hidden` attribute, OR keep `hidden` authoritative by scoping the class rule to the expanded state only. This needs a live Playwright check per `.claude/rules/ui-verification.md` before claiming fixed.

### Composed view has silent-drop vectors beyond AUDIT-35: stage-not-in-template members vanish, and a template-load failure leaves `laneConfigsById` half-populated

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/members-section.ts:99-150` (`bucketMembersByLane`), `packages/studio/src/pages/entry-review/data.ts:188-210` (`loadGroupMembersBundle`)

AUDIT-35 acknowledges that composed view silently drops members with `lane === undefined` or a lane absent from `laneConfigsById`. Two additional silent-drop vectors are NOT covered. (1) In `bucketMembersByLane`, a member is bucketed under `stageMap.get(member.currentStage)`, but the emitted `byStage` only walks `template.linearStages` + `template.offPipelineStages`. Any member whose `currentStage` is not in its lane's template (a legacy stage, or a stage the operator's custom template omits) is pushed into `stageMap` but never read back — it vanishes from composed view AND is excluded from `memberCount`, so even the swim-head count is wrong with no "missing" indicator. The same member renders fine in list view, producing an invisible composed↔list discrepancy distinct from #35.

(2) In `loadGroupMembersBundle` (data.ts), the load order is `laneConfigsById.set(strict.id, strict)` **before** `loadPipelineTemplate(...)`. If the template load throws, the `catch { continue }` fires — but the lane config is already in `laneConfigsById` while its template is absent from `templatesById`. Back in `bucketMembersByLane:135`, members of that lane pass the `laneConfigsById.has(member.lane)` guard, get bucketed, then hit `const template = templatesById.get(lane.pipelineTemplate); if (template === undefined) continue;` — dropping **every** member of that lane from composed view, again silently and again invisible in list view. A reasonable fix: only `laneConfigsById.set` after the template successfully resolves (move the set below the template load inside the try), and in `bucketMembersByLane` emit an "unbucketed members" tail (mirroring the list view's unrouted styling) so stage/template mismatches surface rather than disappear.

### Card and list-row lane-accent CSS keys on a `data-template-id` attribute the markup never emits — contradicting AUDIT-29 structural-decision #5 and reintroducing lane-id coupling

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/css/entry-review-members.css:262-265,318-321`, `packages/studio/src/pages/entry-review/members-section.ts:152-167` (`renderMemberStageCard`), `:200-235` (`renderListRow`)

AUDIT-29 structural-decision #5 claims: "The composed view's `data-template-id` attribute drives the lane-accent color via CSS — no per-lane `class="lane-<id>"` coupling for non-default templates. This avoids the 'we forgot to teach the CSS about lane X' failure mode." That claim holds only for the swim **head** (`.er-members-swim` carries `data-template-id`, and CSS rules at entry-review-members.css:218-241 key on it). It is false for the cards and list rows. `renderMemberStageCard` emits `<a class="er-members-card lane-${member.lane ?? 'default'}">` with **no** `data-template-id`, and `renderListRow` emits `<li class="er-member-row lane-<id>">` likewise with no `data-template-id`. Yet the CSS includes `.er-members-card[data-template-id="editorial"]` (line 263) and `.er-member-row[data-template-id="editorial"]` (line 319) — **dead selectors that never match.**

The functional consequence: a lane using the `editorial` template but whose id is not the literal `default` (e.g. an `essays` or `articles` lane) gets a proof-blue swim head but **faded** cards and list rows, because the only card/row accent rules that fire are the hardcoded `.lane-default` / `.lane-mockups` literals (lines 262, 267, 317, 322). The accent is inconsistent within a single swim block, and the exact "forgot to teach CSS about lane X" failure mode #5 says it avoided is reintroduced one level down. Fix: emit `data-template-id="${bucket.template.id}"` on the card `<a>` and the list `<li>` (the data is already in scope via the bucket/template), so the template-keyed accent rules actually drive the color and the literal `.lane-<id>` rules can be retired.

### Popover left margin (22px) no longer matches the tab width (24px) after the AUDIT-31 WCAG widening

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:349` (`.er-row-member-popover { margin: 0 0 0 22px }`) vs `:250` (`.er-row-member-tab { width: 24px }`) and `:340` (`.has-member-tab .er-row-fg { padding-left: 28px }`)

AUDIT-31 widened `.er-row-member-tab` from 22px to 24px and bumped `.er-row-shell.has-member-tab .er-row-fg` padding-left from 26px to 28px to keep the foreground clear of the tab. The popover's left offset was not updated in lockstep: `.er-row-member-popover` still has `margin: 0 0 0 22px`. The popover now starts 2px inside the 24px tab column rather than flush with the row foreground, producing a small but visible left-edge misalignment between the row content (inset 28px) and the popover (inset 22px). This is the kind of cross-rule drift the WCAG-fix commit introduced by touching the tab width without sweeping the dependent offsets. Fix: align the popover's left margin with the tab column (24px) or the foreground inset (28px), whichever the design intends — the magic numbers 22/24/28 should be derived from a single `--er-member-tab-width` token rather than three independently-edited literals. (Note: this finding is somewhat moot until AUDIT-BARRAGE-claude-01 is fixed, since the popover currently renders unconditionally.)

### Client controllers `initGroupMembersSection` / its `wire*` helpers re-attach event listeners on every call despite "idempotent" docstring

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts:104-150` (`initGroupMembersSection`, `wireToggle`, `wireEmptyStateCta`, `wireMemberRowCopy`)

The `initGroupMembersSection` docblock states "Idempotent — calling twice has no visible effect." That is true only for `applyMode` (it reads current state), but **not** for the three `wire*` helpers: `wireToggle`, `wireEmptyStateCta`, and `wireMemberRowCopy` each call `addEventListener` unconditionally on every invocation. There is no module-level `wired` guard analogous to the one in the sibling `row-member-tab.ts` (which correctly guards with `let wired = false`). If `initPressCheckSurface` ever runs twice (re-init after a partial DOM swap, or a future refresh path), the section accumulates duplicate listeners — clicking a member row would fire `copyOrShowFallback` twice (two clipboard writes + two toasts), and the toggle would double-write localStorage. The inconsistency with `row-member-tab.ts` (which got the guard right) suggests this was an oversight. Fix: mirror the `row-member-tab.ts` pattern with a module-level guard, or bind via a `dataset` sentinel on the section element so re-init is a genuine no-op. Low severity because the current single call site doesn't trigger it, but the docstring asserts a property the code doesn't have.
