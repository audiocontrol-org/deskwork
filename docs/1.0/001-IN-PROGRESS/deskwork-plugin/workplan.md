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
- The `--path <rel-path>` flag described in the original plan reference (`/Users/orion/.claude/plans/i-would-like-to-wiggly-hennessy.md` line 126) for `outline` was NOT implemented in 19a. The CLI surface for `outline` retains `--site / --author / --layout` only. Operators with destinations that don't fit `index|readme|flat` scaffold by hand and bind via `deskwork doctor --fix=missing-frontmatter-id`. Filed as a future hardening item if demand emerges.

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

- [x] `packages/core/src/paths.ts`: added `findEntryFile(projectRoot, config, site, entryId, index?, legacyEntryForFallback?)` with documented precedence (index → template). `resolveBlogFilePath` signature unchanged; behavior preserved for legacy callers.
- [x] `packages/core/src/scrapbook.ts`: added `scrapbookDirForEntry(projectRoot, config, site, entry, index?)`. Path-addressed `scrapbookDirAtPath` (already present) stays.
- [x] `packages/core/src/content-tree.ts` (**inverted**): `ContentNode.slug` → `ContentNode.path` (structural). New optional `ContentNode.slug` for display, populated only when an entry overlays the node. Tree assembly: walks fs, builds content index, overlays calendar entries via `index.byPath`. Pre-doctor entries fall back to slug-as-path matching with a one-time warning per such entry.
- [x] Module split: `content-tree.ts` (408 lines, was 579) + `content-tree-types.ts` (161) + `content-tree-helpers.ts` (135) + `content-tree-fs-walk.ts` (137). Public re-exports preserved at `content-tree.ts`.
- [x] `packages/core/test/content-tree.test.ts`: 4 new Phase 19c scenarios — writingcontrol post-doctor (entry overlays at `projects/the-outbound`, no ghost), audiocontrol post-doctor, legacy slug-fallback with warning, ghost-when-neither-binding-nor-slug-match.
- [x] `packages/core/test/paths.test.ts`: 4 new tests for `findEntryFile` precedence (index hit, index miss with template fallback, no fallback, missing entry).
- [x] `packages/core/test/scrapbook.test.ts`: 6 new tests covering `scrapbookDirAtPath` and `scrapbookDirForEntry`.
- [x] `packages/core/src/body-state.ts`: regex now `\r?\n` to match `frontmatter.ts` (CRLF support). Test added.
- [x] `packages/studio/src/pages/content.ts` + `content-detail.ts`: `node.slug` → `node.path` for structural identity; review URL uses `node.slug ?? node.path` (slug-when-tracked); scrapbook URLs always use path. New "public URL: /blog/<slug>" hover hint when overlay entry's slug differs from path.

**Acceptance:** ✅ writingcontrol scenario test passes (entry → fs node binding via frontmatter id; no ghost). Audiocontrol scenario renders identically to pre-Phase-19c. Legacy slug-fallback still works for pre-doctor entries. Tests 480 → 495 (+15: 4 content-tree, 4 paths, 6 scrapbook, 1 body-state). Typecheck clean for all 3 packages.

**Notes:**
- The studio's `:project{.+}` and `?node=<value>` route shapes already accept fs paths (no server.ts changes required for 19c). Phase 19d will add id-based review routes.
- Ghost-case warning: when neither id-binding nor slug-as-path matches, the entry remains a ghost root silently. Surfacing this with a second warning shape is a one-line addition for a future hardening pass.

#### 19d — Studio id-routing + workflow id-keying

- [x] `packages/studio/src/server.ts`: UUID-strict canonical route `/dev/editorial-review/:id` registered first; legacy slug fallback resolves slug → id → 302-redirect; unknown slug/uuid → clear error page. New `resolveEntryById`, `resolveEntryBySlug`, `buildReviewRedirectUrl` helpers.
- [x] `packages/studio/src/pages/dashboard.ts`: `covKey` keys by `(site, entryId)` when present; `findStageWorkflow` accepts the entry; `workflowLink` and `blogPreviewLink` emit canonical id-based URLs.
- [x] `packages/studio/src/pages/content.ts`, `content-detail.ts`: tree row review URLs id-based; new `pathLeaf` helper; "public URL: /blog/<slug>" hover hint when fs leaf differs from entry slug.
- [x] `packages/studio/src/pages/review.ts`: `renderReviewPage` accepts a discriminated `ReviewLookup` (id | slug); workflow lookup uses `entryId` when present.
- [x] `packages/studio/src/request-context.ts` (NEW): per-request content-index memoization via Hono middleware + per-request `Map<site, ContentIndex>`. `getRequestContentIndex(c, ctx, site)` builds lazily on first call per request; reused for the rest. Test-injectable via `setIndexBuilder` / `resetIndexBuilder`.
- [x] `packages/core/src/review/handlers.ts`: `handleStartLongform` auto-resolves `entryId` from the calendar when not supplied. New `lookupEntryIdBySlug` helper.
- [x] `packages/cli/src/commands/review-start.ts`: stamps `entryId` on workflows it creates.
- [x] `packages/core/test/review-handlers-entryid.test.ts` (NEW): 6 tests — auto-resolve from calendar, caller-supplied wins, omit when no entry, lookup by entryId, legacy `(site, slug)` fallback, idempotency.
- [x] `packages/studio/test/review-routing.test.ts` (NEW): 7 tests — UUID render, slug 302-redirect (flat + hierarchical + querystring), unknown-slug error page, unknown-uuid error page, legacy entry-without-id pathway.
- [x] `packages/studio/test/content-public-url.test.ts` (NEW): 2 tests — hover hint present when leaf ≠ slug; absent otherwise.
- [x] `packages/studio/test/request-context.test.ts` (NEW): 2 tests — single build per request; rebuild on new request.

**Acceptance:** ✅ All studio tests green. Hitting `/dev/editorial-review/<slug>` 302-redirects to the canonical id-based URL. Workflow records populated with `entryId` on creation. Per-request content index built once per request (verified by injected spy).

**Notes:**
- Tests 495 → 512 (+17: 6 core, 11 studio).
- One corner case: draft markdown with no calendar record gets `entryId: undefined`; workflow stays slug-keyed. Doctor's `workflow-stale` rule surfaces this.
- Memoization shape: Hono middleware + request-scoped `Map`. Picked over a long-lived StudioContext slot to keep request state isolated from shared studio state.
- Client-side TypeScript bundles untouched; legacy slug URLs from the dashboard's enqueue-review button hit the slug fallback route and get redirected — no client change required.

#### 19e — writingcontrol migration + docs

