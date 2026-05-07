# DEVELOPMENT

How to work on `deskwork` *as a developer of the plugin* — i.e., to fix a bug, add a feature, or test a change — without paying a release-cycle to find out whether your code does what you think it does.

If you're an *adopter* of the plugin (you want to use it on a content collection of your own), this file is not for you: see the per-plugin `README.md` for install + usage. This file is internal to monorepo development.

## TL;DR

```bash
npm install              # once
npm run dev              # watches core + cli + studio in parallel
node_modules/.bin/deskwork <verb> .   # invokes WORKSPACE bin against current project
```

That's the loop. Edit a `.ts` file, save, the watch rebuilds in <1s, your next CLI invocation runs the freshly-built code.

For studio work, `npm run dev` already starts the studio in dev mode (Vite middleware + HMR + tsx --watch); just open the magic-DNS URL the studio prints on boot.

For tests:

```bash
npm test --workspace @deskwork/cli           # vitest run, single workspace
npm test --workspaces --if-present           # full workspace suite
```

## Why this exists

The release cycle is the slowest possible inner loop:

1. Bump version in 8 manifests (`scripts/bump-version.ts`)
2. Build dist for three packages
3. Publish three packages to npm (3× OTP from operator)
4. Tag, push, wait for GitHub Actions release
5. Wait for marketplace clone to update its cache
6. `/plugin marketplace update deskwork`
7. Test the change

Round trip: 20+ minutes, with multiple operator interruptions for OTPs. Doing this for every fix is unsustainable. The dev workflow below cuts the inner loop to seconds.

The trick: **invoke the workspace symlinks instead of the cache-installed copies.**

## Why `node_modules/.bin/deskwork` works (and `deskwork` on PATH does not)

The bin shim that ships with `plugins/deskwork/bin/deskwork` is two-tiered:

- **Path 1 — workspace symlink:** if invoked from inside the deskwork monorepo, the shim walks up looking for a workspace `node_modules/@deskwork/cli` symlink. If it finds one, it dispatches there directly — running the workspace dist.
- **Path 2 — cache fallback:** otherwise, it dispatches to `~/.claude/plugins/cache/deskwork/deskwork/<version>/node_modules/.bin/deskwork`, which is the published-to-npm copy.

When you run `deskwork` from the shell, `which deskwork` resolves to the cache path (because that's what's on PATH from the marketplace install). Path 1's "is plugin shell inside monorepo" check passes for the *plugin shell*, but PATH lookup happens before the shim is even invoked — by the time you're inside the shim, you're already running the cache copy, and Path 1 walks up from `~/.claude/plugins/cache/...`, not from your monorepo.

`node_modules/.bin/deskwork` skips PATH entirely. It dereferences the workspace symlink at `node_modules/@deskwork/cli` directly. That symlink points at `packages/cli/dist/cli.js` — the workspace dist that your watch keeps fresh.

This is the only invocation pattern that consistently runs your edits.

## Workflows by surface

### CLI bugs / new CLI verbs

```bash
npm run dev                                                      # in one shell, leaves running
node_modules/.bin/deskwork <verb> . [args]                       # in another
```

Pattern:

1. Edit `packages/cli/src/commands/<verb>.ts` (or `packages/core/src/...` for shared logic).
2. Save. Watch rebuilds in <1s.
3. Re-invoke the workspace bin against this project's `.deskwork/` (or any other tmp project).
4. Sidecar / journal / calendar mutations land on the actual on-disk state — same data path adopters use.
5. Add a regression test under `packages/cli/test/` and run `npm test --workspace @deskwork/cli`.

For changes to `@deskwork/core`, the cli/studio pick them up automatically because they import from the workspace symlink. No separate "publish core, install in cli" dance.

### Studio bugs / new studio surfaces

`npm run dev` already starts the studio with Vite middleware + tsx --watch. Edit:

