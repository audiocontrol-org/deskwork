---
title: studio-mobile-first implementation audit
date: 2026-05-09
audited-branch: feature/studio-mobile-first
audited-against: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md
---

# 2026-05-09 Implementation Audit

## Scope

This audit compares the current `feature/studio-mobile-first` branch against the recorded feature workplan. It is a static implementation audit only: code, docs, tests, probes, and feature artifacts were inspected, but no fixes were applied and no new behavioral verification was run.

## Findings

### 1. Phase 0 is still materially incomplete, but later-phase implementation proceeded anyway

Phase 1 is explicitly blocked on Phase 0 in the workplan, but the branch still carries multiple unresolved Phase 0 violations:

- `ReviewState` is still a first-class schema type and field in [packages/core/src/schema/entry.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/schema/entry.ts:1).
- The core iterate/approve flow still persists and journals review-state semantics in [packages/core/src/iterate/iterate.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/iterate/iterate.ts:100) and [packages/core/src/entry/approve.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/entry/approve.ts:99).
- Review-state terminology is still live in studio surfaces and docs, including [packages/studio/src/pages/index.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/index.ts:77) and [docs/studio-design-standards.md](/Users/orion/work/deskwork-studio-mobile-first/docs/studio-design-standards.md:136).
- `session-start` was supposed to read `DESKWORK-STATE-MACHINE.md`, but the active skill still points at the old design-standards path and does not read the state-machine spec at all: [.claude/skills/session-start/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/.claude/skills/session-start/SKILL.md:15).
- Phase 0.3 has not landed: there is no top-level `DESIGN-STANDARDS.md`, and `docs/studio-design/ACCEPTED` / `REJECTED` do not exist.

This is the highest-severity process/architecture gap in the feature. The branch did useful UI work, but it did so without closing the prerequisite canonicalization pass that the workplan says must happen first.

### 2. The planned dashboard regression coverage is missing

The workplan requires a dedicated `scripts/probe-mobile-dashboard.mjs` and an expanded smoke pass that includes `/dev/editorial-studio`. Neither exists.

- There is no dashboard probe script under `scripts/`.
- The existing smoke still targets entry-review only; it navigates only to `/dev/editorial-review/entry/<uuid>` and never exercises the dashboard route: [scripts/smoke-er-viewport-regressions.mjs](/Users/orion/work/deskwork-studio-mobile-first/scripts/smoke-er-viewport-regressions.mjs:3), [scripts/smoke-er-viewport-regressions.mjs](/Users/orion/work/deskwork-studio-mobile-first/scripts/smoke-er-viewport-regressions.mjs:99).

This leaves the largest Phase 1 UI delta without the probe coverage the workplan explicitly called for. There are dashboard tests, but they are server-render assertions, not mobile interaction or viewport-regression coverage.

### 3. The feature documentation does not reflect the actual implementation state

The branch has substantial implementation on it, but the feature docs still read as a scaffold:

- The feature README is still template content with a placeholder description, a single “Phase 1 / Not started” row, and no record of what has actually landed: [README.md](/Users/orion/work/deskwork-studio-mobile-first/docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/README.md:1).
- The workplan checkboxes remain unchecked even for tasks with clear implementation evidence, so the workplan is not a trustworthy status ledger.

This is lower severity than the Phase 0 gap, but it is still operationally expensive: the session-start flow and any future pickup/review work will start from misleading feature state unless the docs are updated.

## Coverage Summary

### Phase 0

Status: `partial`

- Task 0.1: partially implemented.
  - `DESKWORK-STATE-MACHINE.md` exists and is substantial: [DESKWORK-STATE-MACHINE.md](/Users/orion/work/deskwork-studio-mobile-first/DESKWORK-STATE-MACHINE.md:1).
  - Step 0.1.5 is not complete: `session-start` does not read the state-machine doc: [.claude/skills/session-start/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/.claude/skills/session-start/SKILL.md:11).
  - Step 0.1.6 is not complete as written: no `.claude/rules/state-machine.md` file is present.
- Task 0.2: partially implemented.
  - Dashboard affordances were moved toward stage-gated verbs: [packages/studio/src/pages/dashboard/affordances.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard/affordances.ts:65).
  - Review-state surfacing and persistence are still widespread, so the audit/destroy pass is not done.
- Task 0.3: not implemented.
  - No top-level `DESIGN-STANDARDS.md`.
  - No `docs/studio-design/` archive structure.

### Phase 1

Status: `mostly implemented, but incompletely verified and incompletely documented`

