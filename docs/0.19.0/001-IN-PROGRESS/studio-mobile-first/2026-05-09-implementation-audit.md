---
title: studio-mobile-first implementation audit
date: 2026-05-09
revised: 2026-05-11
audited-branch: feature/studio-mobile-first
audited-against: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md
---

# 2026-05-09 Implementation Audit

## Scope

This audit compares the current `feature/studio-mobile-first` branch against the recorded feature workplan. It is a static implementation audit only: code, docs, tests, probes, and feature artifacts were inspected, but no fixes were applied and no new behavioral verification was run.

This report was revised after subsequent audit passes on May 9, May 10, and May 11, 2026. Earlier revisions under-called some completed work, and this revision also supersedes findings that are no longer true. In particular:

- Phase 0.3 artifacts do exist (`DESIGN-STANDARDS.md`, `docs/studio-design/`, `.claude/rules/design-standards.md`).
- `session-start` was updated to read both `DESKWORK-STATE-MACHINE.md` and `DESIGN-STANDARDS.md`.
- `scripts/probe-mobile-dashboard.mjs` exists, and `scripts/smoke-er-viewport-regressions.mjs` now includes `/dev/editorial-studio`.
- `ReviewState` has been removed from the entry schema, `iterate.ts` no longer writes it, the root feature README is no longer scaffold text, and `.claude/rules/state-machine.md` now exists.

## Findings

### 1. Phase 0.2 is marked complete in feature docs, but several adopter-facing and canonical docs still describe pre-cleanup review-state semantics

The branch has now removed `ReviewState` from the entry schema and stopped writing it in the iterate path, but the documentation cleanup is still incomplete.

- Plugin-facing docs and skills still surface review-state language, for example:
  - [plugins/deskwork/README.md](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork/README.md:84)
  - [plugins/deskwork/skills/status/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork/skills/status/SKILL.md:3)
  - [plugins/deskwork/skills/doctor/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork/skills/doctor/SKILL.md:55)
- Canonical docs still describe a vestigial `ReviewState` type/read-side artifact, but that type is now gone from the entry schema. The prose is behind the implementation in both [DESIGN-STANDARDS.md](/Users/orion/work/deskwork-studio-mobile-first/DESIGN-STANDARDS.md:148) and [.claude/rules/state-machine.md](/Users/orion/work/deskwork-studio-mobile-first/.claude/rules/state-machine.md:13).

This is the highest-severity remaining gap. The branch did the code cleanup, but the surrounding guidance still over-explains or mis-explains a model that is no longer present in the entry schema.

### 2. The feature-status docs improved materially, but they still overstate “complete” for Phase 0.2

The feature README is no longer placeholder content, and the workplan’s Phase 0.1 / 1.1 / 1.2 checkbox drift has largely been corrected. The remaining problem is narrower: feature-facing status now says Phase 0.2 is complete, while the repo still contains unresolved review-state language in adopter docs and skills.

- The feature README now reports `0.2` as complete: [README.md](/Users/orion/work/deskwork-studio-mobile-first/docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/README.md:14).
- The workplan records `1.6` and `1.7` as complete and closes the old schema/README/rule gaps, but the remaining plugin-doc and skill drift means “complete” is still too strong for the broader Phase 0.2 goal as written.

The pickup-state problem is now mostly fixed. The remaining mismatch is between “complete” in feature docs and the still-open cleanup surface in adopter-facing prose.

### 3. Implementation order diverged from the sequenced plan, and the workplan does not yet narrate that drift clearly

The workplan pitched four sequenced cuts, but the branch already includes cross-phase work that landed out of order:

- `#242` Cancel affordances landed on dashboard and entry-review before the planned Phase 4 cross-cutting pass:
  - [packages/studio/src/pages/dashboard/affordances.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard/affordances.ts:89)
  - [packages/studio/src/pages/entry-review/decision-strip.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/entry-review/decision-strip.ts:150)
- `#244` work landed on entry-review’s outline drawer before the planned Phase 2 Shortform + `mobile-shell` arc:
  - [packages/studio/src/pages/entry-review/outline-drawer.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/entry-review/outline-drawer.ts:1)
- The planned `mobile-shell` extraction still has not started:
  - no `packages/studio/src/mobile-shell/`
  - no `plugins/deskwork-studio/public/src/mobile-shell/`
  - no `plugins/deskwork-studio/public/css/mobile-shell.css`

