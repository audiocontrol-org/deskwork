---
id: TASK-137
title: >-
  stackctl roadmap: add a reparent verb to move a part-of / depends-on edge
  between nodes
status: To Do
assignee: []
created_date: '2026-06-15 21:45'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No verb re-parents an existing roadmap edge. roadmap has add (edges at creation), decompose (split + repoint dependents), reclassify (rename identifier), advance, defer, reconcile -- but changing an item's part-of (or depends-on) target requires hand-editing the governed ROADMAP.md. Repro: re-parenting design:gap/roadmap-order-gating and design:gap/roadmap-advance-on-spec-finalize from part-of design:feature/roadmap-protocol to multi:feature/parseable-lifecycle-workflow (commit 85a46c6f) was a manual markdown edit. Workaround: edit ROADMAP.md by hand, then validate with roadmap reconcile + roadmap order. Suggested fix: roadmap reparent <id> --part-of <target> | --depends-on <target> [--remove <target>] with dry-run/--apply, graph-revalidating (refuse cycle/dangling/self), zero-write-on-failure -- same shape as the other mutation verbs.
<!-- SECTION:DESCRIPTION:END -->
