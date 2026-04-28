---
deskwork:
  id: c68dc297-1f25-4eed-903f-f051a9a194a6
title: Source-shipped deskwork plugins (drop the bundles)
description: Architectural plan to retire bundle/server.mjs + bundle/cli.mjs and ship deskwork plugins as source. Includes the collection-not-website data-model reframe. Discovered during the dogfood attempt to install deskwork in this monorepo.
date: April 2026
datePublished: 2026-04-28
dateModified: 2026-04-28
author: Orion Letizi
---

# Source-shipped deskwork plugins (drop the bundles)

## Context

**The trigger.** A UX evaluation of the LinkedIn shortform review surface at `http://localhost:47322/dev/editorial-review/5691b1d0-...` revealed that every studio client JS bundle returns 404 in the v0.8.1 marketplace install. The shortform editor is non-interactive: Edit / Approve / Iterate / Reject / margin-note creation / mark-on-selection — all dead. Console reports `editorial-review-client.js 404`. Same defect across every studio page (dashboard, content, scrapbook), and every release tag back to at least v0.6.0.

**Proximate cause.** `.gitignore:8` (`dist/` blanket rule) excludes `plugins/deskwork-studio/public/dist/` from every commit. The marketplace tarball — built straight from the tagged tree — ships without it. The release workflow's bundle-verification step only checks the *server* bundle (`bundle/server.mjs`), missing the client side.

**Root cause.** The plugin sits in a "treacherous middle ground" between two clean architectures: *full source-tree install* (no packaging, all rope) vs *self-contained compiled binary* (full packaging, all ceremony). Today the server is shipped binary-style (committed `bundle/server.mjs`); the client is shipped source-style (TS in `public/src/`) but with no working build path on the consumer side. Half-binary, half-source, half-broken. Local dev never reproduces the bug because `public/dist/` is on disk locally; the asymmetry between dev and consumer install hid the failure for five releases.

**The thesis (`https://editorialcontrol.org/blog/build-and-run-your-editorial-calendar-in-your-ai-agent/`)** governs the direction:

> "You never leave the agent for a static tool. You talk to it. It does the work."
> "The agent's toolkit isn't a static configuration you set up once; it evolves, under your direction, in response to what the work actually needs."

A compiled `bundle/server.mjs` is opaque to the operator's agent — exactly the kind of "static tool" the thesis argues against. The fix is not to commit more bundles; it is to retire the bundles entirely and ship the plugin as readable, agent-editable source.

**Decisions reached during planning.**

1. **Both plugins migrate.** `deskwork` (CLI) and `deskwork-studio` (web). One coherent architecture, one release.
2. **Marketplace install stays as the operator-facing channel.** Operators do not clone or fork the deskwork repo. The plugin tarball — installed via `claude plugin install` — is the only thing that lands on the operator's machine.
3. **No compiled artifacts ship.** `bundle/server.mjs`, `bundle/cli.mjs`, and `public/dist/` all retire.
4. **First run pays for `npm install`.** The bin/ wrapper detects missing `node_modules` and runs `npm install --omit=dev` once on first invocation. Subsequent runs are instant.
5. **Customization seam: defaults inside the plugin, overrides in the operator's project repo.** Plugin ships sensible defaults as source. Operator's `<projectRoot>/.deskwork/templates/`, `/.deskwork/prompts/`, `/.deskwork/doctor/`, plus `.claude/skills/<custom>/` shadow them at runtime via an override resolver. Operator commits their overrides to their own git history; deskwork upgrades replace defaults but never touch overrides.
6. **`@deskwork/core` reaches per-plugin tarballs via symlinked vendor directory.** A symlink in the deskwork repo (`plugins/<name>/vendor/core` → `packages/core`) gives developers one source of truth — no manual copy step that can be forgotten. Behavior on the operator side depends on whether the marketplace install dereferences symlinks during cache extraction; Phase 0 verifies which path applies.

**Outcome.** The 894KB server bundle and the 2MB client dist both retire. The `.gitignore: dist/` trap becomes irrelevant — nothing in `dist/` is load-bearing. The release workflow's bundle-verification step can be deleted. The operator's agent can read every line of every file the plugin executes. Operator customization is git-shaped (in their own project repo). The dev/install asymmetry that hid the original bug for five releases is gone.

## Architectural extension: deskwork manages collections, not websites

A second architectural shift surfaced during the dogfood attempt to install deskwork in this monorepo. The install skill failed because the schema requires `host` (a hostname), `contentDir` shaped like a blog tree, and renderer detection (Astro/Next/Hugo). This project is a tool monorepo with no website — the install skill has no path for it.

