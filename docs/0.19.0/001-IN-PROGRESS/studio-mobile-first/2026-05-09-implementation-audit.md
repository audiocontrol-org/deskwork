---
title: studio-mobile-first implementation audit
date: 2026-05-09
revised: 2026-05-10
audited-branch: feature/studio-mobile-first
audited-against: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md
---

# 2026-05-09 Implementation Audit

## Scope

This audit compares the current `feature/studio-mobile-first` branch against the recorded feature workplan. It is a static implementation audit only: code, docs, tests, probes, and feature artifacts were inspected, but no fixes were applied and no new behavioral verification was run.

This report was revised after subsequent audit passes on May 9 and May 10, 2026. The first pass under-called some completed work. In particular:

- Phase 0.3 artifacts do exist (`DESIGN-STANDARDS.md`, `docs/studio-design/`, `.claude/rules/design-standards.md`).
- `session-start` was updated to read both `DESKWORK-STATE-MACHINE.md` and `DESIGN-STANDARDS.md`.
- `scripts/probe-mobile-dashboard.mjs` exists, and `scripts/smoke-er-viewport-regressions.mjs` now includes `/dev/editorial-studio`.

## Findings

### 1. Phase 0.2 conformance is still incomplete, and canonical docs now contradict live code in a few important places

The branch did land the state-machine spec and the design-standards/archive work, but the Phase 0.2 “audit + destroy violations” pass is still incomplete. The unresolved issue is no longer “Phase 0 didn’t happen”; it is “Phase 0 happened unevenly.”

- `ReviewState` is still a first-class schema type and field in [packages/core/src/schema/entry.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/schema/entry.ts:1).
- The core iterate/approve flow still persists and journals review-state semantics in [packages/core/src/iterate/iterate.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/iterate/iterate.ts:100) and [packages/core/src/entry/approve.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/entry/approve.ts:99).
- The top-level project README still teaches a retired lifecycle with a `Review` stage: [README.md](/Users/orion/work/deskwork-studio-mobile-first/README.md:19).
- Plugin-facing docs and skills still surface review-state language, for example:
  - [plugins/deskwork/README.md](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork/README.md:84)
  - [plugins/deskwork/skills/status/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork/skills/status/SKILL.md:3)
  - [plugins/deskwork/skills/doctor/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork/skills/doctor/SKILL.md:55)
- `DESIGN-STANDARDS.md` says the vestigial `ReviewState` exists only for back-compat and that new code does not write it, but `iterate.ts` still writes it today. That means the canonical design doc and the implementation disagree: [DESIGN-STANDARDS.md](/Users/orion/work/deskwork-studio-mobile-first/DESIGN-STANDARDS.md:148), [packages/core/src/iterate/iterate.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/core/src/iterate/iterate.ts:97).

This is the highest-severity remaining gap. The problem is no longer missing artifacts; it is incomplete conformance cleanup across code, canonical docs, and user-facing project docs.

### 2. The feature-status docs are internally inconsistent and no longer trustworthy as pickup state

The feature README still reads like a brand-new scaffold, while the workplan now contains a mix of recorded completions and stale unchecked tasks.

- The feature README still has placeholder prose and claims Phase 1 is “Not started”: [README.md](/Users/orion/work/deskwork-studio-mobile-first/docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/README.md:1).
- The workplan records Phase 0.3 and Phase 1.3/1.4 as completed, but Phase 1.1/1.2 remain unchecked even though the repo clearly contains the dashboard mockups, dashboard mobile CSS, stage-tile controller, compose-chip controller, and dashboard probe:
  - [packages/studio/src/pages/dashboard.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard.ts:1)
  - [plugins/deskwork-studio/public/css/dashboard-mobile.css](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/css/dashboard-mobile.css:1)
  - [plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/stage-tiles.ts:1)
  - [plugins/deskwork-studio/public/src/dashboard/compose-chip.ts](/Users/orion/work/deskwork-studio-mobile-first/plugins/deskwork-studio/public/src/dashboard/compose-chip.ts:1)
  - [scripts/probe-mobile-dashboard.mjs](/Users/orion/work/deskwork-studio-mobile-first/scripts/probe-mobile-dashboard.mjs:1)

The result is that a future session-start or pickup pass cannot infer true feature state from either feature doc alone.

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

Status: `mixed`

- Task 0.1: substantially implemented, but the checkbox ledger is stale.
  - `DESKWORK-STATE-MACHINE.md` exists and is substantial: [DESKWORK-STATE-MACHINE.md](/Users/orion/work/deskwork-studio-mobile-first/DESKWORK-STATE-MACHINE.md:1).
  - `session-start` now reads the state-machine spec and design standards: [.claude/skills/session-start/SKILL.md](/Users/orion/work/deskwork-studio-mobile-first/.claude/skills/session-start/SKILL.md:15).
  - Step 0.1.6 is not complete as written: no `.claude/rules/state-machine.md` file is present.
- Task 0.2: partially implemented.
  - Dashboard/UI behavior was moved toward stage-gated verbs and stage-driven defaults:
    - [packages/studio/src/pages/dashboard/affordances.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/dashboard/affordances.ts:65)
    - [packages/studio/src/pages/index.ts](/Users/orion/work/deskwork-studio-mobile-first/packages/studio/src/pages/index.ts:75)
  - Review-state persistence, schema, and adopter-facing/plugin-facing prose are still live, so the conformance sweep is not done.
- Task 0.3: largely implemented.
  - Top-level design standards doc exists: [DESIGN-STANDARDS.md](/Users/orion/work/deskwork-studio-mobile-first/DESIGN-STANDARDS.md:1).
  - Proposal archive exists: [docs/studio-design/README.md](/Users/orion/work/deskwork-studio-mobile-first/docs/studio-design/README.md:1).
  - `.claude/rules/design-standards.md` exists.
  - Step 0.3.8 operator sign-off is still unchecked in the workplan.

### Phase 1

Status: `substantially implemented, but incompletely recorded`

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
2. Reconcile the workplan checkbox ledger with the actual implementation state for Phase 0.1 and Phase 1.1/1.2. Right now the narrative notes say work landed, but the checkboxes still read as undone.
3. Record which work landed out of order:
   - `#242` before Phase 4
   - `#244` before the planned Shortform/`mobile-shell` phase
4. Add a Phase 0.2 cleanup note explicitly calling out the remaining contradictions:
   - root README still teaches a `Review` stage
   - plugin README and some deskwork skills still teach `reviewState` semantics
   - `iterate.ts` still writes `reviewState`
   - canonical docs should not claim that conformance sweep is complete until those are resolved
