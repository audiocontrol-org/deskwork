---
id: TASK-5
title: >-
  stackctl feature resolution is docs-layout-only:
  import-slush/scope-widen/scope-inventory cannot see specs/NNN-slug features
status: Done
assignee: []
created_date: '2026-06-10 17:47'
updated_date: '2026-06-10 18:03'
labels:
  - agent-found
  - 'type:bug'
  - filed-upstream
dependencies: []
references:
  - >-
    stack-control src/scope-discovery/util/feature-root.ts (hardcodes
    docs/<version>/001-IN-PROGRESS/<slug>); discovered via: stackctl backlog
    import-slush --feature 001-design-control -> exit 2
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The front-door regime puts features in <root>/specs/NNN-slug/ (pinned by .specify/feature.json), but the feature-root resolver only walks docs/*/001-IN-PROGRESS/, so slush import + scope verbs fail on spec-layout features. This forced manual backlog capture of 2 slushed findings on 2026-06-10.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Filed upstream per the tooling-friction-goes-to-GitHub policy (2026-06-10): https://github.com/audiocontrol-org/deskwork/issues/442. Closed locally — not burnable in this installation.
<!-- SECTION:NOTES:END -->