The principle (now in `.claude/CLAUDE.md`): **deskwork manages collections of markdown content (a tree of markdown plus supporting media), not websites.** "Website" is one downstream consumer of a collection, not the unit. The user-facing term is **collection**; the mental model is a tree.

This expands the v0.9.0 scope. The reframe coordinates with the source-shipped re-architecture because the install skill — the place an adopter first feels the friction — needs both fixes simultaneously to be coherent.

**Reframe-specific changes** (in addition to Phases 0–9 above, which still all apply):

- **Schema rename**: `sites` → `collections` in `.deskwork/config.json`, `defaultSite` → `defaultCollection`, internally `Site` type → `Collection` type. Per-collection field `host` becomes optional. A `legacy-sites-key-migration` doctor rule handles existing operators (writingcontrol, editorialcontrol, audiocontrol) — accept both shapes for the v0.9.0 release with a deprecation warning, then drop legacy in a future cleanup.
- **Install skill rewrite**: Step 1 detection looks for content collections (directories of markdown organized hierarchically), not websites. Renderer detection (Astro / Next / Hugo / Eleventy) is a *secondary* attribute that conditionally drives the schema-patch advice in Step 5. Step 2 proposes a collection-shaped config; the `host` question is conditional on the operator confirming a website renderer.
- **Studio surfaces** drop the assumption that `host` is non-empty. Per-collection dashboards work for any collection. Per-website URL formatting (the `?site=<slug>` query param, "Open in production" links, etc.) only fires when a host is configured. Rename `?site=` → `?collection=` URL parameter; add a 302 from the legacy `?site=` param for one release.
- **Calendar filename convention**: `editorial-calendar-<slug>.md` works either way, but document that "slug" refers to the collection slug, not a website slug.
- **CLI subcommands** that currently take `--site <slug>`: extend with `--collection <slug>` as the new public-facing flag; `--site` remains as a deprecated alias for one release.
- **Skill prose**: every `/deskwork:*` skill markdown file's prose migrates "site" → "collection" for user-facing language.
- **README + plugin docs**: the deskwork README's first paragraphs frame deskwork as a collection-management tool. Astro/Next/Hugo schema-patch advice becomes a section under "If your collection is also rendered as a website" rather than the headline.
- **Doctor rules** that today check renderer-specific schemas (e.g., `schema-rejected` against Astro's strict zod) become conditional on the collection having a configured renderer.
- **Frontmatter binding** (`deskwork.id` UUID) is unchanged — already collection-native.

**Implementation phases for the reframe** (continue numbering after Phase 9):

### Phase 10 — Schema migration: `sites` → `collections`

- New zod schemas in `packages/core/src/config.ts` for `Collection` (with optional `host`) alongside legacy `Site` (deprecated, for migration only).
- Config loader accepts both shapes for one release; reads under `collections` first, falls back to `sites` with a one-time deprecation warning.
- New doctor rule `legacy-sites-key-migration`: detects `.deskwork/config.json` using the `sites` shape, rewrites to `collections`. Also handles `defaultSite` → `defaultCollection`.
- Tests cover both shapes loading correctly + the migration rule + the default-collection inference for single-collection configs.

### Phase 11 — Install skill + CLI rewrite for collection model

- `plugins/deskwork/skills/install/SKILL.md` rewritten: Step 1 detects content collections (hierarchical markdown trees) without requiring a website signal; Step 2 proposes collection-shaped config; Step 5's renderer schema patch is conditional on the operator confirming a website renderer.
- `bin/deskwork install` validates the new shape; accepts collections with no host.
- All CLI subcommands taking `--site <slug>` gain `--collection <slug>` (with `--site` as a deprecated alias). Help text updates.
- Test: install against a fixture *non-website* project tree (this monorepo's `docs/` would be a perfect fixture).

### Phase 12 — Studio + frontmatter URL migration to collection vocabulary

- All studio routes accepting `?site=<slug>` accept `?collection=<slug>`; legacy `?site=` 302-redirects.
- Page renderers (`packages/studio/src/pages/*.ts`) stop assuming non-empty `host`. "Open in production" / public-URL formatting only fires when host is set.
- Per-collection dashboard renders for any collection; layout doesn't break when host is absent.
- Test: studio boots against a host-less collection fixture; dashboard, review, scrapbook all render without errors.

### Phase 13 — Documentation pass: collection vocabulary throughout

- All `/deskwork:*` skill markdown migrates "site" → "collection" in user-facing prose; "site" stays in CLI flag legacy mentions only.
- `plugins/deskwork/README.md` and `plugins/deskwork-studio/README.md` reframe the headline tool description around collections; renderer-specific advice (Astro schema patch) moves under "If your collection is rendered as a website" subsection.
- Root `README.md` updated similarly.
- `docs/1.0/...` workplan and PRD references migrate where they describe operator-facing terminology.

### Phase 14 (extends Phase 8) — Migration notes for existing adopters

- Existing adopters' configs use `sites` shape — picked up by the legacy migration rule on first `deskwork doctor --fix=all` run after upgrade. Nothing operator-side breaks during the upgrade.
- Communicate: "your config will silently migrate on first doctor run; expect a one-time deprecation notice."
- The `?site=` URL param redirects keep external bookmarks working.

---

## Phase 0 — Verification spike (~30 min)

The architecture branches on a single empirical question: **does the Claude Code marketplace install dereference symlinks during cache extraction, or preserve them as symlinks?**

- Build a minimal test plugin under `/tmp/symlink-test-plugin/` with a committed symlink (e.g. `vendor/test → ../shared/`) plus a tiny target directory.
- Push to a throwaway git repo or use `claude --plugin-dir` if it exercises the same install path.
- Install via `claude plugin install --marketplace <repo>` (or equivalent) into a sandbox.
- Inspect `~/.claude/plugins/cache/<plugin>/<version>/vendor/test`:
  - If it's a real directory with copies of the target's files → **Path A** (symlink dereferenced); pure symlink design works.
  - If it's a dangling symlink → **Path B** (symlink preserved); we need release-time materialization.

Document the answer. The result determines Phase 2's mechanism. Both downstream paths are workable, so the plan proceeds either way.

---

## Phase 1 — Retire bundled artifacts

**Delete:**
- `plugins/deskwork-studio/bundle/server.mjs`
- `plugins/deskwork-studio/bundle/` (the directory)
- `plugins/deskwork/bundle/cli.mjs`
- `plugins/deskwork/bundle/`
- `packages/studio/build.ts` (esbuild build script — no compiled output exists to produce)
- `plugins/deskwork-studio/public/dist/` (locally; was never committed)

**Modify:**
- `plugins/deskwork-studio/bin/deskwork-studio`: remove the bundle-fallback branch (lines ~28-32 in current source). The wrapper resolves to `node_modules/.bin/deskwork-studio` only.
- `plugins/deskwork/bin/deskwork`: same shape — remove the bundle-fallback.
- `.github/workflows/release.yml`: delete the "Verify bundles match the tagged source" step (lines 40-46). It checked an artifact that no longer exists.
- `packages/studio/package.json`: remove `"build": "tsx build.ts"` and `"prepare": "npm run build"` scripts. Update `"test"` to drop the `npm run build &&` prefix.
- `packages/studio/src/server.ts:222-241` (`publicDir()`): drop the bundle-relative candidate path; only the workspace-relative path remains.

---

## Phase 2 — Vendor `@deskwork/core` via symlink

**In-repo (always, both Path A and Path B):**

Create symlinks in the source tree:
```
plugins/deskwork-studio/vendor/core → ../../../packages/core
plugins/deskwork/vendor/core → ../../../packages/core
```

Commit the symlinks. Developer ergonomics: editing `packages/core/src/calendar.ts` is automatically visible through both vendor paths — no second copy to maintain or forget.

Update each plugin's `package.json` to declare `@deskwork/core` as a `file:` dependency:

```json
{
  "name": "@deskwork/plugin-studio",
  "private": true,
  "type": "module",
  "dependencies": {
    "@deskwork/core": "file:./vendor/core",
    "@hono/node-server": "^1.13.7",
    "hono": "^4.6.0",
    "tsx": "^4.21.0",
    "esbuild": "^0.28.0"
  },
  "engines": { "node": ">=20" }
}
```

In dev, npm workspaces resolve `@deskwork/core` to `packages/core/` (workspace wins over `file:`). In a marketplace install (no workspace root), `npm install` resolves the `file:` dependency through the symlink.

**Path A (symlinks dereference at install) — preferred if Phase 0 confirms.**

No further work. The symlink ships in the tarball; the marketplace dereferences it; operator gets real files in cache. Zero release-ceremony for vendoring.

**Path B (symlinks preserved) — fallback if Phase 0 shows preserved.**

Add a `materialize-vendor` step to `.github/workflows/release.yml` that runs at the head of the release job, before tagging or any other build step:

1. For each plugin (`deskwork`, `deskwork-studio`): if `plugins/<name>/vendor/core` is a symlink, replace it with a real directory copy of `packages/core/`.
2. Verify: `diff -r packages/core/src plugins/<name>/vendor/core/src` must be empty. Fail the release if not.
3. Commit the materialized copy as part of the release commit (the same commit that bumps version).

The materialized state exists in the tagged tree only. Between releases, the dev workspace has symlinks; the release workflow does the materialization automatically. Developers never touch the materialized files.

---

## Phase 3 — Update bin/ wrappers for first-run npm install

Both `plugins/deskwork-studio/bin/deskwork-studio` and `plugins/deskwork/bin/deskwork` get the same shape:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."

# Workspace-mode (dev): if a workspace-linked binary exists, use it.
workspace_candidates=(
  "${PLUGIN_ROOT}/../../node_modules/.bin/deskwork-studio"
  "${PLUGIN_ROOT}/node_modules/.bin/deskwork-studio"
)
for candidate in "${workspace_candidates[@]}"; do
  [ -x "$candidate" ] && exec "$candidate" "$@"
done

# Marketplace install: ensure node_modules exists, then exec source.
if [ ! -d "${PLUGIN_ROOT}/node_modules" ]; then
  printf 'deskwork-studio: first run — installing dependencies (one-time)...\n' >&2
  (cd "$PLUGIN_ROOT" && npm install --omit=dev --no-audit --no-fund --loglevel=error)
fi

exec "${PLUGIN_ROOT}/node_modules/.bin/deskwork-studio" "$@"
```

`packages/studio/package.json:bin` already points at `./src/server.ts` with a tsx shebang. After the marketplace install completes its first-run npm install, the local symlink in `node_modules/.bin/` runs the source via tsx. No further setup.

The CLI plugin gets the analogous wrapper pointing at `packages/cli`'s `bin` entry.

---

## Phase 4 — Replace pre-built client bundles with on-startup esbuild

Server boot now runs the client-side esbuild compilation in-process and serves results from disk in a runtime cache.

**Add `packages/studio/src/build-client-assets.ts`** — a function called once during server startup that:
1. Reads entry points from `<pluginRoot>/public/src/*.ts`.
2. Uses esbuild's programmatic `build()` API to compile each into `<pluginRoot>/.runtime-cache/dist/<name>.js` (cache lives outside the source tree, so still respects `.gitignore: dist/`).
3. Falls back to a clean rebuild if the cache is missing or any source mtime is newer than the cached output.

**Modify `packages/studio/src/server.ts`** to call `build-client-assets.ts` during bootstrap (~1s startup cost on cold cache; ~50ms on warm cache via mtime check).

**Modify the static-serve mount point**: serve `/static/dist/*.js` from `<pluginRoot>/.runtime-cache/dist/` instead of `<pluginRoot>/public/dist/`. Update `publicDir()` accordingly.

**No changes to page renderers** (`packages/studio/src/pages/*.ts`). They continue to emit `<script src="/static/dist/editorial-review-client.js">` — the server just resolves that URL to the runtime cache instead of a committed `dist/`.

The runtime cache is per-version-per-install (lives at `~/.claude/plugins/cache/deskwork/deskwork-studio/<v>/.runtime-cache/`). Plugin upgrades get a fresh empty cache. Disk usage: ~3MB per installed version. Acceptable.

---

## Phase 5 — Override resolver

**New module: `packages/core/src/overrides.ts`**

```typescript
export interface OverrideResolver {
  resolveTemplate(name: string): string | null;
  resolvePrompt(name: string): string | null;
  resolveDoctorRule(name: string): string | null;
}

export function createOverrideResolver(projectRoot: string): OverrideResolver {
  // Returns absolute path to <projectRoot>/.deskwork/<category>/<name> if exists,
  // else null (caller falls back to the plugin's bundled default).
}
```

**Apply in:**

- `packages/studio/src/server.ts` boot: instantiate the resolver from the operator's `projectRoot` and inject into request context.
- `packages/studio/src/pages/dashboard.ts`, `review.ts`, `scrapbook.ts`, `content.ts`, `index.ts`, `help.ts`, `shortform.ts`: each renderer becomes "if `resolver.resolveTemplate('<page-name>')` returns a path, dynamic-import it; else use this file's default render". The default render is the existing implementation; only the dispatch is new.
- `packages/core/src/doctor/runner.ts`: when discovering rules, merge plugin defaults + `<projectRoot>/.deskwork/doctor/*.ts`.
- For prompts and other text fragments: a `readPromptOrDefault(name, defaultText)` helper.

**New skill: `plugins/deskwork/skills/customize/SKILL.md`**

Operator-facing skill that copies a plugin default into their project repo:
```
/deskwork:customize template dashboard
  → copies plugins/deskwork-studio/public/templates/dashboard.ts
    to <projectRoot>/.deskwork/templates/dashboard.ts
  → prints: "now edit it; the studio will load yours instead of the default"
```

**Skills**: Claude Code already supports operator skills under `~/.claude/skills/` and `<projectRoot>/.claude/skills/`. Plugin-shipped skills under `plugins/deskwork/skills/` continue to load. The override pattern is: an operator-skill of the same name shadows the plugin default. Claude Code's discovery already merges these directories; we don't need new infrastructure here, just documentation.

---

## Phase 6 — Local smoke test

**New script: `scripts/smoke-marketplace.sh`** (or `.ts` via tsx for portability).

The script reproduces the marketplace install path locally:

1. `git archive HEAD plugins/deskwork-studio | tar -x -C "$tmpdir/install/"` — produces a tarball mimicking what the marketplace would ship for a single plugin.
2. `cd "$tmpdir/install" && npm install --omit=dev` — operator's first-run experience.
3. Boot the studio against a fixture project: `bin/deskwork-studio --project-root "$tmpdir/fixture/"`.
4. Wait for ready signal.
5. Curl every page (`/dev/`, `/dev/editorial-studio`, `/dev/content`, `/dev/editorial-review-shortform`, `/dev/editorial-help`, plus the review surface for a fixture entry).
6. For each response, scrape every `<script src>` and `<link href>`; curl each, assert 200 + non-empty body.
7. Repeat for `plugins/deskwork` (CLI plugin): basic invocation smoke.
8. Tear down tmpdir.

Exit non-zero with a clear message on any failure. Add to `RELEASING.md` as a pre-tag step. Local-only execution per the project's "no CI test infrastructure" rule (`feedback_no_ci_test_infrastructure.md`).

This catches: missing static assets, broken pages, npm install failures against the tarball-shaped tree, vendor symlink dangling (Path B regression), new plugins added without proper packaging.

---

## Phase 7 — Update tests

**Existing tests:**
- `packages/studio/test/static.test.ts`: still asserts `/static/dist/<bundle>.js` returns 200. After Phase 4 the path resolves to runtime cache instead of committed dist; assertion holds.
- All 627 existing tests run via in-process `app.fetch`, no boot-from-bundle assumption. Should pass after Phase 1 deletion of `build.ts` (drop `npm run build &&` from test scripts).

**New tests:**
- `packages/core/test/overrides.test.ts`: resolver returns operator path when present, null when absent, ignores symlinks safely.
- `packages/studio/test/template-override.test.ts`: page renderer uses operator override when present.
- `packages/studio/test/runtime-cache.test.ts`: build-client-assets caches results; rebuilds on mtime change.

No CI changes — same `npm test` invocation; the local smoke test runs separately as a release-time check.

---

## Phase 8 — Documentation

**Modify:**
- `RELEASING.md`: add the `scripts/smoke-marketplace.sh` step before tagging. Document Path A vs Path B vendor mechanism (whichever Phase 0 confirmed).
- `plugins/deskwork-studio/README.md`: install instructions still `claude plugin install`; new note that first run runs `npm install` (~30s).
- `plugins/deskwork/README.md`: same.
- `.claude/CLAUDE.md`: update architecture overview — no more `bundle/`; vendor-via-symlink mechanism; override seam description.
- `plugins/deskwork-studio/skills/studio/SKILL.md`: section on operator overrides (`<projectRoot>/.deskwork/templates/`).
- `plugins/deskwork/README.md`: section on operator skill shadowing.

**Migration notes for existing adopters** (`writingcontrol.org`, `editorialcontrol.org`, `audiocontrol.org`):
- `claude plugin upgrade` picks up the new release.
- First subsequent `deskwork-studio` invocation runs `npm install --omit=dev` (~30s, transparent).
- No data migration; their `.deskwork/` configs and content unaffected.
- They can immediately use `/deskwork:customize` to fork any default they want to override.

---

## Phase 9 — Release

- Cut **v0.9.0** (architectural change; minor-version bump).
- Run `scripts/smoke-marketplace.sh` against the local repo. Must pass.
- Tag, push, watch the release workflow.
- Verify against a sandbox install: `claude plugin install` from local `--marketplace`, exercise the LinkedIn shortform end-to-end (the original bug surface).
- Confirm with adopter sites: brief check-in to confirm upgrade is clean before announcing.

---

## Critical files

**Deleted:**
- `plugins/deskwork-studio/bundle/` (directory + contents)
- `plugins/deskwork/bundle/` (directory + contents)
- `packages/studio/build.ts`

**Modified:**
- `plugins/deskwork-studio/bin/deskwork-studio` — drop bundle fallback; add first-run npm install
- `plugins/deskwork/bin/deskwork` — same shape
- `plugins/deskwork-studio/package.json` — declare runtime deps including `"@deskwork/core": "file:./vendor/core"`
- `plugins/deskwork/package.json` — same shape
- `packages/studio/package.json` — drop `build`/`prepare` scripts; clean `test` script
- `packages/studio/src/server.ts` — call `build-client-assets()` on boot; drop bundle-relative path resolution; inject override resolver
- `packages/studio/src/pages/*.ts` — each page checks override resolver before falling back to default render
- `packages/core/src/doctor/runner.ts` — merge plugin + project-repo doctor rules
- `.github/workflows/release.yml` — drop bundle-verification step; add materialize-vendor step (Path B only)
- `RELEASING.md` — smoke-test step; vendor mechanism explanation
- `.claude/CLAUDE.md` — architecture overview update
- `plugins/deskwork-studio/README.md`, `plugins/deskwork/README.md`

**New:**
- `plugins/deskwork-studio/vendor/core` — symlink to `../../../packages/core`
- `plugins/deskwork/vendor/core` — symlink to `../../../packages/core`
- `packages/core/src/overrides.ts` — override resolver
- `packages/studio/src/build-client-assets.ts` — on-startup esbuild
- `scripts/smoke-marketplace.sh` — pre-tag verification script
- `plugins/deskwork/skills/customize/SKILL.md` — `/deskwork:customize` skill
- `packages/core/test/overrides.test.ts`
- `packages/studio/test/template-override.test.ts`
- `packages/studio/test/runtime-cache.test.ts`

**Existing utilities to reuse:**
- `packages/core/src/paths.ts` — `resolveCalendarPath`, etc.; the override resolver lives alongside
- `packages/studio/src/server.ts:publicDir()` — extend to point at `.runtime-cache/` for client assets
- `packages/core/src/content-index.ts` — operator-projectRoot-resolution pattern; same shape as the override resolver

---

## Verification

**End-to-end smoke (post-implementation):**
1. `scripts/smoke-marketplace.sh` from the repo root → all assertions pass.
2. Manual install into a sandbox: `claude plugin install --marketplace "$PWD" deskwork-studio` against `/tmp/test-project/` (a fresh `deskwork install`-bootstrapped project).
3. Boot the studio; confirm:
   - First run shows the "installing dependencies" message and completes in <60s.
   - All studio pages render with working JS (Edit / Approve / Iterate / Reject buttons live; margin-note creation works; mark-on-selection floating pencil appears).
   - The original bug surface (`http://localhost:<port>/dev/editorial-review/<id>`) is fully interactive.
4. Operator override test:
   - Create `<projectRoot>/.deskwork/templates/dashboard.ts` returning a recognizable test render.
   - Refresh `/dev/editorial-studio`. Should show the operator's override, not the default.
   - Delete the override. Refresh. Should fall back to the default.
5. Doctor override test: write a custom rule under `<projectRoot>/.deskwork/doctor/`; run `deskwork doctor`; confirm both default + custom rules ran.

**Tests:**
- `npm test` from each workspace: 627 existing tests pass; new tests added (~10).
- No `npm run build` step needed anywhere.

**Pre-release:**
- Smoke script passes against `git archive`-derived tarball.
- For Path B: the release workflow's materialize-vendor step ran; tagged tree's `vendor/core/` is a real directory; `diff -r` against `packages/core/` is empty.
- `claude plugin validate plugins/deskwork-studio` and `plugins/deskwork` pass.

**Adopter regression check** (after the v0.9.0 release):
- Verify the LinkedIn shortform review URL on writingcontrol.org / editorialcontrol.org sandboxes is fully interactive after `claude plugin upgrade`.
- No regression on prior surfaces (longform review, dashboard, content tree, scrapbook).
