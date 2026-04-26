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
- Manual: open `http://localhost:4321/dev/editorial-studio` against sandbox-audiocontrol; dashboard loads with live workflows
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

### Phase 12: End-to-end dogfood (CLI + studio) against sandbox

**Deliverable:** Full editorial lifecycle exercised through the new architecture

Tasks:
- [ ] Run `add → outline → plan → draft → review-start → iterate → approve` via `deskwork` CLI against `~/work/deskwork-work/sandbox-audiocontrol`
- [ ] Boot studio against the sandbox; visit `http://localhost:4321/dev/editorial-studio`
- [ ] Click through review/approve in the browser
- [ ] Verify calendar + journal mutations are byte-identical to what the old Astro studio would produce
- [ ] Re-run the live-audiocontrol round-trip test (parse → render → diff is empty)

**Acceptance Criteria:**
- All lifecycle skills succeed end-to-end through the CLI
- Studio UI loads and a full review/approve cycle completes against the sandbox
- Calendar parity preserved against `~/work/audiocontrol.org/docs/editorial-calendar-audiocontrol.md`
- Decision: ready to publish to npm registry as v0.1.0, or defer further
