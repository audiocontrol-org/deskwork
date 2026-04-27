## Workplan: deskwork-plugin

### Phase 1: Monorepo bootstrap and plugin skeleton

**Deliverable:** Empty but valid plugin that installs via Claude Code marketplace

Tasks:
- [x] Create the monorepo with README and LICENSE
- [x] Create plugins/deskwork/.claude-plugin/plugin.json
- [x] Create root .claude-plugin/marketplace.json (relative-path source; pluginRoot=./plugins — see note below)
- [x] Create the install skill skeleton (SKILL.md only, no logic yet)
- [x] Validate the plugin installs with `claude plugin validate` and `claude --plugin-dir`

**Acceptance Criteria:**
- [x] `claude --plugin-dir plugins/deskwork` loads without errors
- [x] `/deskwork:install` is visible in the skill list

**Notes:**
- The workplan originally specified a `git-subdir` entry, but since the marketplace and plugin share a repo the correct pattern is a relative-path source under `metadata.pluginRoot: "./plugins"`. `git-subdir` is for pointing at a plugin inside a *different* monorepo. The marketplace.json uses the relative-path form and still works for users who add the marketplace via git.

---

### Phase 2: Adapter layer and config schema

**Deliverable:** Working adapter that reads a config file and resolves paths, frontmatter, and calendar location

Tasks:
- [x] Define the config JSON schema (`lib/config.ts` — `DeskworkConfig`, version 1)
- [x] Write the config reader (`lib/config.ts` — `parseConfig` + `readConfig`)
- [x] Write the path resolver (`lib/paths.ts`)
- [x] Write the frontmatter reader/writer (`lib/frontmatter.ts`, uses `yaml`)
- [x] Write the calendar parser (`lib/calendar.ts` + `lib/calendar-mutations.ts`)
- [x] Write the install skill: explore project, ask questions, write config, create calendar file (`bin/deskwork-install.ts` + `skills/install/SKILL.md`)

**Acceptance Criteria:**
- [x] The install helper can run against an audiocontrol-shaped project and produce a valid config (verified end-to-end — the helper validates, writes `.deskwork/config.json`, and seeds calendar files). The skill itself drives Claude through exploring, confirming, and invoking the helper.
- [x] The adapter correctly resolves paths for both audiocontrol and editorialcontrol sites (covered by `paths.test.ts` using the actual dual-site config shape)
- [x] The calendar parser reads the existing audiocontrol.org calendar without data loss (round-trip test against the live `~/work/audiocontrol.org/docs/editorial-calendar-audiocontrol.md` passes — parse → render → parse produces identical data)

**Notes:**
- Library-internal imports use sibling-relative paths (`./types.ts`) instead of `@/lib/...` — the `@/` alias is a build-time convenience that doesn't resolve under tsx at runtime, which bin/ scripts need. Tests keep `@/` because Vitest resolves the alias.
- The install helper ships as `bin/deskwork-install.ts` (tsx shebang) — Node/tsx require a file extension to recognize TypeScript, so the plugin's bin/ entries are `.ts` files rather than extensionless scripts.

---

### Phase 3: Core lifecycle skills

**Deliverable:** add, plan, draft, publish skills working through the adapter

Tasks:
- [x] Extract editorial-add logic into plugins/deskwork/skills/add/SKILL.md (+ `bin/deskwork-add.ts`)
- [x] Extract editorial-plan logic into plugins/deskwork/skills/plan/SKILL.md (+ `bin/deskwork-plan.ts`)
- [x] Extract editorial-draft logic into plugins/deskwork/skills/draft/SKILL.md (+ `bin/deskwork-draft.ts`, `lib/scaffold.ts`)
- [x] Extract editorial-publish logic into plugins/deskwork/skills/publish/SKILL.md (+ `bin/deskwork-publish.ts`)
- [x] Parameterize all hardcoded paths and site names to use adapter config — zero audiocontrol-specific strings in plugin code
- [x] Extract backing scripts into plugins/deskwork/bin/ — four helper scripts plus `lib/cli.ts` for shared argv parsing

**Acceptance Criteria:**
- [x] Each skill produces the same calendar mutations as the project-local version — lifecycle integration tests exercise add→plan→draft→publish against a tmp project
- [x] Skills read config via the adapter (`readConfig` + `resolvePaths`), not hardcoded paths
- [x] No audiocontrol-specific assumptions in skill logic — `SITES` constant removed, sites come from config, layout/author are config fields
- [x] Plugin validates and all 5 skills (`install` + 4 lifecycle) appear in `/deskwork:*`

**Notes:**
- GitHub issue creation/closing is intentionally outside the helpers — Claude runs `gh issue create` / `gh issue close` and feeds the number to `deskwork-draft --issue <n>`. This keeps the helpers dep-free and testable without a GitHub stub.
- `lib/cli.ts` holds shared argv parsing (`parseArgs`, `absolutize`, `fail`, `emit`) used by all 5 `bin/` scripts.
- Config schema grew two optional fields: top-level `author` and per-site `blogLayout`, both required by `deskwork-draft` when scaffolding a blog post. The draft helper fails loudly with guidance if either is missing.

---

### Phase 4: Dogfood in audiocontrol.org

**Deliverable:** audiocontrol.org running plugin lifecycle skills alongside old skills

Tasks:
- [ ] Install deskwork plugin in audiocontrol.org (marketplace or plugin-dir)
- [ ] Run /deskwork:install to generate config
- [ ] Test /deskwork:add against the live calendar
- [ ] Test /deskwork:plan against the live calendar
- [ ] Test /deskwork:draft against the live calendar
- [ ] Test /deskwork:publish against the live calendar
- [ ] Compare outputs with old project-local skill results

**Acceptance Criteria:**
- All four lifecycle skills produce identical calendar mutations to the old skills
- No data loss or corruption in the editorial calendar
- Config file correctly maps both audiocontrol and editorialcontrol sites

---

### Phase 5: Visibility and distribution skills

**Deliverable:** help, status, distribute, social-review skills working through the adapter

Tasks:
- [ ] Extract editorial-help logic into plugins/deskwork/skills/help/SKILL.md
- [ ] Extract editorial-review logic into plugins/deskwork/skills/status/SKILL.md
- [ ] Extract editorial-distribute logic into plugins/deskwork/skills/distribute/SKILL.md
- [ ] Extract editorial-social-review logic into plugins/deskwork/skills/social-review/SKILL.md
- [ ] Parameterize all paths to use adapter config
- [ ] Test against audiocontrol.org live calendar

**Acceptance Criteria:**
- Each skill produces identical output to the project-local version
- Status display correctly reflects all calendar stages

---

### Phase 6: Cut over and cleanup

**Deliverable:** audiocontrol.org fully migrated to the deskwork plugin, old skills removed

Tasks:
- [ ] Remove old editorial-* skills from audiocontrol.org .claude/skills/
- [ ] Remove scripts/lib/editorial/ and related backing code from audiocontrol.org
- [ ] Update audiocontrol.org CLAUDE.md to reference plugin skills instead of project-local skills
- [ ] Verify the editorial calendar operates normally with only plugin skills
- [ ] Tag deskwork plugin v0.1.0

**Acceptance Criteria:**
- No project-local editorial skills remain in audiocontrol.org
- The editorial calendar operates identically to pre-migration
- Plugin is tagged v0.1.0 and installable via marketplace

---

## Extension: severance from Astro + headless/UI split

Added mid-implementation. See PRD "Extension" section for motivation. Approved plan: `/Users/orion/.claude/plans/i-would-like-to-wiggly-hennessy.md`.

The original Phase 4 (dogfood in audiocontrol.org) moves to Phase 12 to follow the architectural restructure. Phase 5 (visibility/distribution skills) and Phase 6 (cutover) remain unchanged but happen after Phase 12.

---

### Phase 7: Extract @deskwork/core npm package

