## PRD: deskwork-plugin

### Problem Statement

The editorial calendar and workflow skills built for audiocontrol.org are locked inside a private repo. They represent hundreds of sessions of iteration on an agent-driven editorial workflow. They need to be extracted into an open-source Claude Code plugin so they are visible, installable, and usable by anyone developing content with a coding agent. The extraction must happen incrementally -- audiocontrol.org's running editorial calendar cannot stop while the plugin is built.

### Solution

Extract the editorial skills into a Claude Code plugin called "deskwork" (codename), distributed via a public monorepo that will also host future plugins (feature-image, analytics). The plugin uses an adapter layer to decouple skill logic from host project structure. An install skill explores the host project and writes a config file. Migration from project-local skills to plugin skills happens incrementally with side-by-side validation.

### Acceptance Criteria

- A public monorepo exists with the deskwork plugin structured for Claude Code plugin distribution
- The plugin includes a marketplace.json that supports git-subdir installation
- The plugin ships 9 skills: install, add, plan, draft, publish, help, status, distribute, social-review
- An adapter layer decouples plugin logic from host project structure via a config file
- The install skill explores a host project and writes the config
- audiocontrol.org runs the plugin version of all editorial skills (old project-local skills removed)
- The plugin validates against the live audiocontrol.org editorial calendar with no data loss or behavioral regression

### Out of Scope

- Feature-image plugin (future, same monorepo)
- Analytics plugin (future, same monorepo)
- Reddit, YouTube, or analytics integrations (future additions to deskwork)
- Codex or other agent plugin formats
- ~~Astro dev server studio pages~~ (now in scope — see Extension below; rendered as a standalone Hono server, not Astro)
- Editorial skills not in the core set: suggest, performance, reddit-sync, reddit-opportunities, cross-link-review, ~~iterate, approve, shortform-draft~~ (review-loop ported in commit 4b3255e; shortform/cross-link still deferred)

### Extension: severance from Astro + headless/UI split (added mid-implementation)

**Why now.** The original PRD assumed the editorial studio would remain in audiocontrol.org's Astro app. Reviewing the live workflow showed this is where most of the editorial time is actually spent, and locking it to one host project's framework defeats the open-source goal. The studio surface needs to run independently of any host project's framework.