- `packages/studio/src/server.ts` or any `routes/` / `pages/` file → tsx --watch restarts the server (~1-2s).
- `plugins/deskwork-studio/public/src/<name>.ts` (client code) → Vite HMR reloads the browser instantly, no server restart.

Open the **Tailscale magic-DNS URL** the studio prints on boot (not the loopback URL — see `.claude/rules/agent-discipline.md` *"Never pass `--no-tailscale` to deskwork-studio unprompted."*).

To test the studio against this project's calendar specifically, the dev studio defaults to `--project-root ../..` which resolves to the monorepo root. To point at a different project: edit `packages/studio/package.json`'s `dev` script, or run the studio bin directly with `--project-root /path/to/other`.

### Skill behavior end-to-end (Claude invoking `/deskwork:<verb>`)

This is the trickier one. A skill, when invoked, dispatches `deskwork <verb>` via PATH — which lands at the cache copy. To exercise skill prose against the workspace dist, load the **source** plugin into a separate Claude Code session:

```bash
claude --plugin-dir plugins/deskwork
```

That session loads the plugin from `plugins/deskwork/` directly. The bin shim's Path 1 finds the workspace symlink (because the plugin shell IS inside the monorepo when loaded this way) and dispatches workspace-side. Skill calls in that session run against your edits.

The session you're reading this from now is NOT loaded that way — it has the marketplace-installed plugin, so `/deskwork:*` skills aren't even in the available list. To validate skill behavior, the operator opens a parallel `claude --plugin-dir` session.

Functionally, most deskwork skills are thin (they tell Claude to run `deskwork <verb>` with appropriate args). So `node_modules/.bin/deskwork <verb> ...` from the dev shell tests the same code path the skill would execute. The skill prose layer adds intent + arg-gathering only.

## Bridge dev loop

The studio bridge (`feature/studio-bridge` branch — see [`docs/1.0/001-IN-PROGRESS/studio-bridge/`](./docs/1.0/001-IN-PROGRESS/studio-bridge/)) adds a couple of moving parts beyond the standard CLI/studio loop: a loopback-only MCP endpoint, a chat panel UI, and a `/deskwork:listen` skill whose prose is what makes the loop work. Iterating on each of those has its own pattern.

### Driving the chat panel

`npm run dev` boots the studio with hot reload as usual. Open the magic-DNS URL plus `/dev/chat` for the full-page chat surface, or any `/dev/editorial-review/<id>` page for the docked panel. Edits to `plugins/deskwork-studio/public/src/chat-panel.ts`, `chat-renderer.ts`, or `chat-page.ts` Vite-HMR straight into the browser. Edits to `packages/studio/src/bridge/routes.ts` or `mcp-server.ts` restart the server (~1-2s).

### Iterating on the listen skill prose

The behavior of the listen loop is encoded entirely in `plugins/deskwork/skills/listen/SKILL.md` — there is no TS code that runs the loop. To iterate:

1. Edit `SKILL.md`.
2. Open a parallel CC session loaded with the workspace plugin: `claude --plugin-dir plugins/deskwork`.
3. Restart that session after each edit (the skill is read on session boot).
4. Run `/deskwork:listen` in the parallel session — it pulls in the freshly-edited prose.

Drive operator messages from a browser at `/dev/chat`. Each round-trip exercises the skill's instructions end-to-end.

### Testing the SessionStart hook locally

The hook at `plugins/deskwork/hooks/bridge-autostart.mjs` reads the project's `.deskwork/config.json` and emits a SessionStart directive when `studioBridge.enabled === true`. To exercise it against a fixture project root:

1. Write a fixture `.deskwork/config.json` somewhere with `"studioBridge": { "enabled": true }`.
2. Open a CC session whose working directory is that fixture, with `claude --plugin-dir plugins/deskwork`.
3. The hook fires on session start; the agent should auto-dispatch `/deskwork:listen`.

Drop the flag (or set it to `false`) to verify the hook is silent — no listen dispatch, no banner.

### Driving the bridge MCP endpoint without a real CC