**Deliverable:** Pure library package consumable as `@deskwork/core` from cli and studio packages

Tasks:
- [x] Convert repo to npm workspaces (`packages/*` + `plugins/*`)
- [x] Move `plugins/deskwork/lib/*` → `packages/core/src/*`
- [x] Define subpath exports (`@deskwork/core/calendar`, `@deskwork/core/review/handlers`, etc.)
- [x] Update test imports across the workspace
- [x] All 126 core tests pass under the new layout

**Acceptance Criteria:**
- [x] `packages/core/package.json` declares 16 subpath exports mapping to `.ts` source files
- [x] Tests resolve `@deskwork/core/*` via npm workspace symlinks
- [x] No cross-plugin `../` imports remain

**Commit:** `b8d49c5`

---

### Phase 8: Extract @deskwork/cli with single dispatcher

**Deliverable:** A `deskwork` CLI binary exposing all 12 lifecycle subcommands via one entry point

Tasks:
- [x] Create `packages/cli/src/cli.ts` dispatcher with SUBCOMMANDS map
- [x] Move 12 bin scripts → `packages/cli/src/commands/<name>.ts` exporting `run(argv)`
- [x] Inject `process.cwd()` as project root when first positional isn't path-like
- [x] Replace `bin/deskwork-X.ts` references in 12 SKILL.md files with `deskwork <subcommand>`
- [x] Add bash wrapper at `plugins/deskwork/bin/deskwork` that finds workspace bin first, falls back to `npx -y @deskwork/cli@latest`
- [x] Delete obsolete plugin-local `bin/`, `lib/`, `test/`, `tsconfig.json`, `vitest.config.ts`

**Acceptance Criteria:**
- [x] All 27 cli integration tests pass
- [x] SKILL.md invocations exercise the dispatcher, not bin scripts
- [x] Plugin shell ships zero TypeScript

**Commit:** `7c2d64c`

---

### Phase 9: Build @deskwork/studio (Hono server + scaffolds)

**Deliverable:** Standalone web server exposing the 6 review API routes + 3 page renders

Tasks:
- [x] Add Hono + @hono/node-server deps under `packages/studio/`
- [x] Build `packages/studio/src/server.ts` with createApp(ctx) factory + main() loop
- [x] Wire 6 route handlers in `routes/api.ts` (annotate, listAnnotations, decision, getWorkflow, createVersion, startLongform)
- [x] Add CLI args `--project-root` (default cwd) and `--port` (default 4321)
- [x] Detect symlinked bin entry via `realpathSync(process.argv[1])`
- [x] Scaffold 3 page renderers (dashboard, review, shortform) embedding data as `<script type="application/json">`
- [x] In-process tests via `app.fetch(new Request(...))`

**Acceptance Criteria:**
- [x] 12/12 studio tests pass (covers all 6 API routes + 3 page renders + redirect)
- [x] Live boot: `deskwork-studio --port 47321` returns 200 on dashboard, 302 on root, 200 on shortform, 404 on missing workflow
- [x] No Astro deps anywhere in the studio package

**Commit:** `3c47709`

---

### Phase 10: Port studio UI assets verbatim from audiocontrol

**Deliverable:** Studio dashboard renders identically to audiocontrol's Astro version

Tasks:
- [ ] Copy `editorial-review-client.ts` (~1,609 lines) → `packages/studio/public/client.ts`
- [ ] Copy `editorial-review-editor.ts` (~201 lines) → `packages/studio/public/editor.ts`
- [ ] Copy `editorial-studio-client.ts` (~643 lines) → `packages/studio/public/studio-client.ts`
- [ ] Copy `editorial-review.css` (~2,269 lines) → `packages/studio/public/review.css`
- [ ] Copy `editorial-studio.css` (~171 lines) → `packages/studio/public/studio.css`
- [ ] Replace 3 page render scaffolds with full template ports (~400 lines of HTML-string conversion)
- [ ] Pre-bundle TS for v0.1 (no esbuild step at install time)
- [ ] Wire `app.use('/static/*', serveStatic(...))` for assets

**Acceptance Criteria:**
- Manual: open `http://localhost:4321/dev/editorial-studio` against the local audiocontrol clone (`./.audiocontrol.org/`, gitignored); dashboard loads with live workflows
- Browser: dashboard → review → approve click-through works
- API responses match audiocontrol's existing routes byte-for-byte (handlers are reused; only HTTP plumbing differs)

---

### Phase 11: Add deskwork-studio plugin shell + marketplace entry

**Deliverable:** Second plugin in the marketplace that wraps the studio launch

Tasks:
- [ ] Create `plugins/deskwork-studio/.claude-plugin/plugin.json`
- [ ] Create `plugins/deskwork-studio/skills/studio/SKILL.md` invoking `npx @deskwork/studio`
- [ ] Add bash wrapper at `plugins/deskwork-studio/bin/deskwork-studio` (workspace-first, npx fallback)
- [ ] Register `deskwork-studio` plugin in `.claude-plugin/marketplace.json` alongside `deskwork`
- [ ] `claude plugin validate plugins/deskwork-studio` passes

**Acceptance Criteria:**
- Marketplace lists both plugins
- `claude --plugin-dir plugins/deskwork-studio` shows `/deskwork-studio:studio` in the picker
- Headless users can install `deskwork` alone with no Hono in their tree

---

### Phase 12 stretch: Agent-improvability pillar (deferred)

**Deliverable:** Concrete architectural pivot that preserves the "agent improves the tooling as you work" pillar.

This phase is documented in the PRD's "Philosophical Pillar" section but is **not in v0.1 scope**. v0.1 ships with the npm-package distribution model. The pivot triggers when the first deskwork operator hits friction trying to fix a rough edge in the plugin from inside their project.

Likely synthesis (per PRD): plugin-as-clone install model (Option F) plus project-level extension seams (Option C). Concrete tasks deferred until the trigger condition fires.

---

### Phase 12: End-to-end dogfood (CLI + studio) against sandbox

**Deliverable:** Full editorial lifecycle exercised through the new architecture

Tasks:
- [x] Run `add → plan → outline → draft → review-start → review-cancel` via `deskwork` CLI against the in-tree audiocontrol clone at `./.audiocontrol.org/` (lifecycle: Ideas → Planned → Outlining → Drafting → review open → cancelled)
- [x] Boot studio against the sandbox via `deskwork-studio --project-root ... --port 47325`
- [x] Verify all 5 dev routes return 200 (`/dev/editorial-studio`, `/dev/editorial-help`, `/dev/editorial-review-shortform`, `/dev/editorial-review/<slug>`, `/dev/scrapbook/<site>/<slug>`)
- [x] Verify dashboard reflects new entry (10 references found in rendered HTML across calendar rows + workflow links)
- [x] Verify review page renders with the entry's actual title pulled from frontmatter
- [x] Exercise studio APIs: `/api/dev/editorial-review/render` (markdown→HTML round-trip), `/api/dev/editorial-review/workflow` (returns workflow + versions), `/api/dev/editorial-review/annotate` (validates input), `/api/dev/editorial-review/annotations` (returns list)
- [x] Cancel workflow via CLI, confirm studio dashboard reflects cancelled stamp
- [ ] ~~Approve cycle through browser~~ — deferred; requires interactive in-browser annotation. The pipeline is wired (workflow → annotate → decision → approve) and exercised at the API level; full browser-driven approve is a manual smoke test for the operator post-merge.

**Acceptance Criteria:**
- [x] All lifecycle skills succeed end-to-end through the CLI
- [x] Studio UI loads and exposes the full surface against the sandbox
- [x] Calendar mutations land in `docs/editorial-calendar-audiocontrol.md` (sandbox calendar updated for the dogfood slug)
- [x] 176 tests pass after dogfood (126 core + 27 cli + 23 studio)

