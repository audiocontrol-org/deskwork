# Sites → Lanes Retirement — Design Spec

**Date:** 2026-06-02
**Status:** Accepted (brainstorm complete; pending implementation plan). **Addendum 2026-06-03:** 39c-2b design pass added — see § "`add`-time path composition" and § "CLI-verb resolution migration" (operator chose Option 1 + global `index` default).
**Branch context:** authored on `feature/deskwork-plugin` at a point where `main` (v0.34.0) has shipped the graphical-entries lane model; this spec supersedes the in-flight `#394` "search every site's contentDir" fix (which is dropped — see §9).

## Problem

The legacy `sites` concept (`config.sites.<slug> = { contentDir, calendarPath, host }`) makes a content **location** the primary axis of the data model. Entries carry no `site` field, so the doctor (and other consumers) must *guess* which site's `contentDir` an entry's artifact lives in by searching all of them. That guessing is the root cause of:

- **[#394](https://github.com/audiocontrol-org/deskwork/issues/394)** — multi-site `doctor` false-positives (`file-presence` + `calendar-sidecar`).
- **Audit-barrage findings `AUDIT-20260602-03/04/05`** — slug-collision-across-sites resolves to the wrong file; `doctor --fix` calendar read/write asymmetry; legacy-calendar fallback asymmetry. These are all symptoms of the same disease: **location used as an identifying/resolution key.**

The graphical-entries work (v0.34.0) introduced **lanes** — `LaneConfig = { id, name, pipelineTemplate, contentDir }`, with entries carrying `lane` and `artifactKind`. Lanes already subsume the *contentDir* role and add the per-entry binding sites never had (`entry.lane`). But the current lane model repeated the original mistake: it made `contentDir` a lane attribute, re-coupling the lane to a location.

**Operator framing (verbatim):** *"It's also entirely possible for site content to be in completely different filesystems. I'm very uncomfortable with the location of content being the primary key that identifies a lane."*

What `sites` uniquely carried beyond `contentDir` is nearly vestigial:
- `host` — `resolveSiteHost` / `resolveSiteBaseUrl` have **zero production call sites**; only two studio files reference `.host`.
- `calendarPath` — vestigial under Phase 30's entry-centric model (the calendar is a derived projection from sidecars).

## Principle

**Location is a property of the entry, not the identity of the lane.** This is what deskwork's own Phase-30 rule already says: the sidecar is the source of truth. We apply it consistently — removing location-as-key from *both* the retiring `sites` axis and the inherited `lane.contentDir` attribute.

## The Model

### Lane (logical; identified by `id`, never by location)

```
LaneConfig = {
  id:               string                     // stable identity (kebab-case)
  name:             string                     // human label
  pipelineTemplate: string                     // stage vocabulary
  host?:            string                     // optional — present only when this lane publishes to a website
  scaffoldDefaults?: Partial<Record<artifactKind, string>>  // optional — where /deskwork:add drops a NEW file, per kind (partial: a lane defines defaults only for the kinds it uses)
}
```

- `contentDir` is **removed** from the lane.
- `scaffoldDefaults` is the *only* location info a lane carries, and it is used **solely at `add`-time** to choose where a new file is scaffolded. It is a convenience default — never identity, never resolution. Keyed by `artifactKind` (e.g. `post → src/content/blog`, `plan → docs/plans`, `workplan → docs/workplans`), matching the "a website has a site content directory and a separate PRD + workplan directory" example. **The map is partial** (`Partial<Record<…>>`): a lane defines defaults only for the kinds its pipeline actually scaffolds. The Zod schema is a partial record (`z.record(artifactKindSchema, z.string())` or an `.partial()`'d object) that accepts a lane defining a single kind and rejects only *unknown* keys — it MUST NOT force every `artifactKind` to be present.
- A lane "spans" whatever directories/filesystems its entries happen to live in — emergent from the entries, not declared on the lane.

### Entry (owns its location)

- The sidecar's **`artifactPath` is authoritative and required** (post-migration) for any entry that has an on-disk artifact. It may point anywhere — any directory, any filesystem.
- **One artifact per entry.** Each entry has exactly one primary `artifactPath` (plus its scrapbook for adjacent assets, which is relative to the artifact). "Content in multiple locations" is modeled by *different entries* in a lane living in different places — never by one entry spanning multiple artifact files.
- `lane` (grouping) and `artifactKind` (kind) stay as they are; they no longer resolve location.

### Resolution

`entry.artifactPath` → the file. Full stop. The doctor, studio, and every verb read the stored path. There is no base-searching, so the #394-class ambiguity cannot occur.

## Config schema change

`config.sites` is **removed**. The top-level config shrinks to genuinely project-global settings (docs/journal config, etc.). Lanes continue to live at `.deskwork/lanes/<id>.json`; `host` moves onto the relevant lane.

## Calendar

Per-site `calendarPath` is **retired**. The calendar is a derived projection from sidecars (Phase 30). Concretely: a **single** project-level calendar file at `.deskwork/calendar.md`, regenerated from sidecars (back-compat for adopters / git-diff visibility), plus the studio's live view rendered directly from sidecars. No per-site or per-lane calendar files. `resolveCalendarPath`, `regenerateCalendar`, and the doctor `calendar-sidecar` rule stop being site-parameterized and target the single project calendar.

## Migration (`doctor --fix`, clean cutover)

Pre-1.0 → one decisive migration step (no long coexistence window):

1. **Lanes from sites.** For each legacy `site`, create a lane: `id` from the site slug; `pipelineTemplate: editorial` (or detected); `host ← site.host`; `scaffoldDefaults` derived from `site.contentDir`.
2. **Backfill entry paths.** For every entry lacking `artifactPath`, derive it once from the current resolved location (the existing slug+stage heuristic) and stamp it onto the sidecar. This is the **last legitimate use** of the heuristic.
   - **Ambiguity must halt, not guess.** The heuristic is the *same* slug+stage search that causes the #394 multi-site false-positive. If, for a given entry, it resolves to **more than one candidate file** (e.g. the slug exists under >1 legacy `site.contentDir`, or on >1 filesystem), the migration MUST NOT silently stamp one — that would launder a known-ambiguous guess into permanent, trusted `artifactPath` data and make the bug *undetectable* afterward (no more search to flag it). Instead, `--fix` reports the collision per-entry and **refuses to stamp that entry**, requiring operator disambiguation (an explicit per-entry `artifactPath`, or removing the duplicate). Unambiguous entries (exactly one candidate) migrate normally. This collision-detection path is part of 39b's acceptance criteria.
3. **Drop `sites`.** Remove the `sites` block from the config.
4. **Tolerated reads.** `sites` reads are tolerated *only* inside this migration. After it runs, nothing reads `sites`.

A doctor rule detects the pre-migration shape (config has `sites`, or entries lack `artifactPath`) and reports it; `--fix` performs the migration above.

## Surface impacts (full capture)

- **`packages/core/src/paths.ts`** — `resolveContentDir` / `resolveCalendarPath` / `resolveSiteHost` / `resolveSiteBaseUrl` are retired or re-homed onto the lane (`lane.host`).
- **doctor** — `file-presence` / `frontmatter-sidecar` / `missing-artifact-path` read `entry.artifactPath` only. `artifactPathForStage` survives **only** as the migration backfiller (step 2), then is dead for runtime resolution. The `#394` search-all-sites code is removed (§9).
- **install skill** (`/deskwork:install`) — stops writing `sites`; writes a default lane instead (id `default`, `pipelineTemplate: editorial`, optional `host`, `scaffoldDefaults` from the detected content dir).
- **studio** — host-dependent URL formatting reads `lane.host`; per-site dashboards are per-lane (already true post-graphical-entries). The two `.host` consumers (`content.ts`, `help.ts`) re-point at lane host.
- **ingest / add** — `add --lane X --kind K` scaffolds into `lane.scaffoldDefaults[K]` (or an explicit destination), then stamps the resulting `artifactPath` onto the new entry. `ingest --apply` stamps `artifactPath` for every backfilled entry.
- **config schema + loader** (`packages/core/src/config.ts`) — `SiteConfig` / `sites` removed; the migration-time tolerant reader is the only path that still parses a legacy `sites` block.

## `add`-time path composition (39c-2b design pass — 2026-06-03)

**Decision (operator, 2026-06-03):** *Option 1* — `scaffoldDefaults[K]` carries the **directory only**; the file's on-disk shape (its *layout*) is a separate, defaulted concern. Chosen over a full path-template field (Option 2) and a fixed-flat-filename model (Option 3) because it is the smallest change and preserves all three existing layouts with **zero behavior change** at the cutover.

**How `add --lane X --kind K` composes the destination:**

1. **Directory** ← `lane.scaffoldDefaults[K]`. If the lane defines no default for kind `K`, `add` **fails loudly** with guidance (no silent fallback, per the no-fallbacks rule) — the operator either passes an explicit destination or adds the default to the lane.
2. **Layout** ← `--layout {index|readme|flat}` if given; else the global default **`index`**.
3. **Relative path** ← `layoutToContentRelativePath(layout, slug)` (the existing `scaffold.ts` helper):
   - `index` → `<slug>/index.md` (default)
   - `readme` → `<slug>/README.md`
   - `flat` → `<slug>.md`
4. **`artifactPath`** ← `join(scaffoldDefaults[K], relativePath)`, stamped onto the new entry's sidecar. From that point it is authoritative; resolution never recomputes it.

**Default rationale (least surprise):** today, `add` with no flags produces `<slug>/index.md` (the `blogFilenameTemplate` default `{slug}/index.md`). Defaulting layout to `index` keeps `add` byte-for-byte identical **for adopters who left `blogFilenameTemplate` at its default**. ⚠️ This is NOT zero-change for adopters who *customized* `blogFilenameTemplate` — see the **39c-2b design amendment** below (AUDIT-37) for how the migration carries a custom template forward.

**Retires the slug-template family.** `resolveBlogFilePath` / `resolveEntryFilePath` / `resolveShortformFilePath` / `resolveBlogPostDir` (and `blogFilenameTemplate`) currently build the full path from `siteConfig().contentDir`. They are replaced by the `scaffoldDefaults[K]` + `layoutToContentRelativePath` composition above; the `{slug}` template-substitution machinery is removed with `sites`.

**Open sub-question (captured, not blocking):** whether a lane carries an optional `defaultLayout` field, or layout stays purely a per-`add` flag with the global `index` default. The global-`index` default already satisfies the zero-behavior-change goal; a per-lane default is an additive convenience the implementation plan can decide.

## CLI-verb resolution migration (39c-2b design pass — 2026-06-03)

The consumers split into **three** patterns (the post-barrage amendment below corrects an earlier two-bucket split — see AUDIT-35/38 — and publishes the canonical roster):

- **Act-on-EXISTING-entry verbs** (publish, induct, cancel, approve longform, block, iterate longform, distribute): resolve the artifact via **`entry.artifactPath`** — extending 39d's entry-review flip to the CLI-verb path. No `contentDir`, no slug+stage search. An entry missing `artifactPath` is a `doctor --fix`-able state (39b backfills it); the verb **throws with that guidance** rather than guessing.
- **Create-a-NEW-file verbs** (`add`; `shortform-start` + the shortform branches of `approve`/`iterate`): no destination exists yet → *compose-then-stamp*. `add` composes its main artifact from the `scaffoldDefaults[K]` model above; the shortform verbs compose a scrapbook-child path from the **parent entry's `artifactPath` directory** (see AUDIT-35 in the amendment) — NOT from `contentDir`.
- **`ingest --apply`:** stamps `artifactPath` from the discovered on-disk file (already specced in § Surface impacts).
- **`rename-slug`:** a slug→path verb — it detects the layout from the stored `artifactPath` and recomposes against the same base directory (see AUDIT-36 in the amendment). It keeps a slug→path dependency even after the template family is gone.

Only after every consumer resolves via `entry.artifactPath` (or composes-then-stamps) can `resolveSite` / `siteConfig` / `resolveContentDir` / `config.sites` / `SiteConfig` be deleted — the terminal step of 39c-2b. The **canonical consumer roster** is in the amendment below (AUDIT-38).

## 39c-2b design amendment (2026-06-03, post-barrage findings)

The audit-barrage on the 39c-2b design pass + sub-task (b) commit surfaced six gaps (AUDIT-20260603-35..40). The design pass under-mapped the same class of resolution path that originally made 39c-2 STOP. Resolutions:

### AUDIT-39 (HIGH) — `add` is markdown-only; non-markdown kinds are rejected (SUPERSEDES the kind-aware attempt)

> **Course correction (operator, 2026-06-03):** *"we only support markdown at the moment. why would you expand support to other types?"* — The first attempt at this finding made the composer **kind-aware** (extension per kind, a per-kind legal-layout matrix, an `--artifact-path` flag for images). That was over-built: deskwork only supports markdown today, and the verb that *materializes* a file (`scaffoldBlogPost`) is markdown-only, so non-markdown entries could be created but never correctly produced. The kind-aware machinery was reverted (commit follows). This section supersedes it.

The actual bug AUDIT-39 named — a non-markdown kind stamped with a `.md` path — is fixed by **rejecting non-markdown kinds at `add` time**, not by composing paths for them:

- `composeAddArtifactPath` is **markdown-only**: for `kind === 'markdown'` it composes `lane.scaffoldDefaults['markdown']` (fail-loud if absent) + `layoutToContentRelativePath(layout, slug)` (layouts `index`/`readme`/`flat`; default **`index`** → `<slug>/index.md`; Decision #12 restored as operative); joined with a POSIX forward-slash (AUDIT-40 retained).
- For any **non-markdown** kind, `add` **fails loudly** (exit 2, pre-write, no disk mutation): *only markdown is supported right now.* No path is composed or stamped.
- Multi-kind support (html-mockup / single-file-html / image — extensions, layouts, destination) is **deferred** to whenever the materialization layer (`scaffoldBlogPost`/draft) actually creates those file types. It is NOT in scope for the sites→lanes retirement. The `ArtifactKind` type/schema (owned by graphical-entries) is untouched; only the `add` verb gates to markdown.

This dissolves the downstream findings the kind-aware attempt spawned: **AUDIT-42** (the `--artifact-path` image flag — removed; image rejected), **AUDIT-44** (per-kind legal-layout matrix — moot; markdown's three layouts are all legal), **AUDIT-46** (verbatim image-path normalization — moot; no image path), **AUDIT-47** (non-markdown stamp vs. markdown-only materializer divergence — moot; non-markdown entries can't be created), **AUDIT-48** (HIGH source change mis-shaped as a non-bug task — moot; the flag is gone).

### AUDIT-40 (medium) — compose with forward slashes, not `node:path.join`

`artifactPath` is persisted and string-compared against the POSIX-separated paths the rest of the system stores. `node:path.join` yields `\`-separated paths on Windows, so the composer must join with an explicit forward slash (`node:path/posix.join` or a single-slash template), matching how the relative-path helper already hardcodes `/`.

### AUDIT-37 (medium) — scope the "zero behavior change" claim + migrate custom `blogFilenameTemplate`

"Zero change" holds only for adopters who left `blogFilenameTemplate` at its `{slug}/index.md` default (claim scoped inline above). For a **customized** template, the migration (`doctor --fix`, 39b/39e) maps it to a layout and fails loudly when it cannot:

| legacy `blogFilenameTemplate` | maps to |
|---|---|
| `{slug}/index.md` | layout `index` (markdown) |
| `{slug}/README.md` | layout `readme` |
| `{slug}.md` | layout `flat` |
| anything else | **migration halts** with an actionable error — the operator sets `scaffoldDefaults` + layout (or an explicit per-entry `artifactPath`) by hand |

This prevents a silent layout regression for custom-template adopters.

### AUDIT-35 (medium) — `shortform-start` is a create-verb, not an act-on-existing verb

Moved to the create-verb bucket (above). A shortform draft is a NEW file in the parent entry's scrapbook. Its destination is composed from the **parent entry's `artifactPath` directory** (via `resolveStoredArtifactPath` → the entry dir) + `scrapbook/shortform/<platform>[-<channel>].md` — replacing `resolveShortformFilePath`'s old `findEntryFile`/`contentDir` search. The shortform branches of `approve`/`iterate` resolve the same way.

### AUDIT-36 (medium) — `rename-slug` derives the new path by layout detection

`rename-slug` keeps a slug→path dependency. The new path is derived: **detect the layout from the stored `artifactPath` shape** (`…/<slug>/index.<ext>` → `index`; `…/<slug>/README.<ext>` → `readme`; `…/<slug>.<ext>` → `flat`), then recompose `composeRelativePath(kind, detectedLayout, newSlug)` against the same base directory; move the file; rewrite `artifactPath`. No naive slug-substring replacement (fragile when the slug appears elsewhere in the path).

### AUDIT-38 (low) — canonical consumer roster

The "11 callers" count was imprecise. The authoritative roster of `resolveSite`/`siteConfig`/slug-template consumers to migrate before the terminal deletion:

- **CLI command files (10):** `add`, `ingest`, `publish`, `block`, `cancel`, `approve` (longform + shortform call sites), `distribute`, `induct`, `shortform-start`, `iterate` (longform + shortform call sites). (12 `resolveSite` call sites across these 10 files.)
- **Core modules (2):** `packages/core/src/scaffold.ts` (`resolveSite` + `resolveBlogFilePath`), `packages/core/src/rename-slug.ts` (`resolveBlogPostDir` + slug-template). **`rename-slug` has NO CLI command** (AUDIT-43) — it is a core helper invoked by the studio route handler; its migration touches `rename-slug.ts`, not a `commands/` file. The earlier prose calling it a "verb peer" means *resolution-pattern peer*, not *CLI command*.

The terminal-deletion step's completion check is: zero `resolveSite`/`siteConfig`/`resolveContentDir`/`resolveBlogFilePath`/`resolveBlogPostDir`/`resolveEntryFilePath`/`resolveShortformFilePath` references remain outside the 39b migration reader.

### AUDIT-42 (HIGH) — MOOT after the markdown-only correction

The `--artifact-path` image flag was part of the (now-reverted) kind-aware attempt. With `add` markdown-only and `image` rejected, there is no image path to source — the flag is removed. See the AUDIT-39 correction above.

### AUDIT-44 (medium) — MOOT after the markdown-only correction

The per-kind legal-layout matrix was part of the (now-reverted) kind-aware attempt. Markdown's three layouts (`index`/`readme`/`flat`) are all legal; there is no other kind to constrain. See the AUDIT-39 correction above.

### AUDIT-45 (low) — MOOT after the markdown-only correction

This finding flagged that Decision #12 (global `index` default) wasn't marked superseded by the (kind-aware) #16. With the kind-aware attempt reverted, **#12 is restored as operative** and #16 is struck — so the `DEFAULT_SCAFFOLD_LAYOUT` docblock correctly cites #12 again. No drift remains.

## 39c-2b(c5) terminal-deletion design pass (2026-06-04)

The terminal deletion of `resolveSite` / `siteConfig` / `resolveContentDir` / `config.sites` / `SiteConfig` was blocked by three entangled surfaces the earlier passes mapped but did not resolve: the studio content **browser** (c5 headline), the review-workflow **`site` keying** (c3), and **`rename-slug` redirects** (c4). This section resolves all three so the deletion can land. The doctor's orphan/duplicate detection is **already migrated** (`doctor/runner.ts` builds `ctx.index` via `buildContentIndexFromSidecars`, which unions sidecar `artifactPath` directories with `collectLaneScaffoldDirs`); it is NOT part of this gap.

### c5 — Studio content browser enumeration

The studio content browser (`/dev/content`, `/dev/content/:site`, `/dev/content/:site/:project`) renders a **hierarchical** tree via `buildContentTree` → `defaultFsWalk`, today rooted at `resolveContentDir(projectRoot, config, site)` = `config.sites[site].contentDir`. A flat sidecar index (the doctor's `buildContentIndexFromSidecars`) cannot reproduce a hierarchy that includes empty organizational container directories and untracked subdirectories.

**Decision (operator, 2026-06-04): re-root the existing recursive walk at the union of lane `scaffoldDefaults` directories** (chosen over a sidecar-index projection and a calendar-only projection). `defaultFsWalk` keeps its recursive filesystem walk — so organizational/untracked nodes, orphan files, and ghost nodes (calendar entries with no fs dir) all stay visible in the browser — but its root set becomes `⋃ lane.scaffoldDefaults[*]` across all configured lanes instead of a single per-site `contentDir`.

This reuses the **same scaffoldDefaults-as-discovery-root pattern the doctor already ships** (`collectLaneScaffoldDirs`), so it introduces no new "location-as-key" coupling: `scaffoldDefaults` remains a convenience/discovery field per Decision #5, never per-entry resolution (which stays `entry.artifactPath` only). The only behavior lost vs. today is visibility of content created **outside** any lane scaffold root — an edge case the sidecar index already does not cover, and one an operator resolves by adding the directory to a lane's `scaffoldDefaults` or tracking the entry.

**Mechanics:**
- New core helper `collectContentRoots(projectRoot)` (or extend `content-tree`'s input) returns the de-duplicated union of every lane's `scaffoldDefaults` values, resolved to absolute paths.
- `buildContentTree` and `defaultFsWalk` drop their `site` parameter and `config`-derived `contentDir`; they walk each root in `collectContentRoots(...)` and merge the results into one tree. The `byPath`/path-hint base becomes projectRoot-relative (matching `entry.artifactPath`'s base, consistent with `buildContentIndexFromSidecars`).
- The 3 studio routes drop the `:site` path segment dependency for enumeration. Route shape change: `/dev/content/:site/...` collapses to `/dev/content/:project{.+}` (single project, single tree). The per-site overview and top-level overview merge into one page.
- Display-only `resolveContentDir` callers (`content.ts:495` path hints, `content-detail.ts:224` organizational-README lookup, the scrapbook-dir fallbacks in `scrapbook/paths.ts`, `content-detail.ts:146`, `review-scrapbook-drawer.ts:67`) re-base on the owning content root from `collectContentRoots(...)` (the root that contains the node's path) rather than `config.sites[site].contentDir`.
- `ingest`'s scrapbook-skip root (`ingest.ts:130`) walks/excludes a `scrapbook` dir under each content root rather than under a single `contentDir`.

### c3 — Review-workflow keying (`workflow.site`)

Persisted review workflows carry `site: string` (`review/pipeline.ts`), used to (a) validate `site in config.sites`, (b) key/dedup workflows by `(site, slug)`, and (c) bucket the review report by site (`report.ts` `bySite`). Under entry-owns-location there are no sites to validate against and `(site, slug)` is no longer a stable key.

**Decision: workflows key on the entry, not `(site, slug)`.** Resolution:
- The `site in config.sites` validation in `start-handlers.ts` / `handlers.ts` is **removed** (no sites to check). An unknown/absent entry is surfaced via the existing entry-lookup `404`, not a site-membership check.
- Workflow identity/dedup keys on the entry's **`id`** (the `entryId` lookup path already exists — `render.ts:75`). The `(site, slug)` match expressions (`pipeline.ts:147`, `start-handlers.ts:92,227`) switch to `entryId` equality; `slug` stays as a human label, not a key.
- `workflow.site` is **re-homed to `workflow.lane`** (derived from the entry's `lane`) for the report breakdown (`report.ts` `bySite` → `byLane`), matching the per-lane dashboards graphical-entries already shipped. Persisted legacy workflows carrying `site` are read tolerantly (the field is ignored for resolution; the lane is derived from the entry) — consistent with §"Tolerated reads."
- This is forced by the model (no fork): removing `sites` leaves no site axis, and the entry is the only stable identity. The lane is the natural successor to `site` for *grouping* (not resolution).

### c4 — `rename-slug` redirects (`redirectsPath`)

`rename-slug.ts` appends a 301 redirect block to a site's Netlify-style `_redirects` file, sourced from `SiteConfig.redirectsPath` via the `siteEntry(config, site)` helper. `redirectsPath` is **website-publishing metadata** — it only matters when the collection is published as a website, exactly the class of field Decision #2 moved (`host`).

**Decision: `redirectsPath` re-homes onto the lane**, an optional sibling of `lane.host` (`LaneConfig.redirectsPath?: string`). Resolution:
- `rename-slug` resolves the renamed entry's **lane**, reads `lane.redirectsPath`, and appends the 301 block there. When the lane has no `redirectsPath`, the redirect-append step is skipped (already the unset behavior).
- The `siteEntry(config, site)` helper + its `site in config.sites` guard are deleted with `sites`.
- The migration (39b/39e) carries each legacy `site.redirectsPath` onto the lane created from that site, alongside `host` (Decision #2 / Migration step 1).
- Mirrors Decision #2 (publish-target metadata belongs on the lane that publishes); spec-derived, no fork.

### Terminal-deletion completion check (updated)

After c5/c3/c4 land, zero references to `resolveSite` / `siteConfig` / `resolveContentDir` / `config.sites` / `SiteConfig` / `siteEntry` / `redirectsPath`-on-SiteConfig remain outside the 39b migration reader (`legacy-config.ts`). The AUDIT-38 roster is extended with: `review/{pipeline,handlers,start-handlers,report,render}.ts` (c3), `rename-slug.ts` `siteEntry`/`redirectsPath` (c4), and `content-tree.ts` / `content-tree-fs-walk.ts` / studio `pages/content*.ts` (c5).

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | Full sites retirement (not coexistence) | Pre-1.0; sites is legacy-being-migrated; lanes subsume its core role. |
| 2 | `host` → optional field on the lane | A lane binds a content tree; a website renders from a content tree; host is where that tree publishes. |
| 3 | Location is NOT the lane's primary key | Operator: uncomfortable with location identifying a lane; content can be on different filesystems. |
| 4 | Entry owns its `artifactPath` (authoritative, anywhere) | Phase-30 sidecar-SSOT applied consistently; dissolves #394 + findings 03/04/05. |
| 5 | Lane keeps optional `scaffoldDefaults` only | Convenience for `add`-time scaffolding; never identity or resolution. |
| 6 | One artifact per entry (+ scrapbook) | Multiple locations = multiple entries, not one entry spanning files. |
| 7 | `scaffoldDefaults` keyed by `artifactKind` | Matches the site-content vs PRD/workplan-dir example. |
| 8 | Retire per-site `calendarPath`; calendar is a single derived projection | Entry-centric model already derives the calendar; per-site files were the other half of #394. |
| 9 | Migration = `doctor --fix` clean cutover | Pre-1.0 decisive cutover; adopters run doctor once. |
| 10 | Drop the in-flight `#394` search-all-sites fix | Wrong layer; superseded by entry-owns-path resolution. |
| 11 | `add`-time destination = `scaffoldDefaults[K]` dir + separate layout (Option 1) | Smallest change; preserves all 3 layouts; default `index` = today's behavior (zero-change cutover). Operator 2026-06-03. |
| 12 | Default layout = `index` (`<slug>/index.md`) — OPERATIVE (the #16 supersession was reverted with the kind-aware attempt) | Least surprise; markdown is the only supported kind, so a single global default is correct. |
| 13 | Missing `scaffoldDefaults[K]` fails loudly (no silent fallback) | Per the no-fallbacks rule; an undefined scaffold dir is an actionable error, not a guess. |
| 14 | CLI verbs on existing entries resolve via `entry.artifactPath` only | Extends 39d's flip to the verb path; eliminates the last slug+stage search before `sites` can be deleted. |
| 15 | ~~Path composition is kind-aware~~ **REVERTED** — `add` is markdown-only; non-markdown kinds rejected | Operator 2026-06-03: only markdown is supported; multi-kind add was premature (materializer is markdown-only). |
| 16 | ~~Default layout is per-kind~~ **REVERTED** (see #12, restored) | Reverted with the kind-aware attempt. |
| 17 | ~~`image` requires `--artifact-path`~~ **REVERTED** — `image` rejected by `add` | Reverted with the kind-aware attempt; `add` is markdown-only. |
| 18 | `artifactPath` composed with forward-slash join, never `node:path.join` | AUDIT-40: persisted path must be POSIX-separated for cross-OS string-equality. |
| 19 | Custom `blogFilenameTemplate` migrates to a layout; unmappable shapes halt the migration | AUDIT-37: prevents a silent layout regression for custom-template adopters. |
| 20 | `shortform-start` (+ shortform approve/iterate) is a create-verb composing from the parent entry's `artifactPath` dir; `rename-slug` derives the new path by layout detection | AUDIT-35/36: both were under-mapped by the two-bucket split. |
| 21 | Studio content browser re-roots `defaultFsWalk` at the union of lane `scaffoldDefaults` dirs (not a sidecar-index or calendar-only projection) | Operator 2026-06-04. Behavior-preserving (hierarchy + orphan/organizational visibility retained); reuses the doctor's `collectLaneScaffoldDirs` discovery pattern, so no new location-as-key (Decision #5 holds). |
| 22 | Review workflows key on `entry.id`, not `(site, slug)`; `site` validation drops; `workflow.site` → `workflow.lane` for report breakdowns | Forced by the model: no `sites` axis remains; the entry is the only stable identity; lane is the grouping successor (matches graphical-entries per-lane dashboards). |
| 23 | `redirectsPath` re-homes from `SiteConfig` onto `LaneConfig` (optional), alongside `host` | Mirrors Decision #2 — publish-target metadata belongs on the lane that publishes; migration carries legacy `site.redirectsPath` onto the lane. |

## The paused release (§9 cross-ref)

The in-flight `#394` fix on `feature/deskwork-plugin` ("search every configured site's contentDir / calendarPath") is the **wrong layer** under this design and is **dropped, not shipped**. The doctor multi-site false-positive remains a known limitation until this retirement lands. The v0.34.1 release that was being reconciled either ships only the other in-flight work or is skipped; the implementation plan resolves that. The `#396` audit-barrage renderer fix is moot (main already shipped an equivalent in v0.34.0); my duplicate is dropped in the reconcile.

**Inherited calendar-surface cluster (#223 / #234 / #357).** These three were deferred (Phase 38) to `feature/graphical-entries` (#301) on the rationale that lanes would generalize the per-site-`calendarPath`-vs-entry-centric surface question. #301 **merged into main as v0.34.0** (`386df7dd`) **without resolving them** — and it re-introduced location-as-key as `lane.contentDir`. So ownership now falls to this retirement: §"Calendar" (single project-level `.deskwork/calendar.md`, de-parameterized `resolveCalendarPath` / `regenerateCalendar` / `calendar-sidecar` rule) is precisely the fix for #234 (divergence) and #357 (read-side validator), and 39c absorbs #223 (regen flip-flop). The three issues should be re-pointed at Phase 39 (39c), not left pointing at the merged-but-unresolved #301.

## Scope / decomposition

This is a single coherent feature (one config-model change with its migration). It does NOT need decomposition into sub-projects, but the implementation plan will phase it: (a) lane schema gains `host` + `scaffoldDefaults`, entry `artifactPath` becomes authoritative; (b) doctor migration rule + backfiller; (c) retire `sites` from config/loader/paths/install/studio/calendar; (d) drop the `#394` search code; (e) tests + adopter migration walkthrough.

## Out of scope

- Reworking the pipeline-template or stage-vocabulary model (lanes' `pipelineTemplate` is unchanged).
- Studio visual redesign of per-lane dashboards (already shipped in graphical-entries).
- Any new website-URL-generation feature (host is captured for when that is built; not built here).
