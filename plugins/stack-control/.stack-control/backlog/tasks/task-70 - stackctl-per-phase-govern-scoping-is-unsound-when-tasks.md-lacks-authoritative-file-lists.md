---
id: TASK-70
title: >-
  stackctl per-phase govern scoping is unsound when tasks.md lacks authoritative
  file lists
status: Done
assignee: []
created_date: '2026-06-14 01:39'
updated_date: '2026-06-22 17:24'
labels:
  - 'type:imported-issue'
  - bug
  - promoted
dependencies: []
references:
  - gh-468
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary
Per-phase govern scoping currently derives the phase file set by regex-extracting path-looking tokens from `tasks.md` prose. In practice this is unsound:
- phases that describe implementation with module aliases like `@/foo` or prose only collapse to an empty/near-empty file list
- an empty file list does **not** fail loud; implement-mode widens to the full diff instead of a bounded phase unit
- tiny accidental path mentions can make a phase look "scoped" while omitting the real implementation surfaces

## Reproduction
Repo/worktree: `audiocontrol-org/deskwork`, feature `plugins/design-control/specs/001-design-control`

Current extractor:
- `plugins/stack-control/src/govern/incremental-audit.ts:24-25`

```ts
const PATH_TOKEN_RE = /[A-Za-z0-9_./-]*\/[A-Za-z0-9_./-]+\.[a-z]{1,5}/g;
```

Observed parser output for this real spec after header normalization:
- Phase 1 files: `mockups/sketch-kit/DECISION.md`, `skills/wireframe/SKILL.md`
- Phase 2 files: `skills/translate-design-language/SKILL.md`
- Phase 3 files: `[]`

But those phases actually implemented much larger code surfaces:
- Phase 1 included multiple `src/lint/*`, `src/wireframe-kit/*`, `src/provenance/*`, `bin/check-wireframe`, etc.
- Phase 2 included `src/design-language/*`, `bin/check-design-spec`, etc.
- Phase 3 included `src/archive/*`, `src/status/*`, tests, and `bin/design-control-status`

Measured effect from the live feature:
- Phase 1 native per-phase payload rendered as a small plan-context-only prompt because the diff scope missed the real files
- Phase 2 did the same
- Phase 3 had an empty extracted file set, and implement payload assembly widened instead of staying bounded

## Actual
- per-phase scoping is driven by incidental prose tokens, not authoritative file ownership
- phases can appear governed while most of their implementation never enters the audited payload
- an empty phase file set silently degrades into a widened diff instead of refusing the run

## Expected
At minimum:
1. `resolvePhaseUnit()` must fail loud when a phase resolves to zero files for implement-mode governance
2. stack-control should not rely on opportunistic prose token scraping as the authoritative phase/file mapping

Stronger fixes would be:
- an explicit machine-readable phase file manifest in `tasks.md` or companion metadata
- or phase scoping derived from task annotations / recorded touched files rather than free prose

## Impact
This makes the new per-phase governance policy non-trustworthy on real specs. The problem is not just ergonomics; it can create false confidence that a completed phase was governed when the payload omitted most or all of the phase's implemented code.

Relevant files:
- `plugins/stack-control/src/govern/incremental-audit.ts`
- `plugins/stack-control/src/subcommands/govern.ts`
- `plugins/stack-control/src/govern/payload-implement.ts`
- `plugins/design-control/specs/001-design-control/tasks.md`
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