**Notes:**
- Sandbox carries a permanent `deskwork-plugin-dogfood` slug as evidence; future dogfood runs use a different slug or reuse this one as a fixture.
- The "decision: ready to publish to npm" question — deferred until the agent-improvability pillar (PRD section) gets revisited. Publishing to npm makes sense if we keep the thin-shell-over-npm distribution model; if we pivot to plugin-as-clone (Option F), npm publishing becomes optional.

---

### Phase 13: Hierarchical content + scrapbook secret subdir

**Deliverable:** Calendar entries support hierarchical slugs with operator-chosen file layouts; scrapbooks are addressable at any directory path within `contentDir` and segregate `scrapbook/secret/*` from public items.

Scope settled on (after exploring the writingcontrol.org dogfood site, which uses both flat `essays/<slug>/index.md` and hierarchical `projects/<slug>/<sub>/<sub-sub>/...` collections):

Tasks:
- [x] Slug regex relaxed to accept `/`-separated kebab segments; `CalendarEntry.filePath?` records the per-entry on-disk path; calendar parser/renderer adds optional `FilePath` column (legacy calendars unchanged).
- [x] `scrapbook.ts` — `listScrapbook` returns `{ items, secretItems }`; `SECRET_SUBDIR = 'secret'` is the well-known private path; `ScrapbookLocation { secret? }` threaded through the CRUD API.
- [x] `scaffold.ts` — `ScaffoldOptions { authorOverride?, layout? }`; layout values `'index' | 'readme' | 'flat'` produce `<slug>/index.md`, `<slug>/README.md`, `<slug>.md` respectively.
- [x] CLI: `add --slug <path>` for explicit hierarchical slug; `outline --layout <index|readme|flat>` for per-entry on-disk shape; lifecycle commands accept hierarchical slugs (regex relaxation only).
- [x] Studio scrapbook route `/dev/scrapbook/:site/:path{.+}` accepts arbitrary depth; page renders ancestor breadcrumb + secret section; secret items carry `data-secret="true"`.
- [x] Studio dashboard sorts by (site, slug) so hierarchical clusters are contiguous; rows under a slug with `/`s carry `data-depth=N` + `--er-row-depth` CSS variable; CSS adds an indent + faint vertical rule + leaf vs. ancestor styling.
- [x] Skill prose: `outline/SKILL.md` documents `--layout`, `add/SKILL.md` documents `--slug` and the leaf-on-demand rule.

**Acceptance Criteria:**
- [x] All 7 sub-phases land as separate commits for granular review.
- [x] Total tests after Phase 13: ≥ 217 (126 + 30 hierarchy = 156 core, 27 + 6 = 33 cli, 24 + 4 = 28 studio).
- [x] audiocontrol's flat-blog calendars and the studio dashboard for that project render unchanged (full backward-compat verified by pre-existing tests still passing).
- [x] writingcontrol.org sandbox can be driven through `add → plan → outline --layout readme` for a depth-3 slug.

**Notes:**
- `addEntry` does NOT auto-create ancestor entries when a deep leaf is added — each entry stands alone. The operator promotes intermediate directories to tracked entries explicitly when they want them tracked through the lifecycle.
- The host project's content-collection patterns determine which on-disk shapes ship publicly; deskwork's job is to honor whatever the operator picks per-entry, not to enforce a public/private distinction at the file-naming layer.

---

### Phase 14: Versioning, release process, and build correctness

**Deliverable:** Stale-bundle commits become structurally impossible (pre-commit hook + CI safety net), formal release procedure produces tagged GitHub releases, and operators have a documented update + pinning story.

Tasks:
- [ ] Add `husky` as a workspace devDep with `prepare` hook so contributors get the git hooks installed automatically on `npm install`.
- [ ] Add `.husky/pre-commit` that detects staged files under `packages/{cli,studio}/src/` and runs `npm --workspace packages/<name> run build`, then re-stages the rebuilt bundle. If the bundle output diverges from what's staged, fail loudly with the diff path.
- [ ] Add `scripts/bump-version.mjs` (tsx runner) that takes a version arg and updates atomically: root `package.json`, every workspace `package.json`, `.claude-plugin/marketplace.json` (top-level + per-plugin entries), `plugins/deskwork/.claude-plugin/plugin.json`, `plugins/deskwork-studio/.claude-plugin/plugin.json`.
- [ ] Add `.github/workflows/check.yml` — on PR: install + run all tests + verify bundles match `npm run build` output (rebuild + `git diff --exit-code packages/*/bundle/`).
- [ ] Add `.github/workflows/release.yml` — on `v*` tag push: install, build, run tests, then `gh release create` with auto-generated notes from commits since the previous tag.
- [ ] Add `RELEASING.md` at the repo root documenting the manual release flow: `npm run version <semver>` → review diff → commit → `git tag v<semver>` → push tag → workflow creates the release.
- [ ] Bump every manifest from `0.0.1` to `0.1.0` via the new script.
- [ ] Tag `v0.1.0` at the resulting commit and push; verify the release workflow produces a GitHub release.
- [ ] Update root `README.md` with: (a) explicit operator update instructions (`/plugin marketplace update deskwork && /reload-plugins`), (b) pinning instructions (`/plugin marketplace add audiocontrol-org/deskwork#v0.1.0`), (c) link to `RELEASING.md` for contributors.
- [ ] Update `plugins/deskwork/README.md` and `plugins/deskwork-studio/README.md` with a brief "Updates" section pointing at the root README.

**Acceptance Criteria:**
- [ ] Staging a source change under `packages/cli/src/` without rebuilding bundles either rebuilds + re-stages automatically (pre-commit), or the commit fails with a clear path-pointer.
- [ ] `gh release view v0.1.0` returns a published release with auto-generated notes covering commits since the project began (or since `v0.0.x`, if any).
- [ ] CI workflow on a PR with stale bundles fails with the bundle path called out in the failure log.
- [ ] All workspace manifests + plugin manifests + marketplace manifest report version `0.1.0`; running `npm run version 0.1.1` correctly bumps every one.
- [ ] README has a top-level "Getting updates" subsection that an operator can find by skimming.

**Notes:**
- Husky's pre-commit cost: ~1 second when no source changed, ~5 seconds when bundles need rebuilding (esbuild is fast). Acceptable.
- The CI workflow doubles as a regression gate — it runs the full test suite on every PR. If we add more packages later, the workflow's `npm --workspaces test` line scales without changes.
- Release notes are auto-generated from commit messages between tags. We've been writing meaningful commit messages all along; that pays off here. No special prefix convention required.
- Version bump is intentionally manual — the script writes, you review the diff and decide whether to commit. No "auto-publish on every merge" semantics.

---

### Phase 15: `deskwork ingest` — backfill existing content into the calendar

**Deliverable:** A new `deskwork ingest` subcommand that walks a project's existing markdown/MDX files and populates the editorial calendar at the right stage, layout-agnostic. Closes [#15](https://github.com/audiocontrol-org/deskwork/issues/15).