- Task 1.1: implemented.
  - Dashboard audit exists: [dashboard-audit.md](/Users/orion/work/deskwork-studio-mobile-first/docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/dashboard-audit.md:1).
  - Dashboard mockups exist in `plugins/deskwork-studio/public/mockups/`.
- Task 1.2: implemented, but with a different shape than the original “mobile-bar/sheet” framing.
  - Dashboard mobile implementation is present in [packages/studio/src/pages/dashboard.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard.ts:52), [plugins/deskwork-studio/public/css/dashboard-mobile.css](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/css/dashboard-mobile.css:1), [plugins/deskwork-studio/public/src/dashboard/compose-chip.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/compose-chip.ts:1), and [plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts:1).
  - Issue-driven fixes for `#236`, `#237`, `#238`, `#242`, and `#243` are reflected in the dashboard and entry-review code.
- Task 1.3: partial only.
  - No dashboard probe script.
  - Existing smoke does not cover dashboard.
- Task 1.4: indeterminate from feature docs.
  - The branch contains review-fix commits, but the feature docs do not record a review narrative or disposition trail.
- Task 1.5: not evidenced in this feature directory.
  - No feature-local release verification note for `v0.19.0`.
  - The feature docs do not record issue-closeout or iPhone verification.

### Phase 2

Status: `not implemented as planned`

- Task 2.1 `mobile-shell`: not implemented.
  - No `packages/studio/src/mobile-shell/`.
  - No `plugins/deskwork-studio/public/src/mobile-shell/`.
  - No `plugins/deskwork-studio/public/css/mobile-shell.css`.
- Task 2.2 Shortform mobile-first: not implemented in the workplan’s planned form.
  - No shortform mockups under the expected naming pattern.
  - No shortform-specific mobile probe.
- Task 2.3/2.4: not implemented.

Note: `#244` work did land, but it landed on entry-review’s outline drawer rather than through the planned Shortform-plus-`mobile-shell` phase. See [packages/studio/src/pages/entry-review/outline-drawer.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/entry-review/outline-drawer.ts:1).

### Phase 3

Status: `not implemented against this workplan`

- The workplan calls for standalone scrapbook-viewer and content-view mobile-first passes.
- This branch does contain scrapbook-related mobile work and probes, but those are for the entry-review scrapbook experience rather than the Phase 3 standalone-viewer plan.
- No `probe-mobile-scrapbook-viewer.mjs`.
- No `probe-mobile-content-view.mjs`.

### Phase 4

Status: `partially implemented out of order`

- `#242` Cancel affordances have landed on dashboard rows and the entry-review decision strip:
  - [packages/studio/src/pages/dashboard/affordances.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard/affordances.ts:89)
  - [packages/studio/src/pages/entry-review/decision-strip.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/entry-review/decision-strip.ts:150)
- The broader Phase 4 scope is not implemented:
  - No help-page mobile probe.
  - No index-page mobile probe.
  - No evidence that every interactive surface now has the planned cancel affordance.

## Implemented Artifacts Worth Preserving

Even with the gaps above, the branch already contains meaningful work that should be treated as real progress rather than discarded:

- Canonical state-machine spec: [DESKWORK-STATE-MACHINE.md](/Users/orion/work/deskwork-studio-mobile-first/DESKWORK-STATE-MACHINE.md:1)
- Dashboard audit: [dashboard-audit.md](/Users/orion/work/deskwork-studio-mobile-first/docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/dashboard-audit.md:1)
- Dashboard mobile-first implementation:
  - [packages/studio/src/pages/dashboard.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard.ts:52)
  - [plugins/deskwork-studio/public/css/dashboard-mobile.css](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/css/dashboard-mobile.css:1)
  - [plugins/deskwork-studio/public/src/dashboard/compose-chip.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/compose-chip.ts:1)
  - [plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts:1)
- Entry-review mobile affordance work and probes:
  - [scripts/probe-mobile-editor.mjs](/Users/orion/work/deskwork-studio-mobile-first/scripts/probe-mobile-editor.mjs:1)
  - [scripts/probe-mobile-scrapbook.mjs](/Users/orion/work/deskwork-studio-mobile-first/scripts/probe-mobile-scrapbook.mjs:1)

## Recommended Next Doc Corrections

1. Update the feature README so it no longer presents this branch as “Not started.”
2. Mark Phase 0 and Phase 1 tasks in the workplan according to actual code state, even if some remain partial.
3. Record which work landed out of order:
   - `#242` before Phase 4
   - `#244` before the planned Shortform/`mobile-shell` phase
4. Add a follow-up task for the missing dashboard probe and dashboard inclusion in the smoke suite.
