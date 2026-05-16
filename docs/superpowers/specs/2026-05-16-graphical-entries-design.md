---
title: Graphical entries — design spec
slug: graphical-entries
date: 2026-05-16
status: draft
deskwork:
  doc: design-spec
  id: 2dbe2326-f237-4c23-8451-16f9257ae8fc
---

# Graphical entries — design

## Problem

Deskwork manages first-class workflow objects for markdown content. Two related capabilities are missing:

1. **Graphical content has no first-class place in the lifecycle.** HTML/CSS/JS mockups, screenshots, and image files come up regularly in real use — design proposals, dogfood screenshots, audit captures, UI prototypes — and have no way to flow through Ideas → Drafting → Published with the same iterate/approve/cancel verbs as markdown entries. Today they sit as scrapbook sidecars or `docs/studio-design/` artifacts, reviewed informally and never tracked in the calendar.

2. **A project has exactly one global pipeline.** Every entry in a deskwork project shares the same eight stages. In practice projects do several *kinds* of work — feature documentation, blog posts, mockups, QA plans, internal notes — each with different lifecycle rhythms. Forcing them through a single editorial-shaped pipeline is awkward (mockups don't outline; QA plans don't publish). Operators end up either bending the canonical pipeline or skipping deskwork entirely for non-editorial work.

The two problems are entangled: graphical entries need their own pipeline shape (no "Outlining"; "Shipped" as terminal, not "Published"), and the project-wide single-pipeline assumption is what blocks them.

## Goals

- Treat graphical content (HTML/CSS/JS mockups, screenshots, image files) as first-class entries: own UUID, frontmatter, currentStage, dashboard row, review surface.
- Generalize the project's pipeline model so a project can host **multiple lanes**, each bound to a **pipeline template** that names its own stages.
- Add a **group** primitive so multiple entries (across lanes) can move through a coordinated lifecycle as a unit while retaining their individual lifecycles.
- Preserve the canonical pipeline *shape* (linear forward + cul-de-sac off-pipeline + universal iterate/approve/cancel verbs); only stage names and lengths vary per template.
- Migrate every existing entry into the new model with zero data loss and no operator action required.

## Non-goals (explicitly out of scope)

- **Recursive groups** (a group inside a group). YAGNI until a concrete use surfaces.
- **Custom per-stage gate logic.** Stage transitions stay as defined by the template; no project-specific hooks beyond locked-stages and induct destinations.
- **Iterate on binary images.** PNG/JPG entries have no agent-editable representation; iterate is refused. Approve / cancel / induct only.
- **Additional artifact kinds (video, audio, PDF, executable code).** v1 ships `markdown`, `html-mockup`, `single-file-html`, `image`. Additional kinds wait for a concrete use case to surface their lifecycle and review-surface needs.
- **Per-stage custom skills.** The universal verbs (`iterate`, `approve`, `cancel`, `induct`) cover every stage in every template; new verbs are not introduced.
- **CI test infrastructure.** Per the deskwork rule *"No test infrastructure in CI."* Local vitest only.

## Approach

### Pipeline templates

A **pipeline template** is a JSON document that defines the stage shape of one kind of work.

```ts
type PipelineTemplate = {
  id: string;                  // e.g. "editorial" | "visual" | "qa-plan"
  name: string;                // human-readable label
  description: string;
  linearStages: string[];      // ordered; length ≥ 1; last element is terminal (published semantics)
  lockedStages?: string[];     // subset of linearStages where iterate is refused (frozen-review gate)
  offPipelineStages: string[]; // cul-de-sacs (e.g. ["Blocked","Cancelled"] or ["Blocked","Cancelled","Archived"])
}
```

Invariants:
- The **last element** of `linearStages` is the **terminal stage**. Terminal stage carries published semantics: immutable, public commit, version assigned per `DESKWORK-STATE-MACHINE.md` § Versions and revisions.
- `lockedStages` defines stages where content edits and iterate are refused (the "Final"-style content-lock gate). Approve and induct still work. Templates omit if their workflow doesn't need a pre-terminal lock.
- `offPipelineStages` defines all reachable cul-de-sacs. `Cancelled` is a reserved name (the cancel verb always lands on a stage named `Cancelled` if one exists in `offPipelineStages`; otherwise cancel refuses with a configuration error).
- Verb semantics (iterate / approve / cancel / induct) are universal across templates and gated only on stage position within the template's linear list. `approve` advances to next linearStage. `iterate` works on any non-terminal, non-locked linear stage. `cancel` moves to the `Cancelled` off-pipeline stage. `induct` re-enters the pipeline at an operator-chosen linear stage.

