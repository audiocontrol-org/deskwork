---
slug: open-issue-tranche-cleanup
targetVersion: "0.16.0"
date: 2026-05-05
---

# Workplan: open-issue-tranche-cleanup

**Goal:** triage the open-issue tracker into a smaller, currently-actionable set, closing implemented-but-unverified items, fixing the #191/#192 scrapbook architecture seam, sweeping moot/superseded items, and reframing stale-framing items.

## Phase 1 — Verify + close Tranche 1

**Deliverable:** the verify-ready issues (#159, #160, #161, #163, #164, #165, #166, #183, #184, #188) closed with a verifying-build commit comment.

### Task 1: Marketplace install + walk

- [ ] Run `/plugin marketplace update deskwork` against a test environment.
- [ ] Per issue, walk the surface the issue describes; confirm shipped behavior matches the issue body.
- [ ] Post a comment on each issue: verifying build commit hash + a one-sentence "verified — closing" note.
- [ ] Close each issue.

**Acceptance Criteria:**

- [ ] All 10 Tranche-1 issues are closed with verifying-build comments referring to v0.15.0 (or the latest released version at walk time).
- [ ] No code changes in this phase.

## Phase 2 — Implement #191 (entry-id mutation envelope)

**Deliverable:** studio scrapbook mutation routes write to the entry-aware scrapbook dir, not the slug-template path. Closes [#191](https://github.com/audiocontrol-org/deskwork/issues/191).

### Task 1: Switch mutation envelope to entryId

- [x] Change `packages/studio/src/routes/scrapbook-mutations.ts` request envelope from `{ site, slug, ... }` to `{ site, entryId, ... }` (or accept both during a deprecation window — `entryId` preferred, `slug` falls back to slug-template only when no `entryId` is provided, matching the scrapbook-file route post-Phase-35).
- [x] Resolve the dir via `scrapbookDirForEntry(projectRoot, config, site, entry, index)` after looking up the entry sidecar via `readSidecar(projectRoot, entryId)`.
- [x] Validate `entryId` against UUID regex before touching the filesystem (mirrors the scrapbook-file route's check landed in v0.15.0 commit `14ffbe7`).

### Task 2: Update studio client

- [x] Update `plugins/deskwork-studio/public/src/scrapbook-client.ts` to send `entryId` instead of (or alongside) `slug` for save/create/rename/delete/upload payloads.

### Task 3: Tests

- [x] Add a regression case: ingest a markdown file whose path doesn't match the kebab-case slug template; trigger a save via the studio client; confirm the file lands in the entry-aware scrapbook (`dirname(artifactPath) + '/scrapbook/'`), not the slug-template path.
- [x] Run `npm test --workspaces`.

**Acceptance Criteria:**

- [x] No orphan write to `<contentDir>/<slug>/scrapbook/` for entries whose artifact lives elsewhere.
- [x] Studio mutation routes resolve via the entry-aware resolver (parity with reads).
- [x] Issue #191 fix-landed comment posted; issue stays open until the marketplace-walk verification (Phase 1's pattern, post-release).

## Phase 3 — Implement #192 (collapse dual scrapbook resolvers)

**Deliverable:** `scrapbookDirForEntry` becomes the only public scrapbook-dir resolver; slug-template logic moves to a private fallback. Closes [#192](https://github.com/audiocontrol-org/deskwork/issues/192). Folded in [#202](https://github.com/audiocontrol-org/deskwork/issues/202)'s split of `packages/core/src/scrapbook.ts` (909 → 94-line barrel + 9 sibling modules).

### Task 1: Hide the slug-template resolver

- [x] Make `scrapbookDir(slug)` and `scrapbookFilePath(slug)` non-exported from `@deskwork/core/scrapbook`. Move them to `_scrapbookDirSlug` / `_scrapbookFilePathSlug` (or similar) inside the module as private helpers.
- [x] `scrapbookDirForEntry` is the single public API. When `entry.id` is missing, it falls back to the private slug-template helper internally (legacy / pre-sidecar callers).

### Task 2: Migrate remaining callers

- [x] Audit `packages/` and `plugins/` for any remaining direct calls to `scrapbookDir(...)` / `scrapbookFilePath(...)` and switch them to entry-aware lookups (CLI commands resolve via `findEntryBySlug` first, then call the entry-aware resolver).
- [x] Update tests in `packages/core/test/scrapbook.test.ts` to hit the new public surface.

### Task 3: Tests

- [x] Add coverage for the entry-aware path being the only one external callers touch.
- [x] Run `npm test --workspaces`.

**Acceptance Criteria:**

- [x] `scrapbookDir` and `scrapbookFilePath` are no longer in the `@deskwork/core/scrapbook` public exports.
- [x] All studio + CLI callers use the entry-aware resolver.
- [x] Issue #192 fix-landed comment posted; closure post-marketplace-walk.

## Phase 4 — Verify + close #190 marginalia alignment

**Deliverable:** [#190](https://github.com/audiocontrol-org/deskwork/issues/190) closed with a verifying-build comment. Same shape as Phase 1; rolls up with the same marketplace-install walk session.

### Task 1: Walk the marginalia surface

- [ ] In the test environment, navigate to a multi-comment review surface; confirm items align vertically with their `<mark>` elements (deltas within ~1px); confirm collision cascade works.
- [ ] Post the verifying comment on #190; close.

**Acceptance Criteria:**

- [ ] #190 closed.

## Phase 5 — Sweep moot/superseded/stale (Tranches 4 + 5)

**Deliverable:** moot issues closed with rationale; stale-framing issues reframed before acting.

### Task 1: Close moot/superseded

- [x] Close [#75](https://github.com/audiocontrol-org/deskwork/issues/75) (Publish button removed in Phase 30).
- [x] Close [#94](https://github.com/audiocontrol-org/deskwork/issues/94) (Phase 26 umbrella shipped in v0.9.5).
- [x] Close [#89](https://github.com/audiocontrol-org/deskwork/issues/89) (mitigated by `repair-install` + upstream-owned residual; comment with reference).
- [x] Close [#83](https://github.com/audiocontrol-org/deskwork/issues/83) (superseded by THESIS Consequence 2 — explicit-skill commands replaced auto-commits).

### Task 2: Reframe before acting

- [x] Rewrite [#40](https://github.com/audiocontrol-org/deskwork/issues/40) around current `scrapbook/outline.md` reality — verified Phase 20 shipped (outline content lives at `<contentDir>/<slug>/scrapbook/outline.md` per the iterate skill; the legacy `outline` subcommand is retired). Closed as completed.
- [x] Rewrite [#53](https://github.com/audiocontrol-org/deskwork/issues/53) around the current command surface — retired `outline`/`draft` verbs noted; verified the underlying `scaffoldBlogPost` helper has only test callers (no production trigger for the original gap). Title + body updated; closed per the reframed body's recommendation. Bonus install SKILL.md drift (`/deskwork:outline` → `/deskwork:add` or `/deskwork:ingest`) fixed in-line during this sweep.

### Task 3: External tracker triage

- [x] Triage [#92](https://github.com/audiocontrol-org/deskwork/issues/92) — relabeled `upstream-tracking`; status comment posted documenting today's intermittent-dispatch evidence and the deskwork-side recovery flow. Left open per the operator's "close vs visible" call.

**Acceptance Criteria:**

- [x] #75, #94, #89, #83 closed with explanatory comments.
- [x] #40 and #53 either closed or reworded; never silently left in the original framing.
- [x] #92 disposition recorded.

## Phase 6 — Tracker audit

**Deliverable:** the open-issue list reflects only currently-actionable work, grouped by implementation strategy. README's status table updated.

### Task 1: Audit + document

- [ ] Run `gh issue list --state open` post-cleanup.
- [ ] Group remaining open issues by implementation strategy (architecture / product features / backlog / external-tracking).
- [ ] Update this feature's README with the post-cleanup snapshot.

**Acceptance Criteria:**

- [ ] No issue in the open list is in a "verify and close" or "moot" state.
- [ ] Remaining product features (#54, #84, #85, #82, #87, #86) and backlog (#18, #30, #33) are explicitly noted as out-of-scope for this feature.

## Phase 8 — Extend entry-aware addressing to studio scrapbook reads + link emitters ([#205](https://github.com/audiocontrol-org/deskwork/issues/205))

**Deliverable:** the studio's scrapbook viewer + link emitters resolve via the entry-aware path for entries whose on-disk location doesn't match the slug template. Closes Finding 1 of the 2026-05-05 PRD/Workplan audit. Symmetric to Phase 2's mutation fix.

### Task 1: Server route accepts entryId

- [ ] Extend `/dev/scrapbook/<site>/<path>` in `packages/studio/src/pages/scrapbook.ts` to accept `?entryId=<uuid>` (UUID-validated). When present, resolve the dir via `scrapbookDirForEntry(...)` and list via `listScrapbookForEntry(...)`. Slug/path fallback preserved.
- [ ] Surface 404 when `entryId` is malformed (UUID regex) or doesn't match any sidecar, mirroring the scrapbook-mutation route's pattern.

### Task 2: URL builders prefer entry-aware shape

- [ ] `scrapbookViewerUrl(...)` in `packages/studio/src/components/scrapbook-item.ts` accepts an optional `entryId`; when present, append `?entryId=<uuid>`.
- [ ] Update call sites: `packages/studio/src/pages/review-scrapbook-drawer.ts:169`, `packages/studio/src/pages/dashboard/affordances.ts:71`. Look up entry id (sidecar / calendar) and thread it into the URL builder.
- [ ] Slug-only fallback preserved for callers without an entry id.

### Task 3: Client URL builders for `/api/dev/scrapbook-file`

- [ ] `plugins/deskwork-studio/public/src/scrapbook-mutations.ts:151,216` — read `ctx.entryId` (already plumbed post-#191) and send `entryId` in the URLSearchParams when present. Falls back to `path: ctx.path` otherwise.

### Task 4: Tests

- [ ] Server-route: list-via-entryId returns items from the entry-aware scrapbook for a non-kebab-case entry; list-via-slug returns slug-template; missing-entry returns 404.
- [ ] URL-builder: `scrapbookViewerUrl` with an entry argument produces entry-aware URL; without, slug-template.
- [ ] Live walk: visit the standalone scrapbook viewer for the open-issue-tranche-cleanup PRD entry (non-kebab-case path); confirm contents come from `docs/0.16.0/001-IN-PROGRESS/open-issue-tranche-cleanup/scrapbook/` and not from `docs/open-issue-tranche-cleanup/prd/scrapbook/`.

**Acceptance Criteria:**

- [ ] No mismatch between scrapbook-write target and scrapbook-read target for entries whose on-disk location doesn't match the slug template.
- [ ] [#205](https://github.com/audiocontrol-org/deskwork/issues/205) fix-landed comment posted; closure pending v0.16.0 marketplace-walk verification.
- [ ] Slug-only addressing remains a working fallback (no behavior change for kebab-case-aligned entries).

## Phase 7 — Fix marginalia edit + delete UX ([#199](https://github.com/audiocontrol-org/deskwork/issues/199))

**Deliverable:** operator can edit margin-note text/range from the sidebar and delete a comment outright (separate from resolve). Operator's framing: blocking UX failure on the review loop, not a deferred polish item.

### Task 1: Annotation model — edit + delete types

- [x] Add `edit-comment` annotation type to `packages/core/src/entry/annotations.ts` (carries `commentId`, new `text`, optional new `range`, optional new `category`/`anchor`).
- [x] Add `delete-comment` annotation type (carries `commentId`; tombstones the original).
- [x] Update `listEntryAnnotations` (or its rendering caller) to fold edits/deletes into the active comment list: an `edit-comment` replaces the named comment's text/range; a `delete-comment` filters the comment out.
- [x] Schema validation: both new types reject unknown commentIds (the comment must exist as a `comment`-typed annotation in the same entry's stream).

### Task 2: Server endpoints

- [x] `PATCH /api/dev/editorial-review/entry/:entryId/comments/:commentId` — accept `{ text?, range?, category?, anchor? }`; mint an `edit-comment` annotation; append.
- [x] `DELETE /api/dev/editorial-review/entry/:entryId/comments/:commentId` — mint a `delete-comment` annotation; append.
- [x] Both endpoints validate `entryId` (UUID) + `commentId` (UUID) and surface `404` when the comment doesn't exist.
- [x] Wire endpoints in `packages/studio/src/routes/api.ts` alongside the existing annotation routes.

### Task 3: Client UI

- [x] In `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts` (or sibling client module), add an "Edit" affordance on each `comment`-card (inline edit-in-place for the comment text). **Range editing client UI** — closed as wontfix in [#203](https://github.com/audiocontrol-org/deskwork/issues/203); not a standard UX, would confuse operators. Server endpoint accepts range as defense-in-depth; no client surface.
- [ ] **Category edit** ([#204](https://github.com/audiocontrol-org/deskwork/issues/204)) — extend the inline edit affordance to expose a category dropdown alongside the text textarea. Server endpoint already accepts `category` in the PATCH envelope.
- [x] Add a "Delete" affordance distinct from "Resolve" (different visual + different confirmation via `inlineConfirm`).
- [x] Both affordances POST/DELETE to the new endpoints; on success, re-render the sidebar from the updated annotation list.
- [x] Mirror the project's affordance-placement rule (`.claude/rules/affordance-placement.md`): the edit + delete affordances live on the comment card itself (in `er-marginalia-actions`), not in a toolbar.

### Task 4: Tests

- [x] Unit tests for the new annotation types' schema + folder logic in `packages/core/test/` (9 new tests).
- [x] Server-route tests for the new PATCH + DELETE endpoints in `packages/studio/test/` (17 new tests).
- [x] Affordance-placement contract tests pinning the on-card placement (10 new tests).
- [x] Live walk: PATCH/DELETE end-to-end against the live PRD entry verified — edit text round-trips through fold; delete drops from folded view; 404 on unknown commentId.

**Acceptance Criteria:**

- [x] An operator can edit a margin-note's text directly from the sidebar (no delete-and-recreate).
- [ ] An operator can edit a margin-note's **category** directly from the sidebar (re-categorize without delete-and-recreate).
- [x] An operator can delete a margin-note (tombstones via the journal, doesn't physically remove the original).
- [x] [#199](https://github.com/audiocontrol-org/deskwork/issues/199) fix-landed comment posted; closure pending v0.16.0 marketplace-walk verification per `agent-discipline.md`.
- [x] Append-only journal preserves the audit trail (every edit + delete is its own annotation, original `comment` annotation is never mutated in place).
- **Range editing wontfix** — [#203](https://github.com/audiocontrol-org/deskwork/issues/203) closed; not a standard UX. The right path for a wrong-anchored comment is delete + re-create.

## Out of scope (explicit)

- Implementation of the Tranche 3 product-feature backlog (#54, #84, #85, #82, #87, #86) — those stay open as roadmap items.
- The lower-priority background-architecture tranche (#18, #30, #33) — defer until after #191/#192 ship.
- New design conversations on closing-as-moot issues — the proposal already enumerates the rationale.
- Anything in `dw-lifecycle` outside the shared scrapbook architecture.

## GitHub Tracking

Issues filed via `/dw-lifecycle:issues` after PRD review.
