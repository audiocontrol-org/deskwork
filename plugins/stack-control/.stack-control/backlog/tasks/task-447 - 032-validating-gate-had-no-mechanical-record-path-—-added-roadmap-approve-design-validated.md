---
id: TASK-447
title: >-
  032 validating gate had no mechanical record path — added roadmap
  approve-design --validated
status: Done
assignee: []
created_date: '2026-06-24 01:30'
updated_date: '2026-06-24 16:33'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 446000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found dogfooding the ship of multi:feature/ship-stage: 032 added the validating→closed validated GATE but no verb to RECORD the marker (operator had to hand-edit ROADMAP.md). FIXED in commit 76c86be3: roadmap approve-design --validated (mirrors --analyze-clean) + close-skill wiring. Recorded here for the audit trail; resolved in the same session.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Node:** multi:feature/ship-stage

Closed: Fixed this session in commit 76c86be3, released in 0.55.1: roadmap approve-design --validated records the validating→closed gate marker (mirrors --analyze-clean), wired through flags/grammar/validator/commander/help + the close skill. Verified on the installed 0.55.1 release (--validated in help + functional dry-run).
<!-- SECTION:NOTES:END -->
