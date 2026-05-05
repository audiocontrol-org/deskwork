---
slug: open-issue-tranche-cleanup
title: open-issue-tranche-cleanup
targetVersion: "0.16.0"
date: 2026-05-05
parentIssue:
deskwork:
  id: b3f20364-969a-4004-87bd-278cd5992e3c
---

# PRD: open-issue-tranche-cleanup

## Problem Statement

The open-issue tracker for the `deskwork`, `deskwork-studio`, and supporting `packages/{cli,core,studio}` plugins has accumulated a heterogeneous set of issues with mixed currency: some are fix-landed-pending-verification, some are real architecture work, some are stale framings of work that has already been absorbed by the current architecture, and some are upstream-owned. This makes the tracker operationally noisy — filtering for "what should we work on next" surfaces a lot of items that aren't actually open work, and "what's been done" surfaces items that just need a verification step before closure. The issue set splits cleanly into four behavioral tranches: items that are implemented and need a marketplace-install walk before closure; one architecture-critical bug + its follow-up cleanup (`#191` → `#192`, the dual-resolver / orphan-write seam already documented during the v0.15.0 work); real but non-blocking product features; and a tail of moot / superseded / reframe-before-acting items. Cleaning these out in that order leaves the tracker reflecting the current product shape, with the remaining open items grouped by implementation strategy rather than historical residue.

## Solution

Execute a six-phase triage that closes implemented-but-unverified issues, ships the #191/#192 architecture cleanup as a contained two-phase code change, sweeps moot/superseded items with explanatory comments, reframes stale-framing items before they get re-attempted, and ends with a tracker audit that documents the post-cleanup state. The deliverable for the developer (operator) is a much smaller, more accurate open-issue list grouped by implementation strategy. The deliverable for downstream adopters is a bug fix (#191) that prevents scrapbook writes from landing in orphan directories on non-kebab-case content layouts.

## Phases

Six phases, executed in order. Phases 2 and 3 are the only code-change phases; the rest are verification + comment + close.

### Phase 1 — Verify + close Tranche 1

