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

The shipped client exposes text-only editing for marginalia comments. The PRD still promises text-and-range editing from the sidebar, including drag-to-resize range behavior, and its acceptance criteria still say the operator can edit comment text/range from the sidebar.

The workplan and feature README were updated to defer range UI to [#203](https://github.com/audiocontrol-org/deskwork/issues/203), but the PRD was not reconciled to that narrower implementation. As written, the branch does not satisfy the PRD literally even though it does satisfy the later-scoped workplan.

Relevant PRD references:

- [prd.md](./prd.md) lines 61-78

Relevant workplan / README references:

- [workplan.md](./workplan.md) lines 149-169
- [README.md](./README.md) lines 17-23

Relevant implementation references:

- [plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts:11)
- [plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts:18)

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
| [#199](https://github.com/audiocontrol-org/deskwork/issues/199) | UX/UI: Marginalia can't be edited | Finding 2 — text-only editing shipped; range UI deferred |
| [#203](https://github.com/audiocontrol-org/deskwork/issues/203) | marginalia: client UI for range + category edits (server side already in v0.16.0) | Finding 2 — tracker for the deferred range/category client UI |
