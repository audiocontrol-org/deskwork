---
slug: open-issue-tranche-cleanup
targetVersion: "0.16.0"
date: 2026-05-05
deskwork:
  id: d61642b3-614e-42c6-9e02-1f0a54137679
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

- [x] In the test environment, navigate to a multi-comment review surface; confirm items align vertically with their `<mark>` elements (deltas within ~1px); confirm collision cascade works. **Confirmed by operator on 2026-05-05 during the workplan review (margin note 2adcfb50): "Confirmed — this works."**
- [x] Post the verifying comment on #190; close. (Issue was already closed; posted verification-confirmation comment.)

**Acceptance Criteria:**

- [x] #190 closed.

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

- [x] Triage [#92](https://github.com/audiocontrol-org/deskwork/issues/92) — closed on 2026-05-05 per operator directive on the workplan review (margin note 4a9de719: "Close this issue. We've worked around this pathology in multiple ways."). Workarounds: `deskwork repair-install` + clean uninstall/reinstall + direct bin invocation. Upstream Claude Code defect remains real but not deskwork-actionable beyond existing mitigations.

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

## Phase 11 — Tranche-organized burn-down of remaining open issues

**Deliverable:** every extant open issue (50 at filing time) assigned to a tranche; T1 ships first; remaining tranches burned down in least-dumb order. PRD §Phase 11 has the canonical tranche definitions.

### Task 1 (T1) — Architectural blocker: single document evolves ([#222](https://github.com/audiocontrol-org/deskwork/issues/222))

- [ ] Implement Option B + hybrid refinement per [#222](https://github.com/audiocontrol-org/deskwork/issues/222)'s body:
  - On `/deskwork:approve` at a stage transition that produces a new artifact kind, atomically copy `index.md` → `scrapbook/<prior-stage>.md` (write-then-fsync the snapshot before any mutation of `index.md`).
  - Leave `index.md` unchanged on approve. The first iterate at the new stage rewrites `index.md` from scratch (or transforms it).
  - Update studio review surface to always read `index.md` (regardless of stage). Drop any stage-aware path-routing logic.
  - Per-stage history journals stay correct (keyed on `(entryId, stage, version)`).
- [ ] Resolve [#181](https://github.com/audiocontrol-org/deskwork/issues/181) (outline-approve semantics) alongside; the snapshot-on-approve pattern IS the answer to outline-approve.
- [ ] Resolve [#200](https://github.com/audiocontrol-org/deskwork/issues/200) (marginalia anchor stability) alongside or as immediate follow-up; range-anchor stability under document evolution is the same architectural concern.
- [ ] Add atomic-write tests + regression coverage for the snapshot path.
- [ ] Live walk: re-walk the approval cycle on this project's audit doc / PRD; confirm the studio renders the right content at every stage.
- [ ] Update `MIGRATING.md` for v0.17.0 (or whatever ships): per-stage `artifactPath` no longer used; explain the snapshot model; note any operator-side migration steps.

### Task 2 (T6) — Phase 10 dogfood items

(Folded into T6 in the PRD; tracked as the existing Phase 10 task block.) Burn down [#220](https://github.com/audiocontrol-org/deskwork/issues/220), [#221](https://github.com/audiocontrol-org/deskwork/issues/221), [#223](https://github.com/audiocontrol-org/deskwork/issues/223), [#224](https://github.com/audiocontrol-org/deskwork/issues/224), [#225](https://github.com/audiocontrol-org/deskwork/issues/225), [#226](https://github.com/audiocontrol-org/deskwork/issues/226). #221 + #225 are smallest (sanitize-before-validate + skill-prose edit); #220 may be upstream-only; #223–226 are mid-effort.

### Task 3 (T2) — dw-lifecycle plugin UX cluster

- [ ] Single dispatch covering [#185](https://github.com/audiocontrol-org/deskwork/issues/185), [#196](https://github.com/audiocontrol-org/deskwork/issues/196), [#209](https://github.com/audiocontrol-org/deskwork/issues/209), [#210](https://github.com/audiocontrol-org/deskwork/issues/210), [#211](https://github.com/audiocontrol-org/deskwork/issues/211), [#212](https://github.com/audiocontrol-org/deskwork/issues/212), [#213](https://github.com/audiocontrol-org/deskwork/issues/213), [#214](https://github.com/audiocontrol-org/deskwork/issues/214), [#215](https://github.com/audiocontrol-org/deskwork/issues/215). All touch `plugins/dw-lifecycle/` skills + helpers.
- [ ] Per-issue evaluation + disposition; some may be wontfix or out-of-scope on closer reading.

### Task 4 (T3) — doctor cleanup

- [ ] [#182](https://github.com/audiocontrol-org/deskwork/issues/182) backfill artifactPath, [#218](https://github.com/audiocontrol-org/deskwork/issues/218) legacy-calendar-to-sidecars rule, [#219](https://github.com/audiocontrol-org/deskwork/issues/219) missing-frontmatter-id false-positive scope.

### Task 5 (T4) — scrapbook UX cluster

- [ ] [#167](https://github.com/audiocontrol-org/deskwork/issues/167) edit button non-functional, [#168](https://github.com/audiocontrol-org/deskwork/issues/168) return-to-article path, [#186](https://github.com/audiocontrol-org/deskwork/issues/186) multi-item add.

### Task 6 (T5) — studio UX cluster (sequence after T1)

- [ ] Design pass first — the cross-page UX concerns ([#177](https://github.com/audiocontrol-org/deskwork/issues/177), [#178](https://github.com/audiocontrol-org/deskwork/issues/178), [#179](https://github.com/audiocontrol-org/deskwork/issues/179), [#180](https://github.com/audiocontrol-org/deskwork/issues/180)) are coupled and shouldn't get N independent fixes.
- [ ] Then implementation pass: [#169](https://github.com/audiocontrol-org/deskwork/issues/169), [#173](https://github.com/audiocontrol-org/deskwork/issues/173), [#174](https://github.com/audiocontrol-org/deskwork/issues/174), [#175](https://github.com/audiocontrol-org/deskwork/issues/175), [#176](https://github.com/audiocontrol-org/deskwork/issues/176), [#193](https://github.com/audiocontrol-org/deskwork/issues/193), [#216](https://github.com/audiocontrol-org/deskwork/issues/216), [#217](https://github.com/audiocontrol-org/deskwork/issues/217).

### Task 7 (T7) — marketplace-walk verifications

- [ ] Execute the walk script at `2026-05-05-v0.16.0-verification-walk.md`. 18 issues to verify-and-close. Operator-driven; runs in parallel with code-tranche work.

**Acceptance Criteria (Phase 11):**

- [ ] T1 (#222 + #181 + #200) shipped, fix-landed-pending-verification-in-the-next-release.
- [ ] T2–T6 each have a clear disposition: shipped / deferred / wontfix / scoped to a follow-up release.
- [ ] T7 walk closes all 18 issues against the v0.16.0 (or successor) install.
- [ ] No issue from the open list is left without an explicit disposition (in this branch or scoped to a successor branch).

## Phase 10 — Evaluate + fix dogfood-discovered bugs from the v0.16.0 verification walk

**Deliverable:** evaluation pass + per-bug disposition + fixes for in-scope items.

### Task 1: Evaluate [#220](https://github.com/audiocontrol-org/deskwork/issues/220) — plugin cache subtree purged between sessions

- [ ] Reproduce the cache-purge condition (cross-session, or whatever boundary triggers it).
- [ ] Determine whether the destruction is upstream Claude Code plugin lifecycle or something deskwork can prevent.
- [ ] Decide: is the deskwork-side mitigation (bin shim self-heal on cache miss, or PATH wiring against the marketplace clone) tractable in this branch?
- [ ] If yes — fix; if no — comment with the upstream link + close as upstream-tracking, OR leave open with `upstream-tracking` label.

### Task 2: Fix [#221](https://github.com/audiocontrol-org/deskwork/issues/221) — ingest path-derived slug sanitization

- [ ] In `packages/core/src/ingest-derive.ts` (`deriveSlug` function): when the slug source is `'path'`, sanitize the path-derived slug by replacing `.` with `-` before the kebab-case validation.
- [ ] Keep the strict regex check for `--slug` explicit values (operator typed it; surface rejection cleanly).
- [ ] Update SKILL.md prose to note the sanitization (or not — depends on whether it's a documented behavior or a quiet fix).
- [ ] Add regression tests: path-derived slug with dots → sanitized, ingested. Explicit `--slug v0.16.0-foo` → still rejected.
- [ ] Live walk: re-run `deskwork ingest 2026-05-05-v0.16.0-verification-walk.md` (without `--slug`); confirm slug `v0-16-0-verification-walk` derived and ingested cleanly.

### Task 3: Evaluate / fix other captured friction

- [ ] [#223](https://github.com/audiocontrol-org/deskwork/issues/223) — align calendar.md regen output between ingest-side and approve-side code paths. Add a regression test asserting byte-equal output across two consecutive regens. Pure churn-reduction; not blocking.
- [ ] [#224](https://github.com/audiocontrol-org/deskwork/issues/224) — `SO_REUSEADDR` on the studio's listen socket; or accept the auto-increment as cosmetic friction and close.
- [ ] [#225](https://github.com/audiocontrol-org/deskwork/issues/225) — skill-prose drift on `/deskwork:approve`'s scaffolding step. Same family as #201; SKILL.md edit, no CLI change.
- [ ] [#226](https://github.com/audiocontrol-org/deskwork/issues/226) — `deskwork iterate --auto-dispositions=<value>` enhancement. Probably out-of-scope for v0.16.x; defer or implement if cheap.
- [ ] If additional bugs surface during the v0.16.0 verification walk, file each immediately (capture-over-scope) and add to this task list.

**Acceptance Criteria:**

- [ ] Each in-scope bug has a fix-landed-pending-verification commit OR an explicit defer/wontfix disposition.
- [ ] No bug from the verification walk is left without a recorded disposition.

## Phase 9 — Ingest defaults to Drafting (per add/ingest semantic distinction) ([#206](https://github.com/audiocontrol-org/deskwork/issues/206))

**Deliverable:** `/deskwork:ingest` defaults to **Drafting** stage when the source file's frontmatter has no `state:` field. Current default `Ideas` conflates `add` and `ingest` semantics; per operator framing, only `/deskwork:add` should put items in Ideas.

### Task 1: Flip the default

- [x] In `packages/core/src/ingest-derive.ts:251`, change `return { value: 'Ideas', source: 'default' };` to `return { value: 'Drafting', source: 'default' };`.
- [x] In `packages/core/src/ingest-derive.ts:265`, same change for the `stateFrom='datePublished'` fallback site.
- [x] Update the inline comment that says "default to Ideas as the safest lane" — replace rationale with the add/ingest distinction.

### Task 2: Skill prose

- [x] In `plugins/deskwork/skills/ingest/SKILL.md:148`, update: "Files without a `state:` field default to `Drafting` — `/deskwork:ingest` is for existing content; for new ideas use `/deskwork:add`."

### Task 3: Tests

- [x] Update existing test asserting Ideas default for the no-state-field case (`packages/core/test/ingest.test.ts` updated; CLI ingest tests audited — only existing Ideas references use explicit frontmatter `state: idea`, no default-path tests in CLI).
- [x] Add explicit regression test for the new Drafting default.
- [x] Add explicit regression test for `--state` flag still winning (e.g. `--state Ideas` overrides the new Drafting default).
- [x] Add explicit regression test for frontmatter `state:` still winning over the default.
- [x] Run `npm test --workspace @deskwork/core --workspace @deskwork/cli` — both green (491 core / 191 CLI passing).

### Task 4: Release notes

- [x] Added v0.16.0 migration note to `MIGRATING.md` calling out the Ideas → Drafting default flip and the add/ingest semantic distinction.

**Acceptance Criteria:**

- [x] `deskwork ingest <file-without-state>` lands in Drafting (live-verified — dry-run plan shows `Drafting` with `state:default`).
- [x] `deskwork ingest <file> --state Ideas` still lands in Ideas (live-verified — `state:explicit`).
- [x] `deskwork ingest <file>` where file's frontmatter has `state: ideas` still lands in Ideas (live-verified — `state:frontmatter`).
- [ ] [#206](https://github.com/audiocontrol-org/deskwork/issues/206) fix-landed comment posted; closure pending v0.16.0 marketplace-walk verification.

## Phase 8 — Extend entry-aware addressing to studio scrapbook reads + link emitters ([#205](https://github.com/audiocontrol-org/deskwork/issues/205))

**Deliverable:** the studio's scrapbook viewer + link emitters resolve via the entry-aware path for entries whose on-disk location doesn't match the slug template. Closes Finding 1 of the 2026-05-05 PRD/Workplan audit. Symmetric to Phase 2's mutation fix.

### Task 1: Server route accepts entryId

- [x] Extend `/dev/scrapbook/<site>/<path>` in `packages/studio/src/pages/scrapbook.ts` to accept `?entryId=<uuid>` (UUID-validated). When present, resolve the dir via `scrapbookDirForEntry(...)` and list via `listScrapbookForEntry(...)`. Slug/path fallback preserved. Implemented via `resolveListing` dispatch helper inside `scrapbook.ts`; `renderScrapbookPage` now async, accepts optional `{ entryId }` opts, returns 404/400 via typed `ScrapbookPageError` mapped at the route boundary in `server.ts`.
- [x] Surface 404 when `entryId` is malformed (UUID regex) or doesn't match any sidecar, mirroring the scrapbook-mutation route's pattern. UUID regex reused from `scrapbook-mutation-envelope.ts#UUID_RE`; malformed → 400, missing sidecar → 404.

### Task 2: URL builders prefer entry-aware shape

- [x] `scrapbookViewerUrl(...)` in `packages/studio/src/components/scrapbook-item.ts` accepts an optional `entryId` (added to `ScrapbookAddress` interface); when present, appends `?entryId=<uuid>`. Same `entryId` field added to `scrapbookFileUrl(...)` so the file-fetch URL is entry-aware too.
- [x] Updated call sites: `review-scrapbook-drawer.ts` threads `entry.id` into `scrapbookViewerUrl({ site, path: slug, entryId })` when the drawer renders for a tracked entry; `dashboard/affordances.ts` threads `entry.uuid` into the same builder for every dashboard row's `scrapbook ↗` link.
- [x] Slug-only fallback preserved for callers without an entry id (verified by URL-builder regression tests).

### Task 3: Client URL builders for `/api/dev/scrapbook-file`

- [x] `plugins/deskwork-studio/public/src/scrapbook-mutations.ts:151,216` — added `fileFetchParams(ctx, filename)` helper (sibling of the existing `payload()` helper for JSON mutations) that prefers `entryId` when known, falling back to `path: ctx.path`. Both file-fetch sites (renderBody img/text load + enterEditMode raw load) now route through the helper.

### Task 4: Tests

- [x] Server-route: list-via-entryId returns items from the entry-aware scrapbook for a non-kebab-case entry; list-via-slug returns slug-template; missing-entry returns 404 (`packages/studio/test/scrapbook-page-entryid.test.ts` — 7 tests covering all branches including malformed-UUID-400, missing-sidecar-404, unknown-site-404, slug-template fallback, empty-entryId fallback).
- [x] URL-builder: `scrapbookViewerUrl` with an entry argument produces entry-aware URL; without, slug-template (`packages/studio/test/scrapbook-viewer-url.test.ts` — 9 tests covering both `scrapbookViewerUrl` and `scrapbookFileUrl`, including edge cases: empty entryId → fallback, entryId encoding, secret flag preserved in both modes).
- [ ] Live walk: visit the standalone scrapbook viewer for the open-issue-tranche-cleanup PRD entry (non-kebab-case path); confirm contents come from `docs/0.16.0/001-IN-PROGRESS/open-issue-tranche-cleanup/scrapbook/` and not from `docs/open-issue-tranche-cleanup/prd/scrapbook/`. **Pending operator walk-through.**

**Acceptance Criteria:**

- [x] No mismatch between scrapbook-write target and scrapbook-read target for entries whose on-disk location doesn't match the slug template (server-route test pins this invariant).
- [ ] [#205](https://github.com/audiocontrol-org/deskwork/issues/205) fix-landed comment posted; closure pending v0.16.0 marketplace-walk verification.
- [x] Slug-only addressing remains a working fallback (no behavior change for kebab-case-aligned entries) — pre-existing `dashboard.test.ts` + `api.test.ts` slug-mode assertions still pass; new fallback tests in both new test files lock the back-compat surface.

## Phase 7 — Fix marginalia edit + delete UX ([#199](https://github.com/audiocontrol-org/deskwork/issues/199))

**Deliverable:** operator can edit margin-note text and category from the sidebar and delete a comment outright (separate from resolve). Range editing is wontfix per [#203](https://github.com/audiocontrol-org/deskwork/issues/203). Operator's framing: blocking UX failure on the review loop, not a deferred polish item.

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
- [x] **Category edit** ([#204](https://github.com/audiocontrol-org/deskwork/issues/204)) — extend the inline edit affordance to expose a category dropdown alongside the text textarea. Server endpoint already accepts `category` in the PATCH envelope.
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
- [x] An operator can edit a margin-note's **category** directly from the sidebar (re-categorize without delete-and-recreate).
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
