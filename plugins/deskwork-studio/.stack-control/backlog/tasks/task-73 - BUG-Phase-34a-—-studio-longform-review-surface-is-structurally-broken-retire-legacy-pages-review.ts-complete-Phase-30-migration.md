---
id: TASK-73
title: >-
  BUG: Phase 34a — studio longform review surface is structurally broken; retire
  legacy pages/review.ts; complete Phase-30 migration
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-171
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What's broken

The studio's longform editorial review surface is currently 100% unusable. The dashboard's per-row link routes to a legacy `pages/review.ts` surface that reads from pre-Phase-30 **workflow records**. `iterateEntry` (the entry-centric writer added in Phase 30 / v0.11.1) updates only **sidecars + the history journal**. Result: the studio shows frozen pre-2026-05-01 content for any entry iterated since the Phase 30 pivot. Press-check chrome looks right; data is silently stale.

Every post-Phase-30 longform editorial review that used the dashboard's link is suspect — the operator may have approved (or rejected) content they were never actually shown.

## Live evidence (deskwork-plugin/prd as the test case)

- Entry UUID: `9845c268-670f-4793-b986-0433e9ef4fb9`
- Workflow UUID: `91e95984-5510-4ba8-b291-3de73a1dbd7a`
- Workflow `state: applied`, `currentVersion: 1`, `updatedAt: 2026-04-29T22:46:45.311Z`
- Sidecar `iterationByStage.Drafting: 4`, `updatedAt: 2026-05-03T18:18:46.400Z`
- Dashboard URL → `/dev/editorial-review/9845c268-...` → renders workflow v1 (frozen 2026-04-29). curl + Playwright confirm: zero hits for "Phase 34" content despite Phase 34 being in the file on disk + in the iteration journal.
- Entry-keyed URL `/dev/editorial-review/entry/9845c268-...` → renders entry-review surface; current artifact is in a `<textarea class="er-entry-body">` (62KB) but the `<section class="er-entry-artifact">` next to it is **empty** (no rendered preview, no margin notes, no decision strip — just stage buttons).

Both surfaces fail the operator-facing review use case for different reasons: legacy has chrome but stale data; entry-keyed has fresh data but no chrome.

## Root cause: half-finished migration

Phase 30 (v0.11.1, 2026-05-01) pivoted the data layer from workflow-keyed records to entry-keyed sidecars. The UI did not follow. The fork in the road got documented as **`packages/studio/src/server.ts:373-384`**:

> *"The entry-review-first short-circuit added by #146 was a regression: it routed every dashboard click (every row links here per #110) to the minimal entry-review surface, which is a stage-controller, not a press-check review surface. Operators lost margin-note authoring, rendered preview, and the decision strip. Restore the status quo ante: fall straight through to the workflow / entry-id resolution paths (renderReviewPage) so the dashboard's UUID links land on the working review surface. The minimal entry-review surface remains reachable via the explicit `/dev/editorial-review/entry/<uuid>` route."*

And **`packages/studio/src/pages/entry-review.ts:14-18`**:

> *"Rendering is intentionally minimal — the goal of Task 35 is the route shape + affordance plumbing, not a fully-styled UI. Styling will land once the affordance set stabilizes against real entries."*

Both are textbook *"just for now"* code-comment IOUs. Per `.claude/rules/agent-discipline.md` "No 'just for now' shortcuts" (commit `42eb837`) and the project's system-prompt guidance forbidding half-finished implementations + backwards-compat shims, **there should be no legacy code, no migration window, no two-surfaces-coexist.** The fact that all three exist now is exactly the failure mode those rules forbid. The convention canon trap activated immediately: 3 days post-pivot, the legacy surface IS the review surface, the entry-review surface IS the broken stub.

## Scope

### Port press-check chrome from `pages/review.ts` (710 lines) → `pages/entry-review.ts` (185 lines)

- [ ] Folio header
- [ ] Version strip — entry-keyed (list iterations from history journal; clicking a version shows historical content read-only)
- [ ] Edit toolbar (Source / Split / Preview + Focus mode)
- [ ] Edit panes (source textarea + rendered preview + split-pane gutter)
- [ ] Outline drawer
- [ ] Marginalia column + stow chevron + edge pull tab (per `.claude/rules/affordance-placement.md`)
- [ ] Margin-note authoring (select-text → annotation composer → save)
- [ ] Rendered markdown preview
- [ ] Decision strip with chord chips (Approve `a`, Iterate `i`, Reject `r`) + "?" shortcuts overlay
- [ ] Stage-aware affordances via existing `getAffordances(entry)`
- [ ] Scrapbook drawer (per F1–F6 work)

### Source data from sidecars + history journal

- [ ] Entry state from `.deskwork/entries/<uuid>.json`
- [ ] Iteration content from `.deskwork/review-journal/history/*-iteration-*.json` events
- [ ] **New entry-keyed annotation store** OR migration of workflow-keyed annotations to entry-keyed (design needed at 34a kickoff)
- [ ] All `/api/dev/editorial-review/*` endpoints accept entry UUIDs; contract documented

### Delete legacy code paths