**Friction principle.** Past MCP server experiences (notably Codex's GitHub tooling) wasted cycles via deceptive failures and security theater. Tools that aspire to elegance but introduce protocol failure surfaces are worse than nothing. The extension prefers proven CLIs invoked via Bash over MCP for v0.1.

**Plugin pattern survey.** Of 8 official Anthropic plugins surveyed, 7 ship zero code (markdown + `.mcp.json` only); the 8th (`superpowers`) ships pure bash. The `playwright` plugin demonstrates the pattern that fits us: a thin plugin pointing at an npm package the agent invokes via npx.

**New scope.**

- Three npm packages: `@deskwork/core` (lib, no entry point), `@deskwork/cli` (subcommand dispatcher invoked via npx), `@deskwork/studio` (Hono web server depending on `@deskwork/core`)
- Two plugin shells: `deskwork` (lifecycle skills invoking `@deskwork/cli`) and `deskwork-studio` (single skill that launches `@deskwork/studio`)
- Headless users install `deskwork` only — no Hono, no UI assets. Studio users opt in by enabling `deskwork-studio`.
- Studio UI assets ported verbatim from `~/work/audiocontrol.org/src/shared/` (~5,000 lines of TS + CSS that have zero Astro dependencies). The 3 Astro pages convert to HTML-string render functions (~400 lines of mechanical rewrite).
- MCP server explicitly deferred. Revisit only if friction with the CLI emerges. If it later becomes interesting, it ships as a fourth package (`@deskwork/mcp-server`) importing from `@deskwork/core`.
- npm registry publishing deferred to v0.1 cut. Initial dev uses `file:` workspace deps for local dogfood.

**Plan reference.** Approved plan: `/Users/orion/.claude/plans/i-would-like-to-wiggly-hennessy.md`

### Technical Approach

**Strategy:** Approach C -- extract existing skills with an adapter layer. The adapter handles path resolution, frontmatter I/O, and site detection. Skills call adapter functions instead of hardcoded paths. The install skill writes the adapter config by exploring the host project.

**Monorepo structure:**

```
deskwork/
+-- .claude-plugin/
|   +-- marketplace.json
+-- plugins/
|   +-- deskwork/
|   |   +-- .claude-plugin/plugin.json
|   |   +-- skills/ (9 skill directories)
|   |   +-- bin/ (helper scripts)
|   |   +-- lib/ (adapter layer)
|   |   +-- package.json
|   |   +-- README.md
|   +-- feature-image/ (future)
|   +-- analytics/ (future)
+-- README.md
+-- LICENSE
```

**Plugin skills:**

| Skill | Invocation | Purpose |
|---|---|---|
| install | /deskwork:install | Explore host project, write config, create calendar |
| add | /deskwork:add | Capture an idea in the Ideas stage |
| plan | /deskwork:plan | Move idea to Planned, set keywords/tags |
| draft | /deskwork:draft | Scaffold blog post, create GitHub issue, move to Drafting |
| publish | /deskwork:publish | Move to Published, close issue |
| help | /deskwork:help | Show workflow and current calendar status |
| status | /deskwork:status | Display calendar status across all stages |
| distribute | /deskwork:distribute | Record a share to a social platform |
| social-review | /deskwork:social-review | Show posts vs. platforms matrix |

**Adapter config** (`.deskwork/config.json`, written by install skill):

```json
{
  "sites": [
    {
      "name": "my-blog",
      "contentDir": "src/content/blog",
      "frontmatter": {
        "titleField": "title",
        "descriptionField": "description",
        "dateField": "date",
        "tagsField": "tags"
      }
    }
  ],
  "calendarPath": ".deskwork/calendar.md"
}
```

**Calendar format:** Plugin-owned. Pipe-delimited markdown tables with stages: Ideas, Planned, Drafting, Review, Published, Distribution.

### Dependencies

- Claude Code plugin system (stable, shipping)
- GitHub for monorepo hosting and marketplace distribution
- audiocontrol.org editorial calendar (the live system being migrated)

### Open Questions

- Monorepo name and GitHub org
- GitHub issue integration: opt-in via config or always-on?
- Helper script runtime: ship compiled JS in bin/, or require tsx as a peer dependency?
- Calendar file location default: .deskwork/calendar.md vs. configurable

### Design Spec

See `docs/superpowers/specs/2026-04-20-deskwork-plugin-design.md`

---

## Philosophical Pillar: Agent-Improvable Tooling

### The pillar

The editorial calendar was built inside a coding agent's reach precisely so that **the operator can ask the agent to improve the tooling as friction emerges**. Hit a rough edge mid-workflow → "fix this for me" → agent reads the source, edits, runs tests, commits. This tight feedback loop is the central reason for building the tooling agent-side rather than as a hosted service.

Deskwork plugin users must retain this property. A plugin that the agent cannot read, edit, or contribute back to is just a SaaS API in a different costume.

### How the current architecture undermines the pillar

The Phase 7-12 plan optimized for distribution elegance (thin plugin shell → npm packages invoked via npx). That choice quietly defeats the pillar:

1. **Source is not on the user's disk.** Once installed, deskwork's TypeScript lives inside the npm cache or `node_modules` — read-only, deeply nested, not part of any project the agent reasons about. "Fix this rough edge" becomes "first locate the cache, then choose between bypassing node_modules or rebuilding the package."
2. **The plugin shell is thin.** Under `<plugin>/skills/` there is only SKILL.md prose and a bash wrapper. No backing logic to read, no tests to run, no diff to commit.

Reference frame: Playwright gets away with this because Playwright is **a tool you call**. Deskwork is **a workflow you live in** — the operator's editorial life happens through it daily. The thin-shell-over-npm pattern was the wrong reference; the closer pattern is `superpowers`, which ships its repo as the plugin and is freely agent-editable.

### Options under consideration

Documented for future decision; **not being implemented in v0.1**.

| Option | Sketch | Strengths | Weaknesses |
|---|---|---|---|
| A. Local-clone fallback | Plugin checks for a developer clone (e.g., `~/.deskwork-dev/`); uses local TS via tsx if present, npm otherwise | Familiar pattern; opt-in | User must set up; two install modes to reason about |
| B. Source ships in plugin | Plugin distributes TS source under `<plugin>/source/`; user edits it directly | Source available immediately; no setup | Edits clobbered on update; no versioning; hard to upstream |
| C. Customization seams | Core ships read-only; plugin defines extension points (project-local skills, commands, hooks); user customizes in `<project>/.deskwork/` | Clean separation; updates safe | Limits customization scope; extension API needs design |
| D. Eject-to-local | `deskwork eject` copies source from npm package into the user's project | Maximum freedom after eject | One-way street; loses upstream updates |
| E. Hybrid override + contribute | Core in npm package (updateable); user overrides in `<project>/.deskwork/overrides/`; `deskwork contribute` opens PR from local diff | Locally improveable AND upstreamable | Two layers to think about |
| F. Plugin-as-clone | Install model is `git clone` of the deskwork repo; plugin lives at `~/.claude/plugins/deskwork/` with full source on disk; agent edits in place; `git pull` updates; `gh pr create` contributes back | Source always present; workflow already familiar to agents; trivial contribution path | Bigger install footprint (~20MB); requires git at install time |

### Tentative direction

**Option F + Option C** appear to be the natural synthesis: the plugin is a clone (full source, agent-editable, contributable), with project-level extension seams in `<user-project>/.deskwork/{skills,commands,hooks}/` for customizations that should not live in the shared plugin. This combination preserves agent-fixability for shared logic and gives the operator a private surface for project-specific tweaks.

### Deferred

The pillar question is captured here for the record; the architectural decision is deferred. v0.1 implementation continues with the npm-package distribution model (Phases 7-12). A future phase will revisit, propose a concrete design, and migrate.

**Trigger to revisit:** the first time a deskwork user (the project author or anyone else) reports difficulty fixing a rough edge in the plugin from within their project.

---

## Extension: versioning, release process, and build correctness

Added mid-implementation as Phase 14. Formalizes the operator-facing version + update story now that the plugin is shipping (PRs #1, #2, #3 merged) and consumers will start tracking it.

### Why now

PR #3 made fresh installs work end-to-end via committed bundles. That introduced a new hazard: every source change must be paired with a bundle rebuild before commit, or the bundle on `main` drifts from the source. With manual rebuild, the failure mode is silent — a contributor edits `cli.ts`, commits, pushes, and downstream consumers run a stale bundle that lacks the change. We need automation that makes stale bundles structurally impossible to land.

Separately, Claude Code's plugin marketplace tracks the default branch by default. Without tagged releases, every operator who runs `/plugin marketplace update deskwork` gets whatever's at the bleeding edge. That's fine for early dogfood, but the moment an operator wants to pin to a known-good state — for stability, for reproducibility, for rolling back a regression — they need a stable ref. Tagged releases give them one.

### Scope

Three workstreams that share infrastructure (the `npm run build` invocation):

1. **Pre-commit bundle correctness.** Husky-managed git hook that detects staged source under `packages/{cli,studio}/src/` and rebuilds + re-stages the affected bundle, or fails loudly if rebuild produces a different output than what's staged. Local-side enforcement.
2. **Server-side enforcement.** GitHub Actions workflow on PR that runs the full test suite and verifies bundles aren't stale (rebuilds in CI, diffs against committed). Safety net for contributors without husky.
3. **Formal release procedure.** Version-bump script that updates every manifest atomically (`marketplace.json`, both `plugin.json` files, all workspace `package.json` files); a `RELEASING.md` documenting the procedure; a GitHub Actions workflow that creates a GitHub release with auto-generated changelog when a `v*` tag is pushed.

### What this is not

- **Not npm publishing.** Bundles already close the install gap (see Phase 7-12 + the bundle work in `46dccbd`). npm is still optional and remains so.
- **Not semantic-version enforcement.** The plugin doesn't have a stable public API yet; `0.x.y` numbering is informational. We bump on judgment, not semver.
- **Not a migration path for breaking changes.** When we eventually break a calendar format or config schema, that's a separate concern handled by the calendar parser's own backward-compat (which already does UUID backfill and column-presence detection).

**Plan reference.** Approved during the `/feature-extend` invocation that produced Phase 14.

---

## Extension: backfill existing content via `deskwork ingest`

Added as Phase 15. Issue: [#15](https://github.com/audiocontrol-org/deskwork/issues/15). Triggered while installing deskwork into writingcontrol.org, a literary site that already had three published essays — the calendar starts empty and there is no first-class way to populate it from existing content.

### Why now

The lifecycle is forward-only: every entry must enter at `add` (Ideas) and walk through `plan → outline → draft → publish`. Anyone adopting deskwork on a project that already has content hits this on day one. Today's workarounds are all bad: walking the lifecycle per file overwrites existing scaffolds (and stamps today's date on every transition); hand-editing the calendar bypasses the validated state machine and produces no journal entry; doing nothing leaves the calendar inaccurate forever.

This is the kind of feature that can't be added later in a way that doesn't feel bolted-on, because it touches the calendar's row schema (provenance — `add` vs. `ingest`?), the journal (event shape), and the operator's mental model (when do I reach for `ingest` vs. `add`?). Better to land it before there's a body of users with their own ad-hoc backfill scripts.

### Scope

A new `deskwork ingest [<project-root>] [--site <slug>] [options] <path>...` subcommand. `<path>` accepts a single file, a directory walked recursively, a glob, or multiple of those in one call. For each discovered file:

1. **Parse YAML frontmatter** (any frontmatter — no Astro-specific fields required).
2. **Derive slug** from `--slug-from {frontmatter,path}` (default `path` — `<dir>/index.md` → parent dir name; Jekyll `YYYY-MM-DD-<slug>.md` recognized; otherwise filename) or explicit `--slug` (single-file only).
3. **Derive state** from `--state-from {frontmatter,datePublished}` (default `frontmatter` — reads the `state:` field) or explicit `--state <ideas|planned|outlining|drafting|published>`.
4. **Derive date** from frontmatter (`datePublished` then `date`), falling back to file mtime, falling back to today.
5. **Idempotency**: skip slugs already in the calendar; report skipped + reason. `--force` overrides after operator manually reconciles.
6. **Dry-run by default.** Print the plan; nothing on disk changes until `--apply`.

Layout-agnostic discovery — `<slug>/index.md`, flat `<slug>.md`, dated `YYYY-MM-DD-<slug>.md`, Hugo leaf bundles, Eleventy `src/posts/`, Jekyll `_posts/`, Next.js `pages/blog/`, plain markdown notes folders all work without configuration. Frontmatter field names are configurable: `--title-field`, `--date-field`, `--state-field`, `--slug-field`.

### What this is not

- **Not a migration tool for other editorial-calendar formats.** Source is markdown files on disk + their frontmatter. Importing from Notion / Airtable / a different calendar markdown shape is a separate concern.
- **Not a publishing-platform sync.** `ingest` reads the host project's content tree; it does not pull from Substack, Ghost, or RSS.
- **Not auto-detection of the content tree.** The operator passes paths explicitly. Walking the entire repo to "discover" content is intentionally out of scope — too easy to scoop up `node_modules/` test fixtures, vendored docs, or unrelated markdown.

**Plan reference.** Issue #15 design; expanded into Phase 15 of the workplan during this `/feature-extend` invocation.

---

## Extension: hierarchical content gaps + scrapbook-in-review + bird's-eye content view

Added as Phase 16. Issue: [#18](https://github.com/audiocontrol-org/deskwork/issues/18). Triggered by the writingcontrol.org adoption — the team filed a "single content type and flat layout" gap, and the design discussion resolved which parts of that claim are actual gaps, which are documentation gaps, and which are out of scope for v1.

### Why now

Phase 13 (shipped in v0.1.0) and Phase 15 (shipped in v0.3.0) cover hierarchical content end-to-end for the blog content type — calendar accepts `/`-separated slugs, per-entry `filePath` records on-disk shape, scrapbook viewer at arbitrary depth, ingest derives hierarchical slugs from path layout. Yet the writingcontrol team filed an issue claiming hierarchical content "doesn't exist" — because none of these capabilities are surfaced in the operator-facing READMEs or SKILL.md prose. The perception gap was real.

Beyond docs, two genuine product gaps surfaced in the same conversation:

1. **Scrapbook isn't reachable from inside the review surface.** Today the studio's scrapbook viewer is a standalone route. When an operator is reviewing `the-outbound/characters/strivers/index.md`, they must navigate away to browse the node's scrapbook. audiocontrol's review surface had a per-article scrapbook drawer; the deskwork review surface needs the equivalent, scoped to the immediate node.
2. **No content-shape-focused view.** The studio dashboard groups content by editorial-lifecycle lane (Ideas → Planned → … → Published). For a long-form literary site with hierarchical project trees, operators also want to browse content by *shape* — the tree itself, with drillable nodes and at-a-glance signal about each node's state and scrapbook accumulation. This is complementary to the dashboard, not a replacement.

### Scope

| Concern | In scope (Phase 16) | Out of scope |
|---|---|---|
| Calendar tracking + review/edit for **hierarchical markdown** at any depth | ✅ verify + docs | — |
| Calendar tracking for **organizational READMEs** (`<node>/README.md` with no frontmatter) | — | ❌ |
| **Scrapbook drawer** in the longform review/edit surface, scoped to the immediate node | ✅ | — |
| Scrapbook items as **calendar entries** | — | ❌ free-form, not pipeline-bound |
| **Bird's-eye content-shape view** — new studio surface complementary to the dashboard | ✅ | — |
| **Per-type lifecycle vocabulary** (project's `drafting/revising/paused/shopping/complete`) | — | ❌ existing 6-stage vocabulary maps cleanly; only `Paused` is a real gap and that's a tiny addition rather than pluggable lifecycles |
| **Per-type frontmatter schema** (`logline`, `form`, `status`) | — | ❌ deskwork ignores frontmatter fields it doesn't recognize; project-shaped frontmatter passes through untouched |

### Design reference

A static HTML/CSS mockup of the bird's-eye content view ships alongside this PRD as design reference: [`mockups/birds-eye-content-view.html`](mockups/birds-eye-content-view.html). It shows three states (top-level sites + projects, drilldown with empty detail, drilldown with selected node) using realistic content from the writingcontrol.org `the-outbound` tree. Aesthetic direction: **Writer's Catalog** — a quiet study desk's reference card catalog. Typography commits to Fraunces (display), Newsreader (body), JetBrains Mono (paths/metadata). Color palette is warm paper + ink + oxblood marginalia.

### What this is not

- **Not a multi-content-type system.** Content types remain `blog | youtube | tool`. Project pages, organizational READMEs, and scrapbook notes are not new first-class types in v1. The bird's-eye view operates over the existing calendar entries (which already support hierarchy) plus the per-node scrapbook listings.
- **Not a tree editor.** The bird's-eye view is read-only — drill, browse, jump to review. Mutations (rename, reorganize) stay in the existing per-node CLI surface.
- **Not a navigation rewrite.** The pipeline-focused dashboard remains the default landing page. The content view is a sibling, surfaced via top-nav.

**Plan reference.** Issue #18 design discussion; mockup produced via `/frontend-design` skill; expanded into Phase 16 of the workplan during this `/feature-extend` invocation.

---

## Extension: deferral catalog (Phase 18)

Added to surface every outstanding deferral after the operator pushed back on a session pattern of unilaterally splitting work into "in scope now" and "deferred / later" without explicit approval. The full inventory is in workplan Phase 18; this PRD section captures the why and the policy.

### Why now

Through this session, multiple deferrals accumulated without explicit operator approval:

1. Filed [#16](https://github.com/audiocontrol-org/deskwork/issues/16) (pre-commit → pre-push) when operator said "probably want to" — should have either done it or asked.
2. Split [#23](https://github.com/audiocontrol-org/deskwork/issues/23) into "v0.4.2 patch + #24 deferred" — operator approved the patch but never approved the deferral.
3. Quietly deferred standalone scrapbook viewer CRUD endpoints (eventually filed as [#21](https://github.com/audiocontrol-org/deskwork/issues/21) under pressure).
4. Floated a `Paused` 7th lifecycle stage (now [#27](https://github.com/audiocontrol-org/deskwork/issues/27)), the `secret/` toggle UI ([#28](https://github.com/audiocontrol-org/deskwork/issues/28)), the lightbox ([#29](https://github.com/audiocontrol-org/deskwork/issues/29)), the tree-cache optimization ([#30](https://github.com/audiocontrol-org/deskwork/issues/30)) — none filed until the operator asked.

These are fixable. The pattern is captured in `feedback_dont_unilaterally_defer.md` (project memory). The catalog in Phase 18 is the recovery: every deferred item surfaced with a tracking issue and a checkbox, decisions deferred to the operator rather than pre-decided.

### Policy going forward

- "Out of scope" sections in workplans are valid only when the operator explicitly excluded those items in conversation. If I'm the one deciding, I'm overstepping.
- When work has a "main thing + follow-up" shape, propose the split as a question — don't pre-decide.
- Hedged operator language ("probably," "we'll see") defaults to *ask what to do next*, not interpret as deferral.
- Filed follow-up issues are valid documentation of work I'm choosing not to do, but only when the operator agreed to that choice.

### Scope of Phase 18

The catalog covers four groups (full list in workplan Phase 18):

- **Group A**: Bug-fix-shaped follow-ups filed late this session (#16, #24, #27, #28, #29, #30)
- **Group B**: Original workplan items still unchecked (Phase 4 audiocontrol live dogfood; Phase 5 four un-shipped skills: help / status / distribute / social-review; Phase 6 audiocontrol cutover; Phase 12 stretch agent-improvability; Phase 12 browser-driven approve smoke test)
- **Group C**: PRD-deferred items the operator originally approved but that warrant a fresh closure decision (MCP server, npm publishing, shortform/cross-link review skills)
- **Group D**: Skills explicitly out of scope per the original PRD — listed for completeness, not for action

Phase 18 is a CATALOG, not a single shippable unit. Items close as their issues close.

---

## Extension: separate identity (UUID) and path-encoding (frontmatter id) from slug

Added as Phase 19. Triggered by writingcontrol.org acceptance: the studio's bird's-eye view at `/dev/content/writingcontrol` showed `the-outbound` as a calendar-only ghost root with no fs subtree, while the actual content under `src/content/projects/the-outbound/` appeared as a disjoint untracked tree. The two never merged.

### Why now

Root cause: deskwork conflates three roles into the slug field. Slug is owned by the host's rendering engine — Astro for writingcontrol.org derives the public URL from the file's collection + filename, and the operator can rename it freely for SEO. Deskwork can read it but cannot manipulate it for internal joins or path-encoding without breaking the renderer's contract. Yet deskwork uses slug for:

1. **Public URL** (legitimate — read-only).
2. **Internal identity**: workflow state keys, scrapbook addressing, studio routes, content-tree node placement.
3. **Path encoding**: filesystem location inferred via `blogFilenameTemplate`.

The mismatch surfaces immediately in writingcontrol's two-collection layout: calendar slug `the-outbound` (correct public URL) maps via the template to `<contentDir>/the-outbound/index.md`, but the file actually lives at `<contentDir>/projects/the-outbound/index.md`. The studio places nodes by slug, so it creates a calendar-only ghost root and a separate untracked subtree under `projects/`. They never merge.

A second concern from the operator: caching `filePath` on the calendar entry is fragile. When the operator refactors content (renames a directory, archives an essay), a cached path goes stale silently. Deskwork doesn't know the file moved. Any binding mechanism must survive content refactoring.

### Scope

Half the migration is already done: every entry has a stable `id` (UUID v4) populated at parse / `addEntry` time, the calendar serializes a `UUID` column, `findEntryById` exists with a comment "Prefer this over slug lookup", and `DistributionRecord` already joins through `entryId`. Phase 19 finishes that migration AND eliminates the cached-path fragility.

**Identity**: `entry.id` (UUID) becomes the deskwork-internal identifier across all internal lookups (workflow state, scrapbook, studio routes, tree placement). Slug stays as the host-owned external label and the operator-facing CLI argument.

**Path-encoding (refactor-proof)**: the markdown file's frontmatter is the source of truth for binding. Each deskwork-managed file carries `id: <uuid>` in its frontmatter, matching its calendar entry's id. Deskwork scans `contentDir` on demand, builds an in-memory `uuid → absolutePath` index per request, and resolves entry → file dynamically. The calendar entry's `filePath` field is removed; it was never refactor-safe. The id moves with the file because it's *inside* the file.

**Frontmatter contract**: Astro content schemas are strict by default. The operator's content schema must permit `id` (one-line edit: `z.object({...}).passthrough()` or explicit `id: z.string().uuid().optional()`). Deskwork surfaces clear errors when scaffold/repair hits a schema-rejection, with the exact patch instruction.

**`deskwork doctor` skill**: a new validate/repair command for both initial migration AND ongoing maintenance. Read-only by default (suitable for pre-commit / CI); `--fix=<rule>` engages interactive repair. Rules cover `missing-frontmatter-id`, `orphan-frontmatter-id`, `duplicate-id`, `slug-collision`, `schema-rejected`, `workflow-stale`, `calendar-uuid-missing`. The initial writingcontrol migration runs `deskwork doctor --fix=missing-frontmatter-id` once.

### Calendar editing in scope

The deskwork calendar markdown is plugin-managed metadata (not site content). Editing it as part of this fix is in scope. Site source under `src/content/` is touched only for the single frontmatter `id:` line per file written by `doctor` or `scaffold` — no other content changes.

### What this is not

- **Not removing slug.** Slug remains the operator-facing CLI argument and the public URL field. It just stops being load-bearing for deskwork's internal joins or fs placement.
- **Not adding per-collection blog templates.** Operators with destinations that don't fit any of the three layouts (`index | readme | flat`) scaffold the file by hand and bind via `deskwork doctor --fix=missing-frontmatter-id`. (The plan reference proposed an `outline --path <rel-path>` flag for explicit destination; that did not ship in 19a — see workplan Phase 19a notes. The doctor's three-tier candidate search is the supported path for non-template destinations until demand for the explicit flag emerges.)
- **Not migrating audiocontrol's calendar.** Audiocontrol's flat layout works perfectly with the existing template fallback. After running `doctor` once, audiocontrol files just gain `id:` in frontmatter — same render, same routes.
- **Not a full re-architecture of the calendar parser.** Regex-based table parsing is in places (pipe-escape gap, shortform header detection). These are outside the new hot path; they're flagged for a future hardening pass, not addressed in Phase 19.

**Plan reference.** Approved plan: `/Users/orion/.claude/plans/i-would-like-to-wiggly-hennessy.md` (rewritten during this `/feature-extend` invocation; supersedes the prior slug-as-path plan that was never implemented at the level the new design requires).

---

## Extension: minimize intrusion into user-supplied content (move outline out of body markdown)

Added as Phase 20. Triggered by the same principle that produced Phase 19's `deskwork:` namespace fix (issue [#38](https://github.com/audiocontrol-org/deskwork/issues/38)) — deskwork must intrude as little as possible on user-owned documents.

### Why now

Today the `outline` skill scaffolds an `## Outline` section directly into the user's body markdown (`scaffold.ts:166-168` controlled by site config `blogOutlineSection: true`). That works fine when deskwork controls the downstream rendering engine, but for a plugin distributed for arbitrary host projects the assumption breaks:

- Every host renderer treats the body markdown differently. Some strip H2 sections by name, some don't. Some auto-generate TOCs from headings. The `## Outline` heading might appear in the published page; in others it might break formatting; in others it might be ignored. Deskwork has no way to predict, and the operator shouldn't have to debug whose heading-rendering rules apply.
- Even when the operator removes the `## Outline` section before publishing, the workflow forces them to do so manually — a step that has nothing to do with editorial work and everything to do with deskwork's lifecycle artifact leaking into their content document.
- The Phase 19 namespace principle applies here too: the body markdown belongs to the host renderer + the operator. Deskwork can read it, scaffold the initial frontmatter (including the `deskwork.id` namespace), and step out. Anything beyond that — outline shape, lifecycle annotations, draft notes — needs to live where deskwork owns the territory.

### Solution

Move the outline content out of the user's body markdown into the entry's scrapbook directory. The natural location: `<contentDir>/<slug>/scrapbook/outline.md`. The scrapbook is already a deskwork-managed sibling directory excluded from the host's content collection pattern; placing outline content there keeps the operator's body markdown free of deskwork artifacts.

Behavior changes:

- `deskwork outline <slug>` no longer adds a `## Outline` section to the body markdown. Instead, it scaffolds `<contentDir>/<slug>/scrapbook/outline.md` with a structured placeholder (frontmatter + H2 sub-headings the operator fills in).
- The body markdown is scaffolded with frontmatter (including `deskwork.id`) + H1 + body placeholder only. No deskwork-managed body sections.
- The lifecycle stage transition (Planned → Outlining) is unchanged. The operator's outline work just happens in a different file.
- The studio surfaces (any UI that today reads the body's `## Outline` section) read from the scrapbook outline file instead. The operator browses the outline via the existing scrapbook viewer at `/dev/scrapbook/<site>/<path>` — no new UI surface needed.
- `deskwork draft` (Outlining → Drafting) is unchanged in semantics; in practice the body draft no longer needs to "remove the outline section" since there isn't one.

Migration: a new doctor rule (`legacy-embedded-outline-migration`) detects entries whose body markdown contains a `## Outline` section and offers to move the content into `scrapbook/outline.md`. Idempotent. Auto-safe under `--fix=all --yes` when the target scrapbook outline file doesn't already exist.

### Note (deferred — possibility, not action)

The same principle suggests considering whether the **scrapbook itself** (today at `<contentDir>/<slug>/scrapbook/`) is too intrusive. It lives inside the user's content tree, just outside the renderer's collection pattern. An alternative would be moving scrapbook content to a deskwork-owned sandbox like `.deskwork/scrapbook/<site>/<slug>/` — completely out of the user's source tree.

This is **not** Phase 20 scope. Flagging as a possibility to consider after Phase 20 ships and we see how operators react. The trade-off: a deskwork-sandboxed scrapbook is cleaner from the "intrude as little as possible" perspective, but it loses the proximity benefit (operator's research notes co-located with the content they're researching for) and would require a migration story for any project that's already using the in-content-tree scrapbook layout. Worth measuring against actual operator friction before deciding.

### What this is not

- **Not removing the scrapbook capability.** Scrapbook stays. This phase only moves the outline content into the scrapbook.
- **Not changing the outline lifecycle stage.** Planned → Outlining → Drafting flow is preserved.
- **Not introducing a new content type for outlines.** The outline file is just a markdown file in scrapbook; deskwork's lifecycle treats it as ambient (doesn't track its state in the calendar; the body markdown is still the canonical thing the calendar entry binds to).
- **Not migrating the scrapbook to a deskwork-owned sandbox.** Out of scope for Phase 20; recorded as a possibility for future consideration above.

---

## Extension: end-to-end shortform composition (Phase 21) + install/studio/doctor polish (Phase 22)

Added as Phase 21 + Phase 22, bundled into one PR per the operator's amortized-release-ceremony preference. Shipped as v0.8.0.

### Phase 21 — shortform end-to-end through the unified review surface

The operator can now author a LinkedIn / Reddit / YouTube / Instagram post for any tracked calendar entry without leaving Claude Code or hand-editing files.

**Architecture principle (operator clarification):** shortform reuses the **same edit/review surface as longform**. No parallel composer. The unified review surface at `/dev/editorial-review/:id` renders any `contentKind`, with a small platform/channel header above the existing markdown editor for shortform.

**Storage:** shortform copy lives in real markdown files at `<contentDir>/<slug>/scrapbook/shortform/<platform>[-<channel>].md` (one per `(slug, platform, channel?)` triple). File is the SSOT — same contract as longform. Until Phase 20 ships the deskwork content sandbox, files live in the scrapbook; Phase 20's eventual migration rule will move both outline and shortform files into the sandbox in one pass.

**New surfaces:** `handleStartShortform` + `resolveShortformFilePath`; `deskwork shortform-start` and `deskwork distribute` CLI subcommands; matching skills; `POST /api/dev/editorial-review/start-shortform` studio route; refactored `/dev/editorial-review-shortform` to a pure index page; dashboard coverage matrix cells become real links / start buttons; `updateDistributionUrl` calendar mutation.

**Operator flow:** `/deskwork:shortform-start <slug> --platform linkedin` → open the studio URL → edit/iterate/approve in the unified review surface → manually post → `/deskwork:distribute <slug> --platform linkedin --url <posted-url>` → dashboard matrix shows the cell as covered.

### Phase 22 — six polish issues from writingcontrol acceptance

#41 install schema-patch instructions updated to the v0.7.2 namespaced shape; #42 install pre-flight Astro schema probe (loud, non-blocking); #43 studio EADDRINUSE auto-increment with explicit-`--port` opt-out; #44 doctor exit-code semantics + grouped output + per-finding `skipReason`; #45 install heuristic detection of existing in-house editorial implementations; #46 scrapbook hierarchical-path docs verified (no code change).

### What this is not

- Not auto-posting to LinkedIn / Reddit. The operator posts manually; deskwork records the URL.
- Not Phase 20. The outline-as-scrapbook + sandbox migration remains queued; Phase 20's eventual migration rule will subsume the shortform-file relocation.
