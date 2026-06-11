---
id: TASK-45
title: >-
  Anchor unification: stack-control-owned state resolves via the installation,
  never a free --repo-root
status: To Do
assignee: []
created_date: '2026-06-11 04:15'
updated_date: '2026-06-11 05:11'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two anchor models coexist: 009-era verbs (backlog, roadmap, inbox, session-start, check-clones, scope-export base root) resolve through the nearest-enclosing installation, while the dw-lifecycle-ported surfaces (govern --repo-root, audit-barrage config override + audit-runs dirs, clone-detector-reader DEFAULT_BASELINE, feature-root consumers) resolve against a caller-supplied repo root. Consequence: the deskwork repo root is a half-installation (audit-barrage-config.yaml + audit-runs/ with no config.yaml marker), and the barrage keeps surfacing seam bugs (AUDIT-20260611-13 / TASK-40 is the cwd instance). Target shape: installation is the primary anchor for all stack-control-owned state; the only repo-root facts are external-tool anchors derived, not parameterized — git toplevel (diff engine) and the Spec Kit root (specs/.specify). Surfaced 2026-06-10 while answering why govern ran from the repo root during the specs/014 governance loop.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Refinement (operator, 2026-06-10): git is NOT a legitimate repo-root anchor — `git -C <installation> diff --relative` + `ls-files` (already cwd-relative) anchor the diff engine at the installation cleanly. The only genuine external root anchor is Spec Kit’s specs/.specify convention. Open consequence to design for: an installation-scoped diff omits cross-tree feature artifacts (specs/ at the repo root in the transitional monorepo layout) — the payload should fold the resolved feature root explicitly alongside the installation subtree, or the spec artifacts move inside the installation.

Research (2026-06-10): Spec Kit is monorepo-compatible at the script layer — upstream common.sh resolves its root by walking UP to the nearest .specify/ directory, explicitly prioritized over the git toplevel ("prevents using a parent git repo when spec-kit is initialized in a subdirectory"); our v0.9.4 install carries this unmodified. So `specify init --here` inside plugins/stack-control/ re-anchors specs/, templates, memory/, feature.json at the installation — the cross-tree-span concern dissolves if .specify/ + specs/ relocate into the installation. Also upstream: SPECIFY_FEATURE_DIRECTORY env (explicit per-feature dir) > .specify/feature.json feature_directory > branch-prefix lookup; SPECIFY_FEATURE selects the feature without branch matching. NOT configurable: the literal specs/ and .specify names. Upstream weak spot is only the slash-command layer (github/spec-kit issue 1026 — invoking /speckit.* from outside the subfolder; open/stale) which stack-control does not depend on. Unification design: relocating spec-kit into the installation + converting resolveFeatureRoot/CLAUDE.md-marker consumers is one change.

- **Promoted-to:** spec:specs/015-installation-isolation

Spec authored 2026-06-10 at specs/installation-isolation (UNNUMBERED — renamed from the recorded spec:specs/015-installation-isolation target per the operator descriptive-slug naming directive; the companion specs/descriptive-naming feature captures that directive).

Progression evidence (2026-06-11, implementation executed via /stack-control:execute; status transition stays the operator's call):

- US1 isolation probe RED→green + installation threading: de0d611a (RED), fd67b8d8 (T003), fd4f2fd2/e4992976 (T004 flag retirement), 690e6040 (T005 full verb table).
- US2 uniform refusal: d04bc725 (RED), 528203ce (T007).
- US3 govern anchoring + cross-tree fold: fbae22da (RED), 968bd235 (T009; TASK-40 excludePaths-from-record closed).
- US4 cwd invariance + slush destination: 15ac6172 (RED), b0e235cd (T011).
- US5 legacy half-installation notice: 4ff7079a (RED), 001f5824 (T013); this repo's root half-installation retired: 237271c6 + 5bfe71d9 (T014; gitignore depth fix).
- US6 installation-aware feature-root resolver: 7ada5ba6 (RED), b036733c (T016); Spec Kit root relocated into the installation: 47f2606c (T017); constitution 1.3.0 installation-anchor invariant: 3c25dd08 (T018).
- Suite reconciliation: 184 files/1220 tests → 190 files/1265 tests (+6 new test files / +40 tests, +5 retired-flag rows in subcommand-flag-validation; arithmetic reconciles exactly).
<!-- SECTION:NOTES:END -->
