---
id: TASK-21
title: >-
  Roadmap archival is edge-unaware: curate --apply would archive depended-upon
  shipped items and dangle their edges (FR-005)
status: To Do
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-10 21:20'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-436
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #436 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-436 is in frontmatter.

**Surfaced during 006 US6 migration dogfood.** Running `stackctl curate --doc plugins/stack-control/ROADMAP.md` flags the shipped items `multi:feature/front-door` and `impl:feature/governance` as `unarchived-terminal` and would archive them on `--apply`.

**The bug:** those shipped items are `depends-on` targets of nearly every other roadmap item (everything is "built through the front door"). The generic `curate`/`archive` primitives are edge-unaware — archiving a terminal item that is still referenced by a `depends-on`/`part-of` edge removes it from the live document, so the next `loadDocument` fails loud on a **dangling reference** (FR-005). I.e. `curate --apply` on the roadmap would brick the roadmap.

**Why generic archival is correct elsewhere:** for the design-inbox / a plain queue, terminal items have no inbound edges, so archiving is safe. The roadmap is the first governed document with **inbound unit-ref edges to terminal items**.

**Proposed fix:** roadmap-aware archival that skips (or refuses to archive) a terminal item that is still a `depends-on`/`part-of` target — either as a roadmap-layer `archive` mutation that filters the candidate set before composing the engine `archive`, or an engine-level "pinned-by-inbound-edge" guard. A terminal item becomes archivable only once nothing references it.

Tracked as roadmap item `design:gap/roadmap-edge-aware-archival` (part-of design:feature/roadmap-protocol).
<!-- SECTION:DESCRIPTION:END -->
