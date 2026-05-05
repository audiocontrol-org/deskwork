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

- [ ] Change `packages/studio/src/routes/scrapbook-mutations.ts` request envelope from `{ site, slug, ... }` to `{ site, entryId, ... }` (or accept both during a deprecation window — `entryId` preferred, `slug` falls back to slug-template only when no `entryId` is provided, matching the scrapbook-file route post-Phase-35).
- [ ] Resolve the dir via `scrapbookDirForEntry(projectRoot, config, site, entry, index)` after looking up the entry sidecar via `readSidecar(projectRoot, entryId)`.
- [ ] Validate `entryId` against UUID regex before touching the filesystem (mirrors the scrapbook-file route's check landed in v0.15.0 commit `14ffbe7`).

### Task 2: Update studio client

- [ ] Update `plugins/deskwork-studio/public/src/scrapbook-client.ts` to send `entryId` instead of (or alongside) `slug` for save/create/rename/delete/upload payloads.

### Task 3: Tests

- [ ] Add a regression case: ingest a markdown file whose path doesn't match the kebab-case slug template; trigger a save via the studio client; confirm the file lands in the entry-aware scrapbook (`dirname(artifactPath) + '/scrapbook/'`), not the slug-template path.
- [ ] Run `npm test --workspaces`.

**Acceptance Criteria:**

- [ ] No orphan write to `<contentDir>/<slug>/scrapbook/` for entries whose artifact lives elsewhere.
- [ ] Studio mutation routes resolve via the entry-aware resolver (parity with reads).
- [ ] Issue #191 fix-landed comment posted; issue stays open until the marketplace-walk verification (Phase 1's pattern, post-release).

## Phase 3 — Implement #192 (collapse dual scrapbook resolvers)

**Deliverable:** `scrapbookDirForEntry` becomes the only public scrapbook-dir resolver; slug-template logic moves to a private fallback. Closes [#192](https://github.com/audiocontrol-org/deskwork/issues/192).

### Task 1: Hide the slug-template resolver

- [ ] Make `scrapbookDir(slug)` and `scrapbookFilePath(slug)` non-exported from `@deskwork/core/scrapbook`. Move them to `_scrapbookDirSlug` / `_scrapbookFilePathSlug` (or similar) inside the module as private helpers.
- [ ] `scrapbookDirForEntry` is the single public API. When `entry.id` is missing, it falls back to the private slug-template helper internally (legacy / pre-sidecar callers).

### Task 2: Migrate remaining callers

- [ ] Audit `packages/` and `plugins/` for any remaining direct calls to `scrapbookDir(...)` / `scrapbookFilePath(...)` and switch them to entry-aware lookups (CLI commands resolve via `findEntryBySlug` first, then call the entry-aware resolver).
- [ ] Update tests in `packages/core/test/scrapbook.test.ts` to hit the new public surface.

### Task 3: Tests

- [ ] Add coverage for the entry-aware path being the only one external callers touch.
- [ ] Run `npm test --workspaces`.

**Acceptance Criteria:**

- [ ] `scrapbookDir` and `scrapbookFilePath` are no longer in the `@deskwork/core/scrapbook` public exports.
- [ ] All studio + CLI callers use the entry-aware resolver.
- [ ] Issue #192 fix-landed comment posted; closure post-marketplace-walk.

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

- [ ] Close [#75](https://github.com/audiocontrol-org/deskwork/issues/75) (Publish button removed in Phase 30).
- [ ] Close [#94](https://github.com/audiocontrol-org/deskwork/issues/94) (Phase 26 umbrella shipped in v0.9.5).
- [ ] Close [#89](https://github.com/audiocontrol-org/deskwork/issues/89) (mitigated by `repair-install` + upstream-owned residual; comment with reference).
- [ ] Close [#83](https://github.com/audiocontrol-org/deskwork/issues/83) (superseded by THESIS Consequence 2 — explicit-skill commands replaced auto-commits).

### Task 2: Reframe before acting

- [ ] Rewrite [#40](https://github.com/audiocontrol-org/deskwork/issues/40) around current `scrapbook/outline.md` reality (likely partially absorbed; verify shipped behavior, then either close or rewrite as a narrower migration/documentation cleanup).
- [ ] Rewrite [#53](https://github.com/audiocontrol-org/deskwork/issues/53) around the current command surface (drop retired `outline`/`draft` verb names; reproduce the underlying UX gap with current verbs).

### Task 3: External tracker triage

- [ ] Triage [#92](https://github.com/audiocontrol-org/deskwork/issues/92) (Claude Code platform bug — hyphenated namespace dispatch). Either close with upstream reference, or relabel as upstream-tracking if the team wants it visible.

**Acceptance Criteria:**

- [ ] #75, #94, #89, #83 closed with explanatory comments.
- [ ] #40 and #53 either closed or reworded; never silently left in the original framing.
- [ ] #92 disposition recorded.

## Phase 6 — Tracker audit

**Deliverable:** the open-issue list reflects only currently-actionable work, grouped by implementation strategy. README's status table updated.

### Task 1: Audit + document

- [ ] Run `gh issue list --state open` post-cleanup.
- [ ] Group remaining open issues by implementation strategy (architecture / product features / backlog / external-tracking).
- [ ] Update this feature's README with the post-cleanup snapshot.

**Acceptance Criteria:**

- [ ] No issue in the open list is in a "verify and close" or "moot" state.
- [ ] Remaining product features (#54, #84, #85, #82, #87, #86) and backlog (#18, #30, #33) are explicitly noted as out-of-scope for this feature.

## Phase 7 — Fix marginalia edit + delete UX ([#199](https://github.com/audiocontrol-org/deskwork/issues/199))

**Deliverable:** operator can edit margin-note text/range from the sidebar and delete a comment outright (separate from resolve). Operator's framing: blocking UX failure on the review loop, not a deferred polish item.

### Task 1: Annotation model — edit + delete types

- [ ] Add `edit-comment` annotation type to `packages/core/src/entry/annotations.ts` (carries `commentId`, new `text`, optional new `range`, optional new `category`/`anchor`).
- [ ] Add `delete-comment` annotation type (carries `commentId`; tombstones the original).
- [ ] Update `listEntryAnnotations` (or its rendering caller) to fold edits/deletes into the active comment list: an `edit-comment` replaces the named comment's text/range; a `delete-comment` filters the comment out.
- [ ] Schema validation: both new types reject unknown commentIds (the comment must exist as a `comment`-typed annotation in the same entry's stream).

### Task 2: Server endpoints

- [ ] `PATCH /api/dev/editorial-review/entry/:entryId/comments/:commentId` — accept `{ text?, range?, category?, anchor? }`; mint an `edit-comment` annotation; append.
- [ ] `DELETE /api/dev/editorial-review/entry/:entryId/comments/:commentId` — mint a `delete-comment` annotation; append.
- [ ] Both endpoints validate `entryId` (UUID) + `commentId` (UUID) and surface `404` when the comment doesn't exist.
- [ ] Wire endpoints in `packages/studio/src/routes/api.ts` alongside the existing annotation routes.

### Task 3: Client UI

- [ ] In `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts` (or sibling client module), add an "Edit" affordance on each `comment`-card (inline edit-in-place for the comment text; range can come in a follow-up if it's heavier work, but DON'T defer with a "for now" comment — file as a separate sub-issue if range editing has to slip).
- [ ] Add a "Delete" affordance distinct from "Resolve" (different visual + different confirmation).
- [ ] Both affordances POST/DELETE to the new endpoints; on success, re-render the sidebar from the updated annotation list.
- [ ] Mirror the project's affordance-placement rule (`.claude/rules/affordance-placement.md`): the edit + delete affordances live on the comment card itself, not in a toolbar.

### Task 4: Tests

- [ ] Unit tests for the new annotation types' schema + folder logic in `packages/core/test/`.
- [ ] Server-route tests for the new PATCH + DELETE endpoints in `packages/studio/test/`.
- [ ] Live walk: edit a comment, save, reload, confirm the edit persisted; delete a comment, confirm it disappears from the sidebar AND the underlying journal carries the delete-annotation tombstone.

**Acceptance Criteria:**

- [ ] An operator can edit a margin-note's text directly from the sidebar (no delete-and-recreate).
- [ ] An operator can delete a margin-note (tombstones via the journal, doesn't physically remove the original).
- [ ] [#199](https://github.com/audiocontrol-org/deskwork/issues/199) fix-landed comment posted; closure pending v0.16.0 marketplace-walk verification per `agent-discipline.md`.
- [ ] Append-only journal preserves the audit trail (every edit + delete is its own annotation, original `comment` annotation is never mutated in place).

## Out of scope (explicit)

- Implementation of the Tranche 3 product-feature backlog (#54, #84, #85, #82, #87, #86) — those stay open as roadmap items.
- The lower-priority background-architecture tranche (#18, #30, #33) — defer until after #191/#192 ship.
- New design conversations on closing-as-moot issues — the proposal already enumerates the rationale.
- Anything in `dw-lifecycle` outside the shared scrapbook architecture.

## GitHub Tracking

Issues filed via `/dw-lifecycle:issues` after PRD review.