Tasks:
- [x] `packages/core/src/ingest.ts` — discovery primitive. Inputs: a list of paths (file, directory, glob). Outputs: `IngestCandidate[]` with `{ filePath, frontmatter, derivedSlug, derivedState, derivedDate, source: 'frontmatter'|'path'|'mtime'|'today' }`. Recursive directory walking + glob expansion. No mutations.
- [x] `packages/core/src/ingest.ts` — slug derivation. `<dir>/index.md` → parent dir name. Jekyll `YYYY-MM-DD-<slug>.md` recognized. Else filename minus extension. Slug field name configurable.
- [x] `packages/core/src/ingest.ts` — state derivation. `--state-from frontmatter` (default) reads `state:` field, normalizes to a calendar lane. `--state-from datePublished` infers from date relative to today. Unknown states report ambiguous; require `--state` override.
- [x] `packages/core/src/ingest.ts` — date derivation. Tries `datePublished`, then `date`, then file mtime, then today. Records the source.
- [x] `packages/core/src/ingest.ts` — idempotency. Filter candidates against the existing calendar; emit `IngestSkip[]` for duplicates with reason. `--force` bypasses after manual reconciliation.
- [x] `packages/cli/src/commands/ingest.ts` — dispatcher entry. Argv shape: `[<project-root>] [--site <slug>] [options] <path>...`. Parses flags, calls core, prints plan, applies on `--apply`.
- [x] `packages/cli/src/commands/ingest.ts` — dry-run output. Pretty-print the plan: per-file `{ slug, state, date, source-of-each, action: 'add'|'skip' }`. Single line per file. `--json` for machine-readable.
- [x] `packages/cli/src/commands/ingest.ts` — apply path. On `--apply`, write calendar rows via `addEntry` (or a new `bulkAddEntries`); also append a journal entry per ingested file (event shape: `'ingest'`, captures source frontmatter snapshot for provenance).
- [x] `plugins/deskwork/skills/ingest/SKILL.md` — operator-facing prompt. When to use ingest vs. add. The dry-run-first contract. Layout-agnostic discovery examples (Astro / Hugo / Jekyll / Eleventy / plain). Common flag combinations.
- [x] `packages/core/test/ingest.test.ts` — unit coverage for slug derivation, state derivation, date derivation, idempotency, frontmatter field-name overrides, glob expansion.
- [x] `packages/cli/test/ingest-integration.test.ts` — end-to-end against tmp project trees: Astro-shaped (`<slug>/index.md`), Hugo-shaped (leaf bundles), Jekyll-shaped (`YYYY-MM-DD-<slug>.md`), flat (`<slug>.md`), mixed states (published / draft / future-dated).

**Acceptance Criteria:**
- [x] `deskwork ingest <path>` (no `--apply`) prints a complete plan to stdout and writes nothing to disk; exit 0 even if every file would be skipped (so it composes with shell pipelines).
- [x] `deskwork ingest <path> --apply` writes calendar rows for non-skipped candidates and journal entries with `event: 'ingest'`. Re-running the same command produces only "skipped" output (idempotent).
- [x] Discovery works against a synthetic Astro tree (`src/content/essays/<slug>/index.md`), Hugo tree (`content/posts/<slug>/index.md`), Jekyll tree (`_posts/2024-01-01-foo.md`), and flat tree (`posts/<slug>.md`) without per-tree configuration — only the path argument differs.
- [x] Files in `scrapbook/` are skipped by default. `blogFilenameTemplate` (when set on the site config) is used as a validation hint, not a hard filter — operators ingesting from a different layout than what new content uses still succeed.
- [x] Frontmatter with unrecognized `state:` values produces a "state ambiguous" report; the operator can re-run with `--state <known-lane>` to commit.
- [x] Slug collision with an existing calendar row reports skipped + reason; `--force` overrides.
- [x] writingcontrol.org dogfood: ingesting `src/content/essays/` lands the three known essays in the right lanes (`whats-in-a-name` + `the-deskwork-experiment` → Published with their `datePublished` values; `on-revising-in-the-open` → Drafting with placeholder date).

**Notes:**
- The `state:` frontmatter field is project-specific. Default mapping: `published` → Published, `draft` → Drafting, `outline`/`outlining` → Outlining, `planned` → Planned, `idea`/`ideas` → Ideas. Anything else is ambiguous and requires an explicit `--state` override.
- The journal entry on ingest is what makes a row reviewable later. Without it, a `review-start` against an ingested slug would have no provenance to anchor against.
- `--apply` is a single global flag, not per-file. Keeps the dry-run discipline coherent: either all of nothing happens, or all of it happens.
- Glob handling uses Node 22+ built-in `fs.glob` (already in use elsewhere in the codebase) rather than adding a new dependency.

