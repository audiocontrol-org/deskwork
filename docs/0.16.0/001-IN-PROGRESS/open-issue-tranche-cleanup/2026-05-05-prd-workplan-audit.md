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

## Current Findings

### 1. Low — Phase 7 deliverable line in the workplan still says `text/range`, but the rest of the branch now consistently scopes `#199` as text + category with range-edit wontfix

This is now a documentation-only mismatch, not an implementation defect.

The current code, tests, PRD, and README all reflect the later scope decision:

- range editing is explicitly wontfix under [#203](https://github.com/audiocontrol-org/deskwork/issues/203)
- category editing is in scope under [#204](https://github.com/audiocontrol-org/deskwork/issues/204) and appears shipped

But the top-level Phase 7 deliverable sentence in the workplan still reads:

- [workplan.md](./workplan.md) line 199 — `operator can edit margin-note text/range from the sidebar`

That conflicts with the more specific wording immediately below it:

- [workplan.md](./workplan.md) line 217 — range-edit client UI is wontfix
- [workplan.md](./workplan.md) line 218 — category edit is in scope
- [workplan.md](./workplan.md) line 237 — range editing wontfix
- [prd.md](./prd.md) line 93 — range editing explicitly wontfix
- [prd.md](./prd.md) line 95 — category editing in scope
- [README.md](./README.md) line 23 — text-edit + delete fix-landed; category-edit fix-landed; range-edit wontfix

Relevant implementation references:

- [plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts:193)
- [plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts:247)
- [packages/studio/test/entry-comment-edit-delete.test.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/test/entry-comment-edit-delete.test.ts:320)
- [packages/studio/test/entry-review-edit-delete-affordances.test.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/test/entry-review-edit-delete-affordances.test.ts:105)

## Resolved Findings

### 1. Resolved — `#191/#192` read/write asymmetry on the standalone scrapbook surface

The earlier finding about writes being entry-aware while reads and link emitters stayed slug/path-based is no longer accurate on the current branch. Phase 8 / [#205](https://github.com/audiocontrol-org/deskwork/issues/205) is now implemented in code and reflected in the workplan.

Relevant current references:

- [packages/studio/src/components/scrapbook-item.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/components/scrapbook-item.ts:107)
- [packages/studio/src/components/scrapbook-item.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/components/scrapbook-item.ts:141)
- [packages/studio/src/pages/review-scrapbook-drawer.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/pages/review-scrapbook-drawer.ts:151)
- [packages/studio/src/pages/dashboard/affordances.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/pages/dashboard/affordances.ts:76)
- [plugins/deskwork-studio/public/src/scrapbook-mutations.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/plugins/deskwork-studio/public/src/scrapbook-mutations.ts:64)
- [packages/studio/src/pages/scrapbook.ts](/Users/orion/work/deskwork-work/deskwork-open-issue-tranche-cleanup/packages/studio/src/pages/scrapbook.ts:637)

### 2. Resolved — `#199` PRD mismatch around range editing

The earlier PRD/workplan mismatch finding is no longer live at the PRD level. The PRD, README, tests, and implementation now agree that range editing is wontfix and category editing is in scope/shipped. The only remaining residue is the single stale Phase 7 deliverable sentence called out above.

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
| [#205](https://github.com/audiocontrol-org/deskwork/issues/205) | studio scrapbook viewer + link emitters still slug/path-based after #191/#192 — read/navigate asymmetry on non-kebab-case entries | Finding 1 — successor tracker; Phase 8 added to PRD/workplan/README |