Default templates ship in plugin defaults; operators override per-project via `/deskwork:customize pipeline <id>` (existing customize skill machinery). Plugin defaults live at `packages/core/src/pipelines/<id>.json`; project overrides at `<projectRoot>/.deskwork/pipelines/<id>.json`. The override resolver (already in `packages/core/src/overrides.ts` per the THESIS Consequence 3 infrastructure) picks the project file when present and falls back to the plugin default.

### Default templates shipped in v1

Five templates ship as plugin defaults:

| Template `id` | linearStages | lockedStages | offPipelineStages |
|---|---|---|---|
| `editorial` | `["Ideas","Planned","Outlining","Drafting","Final","Published"]` | `["Final"]` | `["Blocked","Cancelled"]` |
| `visual` | `["Sketched","Iterating","Approved","Shipped"]` | `["Approved"]` | `["Blocked","Cancelled","Archived"]` |
| `feature-doc` | `["Defined","Drafting","Approved","Implemented","Complete"]` | `["Approved","Implemented"]` | `["Blocked","Cancelled"]` |
| `qa-plan` | `["Drafted","Reviewed","Tested","Approved"]` | `["Reviewed"]` | `["Blocked","Cancelled","Archived"]` |
| `blog-post` | `["Idea","Drafting","Edited","Published"]` | `["Edited"]` | `["Blocked","Cancelled"]` |

Each template ships with comment headers in its JSON file documenting the lifecycle rationale so operators authoring custom templates have working exemplars. The `editorial` template's stage names match the legacy single-pipeline names exactly — this is what backs the migration of pre-feature entries (see § Migration).

### Lanes

A **lane** binds a pipeline template to a partition of entries within a project. Each project has one or more lanes; each entry belongs to exactly one lane.

```ts
type LaneConfig = {
  id: string;              // e.g. "default" | "mockups" | "qa"
  name: string;            // human-readable label
  pipelineTemplate: string; // id of a PipelineTemplate
  contentDir: string;      // root of this lane's content tree (per-lane content roots)
}
```

Lane configs live at `<projectRoot>/.deskwork/lanes/<lane-id>.json`. Projects ship a `default` lane (template = `editorial`, contentDir = the legacy `sites.<site>.contentDir`) at install time so the upgrade is invisible to existing projects.

