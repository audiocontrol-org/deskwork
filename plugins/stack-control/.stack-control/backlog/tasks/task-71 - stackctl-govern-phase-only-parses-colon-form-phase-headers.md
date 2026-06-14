---
id: TASK-71
title: stackctl govern --phase only parses colon-form phase headers
status: To Do
assignee: []
created_date: '2026-06-14 01:39'
updated_date: '2026-06-14 01:54'
labels:
  - 'type:imported-issue'
  - bug
  - promoted
dependencies: []
references:
  - gh-467
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary
`stackctl govern --phase <id>` only recognizes `tasks.md` phase headers of the form `## Phase N: ...`. A feature using the visually equivalent `## Phase N — ...` grammar has no resolvable phases, so per-phase governance fails until the spec file is manually normalized.

## Reproduction
Repo/worktree: `audiocontrol-org/deskwork`, feature `plugins/design-control/specs/001-design-control`

Before normalization, this spec used headers like:
- `## Phase 1 — Engine-adapter seam + lo-fi wireframe kit + allowlist lint (v1-scaffold)`

The parser is currently hardcoded at:
- `plugins/stack-control/src/govern/incremental-audit.ts:21-22`

```ts
const PHASE_HEADER_RE = /^##\s+Phase\s+([^:\n]+?)\s*:/;
```

Running the parser over that `tasks.md` produced no phases at all.

## Actual
- `parsePhases()` returns `[]`
- `resolvePhaseUnit()` cannot resolve any phase id for an otherwise valid spec
- the per-phase governance path is blocked on punctuation, not semantics

## Expected
One of these needs to be true:
1. The parser accepts the supported heading variants the project actually emits (`:` and common dash separators), or
2. stack-control validates/writes a canonical heading grammar earlier and fails loud at authoring time instead of failing later at govern time.

## Impact
This broke the newly required per-phase governance path for `design-control` even though the phase structure itself was perfectly legible. I had to patch the spec headings from em-dash to colon just to make `--phase` usable.

## Notes
The code comments and contracts currently claim this grammar is "verified present in every tasks.md", but the live spec above disproves that assumption.

Relevant files:
- `plugins/stack-control/src/govern/incremental-audit.ts`
- `plugins/stack-control/specs/015-audit-protocol-convergence/contracts/incremental-audit.md`
- `plugins/design-control/specs/001-design-control/tasks.md`
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
