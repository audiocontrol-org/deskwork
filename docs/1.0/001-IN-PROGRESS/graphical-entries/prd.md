---
slug: graphical-entries
title: Graphical Entries
targetVersion: "1.0"
date: 2026-05-25
parentIssue:
deskwork:
  id: 1e85ab1a-de87-456f-be79-bb626ae42c9f
---

# PRD: Graphical Entries

## Problem Statement

Deskwork manages first-class workflow objects for markdown content. Two related capabilities are missing:

1. **Graphical content has no first-class place in the lifecycle.** HTML/CSS/JS mockups, screenshots, and image files come up regularly in real use — design proposals, dogfood screenshots, audit captures, UI prototypes — and have no way to flow through Ideas → Drafting → Published with the same iterate/approve/cancel verbs as markdown entries. Today they sit as scrapbook sidecars or `docs/studio-design/` artifacts, reviewed informally and never tracked in the calendar.

2. **A project has exactly one global pipeline.** Every entry in a deskwork project shares the same eight stages. In practice projects do several *kinds* of work — feature documentation, blog posts, mockups, QA plans, internal notes — each with different lifecycle rhythms. Forcing them through a single editorial-shaped pipeline is awkward (mockups don't outline; QA plans don't publish). Operators end up either bending the canonical pipeline or skipping deskwork entirely for non-editorial work.

The two problems are entangled: graphical entries need their own pipeline shape (no "Outlining"; "Shipped" as terminal, not "Published"), and the project-wide single-pipeline assumption is what blocks them.

## Solution

Generalize deskwork's pipeline model so a project can host **multiple lanes**, each bound to a **pipeline template** that names its own stages. Five preset templates ship as starting points (`editorial`, `visual`, `feature-doc`, `qa-plan`, `blog-post`); operators can author additional custom templates as first-class JSON files. The canonical pipeline *shape* — linear forward + cul-de-sac off-pipeline + universal `iterate` / `approve` / `cancel` / `induct` verbs — is preserved across all templates; only stage names and lengths vary.

Add a **group** primitive: a regular entry with a `members[]` field, so multiple entries across lanes can move through a coordinated lifecycle as a unit while retaining their individual lifecycles (approve on a group does not propagate to members). Add first-class **graphical entries** — three artifact kinds (`html-mockup`, `single-file-html`, `image`) — with a **chrome-free graphical review surface** that supports spatial-region comment pins, threaded replies, and screenshot capture / attachment. The annotation schema is extended once (additive `replyTo`, `attachments`, `spatialAnchor` fields) so markdown review benefits from threads + attachments as a bonus.

Existing projects upgrade with zero operator intervention: a `default` lane bound to the `editorial` preset is auto-created on first invocation, every existing entry gets `lane: "default"` and a derived `artifactKind`, and the calendar's existing single-pipeline rendering becomes the default lane's rendering. No data loss; the legacy `editorial` stage names match the legacy single-pipeline names exactly.

## Secondary deliverable: scope-discovery v1 dogfood

This feature is the canary v1 dogfood for the scope-discovery protocol (see `docs/1.0/001-IN-PROGRESS/scope-discovery/` and the in-tree `dogfood-handoff.md`). Dogfooding scope-discovery tooling is a **first-class deliverable** of this feature, not a side effect. The implementation team:

- Logs friction surfaces in `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` as they arise — categories A (anti-pattern registry), AM (adopter manifest path semantics), CL (clone detector + clones.yaml workflow), GATE (pre-commit hook chain), DSC (discovery agent over/under-broad outputs), MISC (dispatch hygiene, packaging, agent-prompt drift). Each entry follows the pilot pattern (Repro / Workaround used / Suggested fix; append-only with closing-commit SHA on close).
- Treats every commit on this feature as an exercise of scope-discovery's pre-commit hooks (clone detection, editor symmetry, anti-pattern registry). Failures land as TF entries before the failing commit goes in.
- Maintains the canary scope-inventory baseline at `scope-inventory/runs/<timestamp>/` and re-runs it at phase boundaries to validate that scope-discovery's coverage stays stable as the feature grows.
- Knows the four already-filed open friction issues (#293 `.jscpd.json` path mismatch, #294 install-scope-discovery-hooks hardcoded binary path, #295 `--gate-mode` unsupported flag, #296 anti-pattern starter-set size) and the audiocontrol-pilot follow-ups (#284, #285, #288, #289, #290, #291, #292) so the same friction isn't re-filed.
- Promotes a TF entry to a GH issue when the same friction surfaces across 2+ situations (per the project's "Capture friction over scope" rule) or when the issue is architectural and needs operator triage.
- Closes the feature with a final TF summary entry that the scope-discovery team imports as `AUDIT-<date>-<NN>` audit-log entries — the v1.1 workplan input for scope-discovery.

The workplan reserves a closing milestone for the TF summary entry and audit handoff. Scope-discovery's v1 hardening signal depends on this dogfood loop running end-to-end on this feature.

## Acceptance Criteria

- [ ] A project can host one or more lanes; each lane is bound to a pipeline template (preset or operator-authored custom JSON under `<projectRoot>/.deskwork/pipelines/`).
- [ ] Five preset templates ship at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json` with documented lifecycle rationale; the override resolver picks per-project overrides when present and falls back to plugin defaults.
- [ ] The universal verbs (`/deskwork:iterate`, `/deskwork:approve`, `/deskwork:cancel`, `/deskwork:induct`) work identically across every template; verb behavior is gated only by stage position within the lane's template (terminal / locked / off-pipeline).
- [ ] Graphical entries (`html-mockup`, `single-file-html`, `image`) flow through their lane's pipeline with the same verb chrome as markdown entries. Iterate edits HTML/CSS/JS for HTML mockups; iterate supports four image-iteration paths (agent regenerate, agent transform, SVG edit, operator-supplied replacement); image-locked drift surfaces as a doctor warning.
- [ ] A group entry has the same schema as any entry plus a `members[]` field of UUIDs. Members can span lanes. Approve on a group advances only the group's stage; member stages are untouched. Recursive groups are refused in v1 with a doctor rule.
- [ ] The studio dashboard renders per-lane tabs (one tab per lane + Combined overview); each tab's stage columns are drawn from the lane's template (no hardcoded "Drafting" / "Published" anywhere). Many-lane projects get overflow tab strip + dropdown + lane-visibility panel. Operator-defined multi-lane composed views are saveable and reopenable.
- [ ] The graphical review surface renders chrome-free (iframe for HTML; `<img>` for image) with a collapsible verb bar + comment-thread sidebar. Comments anchor spatially (DOM selector for HTML; pixel coordinates for raster; element selector for SVG) and support threaded replies via `replyTo`.
- [ ] Operators can capture screenshots of the rendered artifact (full-frame or region) and attach to comments / replies. Screenshots persist under `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>.png`.
- [ ] Operators can **mark up** captured screenshots before attaching: arrow / box / freehand / text label / blur-region tools. Marked versions persist alongside the raw capture (`<comment-id>-<timestamp>-marked.png`); the comment's `attachments[]` references the marked file and an `originalAttachment` field links back to the raw capture for audit. Critical because screenshot markup is how operators precisely show "the broken state" — without it, comments degrade into "see screenshot + paragraph explaining what to look at."
- [ ] The studio's marginalia sidebar surfaces a per-comment **disposition-trace affordance** for addressed comments: clicking the "addressed" badge expands an inline diff snippet showing the slice of the prior-vs-new-revision diff that intersects the comment's anchor region (text range for markdown; spatial region for graphical entries). The iterate skill records a required free-text disposition reason (e.g. "addressed by adding § Secondary deliverable + acceptance criterion at line 55") that renders inline alongside the diff. Closes the verification half of the iterate loop. Bundled in v1 per the project's "don't defer" rule — see issue #299.
- [ ] The implementation team logs scope-discovery friction in `tooling-feedback.md` throughout the feature and ships a closing TF summary entry; the deskwork team imports the closure as `AUDIT-<date>-<NN>` entries in the scope-discovery audit log.
- [ ] Lanes, groups, and pipelines have full CRUD: CLI subcommands (`/deskwork:lane`, `/deskwork:group`, `/deskwork:pipeline` composites) AND studio management surfaces. Soft-archive is the default; hard delete requires `--purge` and is refused when references exist.
- [ ] Doctor adds rules for: missing template reference, entry's lane not found, entry's stage not in template, recursive group, dangling group member, artifact-kind mismatch, image-locked-stage drift.
- [ ] Existing single-pipeline projects migrate automatically on first invocation under the new model: `default` lane created bound to `editorial`, every sidecar gets `lane: "default"` + derived `artifactKind`, no data loss. Migration emits journal events of kind `migration` for each change.
- [ ] Phase 1's prior-art research deliverable lands as `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md` recording the chosen stack (annotation data model, image annotation UI, HTML annotation UI, threading, screenshot capture) with rationale and adopter-facing impact.
- [ ] The graphical review surface design is mocked via `/frontend-design` (Phase 9), operator picks a direction, then Phase 10/11 implementation translates the picked mockup.

## Out of Scope

The following items are **captured in the design spec** so the operator has a complete picture, but are explicitly deferred from v1:

- **Recursive groups.** A group whose members include another group. Doctor's `group-recursive` rule refuses this in v1.
- **Custom per-stage gate logic.** Templates today are gated only on stage position + locked-stages. Per-stage gates (e.g. "Drafting → Final requires at least 1 marginalia resolved") and gate DSL design are deferred.
- **Additional artifact kinds.** Video (`.mp4` / `.mov`), audio (`.mp3` / `.wav`), PDF, executable code snippets, notebooks (`.ipynb`), data files (`.csv` / `.json`), diagrams (Mermaid / PlantUML). v1 ships only `markdown` / `html-mockup` / `single-file-html` / `image`.
- **Per-stage custom skills.** Attaching a skill to a specific stage (e.g. lane `qa-plan` stage `Tested` triggers `/qa:smoke-test`) is deferred.
- **CI test infrastructure.** Per the project rule "No test infrastructure in CI." v1 ships unit + integration tests run locally; CI runs the existing `npm --workspaces test` only.
- **Multi-operator support.** v1 assumes single-operator. Concurrent-edit detection / merge UX / per-operator identity propagation through journals + annotations is deferred. The schema permits adding it later (annotations already carry author metadata).
- **Tag-driven groups (auto-membership via tag matching).** v1 ships static groups only; tag-driven dynamic membership is captured in the implied-scope but deferred.
- **@mentions notifications.** Mention syntax in comments + notification mechanism (feed / email / Slack hook) is deferred.
- **Lane ID rename.** Lane display names are editable in v1; the lane ID rename migration (rewriting `lane` fields on every member entry's sidecar) is deferred behind a dedicated confirm flow.

## Technical Approach

### Pipeline templates

A **pipeline template** is a JSON document that defines the stage shape of one kind of work:

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
- Verb semantics (iterate / approve / cancel / induct) are universal across templates and gated only on stage position within the template's linear list.

Plugin defaults live at `packages/core/src/pipelines/<id>.json`; project overrides at `<projectRoot>/.deskwork/pipelines/<id>.json`. The override resolver (already in `packages/core/src/overrides.ts` per THESIS Consequence 3) picks the project file when present and falls back to the plugin default.

### Default templates shipped in v1 — presets, not the bounding space

| Preset `id` | linearStages | lockedStages | offPipelineStages |
|---|---|---|---|
| `editorial` | `["Ideas","Planned","Outlining","Drafting","Final","Published"]` | `["Final"]` | `["Blocked","Cancelled"]` |
| `visual` | `["Sketched","Iterating","Approved","Shipped"]` | `["Approved"]` | `["Blocked","Cancelled","Archived"]` |
| `feature-doc` | `["Defined","Drafting","Approved","Implemented","Complete"]` | `["Approved","Implemented"]` | `["Blocked","Cancelled"]` |
| `qa-plan` | `["Drafted","Reviewed","Tested","Approved"]` | `["Reviewed"]` | `["Blocked","Cancelled","Archived"]` |
| `blog-post` | `["Idea","Drafting","Edited","Published"]` | `["Edited"]` | `["Blocked","Cancelled"]` |

These are **presets, not the bounding space**. A project may have any number of lanes (≥1), each bound to a preset or to an operator-authored custom pipeline. Custom pipelines are first-class — operators place JSON files under `<projectRoot>/.deskwork/pipelines/<id>.json` (no preset basis required). The `editorial` preset's stage names match the legacy single-pipeline names exactly — this is what backs the auto-migration of pre-feature entries. Each preset ships with comment headers documenting the lifecycle rationale so operators have working exemplars.

`/deskwork:customize pipeline <preset-id>` is a convenience for "start from a preset and modify it"; it's not required.

### Lanes

A **lane** binds a pipeline template to a partition of entries within a project:

```ts
type LaneConfig = {
  id: string;              // e.g. "default" | "mockups" | "qa"
  name: string;            // human-readable label
  pipelineTemplate: string; // id of a PipelineTemplate
  contentDir: string;      // root of this lane's content tree (per-lane content roots)
}
```

Lane configs live at `<projectRoot>/.deskwork/lanes/<lane-id>.json`. Projects ship a `default` lane (template = `editorial`, contentDir = the legacy `sites.<site>.contentDir`) at install time so the upgrade is invisible to existing projects. Each entry belongs to exactly one lane.

### Groups

A **group** is itself an entry — same schema, same UUID, same dashboard row, same review surface — that has the additional property `members: string[]` (an array of member entry UUIDs).

- The group entry has its own `lane`, `currentStage`, frontmatter, iterate/approve/cancel verbs. It moves through a pipeline independently of its members.
- Members can span lanes — `mobile-first redesign v.X` (group entry, in some "design-initiative" lane) can have members in `mockups`, `feature-doc`, and `blog-post` lanes.
- Approve on a group **does not propagate** to members. Approving a group advances the group's own stage; member stages are untouched. The group's currentStage is an *assertion about the coordinated unit*, not a batch mutation of members.
- Recursive groups (a group as a member of another group) are refused in v1 via the `group-recursive` doctor rule.
- A group entry may have an optional `artifactPath`. If set, the group has a content body (e.g. a `manifesto.md` describing the initiative) and iterate operates on it. If unset, the group is metadata-only and iterate refuses with a clear message.
- An entry can be a member of multiple groups simultaneously; the studio renders multi-badge ("Member of: <group-a>, <group-b>").

The `members` field is the only schema delta for groups. Everything else — verbs, journals, calendar rendering, doctor — uses the same code paths as non-group entries.

### Graphical entries

Graphical entries are entries whose primary artifact is non-markdown. Three artifact shapes are supported in v1:

| Shape | Layout | iterate? | Marginalia format |
|---|---|---|---|
| **HTML mockup** | Directory `<slug>/` with `index.html` + sibling assets (`*.css`, `*.js`, `*.png`, etc.) | Yes — agent edits HTML/CSS/JS to address marginalia | DOM-selector + x/y offset (resilient to small layout changes) + ranged-text fallback when comment references visible text |
| **Single-file HTML** | `<slug>.html` with inline styles/scripts | Yes — same as above | Same as above |
| **Image (PNG / JPG / SVG)** | `<slug>.<ext>` | Yes — see image iteration paths below | Pixel coordinates for raster; element-selector for SVG |

For HTML mockups, iterate reads each marginalia anchor (DOM selector + offset + comment text), resolves it against the live DOM, identifies the most plausible element, and edits the HTML/CSS/JS to address the comment — same skill prose pattern as markdown iterate, just operating on different file types.

For image entries, iterate is supported and intentionally open-ended at the CLI level. The skill prose enumerates four paths and asks the agent to pick the one matching the comments + available tooling:

1. **Agent-driven regeneration.** For images produced by a generation pipeline (Midjourney, Stable Diffusion, DALL·E, etc.), the agent reads the comments and regenerates the image with an updated prompt. The new file replaces the old at `artifactPath`; iterate appends a new revision per `DESKWORK-STATE-MACHINE.md` § Versions and revisions.
2. **Agent-driven programmatic transformation.** For images with a programmatic origin (crops, annotations, composites), the agent runs the transformation (ImageMagick, sharp, custom script) per the comment.
3. **SVG edits.** SVGs are XML; element-selector marginalia anchors let the agent edit the SVG source directly the way it edits HTML.
4. **Operator-supplied replacement.** The operator drops a new image file at `artifactPath` and `/deskwork:iterate` appends it as the next revision.

If none apply, the agent reports back to the operator with the comments unaddressed.

**Per-project iteration handlers.** Operators can register project-specific iteration handlers at `<projectRoot>/.deskwork/iterate-handlers/<artifactKind>.ts`. Use cases: a project authoring mockups via a Figma export pipeline registers a Figma-aware handler; a project with custom image-transformation pipelines registers one mapping comment text to specific ImageMagick operations. Handler discovery uses the same override-resolver pattern as templates and doctor rules.

### Graphical review surface — chrome-free + threaded comments + screenshot capture

The graphical review surface is the highest-design-risk part of this feature. Design pass via `/frontend-design` is **required** before implementation (Phase 9), gating Phase 10/11 on an operator-picked mockup. The mockup phase covers: chrome-free render area + pin placement UX + thread expansion in sidebar (inline-on-pin vs sidebar-grouped) + screenshot capture affordance (region select vs full-frame) + screenshot attachment workflow + thread navigation when many threads exist.

**Chrome-free rendering.** The mockup or image renders without surrounding studio chrome. The verb bar (Iterate / Approve / Cancel) and comment-thread sidebar dock to the edges via a slim overlay that the operator can collapse to view the artifact full-screen. For HTML mockups, the iframe loads `index.html` directly with no wrapper styling — the mockup's own CSS governs the rendered surface entirely.

**Spatial comments + threads.** A comment anchors to a spatial region (coordinate pin for raster; DOM selector + offset for HTML; element selector for SVG). Comments support **threaded replies** — operator and agent can have back-and-forth conversation on a single anchor instead of stacking standalone comments. The thread is a sequence of `comment-reply` annotations chained off the root via `replyTo: <comment-id>`. The studio's marginalia sidebar renders threads expandable; collapsed threads show only the root comment + reply count badge.

**Screenshot capture + attachment.** Operators can capture a screenshot of the rendered artifact (full-frame or region) and attach to a comment or reply. Storage: `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>.png`. The comment annotation gains an `attachments: string[]` field. Screenshots are tied to the comment, not the entry, and persist as long as their comment persists. Capture mechanism is decided in Phase 1 prior-art research (native `getDisplayMedia()` vs DOM-to-canvas vs adopted-library built-in).

### Annotation model extensions (cross-cutting)

Threads and screenshot attachments are scoped to graphical entries by use case but applicable to every entry kind. The annotation schema is extended once; markdown review benefits automatically:

```ts
type CommentAnnotation = {
  // unchanged
  id: string;
  type: 'comment';
  workflowId: string;
  version: number;
  text: string;
  category: string;
  anchor: string;
  createdAt: string;
  // new
  replyTo?: string;       // present on reply comments; references root comment id
  attachments?: string[]; // relative paths under <entryDir>/scrapbook/screenshots/
  spatialAnchor?: {       // present for graphical entries; absent for markdown
    kind: 'pixel' | 'dom-selector' | 'svg-element';
    selector?: string;    // dom-selector / svg-element only
    x?: number;           // pixel only (also dom-selector fallback)
    y?: number;
  };
  // existing `range` field stays for markdown
}
```

The schema change is **additive**. Existing single-comment annotations keep working unchanged; legacy comments (no `replyTo` / `attachments` / `spatialAnchor`) render as zero-reply threads in the new model.

The disposition annotation gains a required `reason: string` field captured at iterate time (e.g. "addressed by adding § Secondary deliverable + acceptance criterion at line 55"). The studio's marginalia sidebar renders the reason inline alongside the comment's "addressed" badge AND surfaces a per-comment inline diff expansion: clicking the badge expands the slice of the prior-vs-new-revision diff that intersects the comment's anchor region. This closes the verification half of the iterate loop — the operator confirms the rewrite matches intent without searching the new revision manually. The diff slicing logic intersects diff hunks with each comment's `range` (markdown) or `spatialAnchor` region (graphical). See issue #299 for the original surfacing.

### Studio rendering

A project may have any number of lanes (≥1), so the studio must handle both small (single-lane back-compat) and large (many-lane) configurations gracefully.

- **Per-lane dashboards with operator-selectable visibility.** Tab strip with one tab per lane plus a "Combined" overview. Many-lane projects get a horizontally-scrollable strip + "lanes ▾" dropdown. Hidden lanes don't render tabs but their entries still exist and count in dashboard stats. Tab order respects operator-configured ordering (drag-to-reorder).
- **Multi-lane composed views.** Operator-defined views pin N lanes side-by-side (e.g. `mockups` + `feature-doc` for cross-lane coordinated work). Multi-lane views are saved per-operator or per-project and reopenable.
- **Per-lane stage columns.** Each lane's dashboard shows columns for that lane's `linearStages` (in order) plus a separate "Off-pipeline" section listing entries in `offPipelineStages`. Stage labels are drawn from the lane's template — no hardcoded "Drafting" / "Published" anywhere in studio render code.
- **Lane / group management surfaces.** Dedicated studio pages for lane CRUD (list, create, edit, archive, reorder, toggle visibility, pick template) and group CRUD (list, create, edit, archive, manage members).
- **Group rendering.** Group rows show member count as a badge. The group's review surface adds a "Members" section listing each member's lane, stage, and a clipboard-copy link to its review surface. Member entries' rows show "Member of: <group slug>" badges.
- **Group multi-lane review.** A group's review surface renders members in a coordinated multi-lane composition — one column per lane the group spans, members in their lane's stage position, with the group's own stage above.
- **Graphical review surface.** Iframe (HTML) or `<img>` (image) inside a marginalia-overlay wrapper. Verb chrome shared with the markdown surface.

Per Commandment III (`DESKWORK-STATE-MACHINE.md` § review state is retired), no surface renders "review state" labels. Only stage labels appear.

### Verb semantics across templates

| Verb | Behavior | Stage gate |
|---|---|---|
| `iterate` | Agent reads marginalia, edits or regenerates artifact to address each comment, bumps revision counter. | Any non-terminal, non-locked, non-off-pipeline linear stage. All artifact kinds supported. |
| `approve` | Advances `currentStage` to next element of `linearStages`. At terminal stage, assigns a new version per § Versions and revisions in `DESKWORK-STATE-MACHINE.md`. | Any linear stage with a next-stage (not the terminal). Terminal stage refuses with "Already at terminal; induct backward to revise." |
| `cancel` | Moves `currentStage` to `Cancelled` (must exist in `offPipelineStages`). | Any stage except `Cancelled` itself. |
| `induct` | Moves `currentStage` from an off-pipeline stage back to an operator-chosen linear stage. Also: backward-induct from a locked stage to unlock for editing. | From: any off-pipeline stage OR any locked stage. To: any linear stage. |

Verbs are universal across templates. The studio's per-row clipboard-copy buttons surface them identically; per THESIS Consequence 2 the studio never mutates sidecar state from a button click — operator pastes the slash command, agent runs the skill.

### Prior art — reuse before build

Phase 1 is a **time-boxed research phase** that surveys mature OSS projects and produces a decision document per concern (annotation data model, image annotation UI, HTML annotation UI, threading, screenshot capture). Candidate projects: Annotorious, Recogito, Hypothes.is, W3C Web Annotation Data Model, Penpot, Storybook addons, html2canvas / dom-to-image-more, browser-native `MediaDevices.getDisplayMedia()`. Closed-source SaaS (Marker.io / Pastel / BugHerd) inform UX patterns but are not adoptable.

Phase 1 output: `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md` recording the chosen stack with rationale, dependency footprint, and adopter-facing impact. This document is Phase 8's annotation-model input and Phase 9's design-pass input. **Reinvent as little as possible** — if Annotorious cleanly covers image annotation, Phase 10's work becomes "wire Annotorious into the studio review surface" rather than "build region annotation from scratch."

### Data model summary

**Entry schema delta:**

```ts
type EntrySidecar = {
  // unchanged
  uuid: string;
  slug: string;
  title: string;
  artifactPath: string;
  currentStage: string;         // now drawn from the lane's template, not a global enum
  iterationByStage: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  // new
  lane: string;                 // lane id
  members?: string[];           // group only: array of member entry UUIDs
  artifactKind: 'markdown' | 'html-mockup' | 'single-file-html' | 'image';
}
```

**New on-disk files:**

```
<projectRoot>/.deskwork/
├── lanes/
│   ├── default.json           # shipped by install for back-compat
│   ├── mockups.json           # operator-authored
│   └── ...
├── pipelines/                 # operator overrides; falls back to plugin defaults
│   ├── editorial.json
│   ├── visual.json
│   └── ...
├── iterate-handlers/          # optional per-project iterate handlers per artifactKind
│   └── image.ts
```

Plugin-shipped defaults at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`. Lane configs are project-owned by design.

### Migration

Existing projects upgrade without operator intervention:

1. **Install / doctor migration.** On first invocation under the new model, `deskwork doctor --apply` (or any verb that triggers sidecar revalidation) auto-creates `.deskwork/lanes/default.json` bound to the `editorial` template, with `contentDir` set from the project's legacy `sites.<defaultSite>.contentDir`.
2. **Entry sidecar back-fill.** Every existing sidecar gets `lane: "default"` written. `currentStage` values are already drawn from the editorial template's stage list (the names match exactly), so no stage rename is needed. `artifactKind` is derived from the file extension and back-filled.
3. **Calendar regen.** The calendar's existing single-pipeline rendering becomes the default lane's rendering. Multi-lane projects render a per-lane section. The pre-existing #247 calendar-regen bug is unblocked by this work — the new calendar rendering reads the lane's template instead of a hardcoded stage list.
4. **Legacy `sites` config migration.** For each legacy site, create a corresponding lane with `id: <site-id>`, `pipelineTemplate: 'editorial'`, `contentDir: <site.contentDir>`. The legacy `sites` block stays during a deprecation period (doctor surfaces as warning) and is removed in a later release.
5. **Migration journal entries.** Each migration step emits a journal event of kind `migration` recording the change and timestamp.
6. **Schema versioning.** `.deskwork/config.json` gains a `schemaVersion` field; new CLI invocations check the version and run migrations when ahead. CLI older than the on-disk schema refuses with "upgrade your plugin."

**No data loss.** Every entry persists with all existing frontmatter, scrapbook content, marginalia, journal events. Only additions: `lane`, `artifactKind`.

### Doctor rules

New rules:

- **lane-config-missing-template.** Lane config references a `pipelineTemplate` id that doesn't resolve. Surfaces error with the lane file path.
- **entry-lane-not-found.** Entry sidecar has a `lane` value that doesn't resolve to any lane config. Repair: prompts for the correct lane or migrates to `default`.
- **entry-stage-not-in-template.** Entry's `currentStage` isn't in the lane's template stages (linear or off-pipeline). Repair: prompts for a valid stage from the lane's template.
- **group-recursive.** A group has a member whose `members` array is non-empty (recursive groups refused in v1). Repair: prompts to flatten or unbind.
- **group-member-missing.** A group references a member UUID that doesn't resolve. Repair: prompts to remove the dangling reference.
- **artifact-kind-mismatch.** Entry's `artifactKind` doesn't match the file extension at `artifactPath`. Repair: prompts to correct.
- **image-locked-stage.** An image entry is in a `lockedStages` stage but has been iterated since reaching it. Repair: surfaces the iterate journal entries for manual review.

### CRUD support — lanes, groups, pipelines

Lanes, groups, and (operator-authored) pipelines are first-class operator-owned objects. The feature ships full CRUD support across CLI and studio.

| Object | Create | Read / List | Update | Delete |
|---|---|---|---|---|
| **Lane** | `/deskwork:lane create <id> --template <preset-or-custom> --content-dir <path>` + studio "New lane" form | `/deskwork:lane list`, `/deskwork:lane show <id>` + studio lane management page | `/deskwork:lane update <id> [--template <id>] [--name <label>] [--content-dir <path>]` + studio edit form | `/deskwork:lane archive <id>` (soft, default) + studio archive action. Hard delete requires `--purge`; refused if the lane has any entries. |
| **Group** | `/deskwork:group create <slug> --lane <lane-id>` + studio "New group" form | `/deskwork:group list`, `/deskwork:group show <slug>` + studio group management page | `/deskwork:group add-member <group> <entry>`, `/deskwork:group remove-member <group> <entry>`, `/deskwork:group update <slug> [--title <text>]` + studio member-management UI | `/deskwork:group cancel <slug>` (universal cancel verb) + studio surface. Hard delete `--purge`. |
| **Pipeline (custom)** | `/deskwork:customize pipeline <preset-id>` (start-from-preset) OR `/deskwork:pipeline create <id> --shape <linear-stages-spec>` (from-scratch) | `/deskwork:pipeline list`, `/deskwork:pipeline show <id>` + studio template browser | `/deskwork:pipeline update <id> --add-stage <name> [--position N]`, `--rename-stage <from> <to>`, `--remove-stage <name>` + studio template editor | `/deskwork:pipeline delete <id>` (refused if any lane references it; force with `--reassign-lanes-to <other-id>`). |

Soft-archive is the default for lanes and groups (preserves history, hides from active dashboards). Hard delete (`--purge`) is reserved for empty objects or genuine cleanup; doctor flags orphan-pipeline-references and dangling-group-members.

### Skill changes

- **New skill `/deskwork:lane`** (composite) — `list`, `show <id>`, `create`, `update`, `archive`, `restore`, `purge` (gated), `move <slug> --to <lane-id>` (cross-lane entry move). Operator-facing lane CRUD.
- **New skill `/deskwork:group`** (composite) — `list`, `show <slug>`, `create`, `update`, `add-member`, `remove-member`, `archive`. Cancel uses the universal `/deskwork:cancel`.
- **New skill `/deskwork:pipeline`** (composite) — `list`, `show <id>`, `create`, `update` (add-stage / rename-stage / remove-stage / set-locked / set-off-pipeline), `delete`.
- **Updated skill `/deskwork:add`** — accepts `--lane <id>` and `--kind <markdown|html-mockup|single-file-html|image>` flags; default `--lane` from `config.defaultLane`; `--kind` inferred from artifact extension when omitted.
- **Updated skill `/deskwork:ingest`** — accepts `--lane <id>` (defaults to `default`); auto-detects `artifactKind` from file extension.
- **Updated skill `/deskwork:iterate`** — handles all artifact kinds including images per § Graphical entries; skill prose enumerates the four image-iteration paths and asks the agent to pick the right one.
- **Existing skills `/deskwork:approve`, `/deskwork:cancel`, `/deskwork:induct`** — unchanged in operator-facing semantics; internal stage-list reads now go through the lane's template.
- **Legacy `--site` flag** — maps to `--lane` during the migration period with a deprecation warning; removed in a later release.

These skill-set deltas are a starting catalog; final shape may evolve during implementation.

### Testing

- **Unit (vitest).** Template loader (plugin defaults + project overrides), stage-validity checker, verb gate logic per template, group member validation, artifact-kind detection. Full coverage of the five default templates.
- **Integration (vitest with tmp fixtures).** Multi-lane project end-to-end: install → add entries in two lanes → iterate / approve / cancel each → group two entries across lanes → approve the group → verify lane independence + group independence. Migration test: pre-feature single-pipeline project → run doctor → confirm `default` lane created, every entry has `lane: default` + correct `artifactKind`.
- **Studio render tests.** Per-lane dashboard renders the right columns; group dashboard row shows member badge; graphical review surface renders iframe + marginalia overlay.
- **No CI changes.** Local `npm --workspace @deskwork/core test` and `npm --workspace @deskwork/studio test`.

### Risks

- **Studio render complexity.** Per-lane tabs + per-template stage columns + graphical surface + group surface is a lot of new render code. Mitigation: ship template-aware rendering before graphical surface, validate against the migration baseline, then add graphical (phased implementation).
- **Marginalia anchor resilience on HTML mockups.** A DOM-selector-based anchor can drift if the operator hand-edits the HTML. Mitigation: anchor records selector + text snippet + pixel offset. Resolver tries selector first, then text-snippet match, then pixel coordinates. Doctor surfaces unresolved anchors as warnings.
- **Five default templates risks bikeshedding.** Operators may have opinions about template stage names. Mitigation: ship reasonable defaults; the customize seam answers "I want different stages."
- **Group cross-lane semantics on doctor.** Doctor needs to follow member UUIDs across lanes. Mitigation: doctor builds an index of UUID → lane lookups once per run.

## Implementation Phases (high-level)

The implementation decomposes into ~12 phases (numbers are approximate phase sizes, not commitments). The workplan elaborates each phase into tasks with acceptance criteria. A closing milestone (after Phase 12) covers the scope-discovery dogfood TF summary and audit-log handoff per § Secondary deliverable.

1. **Prior art research + build-vs-reuse decision.** Time-boxed OSS survey + spike integrations. Output: decision document at `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md`. **No production implementation.**
2. **Pipeline template loader + preset defaults + override resolver.** JSON load, schema validation, plugin defaults + project overrides, five preset templates shipped with comment headers. Unit tests.
3. **Lane data model + config loader + entry schema delta.** `.deskwork/lanes/<id>.json`, entry sidecar gains `lane` + `artifactKind`, doctor migration creates `default` lane on first run. Unit tests.
4. **Verb refactor: stage-list reads go through the lane's template.** `approve`, `iterate`, `cancel`, `induct` consult the entry's lane template. Existing behavior preserved when lane = `default`. Calendar regen bug #247 unblocked here. Unit tests.
5. **Studio render: per-lane tabs + template stage columns + combined overview + lane-visibility panel + multi-lane composed views.** Markdown-only still. Integration test against multi-lane fixture.
6. **Lane + pipeline CRUD skills + studio management surfaces.** `/deskwork:lane` and `/deskwork:pipeline` skill families; doctor rules for orphan pipeline references. Integration test: create lane bound to custom pipeline, add entries, archive, restore.
7. **Groups: members field + group CRUD skills + group review surface + group multi-lane composition.** `/deskwork:group` skill family; group review surface with member panel; doctor rules for recursion + dangling members.
8. **Annotation model extension** (informed by Phase 1): threaded replies + screenshot attachments + spatial anchors + **disposition-trace affordance** (per-comment inline diff expansion on the "addressed" badge; required free-text disposition reason captured at iterate time and rendered alongside the diff). Cross-cutting; markdown review benefits too. Sidecar storage at `<entryDir>/scrapbook/screenshots/`. Closes #299.
9. **/frontend-design pass for the graphical review surface.** Mockup chrome-free render area, pin placement, thread expansion, screenshot capture / attachment. Operator picks a direction; gates Phase 10/11. **No implementation.**
10. **Graphical entries — HTML review surface.** Translate the picked mockup. Iframe-based chrome-free rendering for `html-mockup` + `single-file-html`; DOM-anchored + coordinate-pinned spatial comments; thread expansion; screenshot attachment; iterate against HTML mockups (skill prose update). Integration test against fixture mockup.
11. **Graphical entries — image review surface + iteration paths.** Chrome-free image review surface; region-anchored marginalia (raster) + element-anchored marginalia (SVG); iterate skill prose enumerates regenerate / transform / replace / operator-supplied paths. Manual dogfood: ingest a `docs/studio-design/` mockup as a `visual`-lane entry, iterate it, approve it; ingest a screenshot, iterate via operator-supplied replacement.
12. **Screenshot markup / drawing UI.** Operator-side annotation of captured screenshots before attaching: arrow, box, freehand, text-label, and blur-region tools. Markup persists as a new file alongside the raw capture in `<entryDir>/scrapbook/screenshots/` (e.g. `<comment-id>-<timestamp>-marked.png` next to `<comment-id>-<timestamp>.png`); the comment annotation's `attachments[]` references the marked file; an `originalAttachment` field on the attachment metadata links back to the raw capture for audit. UI: lightweight canvas-overlay editor invoked from the capture flow; the mockup direction is picked alongside the Phase 9 graphical-review surface design pass (markup affordances are co-designed with capture so the operator's mental model stays continuous). Critical because screenshot markup is how operators precisely show "the broken state" — without it, comments degrade into "see screenshot + paragraph explaining what to look at" instead of "see screenshot with arrow + box." Integration test: capture a fixture screenshot, draw a box + arrow + text label, attach to a comment, verify the marked file persists and the comment renders both versions on the review surface.

## Companion References

- `THESIS.md` — agent-as-primary-tool; studio is routing surface; defaults + override seam (Consequences 1-3).
- `DESKWORK-STATE-MACHINE.md` — the canonical shape this feature generalizes (eight stages become *one template among several*; the shape — linear + terminal + cul-de-sac + universal verbs — is preserved across all templates).
- `DESIGN-STANDARDS.md` — studio rendering conventions the graphical surface must honor.
- `packages/core/src/overrides.ts` — the existing override-resolver infrastructure pipeline templates plug into.
- `docs/superpowers/specs/2026-05-16-graphical-entries-design.md` — full design spec (522 lines; iterated through 5 substantive revisions in deskwork).
- Issue #247 — calendar.md regen drops Final/Cancelled entries; the regen refactor in Phase 4 fixes this as a side effect.
