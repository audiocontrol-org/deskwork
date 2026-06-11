---
id: TASK-14
title: >-
  stack-control: feature resolution is docs-layout-only —
  import-slush/scope-widen/scope-inventory cannot see specs/NNN-slug features
status: Done
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-11 00:28'
labels:
  - agent-found
  - 'type:bug'
  - promoted
dependencies: []
references:
  - gh-442
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #442 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-442 is in frontmatter.

stack-control tooling friction, surfaced while dogfooding the stack-control regime on the design-control feature (2026-06-10).

## Symptom

`stackctl`'s feature resolution is docs-layout-only: `src/scope-discovery/util/feature-root.ts` resolves features exclusively under `docs/<version>/001-IN-PROGRESS/<slug>/`, so `backlog import-slush`, `scope-widen`, and `scope-inventory` cannot see features living in the front-door spec layout (`<installation-root>/specs/NNN-<slug>/`, pinned by `.specify/feature.json`).

Repro:

```
stackctl backlog import-slush --feature 001-design-control
backlog: feature '001-design-control' not found under docs/*/001-IN-PROGRESS/
(exit 2)
```

— while `stackctl spec-check --spec specs/001-design-control` and `session-start` resolve the same feature fine via the feature.json pointer.

## Why it matters

The front-door regime (define/extend/execute + session-start) and the scope-discovery/backlog verbs disagree about where features live. A project that adopts the spec layout loses `import-slush` (parked findings must be hand-captured into the backlog) and the scope verbs' default path derivation. This forced manual backlog capture of 2 slushed findings on 2026-06-10.

## Suggested fix

Teach the feature resolver to consult `.specify/feature.json` / the `specs/NNN-<slug>` layout (the same resolution `session-start`'s chain-position already implements), falling back to the docs layout. `feature_audit_log_pattern` in `.stack-control/config.yaml` already points at `specs/{feature}/audit-log.md`, so the config layer anticipates this; the resolver just hasn't caught up.

## Provenance

Discovered live; local backlog ref: design-control installation TASK-5. Filed per the new policy: tooling friction goes to GitHub issues (reliably cross-project).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** spec:specs/013-audit-protocol-hardening

Verified fixed in the formally-installed v0.42.0 marketplace copy (2026-06-11), 16/16 installed-surface assertions: (1) lift + spec-governance-gate resolve a specs/NNN-slug feature and read/write its audit-log there; (2) legacy docs/1.0/001-IN-PROGRESS layout resolves unchanged (no regression); (3) neither-layout fails loud with an error naming BOTH searched layouts (exit 2); (4) a slug under both layouts resolves specs-first deterministically — findings landed only in the specs/ audit-log, docs/ copy untouched (no split-brain). Closed per operator direction after installed-release verification. Residual scope-widen EVIDENCE-path surface (gh-442 follow-up comment) is tracked separately as TASK-24.
<!-- SECTION:NOTES:END -->