Entry schema adds `lane: string` (required; resolves to the entry's lane ID). `currentStage` is now any string drawn from the lane's template (linearStages ∪ offPipelineStages). Doctor validates the relationship and surfaces stale-stage / wrong-lane / missing-template errors.

### Groups

A **group** is itself an entry — same schema, same UUID, same dashboard row, same review surface — that has the additional property `members: string[]` (an array of member entry UUIDs).

- The group entry has its own `lane`, `currentStage`, frontmatter, iterate/approve/cancel verbs. It moves through a pipeline independently of its members.
- Members can span lanes — `mobile-first redesign v.X` (group entry, in some "design-initiative" lane) can have members in `mockups`, `feature-doc`, and `blog-post` lanes.
- Approve on a group **does not propagate** to members. Approving a group advances the group's own stage; member stages are untouched. The group's currentStage is an *assertion about the coordinated unit* (e.g. "the mobile-first redesign initiative is approved"), not a batch mutation of members. Members iterate/approve independently and may legitimately be in different stages while the group is at `Approved`.
- Recursive groups (a group as a member of another group) are refused in v1.

The `members` field is the only schema delta for groups. Everything else — verbs, journals, calendar rendering, doctor — uses the same code paths as non-group entries; the studio merely renders an additional "Members" section on a group's review surface listing the member entries with their current stages and clipboard-copy links to their review surfaces.

### Graphical entries

Graphical entries are entries whose primary artifact is non-markdown. Three artifact shapes are supported in v1:

| Shape | Layout | iterate? | Marginalia format |
|---|---|---|---|
| **HTML mockup** | Directory `<slug>/` with `index.html` + sibling assets (`*.css`, `*.js`, `*.png`, etc.) | Yes — agent edits HTML/CSS/JS to address marginalia | DOM-selector + x/y offset (resilient to small layout changes) + ranged-text fallback when comment references visible text |
| **Single-file HTML** | `<slug>.html` with inline styles/scripts | Yes — same as above | Same as above |
| **Image (PNG/JPG/SVG)** | `<slug>.png` (or .jpg/.svg) | No — refused; image is frozen-on-create | Pixel coordinates only |

The studio's existing review surface gains a "graphical" mode that activates when an entry's artifact is one of the above shapes. The review surface renders the artifact in an iframe (HTML cases) or `<img>` (image cases) inside a wrapper that captures clicks for marginalia pin placement. The verb chrome (Iterate / Approve / Cancel buttons) is identical to the markdown review surface and continues to clipboard-copy `/deskwork:<verb> <slug>` per THESIS Consequence 2 — the studio never mutates sidecar state from button clicks.

For HTML mockups, iterate reads each marginalia anchor (DOM selector + offset + comment text), resolves it against the live DOM, identifies the most plausible element, and edits the HTML/CSS/JS to address the comment — same skill prose pattern as markdown iterate, just operating on different file types.

For image entries, iterate is refused at the CLI level with `image entries cannot be iterated — they are frozen on create; use /deskwork:cancel or /deskwork:induct to backward-step`.

### Studio rendering

- **Per-lane dashboards.** The studio dashboard surfaces a tab strip (one tab per lane) plus a "Combined" overview tab. Tab order is lane-config order. Empty lanes still render their tab + an empty state so operators see the pipeline shape.
- **Per-lane stage columns.** Each lane's dashboard shows columns for that lane's `linearStages` (in order) plus a separate "Off-pipeline" section listing entries in `offPipelineStages`. The stage labels are the template's stage names — no hardcoded "Drafting" / "Published" anywhere in studio render code.
- **Group rendering.** A group entry's row in its lane dashboard shows the member count as a badge. The group's review surface adds a "Members" section listing each member's lane, stage, and a clipboard-copy link to its review surface. The member entries' own rows show a "Member of: <group slug>" badge for navigability.
- **Graphical review surface.** Renders artifact-in-iframe (HTML) or `<img>` (image) with marginalia overlay. Otherwise identical chrome to the markdown review surface.

### Verb semantics across templates

| Verb | Behavior | Stage gate |
|---|---|---|
| `iterate` | Agent reads marginalia, edits artifact to address each comment, bumps revision counter | Any non-terminal, non-locked, non-off-pipeline linear stage. Image entries refuse unconditionally. |
| `approve` | Advances `currentStage` to next element of `linearStages`. At terminal stage, assigns a new version per § Versions and revisions in `DESKWORK-STATE-MACHINE.md`. | Any linear stage with a next-stage (i.e. not the terminal). Terminal stage refuses with "Already at terminal; induct backward to revise." |
| `cancel` | Moves `currentStage` to `Cancelled` (must exist in `offPipelineStages`). | Any stage except `Cancelled` itself. |
| `induct` | Moves `currentStage` from an off-pipeline stage back to an operator-chosen linear stage. Also: backward-induct from `Final` (or any locked stage) to a non-locked linear stage to unlock for editing. | From: any off-pipeline stage OR any locked stage. To: any linear stage. |

The verbs are universal across templates. The studio's per-row clipboard-copy buttons surface them identically; per THESIS Consequence 2 the studio never mutates sidecar state from a button click — operator pastes the slash command, agent runs the skill.

## Data model summary

### Entry schema delta

```ts
type EntrySidecar = {
  // unchanged
  uuid: string;
  slug: string;
  title: string;
  artifactPath: string;
  currentStage: string;         // now a string drawn from the lane's template, not a global enum
  iterationByStage: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  // new
  lane: string;                 // lane id
  members?: string[];           // group only: array of member entry UUIDs
  artifactKind: 'markdown' | 'html-mockup' | 'single-file-html' | 'image';  // explicit; doctor verifies against artifactPath
}
```

### New on-disk files

```
<projectRoot>/.deskwork/
├── lanes/
│   ├── default.json           # shipped by install for back-compat
│   ├── mockups.json           # operator-authored or copied from template
│   └── ...
├── pipelines/                 # operator overrides; falls back to plugin defaults
│   ├── editorial.json
│   ├── visual.json
│   └── ...
```

Plugin-shipped defaults at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`. Lane configs are project-owned by design — every project gets a `default` lane on install and authors additional lanes per their needs.

## Migration

Existing projects upgrade without operator intervention:

1. **Install / doctor migration.** On first invocation under the new model, `deskwork doctor --apply` (or any verb that triggers sidecar revalidation) auto-creates `.deskwork/lanes/default.json` bound to the `editorial` template, with `contentDir` set from the project's legacy `sites.<defaultSite>.contentDir`.
2. **Entry sidecar back-fill.** Every existing sidecar gets `lane: "default"` written. `currentStage` values are already drawn from the editorial template's stage list (the names match exactly), so no stage rename is needed. `artifactKind` is derived from the file extension and back-filled to the sidecar.
3. **Calendar regen.** The calendar's existing single-pipeline rendering becomes the default lane's rendering. Multi-lane projects render a per-lane section per the new studio shape. The pre-existing #247 calendar-regen bug is unblocked by this work — the new calendar rendering reads the lane's template instead of a hardcoded stage list.
4. **No data loss.** Every entry persists with all existing frontmatter, scrapbook content, marginalia, journal events. Only additions: `lane`, `artifactKind`.

## Studio implications

- **Review surface routing.** The existing route `/dev/editorial-review/entry/<uuid>` continues to work; the surface conditionally renders the markdown editor vs the graphical viewer based on the entry's `artifactKind`.
- **Dashboard.** New tab strip (one tab per lane + Combined). Each tab's body is the per-lane dashboard. Combined surface aggregates rows from all lanes with a lane-badge per row.
- **Per-stage columns** are template-aware. Studio renders the union of every lane's `linearStages ∪ offPipelineStages` as the possible stage values for filtering / search, but per-tab the columns are the active lane's template only.
- **Group review surface.** Group entries get a "Members" panel listing each member with its lane, current stage, and a navigation link to its own review surface. Members get a small "Member of: <group>" badge with a back-link.
- **Graphical review surface.** Iframe (HTML) or `<img>` (image) inside a marginalia-overlay wrapper. The verb chrome (Iterate / Approve / Cancel) is shared with the markdown surface.
- **No state-machine surfacing.** Per Commandment III (`DESKWORK-STATE-MACHINE.md` § review state is retired), no surface renders "review state" labels. Only stage labels (from the lane's template) appear.

## Doctor rules

New rules:

- **lane-config-missing-template.** Lane config references a `pipelineTemplate` id that doesn't resolve. Surfaces error with the lane file path.
- **entry-lane-not-found.** Entry sidecar has a `lane` value that doesn't resolve to any lane config. Repair: prompts for the correct lane or migrates to `default`.
- **entry-stage-not-in-template.** Entry's `currentStage` isn't in the lane's template stages (linear or off-pipeline). Repair: prompts for a valid stage from the lane's template.
- **group-recursive.** A group has a member whose `members` array is non-empty (recursive groups refused in v1). Repair: prompts to flatten or unbind.
- **group-member-missing.** A group references a member UUID that doesn't resolve. Repair: prompts to remove the dangling reference.
- **artifact-kind-mismatch.** Entry's `artifactKind` doesn't match the file extension at `artifactPath`. Repair: prompts to correct.
- **image-locked-stage.** An image entry is in a `lockedStages` stage but has been iterated since reaching it (iterate should refuse on images; this rule catches drift). Repair: surfaces the iterate journal entries for manual review.

## Skill changes

- **New skill `/deskwork:lane`** (composite: `lane list`, `lane create`, `lane show <id>`) — operator-facing lane management.
- **New skill `/deskwork:group`** (composite: `group create`, `group add-member <group> <entry>`, `group remove-member <group> <entry>`) — group management.
- **Updated skill `/deskwork:add`** — accepts `--lane <id>` and `--kind <markdown|html-mockup|single-file-html|image>` flags.
- **Updated skill `/deskwork:ingest`** — accepts `--lane <id>` (defaults to `default`); auto-detects `artifactKind` from file extension.
- **Updated skill `/deskwork:iterate`** — refuses on image entries with the specific error message.
- **Existing skills `/deskwork:approve`, `/deskwork:cancel`, `/deskwork:induct`** — unchanged in operator-facing semantics; internal stage-list reads now go through the lane's template.

## Testing

- **Unit (vitest).** Template loader (plugin defaults + project overrides), stage-validity checker, verb gate logic per template, group member validation, artifact-kind detection. Full coverage of the five default templates.
- **Integration (vitest with tmp fixtures).** Multi-lane project end-to-end: install → add entries in two lanes → iterate / approve / cancel each → group two entries across lanes → approve the group → verify lane independence + group independence. Migration test: pre-feature single-pipeline project → run doctor → confirm `default` lane created, every entry has `lane: default` + correct `artifactKind`.
- **Studio render tests.** Per-lane dashboard renders the right columns; group dashboard row shows member badge; graphical review surface renders iframe + marginalia overlay.
- **No CI changes.** Local `npm --workspace @deskwork/core test` and `npm --workspace @deskwork/studio test`.

## Risks

- **Schema migration on adopter projects.** Existing adopters' sidecars get auto-back-filled with `lane: default` and `artifactKind`. Migration runs on first invocation under the new CLI. A bad migration could clobber sidecars. Mitigation: doctor's `--apply` writes sidecars atomically (tmp + rename), and the migration runs in `--dry-run` first with operator review per the existing ingest pattern.
- **Studio render complexity.** Per-lane tabs + per-template stage columns + graphical surface + group surface is a lot of new render code. Mitigation: ship template-aware rendering before graphical surface, validate against the migration baseline, then add graphical. Phased implementation (see § Tasks).
- **Marginalia anchor resilience on HTML mockups.** A DOM-selector-based anchor can drift if the operator hand-edits the HTML. Mitigation: anchor records both a selector and a text snippet + pixel offset. The studio's resolver tries selector first, then text-snippet match, then pixel coordinates as last resort. Doctor surfaces unresolved anchors as warnings.
- **Five default templates risks bikeshedding.** Operators may have opinions about whether `feature-doc` should have `Reviewed` or `Implemented` as its terminal. Mitigation: ship reasonable defaults; the customize seam is the answer to "I want different stages" — not "let's debate the defaults forever."
- **Group cross-lane semantics on doctor.** Doctor needs to follow member UUIDs across lanes to validate. This is a small lookup-cost concern, not a correctness one. Mitigation: doctor builds an index of UUID → lane lookups once per run.

## Tasks (high-level)

The implementation decomposes into ~6 phases. Setup will scaffold a workplan from these. Numbers are approximate phase sizes, not commitments.

1. **Pipeline template loader + plugin defaults + override resolver.** Load JSON; validate schema; merge plugin-default + project-override per the THESIS Consequence 3 pattern. Ship five default templates. Unit tests.
2. **Lane data model + config loader + entry schema delta.** New `.deskwork/lanes/<id>.json` files; entry sidecar gains `lane` + `artifactKind`. Doctor migration creates `default` lane and back-fills entries on first run. Unit tests.
3. **Verb refactor: stage-list reads go through lane template.** `approve`, `iterate`, `cancel`, `induct` all currently read a hardcoded stage list; refactor to consult the entry's lane template. Image-entry iterate refusal lands here. Existing skill behavior preserved when the lane is `default`. Unit tests.
4. **Studio render: per-lane tabs + per-template stage columns + combined overview.** New tab strip; per-tab dashboards; template-aware column rendering. No graphical surface yet (still markdown-only). Integration test against multi-lane fixture.
5. **Groups: members field + group review surface + add-member / remove-member skills.** Cross-lane membership; no propagation on approve; doctor rule for recursion + dangling members. Unit + integration tests.
6. **Graphical entries: graphical review surface + marginalia overlay + HTML iterate skill prose update.** Iframe / `<img>` rendering; coordinate-pinned marginalia; iterate against HTML mockups (skill prose update + agent guidance). Integration test against a fixture mockup. Manual dogfood: ingest one of the project's existing `docs/studio-design/` mockups as a `visual`-lane entry, iterate it, approve it.

## Open questions

None blocking. The five default templates' specific stage names are best-guess; operator iteration via deskwork will surface refinements before the spec is approved.

## Companion references

- `THESIS.md` — agent-as-primary-tool; studio is routing surface; defaults + override seam (Consequences 1-3).
- `DESKWORK-STATE-MACHINE.md` — the canonical shape this feature generalizes (eight stages become *one template among several*; the shape — linear + terminal + cul-de-sac + universal verbs — is preserved across all templates).
- `DESIGN-STANDARDS.md` — studio rendering conventions the graphical surface must honor.
- `packages/core/src/overrides.ts` — the existing override-resolver infrastructure pipeline templates plug into.
- Issue #247 — calendar.md regen drops Final/Cancelled entries; the regen refactor in Phase 4 fixes this as a side effect.