**GitHub tracking:** [#15](https://github.com/audiocontrol-org/deskwork/issues/15) is the implementation issue.

---

### Phase 16: Hierarchical content gaps + scrapbook-in-review + bird's-eye content view

**Deliverable:** Three things that close [#18](https://github.com/audiocontrol-org/deskwork/issues/18):
1. Operator-facing documentation that surfaces the hierarchical-content capabilities Phase 13 + Phase 15 already shipped (closes the perception gap that triggered the issue).
2. A scrapbook drawer inside the longform review/edit surface, scoped to the entry's immediate node, modeled on audiocontrol's per-article scrapbook drawer.
3. A new studio surface — `/dev/content` — that shows tracked content as a tree of nodes, drillable, with a per-node detail panel. Complementary to the pipeline-focused dashboard.

Tasks are grouped by sub-phase to allow each to land as a separate PR if needed. Sub-phases are sequential (16a → 16b → 16c → 16d).

#### 16a — Documentation (close perception gap)

- [x] Add a "Hierarchical content" section to `plugins/deskwork/README.md` showing: hierarchical slugs (`<project>/<chapter>`), per-entry on-disk shape (`<slug>/index.md`, `<slug>/README.md`, flat `<slug>.md`), and the `outline --layout {index|readme|flat}` flag.
- [x] Add a "Hierarchical layouts" example block to `plugins/deskwork/skills/ingest/SKILL.md` using the `the-outbound/characters/strivers` shape — show the actual command, the actual slugs produced, and the `directoryIsHierarchicalNode` rule (ancestors prefix the slug only when they have their own `index.md`/`README.md`).
- [x] Add a "Hierarchical content" line to the root `README.md` "Features" / "Capabilities" section so prospective adopters see it before installing.
- [x] Add `docs/1.0/001-IN-PROGRESS/deskwork-plugin/mockups/birds-eye-content-view.html` reference to the feature README.

**Acceptance:** The writingcontrol team — or anyone reading the docs cold — can answer "does deskwork support hierarchical content?" with "yes" within 60 seconds, and find the working example without source-diving.

#### 16b — Smoke verification against writingcontrol.org

- [x] Drive `deskwork ingest src/content/projects/the-outbound/` against the actual writingcontrol.org repo (commit `69cb868` or current HEAD).
- [x] Verify slugs produced match what the design says: `the-outbound`, `the-outbound/characters`, `the-outbound/characters/strivers`, `the-outbound/settings`, `the-outbound/settings/libertardistan`, `the-outbound/structure`. Pure organizational dirs (those without their own `index.md`) do not produce slugs.
- [x] Boot studio against writingcontrol; verify scrapbook viewer at `/dev/scrapbook/writingcontrol/the-outbound/characters/strivers` returns 200 with breadcrumb.
- [x] Capture findings in `docs/1.0/001-IN-PROGRESS/deskwork-plugin/implementation-summary.md` under a new "Phase 16 — writingcontrol.org dogfood" section.

**Acceptance:** End-to-end ingest + studio works against writingcontrol's actual hierarchical project tree; findings recorded.

#### 16c — Scrapbook drawer in longform review/edit surface

- [x] `packages/studio/src/pages/review.ts` — add a scrapbook drawer to the right-hand panel of the review page, scoped to **just the immediate node** (no ancestors). For a review of `the-outbound/characters/strivers`, list items at `<contentDir>/the-outbound/characters/strivers/scrapbook/` (and the `secret/` subdir, separated as on the standalone scrapbook page).
- [x] Reuse `listScrapbook` from `packages/core/src/scrapbook.ts` — the function is already path-addressable per Phase 13.
- [x] Drawer renders item rows with kind badge + name + size + mtime; clicking an item opens the scrapbook viewer at that path. Match the existing scrapbook-page item style for visual continuity.
- [x] **In-browser preview for non-editable items** — image kinds (`png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`) render an inline thumbnail in the drawer row, not just a kind badge; clicking expands to a full preview (lightbox or dedicated `/dev/scrapbook/<site>/<path>/<file>` view). PDFs render via the browser's native PDF viewer in an embedded frame. Plain `.txt` and `.json` files render their content inline (truncated, with a "view full" link) since the browser can show them without download. Markdown items (`md`/`mdx`) continue to be handled as the editable/reviewable path. Anything the browser genuinely can't render (binary blobs, archives, audio/video formats not in scope yet) shows a download link.
- [x] Empty-scrapbook state: render a faded "no scrapbook items" indicator rather than hiding the section entirely. Operators should always see that the drawer exists for this node.
- [x] `packages/studio/test/api.test.ts` (or a new `review-scrapbook.test.ts`) — integration test confirming the review page for an entry with a scrapbook renders the drawer with the expected items, and the review page for an entry without renders the empty state.

**Acceptance:** When reviewing any hierarchical entry, the operator can see the immediate node's scrapbook without leaving the page; clicking through opens the standalone viewer at that path.

#### 16d — Bird's-eye content view

Design reference: [`mockups/birds-eye-content-view.html`](mockups/birds-eye-content-view.html). Three states (top-level, drilldown, drilldown-with-detail) — implementation should match the typographic and spatial language of the mockup, not the literal HTML.

- [x] `packages/studio/src/pages/content.ts` (NEW) — three render functions: `renderContentTopLevel`, `renderContentProject(site, project)`, `renderContentNodeDetail(site, slug)`. Each returns a fully-rendered HTML string per the existing studio convention.
- [x] `packages/core/src/content-tree.ts` (NEW) — derives a tree representation from the calendar's flat entry list plus filesystem walks for directories that aren't tracked entries but have content beneath them. Returns `ContentNode[]` with `{ site, slug, title, lane, hasOwnIndex, scrapbookCount, scrapbookMostRecentMtime, children: ContentNode[] }`.
- [x] `packages/studio/public/content.css` (NEW) — extracted from the mockup: paper/ink palette, Fraunces + Newsreader + JetBrains Mono via Google Fonts (or local copies if Google Fonts is unavailable in dev), tree connectors, detail-panel layout. Loaded only on `/dev/content/*` routes.
- [x] `packages/studio/src/server.ts` — add three routes:
  - `GET /dev/content` → top-level (lists sites + their root projects)
  - `GET /dev/content/:site` → project list for a site (when site has multiple)
  - `GET /dev/content/:site/:project` → drilldown view (`project` accepts `/`-separated slugs)
  - `GET /dev/content/:site/:project?node=<slug>` → drilldown with node detail (or use a separate endpoint that returns just the panel HTML — operator's choice)
- [x] Top-nav in editorial chrome — add a "Content" link alongside "Dashboard" / "Reviews" / "Manual" so the new surface is reachable.
- [x] **Inline review links** — every tree row that corresponds to a tracked calendar entry must expose a direct affordance to `/dev/editorial-review/<slug>`. Suggested treatment: a small marginalia-style action on the right edge of the row (e.g. `→ review`) that's quiet at rest and stronger on row-hover. Pure organizational directories (no tracked entry) get no review link — the affordance is only present where review makes sense. The detail panel's "Open in Review" button stays as the primary affordance for the selected node; the row-level link is the secondary affordance for fast scanning.
- [x] **Inline scrapbook link** — same treatment for nodes whose scrapbook count > 0: a quiet `→ scrapbook` action that jumps to `/dev/scrapbook/<site>/<path>`. Hidden when scrapbook is empty. Both inline links should be reachable by keyboard (focusable with Tab, activatable with Enter) without requiring hover.
- [x] Tests:
  - `packages/core/test/content-tree.test.ts` — unit coverage for tree assembly: flat calendar with hierarchical slugs, mixed (some entries hierarchical + some flat), pure organizational dirs that aren't entries but contain entries beneath, scrapbook count aggregation.
  - `packages/studio/test/content-page.test.ts` — integration: top-level returns 200 with site cards; drilldown returns 200 with tree; node-selected state includes detail panel; routes return 404 for unknown sites/projects.

**Acceptance:**
- The writingcontrol.org sandbox renders the content view at `http://localhost:47321/dev/content/writingcontrol/the-outbound` showing the actual tree.
- Selecting a node populates the detail panel with frontmatter, content preview, and the node's scrapbook listing.
- "Open in Review" jumps to `/dev/editorial-review/<slug>`; "Open Scrapbook" jumps to `/dev/scrapbook/<site>/<path>`.
- Inline `→ review` and `→ scrapbook` affordances appear on every tracked tree row (review link only when the row is a tracked entry; scrapbook link only when scrapbook count > 0). Both keyboard-accessible.
- Non-editable scrapbook items in the node-detail panel preview in the browser using the same rules as the review-page drawer (16c) — image thumbnails inline, full preview on click; plain text / JSON inline-truncated; PDFs in embedded viewer; download fallback for anything else.
- Visual posture matches the Writer's Catalog mockup — the surface feels like a content-author's workspace, not a generic admin dashboard.

**Notes:**
- This phase explicitly does NOT introduce new content types or new lifecycle stages. It operates over the existing calendar + the hierarchical capabilities already shipped in Phase 13/15.
- Scrapbook items are read-only in the bird's-eye view (and in the review drawer). Mutations stay in the standalone scrapbook viewer where the existing UX lives.
- The scrapbook drawer in 16c and the node-detail panel in 16d both list the immediate node's scrapbook. Use the same renderer for both.
- **Shared scrapbook-item renderer**: factor the in-browser preview logic (image thumbnails + lightbox, plain-text / JSON inline truncation, PDF embed, download fallback for genuinely-unrenderable types) into a shared module under `packages/studio/src/components/scrapbook-item.ts` (or similar). All three surfaces consume it: the review-page drawer (16c), the content-view detail panel (16d), and the standalone scrapbook viewer (Phase 13's `/dev/scrapbook/<site>/<path>`). The standalone viewer benefits from the same upgrade — apply it there too as part of 16d so the operator gets consistent preview behavior across surfaces.
- If the tree assembly in 16d is too expensive on large projects (50+ nodes), cache the result per `(site, project)` for the lifetime of the studio process. The tree is bounded by what's on disk + the calendar, so a cache invalidation on either change is straightforward.

**GitHub tracking:** [#18](https://github.com/audiocontrol-org/deskwork/issues/18) is the implementation issue.

**Ships in:** v0.4.0.

---

### Phase 17: Cross-page editorial nav + studio index at `/dev/`

**Deliverable:** Unified cross-page navigation across all studio surfaces, plus a new entry-point index page at `/dev/`. Both surfaces commit hard to the existing editorial-print design language (Fraunces/Newsreader/JetBrains Mono, paper-and-ink palette, red-pencil marginalia accents) — no new aesthetic.

Surfaced during writingcontrol.org acceptance testing of v0.4.2: the operator hit `/dev/editorial-studio` and asked "where are the links to the other surfaces?" — Phase 16d's `chrome.ts` shipped but was wired only into the bird's-eye content view. Every other page renders its own bespoke header with no cross-page nav. This phase fixes the discoverability gap and adds a proper landing page.

**Design reference:** [`mockups/editorial-nav-and-index.html`](mockups/editorial-nav-and-index.html). Three states: folio strip atop dashboard masthead, folio strip atop content-view header, full studio index.

Tasks:
- [x] `packages/studio/src/pages/chrome.ts` — replace `renderEditorialChrome` with `renderEditorialFolio(active: ChromeActiveLink, spineLabel?: string)` matching the mockup's folio strip. Three-column grid: wordmark / nav / spine. Active link gets the red-pencil tick mark via `::before`. Sticky positioning. Existing `ChromeActiveLink` union extended with `'index'`.
- [x] `packages/studio/src/pages/index.ts` (NEW) — `renderStudioIndex(ctx: StudioContext)` returning the full TOC page per the mockup's State 3. Four sections (Pipeline / Review desk / Browse / Reference), six entries total. Templated routes (longform reviews, scrapbook) render the slug placeholder in red-pencil italic.
- [x] `packages/studio/src/server.ts` — add `app.get('/dev', ...)` and `app.get('/dev/', ...)` routes for the index. Update the existing `app.get('/', ...)` redirect to point at `/dev/` (was `/dev/editorial-studio`).
- [x] `plugins/deskwork-studio/public/css/editorial-nav.css` (NEW) — folio strip CSS + index TOC CSS, scoped under `[data-review-ui]` and using only existing `--er-*` tokens. No new variables.
- [x] `plugins/deskwork-studio/public/css/content.css` — `.ed-chrome*` rules removed (replaced by `.er-folio*` in editorial-nav.css). Writer's Catalog viewport CSS preserved.
- [x] Wired `renderEditorialFolio()` into all page renderers: `dashboard.ts`, `review.ts` (longform main + error), `shortform.ts`, `help.ts`, `scrapbook.ts`, `content.ts` (top-level + drilldown + not-found). Each page renders the folio strip ABOVE its existing bespoke masthead. The content-view's `.ed-chrome` is replaced by the folio.
- [x] `packages/studio/test/index-page.test.ts` (NEW) — integration tests for `/dev/` and `/dev` routes: returns 200, includes folio strip, includes all 6 entries with their routes, active link is `Index`. Plus the root redirect now points at `/dev/`.
- [x] `packages/studio/test/folio-cross-page.test.ts` (NEW) — for each of the 7 reachable surfaces (index, dashboard, content, shortform, help, scrapbook, longform-error), asserts the rendered HTML includes `er-folio`, the correct `active` link is marked, and all 5 nav links are present.

**Acceptance Criteria:**
- [x] Every studio page renders the folio strip at top with all 5 nav links visible. Active surface marked with the red-pencil tick.
- [x] `http://localhost:47321/dev/` renders the studio index TOC; was 404 before.
- [x] Visual posture matches the mockup — no third aesthetic introduced; folio + index reuse existing `--er-*` tokens.
- [x] `.ed-chrome*` CSS rules removed from `content.css` (the bird's-eye view now uses the folio like every other surface).
- [x] All tests green: `npm --workspaces --if-present test` (core 222, cli 61, studio 131 = 414 total; was 360 → +54).
- [x] Typecheck clean for all 3 packages.
- [x] Bundles regenerated and committed.

**Notes:**
- The dashboard's bespoke `er-masthead` (with "Vol. X · № Y · Press-check" kicker) STAYS. Folio strip sits above it as a separate element. Same for shortform, help, scrapbook — preserve each page's identity.
- The content-view at `/dev/content` previously used `.ed-chrome` (Writer's Catalog clean strip from Phase 16d). That gets replaced with the editorial-print folio. The `content.css` viewport styles (paper, ink, oxblood marginalia for tree connectors and detail panel) stay — only the chrome layer changes.
- Folio strip is sticky (per mockup CSS) so cross-page nav stays reachable as the operator scrolls long pages (the dashboard, the help manual).
- Active-link tick mark uses CSS `::before` with skewed borders — no images, no inline SVG.

**GitHub tracking:** No standalone issue; surfaced during #18 acceptance follow-up. Ships in v0.5.0 (minor bump — new user-visible surface at `/dev/`).

---

### Phase 18: Deferral catalog — finish the deferred work

**Deliverable:** Surface and complete every outstanding deferred work item across the feature. This is a catalog, not a single piece of work — each item below is its own sub-task with its own GitHub issue. The phase exists to make the deferral surface area visible in one place so nothing slips.

**Why this phase exists:** Audited the project for deferrals after the operator pushed back on a pattern of unilaterally splitting work into "in scope" + "deferred" without explicit approval. This catalog includes (a) issues filed late in the session that capture work I had quietly deferred, (b) original workplan items still unchecked, and (c) PRD-deferred items (originally user-approved but worth re-surfacing for closure decisions).

**No "in scope" / "out of scope" split here.** The operator decides which items to act on and in what order. Unchecked = not done; the operator's call whether to do, drop, or postpone with explicit acknowledgment.

#### Group A — Bug-fix-shaped follow-ups (issues filed late)

- [x] **[#16](https://github.com/audiocontrol-org/deskwork/issues/16)** — Move bundle-rebuild from pre-commit to pre-push hook. Done in v0.6.0 (commit e8c058d).
- [x] **[#24](https://github.com/audiocontrol-org/deskwork/issues/24)** — Bird's-eye view renders organizational README nodes. Tree-assembly inverted to filesystem-primary, calendar-as-state-overlay. Done in v0.6.0.
- [x] **[#27](https://github.com/audiocontrol-org/deskwork/issues/27)** — `Paused` 7th lifecycle stage shipped. Done in v0.6.0 (commit 7880813).
- [x] **[#28](https://github.com/audiocontrol-org/deskwork/issues/28)** — Standalone scrapbook viewer client UI exposes `secret/` toggle. Composer + upload checkboxes; per-item "mark secret"/"mark public" cross-section rename. Done in v0.6.0.
- [x] **[#29](https://github.com/audiocontrol-org/deskwork/issues/29)** — Lightbox component for scrapbook image preview. ESC closes, ← / → cycles adjacent images. Done in v0.6.0.
- [ ] **[#30](https://github.com/audiocontrol-org/deskwork/issues/30)** — Cache content-tree assembly (CONDITIONAL — only act when perf is observed as a problem).
- [x] **[#31](https://github.com/audiocontrol-org/deskwork/issues/31)** — Cross-surface design audit (chrome + content layout consistency). Audit report + unification mockup landed in v0.5.0 deferred docs; **all 10 CSF unifications implemented** in v0.6.0 (CSF-1/2 token cleanup; CSF-3 unified `er-pagehead-*`; CSF-4 unified `er-section-head`; CSF-5 unified `er-row` base; CSF-6 scrap-row tokens; CSF-7 container-width tokens; CSF-8 inline-style removal; CSF-9 TOC family documented; CSF-10 review-surface BlogLayout exception documented).

#### Group B — Original workplan items still unchecked

These were marked "deferred to Phase 12" or simply never executed. The architecture pivoted between drafting them and shipping it; whether they still apply as written is a question for the operator.

- [ ] **Phase 4 — Dogfood in audiocontrol.org (live calendar).** Workplan tasks 76–82 are all unchecked. Phase 12 dogfooded against a sandbox (`./.audiocontrol.org/` copy), not the live editorial calendar at `~/work/audiocontrol.org/`. The architecture pivot (npm packages + plugin shells, Phases 7–11) means the original "side-by-side validation against project-local skills" task may no longer be the right shape — but the live-calendar smoke against the deployed plugin still hasn't happened.
- [ ] **Phase 5 — Visibility/distribution skills.** Four skills never shipped: `help`, `status`, `distribute`, `social-review`. Currently shipped: `install / add / plan / outline / draft / publish / review-* / iterate / approve / ingest`. The four originally-planned skills are absent from the deskwork plugin manifest.
- [ ] **Phase 6 — Cut over and cleanup.** Remove project-local `editorial-*` skills from audiocontrol.org's `.claude/skills/`. Verify the editorial calendar runs entirely on plugin skills. This was originally the v0.1.0 finishing task; v0.1.0 shipped without it because the architecture pivot made the cutover-from-project-local-skills less critical (the plugin can run alongside without conflict).
- [ ] **Phase 12 task — "Approve cycle through browser."** Manual smoke test, never done. Pipeline is wired (workflow → annotate → decision → approve) and exercised at the API level; full browser-driven approve through the studio UI has not been verified by an operator.
- [ ] **Phase 12 stretch — Agent-improvability pillar.** PRD says deferred until trigger fires: "first time a deskwork user reports difficulty fixing a rough edge in the plugin from within their project." writingcontrol.org adoption may have triggered this — operator should verify whether the plugin-as-clone vs. npm-package distribution decision needs to be made now or can continue to defer.

#### Group C — PRD-deferred items (user-approved at the time; surfacing for closure)

These were called out in the original PRD as deferred. The user approved deferring them at the time, but they remain undone — surfacing here so the operator can confirm they're still deferred, drop them, or schedule them.

- [ ] **MCP server (`@deskwork/mcp-server` package).** PRD: *"explicitly deferred. Revisit only if friction with the CLI emerges."* Has friction emerged? Probably not — operator hasn't asked. But worth a yes/no.
- [ ] **npm registry publishing.** PRD: *"deferred to v0.1 cut. Initial dev uses `file:` workspace deps for local dogfood."* Bundles in the plugin tree close the install gap; npm is still optional. Still deferred? Or worth publishing now that the plugin is shipping releases?
- [ ] **Shortform / cross-link review skills.** PRD line 28: *"shortform/cross-link still deferred."* Shortform review surface ships in the studio (`/dev/editorial-review-shortform`); the CLI-side `shortform-draft` skill from the original list and the `cross-link-review` skill never shipped.

#### Group D — Skills explicitly out of scope per original PRD (NOT deferred — listing for completeness)

These were excluded from v0.1, not deferred. Listing only so the operator sees the full skill-surface gap if they're considering Phase 5 / 6 work:

- `editorial-suggest`
- `editorial-performance`
- `editorial-reddit-sync`
- `editorial-reddit-opportunities`

If any of these are now in scope, file as new issues.

---

**Acceptance Criteria:** This phase has no single acceptance gate — each Group A and Group B item completes when its issue closes. Phase 18 itself is "done" when the operator decides every item has been resolved (acted on, explicitly dropped, or moved to a different release).

**Notes:**

- This phase is a CATALOG, not a single shippable unit. Don't expect a single PR / version bump. Each item ships when it ships.
- The pattern that produced the un-filed deferrals (1–4 in Group A) is captured in `~/.claude/projects/-Users-orion-work-deskwork-work-deskwork-plugin/memory/feedback_dont_unilaterally_defer.md`. Future phases should not repeat it.
- Group B items (Phase 4/5/6) may be reframed if the operator decides the original specs no longer apply. The architecture pivot in 2026-04-21 changed the meaning of "audiocontrol.org cutover" — what was originally "remove project-local skills and replace with plugin skills" might now be "verify the plugin runs cleanly alongside the existing project-local skills, then cut over when the operator chooses."
- Group C items are decisions, not implementations. The operator's call is yes/no, not how-to.

---

### Phase 19: Separate identity (UUID) and path-encoding (frontmatter id) from slug

**Deliverable:** Deskwork's internal logic no longer uses slug as identity or as the basis for filesystem placement. Calendar entries are joined by `id` (UUID); markdown files carry that id in their frontmatter; path discovery scans `contentDir` and binds entry → file dynamically per request. The bird's-eye content view at `/dev/content/<site>` shows tracked content lit up at its actual filesystem location regardless of the public slug. A new `deskwork doctor` skill validates and repairs the binding metadata.

**Plan reference:** `~/.claude/plans/i-would-like-to-wiggly-hennessy.md`

**GitHub tracking:** [#33](https://github.com/audiocontrol-org/deskwork/issues/33)

**Why this phase exists:** writingcontrol.org acceptance surfaced the bug: calendar slug `the-outbound` (the correct public URL) doesn't match the file's filesystem path (`projects/the-outbound/index.md`), so the studio places the entry at top-level slug `the-outbound` while the actual content sits orphaned under `projects/`. They never merge. Root cause: slug is host-owned (the renderer derives it from the file's collection + filename); deskwork can't repurpose it for internal joins or path-encoding. The architecture is already half-migrated to UUID-as-internal-identity (`entry.id` exists, `findEntryById` exists, distribution joins through `entryId`); Phase 19 finishes the migration AND replaces the fragile cached-path model with refactor-proof frontmatter-UUID binding.

Tasks are grouped by sub-phase. Sub-phases are sequential (19a → 19b → 19c → 19d → 19e). Each lands as one or more commits inside a single PR.

#### 19a — Foundation: content-index module, drop `filePath`, scaffold writes id

- [x] `packages/core/src/content-index.ts` (NEW): `buildContentIndex(projectRoot, config, site)` returns `{ byId: Map<uuid, absolutePath>, byPath: Map<relPath, uuid>, invalid: [...] }` after walking `<contentDir>/` and parsing every `.md`/`.mdx` frontmatter. Skips `scrapbook/`, `node_modules/`, `dist/`, dotfiles. Pure walk-and-scan; depends only on `frontmatter.ts`.
- [x] `packages/core/test/content-index.test.ts` (NEW): 9 fixture tests — empty/missing dir, mixed frontmatter, skip rules, hierarchical paths, .mdx/.markdown, duplicate-id determinism, malformed-id reporting.
- [x] `packages/core/src/types.ts`: dropped `CalendarEntry.filePath` field. Slug doc rewritten to clarify it's host-rendering-engine-owned.
- [x] `packages/core/src/calendar.ts`: dropped `FilePath` column parser and renderer branches. Calendar parser is now column-tolerant (ignores legacy `FilePath` columns gracefully — locked by a new test).
- [x] `packages/core/src/calendar-mutations.ts`: added `findEntryBySlugOrId(calendar, slugOrId)` helper (id-first, slug-fallback). Removed `filePath` from any mutation signatures (the only consumer was `outline.ts`'s `existing.filePath = …` write — also removed).
- [x] `packages/core/src/scaffold.ts`: emits `id: <entry.id>` as the FIRST frontmatter field; throws "Cannot scaffold entry without id" defensively when entry id is missing/empty.
- [x] `packages/core/test/scaffold.test.ts`: 4-test `frontmatter id binding (Phase 19a)` suite covering the id-first emit, round-trip via `readFrontmatter`, and the defensive throws.

**Acceptance:** ✅ All existing tests pass (459 total: 247 core + 64 cli + 148 studio; +12 new core tests). Calendar parser ignores any `FilePath` column it sees in legacy files (verified by test). New scaffolded files carry `id` in frontmatter (verified by test). Typecheck clean for all 3 packages.

**Notes:**
- `content-tree.ts`'s `entryHasOwnIndex` no longer reads `entry.filePath`; returns `true` for all tracked entries until 19c rewires through the content index.
- `content-detail.ts` reads `<slug>/index.md` for tracked nodes (was `entry.filePath`); 19c restores the proper lookup via the content index.
- Studio integration fixture's `README.md` files renamed to `index.md` so the post-19a content-detail code path finds them. The fixture's intent is preserved.

#### 19b — `deskwork doctor` validate + repair

- [x] `packages/cli/src/commands/doctor.ts` (NEW, 281 lines): subcommand entry. Parses `--fix=<rule|all>`, `--yes`, `--json`, `--site` flags. Default = audit-only.
- [x] Audit-only mode walks the calendar + content index + workflow store. Exit 0 if clean, 1 if findings, 2 on usage/config error.
- [x] All 7 rule checkers implemented under `packages/core/src/doctor/rules/` (full audit + plan + apply for each, no stubs):
  - `missing-frontmatter-id` — 3-tier candidate search (slug-template path → title match → basename match); writes `id:` into frontmatter on apply.
  - `orphan-frontmatter-id` — interactive: leave-as-is or clear-id.
  - `duplicate-id` — interactive: pick canonical; clears id from non-canonical files.
  - `slug-collision` — report-only (editorial decision).
  - `schema-rejected` — passive audit (always empty); exposes `printSchemaPatchInstructions()` helper for other rules to surface when they hit a schema rejection at write-time.
  - `workflow-stale` — joins on entryId (when present) with slug fallback; delete-stale-pipeline-file repair preserves the journal history.
  - `calendar-uuid-missing` — re-reads calendar bytes, finds rows with empty UUID cells, rewrites calendar to flush in-memory ids to disk.
- [x] Repair engine (`runRepair` in `packages/core/src/doctor/runner.ts`): per-rule plan/apply orchestration. `--yes` mode auto-applies single-candidate / unambiguous plans; skips ambiguous prompts cleanly and reports.
- [x] `packages/cli/test/doctor.test.ts` (NEW, 21 tests): one fixture per rule covering audit + repair + post-repair re-audit; ambiguous-skip negative test for `missing-frontmatter-id` with multiple candidates.
- [x] `plugins/deskwork/skills/doctor/SKILL.md` (NEW): operator-facing prose with examples, rule explanations, host content-schema requirement.

**Acceptance:** ✅ Healthy fixture audit exits 0; each rule's violation fixture diagnoses in audit and repairs in fix mode (where the rule has a real repair). 21 new cli tests; all 480 tests pass; typecheck clean across all 3 packages; `claude plugin validate` passes.

**Notes:**
- Public surface exported via `@deskwork/core/doctor`; new subpath export added to `packages/core/package.json`.
- `--json` mode produces machine-readable output composable with `jq` (operator script use).
- `yesInteraction` semantics: `pickChoice` skips ambiguous prompts; `confirmApply` is always `true`. Single-candidate / unambiguous plans auto-apply; multi-candidate / editorial-decision plans skip with a clear "needs interactive operator" message.

#### 19c — Path encoding rewire + content-tree inversion

- [ ] `packages/core/src/paths.ts`: new `findEntryFile(projectRoot, config, site, entryId, index?)` — looks up the file by id via the content index. `resolveBlogFilePath` becomes a thin wrapper with template-fallback for legacy entries (entries whose file doesn't yet have `id` in frontmatter).
- [ ] `packages/core/src/scrapbook.ts`: new `scrapbookDirForEntry(projectRoot, config, site, entryId, index?)` — derives `<dirname(file)>/scrapbook/` from the content index. The path-addressed `scrapbookDirAtPath` (already present) stays for direct path lookups.
- [ ] `packages/core/src/content-tree.ts` (**epicenter**): `ContentNode.slug` → `ContentNode.path`. Tree assembly: walk fs (already does this), for each fs node parse frontmatter, look up the calendar entry by id, overlay state. Calendar entries whose file lacks an id (pre-doctor) fall back to today's slug-based join with a one-time warning per entry.
- [ ] `packages/core/test/content-tree.test.ts` (extend): the writingcontrol scenario — calendar entry id=X with file at `projects/the-outbound/index.md` (frontmatter `id: X`) overlays onto fs node `projects/the-outbound`. No ghost root. The audiocontrol-shape scenario (flat fs, frontmatter id present) renders identically to today's tree.
- [ ] `packages/core/src/body-state.ts:53`: opportunistic regex consistency fix — bring its frontmatter regex in line with `frontmatter.ts` (`\r?\n` for Windows files).

**Acceptance:** writingcontrol scenario test passes (entry → fs node binding via frontmatter id); audiocontrol scenario unchanged; legacy slug-fallback path still works for entries pre-doctor.

#### 19d — Studio id-routing + workflow id-keying

- [ ] `packages/studio/src/server.ts`: new canonical route `GET /dev/editorial-review/:id` (uuid). Legacy `/dev/editorial-review/:slug{.+}` resolves slug → id → 302-redirects. New route shape `/dev/content/:site/:project?node=<path>` — `path` is fs-relative.
- [ ] `packages/studio/src/pages/dashboard.ts`: workflow `covKey()` keys by `(site, entryId)`. Display still shows slug as label.
- [ ] `packages/studio/src/pages/content.ts`, `content-detail.ts`: tree uses fs `path` for href construction and selection. Each tree row shows: title (primary) + path (small annotation) + slug ("public URL: /blog/<slug>" hover hint when overlay entry exists).
- [ ] `packages/studio/src/pages/review.ts`: looks up workflow + entry by id; renders slug as display only.
- [ ] Per-request content-index memoization in studio: built once per HTTP request, reused for all subsequent lookups in that request. Re-builds on each new request — keeps the index always-fresh against fs changes.
- [ ] `packages/core/src/review/types.ts`: add `entryId` to `DraftWorkflowItem`.
- [ ] `packages/core/src/review/handlers.ts`: prefer `entryId`; fall back to `(site, slug)` for legacy reads.
- [ ] `packages/studio/test/`: review route resolves uuid → renders; content tree page uses path-based hrefs; legacy slug review URL 302-redirects to uuid URL.

**Acceptance:** All studio tests green. Hitting an old `/dev/editorial-review/<slug>` URL redirects to the canonical id-based URL. Workflow records carry `entryId` after first interaction.

#### 19e — writingcontrol migration + docs

- [ ] **Operator runs** (we don't auto-execute against writingcontrol): one-time content-schema patch in `src/content/config.ts` if needed (`z.string().uuid().optional()` for `id`, or `.passthrough()`).
- [ ] **Operator runs**: `deskwork doctor` (audit) → expect findings for 5 calendar entries with `missing-frontmatter-id`.
- [ ] **Operator runs**: `deskwork doctor --fix=missing-frontmatter-id` → interactive prompts; doctor writes ids into the discovered files (`projects/the-outbound/index.md`, `projects/field-notes/index.md`, `essays/whats-in-a-name/index.md`, etc.).
- [ ] **Operator runs**: `deskwork doctor` again → expect no findings.
- [ ] **Operator verifies** in studio: `/dev/content/writingcontrol` shows 2 root entries (essays, projects); no ghost roots. `/dev/content/writingcontrol/projects` shows `the-outbound` lit up Published, descendants intact.
- [ ] **Operator verifies refactor-proofing**: rename `projects/the-outbound/` → `projects/the-outbound-novel/`, reload studio, confirm tree shows the entry at the new path with lane unchanged. No `relocate` command needed.
- [ ] Update `plugins/deskwork/README.md` and `plugins/deskwork/skills/*/SKILL.md`: document `--path` flag on `outline`; reference `doctor/SKILL.md`. Document the host content-schema requirement (`id` permitted in frontmatter).
- [ ] Update root `README.md` "Capabilities" section: mention refactor-proof binding via frontmatter id.
- [ ] Update PRD/workplan: mark Phase 19 sub-phases complete; note the body-state regex fix and the calendar-table-parser flag for future hardening in DEVELOPMENT-NOTES.

**Acceptance:**
- `npm --workspaces test` green; `tsc --noEmit` clean for all 3 packages.
- writingcontrol bird's-eye view shows tracked content at its actual filesystem location, no ghosts.
- Refactor-proofing demonstrated end-to-end.
- Skill docs explain the new `doctor` flow and the schema requirement.

---

**Phase 19 Acceptance (overall):** All sub-phases complete; the writingcontrol bug is fixed; audiocontrol behavior unchanged for end users (frontmatter `id:` becomes ambient on next save / doctor run); the doctor command provides ongoing maintenance; no internal logic depends on slug shape or hierarchy.

**Notes:**

- This phase supersedes the unimplemented "slug-as-path" approach from the prior plan. Hierarchical slug support (`/`-separated kebab in slug regex) was relaxed in Phase 13 — that relaxation stays (no need to re-tighten now that slug isn't load-bearing internally), but no new code parses slug for hierarchy.
- The `filePath` field on `CalendarEntry` was added in the prior plan but never populated by any real calendar. Removing it is a no-op for existing data.
- Calendar table parser hardening (escape-pipe round-trip, AST-based parsing) is OUT OF SCOPE for Phase 19 — out of the new hot path. Flag in DEVELOPMENT-NOTES.
- Performance: per-request content-index scan is fine for the current scale (writingcontrol ~10 files, audiocontrol ~30). For sites with thousands of files, switch to a watched in-memory index with fs-event invalidation. Not needed at present scale.
