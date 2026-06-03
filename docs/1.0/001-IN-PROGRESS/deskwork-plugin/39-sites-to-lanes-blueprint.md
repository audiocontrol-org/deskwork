# Phase 39 — Sites → Lanes Retirement: Implementation Blueprint

**Author:** code-architect (mapping pass; no production code)
**Spec:** `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md`
**Workplan:** `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` § Phase 39
**Principle:** location is a property of the ENTRY (`entry.artifactPath`), not the identity of a lane and not the `sites` axis. Resolution becomes `entry.artifactPath`, no base-searching.

---

## 0. Critical finding that reshapes the task ordering

The literal workplan text for **39a** ("remove `lane.contentDir`") and **39c** ("remove `SiteConfig`/`sites`") cannot land in those phases as written without breaking `tsc --noEmit` for an entire turn. Two distinct, deeply-threaded axes are entangled:

1. **`lane.contentDir`** — read by the lane `move` operation, lane CRUD (create/update/list), the dashboard lane-data renderer, the lanes studio pages, and `bootstrap.ts`. Removing the *Zod field* breaks every reader at compile time.
2. **`config.sites` + the `site` string parameter** — `site` is a positional argument threaded through `paths.ts` (every `resolve*` helper), the entire doctor runner per-site loop, all CLI verbs (`resolveSite`), and the whole studio dashboard (`defaultSite` plumbing through ~12 dashboard files). `config.sites` is *also* the back-compat read surface that `bootstrap.ts` + `lane-migration.ts` use to synthesize a default lane.

The spec's own §"Migration" requires `sites` to remain **readable inside the migration** after it is dropped from the live schema. That is the seam. The safe sequence is therefore:

