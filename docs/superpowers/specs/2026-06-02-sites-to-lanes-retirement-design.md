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

**Default rationale (least surprise):** today, `add` with no flags produces `<slug>/index.md` (the `blogFilenameTemplate` default `{slug}/index.md`). Defaulting layout to `index` keeps every adopter's `add` byte-for-byte identical after the `sites` retirement.

**Retires the slug-template family.** `resolveBlogFilePath` / `resolveEntryFilePath` / `resolveShortformFilePath` / `resolveBlogPostDir` (and `blogFilenameTemplate`) currently build the full path from `siteConfig().contentDir`. They are replaced by the `scaffoldDefaults[K]` + `layoutToContentRelativePath` composition above; the `{slug}` template-substitution machinery is removed with `sites`.

**Open sub-question (captured, not blocking):** whether a lane carries an optional `defaultLayout` field, or layout stays purely a per-`add` flag with the global `index` default. The global-`index` default already satisfies the zero-behavior-change goal; a per-lane default is an additive convenience the implementation plan can decide.

## CLI-verb resolution migration (39c-2b design pass — 2026-06-03)

The 11 `resolveSite` callers split into two resolution patterns by whether the verb acts on an existing entry or creates a new one:

- **Verbs on an EXISTING entry** (publish, induct, cancel, approve, block, iterate, distribute, shortform-start, rename-slug): resolve the artifact via **`entry.artifactPath`** — extending 39d's entry-review flip to the CLI-verb path. No `contentDir`, no slug+stage search. An entry missing `artifactPath` is a `doctor --fix`-able state (39b backfills it); the verb **throws with that guidance** rather than guessing.
- **`add` (creates a NEW entry):** no `artifactPath` exists yet → compose it via the `scaffoldDefaults[K]` model above, then stamp it.
- **`ingest --apply`:** stamps `artifactPath` from the discovered on-disk file (already specced in § Surface impacts).
- **`rename-slug` note:** renaming moves the file and rewrites `entry.artifactPath` to the new location; it no longer recomputes a path from a template.

Only after every verb resolves via `entry.artifactPath` (or composes-then-stamps, for `add`) can `resolveSite` / `siteConfig` / `resolveContentDir` / `config.sites` / `SiteConfig` be deleted — the terminal step of 39c-2b.

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
| 12 | Default layout = `index` (`<slug>/index.md`) | Least surprise — matches the current `{slug}/index.md` template default. |
| 13 | Missing `scaffoldDefaults[K]` fails loudly (no silent fallback) | Per the no-fallbacks rule; an undefined scaffold dir is an actionable error, not a guess. |
| 14 | CLI verbs on existing entries resolve via `entry.artifactPath` only | Extends 39d's flip to the verb path; eliminates the last slug+stage search before `sites` can be deleted. |

## The paused release (§9 cross-ref)

The in-flight `#394` fix on `feature/deskwork-plugin` ("search every configured site's contentDir / calendarPath") is the **wrong layer** under this design and is **dropped, not shipped**. The doctor multi-site false-positive remains a known limitation until this retirement lands. The v0.34.1 release that was being reconciled either ships only the other in-flight work or is skipped; the implementation plan resolves that. The `#396` audit-barrage renderer fix is moot (main already shipped an equivalent in v0.34.0); my duplicate is dropped in the reconcile.

**Inherited calendar-surface cluster (#223 / #234 / #357).** These three were deferred (Phase 38) to `feature/graphical-entries` (#301) on the rationale that lanes would generalize the per-site-`calendarPath`-vs-entry-centric surface question. #301 **merged into main as v0.34.0** (`386df7dd`) **without resolving them** — and it re-introduced location-as-key as `lane.contentDir`. So ownership now falls to this retirement: §"Calendar" (single project-level `.deskwork/calendar.md`, de-parameterized `resolveCalendarPath` / `regenerateCalendar` / `calendar-sidecar` rule) is precisely the fix for #234 (divergence) and #357 (read-side validator), and 39c absorbs #223 (regen flip-flop). The three issues should be re-pointed at Phase 39 (39c), not left pointing at the merged-but-unresolved #301.

## Scope / decomposition

This is a single coherent feature (one config-model change with its migration). It does NOT need decomposition into sub-projects, but the implementation plan will phase it: (a) lane schema gains `host` + `scaffoldDefaults`, entry `artifactPath` becomes authoritative; (b) doctor migration rule + backfiller; (c) retire `sites` from config/loader/paths/install/studio/calendar; (d) drop the `#394` search code; (e) tests + adopter migration walkthrough.

## Out of scope

- Reworking the pipeline-template or stage-vocabulary model (lanes' `pipelineTemplate` is unchanged).
- Studio visual redesign of per-lane dashboards (already shipped in graphical-entries).
- Any new website-URL-generation feature (host is captured for when that is built; not built here).
