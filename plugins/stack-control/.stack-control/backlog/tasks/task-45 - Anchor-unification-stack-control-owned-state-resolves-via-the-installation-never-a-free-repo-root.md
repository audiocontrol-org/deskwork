---
id: TASK-45
title: >-
  Anchor unification: stack-control-owned state resolves via the installation,
  never a free --repo-root
status: To Do
assignee: []
created_date: '2026-06-11 04:15'
updated_date: '2026-06-11 05:02'
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
<!-- SECTION:NOTES:END -->
