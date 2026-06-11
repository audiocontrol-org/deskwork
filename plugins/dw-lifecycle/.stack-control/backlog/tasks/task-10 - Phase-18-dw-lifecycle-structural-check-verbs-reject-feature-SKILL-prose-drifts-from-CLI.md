---
id: TASK-10
title: >-
  Phase 18: dw-lifecycle structural-check verbs reject --feature; SKILL prose
  drifts from CLI
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
  - pending-verification
dependencies: []
references:
  - gh-417
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Repro

Six structural-check verbs reject `--feature` at runtime, but every implement / review / session-start chain in the dw-lifecycle SKILLs pipes that flag in:

```
$ dw-lifecycle check-clones --feature hygiene
unknown arg: --feature

$ dw-lifecycle check-anti-patterns --feature hygiene
anti-patterns: unknown argument: --feature

$ dw-lifecycle check-adopters --feature hygiene
adopter-manifests: unknown argument: --feature

$ dw-lifecycle check-module-symmetry --feature hygiene
module-symmetry: unknown argument: --feature

$ dw-lifecycle check-refactor-preconditions --feature hygiene --commit-msg-file <path>
check-refactor-preconditions: unknown arg: --feature

$ dw-lifecycle check-disposition-survivor --feature hygiene
check-disposition-survivor: unknown arg: --feature
```

Operators following `/dw-lifecycle:implement` or `/dw-lifecycle:session-start` SKILL prose verbatim hit `unknown arg` errors. The 2026-06-04 close-shipped follow-up session noted "SKILL.md prose is ahead of CLI" — the prose adds `--feature` ahead of CLI support.

## Why this is a problem

- **Adopter UX broken.** A clean first-run of `/dw-lifecycle:implement` end-of-task chain errors on every chained check.
- **The structural chain runs project-wide today.** That's correct for what the verbs DO, but the chain has no concept of "this feature's surface" — a structural-debt change three modules over gets surfaced inside the wrong feature's review noise.
- **`scope-manifest.yaml` already encodes per-feature surface** (regime_holdouts: anti_patterns / adopter_manifests / module_symmetry / deprecations). That structure exists for exactly this kind of narrowing but no verb consumes it.

## Suggested fix

Add real `--feature <slug>` scoping to the 6 verbs. Hybrid narrowing source:

1. **Prefer `scope-manifest.yaml`** when present at `docs/<v>/<status>/<slug>/scope-manifest.yaml` — use its regime_holdouts + module list as the scope.
2. **Fall back to `git diff --name-only main...HEAD`** when the manifest is absent — works on any branch, no extra artifacts needed.

Per-verb semantics:

| Verb | Narrowing behavior |
|------|-------------------|
| `check-clones` | Keep clone groups where ≥1 occurrence lives in feature-scope. |
| `check-anti-patterns` | Scan only feature-scope files against the registry. |
| `check-adopters` | Check only feature-scope files for non-imports of canonical primitives. |
| `check-module-symmetry` | Filter the cross-module matrix to modules touched by the feature. |
| `check-refactor-preconditions` | Only validate `Closes clones.yaml <id>` claims whose surfaces fall in feature-scope. |
| `check-disposition-survivor` | Only check clones whose surfaces fall in feature-scope. |

Shared `resolveFeatureScope(slug)` helper does the manifest-vs-git-diff decision in one place; each verb consumes the file list.

## Out of scope

- Changing the structural verbs' default project-wide behavior. The flag is opt-in: `--feature <slug>` narrows; absent, the verb stays project-wide.

## Provenance

Surfaced as a sub-rule on the 2026-06-04 close-shipped follow-up session. Operator picked Path C (real scoping, not silent-accept or prose-drop) on 2026-06-04 via session-start interview.
<!-- SECTION:DESCRIPTION:END -->