**Deliverable:** the verify-ready issues (#159, #160, #161, #163, #164, #165, #166, #183, #184, #188) closed with verifying-build commit comments.

**Approach:** run `/plugin marketplace update deskwork` against a test environment, walk each issue's surface, confirm shipped behavior matches the issue body, post the verifying-build commit hash + a one-sentence "verified — closing" comment, close. No code changes.

### Phase 2 — Implement #191 (entry-id mutation envelope)

**Deliverable:** studio scrapbook mutation routes write to the entry-aware scrapbook dir, not the slug-template path. Closes [#191](https://github.com/audiocontrol-org/deskwork/issues/191).

**Approach:** switch `packages/studio/src/routes/scrapbook-mutations.ts` request envelope from `{ site, slug, ... }` to `{ site, entryId, ... }` (matching the scrapbook-file route's post-Phase-35 shape). Resolve the dir via `scrapbookDirForEntry(...)` after looking up the entry sidecar. Validate `entryId` against UUID regex before touching the filesystem. Update the studio client to send `entryId`. Add a regression test that ingests a markdown file whose path doesn't match the kebab-case slug template, triggers a save via the studio client, and confirms the file lands in the entry-aware scrapbook directory.

### Phase 3 — Implement #192 (collapse dual scrapbook resolvers)

**Deliverable:** `scrapbookDirForEntry` becomes the only public scrapbook-dir resolver; slug-template logic moves to a private fallback. Closes [#192](https://github.com/audiocontrol-org/deskwork/issues/192).

**Approach:** make `scrapbookDir(slug)` and `scrapbookFilePath(slug)` non-exported from `@deskwork/core/scrapbook` — move them to private helpers (`_scrapbookDirSlug` / `_scrapbookFilePathSlug`) inside the module. `scrapbookDirForEntry` is the single public API; when `entry.id` is missing, it falls back to the private slug-template helper internally. Audit `packages/` and `plugins/` for direct calls to the slug-only resolvers and migrate each call site to entry-aware lookups. Update tests to hit the new public surface.

### Phase 4 — Verify + close #190 marginalia alignment

**Deliverable:** [#190](https://github.com/audiocontrol-org/deskwork/issues/190) closed with a verifying-build comment. Same shape as Phase 1; rolls up with the same marketplace-install walk session.

**Approach:** in the test environment, navigate to a multi-comment review surface; confirm items align vertically with their `<mark>` elements (deltas within ~1px); confirm collision cascade works. Post the verifying comment on #190; close.

### Phase 5 — Sweep moot/superseded/stale (Tranches 4 + 5)

**Deliverable:** moot issues closed with rationale; stale-framing issues reframed before acting.

**Approach:** close [#75](https://github.com/audiocontrol-org/deskwork/issues/75) (Publish button removed in Phase 30), [#94](https://github.com/audiocontrol-org/deskwork/issues/94) (Phase 26 umbrella shipped in v0.9.5), [#89](https://github.com/audiocontrol-org/deskwork/issues/89) (mitigated by `repair-install` + upstream-owned residual), [#83](https://github.com/audiocontrol-org/deskwork/issues/83) (superseded by THESIS Consequence 2). Rewrite [#40](https://github.com/audiocontrol-org/deskwork/issues/40) around current `scrapbook/outline.md` reality (likely partially absorbed; verify shipped behavior, then either close or rewrite as a narrower migration/documentation cleanup). Rewrite [#53](https://github.com/audiocontrol-org/deskwork/issues/53) around the current command surface (drop retired `outline`/`draft` verb names; reproduce the underlying UX gap with current verbs). Triage [#92](https://github.com/audiocontrol-org/deskwork/issues/92) (Claude Code platform bug) — close with upstream reference, or relabel as upstream-tracking.

### Phase 6 — Tracker audit

**Deliverable:** the open-issue list reflects only currently-actionable work, grouped by implementation strategy. README's status table updated with a post-cleanup snapshot.

**Approach:** run `gh issue list --state open` post-cleanup, group remaining open issues by implementation strategy (architecture / product features / backlog / external-tracking), update the feature `README.md` with the post-cleanup snapshot. Acceptance: no issue in the open list is in a "verify and close" or "moot" state.

### Phase 8 — Extend entry-aware addressing to studio scrapbook reads + link emitters ([#205](https://github.com/audiocontrol-org/deskwork/issues/205))

**Deliverable:** the studio's scrapbook viewer + link emitters resolve via the entry-aware path for entries whose on-disk location doesn't match the slug template. Closes Finding 1 of the [2026-05-05 PRD/Workplan audit](./2026-05-05-prd-workplan-audit.md).

**Why this is in scope:** Phase 2's #191 fix landed entry-aware addressing on the **mutation** routes; reads + link emitters are still slug/path-based. For the same class of adopter-facing entries that motivated #191, this leaves a half-migrated surface — writes resolve correctly while the viewer + dashboard chip + drawer-open link navigate to a different, often-empty scrapbook directory. The PRD's downstream-deliverable claim about #191 ("prevents orphan scrapbook writes for adopters on non-kebab-case layouts") is not actually met until Phase 8 ships.

**Approach:** symmetric to Phase 2's mutation fix.

1. **Server route** (`packages/studio/src/pages/scrapbook.ts`): accept `?entryId=<uuid>` (UUID-validated) on the `/dev/scrapbook/<site>/<path>` route. When present, resolve the dir via `scrapbookDirForEntry(...)` and list via `listScrapbookForEntry(...)` (read-side primitive already exists post-#192's split). Slug/path fallback preserved.
2. **URL builders** (`scrapbookViewerUrl` + the drawer + dashboard chip): when the caller has an entry's UUID, build the entry-aware URL with the `?entryId=` query param; otherwise fall back to the existing slug-template URL.
3. **Client URL builders** for `/api/dev/scrapbook-file`: the route already accepts `entryId` post-v0.15.0; the client sends it when `data-entry-id` is present on the page (mirrors the post-#191 mutation client pattern).
4. **Tests:** server-route regression on list-via-entryId; URL-builder regression for entry-aware vs slug-template branching; live walk against a non-kebab-case entry confirming the viewer shows the entry's actual scrapbook contents.

### Phase 7 — Fix marginalia edit + delete UX (#199)

**Deliverable:** an operator can edit a margin-note's **text** and **category**, or delete it outright, from the studio's marginalia sidebar. Closes [#199](https://github.com/audiocontrol-org/deskwork/issues/199).

**Why this is in scope:** the operator's framing is *"this is a blocking UX failure — I wouldn't use this product in this way."* Editing margin notes is a fundamental review-loop interaction; the current resolve-or-delete-and-recreate workflow is not a viable path for non-trivial review iterations. This belongs alongside the other dogfood-discovered bug fixes on this branch (#197 ingest, #198 iterate-dispositions), not on the deferred-feature backlog.

**Range editing — explicitly wontfix.** Drag-to-resize range editing was considered but rejected: it's not a standard UX, and exposing range as an editable affordance would confuse rather than help. If the operator's comment is anchored at the wrong text range, the right path is to delete the comment and re-create it on the correct range. Tracker [#203](https://github.com/audiocontrol-org/deskwork/issues/203) closes as wontfix accordingly. The server's PATCH endpoint still accepts `range` as part of its `{ text?, range?, category?, anchor? }` envelope (defense-in-depth + consistent shape with the annotation schema), but no client UI surfaces it.

**Category editing — in scope.** Tracked as [#204](https://github.com/audiocontrol-org/deskwork/issues/204). The annotation `category` field (one of the predefined `AnnotationCategory` values like `voice`, `clarity`, `factual`, `other`) IS exposed as an editable affordance on the comment card alongside the text-edit field. Re-categorizing a margin note without delete/recreate is the standard pattern for refining a review pass; the server already accepts category in the PATCH envelope (shipped as part of #199), so the work is purely client-side.

**Approach:** extend the entry-keyed annotation model with two new annotation types — `edit-comment` (carries the new text and/or category, plus `range` and `anchor` defense-in-depth) and `delete-comment` (tombstones the original). Server endpoints under `/api/dev/editorial-review/entry/:entryId/comments/:commentId` (PATCH for edit, DELETE for delete) accept the operator's mutation, mint the appropriate annotation, append it via `addEntryAnnotation`. The reader (`listEntryAnnotations`) folds the new types into the rendered comment list — an `edit-comment` replaces the original's text/category (and range/anchor when supplied); a `delete-comment` filters it out. Client-side affordances on `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts` (or sibling): inline edit (text textarea + category dropdown) and an explicit delete button distinct from resolve. Append-only journal preserves the audit trail.

## Acceptance Criteria

- [ ] All Tranche-1 verify-ready issues (#159, #160, #161, #163, #164, #165, #166, #183, #184, #188) closed with marketplace-install verification comments referencing the verifying build.
- [ ] [#191](https://github.com/audiocontrol-org/deskwork/issues/191) (studio scrapbook mutations write to slug-template path) fix-landed in `feature/deskwork-open-issue-tranche-cleanup`; mutation routes resolve via the entry-aware resolver.
- [ ] [#192](https://github.com/audiocontrol-org/deskwork/issues/192) (collapse dual scrapbook resolvers) fix-landed; `scrapbookDir(slug)` and `scrapbookFilePath(slug)` removed from the public `@deskwork/core/scrapbook` exports.
- [ ] [#190](https://github.com/audiocontrol-org/deskwork/issues/190) (marginalia vertical alignment) verified + closed in the same marketplace-walk session as Tranche 1.
- [ ] Moot/superseded issues (#75, #94, #89, #83) closed with explanatory comments.
- [ ] Stale-framing issues #40 and #53 either closed or rewritten around current command surface — never silently left in the original framing.
- [ ] [#92](https://github.com/audiocontrol-org/deskwork/issues/92) (Claude Code platform bug) disposition recorded (closed-with-reference or relabeled upstream-tracking).
- [ ] [#199](https://github.com/audiocontrol-org/deskwork/issues/199) (marginalia edit + delete) fix-landed; operator can edit margin-note text **and category** from the sidebar and delete a comment outright (separate from resolve). Range editing is explicitly wontfix — see [#203](https://github.com/audiocontrol-org/deskwork/issues/203).
- [ ] [#205](https://github.com/audiocontrol-org/deskwork/issues/205) (scrapbook viewer + link emitters use entry-aware addressing) fix-landed; viewer resolves via `?entryId=` when supplied; URL builders prefer entry-aware shape.
- [ ] Feature `README.md` status table updated with a post-cleanup snapshot of remaining open issues grouped by implementation strategy.

## Out of Scope

- Implementation of the Tranche 3 product-feature backlog (#54 agent-reply margin notes, #84 iterate skill comment-path doc, #85 version diff/compare, #82 editable voice catalog, #87 skinnable studio, #86 Google Docs plugin). These remain open roadmap items; this feature does NOT implement them.
- The lower-priority background-architecture tranche (#18 hierarchical content trees, #30 content-tree caching, #33 content-identity-vs-slug). Defer until after #191/#192 ship.
- New design conversations on closing-as-moot issues — the proposal already enumerates the rationale per issue; no fresh design pass.
- Anything in `dw-lifecycle` outside the shared scrapbook architecture.

## Cross-cutting principles

- **Marketplace install for verification, not workspace dist.** Phases 1 and 4 require a fresh `/plugin marketplace update deskwork` install per `.claude/rules/agent-discipline.md` — verification against the workspace dist masks packaging defects.
- **Issues stay open until verified post-release.** Per the same rule, fix-landed issues are commented with the commit hash but not closed until the release ships and a marketplace-install walk confirms the fix.
- **Reframe before acting** on stale-framing items (#40, #53). Don't silently close issues whose framing has rotted; rewrite them around the current architecture so any residual concern survives, or close them with an explicit "absorbed by X, no residual" rationale.
