---
id: TASK-19
title: >-
  Governance graduation has no on-disk record; roadmap reconcile falls back to
  tasks-completion as the shipped signal
status: To Do
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-10 21:32'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
references:
  - gh-434
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #434 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-434 is in frontmatter.

**Context:** 006 roadmap-protocol's `roadmap reconcile` (US5) derives a `shipped` proposal from the on-disk artifact progression at each item's `spec:` path. The 006 data-model specifies the shipped signal as "spec/plan/tasks presence + tasks completion + **governance-graduation record**".

**Gap:** there is no on-disk **governance-graduation record** artifact today. The spec-governance gate (`stackctl spec-governance-gate` / `govern`) prints `true`/`false` and exits — it does not persist a per-spec graduation record. So reconcile currently uses **tasks.md fully-checked** as the strongest available real signal (no fabricated data per the no-fallbacks rule), and only PROPOSES (never mutates), so the operator confirms.

**Proposed work:** have the governance graduation (convergence gate OPEN at `/speckit-implement` after_implement) write a durable per-spec record (e.g. `specs/<dir>/.governance-graduated` or an entry in a governance ledger) so reconcile can use graduation — not just tasks-completion — as the shipped signal. Then strengthen `reconcile.ts`'s `onDisk` derivation to require the graduation record.

**Scope:** spans 004 (spec-governance) + 006 (roadmap reconcile). Surfaced during 006 US5 implementation.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/013-audit-protocol-hardening
<!-- SECTION:NOTES:END -->