The canonical pattern is the in-process round-trip test at [`packages/studio/test/bridge/mcp-roundtrip.test.ts`](./packages/studio/test/bridge/mcp-roundtrip.test.ts). It pairs `InMemoryTransport`s on both client and server sides of the SDK, registers the same handlers `mcp-server.ts` does, and exercises `await_studio_message` + `send_studio_response` against a real `BridgeQueue`. Use it as the template for any new MCP-side test or local exploration of tool handler behavior — no real CC, no real network, no flake.

For a live-network smoke (e.g. verifying the loopback guard from a Tailscale peer), boot the dev studio and `curl` the endpoint from a peer; expect 403. The Phase 8 smoke extensions in `scripts/smoke-marketplace.sh` (planned, not yet landed) automate this.

## Testing patterns

Three test categories, in order of preference for verifying a fix:

1. **Unit (vitest):** `packages/<pkg>/test/<feature>.test.ts`. Fast (~5s for the whole CLI suite). Tests pure functions and CLI behavior via `spawnSync(deskworkBin, [...])`.

2. **Live invocation against this project's calendar:** `node_modules/.bin/deskwork <verb> . <slug>` against the actual `.deskwork/entries/` sidecars. This catches integration friction unit tests can't, like stale data in `review-journal/ingest/*.json` or sidecars that don't match the migration heuristics. **Run mutation-y tests on a copy or be prepared to restore state** — the live calendar is real data.

3. **Marketplace install smoke:** `bash scripts/smoke-marketplace.sh`. Slow (clones the repo into a tmpdir, runs `npm install`, boots studio against fixtures). Used by `/release` as the release-blocking gate. Don't reach for this during development; reach for it when validating a release.

CI runs (1) only. Smoke is local-only by design (see `.claude/rules/agent-discipline.md` *"No test infrastructure in CI"*).

## Common gotchas

- **Re-invoking via on-PATH `deskwork` runs the cache version, not your edits.** Use `node_modules/.bin/deskwork` instead. (Surfaced in journal: 2026-05-01 Phase 31.)

- **The `cli`/`core` build script chains `tsc` with `cp` operations** (for `.mjs` / `.ts` source files that need to live alongside `dist`). The `dev` script handles this by running a one-shot `build` before starting the watch — first time you start the dev loop, `npm run dev` does an initial build then watches. Subsequent `tsc -b --watch` only watches `.ts` source; if you edit a `.mjs` you need to re-run `npm run build` for that package.

- **`@deskwork/core`'s `tsconfig.build.json` uses `module: NodeNext`,** which doesn't honor the `@/` path alias at emit time. New code in `packages/core/src/` uses **relative `.ts` imports** with `rewriteRelativeImportExtensions: true`. Tests still use `@/` via vitest's alias config. (See journal: 2026-05-01 Phase 30 Task 1 correction.)

- **`exactOptionalPropertyTypes` is on.** When stripping an optional field, omit the key entirely; don't set it to `undefined`. Pattern in core: `const { reviewState: _drop, ...rest } = sidecar; void _drop;`

- **Live re-migration tests against this project's calendar** can hit real friction (stale `sourceFile`s in ingest journal, etc.). Restore the sidecar manually if a test corrupts state.

## When the dev loop isn't enough

Three cases require either a release or a privileged-but-not-default invocation:

- **Marketplace install behavior:** `scripts/smoke-marketplace.sh` is the only way to validate the install path adopters use. Required for release; optional otherwise.
- **Bin-shim Path 2 (cache-fallback) behavior:** untouched by the workspace path. Test by running `~/.claude/plugins/marketplaces/deskwork/plugins/deskwork/bin/deskwork` (the marketplace-clone path) — that path always uses Path 2 because it's outside the monorepo.
- **Skill prose changes:** open a parallel `claude --plugin-dir plugins/deskwork` session as described above.

For everything else, the inner loop is `npm run dev` + `node_modules/.bin/deskwork`. Don't release to find out whether your code works.
