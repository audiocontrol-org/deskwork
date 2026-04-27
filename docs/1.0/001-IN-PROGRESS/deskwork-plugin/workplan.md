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
