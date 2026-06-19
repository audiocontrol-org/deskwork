---
id: TASK-137
title: >-
  stackctl roadmap: add a reparent verb to move a part-of / depends-on edge
  between nodes
status: To Do
assignee: []
created_date: '2026-06-15 21:45'
updated_date: '2026-06-15 21:47'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No verb re-parents an existing roadmap edge. roadmap has add (edges at creation), decompose (split + repoint dependents), reclassify (rename identifier), advance, defer, reconcile -- but changing an item's part-of (or depends-on) target requires hand-editing the governed ROADMAP.md. Repro: re-parenting design:gap/roadmap-order-gating and design:gap/roadmap-advance-on-spec-finalize from part-of design:feature/roadmap-protocol to multi:feature/parseable-lifecycle-workflow (commit 85a46c6f) was a manual markdown edit. Workaround: edit ROADMAP.md by hand, then validate with roadmap reconcile + roadmap order. Suggested fix: roadmap reparent <id> --part-of <target> | --depends-on <target> [--remove <target>] with dry-run/--apply, graph-revalidating (refuse cycle/dangling/self), zero-write-on-failure -- same shape as the other mutation verbs.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** roadmap:impl:gap/roadmap-edge-mutation-and-cluster
- **Folded (2026-06-18):** the standalone roadmap node `impl:gap/roadmap-reparent-verb` was retired and this gap absorbed into `impl:gap/roadmap-edge-mutation-and-cluster` (ref TASK-242), which covers the full edge-mutation surface on existing nodes (add / remove / **move=reparent** edges) plus a cluster convenience and self-documenting discoverability. The move-edge (reparent) case captured here is part 1 of that node. Operator decision: fold (this session).
<!-- SECTION:NOTES:END -->
