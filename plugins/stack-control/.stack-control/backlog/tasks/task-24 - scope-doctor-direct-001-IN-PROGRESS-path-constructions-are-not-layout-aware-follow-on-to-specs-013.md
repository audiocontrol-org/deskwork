---
id: TASK-24
title: >-
  scope-* + doctor direct 001-IN-PROGRESS path constructions are not
  layout-aware (follow-on to specs/013)
status: Done
assignee: []
created_date: '2026-06-10 21:59'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Surfaced by specs/013 research D5. The audit/governance consumers (gate, audit-barrage-lift, slush-findings, backlog) resolve the feature root via the shared resolveFeatureRoot helper, so widening that helper (013 US1) makes them specs/NNN-slug aware. But scope-inventory-cli.ts, scope-widen-cli.ts, scope-inventory.ts, scope-widen.ts, scope-export.ts and doctor-rules/provenance-orphaned-entries.ts construct docs/1.0/001-IN-PROGRESS/<slug>/ paths DIRECTLY (targeting scope-manifest.yaml / prd.md, not the audit-log). These are the same rigid-path class but NOT on the governance blocker path, so 013 explicitly scoped them out (FR-003 'explicitly scoped' branch). Suggested-fix: route these direct constructions through the layout-aware resolver (or a sibling specs-aware path builder) so scope-discovery also works on specs/NNN-slug features. Verify with: grep -rn '001-IN-PROGRESS' plugins/stack-control/src --include='*.ts' | grep -v feature-root.ts | grep -v __tests__ — should be empty once reconciled.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/014-audit-protocol-reliability

specs/014 US7 implemented: six construction sites route through resolveFeatureRoot (CLI defaults, run-dirs/EVIDENCE, scope-export default, provenance doctor walk via new discoverFeatureRoots); R7 probe pinned as a regression test. Commits 4897d7e4/a6323b59/518070dd (RED/fix/probe).
<!-- SECTION:NOTES:END -->
