---
id: TASK-131
title: >-
  roadmap reconcile reports 15 orphan spec dirs (incl. fully-implemented 021)
  with no roadmap node
status: Done
assignee: []
created_date: '2026-06-15 16:52'
updated_date: '2026-06-15 20:39'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - 'plugins/stack-control: roadmap reconcile correspondence'
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-06-15: stackctl roadmap reconcile lists 15 orphan spec dirs (007-insight-capture .. 021-audit-protocol-friction-burndown) with 'unresolved correspondences: 0' — i.e. these numbered spec dirs map to NO roadmap node. 021 is fully implemented (32/32 tasks, clean tree) yet has no roadmap representation, so reconcile cannot advance it to shipped and the roadmap silently understates shipped work. Either the numbered-dir <-> codename-key (design:feature/X) correspondence resolver is missing matches, or implemented specs were never registered as roadmap nodes. Repro: run stackctl roadmap reconcile.
<!-- SECTION:DESCRIPTION:END -->

## Resolution

<!-- SECTION:RESOLUTION:BEGIN -->
Orphan CONDITION resolved in PR #476 (shipped in v0.47.0). All 15 orphan spec dirs
were unorphaned: 5 existing nodes (insight-capture/007, project-doc-setup/009,
migrate-scope-discovery/010, session-skills/011, audit-protocol-convergence/015)
were missing only a structured `- spec:` field — added; the other 10 had no node at
all and were created (the audit saga 013/014/014/021 grouped `part-of`
audit-protocol-convergence; the rest standalone). Verified post-release against the
formally-installed v0.47.0: the released `stackctl roadmap reconcile` reports
**0 orphans / 0 drift / 0 unresolved**.

Scope note: this closes the orphan CONDITION only. The residual TOOLING gap —
reconcile only REPORTS orphans, so resolving them required hand-editing ROADMAP.md
— is split out to **TASK-133** (a propose-then-apply `unorphan` assist), not
carried here.
<!-- SECTION:RESOLUTION:END -->