The code can legitimately diverge from the original sequence, but once that happens the workplan should record the new reality explicitly rather than preserving the old planned order as if it were still the execution history.

## Coverage Summary

### Phase 0

Status: `mostly complete, with residual Phase 0.2 doc drift`

- Task 0.1: complete.
  - `DESKWORK-STATE-MACHINE.md` exists and is substantial: [DESKWORK-STATE-MACHINE.md](/Users/orion/work/deskwork-studio-mobile-first/DESKWORK-STATE-MACHINE.md:1).
  - `session-start` now reads the state-machine spec and design standards: [.claude/skills/session-start/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/.claude/skills/session-start/SKILL.md:15).
  - `.claude/rules/state-machine.md` now exists: [.claude/rules/state-machine.md](/Users/orion/work/deskwork-studio-mobile-first/.claude/rules/state-machine.md:1).
- Task 0.2: mostly implemented, but not fully complete as claimed.
  - Dashboard/UI behavior was moved toward stage-gated verbs and stage-driven defaults:
    - [packages/studio/src/pages/dashboard/affordances.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard/affordances.ts:65)
    - [packages/studio/src/pages/index.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/index.ts:75)
  - The entry schema cleanup did land:
    - [packages/core/src/schema/entry.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/schema/entry.ts:1)
    - [packages/core/src/iterate/iterate.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/iterate/iterate.ts:95)
  - Adopter-facing/plugin-facing prose still contains review-state language, so the conformance sweep is not fully done.
- Task 0.3: complete.
  - Top-level design standards doc exists: [DESIGN-STANDARDS.md](/Users/orion/work/deskwork-studio-mobile-first/DESIGN-STANDARDS.md:1).
  - Proposal archive exists: [docs/studio-design/README.md](/Users/orion/work/deskwork-studio-mobile-first/docs/studio-design/README.md:1).
  - `.claude/rules/design-standards.md` exists.
  - The workplan now records operator sign-off on 0.3.8.

### Phase 1

Status: `implemented through 1.4, with release/verification pending`

- Task 1.1: implemented.
  - Dashboard audit exists: [dashboard-audit.md](/Users/orion/work/deskwork-studio-mobile-first/docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/dashboard-audit.md:1).
  - Dashboard mockups exist in `plugins/deskwork-studio/public/mockups/`.
- Task 1.2: implemented, but with a different shape than the original “mobile-bar/sheet” framing.
  - Dashboard mobile implementation is present in [packages/studio/src/pages/dashboard.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard.ts:52), [plugins/deskwork-studio/public/css/dashboard-mobile.css](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/css/dashboard-mobile.css:1), [plugins/deskwork-studio/public/src/dashboard/compose-chip.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/compose-chip.ts:1), and [plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts:1).
  - Issue-driven fixes for `#236`, `#237`, `#238`, `#242`, and `#243` are reflected in the dashboard and entry-review code.
- Task 1.3: implemented.
  - Dashboard probe exists: [scripts/probe-mobile-dashboard.mjs](/Users/orion/work/deskwork-studio-mobile-first/scripts/probe-mobile-dashboard.mjs:1).
  - Smoke includes dashboard coverage: [scripts/smoke-er-viewport-regressions.mjs](/Users/orion/work/deskwork-studio-mobile-first/scripts/smoke-er-viewport-regressions.mjs:10).
- Task 1.4: recorded as implemented in the workplan.
  - The workplan now includes reviewer/disposition notes for 1.4.1–1.4.4.
- Task 1.6: implemented.
  - The workplan records six audit-driven remediation commits, including the root README fix, state-machine rule, feature README rewrite, and Phase 4 re-narration.
- Task 1.7: implemented.
  - The workplan records schema removal and cascade cleanup.
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

1. Tighten the remaining Phase 0.2 prose so “complete” is actually true:
   - remove lingering review-state language from `plugins/deskwork/README.md`
   - remove or rewrite stale `reviewState` references in deskwork skills such as `status` and `doctor`
   - update canonical docs that still describe a vestigial `ReviewState` type when the type has already been removed
2. Record which work landed out of order:
   - `#242` before Phase 4
   - `#244` before the planned Shortform/`mobile-shell` phase
3. Add a release/verification note when Phase 1.5 actually happens:
   - v0.19.0 release
   - iPhone verification
   - issue closeout narrative for `#236`, `#237`, `#238`, and `#243`