- **39a = ADD-only** to the lane schema (`host`, `scaffoldDefaults`) + make `entry.artifactPath` the authoritative resolution key. `lane.contentDir` stays present (now redundant) and `config.sites` stays present. Nothing is removed; nothing breaks.
- **39b** adds the migration rule/backfiller that reads `sites` + the heuristic (the LAST heuristic use) and writes `entry.artifactPath`. Still additive.
- **39d** flips resolution to read `entry.artifactPath` only and deletes the `artifactPathForStage` runtime resolution path (it now lives only inside 39b's backfiller). Consumers stop depending on `contentDir`-based search.
- **39c** is the **removal** phase — only after 39b+39d have migrated every consumer off `contentDir`/`sites`-for-resolution does the field/type get deleted, with `config.sites` parsing moved into a migration-only tolerant reader.

This reorders the *removal* relative to the workplan's nominal numbering but preserves each phase's identity. The recommended commit sequence (§3) sequences 39a → 39b → 39d → 39c precisely so each task boundary is green. **39c is the only phase that deletes a public type or schema field, and it runs last.**

---

## 1. Blast-radius table (grouped by owning task)

`file:LINE` for every consumer of the seven target symbols. Test files are listed separately at the end of each group (they migrate WITH their phase but are not production blast radius).

### Symbol: `lane.contentDir` (LaneConfig field) — schema add in 39a, field REMOVAL + consumer retirement in 39c

| file:line | role | task |
|---|---|---|
| `packages/core/src/lanes/types.ts:81` | Zod field declaration (`contentDir: z.string().min(1)`) | 39a adds `host`+`scaffoldDefaults`; 39c removes `contentDir` |
| `packages/core/src/lanes/types.ts:28,96` | docblock referencing `contentDir` | 39c |
| `packages/core/src/lanes/bootstrap.ts:119,151` | writes `contentDir: site.contentDir` into the default lane | 39c (rewrite to `scaffoldDefaults`) |
| `packages/core/src/lanes/loader.ts:85-110` | `assertSafeContentDir` (containment check) | 39c (re-home onto `scaffoldDefaults` value validation, or retire) |
| `packages/core/src/lanes/operations/create.ts:31,54,80,93` | `contentDir` create option + journal detail | 39c |
| `packages/core/src/lanes/operations/update.ts:33,53-55` | `contentDir` update option | 39c |
| `packages/core/src/lanes/operations/list.ts:6` | docblock | 39c |
| `packages/core/src/lanes/operations/move.ts:92-130,214,278-369` | move resolves source/target `contentDir`, boundary checks | 39c (move re-bases on `entry.artifactPath` per-entry, not lane dir) |
| `packages/cli/src/commands/lane.ts:144,169,188,194,212,220,248` | CLI `--content-dir` flag + show/list output | 39c |
| `packages/studio/src/pages/lanes/data.ts:59,149` | lane-row `contentDir` field | 39c |
| `packages/studio/src/pages/lanes/table.ts:5,101` | renders `contentDir` cell | 39c |
| `packages/studio/src/pages/lanes/edit-form.ts:49,82-85` | edit-form `contentDir` input | 39c |
| `packages/studio/src/pages/lanes/new-form.ts:16,89-90` | new-lane `contentDir` input | 39c |
| `packages/studio/src/pages/dashboard/lane-data.ts:138,149,172,217` | dashboard lane summary + legacy-site synth | 39c |
| `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:38,79,87-88,149,163-240` | client-side lane form (builds `/deskwork:lane create --content-dir`) | 39c (re-point at `--scaffold-default <kind>=<dir>`) |
| `packages/core/src/schema/journal-events.ts:121,129,138,158,168,182` | `lane-migration`/`lane-mutated` event carries `contentDir` string | 39c (event payload may keep historical `contentDir` for legacy audit reads; new events emit `scaffoldDefaults`) |

### Symbol: `config.sites` / `SiteConfig` — back-compat tolerant read retained for migration (39b); live-schema removal in 39c

| file:line | role | task |
|---|---|---|
| `packages/core/src/config.ts:21-67` | `SiteConfig` interface | 39c (move to migration-only `legacy-config.ts`) |
| `packages/core/src/config.ts:73,142-164,191-308` | `sites` field + `parseConfig`/`parseSiteConfig` | 39c |
| `packages/core/src/config.ts:86-103` | `ALLOWED_TOP_LEVEL_KEYS`/`REQUIRED_SITE_KEYS`/`ALLOWED_SITE_KEYS` | 39c |
| `packages/core/src/config.ts:310-330` | `resolveDefaultSite` | 39c |
| `packages/core/src/config.ts:338-349` | `getContentDir` (reads `cfg.sites`) | 39c (callers re-pointed: `iterate.ts:60`, `entry-resolver.ts:66`) |
| `packages/core/src/paths.ts:29,47-61` | `SiteConfig` import + `siteConfig()` lookup + `resolveSite` | 39c |
| `packages/core/src/scaffold.ts:84` | `config.sites[slug]` for scaffold | 39c (scaffold reads `lane.scaffoldDefaults`) |
| `packages/core/src/rename-slug.ts:77-81` | `config.sites` validation | 39c |
| `packages/core/src/doctor/runner.ts:132-142` | `selectSites` = `Object.keys(config.sites)` (per-site loop) | 39c (collapse to single project scope) |
| `packages/core/src/doctor/project-scope-gate.ts:33` | `Object.keys(ctx.config.sites)` | 39c |
| `packages/core/src/doctor/rules/lane-config-missing-template.ts:30` | first-site selection | 39c |
| `packages/core/src/doctor/types.ts:200` | `sites: string[]` on report | 39c |
| `packages/core/src/lanes/bootstrap.ts:103` | `config.sites[defaultSiteId]` | 39b reads it (migration); 39c removes the read from live path |
| `packages/core/src/review/start-handlers.ts:56,147` | `b.site in config.sites` validation | 39c |
| `packages/core/src/review/handlers.ts:269` | `query.site in config.sites` | 39c |
| `packages/cli/src/commands/install.ts:121,133` | iterates `config.sites` to seed calendars | 39c (writes default lane) |
| `packages/cli/src/commands/install-preflight.ts:164,178,193` | `Object.keys(config.sites)` | 39c |
| `packages/cli/src/commands/doctor.ts:117,119,319,358,365` | `--site` validation + `report.sites` | 39c |
| `packages/studio/src/pages/help.ts:48` | `Object.values(ctx.config.sites)` host inline | 39c (re-home to lane host) |
| `packages/studio/src/pages/content.ts:85,94,100,114,224,449` | `config.sites[site].host` + site count | 39c (re-home to lane host) |
| `packages/studio/src/server.ts:729,763` | `siteSlugs: Object.keys(config.sites)` boot log | 39c |
| `packages/studio/src/pages/scrapbook/dispatch.ts:53` | `site in config.sites` | 39c |
| `packages/studio/src/pages/scrapbook/index.ts:46` | `site in config.sites` | 39c |
| `packages/studio/src/routes/scrapbook-file.ts:78` | `site in config.sites` | 39c |
| `packages/studio/src/routes/scrapbook-mutation-envelope.ts:102,156` | `site in config.sites` | 39c |
| `packages/studio/src/pages/entry-review/data.ts:175` | `Object.keys(ctx.config.sites)` loop | 39c |
| `packages/studio/src/pages/dashboard/lane-data.ts:210` | `config.sites[defaultSiteId]` legacy synth | 39c |

### Symbol: `resolveContentDir` (paths.ts) — retired in 39c

| file:line | role | task |
|---|---|---|
| `packages/core/src/paths.ts:85-91` | definition | 39c |
| `packages/cli/src/commands/ingest.ts:130` | ingest scrapbook root | 39c (derive from resolved entry path) |
| `packages/core/src/content-tree-fs-walk.ts:88` | fs walk root | 39c (walk per-lane / per-entry roots) |
| `packages/core/src/content-tree.ts:159` | tree build root | 39c |
| `packages/core/src/scrapbook/paths.ts:116` | article dir | 39c |
| `packages/core/src/content-index.ts:228` | index walk root | 39c |
| `packages/core/src/doctor/rules/duplicate-id.ts:63` | walk root | 39c |
| `packages/core/src/doctor/rules/legacy-top-level-id-migration.ts:166` | walk root | 39c |
| `packages/studio/src/pages/review-scrapbook-drawer.ts:67` | scrapbook dir | 39c |
| `packages/studio/src/pages/content.ts:495` | content tree render | 39c |
| `packages/studio/src/pages/content-detail.ts:146,224` | scrapbook dir | 39c |

> NOTE: `resolveContentDir` has the widest reach of any single symbol. Several callers (`content-index`, `content-tree`, `duplicate-id`) walk "the content directory" as a discovery mechanism, not a per-entry resolution. Under the entry-owns-path model these become a walk over the union of lane scaffold roots OR a sidecar-driven enumeration. **39c must decide per-caller whether the walk is replaced by (a) a sidecar enumeration or (b) a per-lane `scaffoldDefaults` root walk. Flag: this is the largest single refactor in 39c.**

### Symbol: `resolveCalendarPath` (paths.ts) — de-parameterized to single project calendar in 39c

| file:line | role | task |
|---|---|---|
| `packages/core/src/paths.ts:64-70` | definition (reads `site.calendarPath`) | 39c (return fixed `.deskwork/calendar.md`) |
| `packages/core/src/calendar/regenerate.ts:6,117` | regen target | 39c |
| `packages/core/src/doctor/runner.ts:14,116` | per-site calendar in buildContext | 39c |
| `packages/core/src/doctor/repair.ts:6,132` | repair regen | 39c |
| `packages/core/src/doctor/rules/calendar-uuid-missing.ts:18,114` | calendar read | 39c |
| `packages/core/src/review/workflow-paths.ts:30,49` | calendar path | 39c |
| `packages/cli/src/commands/publish.ts:43,123,151` | calendar path | 39c |
| `packages/cli/src/commands/add.ts:29,88` | calendar path | 39c |
| `packages/cli/src/commands/approve.ts:23,212` | calendar path | 39c |
| `packages/cli/src/commands/ingest.ts:48,114` | calendar path | 39c |
| `packages/cli/src/commands/distribute.ts:37,111` | calendar path | 39c |
| `packages/core/src/rename-slug.ts:21,96` | calendar path | 39c |
| `packages/studio/src/pages/content.ts:40,73` | calendar read | 39c |
| `packages/studio/src/pages/entry-review/data.ts:27,177` | calendar read | 39c |
| `packages/studio/src/pages/scrapbook/dispatch.ts:11,55` | calendar read | 39c |
| `packages/studio/src/pages/entry-review/index.ts:36,192` | calendar read | 39c |

> Strategy: `resolveCalendarPath` keeps its signature (`projectRoot, config, site?`) through 39a/39b/39d and simply ignores `site` once 39c lands, returning a fixed `.deskwork/calendar.md`. This means callers do NOT have to change their call sites in lockstep — the de-parameterization is internal. Closes #234 (divergence), #357 (read-side validator), #223 (regen flip-flop) per spec §"Inherited calendar-surface cluster".

### Symbol: `resolveSiteHost` / `resolveSiteBaseUrl` (paths.ts) — re-home to `lane.host` in 39c

| file:line | role | task |
|---|---|---|
| `packages/core/src/paths.ts:99-104` | `resolveSiteHost` definition | 39c (retire; replace with `lane.host` read) |
| `packages/core/src/paths.ts:112-125` | `resolveSiteBaseUrl` definition | 39c |
| `packages/studio/src/pages/content.ts:85` | `config.sites[site].host` (the live host consumer) | 39c → `lane.host` |
| `packages/studio/src/pages/help.ts:48-49` | `s.host` over `config.sites` (the second live consumer) | 39c → iterate lane configs' `host` |

> **Zero production call sites for `resolveSiteHost`/`resolveSiteBaseUrl`** (confirmed: the only `host` reads are the two studio files above, which read `config.sites[*].host` directly, NOT via the resolve helpers). Per spec §18, these two functions are effectively dead; 39c deletes them and re-points the two studio consumers at `lane.host`.

### Symbol: `artifactPathForStage` (slug+stage heuristic) — LAST use as 39b backfiller; runtime resolution removed in 39d

| file:line | role | task |
|---|---|---|
| `packages/core/src/doctor/validate.ts:181-201` | heuristic definition | 39d removes from `resolveArtifactPath` runtime path |
| `packages/core/src/doctor/validate.ts:214-218` | `resolveArtifactPath` falls back to heuristic | 39d (drop the fallback; resolution = `entry.artifactPath` only) |
| `packages/core/src/doctor/validate.ts:386` | `missing-artifact-path` uses heuristic to suggest | 39b moves this into the migration backfiller; 39d removes from validate |
| `packages/core/src/doctor/repair.ts:19-45` | duplicate heuristic def | 39b (this IS the backfiller; consolidate into the migration rule) |
| `packages/core/src/doctor/repair.ts:65-84,109-120` | `backfillArtifactPaths` (current backfiller) | 39b (becomes the migration backfiller WITH ambiguity-halt) |

---

## 2. Entry `artifactPath` analysis

**Declaration.** Two surfaces:
- Schema (SSOT): `packages/core/src/schema/entry.ts:260-277` — `artifactPath: z.string().min(1)...optional()` with `..`-traversal + absolute-path refinements (AUDIT-20260530-64). Path is relative to the lane/content dir.
- Result echo: `packages/core/src/entry/publish.ts:40` (`readonly artifactPath?`).

**Writers (who stamps it):**
- `packages/core/src/entry/create.ts:40,106` — `add`/`outline`/`induct` creation.
- `packages/core/src/groups/operations/create.ts:34,108,131` — group creation.
- `packages/cli/src/commands/group.ts:236` — `--artifact-path` flag.
- `packages/cli/src/commands/ingest.ts:263` — `ingest --apply` stamps `candidate.relativePath`.
- `packages/core/src/doctor/migrate.ts:181,196` — Phase-30 migration stamps from ingest-journal `sourceFile`.
- `packages/core/src/doctor/repair.ts:79` — `backfillArtifactPaths` stamps from the heuristic (THE backfiller 39b takes over).
- `packages/core/src/doctor/rules/legacy-stage-artifact-path.ts:262` — re-points stale `scrapbook/<stage>.md` paths to `index.md`.

**Readers (who resolves via it):**
- `packages/core/src/entry/publish.ts:103-104` — existence guard.
- `packages/core/src/iterate/iterate.ts:48-49` — resolve index/artifact (with `<contentDir>/<slug>/index.md` legacy fallback at :60).
- `packages/core/src/entry/snapshot.ts:89-99` — derives doc dir.
- `packages/core/src/lanes/operations/move.ts:301-303` — re-bases between content dirs.
- `packages/core/src/doctor/validate.ts:215-216` — preferred over heuristic.
- `packages/studio/src/lib/entry-resolver.ts:52-53` (with `<contentDir>/<slug>/index.md` fallback at :66).
- `packages/studio/src/pages/entry-review/data.ts:379` + `members-section.ts:438`.
- `packages/studio/src/routes/scrapbook-file.ts:14`, `screenshot-persistence.ts:106`.

**What makes it authoritative (the 39a + 39d work):**
1. **39a:** the schema field stays `optional()` (legacy sidecars must still parse pre-migration), BUT a new doctor rule (`entry-artifact-path-missing`, the migration-detection half of 39b) treats a missing `artifactPath` on an artifact-bearing entry as a finding. The entry-resolution helpers gain a "stored-path-only" mode used by 39d.
2. **39d:** every resolution helper that today does `entry.artifactPath ?? heuristic` (`validate.ts:214`, `iterate.ts:60`, `entry-resolver.ts:66`) drops the heuristic/`<contentDir>/<slug>/index.md` fallback and throws a descriptive error when `artifactPath` is absent (per project rule "no fallbacks — throw"). The throw message points the operator at `doctor --fix` to backfill. This is what makes the field *required in practice* without forcing the schema to `required` (which would break legacy-sidecar parsing before the migration runs).

> **Do NOT make the Zod field `required` in 39a.** A `required` field breaks every pre-migration sidecar parse — including the migration reader itself, which must parse a legacy sidecar to know it needs backfilling. "Authoritative + required post-migration" is enforced by the resolution-helpers-throw (39d) + the migration-detection doctor rule (39b), not by the schema. The schema field stays `optional()`; the *runtime contract* is "resolution throws without it."

---

## 3. Recommended commit sequence (green at every boundary)

Each numbered item is one task boundary at which `npm --workspaces test` + `tsc --noEmit` are GREEN. Within a task, land one fix per commit per the project's commit-discipline rule.

### Sequence: 39a → 39b → 39d → 39c

**39a — additive schema + authoritative-resolution plumbing.**
- Add `host?: string` and `scaffoldDefaults?: Partial<Record<ArtifactKind, string>>` to `LaneConfigSchema`. Use `z.record(ArtifactKindSchema, z.string().min(1)).optional()` (a Zod record over the enum is partial by construction — a single-kind map validates; unknown keys are rejected because the key schema is the enum). Keep `.strict()`. **Do NOT remove `contentDir`** — leave it present and redundant.
- Add the resolution-helper "stored-path-only" code paths (new functions or a flag), but DON'T flip the default yet — both old (`?? heuristic`) and new (throw) paths coexist; 39d flips the default.
- **Green because:** purely additive. No existing reader of `contentDir` or `config.sites` is touched; new optional fields don't break existing lane JSON; existing resolution behavior is unchanged.

**39b — migration rule + backfiller (additive doctor rule).**
- New doctor rule `sites-to-lanes-migration` (detects: `config.sites` present OR any artifact-bearing entry lacks `artifactPath`). Reports pre-migration shape; `--fix` performs: (1) lanes-from-sites (`host ← site.host`, `scaffoldDefaults` derived from `site.contentDir` keyed by the lane's pipeline kinds), (2) per-entry `artifactPath` backfill using `artifactPathForStage` (the LAST use), (3) drop `sites`.
- **Ambiguity-halt:** the backfiller must enumerate ALL candidate files across every legacy `site.contentDir` (and any absolute dirs) for the slug+stage; if >1 exists, REFUSE to stamp that entry and add a `migration-ambiguous` finding naming the candidates. Reuse/extend `repair.ts:backfillArtifactPaths` — but it currently checks exactly one heuristic path; 39b must widen it to a multi-candidate search precisely so it can detect the collision it must refuse to launder.
- `config.sites` is still in the live schema here (read by the migration). `artifactPathForStage` still exists.
- **Green because:** additive rule; the migration reads `config.sites` which is still present; the heuristic still exists; no live resolution path changes.

**39d — flip resolution to stored-path-only; delete runtime heuristic.**
- `validate.ts:resolveArtifactPath` drops the `?? artifactPathForStage` fallback → returns `entry.artifactPath` joined, or null when absent (and `missing-artifact-path` becomes "no longer a heuristic-suggest; the migration rule from 39b owns backfill").
- `iterate.ts:60` and `entry-resolver.ts:66` drop the `<contentDir>/<slug>/index.md` legacy fallback → throw a descriptive error pointing at `doctor --fix`.
- Delete `artifactPathForStage` from `validate.ts` AND `repair.ts` runtime use — the only surviving copy is inside 39b's migration backfiller. Remove the dropped #394 "search every site's contentDir" code (already absent post-39.0 resync; this confirms no resolution does base-search).
- Add the #394-class regression fixture (two sites, same slug; assert `file-presence` + `calendar-sidecar` produce ZERO false-positives because resolution reads the stored path, never searches).
- **Green because:** by now 39b's migration has a backfiller that doesn't depend on `validate.ts`'s copy; test fixtures that relied on the heuristic resolution must be updated to stamp `artifactPath` (these fixtures migrate IN this commit). `config.sites`/`contentDir` still exist (untouched), so no schema breakage.

**39c — remove `sites` from the live schema + remove `lane.contentDir`; re-home host + collapse calendar.**
- Move `SiteConfig` + the `sites`/`SiteConfig` parsing into a migration-only `packages/core/src/doctor/legacy-config.ts` (tolerant reader); 39b's rule is its only caller.
- `config.ts`: top-level config loses `sites`/`defaultSite`; `parseConfig` validates the shrunken shape. `getContentDir` retires (callers already off it post-39d, or re-pointed to lane scaffold roots).
- `paths.ts`: delete `resolveSiteHost`/`resolveSiteBaseUrl`; `resolveContentDir` retires (callers re-pointed); `resolveCalendarPath` ignores `site`, returns `.deskwork/calendar.md`; `resolveSite`/`siteConfig` retire.
- `lanes/types.ts`: remove `contentDir`. `bootstrap.ts`/`create.ts`/`update.ts`/`move.ts`/`lane.ts`/lanes studio pages re-point to `scaffoldDefaults`.
- doctor `runner.ts`: collapse `selectSites` to a single project scope (the per-site loop becomes a single pass); `report.sites` retires or becomes `["project"]`.
- studio dashboard `defaultSite` plumbing: the ~12 files threading `defaultSite` get a single project-level value (or the param is dropped). `content.ts`/`help.ts` host reads re-point to `lane.host`.
- `install.ts`: write a default lane (`id: default`, `pipelineTemplate: editorial`, optional `host`, `scaffoldDefaults` from detected dir) instead of iterating `config.sites`.
- **Green because:** every consumer of `contentDir`/`sites`-for-resolution was already migrated off it in 39b+39d. The ONLY thing 39c does is delete the now-unreferenced field/type and the now-redundant per-site loop, plus re-point the two host consumers. Tests that constructed `config.sites` fixtures get rewritten to the lane-based shape in this commit (the large test-file delta lands here).

> **Why not the workplan's literal order (39a removes contentDir)?** Removing `contentDir` in 39a would break `move.ts`, lane CRUD, dashboard lane-data, and the lanes studio pages at compile time, with no migrated replacement yet. tsc would be red for the entire 39a→39c window. The reorder keeps the *removal* as the terminal step after consumers are migrated — standard "expand/contract" schema migration. **This reorder must be reflected back into the workplan** (39c's checklist absorbs the field/type deletions; 39a's checklist says "add fields, keep contentDir").

### File-size flags
- `packages/core/src/config.ts` (379 lines) — 39c removing `SiteConfig`/`parseSiteConfig` SHRINKS it; safe. The migration-only `legacy-config.ts` it spawns is new and small.
- `packages/core/src/doctor/validate.ts` (~410+ lines) — already near the cap. 39d REMOVES `artifactPathForStage` + the fallback (shrinks it); safe.
- `packages/core/src/doctor/lane-migration.ts` (~360 lines) — 39b adds the sites-to-lanes migration. **FLAG:** if 39b extends this file rather than adding a sibling, it risks the 300-500 cap. Recommendation: 39b's new rule lives in a NEW file `packages/core/src/doctor/rules/sites-to-lanes-migration.ts` + a backfiller helper `packages/core/src/doctor/sites-migration-backfill.ts`, NOT appended to `lane-migration.ts`.
- `packages/core/src/paths.ts` (358 lines) — 39c removes 3 functions; shrinks it; safe.
- `packages/core/src/lanes/operations/move.ts` (~370 lines) — 39c's re-base-on-`artifactPath` rewrite could push it over. **FLAG:** extract the per-entry path-resolution helper into `move-resolve.ts` if the rewrite grows the file.

---

## 4. Per-task file + test lists (TDD)

### 39a — Lane schema + entry resolution
**Modify:**
- `packages/core/src/lanes/types.ts` — add `host?`, `scaffoldDefaults?` to schema + docblock; keep `contentDir`.
- `packages/core/src/doctor/validate.ts` / `iterate.ts` / `studio/lib/entry-resolver.ts` — add stored-path-only resolution functions (coexisting with fallback; default unchanged).
**New tests (write first):**
- `packages/core/test/lanes/lane-schema-scaffold-defaults.test.ts` — accepts `{ markdown: 'src/content/blog' }` (single kind, partial); accepts `host`; REJECTS unknown key in `scaffoldDefaults` (enum key); REJECTS unknown top-level key (`.strict()`).
- `packages/core/test/entry/artifact-path-authoritative.test.ts` — given a stamped `artifactPath`, the stored-path-only resolver returns it verbatim and never consults slug+stage.

### 39b — Doctor migration rule + backfiller
**Create:**
- `packages/core/src/doctor/rules/sites-to-lanes-migration.ts` — detection + report + `--fix`.
- `packages/core/src/doctor/sites-migration-backfill.ts` — multi-candidate search; ambiguity-halt; stamps unambiguous entries.
- `packages/core/src/doctor/legacy-config.ts` (stub here, finalized in 39c) — tolerant `sites` reader.
**Modify:**
- `packages/core/src/doctor/index.ts` + runner registry — register the new rule.
**New tests (write first):**
- `.../test/doctor/sites-to-lanes-migration.test.ts` — multi-site fixture migrates `host`+`scaffoldDefaults`; entries backfilled; `sites` dropped.
- `.../test/doctor/migration-idempotent.test.ts` — second `--fix` is a no-op.
- `.../test/doctor/migration-slug-collision.test.ts` — slug under 2 site contentDirs (and a multi-filesystem variant): asserts `migration-ambiguous` finding, asserts the colliding entry's sidecar is NOT stamped, asserts unambiguous siblings ARE stamped.

### 39c — Retire `sites` from config/loader/paths/install/studio/calendar
**Modify (delete/re-home):** `config.ts`, `paths.ts`, `lanes/types.ts`, `lanes/bootstrap.ts`, `lanes/loader.ts`, `lanes/operations/{create,update,move,list}.ts`, `cli/commands/{lane,install,doctor,ingest}.ts`, `cli/commands/install-preflight.ts`, `calendar/regenerate.ts`, `doctor/runner.ts`, `doctor/repair.ts`, `doctor/types.ts`, `doctor/project-scope-gate.ts`, `doctor/rules/{lane-config-missing-template,duplicate-id,legacy-top-level-id-migration,calendar-uuid-missing}.ts`, `review/{handlers,start-handlers,workflow-paths}.ts`, `rename-slug.ts`, `scaffold.ts`, `content-index.ts`, `content-tree.ts`, `content-tree-fs-walk.ts`, `scrapbook/paths.ts`, `iterate/iterate.ts`; studio `pages/{content,help,dashboard/lane-data,entry-review/data,lanes/*,dashboard/*}.ts`, `server.ts`, `routes/scrapbook-*.ts`, `pages/scrapbook/*.ts`, `pages/review-scrapbook-drawer.ts`, `pages/content-detail.ts`; `plugins/deskwork-studio/public/src/lanes/lanes-page.ts`.
**Finalize:** `doctor/legacy-config.ts` (migration-only tolerant `sites` reader).
**New/updated tests:**
- `.../test/config/no-sites-schema.test.ts` — `parseConfig` rejects a config with `sites`; accepts the shrunken shape.
- `.../test/calendar/single-project-calendar.test.ts` — `resolveCalendarPath` ignores `site`, returns `.deskwork/calendar.md`; regen targets it.
- `.../test/studio/lane-host.test.ts` — `content.ts`/`help.ts` read host from `lane.host`.
- `.../test/lanes/scaffold-defaults-add.test.ts` — `add --lane X --kind K` scaffolds into `lane.scaffoldDefaults[K]` and stamps the resulting `artifactPath`.
- Rewrite every `sites: { ... }` test fixture (the bulk of the studio test deltas) to the lane shape.

### 39d — Doctor resolution reads `entry.artifactPath` only
**Modify:** `doctor/validate.ts` (drop heuristic fallback + delete `artifactPathForStage`), `doctor/repair.ts` (delete its heuristic copy + runtime backfill), `iterate/iterate.ts` (drop `<contentDir>/<slug>/index.md` fallback → throw), `studio/lib/entry-resolver.ts` (same).
**New tests (write first):**
- `.../test/doctor/394-multisite-no-false-positive.test.ts` — two sites, same slug, stamped `artifactPath`: assert `file-presence` + `calendar-sidecar`/`frontmatter-sidecar` report ZERO findings (the #394 regression guard).
- `.../test/iterate/missing-artifact-path-throws.test.ts` — entry without `artifactPath` → iterate throws a `doctor --fix` message, never silently resolves a phantom path.

### 39e — Docs (no code; no green-test concern)
**Modify:** `MIGRATING.md`, `DESKWORK-STATE-MACHINE.md`, `THESIS.md`, `.claude/CLAUDE.md` `sites` references; re-point #223/#234/#357 at Phase 39 (39c) per spec §"Inherited calendar-surface cluster".

---

## 5. Open risks to surface to the operator (capture, not deferral)
1. **`resolveContentDir`'s discovery-walk callers** (`content-index`, `content-tree`, `duplicate-id`, `legacy-top-level-id-migration`) walk "the content tree" as a *discovery* mechanism, not per-entry resolution. Under entry-owns-path, what is the discovery root? Options: (a) walk the union of every lane's `scaffoldDefaults` dirs; (b) drive discovery from sidecar enumeration. This is a design decision inside 39c that the spec does not fully pin down — the spec says resolution reads `artifactPath`, but `duplicate-id`/content-index walk to FIND files independent of sidecars. Needs an operator call.
2. **`defaultSite` removal blast radius in the studio dashboard** (~12 files thread it) is broader than the spec's surface list. The spec scopes "host re-home + content.ts/help.ts"; it does not explicitly scope dropping the `defaultSite` parameter from the dashboard render chain. Confirm whether `defaultSite` is dropped entirely or replaced by a single project-level constant in 39c.
3. **`lane-mutated`/`lane-migration` journal-event payloads** carry `contentDir` (`journal-events.ts:182`). Existing on-disk journals reference it. 39c should keep the historical event schema readable (back-compat read) while new events emit `scaffoldDefaults` — flag whether to version the event.

---

Searched: `{contentDir, config.sites/SiteConfig, resolveContentDir, resolveCalendarPath, resolveSiteHost, resolveSiteBaseUrl, artifactPathForStage}` blast-radius pattern set — 7 patterns, ~95 production-source match groups enumerated (test-file matches excluded from the production blast radius per the grouping rule)
Included: packages/core/src/lanes/types.ts:81, packages/core/src/lanes/bootstrap.ts:119, packages/core/src/lanes/loader.ts:95, packages/core/src/lanes/operations/move.ts:278, packages/core/src/lanes/operations/create.ts:80, packages/core/src/lanes/operations/update.ts:53, packages/cli/src/commands/lane.ts:169, packages/studio/src/pages/lanes/data.ts:149, packages/studio/src/pages/lanes/table.ts:101, packages/studio/src/pages/lanes/edit-form.ts:82, packages/studio/src/pages/lanes/new-form.ts:89, packages/studio/src/pages/dashboard/lane-data.ts:149, plugins/deskwork-studio/public/src/lanes/lanes-page.ts:163, packages/core/src/schema/journal-events.ts:182, packages/core/src/config.ts:73, packages/core/src/config.ts:191, packages/core/src/config.ts:338, packages/core/src/paths.ts:58, packages/core/src/scaffold.ts:84, packages/core/src/rename-slug.ts:77, packages/core/src/doctor/runner.ts:132, packages/core/src/doctor/project-scope-gate.ts:33, packages/core/src/doctor/rules/lane-config-missing-template.ts:30, packages/core/src/doctor/types.ts:200, packages/core/src/review/start-handlers.ts:56, packages/core/src/review/handlers.ts:269, packages/cli/src/commands/install.ts:121, packages/cli/src/commands/install-preflight.ts:164, packages/cli/src/commands/doctor.ts:117, packages/studio/src/pages/help.ts:48, packages/studio/src/pages/content.ts:85, packages/studio/src/server.ts:729, packages/studio/src/pages/scrapbook/dispatch.ts:53, packages/studio/src/pages/scrapbook/index.ts:46, packages/studio/src/routes/scrapbook-file.ts:78, packages/studio/src/routes/scrapbook-mutation-envelope.ts:102, packages/studio/src/pages/entry-review/data.ts:175, packages/core/src/paths.ts:85, packages/cli/src/commands/ingest.ts:130, packages/core/src/content-tree-fs-walk.ts:88, packages/core/src/content-tree.ts:159, packages/core/src/scrapbook/paths.ts:116, packages/core/src/content-index.ts:228, packages/core/src/doctor/rules/duplicate-id.ts:63, packages/core/src/doctor/rules/legacy-top-level-id-migration.ts:166, packages/studio/src/pages/review-scrapbook-drawer.ts:67, packages/studio/src/pages/content.ts:495, packages/studio/src/pages/content-detail.ts:146, packages/core/src/paths.ts:64, packages/core/src/calendar/regenerate.ts:117, packages/core/src/doctor/runner.ts:116, packages/core/src/doctor/repair.ts:132, packages/core/src/doctor/rules/calendar-uuid-missing.ts:114, packages/core/src/review/workflow-paths.ts:49, packages/cli/src/commands/publish.ts:123, packages/cli/src/commands/add.ts:88, packages/cli/src/commands/approve.ts:212, packages/cli/src/commands/distribute.ts:111, packages/core/src/rename-slug.ts:96, packages/studio/src/pages/entry-review/index.ts:192, packages/core/src/paths.ts:99, packages/core/src/paths.ts:112, packages/core/src/doctor/validate.ts:181, packages/core/src/doctor/validate.ts:214, packages/core/src/doctor/validate.ts:386, packages/core/src/doctor/repair.ts:25, packages/core/src/doctor/repair.ts:65, packages/core/src/schema/entry.ts:260, packages/core/src/entry/publish.ts:40
Excluded: packages/studio/test/dashboard-bodystate.test.ts:125 — test fixture, migrates with 39c's fixture rewrite, not production blast radius; packages/studio/test/shortform-routing.test.ts:34 — test fixture, same; packages/core/src/lanes/detection.ts:62 — `detectArtifactKind(artifactPath)` is a local parameter name unrelated to the entry-path resolution axis; plugins/dw-lifecycle/src/scope-discovery/check-editor-symmetry.ts:55 — scope-discovery's own unrelated `artifactPath` (a scan-output path), not the deskwork entry field; plugins/dw-lifecycle/src/scope-discovery/check-deprecations.ts:76 — same scope-discovery local symbol, different subsystem