- [ ] **Operator runs** (we don't auto-execute against writingcontrol): one-time content-schema patch in `src/content/config.ts` if needed (`z.string().uuid().optional()` for `id`, or `.passthrough()`).
- [ ] **Operator runs**: `deskwork doctor` (audit) → expect findings for 5 calendar entries with `missing-frontmatter-id`.
- [ ] **Operator runs**: `deskwork doctor --fix=missing-frontmatter-id` → interactive prompts; doctor writes ids into the discovered files (`projects/the-outbound/index.md`, `projects/field-notes/index.md`, `essays/whats-in-a-name/index.md`, etc.).
- [ ] **Operator runs**: `deskwork doctor` again → expect no findings.
- [ ] **Operator verifies** in studio: `/dev/content/writingcontrol` shows 2 root entries (essays, projects); no ghost roots. `/dev/content/writingcontrol/projects` shows `the-outbound` lit up Published, descendants intact.
- [ ] **Operator verifies refactor-proofing**: rename `projects/the-outbound/` → `projects/the-outbound-novel/`, reload studio, confirm tree shows the entry at the new path with lane unchanged. No `relocate` command needed.
- [x] Update `plugins/deskwork/README.md` and `plugins/deskwork/skills/*/SKILL.md`: reference `doctor/SKILL.md`; document the host content-schema requirement (`id` permitted in frontmatter); cross-link from `doctor/SKILL.md` → README schema section. (Note: the `--path` flag on `outline` was in the original plan reference but was NOT implemented in 19a — see 19a notes; documentation follows the as-shipped CLI surface.)
- [x] Update root `README.md` "Capabilities" section: mention refactor-proof binding via frontmatter id and the `doctor` maintenance command.
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

---

### Phase 20: Move outline content out of user-supplied markdown into the scrapbook

**Deliverable:** The `outline` skill no longer writes a `## Outline` section into the user's body markdown. The outline content lives in `<contentDir>/<slug>/scrapbook/outline.md` instead — a deskwork-managed location that doesn't intrude on the operator's content document. A new doctor rule migrates legacy entries whose body markdown still has an embedded `## Outline` section.

**Why this phase exists:** The same principle that drove Phase 19's `deskwork:` namespace fix (#38) applies here. Deskwork must intrude as little as possible on user-owned documents. Today's `## Outline` body section assumes deskwork controls how the host renderer treats H2 headings — an assumption that doesn't hold for a plugin distributed across arbitrary Astro / Hugo / Eleventy / Jekyll / plain markdown projects. Move the outline to where deskwork owns the territory.

**Plan reference:** PRD section "Extension: minimize intrusion into user-supplied content (move outline out of body markdown)".

#### 20a — Core: scaffold outline to scrapbook, remove body section

- [ ] `packages/core/src/scaffold.ts`: drop the `## Outline` body section. The body now contains H1 + body placeholder only. `siteCfg.blogOutlineSection` becomes obsolete — keep the field on the config schema for one release with a deprecation warning, then remove in a later cleanup.
- [ ] `packages/core/src/scaffold.ts` (or a new module): `scaffoldOutlineFile(projectRoot, config, site, entry)` writes `<contentDir>/<slug>/scrapbook/outline.md` with frontmatter (`deskwork.id` matching the entry; title; minimal metadata) + structured placeholder (H1, a few H2 placeholder sections).
- [ ] `packages/cli/src/commands/outline.ts`: scaffolding now writes the outline scrapbook file in addition to (or in some flows: instead of) the body file. For new entries, both files get scaffolded; for entries whose body file already exists, only the outline scrapbook file gets scaffolded.
- [ ] Tests: scaffolded outline file has the expected frontmatter shape + placeholder; body markdown does NOT contain a `## Outline` section after scaffolding.

#### 20b — Doctor migration rule: `legacy-embedded-outline-migration`

- [ ] `packages/core/src/doctor/rules/legacy-embedded-outline-migration.ts`: new rule. Audit detects entries whose body markdown contains a top-level `## Outline` section. Plan: move the section's contents into `<contentDir>/<slug>/scrapbook/outline.md`, then remove the section from the body. Apply: round-trip-preserving body markdown rewrite (the same yaml-Document approach extended to markdown — or a string-level rewrite that finds the `## Outline` ... next-H2 boundary).
- [ ] Conflict handling: if `scrapbook/outline.md` already exists, the apply path skips with a clear message ("outline already exists at scrapbook/outline.md; review and merge by hand") rather than overwriting. Operator runs the migration after manually reconciling.
- [ ] Idempotent: a body that no longer has an `## Outline` section produces no finding. Auto-safe under `--fix=all --yes` only when the target scrapbook outline file doesn't already exist.
- [ ] Register in `packages/core/src/doctor/runner.ts` so it runs as part of the default rule set.
- [ ] Tests: 4-6 fixtures covering audit, fix, conflict-skip-when-target-exists, idempotency, body-without-outline (no finding), edge cases (multiple H2s, body-with-only-H1, missing body file).

#### 20c — Studio: read outline from scrapbook

- [ ] Audit any studio surface that today reads the body's `## Outline` section. Likely candidates: review.ts, content-detail.ts. Each surface that currently reads the embedded outline switches to reading `<contentDir>/<slug>/scrapbook/outline.md` (use `scrapbookDirForEntry` + a known filename).
- [ ] No new UI surface — the operator browses the outline via the existing scrapbook viewer (`/dev/scrapbook/<site>/<path>` opens the file directly), and the editorial review surface can render an "Outline" panel inline by reading the same file when present.
- [ ] If the surface today renders both an outline preview and a body preview (review page), keep both; just point the outline preview at the scrapbook file.
- [ ] Tests: 1-2 integration tests covering the post-migration surfaces.

#### 20d — Docs

- [ ] `plugins/deskwork/skills/outline/SKILL.md`: rewrite the prose. The skill scaffolds the outline in the scrapbook (not in the body). The operator's outline work happens in `<contentDir>/<slug>/scrapbook/outline.md`. The skill description (frontmatter) updated to reflect the new behavior.
- [ ] `plugins/deskwork/README.md`: any place that describes the outline lifecycle or the body markdown shape — update to reflect the new contract (no embedded outline section).
- [ ] `plugins/deskwork/skills/doctor/SKILL.md`: add the new `legacy-embedded-outline-migration` rule to the rules table + a one-paragraph playbook entry.
- [ ] `plugins/deskwork/skills/draft/SKILL.md`: any prose that says "remove the outline section" or similar — update to reflect that drafting starts from a body without an embedded outline.
- [ ] `RELEASING.md` or migration notes: document the migration path for operators upgrading from a pre-Phase-20 install (run `deskwork doctor --fix=legacy-embedded-outline-migration`).

**Acceptance:**
- New entries scaffolded post-Phase-20 have body markdown free of `## Outline` sections; their outline content lives in `scrapbook/outline.md`.
- Legacy entries with embedded `## Outline` sections are detected by `deskwork doctor` and migrated cleanly via `--fix=legacy-embedded-outline-migration`.
- Audiocontrol's existing entries (which use `blogOutlineSection: true` in v0.5.x → v0.7.x) continue to render correctly post-migration; the embedded section moves to the scrapbook outline file without content loss.
- Studio surfaces that previously rendered the embedded outline now render the scrapbook outline file when present.
- All workspace tests pass; typecheck clean for all 3 packages; both plugins validate.

**Notes:**
- The `blogOutlineSection` config field is deprecated but kept for one release. Operators upgrading don't need to change their site config; a future cleanup phase removes it.
- Out of scope: moving the entire scrapbook to a deskwork-owned sandbox (e.g., `.deskwork/scrapbook/<site>/<slug>/`). The PRD records this as a possibility worth considering after Phase 20 ships and we observe operator friction; it is **not** action for this phase.
- The migration's body-rewrite path uses a markdown-aware approach (find `## Outline` ... next H2 or EOF). If the body has unusual heading nesting (`## Outline` inside a code fence, for example), the rule errs on the side of skipping with a report rather than risking content loss. Document this in the rule's source.

**GitHub tracking:** [#40](https://github.com/audiocontrol-org/deskwork/issues/40)
---

### Phase 21: End-to-end shortform composition through the unified review surface

**Deliverable:** The operator can author a LinkedIn / Reddit / YouTube / Instagram post for any tracked calendar entry without leaving Claude Code or hand-editing files. Shortform reuses the **same edit/review surface as longform** — there is no parallel composer. Each shortform draft is a real markdown file under the entry's scrapbook (`<contentDir>/<slug>/scrapbook/shortform/<platform>[-<channel>].md`); the studio renders a small platform/channel header above the same editor used for longform. After approval, a new `/deskwork:distribute` skill records the URL of the manually-posted share onto the calendar's `DistributionRecord`, flipping the dashboard matrix cell to "covered".

**Why this phase exists:** Pre-21, three load-bearing pieces were missing: there was no way to *start* a shortform workflow (no `handleStartShortform`, no API route, no CLI command, no skill); the studio's shortform desk rendered an editor textarea with action buttons that had no client-side handlers; and after approval, no way to record the URL the operator posted to. Storage was inline in workflow journal versions, not on disk — a parallel SSOT model that diverged from longform's "file is truth" contract. Phase 21 unifies the model: shortform copy lives in real markdown files (one per `(slug, platform, channel?)` triple), the longform review pipeline drives both kinds, and the studio's shortform desk becomes a pure index page.

**Plan reference:** `~/.claude/plans/i-would-like-to-wiggly-hennessy.md` section "Phase 21: shortform end-to-end through the longform review surface".

**GitHub tracking:** [#47](https://github.com/audiocontrol-org/deskwork/issues/47)

#### 21a — Core: shortform file model + handlers

- [x] `packages/core/src/paths.ts`: new `resolveShortformFilePath(projectRoot, config, site, entry, platform, channel?)` returning `<contentDir>/<slug>/scrapbook/shortform/<platform>[-<channel>].md`. Composes with `findEntryFile` for entry-dir resolution; the scrapbook subpath is appended.
- [x] `packages/core/src/review/handlers.ts`: new `handleStartShortform(input: { site, slug, platform, channel?, initialMarkdown? })`. Resolves entry; computes file path; creates the file with frontmatter + body when missing; creates workflow with `contentKind: 'shortform'`, populated `platform` + `channel`, `entryId` from the calendar entry; v1 mirrors file content. Idempotent — resuming an existing workflow returns it unchanged.
- [x] Removed the shortform special-case in `handleCreateVersion` (was at lines 309-313, "shortform has no separate file"). All kinds now write disk first, then version-bump. The file-resolution helper is shared between longform and shortform start paths.
- [x] `packages/core/src/calendar-mutations.ts`: new `updateDistributionUrl(calendar, entryId | slug, platform, channel?, url, dateShared?)`. Sets URL + `dateShared` on an existing `DistributionRecord` or creates one if `addDistribution` already ran without a URL. `addDistribution`'s required-`url` constraint relaxed — empty URL legal at creation, filled in by `updateDistributionUrl`.
- [x] `packages/cli/src/commands/iterate.ts`: accepts `--kind shortform` in addition to longform/outline. The mutation is kind-agnostic; validation relaxed.
- [x] `packages/cli/src/commands/approve.ts`: shortform approve path reads the **file content** (not the workflow inline version) when writing to the distribution record. File is now the source.
- [x] Tests: `packages/core/test/review-handlers-shortform.test.ts` — handleStartShortform creates file + workflow; handleCreateVersion for shortform writes disk; iterate accepts shortform; approve reads file content.

**Acceptance:** Core tests green; handlers symmetric across content kinds; the special-case branch in `handleCreateVersion` is gone.

#### 21b — CLI + skills: `shortform-start` and `distribute`

- [x] `packages/cli/src/commands/shortform-start.ts` (NEW): subcommand `deskwork shortform-start [<project-root>] [--site <slug>] --platform <p> [--channel <c>] [--initial-markdown <text>] <slug>`. Calls `handleStartShortform`; prints workflow id + studio review URL path (`/dev/editorial-review/<id>`).
- [x] `packages/cli/src/commands/distribute.ts` (NEW): subcommand `deskwork distribute [<project-root>] [--site <slug>] --platform <p> [--channel <c>] --url <posted-url> [--date <YYYY-MM-DD>] [--notes <text>] <slug>`. Calls `updateDistributionUrl`.
- [x] `packages/cli/src/cli.ts`: registers `shortform-start` and `distribute`.
- [x] `plugins/deskwork/skills/shortform-start/SKILL.md` (NEW): operator-facing prose. One-arg-at-a-time prompting (slug → platform → optional channel → optional initial draft). Reports the studio URL on success.
- [x] `plugins/deskwork/skills/distribute/SKILL.md` (NEW): operator-facing prose for recording the URL after posting.
- [x] Tests: `packages/cli/test/shortform-start.test.ts` and `packages/cli/test/distribute.test.ts` — integration coverage.

**Acceptance:** CLI tests green; both skills load via `claude --plugin-dir plugins/deskwork`; one-arg-at-a-time prompting works against the live skill loader.

#### 21c — Studio: API route + page refactors + dashboard matrix

- [x] `packages/studio/src/routes/api.ts`: new `POST /api/dev/editorial-review/start-shortform` route. Body: `{ site, slug, platform, channel?, initialMarkdown? }`. Calls `handleStartShortform`. Response: `{ workflowId, reviewUrl }`.
- [x] `packages/studio/src/pages/shortform.ts`: refactored from compose-stub to **pure index page**. No textareas, no orphan action buttons. Each row links to `/dev/editorial-review/<workflow-id>` (the unified review surface). Empty cells (no workflow yet for a `(slug, platform, channel?)` triple) get a "compose" button that POSTs to `/api/dev/editorial-review/start-shortform` and redirects to the new review URL.
- [x] `packages/studio/src/pages/review.ts`: extended to handle `contentKind: 'shortform'`. Small platform/channel header renders above the markdown editor. Existing editor + save/iterate/approve/reject buttons work for any contentKind unchanged.
- [x] `packages/studio/src/pages/dashboard.ts`: `renderShortformMatrix` updated. Cells become real links — covered cells link to the workflow's `/dev/editorial-review/<id>`; uncovered cells get a button that POSTs to `start-shortform` and redirects. Dropped the copy-CLI-command affordance.
- [x] `packages/studio/public/dist/editorial-review-client.ts`: existing client's `data-action="save-version"`, `"approve"`, `"iterate"`, `"reject"` selectors verified to match the unified review surface DOM contract for both kinds.
- [x] Removed any shortform-specific client bundle (`shortform-client.ts`) — the unification means no shortform-specific client code.
- [x] Tests: `packages/studio/test/shortform-routing.test.ts` — start-shortform route → 200 + workflow id; review URL renders shortform workflow with platform/channel header; dashboard matrix link goes to review URL; existing-coverage cell renders correctly.

**Acceptance:** Studio tests green; the studio's shortform desk renders as an index page with no orphan UI; the unified review surface drives both content kinds.

#### 21d — Skill prose, README, end-to-end smoke

- [x] `plugins/deskwork/skills/approve/SKILL.md`: prose updated — shortform approve reads from the on-disk scrapbook file and writes the body content into the calendar's `DistributionRecord.shortform` field. Pre-21a inline-version language removed.
- [x] `plugins/deskwork/skills/iterate/SKILL.md`: prose updated — `--kind shortform` accepted; revised markdown is written back to the same scrapbook file the workflow reads from. Examples added showing `--kind shortform --platform <p>`.
- [x] `plugins/deskwork/README.md`: new "Shortform / cross-platform posts" section. File-location convention documented. The "until Phase 20 sandbox lands, lives in scrapbook" caveat noted with link to [#40](https://github.com/audiocontrol-org/deskwork/issues/40). Skills table updated with `shortform-start` and `distribute` rows. End-to-end smoke subsection added.
- [x] `plugins/deskwork-studio/skills/studio/SKILL.md`: routes table updated — the shortform desk at `/dev/editorial-review-shortform` is now an index page; per-workflow editing happens at `/dev/editorial-review/:id` (same URL shape as longform). Scrapbook hierarchical-path support called out.
- [x] Root `README.md`: capabilities section gained a "Cross-platform shortform composition" bullet linking to the plugin README's shortform section.
- [x] End-to-end smoke instructions documented in the plugin README's shortform section (lifted from the plan file's Verification block).

**Acceptance:** All operator-facing docs consistent with the as-shipped behavior; no stale references to the pre-21 textarea + dead-button shortform desk; the LinkedIn end-to-end smoke is documented step-by-step in the plugin README.

---

**Phase 21 Acceptance (overall):** Operator can run `/deskwork:shortform-start <slug> --platform linkedin`, edit/approve through the unified studio review surface, post manually to LinkedIn, then run `/deskwork:distribute <slug> --platform linkedin --url <posted-url>` and see the dashboard matrix flip the cell to covered. The same flow works for Reddit (with `--channel`), YouTube, and Instagram. No parallel composer; no inline-version SSOT path; no stale docs.

**Notes:**

- The shortform file location is centralized through `resolveShortformFilePath`. Phase 20's sandbox migration will redirect that one function; everything downstream (handlers, CLI, studio, skills) stays unchanged. Forward-compatible by design.
- The pre-21 inline-version-as-SSOT path is gone. `handleCreateVersion`'s shortform special-case ("shortform has no separate file") was deleted in 21a — both kinds are now disk-backed.
- `addDistribution`'s required-`url` constraint was relaxed; an empty URL is legal at record creation and gets filled in by `updateDistributionUrl` (called from the `distribute` skill).
- The shortform desk at `/dev/editorial-review-shortform` is now read-only (an index of `(slug, platform, channel?)` tuples). The compose buttons POST to the API and redirect to the unified review URL. There is no textarea on the index page itself.

---

### Phase 22: Install / studio / doctor polish (issues #41–#46)

**Deliverable:** Six independent fixes filed during writingcontrol.org acceptance. Bundled with Phase 21 in the same PR per the operator's amortized-release-ceremony preference. Each issue has its own commit so review is granular.

**GitHub tracking:** [#41](https://github.com/audiocontrol-org/deskwork/issues/41), [#42](https://github.com/audiocontrol-org/deskwork/issues/42), [#43](https://github.com/audiocontrol-org/deskwork/issues/43), [#44](https://github.com/audiocontrol-org/deskwork/issues/44), [#45](https://github.com/audiocontrol-org/deskwork/issues/45), [#46](https://github.com/audiocontrol-org/deskwork/issues/46).

#### 22a — Doc fixes ([#41](https://github.com/audiocontrol-org/deskwork/issues/41), [#46](https://github.com/audiocontrol-org/deskwork/issues/46))

- [x] **#41**: `/deskwork:install` Step 5 prose updated to recommend `deskwork: z.object({ id: z.string().uuid() }).passthrough().optional()` (or top-level `.passthrough()`) instead of the obsolete top-level `id: z.string().uuid().optional()`. v0.7.2 writes `deskwork: { id: ... }`, not top-level. Cross-checked against `printSchemaPatchInstructions()` in `packages/core/src/doctor/schema-patch.ts` — install skill prose now matches the doctor's prose.
- [x] **#46**: Verified `/dev/scrapbook/<site>/<path>` route accepts hierarchical paths (the Hono `:path{.+}` glob accepts slashes). No code change needed — verification only. Studio SKILL.md prose now explicitly notes hierarchical-path support.

**Acceptance:** Install skill prose and doctor's `printSchemaPatchInstructions` agree on the recommended schema patch shape. Studio SKILL.md prose explicitly mentions hierarchical-path support for the scrapbook viewer.

#### 22b — Install pre-flight + existing-pipeline detection ([#42](https://github.com/audiocontrol-org/deskwork/issues/42), [#45](https://github.com/audiocontrol-org/deskwork/issues/45))

- [x] **#42 (pre-flight schema check)**: After `.deskwork/config.json` is written, the install command attempts a non-destructive schema-compatibility probe per Astro site. Approach: parse the host's `src/content/config.ts` text for the configured collection's schema; look for `id`-related field declarations or a top-level `.passthrough()`. Static check is best-effort — when uncertain or fails, install prints the schema-patch instructions inline at install time. Hugo / Jekyll / Eleventy / plain-markdown sites: skipped (no schema validation).
- [x] **#45 (existing-pipeline detection)**: heuristic walk for signals of a competing in-house editorial implementation:
  - `journal/editorial/` directory present
  - `.claude/skills/editorial-*` skills (matching the same vocabulary deskwork uses)
  - `src/sites/*/pages/dev/editorial-*.astro` Astro pages
  - `scripts/lib/editorial/` or similar TypeScript modules
  When detected, install prints a warning before `.deskwork/config.json` is written. Doesn't block — operator decides.

**Acceptance:** Fresh install against a known-good Astro project succeeds without surfacing the schema-patch instructions. Install against an Astro project with a strict schema lacking `id` allowance prints the patch instructions inline. Install against a project with an existing editorial pipeline (e.g., audiocontrol's `journal/editorial/`) prints the existing-pipeline warning.

#### 22c — Studio EADDRINUSE handling ([#43](https://github.com/audiocontrol-org/deskwork/issues/43))

- [x] `packages/studio/src/server.ts`: catches `EADDRINUSE` from the underlying Node server. Two-tier behavior:
  1. **No explicit `--port`**: auto-increments through `47321`…`47350` and prints `Started on http://localhost:<port>` clearly.
  2. **Explicit `--port`**: fails fast with a clear error including the address conflict and a `--port <other>` suggestion.
- [x] If auto-increment range is exhausted, fails with a clear error listing the range tried.
- [x] Tests: `packages/studio/test/` — simulates EADDRINUSE and confirms the auto-increment path; clear-error path exercised by stubbing the listen.
- [x] `plugins/deskwork-studio/skills/studio/SKILL.md`: Step 2 prose updated to document the two-tier behavior.

**Acceptance:** With another process listening on 47321, default `deskwork-studio` invocation succeeds on 47322 (or the next free port). With `--port 47321` explicitly, the studio fails fast with a clear suggestion.

#### 22d — Doctor exit-code + output verbosity + skip-reason granularity ([#44](https://github.com/audiocontrol-org/deskwork/issues/44))

- [x] `packages/cli/src/commands/doctor.ts`:
  1. **Exit code semantics**: `--fix` mode exits 0 when "all applicable findings were applied or skipped because the prerequisite isn't met yet" (e.g., `missing-frontmatter-id` for entries with no scaffolded file — there's nothing for doctor to do until the operator runs outline). Exit 1 only for actual failures: schema rejection, permission errors, ambiguity-without-`--yes`. Audit-only mode keeps exit 1 on any finding (the existing behavior is correct for CI).
  2. **Output verbosity**: report grouped by rule. Within each rule, summary first ("12 applied, 16 skipped: no scaffold yet"); individual findings as a subsequent compact section.
  3. **Skip-reason granularity**: each `RepairResult` carries a `skipReason: 'no-candidate' | 'ambiguous' | 'schema-rejected' | 'editorial-decision' | …`. Summary distinguishes "skipped (waiting on operator action)" from "skipped (could not auto-fix)" — the former isn't an exit-1 condition.
- [x] Tests: `packages/cli/test/doctor.test.ts` extended with exit-code matrix coverage for the new semantics.

**Acceptance:** `deskwork doctor --fix=all --yes` against a calendar with mostly "no scaffold yet" entries exits 0 (operator action expected, not a failure). `deskwork doctor` (audit-only) against the same calendar still exits 1 (any finding triggers exit 1 in audit mode for CI). Output grouped by rule with summary + collapsible per-finding detail.

---

**Phase 22 Acceptance (overall):** All six issues closed. Install / studio / doctor surfaces cleaner under the failure modes the operator hit during writingcontrol acceptance. No regressions in the existing happy paths (install / studio launch / doctor audit-only).

**Notes:**

- Phase 21 and Phase 22 ship in a single PR. v0.8.0 minor bump (new shortform capability is the headline; polish fixes are the supporting cast).
- The two phases are independent on the implementation side — the test suites don't share fixtures and the surfaces don't overlap. Bundling is purely release-ceremony amortization.
- 22b's pre-flight schema check is best-effort. Static parsing of TypeScript source is fragile by nature; the check is "warn when uncertain", not "block when invalid". The doctor's `schema-rejected` rule remains the runtime safety net.
- 22c's auto-increment range (47321–47350) is hardcoded; tightening or making configurable is left for a future hardening pass. 30 ports is well beyond any realistic concurrent-studio scenario.
- 22d's `skipReason` enum is defined in `@deskwork/core/doctor` types so external consumers (CI tools, scripts) can pattern-match without parsing prose output.

### Phase 23: Source-shipped re-architecture (drop the bundles)

**Deliverable:** Plugin tarball ships source only. `bundle/server.mjs` (894 KB), `bundle/cli.mjs` (450 KB), and `public/dist/` (~3 MB committed in the v0.8.3 proximate fix) all retire. First-run npm install on adopter side; tsx runs source thereafter. Operator-customizable layer (templates / prompts / doctor rules / skills) overridable via `<projectRoot>/.deskwork/`. Local smoke test reproduces marketplace install for pre-tag verification.

**Source-of-truth for design reasoning:** [`docs/source-shipped-deskwork-plan/index.md`](../../../source-shipped-deskwork-plan/index.md) (deskwork workflow `4180c05e-c6a3-4b3d-8fc1-2100492c3f38`, applied at v2). Phase numbering below mirrors that plan's Phase 0–9.

#### 23a — Verification spike: does marketplace install dereference symlinks? (~30 min) — **DONE 2026-04-29**

- [x] Build a minimal test plugin under `/tmp/symlink-test/` with a committed symlink + tiny target.
- [x] Install via the documented public-channel install flow.
- [x] Inspect the cache: simplified to direct `git clone` test (since marketplace install uses git clone internally per Claude Code docs). Result: **Path B — symlinks are preserved as symlinks** (mode `120000`, `readlink` returns the original target).
- [x] Document the result; the answer determines 23c's mechanism.

**Result: Path B confirmed.** `git clone` preserves committed symlinks. The proposed `vendor/core → ../../../packages/core/` symlink would be preserved through marketplace install, but the relative path traverses out of the cache directory (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`) and resolves to a non-existent location (`~/.claude/plugins/cache/<marketplace>/packages/core/` does not exist — the marketplace install copies only the plugin tree, not the workspace). Therefore 23c's release workflow needs a **materialize-vendor** step that replaces symlinks with directory copies before tagging.

#### 23b — Retire bundled artifacts — **DONE 2026-04-29 (commit 23b4032)**

- [x] Delete `plugins/deskwork-studio/bundle/server.mjs`, `plugins/deskwork/bundle/cli.mjs`, `packages/studio/build.ts`, the `plugins/deskwork-studio/public/dist/` exception in `.gitignore`.
- [x] Drop bundle-fallback branch in both `bin/` wrappers.
- [x] Drop `build` / `prepare` scripts from `packages/studio/package.json`.
- [x] Drop bundle-relative path resolution in `packages/studio/src/server.ts:publicDir()` (replaced by 23e's `.runtime-cache/dist/` mount).
- [x] Drop bundle-verification step from `.github/workflows/release.yml`.

#### 23c — Vendor `@deskwork/core` via symlink (Path A or B per 23a) — **DONE 2026-04-29 (commit bbbec30; expanded in 23b commit 23b4032 to include vendor/studio + vendor/cli)**

- [x] Symlinks: `plugins/deskwork-studio/vendor/{core,studio}` → workspace packages; `plugins/deskwork/vendor/{core,cli}` → workspace packages.
- [x] Each plugin's `package.json` declares `file:./vendor/<pkg>` deps + runtime deps (hono, @hono/node-server, tsx, esbuild, codemirror/lezer for the studio per 23g's findings).
- [x] **Path B confirmed by 23a**: release workflow's `scripts/materialize-vendor.sh` replaces symlinks with directory copies + `diff -r` verification before tagging.

#### 23d — Update `bin/` wrappers for first-run npm install — **DONE 2026-04-29 (commit 8e0d851)**

- [x] On invocation: detect missing `node_modules`; run `npm install --omit=dev --no-audit --no-fund --loglevel=error`; exec source via tsx.
- [x] Both `plugins/deskwork-studio/bin/deskwork-studio` and `plugins/deskwork/bin/deskwork`.

#### 23e — On-startup esbuild for client assets — **DONE 2026-04-29 (commit b619ecd)**

- [x] New `packages/studio/src/build-client-assets.ts` — esbuild's programmatic `build()` API into `<pluginRoot>/.runtime-cache/dist/`.
- [x] Server boot calls it once; mtime cache (with metafile sidecar for transitive-import busting) means warm boots are ~50ms.
- [x] Static-serve mount uses a more-specific `/static/dist/*` route pointing at `.runtime-cache/dist/`, registered ahead of the catchall (preserving `/static/css/*`).
- [x] No changes to page renderers (`<script src>` URLs unchanged).

#### 23f — Override resolver — **DONE 2026-04-29 (commit 196a5a4)**

- [x] `packages/core/src/overrides.ts` — `createOverrideResolver(projectRoot)` returns paths under `<projectRoot>/.deskwork/{templates,prompts,doctor}/` when present, else null.
- [x] Injected into request context in `packages/studio/src/server.ts` boot.
- [x] Page renderer override loader at `packages/studio/src/lib/override-render.ts` consults resolver before default render.
- [x] Doctor runner merges plugin-default + project-repo rules via `packages/core/src/doctor/project-rules.ts`.
- [x] New `plugins/deskwork/skills/customize/SKILL.md` + CLI subcommand `packages/cli/src/commands/customize.ts`.

#### 23g — Local smoke test (`scripts/smoke-marketplace.sh`) — **DONE 2026-04-29 (commits 6dd0052 + bf12db6)**

- [x] `git archive HEAD plugins/<name>` reproduces marketplace install path.
- [x] `npm install --omit=dev` in extracted tree.
- [x] Boot studio against a fixture project, curl every page, scrape every `<script src>` and `<link href>`, assert 200.
- [x] Repeat for `plugins/deskwork`.
- [x] Added to `RELEASING.md` as a pre-tag step. Local-only execution per the no-test-infrastructure-in-CI rule.
- [x] Caught + fixed two real packaging bugs while landing: `pluginRoot()` resolution for materialized-vendor layout (3 levels up needed); codemirror/lezer deps promoted from workspace devDeps to plugin-shell runtime deps.

#### 23h — Tests — **DONE 2026-04-29 (folded into 23e + 23f commits)**

- [x] `packages/core/test/overrides.test.ts` — resolver returns operator path when present, null otherwise.
- [x] `packages/studio/test/template-override.test.ts` — page renderer uses operator override when present.
- [x] `packages/studio/test/build-client-assets.test.ts` — runtime-cache esbuild caches results; rebuilds on mtime change.
- [x] All 680 workspace tests pass (core 339, cli 147, studio 194). Up from 652 pre-23.

#### 23i — Documentation — **DONE 2026-04-29 (commit 096b184)**

- [x] `RELEASING.md` — pre-tag smoke-test step + vendor materialize mechanism (Path B).
- [x] `plugins/deskwork-studio/README.md`, `plugins/deskwork/README.md` — install path note: first run does `npm install` (~30s); customization layer reference.
- [x] `.claude/CLAUDE.md` — architecture overview update; no more `bundle/`; vendor-via-symlink + runtime-cache + override resolver.
- [x] New `MIGRATING.md` with adopter checklist for v0.9.0.

#### 23j — Release v0.9.0

- [ ] `npm run version:bump 0.9.0`.
- [ ] Run `scripts/smoke-marketplace.sh` pre-tag.
- [ ] Tag, push, watch release workflow.
- [ ] Verify against a sandbox install end-to-end.

**Acceptance:** No compiled artifacts ship in the marketplace tarball. Operator running through the public-channel install path gets a working plugin + studio with first-run `npm install`. `<projectRoot>/.deskwork/templates/dashboard.ts` (and analogous overrides) work. All workspace tests pass; both plugins validate.

**GitHub tracking:** [#55](https://github.com/audiocontrol-org/deskwork/issues/55) is the implementation issue. Coordinated with [#56](https://github.com/audiocontrol-org/deskwork/issues/56) (Phase 24) for v0.9.0 release.

---

### Phase 24: Content collections (not websites)

**Deliverable:** Schema rename `sites` → `collections`. Per-collection `host` becomes optional (already shipped in v0.8.2). Install skill detects content collections without assuming a website renderer. Studio surfaces drop the `host` requirement. CLI flags `--site` → `--collection` (with deprecated alias). All operator-facing "site" prose migrates to "collection." Doctor migration rule handles existing adopter configs in both shapes for one release.

**Source-of-truth for design reasoning:** Same plan file as Phase 23. Phase numbering below mirrors that plan's Phase 10–14.

**Open question (deferred to 24a):** does `defaultSite` rename to `defaultCollection`, eliminate entirely (multi-collection projects must pass `--collection`), or re-term to a less hierarchy-flavored name (`pinned`, etc.). See plan v2's "Open question" framing.

#### 24a — Schema migration: `sites` → `collections`

- [ ] New zod schemas in `packages/core/src/config.ts` for `Collection` (with optional `host`) alongside legacy `Site` (deprecated).
- [ ] Config loader accepts both shapes for one release; reads `collections` first, falls back to `sites` with a one-time deprecation warning.
- [ ] New doctor rule `legacy-sites-key-migration`: rewrites `sites` → `collections`. Treatment of `defaultSite` decided in this phase per the open question above.
- [ ] Tests: both shapes load; migration rule round-trips; single-collection auto-infer path unchanged.

#### 24b — Install skill + CLI rewrite for collection model

- [ ] `plugins/deskwork/skills/install/SKILL.md`: Step 1 detects collections without requiring a website signal; Step 2 proposes collection-shaped config; Step 5 schema-patch advice conditional on confirmed website renderer.
- [ ] `bin/deskwork install` accepts the new shape.
- [ ] All CLI subcommands taking `--site <slug>` gain `--collection <slug>` (with `--site` as deprecated alias). Help text updated.
- [ ] Test: install against a fixture non-website project tree.

#### 24c — Studio + URL parameter migration

- [ ] All studio routes accepting `?site=<slug>` accept `?collection=<slug>`; legacy `?site=` 302-redirects.
- [ ] Page renderers stop assuming non-empty `host`. "Open in production" / public-URL formatting only fires when host is set.
- [ ] Test: studio boots against a host-less collection fixture; dashboard / review / scrapbook all render without errors.

#### 24d — Documentation pass: collection vocabulary throughout

- [ ] All `/deskwork:*` skill markdown migrates "site" → "collection" in user-facing prose.
- [ ] `plugins/deskwork/README.md` and `plugins/deskwork-studio/README.md` reframe headline tool description around collections.
- [ ] Renderer-specific advice (Astro schema patch) moves under "If your collection is rendered as a website" subsection.
- [ ] Root `README.md` updated similarly.

#### 24e — Migration notes for existing adopters

- [ ] Existing adopters (`writingcontrol`, `editorialcontrol`, `audiocontrol`) configs use `sites` shape — picked up by `legacy-sites-key-migration` on first `deskwork doctor --fix=all` after upgrade.
- [ ] Communicate: "your config will silently migrate on first doctor run; expect a one-time deprecation notice."
- [ ] `?site=` URL param redirects keep external bookmarks working.

**Acceptance:** A non-website project (this monorepo, the operator's internal-doc collection) gets a clean `/deskwork:install` that produces a host-less collection config. Existing website-shaped projects continue working unchanged through the deprecation warning. Studio renders correctly for both shapes. All operator-facing docs use "collection" as the headline term.

**GitHub tracking:** [#56](https://github.com/audiocontrol-org/deskwork/issues/56) is the implementation issue. Coordinated with [#55](https://github.com/audiocontrol-org/deskwork/issues/55) (Phase 23) for v0.9.0 release.

---

**Phase 23 + 24 Acceptance (overall):** Both ship as v0.9.0 in a single coordinated release. Existing adopters upgrade via `/plugin marketplace update` and a one-time `npm install` on first invocation; their existing host-bearing site configs migrate cleanly to the collection shape via the doctor rule.

**Notes:**

- These two phases were originally planned as one architectural document at `docs/source-shipped-deskwork-plan/index.md`. The source-shipped re-architecture and the collection reframe coordinate at the install skill (which fixes both simultaneously) and at the CLI flag set (`--site` → `--collection` happens in 24b but the CLI was already extended in 24c context). Splitting into two top-level phases reflects two distinct architectural axes; bundling release reflects coordinated v0.9.0 ship.
- The deskwork iteration step on the plan was completed before this `/feature-extend` invocation (workflow `4180c05e-...` v2 applied 2026-04-28). Going forward the canonical sequence is `/feature-define` → `/feature-setup` (creates files + registers with deskwork) → operator iterates via deskwork → workflow `applied` → `/feature-issues` → `/feature-implement`. The skills will be amended to bake this in (separate work, surfaced in this same session).

---

### Phase 25: `/release` skill — enshrine the release procedure

**Deliverable:** `/release` skill at `.claude/skills/release/` supersedes the manual procedure in `RELEASING.md`. Hard-gated 4-pause flow (precondition+version → post-bump diff → smoke+tag-message → final push). Atomic push via `git push --follow-tags origin HEAD:main HEAD:refs/heads/<branch>`. Re-tag prevention via `git ls-remote --tags`. Project-internal — for monorepo maintainers, not adopters.

**Source-of-truth:**
- Spec: [`docs/superpowers/specs/2026-04-29-release-skill-design.md`](../../../superpowers/specs/2026-04-29-release-skill-design.md) (workflow `ac1c1945-dda6-4a77-8ad5-c27231adea57` applied at v2; bash→TypeScript switch from operator review)
- Plan: [`docs/superpowers/plans/2026-04-29-release-skill.md`](../../../superpowers/plans/2026-04-29-release-skill.md) (12 tasks; tasks 1-11 implementation, task 12 = first canonical run)

**Operator principle driving the work:** *"What we do 'just for now' overwhelmingly becomes conventional canon. So, if we want a sane release process, we MUST enshrine it in a skill and document the use of that skill in RELEASING.md."*

#### Tasks

- [x] T1 — Scaffold `.claude/skills/release/` (frontmatter-only SKILL.md + lib/ + test/ dirs) — commit `63efd9b`
- [x] T2 — Standalone vitest config + skill `package.json` (vitest pin aligned to workspace `^4.1.2` per code review) — commits `48e56ec` + `91436e9`
- [x] T3 — `validateVersion` (pure semver tuple compare, leading-`v` strip, strict-greater) — TDD with 7 test cases. Refactored to discriminated-union `ValidateVersionResult` per code review. Commits `5df7a49` + `290cdbc`
- [x] T4 — Tmp-repo fixture-builder (`createRig()` → real bare remote + local clone + main + feature branch with tracking) — commit `df4ca4e`
- [x] T5 — `checkPreconditions(opts?)` — async, structured `PreconditionReport`, fetches origin first, throws on fetch failure but reports precondition failures via `failures[]`. 5 test cases. `import` hoisted to top of file per ESM convention. Commits `3f948b8` + `c5b8973`
- [x] T6 — `atomicPush({ tag, branch, cwd? })` — single `--follow-tags` RPC. JSDoc maturity comment names pre-1.0 velocity choice + revisit-at-1.0 trigger. Replaces spec's `as Type` casts with `'stderr' in err` + `Buffer.isBuffer()` narrowing per project rule. 3 test cases. Commit `538f822`
- [x] T7 — CLI dispatcher (`tsx lib/release-helpers.ts <subcommand>`). 4 test cases via real subprocess. Entry-point guard hardened to `pathToFileURL(process.argv[1]).href` per code review (symlink + Windows safety). Commits `b6dfc23` + `ea9aca4`
- [x] T8 — SKILL.md operator-facing prose (4 pauses + helper subcommand reference table). Commit `a3c0b2a`
- [x] T9 — Manual integration smoke against sandbox remote (tmp bare-clone + tmp working-clone + sandbox-test branch). All 4 helper subcommands verified end-to-end: precondition reports, version validation pass+fail paths, atomic-push lands commit + branch + tag on sandbox-origin
- [x] T10 — Rewrite `RELEASING.md` (pointer to `/release` + Maturity stance section; numbered procedure + re-tag advice removed; architectural background sections preserved). Commit `3187227`
- [x] T11 — Final regression (20 skill tests + 339 core + 147 cli + 197 studio + `scripts/smoke-marketplace.sh` end-to-end pass — all green; both plugins materialize via the new shared `materialize_vendor_pairs` including the new `cli-bin-lib` package)
- [ ] T12 — First canonical run = ship v0.9.0 via `/release`. **Operator-driven.** This is the first time the new skill ships a release; v0.9.0 is the ceremonial first user.

**Acceptance:**
- [x] Skill at `.claude/skills/release/` enforces hard gates (no `--force` / `--skip-smoke` overrides)
- [x] All 20 skill-level vitest tests pass; manual integration smoke verified
- [x] RELEASING.md rewritten to point at the skill rather than duplicating procedure
- [x] Maturity comment in 3 places (JSDoc on `atomicPush`, SKILL.md "Pre-1.0 maturity stance", RELEASING.md "Maturity stance")
- [ ] v0.9.0 ships via `/release` (T12 — pending)

**GitHub tracking:** No standalone tracking issue (Phase 25 emerged mid-session from the operator's principle; the skill design lives entirely in the deskwork-managed spec at workflow `ac1c1945-...`). [#84](https://github.com/audiocontrol-org/deskwork/issues/84) was filed as a dogfood-surfaced UX issue against the existing `/deskwork:iterate` skill (no documented agent path for "read pending comments") — orthogonal to Phase 25 itself.

**Notes:**
- The deskwork pipeline dogfooded its own design spec: `/deskwork:ingest`, `/deskwork-studio:studio`, `/deskwork:iterate` (v1→v2 addressed operator's "we're going to regret using a shell script" comment by switching from bash to TypeScript), `/deskwork:approve`. That round-trip surfaced [#84](https://github.com/audiocontrol-org/deskwork/issues/84).
- Direct-to-main push (vs PR-merge) is a deliberate pre-1.0 velocity choice. The maturity comment names the revisit trigger: adopter base widens / multi-contributor work / branch protection on main.
- `release-helpers.ts` deliberately does NOT enforce re-tag prevention; the gate is in SKILL.md prose. Acceptable because the skill is the single canonical entry point — operators bypassing the skill have already opted out of the gate.

---

### Phase 26: npm-publish architecture pivot — v0.10.0

**Deliverable:** Pivot from the source-shipped vendor architecture to npm-published `@deskwork/{core,cli,studio}` packages. Plugin shells first-run-install from npm; vendor/materialize/source.ref machinery retires; install-blocker class ([#88](https://github.com/audiocontrol-org/deskwork/issues/88), v0.9.4 husky, [#93](https://github.com/audiocontrol-org/deskwork/issues/93)) closes. `deskwork-studio` plugin renames to `dw-studio` (organizational, extending the operator's `dw-*` convention from a separate `dw-lifecycle` plugin).

**Source-of-truth for design reasoning:** `/tmp/feature-definition-npm-publish-pivot.md` (drafted by `/feature-define` 2026-04-29; updated for npm Trusted Publishers (OIDC) per [docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers)). To be incorporated into a permanent location once the deskwork PRD review is `applied`.

**Scope decisions baked in (operator-confirmed):**
- npm scope: `@deskwork` (operator-owned).
- **Publish path: manual from operator's terminal** (not CI for v0.10.0). Operator iterates the local manual publish flow until solid; then a future `26-CI` phase moves it to GitHub Actions OIDC. Decision rationale: GitHub Actions latency + opacity makes packaging iteration painful; local manual flow gives fast feedback for the first version.
- Auth path eventually: npm Trusted Publishers (OIDC). `NPM_TOKEN` repo secret retained as manual-fallback only. For v0.10.0, operator publishes manually with 2FA OTP per package; trusted publishers configured AFTER first publish (npm requires the package to exist before binding).
- Plugin manifest version === npm package version. Single bump via `scripts/bump-version.ts` extension.
- First-run install: `npm install --omit=dev @deskwork/<pkg>@<version>` into `plugins/<plugin>/node_modules/`.
- Plugin rename: `deskwork-studio` → `dw-studio`. Organizational, NOT a fix for [#92](https://github.com/audiocontrol-org/deskwork/issues/92) (Claude Code dispatch bug, separate workstream).
- Bundling: single PR, single v0.10.0 release.

**Phase 24, Bundle C (#56, #58, #60, #62, #64, #68, #69, #71, #72, #74, #75), and PR #91 all defer.** PR #91 closes unmerged (smoke gets rewritten as part of 26F).

**Sub-phases:**

> **Re-sequencing decision (2026-04-29):** Operator opted out of CI-driven publishing for Phase 26. The full local manual publish flow gets ironed out first (GitHub Actions latency + opacity makes packaging iteration painful); CI OIDC publishing becomes a future phase shipped only after the manual flow is solid. This also drops the trusted-publisher pre-publish question — operator confirms first publish must happen manually per package, THEN trusted publishers can be configured.
>
> Tasks in 26a originally targeting CI YAML (release.yml permissions block, OIDC dry-run workflow) are removed. They land in **26-CI** (future phase, no v0.10.0 commitment).

#### 26a — Package.json setup for npm publishability ✅ shipped `da2c921`

- [x] Audit each `packages/<pkg>/package.json` — set `name: "@deskwork/<pkg>"`, `version`, `description`, `homepage`, `license`, `author`. Set `repository.url` to EXACTLY `https://github.com/audiocontrol-org/deskwork.git` (trusted-publisher requirement). Add `repository.directory` per package.
- [x] Drop `private: true` per package (required to make publishable).
- [x] Set `publishConfig.access: "public"` per package.

**Acceptance:** `repository.url` exactly matches the canonical GitHub URL. `private: true` removed. `publishConfig.access: "public"` set. Met by `da2c921`.

#### 26b — Package shape audit + dist build

- [x] `exports` field declared per package (explicit subpath exports for what consumers need).
- [x] `files` whitelist: `dist/`, `package.json`, `README.md`. Excludes tests, fixtures, source maps unless wanted.
- [x] `tsconfig.build.json` per package: `outDir: "dist"`, `declaration: true`, `declarationMap: true`.
- [x] `npm run build` script per package; `npm run build --workspaces` at root.
- [x] `npm pack` smoke verifies tarball contents per package (no test fixtures, no node_modules).

**Acceptance:** All three packages produce tarballs with the expected file set. `npm pack --workspace @deskwork/<pkg>` produces a tarball that, after extraction, has only the whitelisted files. Met by 26b commits.

**Notes:**
- Build uses `rewriteRelativeImportExtensions: true` so source imports written with `.ts` extensions emit as `.js` references in dist.
- Source shebangs in `packages/cli/src/cli.ts` and `packages/studio/src/server.ts` switched from `tsx` to `node` so the published bin entries (which point at `dist/`) execute under node directly. Dev workflow now requires `npm run build` before invoking the bin shim — published-correct shape supersedes the previous tsx-against-source dev path.
- Root workspaces array reordered so build runs in dependency order (`packages/core` before `packages/cli` and `packages/studio`).
- Studio/cli dropped `prepare` for build; `prepack` is the build hook (avoids the install-time race where dependent packages' prepare ran before core had built).
- `customize` command refactored to anchor on `<pkg>/package.json` resolution instead of subpath exports. The previous `@deskwork/studio/server.ts` and `@deskwork/studio/pages/*` exports were removed; they were operator-tooling-only anchors that pointed at source. Customize still walks `src/<...>` from the package root, which works in workspace dev but will need follow-up once `src/` is stripped from npm-published tarballs.
- `@deskwork/core` ships three `.mjs` remark plugins; the build script copies them from `src/*.mjs` to `dist/` since `tsc` does not compile `.mjs` sources.

#### Manual reservation publish (operator action between 26b and 26c)

- [ ] Operator publishes each `@deskwork/<pkg>` to npm with a placeholder version (e.g., `0.0.0-reserve.0`) using `npm publish --access public --workspace @deskwork/<pkg>` from their terminal (with 2FA OTP). Reserves the package names.
- [ ] Operator configures Trusted Publishers per package on npm UI (Org=`audiocontrol-org`, Repo=`deskwork`, Workflow=`release.yml`). Required setup for any future CI publishing in 26-CI.

**Acceptance:** `npm view @deskwork/core`, `npm view @deskwork/cli`, `npm view @deskwork/studio` all return the placeholder version. Trusted publishers configured per package (visible in npm UI Settings → Trusted publishing).

#### 26c — Plugin bin shim rewrite ✅ shipped (v0.9.5 combined PR)

- [x] Rewrite `plugins/deskwork/bin/deskwork` — first-run check `node_modules/@deskwork/cli/package.json` matches the plugin's manifest version; if absent, `npm install --omit=dev @deskwork/cli@<version>`; exec via `node_modules/.bin/deskwork`.
- [x] Rewrite `plugins/deskwork-studio/bin/deskwork-studio` (same pattern for `@deskwork/studio`; rename to `dw-studio` deferred to a future PR).
- [x] Local-dev verification: bin works against the local source tree (workspace symlink detection skips install).
- [x] npm-installed verification: bin shim's first-run install fetches `@deskwork/<pkg>@<version>` from the public registry and dispatches.

**Acceptance:** Bin shims handle workspace-dev + npm-install + version-drift cases via a directory-based concurrency lock (mkdir-atomic; macOS-portable). Met in v0.9.5 combined PR with 26e.

**Notes:**
- Plugin shell `package.json` is now empty (no `dependencies`) — the bin shim performs install at runtime against the public registry.
- The shim detects local-workspace mode by checking whether `node_modules/@deskwork/<pkg>` is a symlink (workspace mode) and bypasses install in that case. This prevents npm-installing over a workspace symlink (which would corrupt dev state).
- Version drift between `plugin.json` and an existing `node_modules/@deskwork/<pkg>` triggers reinstall — this covers the case where an operator updates the plugin shell (e.g. via a marketplace upgrade) while the npm-cached package is still on an older version.

#### 26d — Plugin rename: `deskwork-studio` → `dw-studio`

- [ ] `git mv plugins/deskwork-studio plugins/dw-studio`.
- [ ] `plugins/dw-studio/.claude-plugin/plugin.json` — `name: "dw-studio"`.
- [ ] `.claude-plugin/marketplace.json` — `plugins[1].name: "dw-studio"`, `plugins[1].source.path: "plugins/dw-studio"`.
- [ ] `plugins/dw-studio/README.md` updated (title + body).
- [ ] Root `README.md` and `MIGRATING.md` updated.
- [ ] `.claude/CLAUDE.md` updated (plugin layout / examples).
- [ ] grep `git grep -n "deskwork-studio"` returns only intentional historical references (CHANGELOG, MIGRATING.md).

**Acceptance:** `claude plugin validate plugins/dw-studio` passes. Marketplace install of v0.10.0 produces `enabledPlugins.dw-studio@deskwork`.

#### 26e — Retire vendor machinery ✅ shipped (v0.9.5 combined PR)

- [x] Delete `plugins/deskwork/vendor/` and `plugins/deskwork-studio/vendor/`.
- [x] Delete `scripts/materialize-vendor.sh` (and `scripts/test-materialize-vendor.sh`).
- [x] Delete `packages/cli-bin-lib/` entirely (the install-lock.sh runtime is replaced by the directory-lock implementation inline in the new bin shims).
- [x] `.claude-plugin/marketplace.json` — drop `source.ref` from each plugin's `git-subdir` source. Per Claude Code's marketplace docs, omitting `ref` defaults to the repository's default branch (verified via plugin-marketplaces docs).
- [x] `scripts/bump-version.ts` — drop `source.ref` bump logic. The script still bumps root + 3 workspace + 2 plugin shell + 2 plugin.json + marketplace metadata + per-plugin marketplace versions (10 versioned positions across 9 manifests).
- [x] Drop `packages/cli-bin-lib` from root `package.json` workspaces array.
- [x] `.claude/CLAUDE.md` — drop "Repository Layout" `vendor/` line; rewrite "Plugin Conventions" vendor rule as the npm-install rule; update "Common Commands" (drop materialize-vendor; add `make publish`).
- [x] `.github/workflows/release.yml` — drop `materialize-vendor` step + commit-and-re-point-tag step; rename source.ref verifier to a plugin-path verifier.
- [x] `.gitignore` — no vendor-related entries to remove (vendor was committed, not gitignored).

**Acceptance:** `npm install` at repo root succeeds. `npm test --workspaces` still passes. Met in v0.9.5 combined PR with 26c.

**Notes:**
- 26c and 26e shipped together in v0.9.5 (rather than 26h's planned v0.10.0 cut) because half-states (npm packages published but plugin shells still consuming `file:./vendor/cli`) are pure cruft — the operator's directive: "delete now. Let's not work around cruft."
- 26d (plugin rename `deskwork-studio` → `dw-studio`) intentionally deferred to a separate PR — it's an organizational rename that needs its own adopter migration story.
- 26f-26h tasks (manual-release flow updates, MIGRATING.md, end-to-end verification) deferred per scope decision: this PR strictly delivers the architectural change.

#### 26f — Manual release flow: RELEASING.md + `/release` skill (CI deferred to 26-CI)

- [ ] `RELEASING.md` — update procedure (bump → build → smoke → manual `npm publish` per package → tag). Drop source.ref pin section. Document the 2FA prompt expectation. Note: CI-driven publishing is a future phase (26-CI), not v0.10.0.
- [ ] `.claude/skills/release/` — update SKILL.md procedure + helpers + tests. Add `npm publish --access public --workspace @deskwork/<pkg>` step to the canonical flow (run from operator's terminal, NOT CI). Hard gate: smoke must verify `npm view @deskwork/<pkg>@<version>` returns 404 BEFORE tagging; verify it returns the new version AFTER publishing.
- [ ] `scripts/smoke-marketplace.sh` rewritten to exercise the npm-install path against placeholder-published `@deskwork/*` packages. PR #91's `scripts/smoke-clone-install.sh` deleted (superseded).
- [ ] `.github/workflows/release.yml` — drop `materialize-vendor` step; rename marketplace.json verification step (since `source.ref` is gone — verifies plugin paths instead). Do NOT add the `npm publish` step here — that's 26-CI. The workflow continues to do tagging + GitHub release creation only.

**Acceptance:** Operator can run `/release` end-to-end from their terminal; the skill orchestrates bump → build → smoke → manual `npm publish` per package (with 2FA prompts visible) → tag → push. CI continues to handle tagging + GitHub release creation only. `/release` skill catches a stale npm version (404 check + post-publish verification).

#### 26-CI (future phase, deferred from v0.10.0) — CI-driven npm publish via Trusted Publishers (OIDC)

Shipped only after the manual flow in 26f is solid. Adds `permissions: id-token: write` + `contents: read` to the publish job in `release.yml`. Adds `npm publish --access public` step (per workspace package, no `NPM_TOKEN` env var). Auto-provenance attaches on public-repo OIDC publishes. Operator's call when to ship.

#### 26g — Migration docs + adopter upgrade path

- [ ] `MIGRATING.md` — explicit step-by-step v0.9.x → v0.10.0: uninstall `deskwork-studio@deskwork`, clear stale `installed_plugins.json` entry per [#89](https://github.com/audiocontrol-org/deskwork/issues/89)'s pattern, install `dw-studio@deskwork`. Note: npm install on first invocation is automatic.
- [ ] `plugins/deskwork/README.md`, `plugins/dw-studio/README.md`, root `README.md` — install instructions reference v0.10.0+ flow + the new architecture in passing.
- [ ] `.claude/CLAUDE.md` — repository layout, plugin conventions, common commands all reflect the new architecture.

**Acceptance:** A new adopter following the README install instructions on a clean cache reaches a working `/deskwork:install` and `bin/dw-studio` (or `/dw-studio:studio` per #92 resolution status). An existing v0.9.x adopter following MIGRATING.md reaches the same state.

#### 26h — End-to-end verification + v0.10.0 ship

- [ ] Clean install rehearsal: clear `~/.claude/plugins/marketplaces/deskwork/` and `installed_plugins.json` entries; `/plugin marketplace add audiocontrol-org/deskwork`; install both plugins; verify `/deskwork:install` works against this monorepo; verify `bin/dw-studio` (or `/dw-studio:studio` per #92) launches the studio.
- [ ] Run all CLI subcommands (`deskwork add`, `deskwork plan`, `deskwork ingest`, etc.) against a fixture project; verify they work.
- [ ] Verify the studio renders (dashboard, review, content, scrapbook, help).
- [ ] Update workplan: mark Phase 26 complete; close [#93](https://github.com/audiocontrol-org/deskwork/issues/93).
- [ ] Run `/release` for v0.10.0.

**Acceptance:** Clean-cache install of v0.10.0 from the public marketplace path produces a working installation of both plugins. No manual file edits, no vendor materialization, no `npm install` errors. All workspace tests pass on the post-release tip. [#93](https://github.com/audiocontrol-org/deskwork/issues/93) closed via the release.

**Phase 26 GitHub tracking:** [#94](https://github.com/audiocontrol-org/deskwork/issues/94) — parent tracking issue with sub-phase checklist (26a–26h). Closes [#93](https://github.com/audiocontrol-org/deskwork/issues/93) and supersedes PR [#91](https://github.com/audiocontrol-org/deskwork/pull/91). [#92](https://github.com/audiocontrol-org/deskwork/issues/92) remains OUT of scope (Claude Code upstream bug — separate workstream).

**Notes:**
- The npm Trusted Publishers (OIDC) approach was operator-introduced after the initial draft used `NPM_TOKEN`. Avoids token rotation, avoids 2FA/OTP friction in CI, and gets supply-chain provenance for free on public-repo publishes. Per [docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers).
- This pivot reverses one of Phase 23's load-bearing decisions ("retire bundles → ship source via vendor"). The reversal is justified by three install-blockers in three releases pointing at the same root cause (workspace dep resolution doesn't survive Claude Code's marketplace install path). The operator framing: "Would we be better off publishing our code as an npm package?" — answer surfaced after Bug #93 made the install path crash on workspace dep resolution at runtime, not just at install time.

---

### Phase 26+: packaging follow-ups — v0.9.6

**Deliverable:** Close four packaging defects that surfaced after the Phase 26 v0.9.5 ship. All four stem from the architectural pivot (npm-publish + `files: ["dist", ...]` whitelist + bin-shim resolution); none independent of it.

**Sub-phase fixes (single PR):**

- [x] **Fix #97** (P0 bug) — `@deskwork/studio` runtime deps moved from `devDependencies` to `dependencies`. The package's `dist/build-client-assets.js` imports `esbuild`; the on-startup esbuild pass bundles `@codemirror/*` + `@lezer/highlight` from the plugin-shell client entries. v0.9.5 shipped with these in `devDependencies`; adopters got `ERR_MODULE_NOT_FOUND`. The v0.9.5 stopgap (plugin-shell `package.json` declaring them) is removed in this fix. Commit `3be7921`.
- [x] **Fix #95** (P0 bug) — `deskwork customize` re-anchored from `<pkg>/src/<category>/<name>.ts` to `<pkg>/dist/<category>/<name>.ts`. The npm tarball ships only `dist/` per the `files` whitelist; customize broke for npm-installed plugins (worked only in workspace-symlink dev). Build pipeline copies `.ts` source files verbatim from `src/<category>/` into `dist/<category>/`, mirroring the existing precedent for `@deskwork/core`'s three `.mjs` remark plugins. Two regression tests added (685 total, was 683). `listAvailable` tightened to exclude `.d.ts` declaration files from error-message listings. Commit `0a07d38`.
- [x] **Fix #96** (P1 doc) — Per-package READMEs authored for `packages/{core,cli,studio}` so npmjs.com landing pages render content (each package's `files` whitelist already declared `README.md`; the file just didn't exist at the package level). Each README is short (<35 lines), self-contained for an adopter landing from search, and points at the canonical marketplace install path for end-users. Commit `b195278`.
- [x] **Fix #100** (P1 doc) — `plugins/deskwork-studio/skills/studio/SKILL.md` Step 4 rewritten to describe the Phase 26 three-tier wrapper resolution (workspace symlink → pinned-version cache → first-run / version-drift install). Same drift fixed in `plugins/deskwork-studio/README.md` and `plugins/deskwork/README.md`. Phase 23-numbered reference in `plugins/deskwork/skills/customize/SKILL.md` dropped (the customize feature still exists; the prose just no longer pins to a phase). `git grep -n "Phase 23\|source-shipped\|materialize"` against plugin skill bodies returns nothing. Commits `e507290` (SKILL.md cleanup), `b195278` (README cleanup folded into the per-package README work).

**Acceptance:**
- [x] `@deskwork/studio` tarball declares `esbuild`, `@codemirror/*`, `@lezer/highlight` in `dependencies` (verified via `npm pack` + manifest inspection).
- [x] `deskwork customize templates dashboard` works against an extracted-tarball shape (covered by two new tests under `packages/cli/test/customize-skill.test.ts`).
- [x] `npm pack --workspace @deskwork/<pkg>` produces a tarball whose extraction has `package/README.md` for all three packages.
- [x] `git grep -n "Phase 23\|source-shipped\|materialize" plugins/` returns nothing.
- [x] All workspace tests pass: 685 total (683 baseline + 2 regression tests).

**Operator action:** v0.9.6 release runs separately via `/release` after this PR merges.

**Issues closed via /release:** [#95](https://github.com/audiocontrol-org/deskwork/issues/95), [#96](https://github.com/audiocontrol-org/deskwork/issues/96), [#97](https://github.com/audiocontrol-org/deskwork/issues/97), [#100](https://github.com/audiocontrol-org/deskwork/issues/100).

### Phase 26++: release-skill discipline + post-v0.9.6 dogfood

**Deliverable:** Three classes of work on top of Phase 26+. (1) Land Phase 26f's enshrinement of the npm-publish step inside `/release`; (2) ship v0.9.6 as the first canonical run through the new five-pause flow; (3) catalog adopter-experience defects surfaced by dogfooding v0.9.6 and integrate `dw-lifecycle` (which landed on `main` via a parallel branch) into the release-blocking smoke.

**Phase 26f — `/release` Pause 3 publish step:**

- [x] Insert "Pause 3 — Publish to npm" between the bump-commit (was Pause 2) and the smoke (was Pause 3, now Pause 4). Final-push renumbered to Pause 5. Commit `ac6a987`.
- [x] Add `assert-not-published <version>` helper (DESKWORK_PACKAGES list + `npm view` probe + structured stderr listing the conflicting packages). Pure function with `NpmViewer` injection seam; tests use a fake viewer. Real-registry smoke verified.
- [x] Update `RELEASING.md` to describe the 5-pause flow.

**v0.9.6 release run:**

- [x] First canonical release through the five-pause flow. Commits `b24fe77` (chore-release commit), tag `v0.9.6`. Atomic-pushed to `origin/main` + `origin/feature/deskwork-plugin` + tag in one `git push --follow-tags` RPC.
- [x] All four Phase 26+ issues closed via `/release` post-tag commentary (#95, #96, #97, #100).

**Post-v0.9.6 dogfood + bug filings:**

- [x] Closed five Phase 23-era obsolete issues now superseded by Phase 26: [#55](https://github.com/audiocontrol-org/deskwork/issues/55) (Phase 23 tracking), [#77](https://github.com/audiocontrol-org/deskwork/issues/77) (esbuild concurrent-boot race — fix shipped pre-pivot, still in `build-client-assets.ts`), [#78](https://github.com/audiocontrol-org/deskwork/issues/78) (materialize-vendor.sh — script deleted), [#79](https://github.com/audiocontrol-org/deskwork/issues/79) (smoke-marketplace SIGINT/port — both fixes survived in the Phase 26 smoke rewrite), [#80](https://github.com/audiocontrol-org/deskwork/issues/80) (Phase 23 follow-ups umbrella — most items moot post-vendor-retirement).
- [x] Filed [#99](https://github.com/audiocontrol-org/deskwork/issues/99) — studio intake form on the dashboard auto-collapses with no visible feedback when "copy intake →" is clicked. In `http://` (Tailscale magic-DNS) browsers `navigator.clipboard` is undefined and the toast fallback dismisses with the form. Recommended fix: persistent `<pre>` block with the slash-command payload as a manual-copy fallback. Same UX family as [#74](https://github.com/audiocontrol-org/deskwork/issues/74).
- [x] Filed [#101](https://github.com/audiocontrol-org/deskwork/issues/101) — **`@deskwork/cli` and `@deskwork/studio` declare `dependencies: { "@deskwork/core": "*" }`**. Wildcard violates the project's lockstep convention. Adopters with stale `@deskwork/core@<earlier>` in their install tree never get the v0.9.6 customize fix because the new `dist/doctor/rules/*.ts` source files only exist in `@deskwork/core@0.9.6`. **The v0.9.6 fix for #95 doesn't actually deliver in the shipping marketplace install** because of this wildcard. Pin recommendation: exact-version ([0.9.7](https://github.com/audiocontrol-org/deskwork/issues/101) maintained by `bump-version.ts`).
- [x] Filed [#102](https://github.com/audiocontrol-org/deskwork/issues/102) — `customize templates <name>` fails with `Cannot find package '@deskwork/studio'`. The customize CLI lives in `@deskwork/cli` (deskwork plugin shell); templates anchor on `@deskwork/studio`, which only exists in the *separate* `deskwork-studio` plugin shell's `node_modules/`. Architectural seam — needs a binary placement decision (likely shipping a separate `deskwork-studio customize` binary).
- [x] [#95](https://github.com/audiocontrol-org/deskwork/issues/95) re-opened in spirit via #101/#102: package-level fix landed cleanly (tarballs are correct), but adopter outcome doesn't hold. Tracking remediation in #101 (cheap fix) + #102 (design fork).

**`dw-lifecycle` integration into release process (parallel-branch merge integration):**

- [x] After `/release` of v0.9.6, fast-forwarded `feature/deskwork-plugin` to tip-of-`origin/main`, integrating 42 commits from a parallel-branch implementation of `plugins/dw-lifecycle/` (16-task project-lifecycle-orchestration plugin). Already at v0.9.6 via the parallel branch's `chore(dw-lifecycle): bump 0.9.5 -> 0.9.6 to match monorepo` commit (`a54e5d8`). 748 tests pass post-merge (685 + 63 new from `@deskwork/plugin-dw-lifecycle`).
- [x] Audited dw-lifecycle's release-process integration. Findings: `bump-version.ts` already aware (lines 56, 59 — bumps `plugins/dw-lifecycle/{package.json,plugin.json}`); `marketplace.json` already registered with `git-subdir` source; `make publish` correctly excludes (private package, no `@deskwork/*` runtime dep). One gap: **`scripts/smoke-marketplace.sh` did not exercise `bin/dw-lifecycle`**, leaving its install path silently un-validated by the release-blocking gate.
- [x] **Fix shipped (`f1ddcb7`):** Added `dw-lifecycle:dw-lifecycle` to `PLUGIN_BIN_PAIRS`. Required a coupled fix to `plugins/dw-lifecycle/src/cli.ts` because `bin/dw-lifecycle --help` previously returned `Unknown subcommand: --help` exit 1 (which would fail the smoke gate). Added explicit `--help` / `-h` / `help` handling: prints usage to stdout, exits 0; bare invocation continues to print to stderr + exit 1; unknown subcommands continue to exit 1. Five new dispatcher tests in `plugins/dw-lifecycle/src/__tests__/cli.test.ts` (dw-lifecycle suite: 63 → 68). Smoke verified end-to-end against the new shape.

**`/release` publish-step UX fix (post-v0.9.6 surfaced via this session's run):**

- [x] **Bug:** Phase 26f shipped with Pause 3 step 5 saying "On y, run `make publish`" — i.e., the agent runs it through the Bash tool. But the agent's Bash tool cannot pass interactive 2FA OTP prompts through to the operator's terminal — the call hangs indefinitely. The v0.9.6 release run surfaced this; recovery was: agent asks operator to run `make publish` in their own terminal, operator confirms, agent verifies via `npm view`. That recovery path was ad-hoc.
- [x] **Fix shipped (`d087fa6`):** Pause 3 restructured around explicit operator-side execution. The skill now: (1) prints **bold instructions** for the operator to run `make publish` in their own terminal (with explicit "the agent does NOT run `make publish` itself" callout); (2) waits for operator's "done" confirmation (no auto-poll); (3) verifies with new `assert-published <version>` helper that all three packages actually landed on the registry before continuing. Mirror of `assert-not-published` (same `verifyNpmStatus` helper, opposite predicate). RELEASING.md updated to match. Two new dispatcher tests (release skill 24 → 26).

**Acceptance:**
- [x] v0.9.6 shipped via the new five-pause `/release` flow.
- [x] All five Phase-23-era obsolete issues closed.
- [x] Three new packaging-bug issues filed (#99, #101, #102).
- [x] dw-lifecycle is release-gated by `scripts/smoke-marketplace.sh`.
- [x] `/release` Pause 3 no longer attempts to run `make publish` through the agent; the operator-side handoff is canonical.

**Issues opened in this phase:** [#99](https://github.com/audiocontrol-org/deskwork/issues/99), [#101](https://github.com/audiocontrol-org/deskwork/issues/101), [#102](https://github.com/audiocontrol-org/deskwork/issues/102).

**Issues closed in this phase:** [#55](https://github.com/audiocontrol-org/deskwork/issues/55), [#77](https://github.com/audiocontrol-org/deskwork/issues/77), [#78](https://github.com/audiocontrol-org/deskwork/issues/78), [#79](https://github.com/audiocontrol-org/deskwork/issues/79), [#80](https://github.com/audiocontrol-org/deskwork/issues/80), [#95](https://github.com/audiocontrol-org/deskwork/issues/95) (Phase 26+ ship), [#96](https://github.com/audiocontrol-org/deskwork/issues/96) (Phase 26+ ship), [#97](https://github.com/audiocontrol-org/deskwork/issues/97) (Phase 26+ ship), [#100](https://github.com/audiocontrol-org/deskwork/issues/100) (Phase 26+ ship).

**Operator action:** Two commits (`f1ddcb7` + `d087fa6`) ride along in the next release. The /release UX fix is itself release-tested by the next /release run.

### Phase 26+++: wildcard inter-package dep fix — v0.9.7

**Deliverable:** Close [#101](https://github.com/audiocontrol-org/deskwork/issues/101). The v0.9.6 customize fix (#95) didn't deliver to adopters in the marketplace install because `@deskwork/cli` and `@deskwork/studio` declared `dependencies: { "@deskwork/core": "*" }`. Wildcard ranges let npm resolve to whatever stale `@deskwork/core` happened to be in the install tree, defeating lockstep at the resolution layer.

**Implementation:**

- [x] Pin `@deskwork/core` in `packages/cli/package.json` and `packages/studio/package.json` to an exact version (was `"*"`, now matches `version`).
- [x] Extend `scripts/bump-version.ts`: rename the `plugin-shell-package-json` kind to `lockstep-package-json` and apply it to `packages/cli` and `packages/studio` so future bumps maintain the inter-package pins. Same code path that already maintains plugin-shell pins; the rename clarifies the broader scope.
- [x] Add manifest-shape regression in `packages/cli/test/customize-skill.test.ts`: assert every `@deskwork/*` dep across `packages/cli`, `packages/studio`, `plugins/deskwork`, `plugins/deskwork-studio` is pinned to exactly `<rootVersion>`. Four parametrized assertions per release.
- [x] Tests: `packages/cli` 149 → 153 (+4 manifest-invariant cases). 757 workspace tests pass.

**Acceptance:**

- [x] v0.9.7 shipped via the five-pause `/release` flow (commit `cf88937`, chore-release `02efb92`, tag `v0.9.7` on origin, GitHub release auto-created).
- [x] `npm view @deskwork/cli@0.9.7 dependencies` shows `@deskwork/core` pinned to `0.9.7`. Same for `@deskwork/studio`.
- [x] Marketplace install dogfood post-publish: `deskwork customize . doctor calendar-uuid-missing` succeeds against a fresh adopter tree (verified 2026-04-30 — bin shim detected drift, reinstalled `@deskwork/cli@0.9.7`, resolved `@deskwork/core@0.9.7`).

**Issues closed in this phase:** [#101](https://github.com/audiocontrol-org/deskwork/issues/101).

### Phase 26++++: `deskwork repair-install` recovery for #89 — v0.9.8

**Deliverable:** Adopter-side recovery for [#89](https://github.com/audiocontrol-org/deskwork/issues/89) — `~/.claude/plugins/installed_plugins.json` accumulates entries pointing at cache directories that no longer exist on disk; Claude Code wires PATH from these stale entries and the bin is unreachable. The root-cause fix is registry hygiene in Claude Code (filed upstream as [anthropics/claude-code#54905](https://github.com/anthropics/claude-code/issues/54905)). Until that lands, deskwork ships a recovery command that runs without depending on PATH.

**Implementation:**

- [x] New CLI subcommand `deskwork repair-install` (`packages/cli/src/commands/repair-install.ts`). Reads `~/.claude/plugins/installed_plugins.json`, identifies entries for `deskwork@deskwork`, `deskwork-studio@deskwork`, `dw-lifecycle@deskwork` whose `installPath` doesn't exist on disk, prunes them, and reports which plugins now have no live entry. Supports `--dry-run` and `--json` flags.
- [x] Subcommand registered in `packages/cli/src/cli.ts` under "Maintenance" in help text.
- [x] 9 unit tests in `packages/cli/test/repair-install.test.ts`: live-only no-op, mixed prune, all-stale delete-key, third-party-untouched, missing-after-prune reporting, empty-installPath handling, ordering preservation.
- [x] Adopter recovery flow documented in [`plugins/deskwork/README.md`](../../../plugins/deskwork/README.md). Adopter invokes via the marketplace-clone path so a broken PATH doesn't prevent self-heal: `~/.claude/plugins/marketplaces/deskwork/plugins/deskwork/bin/deskwork repair-install`.
- [x] End-to-end verified against the dev machine's actual broken state — 10 stale entries identified across 6 `deskwork@deskwork` records, 3 `deskwork-studio@deskwork` records, 1 `dw-lifecycle@deskwork` record; only 1 valid entry preserved (`deskwork-studio@deskwork v0.7.2`).
- [x] 766 workspace tests pass (was 757; +9 repair-install).
- [x] Upstream [anthropics/claude-code#54905](https://github.com/anthropics/claude-code/issues/54905) filed in parallel — concrete repro from the dev machine, suggested PATH-wire reconciliation fix.

**Acceptance:**

- [x] v0.9.8 shipped via the five-pause `/release` flow (commit `68f40e6`, chore-release `f62cb61`, tag `v0.9.8` on origin, GitHub release auto-created).
- [x] `deskwork repair-install --dry-run` reports stale entries accurately on a known-broken machine.
- [x] [#89](https://github.com/audiocontrol-org/deskwork/issues/89) updated with adopter recovery instructions + cross-link to the upstream Claude Code issue.

**Issues commented:** [#89](https://github.com/audiocontrol-org/deskwork/issues/89) (adopter recovery + upstream cross-link).

### Phase 27: studio bug tranche — v0.10.0

**Deliverable:** Fix the seven adopter-facing studio bugs surfaced by the v0.9.7 marketplace-install dogfood ([#103](https://github.com/audiocontrol-org/deskwork/issues/103), [#104](https://github.com/audiocontrol-org/deskwork/issues/104), [#105](https://github.com/audiocontrol-org/deskwork/issues/105), [#106](https://github.com/audiocontrol-org/deskwork/issues/106), [#107](https://github.com/audiocontrol-org/deskwork/issues/107), [#108](https://github.com/audiocontrol-org/deskwork/issues/108), [#110](https://github.com/audiocontrol-org/deskwork/issues/110)). Single PR, single `v0.10.0` release.

**Sub-phase A — Content-detail panel read-path ([#103](https://github.com/audiocontrol-org/deskwork/issues/103)):**

- [x] Trace the API endpoint that backs `/dev/content/<collection>/<root>?node=<path>`'s right-panel render. Identify whether the failure is in path resolution, the frontmatter parser, or the body preview renderer.
- [x] Reproduce against this project's `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` (481 lines, valid `deskwork.id` + `title` frontmatter). Confirm the failure shape end-to-end.
- [x] Fix the underlying read. The fix must handle the `deskwork:` namespace correctly (per the v0.7.2 frontmatter convention).
- [x] Add a regression test using the project's own `prd.md` as the fixture; assert the right-panel render returns frontmatter-with-fields and a non-empty body preview.

**Diagnosis:** `loadDetailRender` at `packages/studio/src/pages/content-detail.ts:218` only resolved the file via `findOrganizationalIndex(contentDir, node.path)`, which checks for `<path>/index.md` / `<path>/README.md` only. It never consulted `node.filePath` — the id-bound on-disk file already attached to the tree node by `content-tree.ts:282` (Phase 22++++ / Issue #70). For single-file entries (peer `.md` naming, like the PRD at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`), the lookup missed entirely and both panes rendered empty-state. Fix: prefer `node.filePath` when set, fall back to `findOrganizationalIndex` for purely organizational nodes. Regression test at `packages/studio/test/content-detail-single-file-entry.test.ts` reproduces the PRD shape (peer `.md` with `deskwork.id` namespace + multi-paragraph body) and asserts the dl renders with the id present and the body preview is non-empty.

**Sub-phase B — Manual content rewrite ([#104](https://github.com/audiocontrol-org/deskwork/issues/104)) + dashboard rewrite ([#69](https://github.com/audiocontrol-org/deskwork/issues/69) closed in passing):**

- [x] Walk every `/editorial-(add|plan|outline|draft|publish|distribute)` reference in `packages/studio/src/pages/help.ts` (and any related help-content files) and replace with the canonical `/deskwork:*` name.
- [x] Add a regression test asserting `/dev/editorial-help` HTML contains zero `/editorial-(add|plan|outline|draft|publish|distribute)` matches (and a positive assertion that `/deskwork:*` references appear).

**Files migrated:** `packages/studio/src/pages/help.ts` (Manual sections II/IV/V/VII), `packages/studio/src/lib/editorial-skills-catalogue.ts` (slugs + cross-references), `packages/studio/src/pages/dashboard.ts` (empty-state prose + 8 `data-copy` button payloads + Awaiting-press hint + Voice-drift hint). Scope extended to dashboard.ts because the same legacy slash names live there in user-facing clipboard payloads — adopters paste `/editorial-plan` → "command not found." Closes [#69](https://github.com/audiocontrol-org/deskwork/issues/69) in passing (the v0.8.4 partial fix completed here). Audiocontrol-specific commands (`/editorial-reddit-sync`, `/editorial-social-review`, `/editorial-reddit-opportunities`, `/editorial-cross-link-review`, `/editorial-performance`, `/editorial-suggest`) left untouched in §I Distribution track of the Manual — they reference commands that don't exist in the OSS deskwork CLI; broken docs to file as a follow-up rather than expand scope further. Regression test at `packages/studio/test/manual-canonical-slash-names.test.ts` covers both `/dev/editorial-help` and `/dev/editorial-studio`.

**Sub-phase C — Studio copy-to-clipboard input validation + manual-copy fallback ([#105](https://github.com/audiocontrol-org/deskwork/issues/105)):**

- [x] Audit all studio copy-to-clipboard buttons (rename, intake, Approve hint popup, any others). Catalog them.
- [x] Implement a unified validation + fallback helper: validate empty inputs before generating the command; on `navigator.clipboard.writeText` failure or unavailability (HTTP context, sandboxed iframe), render the command in a persistent `<pre>` block as a manual-copy fallback.
- [x] Apply the helper to all catalogued buttons.
- [x] Note: closing [#74](https://github.com/audiocontrol-org/deskwork/issues/74) and [#99](https://github.com/audiocontrol-org/deskwork/issues/99) is in scope here — same family, same fix shape.

**Diagnosis:** Five copy-to-clipboard call sites lived across two client files with three different fallback patterns. Worst case (#74) was the Approve / Iterate path in `editorial-review-client.ts:1456` — `copyAndToast` only tried `navigator.clipboard.writeText` (no execCommand fallback), surfaced a 4-second toast on failure, and was paired with a `setTimeout(reload, 2400)` that destroyed the toast before the operator could read the command. Intake form (#99) auto-collapsed on click regardless of clipboard outcome, hiding any error from the operator. Rename form (#105) left the submit button enabled on initial render so an empty-input click was a silent no-op. New leaf module `plugins/deskwork-studio/public/src/clipboard.ts` exports `copyToClipboard` (async API → execCommand fallback, throws on empty input) and `copyOrShowFallback` (best-effort copy → on failure renders a fixed-position dismiss-able `<aside>` with a pre-selected `<pre>` block, and sets `document.body.dataset.manualCopyOpen='1'` while mounted). The Approve/Iterate handlers now check `isManualCopyOpen()` before reloading; the panel's Dismiss button triggers the deferred reload via `onDismiss`. Rename form moved to `rename-form.ts` (sibling extraction to keep `editorial-studio-client.ts` under 500 lines) and now disables submit on initial render until the operator types a valid slug, with belt-and-braces re-validation on submit. Intake form validates required fields BEFORE generating the payload, focuses the offending field on error, and skips auto-collapse on manual-copy fallback so the operator can verify form values against the panel. Generic `.er-copy-btn` buttons console.warn loudly when `data-copy` is missing instead of silently no-op'ing. All four pre-existing tsc errors in `editorial-studio-client.ts` are pre-existing — no new type errors introduced. Studio (`200 passed`) and CLI (`162 passed`) test suites green.

**Sub-phase D — "Coverage matrix" empty-state copy fix ([#106](https://github.com/audiocontrol-org/deskwork/issues/106)):**

- [x] Rewrite the shortform desk's empty-state copy to match what the dashboard actually renders (e.g., "Start a new shortform draft from the dashboard's Drafting list").
- [x] Update the link target to `/dev/editorial-studio#stage-drafting` (anchor-scroll to the Drafting section). Anchor namespaced `stage-<lowercase>` so every stage section gets a consistent `id="stage-${stage.toLowerCase()}"` rather than reserving the bare slug for one stage.
- [x] Verify the anchor scrolls correctly on click. Test asserts both the empty-state link target and the dashboard's `id="stage-drafting"` anchor mount; cross-stage consistency also asserted.

**Diagnosis:** The shortform desk pointed at a "coverage matrix" that doesn't exist on the dashboard, with a link target (`/dev/editorial-studio`) that landed at the top of the page. Adopters hit a dead end. Fix: empty-state copy in `packages/studio/src/pages/shortform.ts:107` names the Drafting list; `renderStageSection` in `packages/studio/src/pages/dashboard.ts:710` emits `id="stage-${stage.toLowerCase()}"`. Regression test at `packages/studio/test/shortform-empty-state.test.ts`; pre-existing `shortform-routing.test.ts` test updated.

**Sub-phase E — Index page sensible defaults for un-linked surfaces ([#107](https://github.com/audiocontrol-org/deskwork/issues/107)):**

- [x] Longform reviews entry (III): if a most-recent in-review workflow exists, link to its `/dev/editorial-review/<uuid>`. Otherwise link to `/dev/editorial-studio#stage-review` (re-using the anchor mounted in sub-phase D; cleaner than introducing a new `?stage=` query parameter just for this fallback).
- [x] Scrapbook entry (V): link to `/dev/content` (the scrapbook is reached by drilling into a content node).
- [x] Visual: keep the URL template hint (`<slug>` / `<site>/<path>`) visible alongside the link, so adopters still see the URL shape.

**Diagnosis:** `IndexEntry` had no way to express "templated route, but here's a link target." The renderer treated `template` as exclusive with linking. Refactor: added optional `linkHref` field — when set, the title becomes a link to that URL even for templated entries; the route hint span stays alongside as a placeholder. `SECTIONS` const moved to `buildSections(ctx)` so the Longform entry can compute `linkHref` from the workflow journal at render-time. `pickDefaultLongformWorkflow` returns the most-recent open longform (by `updatedAt`); falls through to `/dev/editorial-studio#stage-review` when none exists. Scrapbook entry hardcoded to `/dev/content`. Stale "Loopback only." string in the colophon dropped while in the file (pre-Tailscale support claim, no longer accurate; cosmetic). Regression tests at `packages/studio/test/index-page-defaults.test.ts` cover three branches: empty calendar (Longform → anchor), populated longform (Longform → deep-link), and Scrapbook → /dev/content; all assert the URL template hint stays visible.

**Sub-phase F — Destructive shortcut soft-confirm ([#108](https://github.com/audiocontrol-org/deskwork/issues/108)):**

- [x] Implement two-key sequence handling for `a a`, `i i`, `r r` (within ~500ms). Single keystroke pops a transient hint ("press a again to approve") that auto-dismisses; second matching keystroke fires the action.
- [x] Update the `?` shortcuts panel to document the two-key behavior.
- [x] Keep `j` / `k` (next/prev margin note) and `e` (toggle edit) as single-key — they're not destructive.

**Diagnosis:** `editorial-review-client.ts:1664-1666` (post-disarm-refactor: 1670-1685) bound `a`/`i`/`r` to single-keystroke `approveBtn?.click()` etc. Stray keystroke while reading collapsed weeks of work. Fix: module-level `armedKey` + `armedTimer` state. `armKey(key)` shows a hint toast ("Press a again to approve"), schedules `disarm()` in 500ms. Destructive-key path checks `armedKey === key` → fire and disarm; else → arm. Non-destructive shortcuts (`e`, `j`, `k`) call `disarm()` defensively before their own action so a half-armed state can't leak across navigation. The `?` shortcuts panel in `packages/studio/src/pages/review.ts:278-280` updated to show double-`<kbd>` rows + "press twice within 500ms" prose. Regression test at `packages/studio/test/review-shortcuts-panel.test.ts` covers (1) double-`<kbd>` rendering, (2) absence of the pre-fix single-`<kbd>` shape, (3) preservation of `j`/`k`/`e` single-key shortcuts. Two-key behavior itself is client-only — no jsdom infrastructure means no direct unit test; the panel-content test is the server-side artifact that documents the fix.

**Sub-phase G — Dashboard row link fallback ([#110](https://github.com/audiocontrol-org/deskwork/issues/110)):**

- [x] When no open workflow exists for a calendar entry, link the row to `/dev/content/<collection>/<path>` (the content-detail page). Workflow-linked entries keep their `/dev/editorial-review/<uuid>` target.
- [x] Every dashboard row in every stage becomes clickable. Visual treatment is identical (consistency over per-target styling) — the `<a>` carries `title` attributes that distinguish the destination on hover.
- [x] Same fallback applies to "Recent proofs" rows on the dashboard, which are also currently un-linked.

**Diagnosis:** Three render paths were broken: (1) Drafting/Review entries with no workflow rendered slug as plain text (no link); (2) entries with `hasFile` but no workflow ALSO had a broken target — `blogPreviewLink` returned `/dev/editorial-review/<key>` for non-Published stages even when no workflow existed (would 404 or render an empty workflow page); (3) Recent proofs rows in the terminal-workflows section were `<div>` elements with no link target. New `contentDetailLink(site, slug)` helper builds `/dev/content/<site>/<root>?node=<slug>` URLs (encodeURIComponent on both segments and the node param). `slugCell` resolution is now: workflow → review surface; Published → public host URL; else → content-detail. Hierarchical-slug branch updated similarly so depth-aware rows also wrap in `<a>`. Recent proofs section converted from `<div class="er-row">` to `<a class="er-row" href={workflowLink(w)}>` so terminal workflows are clickable. Regression test at `packages/studio/test/dashboard-row-link-fallback.test.ts` covers all three cases.

**Acceptance:**

- [ ] All 7 bugs verified fixed via the public path: `/plugin marketplace update deskwork` → `/reload-plugins` → boot studio → walk each surface → confirm the fix renders.
- [ ] Regression tests pass: content-detail (#103), help-page slash-name (#104), studio test suite for copy-button helpers (#105).
- [ ] No new console errors introduced.
- [ ] v0.10.0 shipped via the five-pause `/release` flow.

**Issues closed in this phase:** [#103](https://github.com/audiocontrol-org/deskwork/issues/103), [#104](https://github.com/audiocontrol-org/deskwork/issues/104), [#105](https://github.com/audiocontrol-org/deskwork/issues/105), [#106](https://github.com/audiocontrol-org/deskwork/issues/106), [#107](https://github.com/audiocontrol-org/deskwork/issues/107), [#108](https://github.com/audiocontrol-org/deskwork/issues/108), [#110](https://github.com/audiocontrol-org/deskwork/issues/110). Plus [#74](https://github.com/audiocontrol-org/deskwork/issues/74) and [#99](https://github.com/audiocontrol-org/deskwork/issues/99) (subsumed by sub-phase C).


### Phase 28: durable cache-restore script + auto-repair hook — v0.10.1

Shipped. Customer-blocking [#131](https://github.com/audiocontrol-org/deskwork/issues/131). New `scripts/repair-install.sh` at the marketplace clone path (durable across cache eviction); restores cache subtrees from clone + prunes stale registry entries. Modes: default, `--quiet` (silent on healthy ~150ms; SessionStart hook usage), `--check` (read-only). Version banner when not `--quiet`. `deskwork repair-install` becomes a thin TS shell-out wrapper. README adopter snippet documents the SessionStart hook. New rule in `agent-discipline.md`: "Adopter-facing scripts have a stable CLI contract."

**Issues:** [#131](https://github.com/audiocontrol-org/deskwork/issues/131) (left open — customer-acceptance verification per the closure rule).

### Phase 28+: SessionStart hook hint in `repair-install.sh` — v0.10.2

Shipped. Issue [#132](https://github.com/audiocontrol-org/deskwork/issues/132) — agent-driven install gap surfaced during v0.10.1 customer-acceptance dogfood (agent reached for `update-config` harness skill to install the hook; reverted; filed issue). Operator chose smaller-shape: hint, not install surface.

- [x] `scripts/repair-install.sh` detects whether the SessionStart hook is wired in `~/.claude/settings.json` or `./.claude/settings.json` via substring match on `repair-install.sh` (leans on script-path stability rule).
- [x] Hint printed at end of default + `--check` output when not installed; suppressed in `--quiet` (silence-on-healthy contract holds).
- [x] Verified locally: hint shows when no hook installed; `--quiet` zero-output exit 0; hint suppressed when project-scope `.claude/settings.json` has the hook.

**Acceptance:**

- [x] v0.10.2 shipped via the five-pause `/release` flow.

**Issues:** [#132](https://github.com/audiocontrol-org/deskwork/issues/132) (left open — operator's call after fresh-session verification).

---

### Phase 29: post-release customer acceptance playbook (`/post-release:walk` + `/post-release:file-issues`)

**Deliverable:** A pair of skills that codify how to evaluate the freshly-installed deskwork marketplace plugin, surface friction, and file issues — using the deskwork pipeline itself as the triage surface. `/post-release:walk` runs cursory (default) or deep modes against the latest marketplace install; produces a structured findings markdown ingested into deskwork as a longform document for operator review. `/post-release:file-issues` parses the operator-approved findings doc and files GitHub issues per finding (with per-finding confirmation).

**Source-of-truth:** [`docs/1.0/post-release-acceptance-design.md`](../../../post-release-acceptance-design.md) — design v2 applied 2026-04-30 via deskwork workflow `970aa75d-f586-47f0-bc89-4481830a7676` (commit `b1f1815`). Operator margin notes both addressed by the v2 stop-gap framing.

**Operator principle driving the work:** *"We should have a post-release customer acceptance playbook that we run through — not hard-coded tooling, but a skill (or a composition of skills) that codify how to evaluate the installed plugin to ensure it's sane and file bugs if it's not. This should include playwright inspection of the studio. We should update that playbook as we add/update features."*

**Stop-gap framing (binding):** Per the design's Stop-gap status section, the entire Phase 29 surface — both new `/post-release:*` skills AND the existing `/release` skill it integrates with — is scaffolding inside the deskwork plugin only because dw-lifecycle has not yet shipped customizable lifecycle stages. When dw-lifecycle gains that capability, `/release` and `/post-release:*` migrate into dw-lifecycle's customizable-workflow surface; file paths (skill paths, playbook path, generated findings paths) are explicitly ephemeral. Schema choices, file paths, and skill names should stay simple enough that the migration is a move-and-rename, not a re-architect.

#### Sub-phases

**Sub-phase A — Playbook scaffold** (foundational; the playbook is the contract for assertions):

- [ ] T1 — Author `docs/post-release/playbook.md` initial version with per-surface sections (`/dev/`, `/dev/editorial-studio`, `/dev/editorial-help`, `/dev/editorial-review-shortform`, `/dev/content`, `/dev/editorial-review/<id>`). Each section has cursory + deep assertion lists. Baseline reflects v0.10.X studio surface.
- [ ] T2 — Implement playbook parser (TS module under `packages/cli/src/post-release/playbook.ts` or equivalent). Returns structured `PerSurfaceAssertions[]`. Unit tests cover: well-formed playbook, missing section, malformed assertion, empty file. Reuses existing markdown-parsing helpers from `@deskwork/core` if present.

**Sub-phase B — `/post-release:walk` cursory mode** (minimum viable walk):

- [ ] T3 — Boot studio + auto-discover surfaces from `/dev/` index. Implementation: HTTP fetch of `/dev/`, parse anchor hrefs starting with `/dev/`. Extend with playbook-only routes that aren't in the index. Output: `DiscoveredSurface[]`.
- [ ] T4 — Per-surface walk: HTTP GET each surface; capture status code, response time, network failures from referenced assets (CSS/JS/images). For console errors, defer to deep mode (Playwright not used in cursory — the design called for it but cursory's value is fast HTTP-only checks; deep mode adds Playwright). Update design Open Question #6 if scope changes.
- [ ] T5 — Aggregate findings: each non-OK observation (4xx/5xx, asset 404, missing playbook entry, failed assertion) becomes a `Finding` with severity (`bug` | `enhancement` | `info`), title, body, optional artifact path.
- [ ] T6 — Generate findings doc at `docs/post-release/<version>-acceptance.md` (per the design's template). Frontmatter binds via `deskwork.id` (auto-generated UUID). Header section + per-surface walked checklist + Findings list.
- [ ] T7 — Shell out to `deskwork ingest <path>` then `deskwork review-start --site <site> <slug>`. Surface review URL to operator.
- [ ] T8 — `plugins/deskwork/skills/post-release/walk/SKILL.md` — operator-facing prose. Steps: confirm version, boot studio, walk surfaces, ingest + review-start, surface URL.

**Sub-phase C — Playbook assertions wired**:

- [ ] T9 — Wire parsed playbook assertions (T2) into the walk (T4) per-surface. Each cursory assertion runs against the fetched HTML; failed assertion emits a finding. Document assertion-language: a fixed vocabulary (`returns 200`, `every linked asset returns 200`, `no console.error`, `selector exists`, `selector matches text`, `selector has attribute`).
- [ ] T10 — Tests for assertion engine: fixture playbook + fixture HTML response per assertion type. At least 1 happy + 1 failure case per assertion type.

**Sub-phase D — `/post-release:walk` deep mode**:

- [ ] T11 — Sandbox project setup helper: `mktemp -d`, run `/deskwork:install --no-prompt` against it (or equivalent CLI flag — confirm install skill supports non-interactive mode; if not, file follow-up issue). Verify `.deskwork/config.json` lands.
- [ ] T12 — CLI drive sequence: `add → plan → outline → draft → review-start → iterate (no-op iterate, just snapshot disk) → approve → publish`. Each step asserts expected stage transition + on-disk artifact (frontmatter, scaffold file, datePublished).
- [ ] T13 — Studio cross-check during the drive. Each stage transition: HTTP-fetch dashboard, assert entry appears in expected stage section. Screenshot via Playwright (deep mode wires Playwright; cursory does not).
- [ ] T14 — Update walk SKILL.md (T8) with `--mode deep` documentation.

**Sub-phase E — `/post-release:file-issues`**:

- [ ] T15 — Findings-doc parser (TS module). Each `### Finding NN — <title>` heading produces one `ParsedFinding`. Severity field maps to label. Artifact references resolve to relative paths under the artifacts dir. Tests against fixture findings docs (well-formed, missing severity, deleted finding section, info-severity skip).
- [ ] T16 — Per-finding confirmation loop: print title + severity + surface + first 80 chars of body; prompt `[y/N/edit]`; on `y` invoke `gh issue create --title <title> --body-file <tmp> --label <severity> --label post-release` (the `post-release` label is the design's Open Question #2 recommendation; confirm with operator on first run if not previously decided). Each filed issue body ends with `Surfaced by post-release acceptance walk: [v<X.Y.Z> acceptance](docs/post-release/v<X.Y.Z>-acceptance.md)`.
- [ ] T17 — `plugins/deskwork/skills/post-release/file-issues/SKILL.md` — operator-facing prose. Verify `state === applied`, parse approved version, prompt loop, summary report.

**Sub-phase F — `/release` end-prompt integration**:

- [ ] T18 — Add end-prompt to existing `/release` skill (Pause 5 success → `Run /post-release:walk now to verify the install? [y/N]`). On `y`: invoke `/post-release:walk --version v<just-shipped>`. On `N`: print the deferred-walk reminder.
- [ ] T19 — `/release` skill regression test extension: existing 20 tests + new test asserting the prompt fires after Pause 5 success. Manual integration smoke against sandbox remote.

**Sub-phase G — Playbook stays-current procedural amendment**:

- [ ] T20 — Add a one-line checklist item to the project's standard feature workflow skill (`.claude/skills/feature-define/SKILL.md` AND `.claude/skills/feature-extend/SKILL.md` if mirrored): *"Review `docs/post-release/playbook.md`. Add or update assertions for the surfaces this feature touches."* Note in the SKILL prose: this is procedural for now; becomes a typed phase in dw-lifecycle once customizable workflows ship.

**Acceptance:**

- [ ] `docs/post-release/playbook.md` exists with v0.10.X-baseline assertions for every studio surface listed in `/dev/` index.
- [ ] `/post-release:walk` cursory mode runs end-to-end against the v0.10.X marketplace install: boots studio, walks surfaces, generates findings doc, ingests + review-starts, prints review URL.
- [ ] `/post-release:walk --mode deep` runs end-to-end against a sandbox project: sandbox install, CLI drive, studio cross-check.
- [ ] `/post-release:file-issues` files at least one real GitHub issue from an operator-approved findings doc, with the `post-release` label and the cross-link footer.
- [ ] `/release` end-prompt fires after Pause 5 success and successfully invokes `/post-release:walk --version v<just-shipped>` on `y`.
- [ ] Feature-workflow skill (define/extend) includes the playbook-update checklist item.
- [ ] First canonical run = post-release walk against the v(N+1) shipped after Phase 29 lands. Real findings file as real issues — that's the end-to-end smoke.

**GitHub tracking:** Parent issue [#133](https://github.com/audiocontrol-org/deskwork/issues/133). Sub-phase issues filed as work progresses if scope warrants — small phases stay as one issue per the project's existing per-phase-one-issue convention.

**Phase 30 dependency:** Phase 29 implementation is likely deferred behind Phase 30 (deskwork pipeline redesign — see below). The new entry-centric model becomes the foundation Phase 29 will eventually build on; designing `/post-release:walk` + `/post-release:file-issues` against a CLI/calendar/dashboard surface that's about to change substantially would be wasted work. Operator decision pending.

---

### Phase 30: deskwork pipeline redesign — entry-centric calendar with universal verbs

**Deliverable:** Foundational rearchitecture of the deskwork pipeline. Calendar stage and review-workflow state collapse into one entry-centric state machine. Eight stages (Ideas → Planned → Outlining → Drafting → Final → Published linear pipeline; Blocked + Cancelled off-pipeline). Universal `iterate` and `approve` verbs. Per-entry JSON sidecars at `.deskwork/entries/<uuid>.json` as source-of-truth; calendar.md becomes a regenerated scannable index. `iterate` retained as the only multi-write CLI helper; all other verbs are skill-prose + doctor. LLM-as-judge sub-agent dispatch from `/deskwork:doctor`. Migration via `deskwork doctor --repair` (one-shot; breaking changes acceptable). Major release.

**Source-of-truth:**
- Spec: [`docs/superpowers/specs/2026-04-30-deskwork-pipeline-redesign-design.md`](../../../superpowers/specs/2026-04-30-deskwork-pipeline-redesign-design.md) (654 lines, 26 sections; written 2026-04-30)
- Plan: [`docs/superpowers/plans/2026-04-30-deskwork-pipeline-redesign.md`](../../../superpowers/plans/2026-04-30-deskwork-pipeline-redesign.md) (3535 lines, 42 TDD-shaped tasks across 7 phases; written 2026-04-30)

**Operator principle driving the work:** *"There's an explicit 'review' and an explicit 'paused' state. That seems wrong. Reviewing and pausing are not workflow states, they are processes that can happen at any part of the workflow. So, the actual workflow stages are: ideas → planned → outlining → drafting → final → published; Any number of review/edit/iterate cycles can happen to a document at any stage of that workflow. BUT, 'approving' a document signifies the terminal state of that workflow and REQUIRES that the document be moved to the next stage in the workflow."*

**Key design decisions (resolved during brainstorm):**
- Migration: in-place via `deskwork doctor --repair`; breaking changes acceptable since this project + audiocontrol.org are the only adopters.
- Workflow shape: entry-centric for linear pipeline; shortform stays on workflow-object model (deferred).
- Source of truth: per-entry JSON sidecars + regenerated calendar.md scannable index; doctor reconciles three sources (sidecar, calendar.md, file frontmatter).
- CLI surface: keep `iterate` only (multi-write transactional); rest is skill-prose + doctor.
- LLM-as-judge: sub-agent dispatch via Claude Code's Agent tool with configurable model (Haiku 4.5 default); operator's existing Claude Code subscription pays.
- Stop-gap features (`/release`, `/post-release:*`) migrate into dw-lifecycle once it ships customizable lifecycle stages — this redesign is the foundation that arc depends on.

**Process directive:** *"Let's NOT use the deskwork plugins at all of this process. We are the only customers at the moment, so we can and should make breaking changes."* Plain markdown + git diff + chat-iteration for the design and review work. No deskwork plugins, no dw-lifecycle plugin involvement. Foundational rearchitecture is the wrong artifact to walk through deskwork's own pipeline.

#### Phases (per implementation plan)

- [x] **Phase 1** — Schema + sidecar IO + calendar render (Tasks 1–7) — shipped 2026-04-30
- [x] **Phase 2** — Migration via `deskwork doctor --repair` (Tasks 8–11; includes migrating this project's calendar) — shipped 2026-04-30
- [x] **Phase 3** — `iterate` helper rewrite (Tasks 12–14) — shipped 2026-04-30
- [x] **Phase 4** — Skill-prose verbs (add/approve/block/cancel/induct/publish/status/doctor; retire old skills) (Tasks 15–22) — shipped 2026-04-30
- [x] **Phase 5** — Doctor expansion + LLM-as-judge orchestration (Tasks 23–32) — shipped 2026-04-30
- [x] **Phase 6** — Studio dashboard + review surface + Manual rewrite (Tasks 33–37) — shipped 2026-04-30
- [x] **Phase 7** — Migration runbook + integration smoke + major release (Tasks 38, 39, 41, 42 done; 40 audiocontrol dry-run deferred to operator) — shipped 2026-05-01 as v0.11.1

Each phase reached a stable checkpoint, reviewed and committed.

**Acceptance:**

- [x] All eight stages exist in the calendar; entries can move through the linear pipeline, into Blocked/Cancelled, and be inducted back.
- [x] All listed CLI verbs work via skill prose (or as the `iterate` helper); retired verbs print stable error messages.
- [x] Doctor's nine validation categories all run; `--repair` handles the non-destructive classes.
- [x] LLM-as-judge sub-agent dispatch fires from `/deskwork:doctor` (skill-side prose; helper-side stays pure) with the operator's configured model.
- [x] Migration of this project's calendar succeeds via `deskwork doctor --fix=all` (commit `359079c`). Audiocontrol.org dry-run deferred (Task 40).
- [x] Studio dashboard renders eight stages with stage-aware row affordances.
- [x] Studio review surface keys URLs by entry-uuid (`/dev/editorial-review/entry/<uuid>`; legacy workflow-uuid route preserved during migration).
- [x] Compositor's Manual rewritten with new vocabulary.
- [x] MIGRATING.md ships with the major release naming the breaking changes and migration steps.
- [x] All existing in-tree tests pass; 39 retirement-collateral tests skipped with comments.
- [x] Major release shipped via the existing `/release` skill — v0.11.1 (v0.11.0 was abandoned post-smoke-fail; zod dep gap fixed in `78afda2`).

**GitHub tracking:** Will be filed at the start of Phase 1 implementation as the parent feature issue. Sub-phase issues filed per phase as work progresses.

**Notes:**

- Bug [#120](https://github.com/audiocontrol-org/deskwork/issues/120) (`dw-lifecycle install` writes `knownVersions: []`) confirmed during this session's hand-driven `/dw-lifecycle:extend`. May be subsumed by the redesign's new schema or kept as a separate fix; decide during Phase 1.
- The dw-lifecycle bug cluster (#126–#130) intersects with this redesign — dw-lifecycle inherits the new model. Some cluster bugs may dissolve in the new architecture; others persist as dw-lifecycle-specific concerns. Decide per-bug during Phase 4 implementation.
- Audiocontrol.org calendar dry-run is Task 40 in the plan — could move earlier as a sanity check on the migration design before full Phase 2 execution.

**Notes:**

- **Stop-gap exit criteria:** when dw-lifecycle ships customizable lifecycle stages (tracked separately, no current target), file a migration issue to (1) move `/release` and `/post-release:*` skill bodies into dw-lifecycle, (2) move `docs/post-release/*` paths to whatever dw-lifecycle prescribes, (3) convert the procedural "review playbook" amendment into a typed workflow phase. Until then, the design + this workplan + the implementation are the contract.
- **Why HTTP-only cursory + Playwright-only deep:** the design called for Playwright in cursory, but Playwright adds significant boot time and cross-platform install friction. Splitting the dependency means cursory stays fast (5–10 min budget) and Playwright failures don't block the post-release walk for adopters who only want the cursory check. If this scope split proves wrong in practice, fold Playwright back into cursory in a follow-up sub-phase.
- **Open questions from design** (`Open questions for operator review` section): #1 sandbox path (`mktemp` vs deterministic) — recommendation `mktemp` carries forward; will confirm at T11. #2 `post-release` label — recommendation yes, baked into T16. #3 stalled findings doc — leave as-is per content-management-databases-preserve rule. #4 issue de-dup — recommendation no de-dup; baked into T16. #5 skill family location — `plugins/deskwork/skills/post-release/{walk,file-issues}/SKILL.md` baked into T8 + T17.
