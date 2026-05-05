---
title: PRD and Workplan Audit
date: 2026-05-05
auditedFeature: open-issue-tranche-cleanup
branch: feature/deskwork-open-issue-tranche-cleanup
deskwork:
  id: 998b8a29-e754-4114-8998-d1aebf6f39d3
---

# PRD and Workplan Audit

Scope: audit the implementation on `feature/deskwork-open-issue-tranche-cleanup` against this feature's `prd.md`, `workplan.md`, `README.md`, and the referenced GitHub issue contracts.

## Findings

### 1. High — [#191](https://github.com/audiocontrol-org/deskwork/issues/191) / [#192](https://github.com/audiocontrol-org/deskwork/issues/192) are not closed end-to-end on the standalone scrapbook surface

The branch fixes the mutation API to prefer `entryId`, but the scrapbook viewer and related scrapbook links still largely read and navigate by slug/path. For entries whose on-disk location does not match the slug template, this leaves a half-migrated state: writes resolve to the entry-aware scrapbook while parts of the UI still read or link to the slug-template location.

This conflicts with the PRD's stated downstream deliverable that [#191](https://github.com/audiocontrol-org/deskwork/issues/191) prevents orphan scrapbook writes for adopters on non-kebab-case layouts, not just at the POST endpoint layer.

Relevant PRD references:

- [prd.md](./prd.md) lines 17-19
- [prd.md](./prd.md) lines 31-41

Relevant implementation references:

- [packages/studio/src/pages/scrapbook.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/pages/scrapbook.ts:624)
- [packages/studio/src/pages/scrapbook.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/pages/scrapbook.ts:637)
- [plugins/deskwork-studio/public/src/scrapbook-mutations.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/scrapbook-mutations.ts:151)
- [plugins/deskwork-studio/public/src/scrapbook-mutations.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/scrapbook-mutations.ts:216)
- [packages/studio/src/pages/review-scrapbook-drawer.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/pages/review-scrapbook-drawer.ts:169)
- [packages/studio/src/components/scrapbook-item.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/components/scrapbook-item.ts:125)
- [packages/studio/src/pages/dashboard/affordances.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/pages/dashboard/affordances.ts:71)

Why this appears to have slipped through: the current tests cover the mutation API and resolver refactor, but not the full viewer/read/link integration path for a non-slug-template entry.

### 2. Medium — [#199](https://github.com/audiocontrol-org/deskwork/issues/199) implementation matches the workplan/README, but not the PRD text

**Status: resolved during audit-doc iteration v2** (operator scope decision). PRD/workplan/README updated; range editing → wontfix; category editing → in-scope.

The shipped client exposes text-only editing for marginalia comments. The PRD originally promised text-and-range editing from the sidebar, including drag-to-resize range behavior. The workplan + README were updated to defer range UI to [#203](https://github.com/audiocontrol-org/deskwork/issues/203), but the PRD was not reconciled to that narrower implementation, leaving an unresolved promise.

**Resolution:**

- **Range editing — wontfix.** [#203](https://github.com/audiocontrol-org/deskwork/issues/203) closed as not-planned. Operator's framing: drag-to-resize is not a standard UX and would confuse rather than help; the right path for a wrong-anchored comment is delete + re-create. Server's PATCH endpoint retains `range` in its envelope (defense-in-depth + schema consistency), no client UI surfaces it.
- **Category editing — in-scope, tracked as [#204](https://github.com/audiocontrol-org/deskwork/issues/204).** Server already accepts `category` in the PATCH envelope (shipped as part of [#199](https://github.com/audiocontrol-org/deskwork/issues/199)); the work is purely client-side — extend the inline edit affordance with a category dropdown alongside the text textarea.

PRD §Phase 7 + acceptance criteria, workplan Task 3 + acceptance criteria, and feature README status table all updated to match.

Relevant references (post-resolution):

- [prd.md](./prd.md) — Phase 7 prose updated (range wontfix; category in-scope)
- [workplan.md](./workplan.md) — Task 3 + acceptance criteria updated
- [README.md](./README.md) — status row updated
- [plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts) — current text-only client; category extension pending under #204

## Verification Notes

Targeted tests run during this audit:

- `npm test --workspace @deskwork/studio -- scrapbook-mutations entry-comment-edit-delete entry-review-edit-delete-affordances`
- `npm test --workspace @deskwork/core -- scrapbook entry-annotations`
- `npm test --workspace @deskwork/cli -- ingest-writes-frontmatter iterate-entry-centric-dispositions`

All targeted suites passed.

## Non-findings

Phases 1, 4, 5, and 6 are still incomplete, but that is consistent with the current branch state and feature status docs. This audit treats them as pending planned work, not implementation defects.

## Referenced GitHub issues

| Issue | Title | Relevance |
|---|---|---|
| [#191](https://github.com/audiocontrol-org/deskwork/issues/191) | studio scrapbook mutations write to slug-template path, orphaning entry-aware scrapbook | Finding 1 — mutation API fix-landed; read/navigate paths still slug/path-based |
| [#192](https://github.com/audiocontrol-org/deskwork/issues/192) | collapse dual scrapbook resolvers — make `scrapbookDirForEntry` the only public entry point | Finding 1 — public resolver collapse landed; downstream UI integration is the remaining gap |
| [#199](https://github.com/audiocontrol-org/deskwork/issues/199) | UX/UI: Marginalia can't be edited | Finding 2 — text-edit + delete shipped; category-edit pending under #204; range-edit wontfix |
| [#203](https://github.com/audiocontrol-org/deskwork/issues/203) | marginalia: client UI for range + category edits (server side already in v0.16.0) | Finding 2 — closed as wontfix during audit-doc iteration v2; range editing rejected as non-standard UX |
| [#204](https://github.com/audiocontrol-org/deskwork/issues/204) | marginalia: client UI for category edits (server already in v0.16.0; range edit wontfix per #203) | Finding 2 — successor tracker for the in-scope category-edit affordance; server already accepts |