- [ ] **Delete `packages/studio/src/pages/review.ts` entirely.** Not move-to-deprecated. Delete.
- [ ] Delete legacy routes in `server.ts:347-417` (workflow-id branch + entry-id legacy branch + slug catch-all)
- [ ] Replace bare `/dev/editorial-review/<uuid>` route with a 301 redirect to `/dev/editorial-review/entry/<uuid>` for in-flight bookmarks
- [ ] **File a separate issue** at 34a kickoff: retire the bare-UUID 301 redirect in the next phase. (The redirect is itself a backwards-compat shim with an explicit retirement issue, NOT a "for later" code comment.)
- [ ] Delete `renderReviewPage`, `prepareRender`, `lookupReviewEntry`, `errorFromBody`, `pickContentKind`, `pickSite`, `stringField`, `stateLabel`, `pendingSkillCmd`. Relocate `shortcutChipWrap`, `renderError`, `renderShortcutsOverlay`, `renderMarginaliaTab`, `renderMarginalia`, `renderEditToolbar`, `renderEditPanes`, `renderOutlineDrawer` to `entry-review.ts`.
- [ ] Delete workflow-record code paths kept alive only because legacy longform/outline routes read them. `readWorkflow`, `readVersions`, `appendVersion`, `transitionState` for longform/outline. **Shortform paths stay** (operator-confirmed deferral).
- [ ] **File a separate issue** at 34a kickoff: shortform → entry-centric migration. Workflow records leave the codebase entirely once that issue lands.
- [ ] Delete the *"intentionally minimal"* / *"styling will land once the affordance set stabilizes"* comments at `entry-review.ts:14-18`
- [ ] Delete the *"DEPRECATED (pipeline-redesign Task 35)"* / *"both coexist during the migration window"* comments at `server.ts:332-355`
- [ ] Delete the entry-first-short-circuit explainer at `server.ts:373-384`

### Update every link emitter to `/dev/editorial-review/entry/<uuid>`

- [ ] `packages/studio/src/pages/dashboard/affordances.ts:60`
- [ ] `packages/studio/src/pages/content.ts:353`
- [ ] `packages/studio/src/pages/content-detail.ts:280`
- [ ] `packages/studio/src/pages/index.ts:115`
- [ ] `packages/studio/src/pages/help.ts:262, 283, 391, 426`
- [ ] `packages/studio/src/server.ts:224`
- [ ] `packages/studio/src/routes/api.ts:66`
- [ ] Operator-facing skill prose: `/feature-extend`, `/feature-setup`, any other skill emitting a review URL
- [ ] CLI URL printers (`deskwork iterate` JSON output)

### Audit corrupted reviews

- [ ] Generate list via one-shot script (`scripts/audit-post-pivot-iterations.ts`, committed alongside) — every entry whose sidecar `iterationByStage` total exceeds the workflow record's `currentVersion`
- [ ] For each entry on the list: open under the new unified surface; compare current sidecar content vs. the workflow snapshot the operator may have approved
- [ ] For each non-trivial diff (non-whitespace, non-frontmatter): re-review under the new surface; record disposition (re-approved / iterate-needed / cancel)
- [ ] Document audit results in `docs/1.0/001-IN-PROGRESS/deskwork-plugin/post-pivot-review-audit.md`

### Grep audit (per `agent-discipline.md` "no just for now" rule)

- [ ] Run `grep -rn -E "(for now|just for now|TODO|FIXME|HACK|XXX|temporary|stub|placeholder|pending|until F|until v|migration window|legacy|deprecated|coexist|for later|will land|will replace)" packages/studio/src/ plugins/deskwork-studio/public/src/ | grep -v "\.test\."`. Each hit ends in either fix-now or filed-issue with link in a comment trailer.
- [ ] Same audit on `packages/cli/src/` and `packages/core/src/`.

## Acceptance

- [ ] `pages/review.ts` does not exist (`test ! -f packages/studio/src/pages/review.ts`)
- [ ] `git grep -i 'legacy' packages/studio/` returns zero hits
- [ ] `git grep -E '(workflow-keyed|migration window|coexist during|will land later|stylings? will land|intentionally minimal)' packages/studio/src/` returns zero hits
- [ ] **Live: dashboard click on any Drafting entry lands on `/dev/editorial-review/entry/<uuid>`** with full press-check chrome; margin-note authoring works; displayed content matches the file on disk
- [ ] Live: clicking Iterate on the studio + running `deskwork iterate` snapshots current file content as the next version; the unified surface re-renders with the new version
- [ ] **The Phase 34 PRD review can be completed end-to-end via the studio UI alone** (the structural inverse of the trigger that filed this issue)
- [ ] Studio test count increases by at least 30 across this issue's resolution
- [ ] At least one new release shipped to npm + marketplace + operator has run `/plugin marketplace update deskwork` and successfully reviewed a real entry end-to-end via the dashboard's link

## Tracked under

Phase 34 umbrella: #170

## Related rules

- `.claude/rules/agent-discipline.md` "No 'just for now' shortcuts" (commit `42eb837`)
- `.claude/rules/affordance-placement.md` (component-attached affordances)
- `.claude/rules/ui-verification.md` (live verification protocol)
- System-prompt guidance: *"No half-finished implementations either"* / *"Avoid backwards-compatibility hacks"*
<!-- SECTION:DESCRIPTION:END -->
